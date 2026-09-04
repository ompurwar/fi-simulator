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

function kmsStub() {
  // identity wrap — exercises the v1 envelope plumbing without a real KMS
  let wrap_calls = 0;
  let unwrap_calls = 0;
  return {
    adapter: {
      async wrapKey(dek: Buffer) {
        wrap_calls++;
        return dek;
      },
      async unwrapKey(blob: Buffer) {
        unwrap_calls++;
        return blob;
      },
    } as KmsAdapter,
    counts() {
      return { wrap_calls, unwrap_calls };
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
    const codec = makeDocCrypto({ kms: kmsStub().adapter, localKey: DEV_KEY });
    const stored = await codec.encryptDoc({ value: 42, title: "kms doc" }, []);
    expect(stored.__enc.v).toBe(1);
    expect(typeof stored.__enc.k).toBe("string");
    const plain = await codec.decryptDoc(stored, []);
    expect(plain).toMatchObject({ value: 42, title: "kms doc" });
  });

  it("caches unwrapped DEKs — repeated reads of a doc hit KMS once", async () => {
    const stub = kmsStub();
    const codec = makeDocCrypto({ kms: stub.adapter, localKey: DEV_KEY });
    const stored = await codec.encryptDoc({ title: "cache me", amount: 7 }, []);
    expect(stub.counts().wrap_calls).toBe(1);

    // same instance: the write just cached the DEK, so reads never unwrap
    await codec.decryptDoc(stored, []);
    await codec.decryptDoc(stored, []);
    await codec.decryptDoc(stored, []);
    expect(stub.counts().unwrap_calls).toBe(0);

    // a NEW instance (cold) reading the same doc: exactly ONE unwrap for all reads
    const cold_codec = makeDocCrypto({ kms: stub.adapter, localKey: DEV_KEY });
    await cold_codec.decryptDoc(stored, []);
    await cold_codec.decryptDoc(stored, []);
    expect(stub.counts().unwrap_calls).toBe(1);

    // a different doc still unwraps exactly once when read cold
    const other = await codec.encryptDoc({ title: "other" }, []);
    const other_cold = makeDocCrypto({ kms: stub.adapter, localKey: DEV_KEY });
    await other_cold.decryptDoc(other, []);
    expect(stub.counts().unwrap_calls).toBe(2);
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
    const raw_json = JSON.stringify(raw);
    expect(raw_json).not.toContain("Renamed legacy plan");
    expect(raw_json).not.toContain("Legacy plaintext plan");
    expect(raw_json).not.toContain("Old Account");
    expect(raw_json).not.toContain("5000");
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

describe("P2 — networth link/snapshots & chat sessions encrypted", () => {
  let container: any;

  beforeAll(async () => {
    const t = await createTestApp();
    container = t.container;
  });

  it("stores OAuth tokens inside the link encrypted — not visible raw", async () => {
    const user_id = "6a80a5177591cb48f91dde5d";
    await container.networth_repo.AddLink({
      user_id,
      provider: "indmoney",
      connected_at: Date.now(),
      tokens: { access_token: "super-secret-at", refresh_token: "super-secret-rt" },
    });

    const raw = await container.db
      .collection("NetWorth_Link_Store")
      .findOne({ user_id: container.db.MakeId(user_id), provider: "indmoney", status: "active" });
    expect(raw).toBeTruthy();
    expect(raw.__enc).toBeTruthy();
    const json = JSON.stringify(raw);
    expect(json).not.toContain("super-secret-at");
    expect(json).not.toContain("super-secret-rt");

    const link: any = await container.networth_repo.GetLink(user_id, "indmoney");
    expect(link.tokens.access_token).toBe("super-secret-at");
    expect(link.tokens.refresh_token).toBe("super-secret-rt");
  });

  it("stores snapshots encrypted while GetLatest returns the market data", async () => {
    const user_id = "6a80a5177591cb48f91dde5e";
    await container.networth_repo.AddLink({ user_id, provider: "indmoney", connected_at: Date.now() });
    await container.networth_repo.AddSnapshot({
      user_id,
      provider: "indmoney",
      as_of: "2026-09-01T00:00:00.000Z",
      snapshot: { total_net_worth: 3717913.88, invested: 2888725.39, as_of: "2026-09-01T00:00:00.000Z", allocation: [] },
      holdings: [{ name: "Nifty 50", current_value: 500000 }],
    });

    const raw = await container.db
      .collection("NetWorth_Snapshot_Store")
      .findOne({ user_id: container.db.MakeId(user_id), provider: "indmoney" });
    expect(raw.__enc).toBeTruthy();
    const json = JSON.stringify(raw);
    expect(json).not.toContain("3717913.88");
    expect(json).not.toContain("Nifty 50");

    const snap: any = await container.networth_repo.GetLatestSnapshot(user_id, "indmoney");
    expect(snap.snapshot.total_net_worth).toBe(3717913.88);
    expect(snap.holdings[0].name).toBe("Nifty 50");
  });

  it("stores chat messages encrypted, updates merge without losing content", async () => {
    const user_id = "6a80a5177591cb48f91dde5f";
    const { created } = await container.chat_session_list.Add({
      user_id,
      title: "Retirement chat",
      messages: [{ role: "user", content: "my salary is 150000" }],
    });

    const raw = await container.db
      .collection("Chat_Session_Store")
      .findOne({ _id: container.db.MakeId(String(created?._id ?? created?.id)) });
    expect(raw).toBeTruthy();
    expect(raw.__enc).toBeTruthy();
    const json = JSON.stringify(raw);
    expect(json).not.toContain("Retirement chat");
    expect(json).not.toContain("my salary is 150000");

    // append a message via partial update
    const session_id = String(created._id);
    await container.chat_session_list.Update({
      _id: session_id,
      messages: [
        { role: "user", content: "my salary is 150000" },
        { role: "assistant", content: "based on that you can invest 45000" },
      ],
    });

    const got: any = await container.chat_session_list.FindById(session_id);
    expect(got.title).toBe("Retirement chat");
    expect(got.messages).toHaveLength(2);
    expect(got.messages[1].content).toContain("45000");
  });
});

describe("P3 — user PII encryption with HMAC email lookup", () => {
  let app: any;
  let container: any;

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    container = t.container;
  });

  it("signup stores email encrypted with an email_token, login still works", async () => {
    const signed = await signupUser(app, { email: "p3user@test.com", password: "secret123" });
    const session = await container.session_list.FindByActiveSessionId(signed.session_id);
    const user_id = session!.user_id.toString();

    const raw = await container.db
      .collection("User_Profiles")
      .findOne({ _id: container.db.MakeId(user_id) });
    expect(raw).toBeTruthy();
    expect(typeof raw.email_token).toBe("string");
    expect(raw.email).toBeUndefined();
    const json = JSON.stringify(raw);
    expect(json).not.toContain("p3user@test.com");

    const found = await container.user_list.FindByEmail("p3user@test.com");
    expect(found).toHaveLength(1);
    expect(found[0].email).toBe("p3user@test.com");
    expect(found[0].IsValidPassword("secret123")).toBe(true);
  });

  it("legacy plaintext users stay findable and are lazily encrypted", async () => {
    const { CreateCredentials } = await import("@/server/infrastructure/crypto");
    const creds = CreateCredentials("legacypass");
    const email = "legacy-p3@test.com";
    const { insertedId } = await container.db.collection("User_Profiles").insertOne({
      email,
      first_name: "legacy",
      last_name: "user",
      credentials: creds,
      role: "user",
      timestamp: Date.now(),
    });

    const found = await container.user_list.FindByEmail(email);
    expect(found).toHaveLength(1);
    expect(found[0].IsValidPassword("legacypass")).toBe(true);

    const raw = await container.db
      .collection("User_Profiles")
      .findOne({ _id: insertedId });
    expect(raw.email_token).toBeTruthy();
    expect(raw.__enc).toBeTruthy();
    expect(JSON.stringify(raw)).not.toContain(email);
  });
});
