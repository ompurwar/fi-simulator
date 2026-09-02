import type { Database } from "../domain/ports";
import { createHmac } from "crypto";
import {
  MakeCashFlow,
  MakeCashFlowChange,
  MakePlan,
  MakeSession,
  MakeUser,
  MakePasswordResetSession,
  MakeShareObject,
  MakeApiToken,
  MakeChatSession,
  MakeBugReport,
} from "../domain/entities";
import {
  CASHFLOW_CONSTANTS,
  SHARE_OBJECT_CONSTANTS,
} from "../domain/constants";
import { CreateCredentials, GenerateHash } from "./crypto";
import type {
  UserRepository,
  SessionRepository,
  PlanTemplateRepository,
  CashFlowRepository,
  CashFlowChangeRepository,
  ShareObjectRepository,
  PasswordResetSessionRepository,
  CommonCollectionRepository,
  ApiTokenRepository,
  AuthTokenRepository,
  ChatSessionRepository,
  BugReportRepository,
  TaxRuleRepository,
} from "../domain/ports";
import { DbInsertFailedError } from "../domain/errors";
import type { DocCryptoCodec } from "./docCrypto";

const userProfilesCollection = "User_Profiles";
const sessionCollection = "Session_Store";
const planCollection = "Plan_Store";
const cashFlowCollection = "Cash_Flow_Store";
const cashFlowChangeCollection = "Cash_Flow_Change_Store";
const shareObjectCollection = "Share_Object_Store";
const resetSessionCollection = "Change_Pass_Session";
const commonCollection = "Common_Collection";
const apiTokenCollection = "Api_Token_Store";
const chatSessionCollection = "Chat_Session_Store";
const bugReportCollection = "Bug_Report_Store";
const authTokenCollection = "Auth_Token_Store";

function DocToUser(user_info: Record<string, any>): any {
  return MakeUser(user_info, GenerateHash);
}

/* ------------------------------ User ------------------------------ */

/** Lookup/index keys kept in plaintext; email/PII live encrypted (P3). */
const userAllow = ["_id", "email_token", "role", "status", "timestamp"];

export function EmailLookupToken(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
}

export function makeUserRepository(
  database: Database,
  codec: DocCryptoCodec,
  opts: { lookupSecret: string }
): UserRepository {
  const db = database;
  const col = () => db.collection(userProfilesCollection);
  const { lookupSecret } = opts;

  /** Legacy docs carry a plaintext `email` without `email_token` — attach the
   *  token and encrypt them lazily so FindByEmail keeps working after upgrade.
   *  replaceOne (not $set) removes the leftover plaintext top-level fields. */
  async function LazyMigrateIfNeeded(doc: Record<string, any>): Promise<void> {
    if (doc.email_token) return;
    if (typeof doc.email !== "string") return;
    const migrated = await codec.encryptDoc(
      { ...doc, email_token: EmailLookupToken(doc.email, lookupSecret) },
      userAllow
    );
    await col().replaceOne({ _id: doc._id }, migrated);
  }

  return {
    async Add(user_info: Record<string, any>) {
      const doc: Record<string, any> = { ...user_info };
      if (doc.password) {
        doc.credentials = CreateCredentials(doc.password);
        delete doc.password;
      }
      doc.timestamp = Date.now();
      doc.email_token = EmailLookupToken(doc.email, lookupSecret);
      // Let Mongo assign the ObjectId (matching FindById's MakeId lookup).
      delete doc._id;
      const stored = await codec.encryptDoc(doc, userAllow);
      const { acknowledged, insertedId } = await col().insertOne(stored);
      const created = DocToUser({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindByEmail(email: string) {
      const token = EmailLookupToken(email, lookupSecret);
      const results = await col()
        .find({ $or: [{ email_token: token }, { email }] })
        .toArray();
      for (const doc of results) await LazyMigrateIfNeeded(doc);
      const docs = await Promise.all(results.map((doc: any) => codec.decryptDoc(doc, userAllow)));
      return docs.map(DocToUser);
    },
    async FindById(user_id: string) {
      const found = await col().findOne({ _id: db.MakeId(user_id) });
      if (!found) return null;
      await LazyMigrateIfNeeded(found);
      const doc = await codec.decryptDoc(found, userAllow);
      return DocToUser(doc);
    },
    async Update({ _id: user_id, ...user_info }) {
      const found = await col().findOne({ _id: db.MakeId(user_id) });
      if (!found) return { success: true };
      const current = await codec.decryptDoc(found, userAllow);
      const merged: Record<string, any> = { ...current, ...user_info };
      delete merged._id;
      if (merged.email !== undefined)
        merged.email_token = EmailLookupToken(merged.email, lookupSecret);
      if (merged.default_plan_id)
        merged.default_plan_id = db.MakeId(merged.default_plan_id);
      const stored = await codec.encryptDoc(merged, userAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(user_id) },
        stored
      );
      return { success: acknowledged };
    },
  };
}

/* ----------------------------- Session ----------------------------- */

export function makeSessionRepository(
  database: Database,
  opts: { sessionIdLength: number; sessionTimeoutHours: number }
): SessionRepository {
  const db = database;
  function DocToSession(session: Record<string, any>): any {
    return MakeSession(
      {
        ...session,
        user_id: session.user_id.toString(),
        _id: session._id.toString(),
      },
      opts
    );
  }
  return {
    async Add(session_info: Record<string, any>) {
      const doc: Record<string, any> = { ...session_info };
      doc.timestamp = db.MakeDate();
      doc.status = "active";
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      try {
        const { acknowledged, insertedId } = await db
          .collection(sessionCollection)
          .insertOne(doc);
        const created = DocToSession({ ...doc, _id: insertedId.toString() });
        return { success: acknowledged, created };
      } catch {
        throw new DbInsertFailedError(sessionCollection);
      }
    },
    async FindBySessionId(session_id: string) {
      const found = await db
        .collection(sessionCollection)
        .findOne({ session_id, status: "active" });
      return found ? DocToSession(found) : null;
    },
    async FindByActiveSessionId(session_id: string) {
      const found = await db.collection(sessionCollection).findOne({
        session_id,
        state: true,
        status: "active",
        timeout: { $gt: Date.now() },
      });
      return found ? DocToSession(found) : null;
    },
    async Update({ _id, ...session_info }) {
      const { acknowledged } = await db
        .collection(sessionCollection)
        .updateMany({ _id: db.MakeId(_id), status: "active" }, { $set: session_info });
      return { success: acknowledged };
    },
    async DeactivateSession(session_id: string) {
      const { acknowledged } = await db
        .collection(sessionCollection)
        .updateMany({ session_id }, { $set: { state: false } });
      return { success: acknowledged };
    },
    async DeactivateSessions(user_id: string) {
      const { acknowledged } = await db
        .collection(sessionCollection)
        .updateMany(
          { user_id: db.MakeId(user_id), state: true },
          { $set: { state: false } }
        );
      return { success: acknowledged };
    },
  };
}

/* --------------------------- PlanTemplate --------------------------- */

/** Lookup/index keys kept in plaintext — the only fields Mongo queries on. */
const planAllow = ["_id", "user_id", "status"];

export function makePlanTemplateRepository(
  database: Database,
  codec: DocCryptoCodec
): PlanTemplateRepository {
  const db = database;
  const col = () => db.collection(planCollection);
  return {
    async Add(plan_info: Record<string, any>) {
      const doc: Record<string, any> = { ...plan_info };
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      if (doc.parent_id) doc.parent_id = db.MakeId(doc.parent_id);
      if (doc.share_id) doc.share_id = db.MakeId(doc.share_id);
      doc.status = "active";
      doc.timestamp = Date.now();
      const stored = await codec.encryptDoc(doc, planAllow);
      const { acknowledged, insertedId } = await col().insertOne(stored);
      const created = MakePlan({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindById(plan_id: string) {
      const found = await col().findOne({ _id: db.MakeId(plan_id), status: "active" });
      if (!found) return null;
      const doc = await codec.decryptDoc(found, planAllow);
      return MakePlan(doc);
    },
    async FindByUserId(user_id: string) {
      const plan_list = await col()
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      const docs = await Promise.all(plan_list.map((doc: any) => codec.decryptDoc(doc, planAllow)));
      return docs.map(MakePlan);
    },
    async Update({ _id: plan_id, ...plan_info }) {
      const found = await col().findOne({ _id: db.MakeId(plan_id), status: "active" });
      if (!found) {
        // Nothing to merge into (mirrors the legacy no-op $set on a missing doc).
        return { success: true };
      }
      const current = await codec.decryptDoc(found, planAllow);
      const merged: Record<string, any> = { ...current, ...plan_info };
      delete merged._id;
      if (merged.user_id !== undefined) merged.user_id = db.MakeId(merged.user_id);
      if (merged.parent_id) merged.parent_id = db.MakeId(merged.parent_id);
      if (merged.share_id) merged.share_id = db.MakeId(merged.share_id);
      merged.modified_at = Date.now();
      const stored = await codec.encryptDoc(merged, planAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(plan_id), status: "active" },
        stored
      );
      return { success: acknowledged };
    },
    async UpdateAccount({ plan_id, account_id, changes }) {
      const found = await col().findOne({ _id: db.MakeId(plan_id), status: "active" });
      if (!found) return { success: true };
      const doc = await codec.decryptDoc(found, planAllow);
      const account = (doc.account_list || []).find(
        (a: Record<string, any>) => String(a._id) === String(account_id)
      );
      if (!account) return { success: true };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) delete account[key];
        else account[key] = value;
      }
      doc.modified_at = Date.now();
      const stored = await codec.encryptDoc(doc, planAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(plan_id), status: "active" },
        stored
      );
      return { success: acknowledged };
    },
    async Delete(plan_id: string) {
      const { acknowledged } = await col().updateMany(
        { _id: db.MakeId(plan_id), status: "active" },
        { $set: { status: "deleted" } }
      );
      return { success: acknowledged };
    },
    async RemoveCashflowAndAccount({ _id: plan_id, cashflow_list, account_list }) {
      const found = await col().findOne({ _id: db.MakeId(plan_id), status: "active" });
      if (found) {
        const doc = await codec.decryptDoc(found, planAllow);
        if (Array.isArray(cashflow_list)) {
          doc.cashflow_list = (doc.cashflow_list || []).filter(
            (entry: any) =>
              !cashflow_list.some(
                (id: any) => String(entry && typeof entry === "object" ? entry._id : entry) === String(id)
              )
          );
        }
        if (Array.isArray(account_list)) {
          doc.account_list = (doc.account_list || []).filter(
            (entry: any) =>
              !account_list.some(
                (id: any) => String(entry && typeof entry === "object" ? entry._id : entry) === String(id)
              )
          );
        }
        doc.modified_at = Date.now();
        const stored = await codec.encryptDoc(doc, planAllow);
        const { acknowledged } = await col().replaceOne(
          { _id: db.MakeId(plan_id), status: "active" },
          stored
        );
        return { success: acknowledged };
      }
      const { acknowledged } = await col().updateOne(
        { _id: db.MakeId(plan_id), status: "active" },
        { $set: {} }
      );
      return { success: acknowledged };
    },
  };
}

/* ----------------------------- CashFlow ----------------------------- */

/** Lookup/index keys kept in plaintext — the only fields Mongo queries on. */
const cashFlowAllow = ["_id", "user_id", "plan_id", "status", "category"];

export function makeCashFlowRepository(
  database: Database,
  codec: DocCryptoCodec
): CashFlowRepository {
  const db = database;
  const col = () => db.collection(cashFlowCollection);
  function DocToCashFlow(cash_flow_info: Record<string, any>): any {
    return MakeCashFlow({
      ...cash_flow_info,
      user_id: cash_flow_info.user_id.toString(),
      plan_id: cash_flow_info.plan_id.toString(),
    });
  }
  async function Decrypt(cash_flow_doc: Record<string, any>): Promise<Record<string, any>> {
    const doc = await codec.decryptDoc(cash_flow_doc, cashFlowAllow);
    return doc;
  }
  return {
    async GetIncomeList({ plan_id, user_id }) {
      const income_list = await col()
        .find({
          status: "active",
          category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
          plan_id: db.MakeId(plan_id),
          user_id: db.MakeId(user_id),
        })
        .toArray();
      const docs = await Promise.all(income_list.map((doc: any) => Decrypt(doc)));
      return docs.map(DocToCashFlow);
    },
    async GetExpenseList({ plan_id, user_id }) {
      const expense_list = await col()
        .find({
          status: "active",
          category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
          plan_id: db.MakeId(plan_id),
          user_id: db.MakeId(user_id),
        })
        .toArray();
      const docs = await Promise.all(expense_list.map((doc: any) => Decrypt(doc)));
      return docs.map(DocToCashFlow);
    },
    async Add(cash_flow_info: Record<string, any>) {
      const doc: Record<string, any> = { ...cash_flow_info };
      doc.status = "active";
      doc.user_id = db.MakeId(doc.user_id);
      doc.plan_id = db.MakeId(doc.plan_id);
      const stored = await codec.encryptDoc(doc, cashFlowAllow);
      const { acknowledged, insertedId } = await col().insertOne(stored);
      const created = DocToCashFlow({
        ...doc,
        _id: doc._id ? doc._id.toString() : insertedId.toString(),
      });
      return { success: acknowledged, created };
    },
    async FindById(cash_flow_id: string) {
      const found = await col().findOne({ _id: db.MakeId(cash_flow_id), status: "active" });
      if (!found) return null;
      const doc = await Decrypt(found);
      return DocToCashFlow(doc);
    },
    async FindByUserId(user_id: string) {
      const list = await col()
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      const docs = await Promise.all(list.map((doc: any) => Decrypt(doc)));
      return docs.map(DocToCashFlow);
    },
    async Update({ _id: cash_flow_id, ...cash_flow_info }) {
      const found = await col().findOne({ _id: db.MakeId(cash_flow_id), status: "active" });
      if (!found) {
        return { success: true };
      }
      const current = await Decrypt(found);
      const merged: Record<string, any> = { ...current, ...cash_flow_info };
      delete merged._id;
      merged.status = "active";
      if (merged.user_id !== undefined) merged.user_id = db.MakeId(merged.user_id);
      if (merged.plan_id !== undefined) merged.plan_id = db.MakeId(merged.plan_id);
      const stored = await codec.encryptDoc(merged, cashFlowAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(cash_flow_id), status: "active" },
        stored
      );
      return { success: acknowledged };
    },
    async Delete({ _id: cash_flow_id, id_list: cash_flow_ids }) {
      const filter: any = { status: "active" };
      if (typeof cash_flow_id === "string") filter._id = db.MakeId(cash_flow_id);
      if (Array.isArray(cash_flow_ids))
        filter._id = { $in: cash_flow_ids.map((_) => db.MakeId(_)) };
      const { acknowledged } = await col().updateMany(filter, { $set: { status: "deleted" } });
      return { success: acknowledged };
    },
  };
}

/* ------------------------- CashFlowChange ------------------------- */

/** Lookup/index keys kept in plaintext — the only fields Mongo queries on. */
const cashFlowChangeAllow = [
  "_id",
  "user_id",
  "cashflow_id",
  "status",
  "category",
  "category_id",
  "cashflow_change_id",
];

export function makeCashFlowChangeRepository(
  database: Database,
  codec: DocCryptoCodec
): CashFlowChangeRepository {
  const db = database;
  const col = () => db.collection(cashFlowChangeCollection);
  function DocToCashFlowChange(cash_flow_info: Record<string, any>): any {
    return MakeCashFlowChange({
      ...cash_flow_info,
      _id: cash_flow_info._id.toString(),
      cashflow_id: cash_flow_info.cashflow_id.toString(),
      user_id: cash_flow_info.user_id.toString(),
    });
  }
  async function Decrypt(cash_flow_doc: Record<string, any>): Promise<Record<string, any>> {
    return codec.decryptDoc(cash_flow_doc, cashFlowChangeAllow);
  }
  return {
    async GetCashflowChangeList({ category_id, cashflow_change_id, cashflow_id } = {}) {
      const filter: any = { status: "active" };
      if (category_id) filter.category_id = category_id;
      if (cashflow_change_id)
        filter.cashflow_change_id = db.MakeId(cashflow_change_id);
      if (cashflow_id) filter.cashflow_id = db.MakeId(cashflow_id);
      const list = await col().find(filter).toArray();
      const docs = await Promise.all(list.map((doc: any) => Decrypt(doc)));
      return docs.map(DocToCashFlowChange);
    },
    async Add(cash_flow_change_info: Record<string, any>) {
      const doc: Record<string, any> = { ...cash_flow_change_info };
      doc.status = "active";
      doc.user_id = db.MakeId(doc.user_id);
      doc.cashflow_id = db.MakeId(doc.cashflow_id);
      const stored = await codec.encryptDoc(doc, cashFlowChangeAllow);
      const { acknowledged, insertedId } = await col().insertOne(stored);
      const created = DocToCashFlowChange({
        ...doc,
        _id: doc._id ? doc._id.toString() : insertedId.toString(),
      });
      return { success: acknowledged, created };
    },
    async FindById(cash_flow_change_id: string) {
      const found = await col().findOne({ _id: db.MakeId(cash_flow_change_id), status: "active" });
      if (!found) return null;
      const doc = await Decrypt(found);
      return DocToCashFlowChange(doc);
    },
    async FindByUserId(user_id: string) {
      const list = await col()
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      const docs = await Promise.all(list.map((doc: any) => Decrypt(doc)));
      return docs.map(DocToCashFlowChange);
    },
    async Update({ _id: cash_flow_change_id, ...cash_flow_change_info }) {
      const found = await col().findOne({ _id: db.MakeId(cash_flow_change_id), status: "active" });
      if (!found) {
        return { success: true };
      }
      const current = await Decrypt(found);
      const merged: Record<string, any> = { ...current, ...cash_flow_change_info };
      delete merged._id;
      merged.status = "active";
      if (merged.user_id !== undefined)
        merged.user_id = db.MakeId(merged.user_id);
      if (merged.cashflow_id !== undefined)
        merged.cashflow_id = db.MakeId(merged.cashflow_id);
      const stored = await codec.encryptDoc(merged, cashFlowChangeAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(cash_flow_change_id), status: "active" },
        stored
      );
      return { success: acknowledged };
    },
    async Delete({ _id: cash_flow_change_id }) {
      const { acknowledged } = await col().updateMany(
        { _id: db.MakeId(cash_flow_change_id), status: "active" },
        { $set: { status: "deleted" } }
      );
      return { success: acknowledged };
    },
  };
}

/* --------------------------- ShareObject --------------------------- */

export function makeShareObjectRepository(
  database: Database
): ShareObjectRepository {
  const db = database;
  function DocToShareObject(share_object_info: Record<string, any>): any {
    return MakeShareObject(share_object_info);
  }
  return {
    async GetTrendingShareObject({ max = 10 } = {}) {
      const list = await db
        .collection(shareObjectCollection)
        .find({
          status: { $in: ["active"] },
          state: SHARE_OBJECT_CONSTANTS.STATE.PUBLIC,
        })
        .limit(max)
        .sort({ onboard_count: -1 })
        .toArray();
      return list.map(DocToShareObject);
    },
    async Add(share_object_info: Record<string, any>) {
      if (share_object_info.creator_id)
        share_object_info.creator_id = db.MakeId(share_object_info.creator_id);
      if (share_object_info.plan_ids)
        share_object_info.plan_ids = share_object_info.plan_ids.map(db.MakeId);
      share_object_info.status = "active";
      share_object_info.timestamp = Date.now();
      const { acknowledged, insertedId } = await db
        .collection(shareObjectCollection)
        .insertOne(share_object_info);
      const created = DocToShareObject({
        ...share_object_info,
        _id: insertedId.toString(),
      });
      return { success: acknowledged, created };
    },
    async FindById({ share_ids, state }) {
      const filters: any = {
        _id: { $in: share_ids.map(db.MakeId) },
        status: { $in: ["active", "dormant"] },
      };
      if (state) filters.state = state;
      const found = await db.collection(shareObjectCollection).findOne(filters);
      return found ? DocToShareObject(found) : null;
    },
    async FindByIds({ share_ids, state }) {
      const filters: any = {
        _id: { $in: share_ids.map(db.MakeId) },
        status: { $in: ["active", "dormant"] },
      };
      if (state) filters.state = state;
      const list = await db.collection(shareObjectCollection).find(filters).toArray();
      return list.map(DocToShareObject);
    },
    async FindByCreatorId(creator_id: string) {
      const list = await db
        .collection(shareObjectCollection)
        .find({
          creator_id: db.MakeId(creator_id),
          status: { $in: ["active", "dormant"] },
        })
        .toArray();
      return list.map(DocToShareObject);
    },
    async Update({ _id: share_id, ...share_object_info }) {
      if (share_object_info.plan_ids)
        share_object_info.plan_ids = share_object_info.plan_ids.map(db.MakeId);
      share_object_info.modified_at = Date.now();
      delete share_object_info.creator_id;
      const { acknowledged } = await db
        .collection(shareObjectCollection)
        .updateMany(
          { _id: db.MakeId(share_id), status: "active" },
          { $set: share_object_info }
        );
      return { success: acknowledged };
    },
    async Delete(share_id: string) {
      const { acknowledged } = await db
        .collection(shareObjectCollection)
        .updateMany(
          { _id: db.MakeId(share_id), status: "active" },
          { $set: { status: "deleted" } }
        );
      return { success: acknowledged };
    },
    async IncrementObCount(share_id: string) {
      const { acknowledged } = await db
        .collection(shareObjectCollection)
        .updateMany({ _id: db.MakeId(share_id), status: "active" }, { $inc: { onboard_count: 1 } });
      return { success: acknowledged };
    },
  };
}

/* ---------------------- PasswordResetSession ---------------------- */

export function makePasswordResetSessionRepository(
  database: Database,
  opts: { pwResetSessionLengthMin: number }
): PasswordResetSessionRepository {
  const db = database;
  function DocToResetSession(session_info: Record<string, any>): any {
    return MakePasswordResetSession(session_info, opts.pwResetSessionLengthMin);
  }
  return {
    async Add({ user_id, ...session_info }) {
      const doc: Record<string, any> = { ...session_info };
      if (user_id) doc.user_id = db.MakeId(user_id);
      doc.status = "active";
      doc.timestamp = Date.now();
      const { acknowledged, insertedId } = await db
        .collection(resetSessionCollection)
        .insertOne(doc);
      const created = DocToResetSession({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindById(_id: string) {
      const found = await db
        .collection(resetSessionCollection)
        .findOne({ _id: db.MakeId(_id), status: "active" });
      return found ? DocToResetSession(found) : null;
    },
    async FindByUserId(user_id: string) {
      const list = await db
        .collection(resetSessionCollection)
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      return list.map(DocToResetSession);
    },
    async FindByUserIdAndSecret(secret: string) {
      const found = await db
        .collection(resetSessionCollection)
        .findOne({ status: "active", secret });
      return found ? DocToResetSession(found) : null;
    },
    async Update({ _id: session_id, ...session_info }) {
      if (session_info.user_id)
        session_info.user_id = db.MakeId(session_info.user_id);
      session_info.modified_at = Date.now();
      const { acknowledged } = await db
        .collection(resetSessionCollection)
        .updateMany(
          { _id: db.MakeId(session_id), status: "active" },
          { $set: session_info }
        );
      return { success: acknowledged };
    },
    async Delete(_id: string) {
      const { acknowledged } = await db
        .collection(resetSessionCollection)
        .updateMany(
          { _id: db.MakeId(_id), status: "active" },
          { $set: { status: "deleted" } }
        );
      return { success: acknowledged };
    },
  };
}

/* ------------------------------ ChatSession ------------------------------ */

/** Lookup/index keys kept in plaintext (P2 — chat messages/title encrypted). */
const chatSessionAllow = ["_id", "user_id", "status", "created_at", "updated_at"];

export function makeChatSessionRepository(
  database: Database,
  codec: DocCryptoCodec
): ChatSessionRepository {
  const db = database;
  const col = () => db.collection(chatSessionCollection);
  function DocToChatSession(session_info: Record<string, any>): any {
    return MakeChatSession({
      ...session_info,
      _id: session_info._id.toString(),
      user_id: session_info.user_id.toString(),
    });
  }
  return {
    async Add(session_info: Record<string, any>) {
      const doc: Record<string, any> = { ...session_info };
      // Let Mongo assign the ObjectId (matching makeUserRepository).
      delete doc._id;
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      doc.status = "active";
      doc.created_at = Date.now();
      doc.updated_at = doc.created_at;
      const stored = await codec.encryptDoc(doc, chatSessionAllow);
      const { acknowledged, insertedId } = await col().insertOne(stored);
      const created = DocToChatSession({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindById(session_id: string) {
      const found = await col().findOne({ _id: db.MakeId(session_id), status: "active" });
      if (!found) return null;
      const doc = await codec.decryptDoc(found, chatSessionAllow);
      return DocToChatSession(doc);
    },
    async FindByUserId(user_id: string) {
      const list = await col()
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .sort({ updated_at: -1 })
        .toArray();
      const docs = await Promise.all(list.map((doc: any) => codec.decryptDoc(doc, chatSessionAllow)));
      return docs.map(DocToChatSession);
    },
    async Update({ _id, ...session_info }) {
      const found = await col().findOne({ _id: db.MakeId(_id), status: "active" });
      if (!found) return { success: true };
      const current = await codec.decryptDoc(found, chatSessionAllow);
      const merged: Record<string, any> = { ...current, ...session_info };
      delete merged._id;
      merged.status = "active";
      if (merged.user_id !== undefined) merged.user_id = db.MakeId(merged.user_id);
      merged.updated_at = Date.now();
      const stored = await codec.encryptDoc(merged, chatSessionAllow);
      const { acknowledged } = await col().replaceOne(
        { _id: db.MakeId(_id), status: "active" },
        stored
      );
      return { success: acknowledged };
    },
    async Delete(session_id: string) {
      const { acknowledged } = await col().updateMany(
        { _id: db.MakeId(session_id), status: "active" },
        { $set: { status: "deleted" } }
      );
      return { success: acknowledged };
    },
  };
}

/* ------------------------------ BugReport ------------------------------ */

export function makeBugReportRepository(database: Database): BugReportRepository {
  const db = database;
  function DocToBugReport(bug_info: Record<string, any>): any {
    return MakeBugReport({
      ...bug_info,
      _id: bug_info._id.toString(),
      user_id: bug_info.user_id.toString(),
      ...(bug_info.plan_id ? { plan_id: bug_info.plan_id.toString() } : {}),
    });
  }
  function ToQuery(query: { status?: string; severity?: string } = {}) {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    else filter.status = { $in: ["open", "resolved", "duplicate"] };
    if (query.severity) filter.severity = query.severity;
    return filter;
  }
  return {
    async Add(bug_info: Record<string, any>) {
      const doc: Record<string, any> = { ...bug_info };
      // Let Mongo assign the ObjectId (matching makeUserRepository).
      delete doc._id;
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      if (doc.plan_id) doc.plan_id = db.MakeId(doc.plan_id);
      doc.status = doc.status || "open";
      doc.created_at = Date.now();
      doc.updated_at = doc.created_at;
      const { acknowledged, insertedId } = await db
        .collection(bugReportCollection)
        .insertOne(doc);
      const created = DocToBugReport({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindById(bug_id: string) {
      const found = await db
        .collection(bugReportCollection)
        .findOne({ _id: db.MakeId(bug_id) });
      return found ? DocToBugReport(found) : null;
    },
    async Update({ _id, ...bug_info }) {
      if (bug_info.plan_id) bug_info.plan_id = db.MakeId(bug_info.plan_id);
      bug_info.updated_at = Date.now();
      const { acknowledged } = await db
        .collection(bugReportCollection)
        .updateMany({ _id: db.MakeId(_id) }, { $set: bug_info });
      return { success: acknowledged };
    },
    async FindOpenByFingerprint(fingerprint: string) {
      const found = await db
        .collection(bugReportCollection)
        .find({ fingerprint, status: "open" })
        .sort({ created_at: -1 })
        .toArray();
      return found.length ? DocToBugReport(found[0]) : null;
    },
    async FindByUser(user_id: string, query: { status?: string; severity?: string }) {
      const list = await db
        .collection(bugReportCollection)
        .find({ user_id: db.MakeId(user_id), ...ToQuery(query) })
        .sort({ created_at: -1 })
        .toArray();
      return list.map(DocToBugReport);
    },
    async FindAll(query: { status?: string; severity?: string }) {
      const list = await db
        .collection(bugReportCollection)
        .find(ToQuery(query))
        .sort({ created_at: -1 })
        .toArray();
      return list.map(DocToBugReport);
    },
  };
}

/* ------------------------- CommonCollection ------------------------- */

export function makeCommonCollectionRepository(
  database: Database
): CommonCollectionRepository {
  const db = database;
  return {
    async GetCommonCollectionList() {
      const [common_collection] = await db
        .collection(commonCollection)
        .find({ status: "active" })
        .toArray();
      return common_collection || null;
    },
  };
}

/* ------------------------------ ApiToken ------------------------------ */

export function makeApiTokenRepository(database: Database): ApiTokenRepository {
  const db = database;
  function DocToApiToken(token_info: Record<string, any>): any {
    return MakeApiToken({
      ...token_info,
      _id: token_info._id.toString(),
      user_id: token_info.user_id.toString(),
    });
  }
  return {
    async Add(token_info: Record<string, any>) {
      const doc: Record<string, any> = { ...token_info };
      // Let Mongo assign the ObjectId (matching makeUserRepository).
      delete doc._id;
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      doc.status = "active";
      doc.created_at = Date.now();
      const { acknowledged, insertedId } = await db
        .collection(apiTokenCollection)
        .insertOne(doc);
      const created = DocToApiToken({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindByTokenHash(token_hash: string) {
      const found = await db
        .collection(apiTokenCollection)
        .findOne({ token_hash, status: "active" });
      return found ? DocToApiToken(found) : null;
    },
    async FindByUserId(user_id: string) {
      const list = await db
        .collection(apiTokenCollection)
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      return list.map(DocToApiToken);
    },
    async Update({ _id, ...token_info }) {
      const { acknowledged } = await db
        .collection(apiTokenCollection)
        .updateMany(
          { _id: db.MakeId(_id), status: "active" },
          { $set: token_info }
        );
      return { success: acknowledged };
    },
  };
}

/* ------------------------------ Auth tokens ------------------------------ */

/** JWT access/refresh token records — every issued token keeps a DB row so it can be revoked later. */
export function makeAuthTokenRepository(database: Database): AuthTokenRepository {
  const db = database;
  return {
    async Add(info: Record<string, any>) {
      const doc: Record<string, any> = { ...info };
      delete doc._id;
      if (doc.user_id) doc.user_id = db.MakeId(doc.user_id);
      const { acknowledged, insertedId } = await db
        .collection(authTokenCollection)
        .insertOne(doc);
      return { success: acknowledged, created: { ...doc, _id: insertedId.toString() } };
    },
    async FindActiveByJti(jti: string) {
      const found = await db.collection(authTokenCollection).findOne({ jti, status: "active" });
      return found || null;
    },
    async FindTokenByHash(kind, token_hash) {
      const found = await db
        .collection(authTokenCollection)
        .findOne({ kind, token_hash, status: "active" });
      return found || null;
    },
    async Update({ _id, ...info }) {
      const { acknowledged } = await db
        .collection(authTokenCollection)
        .updateMany({ _id: db.MakeId(_id) }, { $set: info });
      return { success: acknowledged };
    },
    async RevokeByJti(jti: string) {
      const { acknowledged } = await db
        .collection(authTokenCollection)
        .updateMany({ jti }, { $set: { status: "revoked", revoked_at: Date.now() } });
      return { success: acknowledged };
    },
    async RevokeByHash(token_hash: string) {
      const { acknowledged } = await db
        .collection(authTokenCollection)
        .updateMany({ token_hash }, { $set: { status: "revoked", revoked_at: Date.now() } });
      return { success: acknowledged };
    },
    async RevokeAllForUser(user_id: string) {
      const { acknowledged } = await db
        .collection(authTokenCollection)
        .updateMany(
          { user_id: db.MakeId(user_id), status: "active" },
          { $set: { status: "revoked", revoked_at: Date.now() } }
        );
      return { success: acknowledged };
    },
  };
}

/* ------------------------------ Tax rules ------------------------------ */

const taxRuleCollection = "Tax_Rule_Store";
const PRESETS_DOC_ID = "PRESETS";

/** Versioned tax rule sets (AY docs) + asset-class presets (PRESETS doc) in Tax_Rule_Store. */
export function makeTaxRuleRepository(database: Database): TaxRuleRepository {
  const db = database;
  return {
    async UpsertRuleSet(doc: Record<string, any>) {
      const id = doc._id || `AY-${doc.assessment_year}`;
      const { acknowledged } = await db
        .collection(taxRuleCollection)
        .replaceOne({ _id: id }, { ...doc, _id: id, updated_at: Date.now() }, { upsert: true });
      return { success: acknowledged };
    },
    async FindByAssessmentYear(assessment_year: string) {
      const found = await db
        .collection(taxRuleCollection)
        .findOne({ assessment_year });
      return found ?? null;
    },
    async ListRuleSets() {
      const list = await db
        .collection(taxRuleCollection)
        .find({ assessment_year: { $exists: true } })
        .sort({ assessment_year: 1 })
        .toArray();
      return list;
    },
    async GetPresets() {
      const found = await db.collection(taxRuleCollection).findOne({ _id: PRESETS_DOC_ID });
      return found ?? null;
    },
    async UpsertPresets(presets: Record<string, any>) {
      const { acknowledged } = await db
        .collection(taxRuleCollection)
        .replaceOne(
          { _id: PRESETS_DOC_ID },
          { ...presets, _id: PRESETS_DOC_ID, updated_at: Date.now() },
          { upsert: true }
        );
      return { success: acknowledged };
    },
  };
}
