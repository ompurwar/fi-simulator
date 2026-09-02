import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { makeDocCrypto } from "@/server/infrastructure/docCrypto";
import type { KmsAdapter } from "@/server/infrastructure/kms";
import { createTestApp, signupUser } from "./helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";

/**
 * Encryption-at-rest behaviors (Task 4.1). The container runs with the dev
 * fallback codec (no GCP vars in the test env) so raw reads go through the same
 * envelope as production would.
 */

const DEV_KEY = randomBytes(32);

function kmsStub(): KmsAdapter {
  // identity wrap — exercises the v1 envelope plumbing without a real KMS
  return {
    async wrapKey(dek: Buffer) {
      return dek;
    },
    async unwrapKey(blob: Buffer) {
      return blob;
    },
  };
}

describe("doc codec — envelope encryption", () => {
  it("keeps only allowlisted keys readable and round-trips the payload", async () => {
    const codec = makeDocCrypto({ kms: null, localKey: DEV_KEY });
    const stored = await codec.encryptDoc(
      { _id: "p1", user_id: "u1", title: "My secret plan", amount: 123456, nested: { a: [1, 2] } },
      ["_id", "user_id"]
    );
    expect(Object.keys(stored).sort()).toEqual(["__enc", "_id", "user_id"]);
    expect(JSON.stringify(stored)).not.toContain("My secret plan");
    expect(stored.__enc.v).toBe(0);

    const plain = await codec.decryptDoc(stored, ["_id", "user_id"]);
    expect(plain).toMatchObject({
      _id: "p1",
      user_id: "u1",
      title: "My secret plan",
      amount: 123456,
      nested: { a: [1, 2] },
    });
  });

  it("converts ObjectIds inside the payload to hex strings", async () => {
    const codec = makeDocCrypto({ kms: null, localKey: DEV_KEY });
    const oid = new ObjectId("64b4a1c2d3e4f5a6b7c8d9e0");
    const stored = await codec.encryptDoc({ parent_id: oid, keep: "x" }, []);
    const plain = await codec.decryptDoc(stored, []);
    expect(plain.parent_id).toBe("64b4a1c2d3e4f5a6b7c8d9e0");
    expect(plain.keep).toBe("x");
  });

  it("fails closed when the ciphertext is tampered with", async () => {
    const codec = makeDocCrypto({ kms: null, localKey: DEV_KEY });
    const stored = await codec.encryptDoc({ amount: 1000 }, []);
    stored.__enc.ct = stored.__enc.ct.slice(0, -3) + "AAA";
    await expect(codec.decryptDoc(stored, [])).rejects.toThrow(/failed to decrypt/);
  });

  it("v1 stores a wrapped per-doc DEK and still round-trips", async () => {
    const codec = makeDocCrypto({ kms: kmsStub(), localKey: DEV_KEY });
    const stored = await codec.encryptDoc({ value: 42, title: "kms doc" }, []);
    expect(stored.__enc.v).toBe(1);
    expect(typeof stored.__enc.k).toBe("string");
    const plain = await codec.decryptDoc(stored, []);
    expect(plain).toMatchObject({ value: 42, title: "kms doc" });
  });

  it("passes legacy plaintext docs through untouched", async () => {
    const codec = makeDocCrypto({ kms: null, localKey: DEV_KEY });
    const legacy = { _id: "p1", title: "old doc", amount: 5 };
    expect(await codec.decryptDoc(legacy, ["_id"])).toEqual(legacy);
  });

  it("kill-switch (encryptWrites=false) stores plaintext but still decrypts old docs", async () => {
    const writeGate = makeDocCrypto({ kms: null, localKey: DEV_KEY, encryptWrites: false });
    const stored = await writeGate.encryptDoc(
      { _id: "p2", title: "plaintext write", amount: 999 },
      ["_id", "user_id"]
    );
    expect(stored.__enc).toBeUndefined();
    expect(stored.title).toBe("plaintext write");

    // previously-encrypted documents remain readable while writes are off
    const encCodec = makeDocCrypto({ kms: null, localKey: DEV_KEY });
    const enc = await encCodec.encryptDoc({ title: "old encrypted", amount: 1 }, []);
    const plain: any = await writeGate.decryptDoc(enc, []);
    expect(plain.title).toBe("old encrypted");
  });
});

describe("plan & cashflow stores — encrypted at rest, plaintext to callers", () => {
  let app: any;
  let container: any;
  let ctx: { user_id: string; role: string };

  async function createPlan(title: string) {
    const res: any = await callRegistryTool(makeToolRegistry(container), ctx, "create_plan", {
      title,
      monthly_income: 120000,
      monthly_expense: 45000,
    });
    const data = res?.data ?? res;
    const plan_id = data?.plan_id ?? data?._id;
    if (!plan_id) throw new Error(`create_plan failed: ${JSON.stringify(res)}`);
    return String(plan_id);
  }

  async function rawPlan(plan_id: string): Promise<any> {
    return container.db.collection("Plan_Store").findOne({ _id: container.db.MakeId(plan_id) });
  }

  async function rawCashflow(id: string): Promise<any> {
    return container.db.collection("Cash_Flow_Store").findOne({ _id: container.db.MakeId(id) });
  }

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    container = t.container;
    const signed = await signupUser(app);
    const session = await container.session_list.FindByActiveSessionId(signed.session_id);
    ctx = { user_id: session!.user_id.toString(), role: "user" };
  });

  it("stores a plan document as ciphertext — only lookup keys readable", async () => {
    const plan_id = await createPlan("Confidential retirement blueprint");
    const raw = await rawPlan(plan_id);
    expect(raw).toBeTruthy();
    expect(Object.keys(raw).sort()).toEqual(["__enc", "_id", "status", "user_id"]);
    expect(raw.__enc.v).toBe(0);
    const json = JSON.stringify(raw);
    expect(json).not.toContain("Confidential retirement blueprint");
    expect(json).not.toContain("120000");
  });

  it("returns the same plan in full plaintext through the repository", async () => {
    const plan_id = await createPlan("My visible plan");
    const plan: any = await container.plan_list.FindById(plan_id);
    expect(plan.title).toBe("My visible plan");
    const income = plan.cashflow_list.find((c: any) => c.category === "i");
    expect(income.amount).toBe(120000);
    expect(plan.account_list.length).toBeGreaterThan(0);
  });

  it("encrypts cashflow store docs while income lines embed & update correctly", async () => {
    const plan_id = await createPlan("Cashflow encryption plan");
    const res: any = await callRegistryTool(
      makeToolRegistry(container),
      ctx,
      "add_income",
      { plan_id, desc: "Freelance consulting", amount: 85000, start_month: 1, frequency: "m" }
    );
    const id = String(res?.data?._id ?? res?._id);
    expect(id).toBeTruthy();

    // raw store doc: lookup keys plaintext, financial fields not
    const raw = await rawCashflow(id);
    expect(Object.keys(raw).sort()).toEqual(["__enc", "_id", "category", "plan_id", "status", "user_id"]);
    const json = JSON.stringify(raw);
    expect(json).not.toContain("Freelance consulting");
    expect(json).not.toContain("85000");
    expect(raw.category).toBe("i");

    // plan document got the embedded line (plaintext through the repo)
    const plan: any = await container.plan_list.FindById(plan_id);
    expect(plan.cashflow_list.some((c: any) => c.desc === "Freelance consulting")).toBe(true);

    // partial update merges into the encrypted doc without dropping fields
    await container.cashflow_list.Update({
      _id: id,
      category: "i",
      type: "p",
      frequency: "m",
      amount: 95000,
      desc: "Freelance consulting big",
      start_month: 1,
      end_month: 600,
    });
    const updated_raw = await rawCashflow(id);
    expect(JSON.stringify(updated_raw)).not.toContain("95000");
    const incomes: any[] = await container.cashflow_list.GetIncomeList({ plan_id, user_id: ctx.user_id });
    const line = incomes.find((c: any) => String(c._id) === String(id));
    expect(line.amount).toBe(95000);
    expect(line.desc).toBe("Freelance consulting big");
    expect(line.active).toBe(true); // preserved by read-modify-write
    expect(line.primary).toBe(false); // preserved
  });

  it("UpdateAccount patches one account inside the encrypted plan", async () => {
    const plan_id = await createPlan("Account patch plan");
    const plan: any = await container.plan_list.FindById(plan_id);
    const account_id = String(plan.account_list[0]._id);

    const { success } = await container.plan_list.UpdateAccount({
      plan_id,
      account_id,
      changes: { title: "Emergency Fund v2", roi: 4.5 },
    });
    expect(success).toBe(true);

    const updated: any = await container.plan_list.FindById(plan_id);
    const account = updated.account_list.find((a: any) => String(a._id) === account_id);
    expect(account.title).toBe("Emergency Fund v2");
    expect(account.roi).toBe(4.5);
    const raw = await rawPlan(plan_id);
    expect(JSON.stringify(raw)).not.toContain("Emergency Fund v2");
  });

  it("RemoveCashflowAndAccount pulls the embedded line from the encrypted plan", async () => {
    const plan_id = await createPlan("Removal plan");
    const res: any = await callRegistryTool(makeToolRegistry(container), ctx, "add_income", {
      plan_id,
      desc: "Temp gig income",
      amount: 30000,
      start_month: 1,
      frequency: "m",
    });
    const id = String(res?.data?._id ?? res?._id);

    const { success } = await container.plan_list.RemoveCashflowAndAccount({
      _id: plan_id,
      cashflow_list: [id],
    });
    expect(success).toBe(true);

    const plan: any = await container.plan_list.FindById(plan_id);
    expect(plan.cashflow_list.some((c: any) => String(c._id) === String(id))).toBe(false);
  });

  it("legacy plaintext documents stay readable and encrypt on the next write", async () => {
    const legacy: any = {
      user_id: container.db.MakeId(ctx.user_id),
      status: "active",
      title: "Legacy plaintext plan",
      description: "",
      category: "std",
      cashflow_list: [],
      account_list: [
        { _id: "leg-acc", title: "Old Account", category: "s", type: "a", init_balance: 5000 },
      ],
      loan_accounts: [],
      cashflow_change_list: [],
      fund_distribution_percentage: [],
      asset_list: [],
      timestamp: Date.now(),
    };
    const { insertedId } = await container.db
      .collection("Plan_Store")
      .insertOne(legacy);
    const plan_id = insertedId.toString();

    // lazy read path — works before any write
    const legacy_read: any = await container.plan_list.FindById(plan_id);
    expect(legacy_read.title).toBe("Legacy plaintext plan");
    expect(legacy_read.account_list).toHaveLength(1);

    // next write converts the document
    const { success } = await container.plan_list.Update({
      _id: plan_id,
      user_id: ctx.user_id,
      title: "Renamed legacy plan",
    });
    expect(success).toBe(true);

    const raw = await rawPlan(plan_id);
    expect(raw.__enc).toBeTruthy();
    expect(JSON.stringify(raw)).not.toContain("Renamed legacy plan");
    const read_back: any = await container.plan_list.FindById(plan_id);
    expect(read_back.title).toBe("Renamed legacy plan");
    expect(read_back.account_list).toHaveLength(1); // untouched fields survive the merge
    expect(read_back.cashflow_list).toEqual([]);
  });

  it("list_plans surfaces decrypted titles through the MCP surface", async () => {
    const plan_id = await createPlan("Surfaced through MCP");
    const res: any = await callRegistryTool(makeToolRegistry(container), ctx, "list_plans", {});
    const plans = res?.data ?? res;
    const titles = (Array.isArray(plans) ? plans : []).map((p: any) => p.title);
    expect(titles).toContain("Surfaced through MCP");
    expect(await container.plan_list.FindById(plan_id)).toBeTruthy();
  });

  it("tampered ciphertext fails closed — no garbage documents surface", async () => {
    const plan_id = await createPlan("Tamper target plan");
    const raw = await rawPlan(plan_id);
    raw.__enc.ct = raw.__enc.ct.slice(0, -3) + "AAA";
    await container.db.collection("Plan_Store").updateOne(
      { _id: container.db.MakeId(plan_id) },
      { $set: { __enc: raw.__enc } }
    );
    await expect(container.plan_list.FindById(plan_id)).rejects.toThrow(/failed to decrypt/);
  });
});
