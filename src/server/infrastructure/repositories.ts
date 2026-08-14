import type { Database } from "../domain/ports";
import {
  MakeCashFlow,
  MakeCashFlowChange,
  MakePlan,
  MakeSession,
  MakeUser,
  MakePasswordResetSession,
  MakeShareObject,
} from "../domain/entities";
import {
  CASHFLOW_CHANGE_CONSTANTS,
  CASHFLOW_CONSTANTS,
  PLAN_TEMPLATE_CONSTANTS,
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
} from "../domain/ports";
import { DbInsertFailedError } from "../domain/errors";

const userProfilesCollection = "User_Profiles";
const sessionCollection = "Session_Store";
const planCollection = "Plan_Store";
const cashFlowCollection = "Cash_Flow_Store";
const cashFlowChangeCollection = "Cash_Flow_Change_Store";
const shareObjectCollection = "Share_Object_Store";
const resetSessionCollection = "Change_Pass_Session";
const commonCollection = "Common_Collection";

function DocToUser(user_info: Record<string, any>): any {
  return MakeUser(user_info, GenerateHash);
}

/* ------------------------------ User ------------------------------ */

export function makeUserRepository(database: Database): UserRepository {
  const db = database;
  return {
    async Add(user_info: Record<string, any>) {
      const doc: Record<string, any> = { ...user_info };
      if (doc.password) {
        doc.credentials = CreateCredentials(doc.password);
        delete doc.password;
      }
      doc.timestamp = Date.now();
      // Let Mongo assign the ObjectId (matching FindById's MakeId lookup).
      delete doc._id;
      const { acknowledged, insertedId } = await db
        .collection(userProfilesCollection)
        .insertOne(doc);
      const created = DocToUser({ ...doc, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindByEmail(email: string) {
      const results = await db
        .collection(userProfilesCollection)
        .find({ email })
        .toArray();
      return results.map(DocToUser);
    },
    async FindById(user_id: string) {
      const found = await db
        .collection(userProfilesCollection)
        .findOne({ _id: db.MakeId(user_id) });
      return found ? DocToUser(found) : null;
    },
    async Update({ _id: user_id, ...user_info }) {
      if (user_info.default_plan_id)
        user_info.default_plan_id = db.MakeId(user_info.default_plan_id);
      const { acknowledged } = await db
        .collection(userProfilesCollection)
        .updateMany({ _id: db.MakeId(user_id) }, { $set: { ...user_info } });
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

export function makePlanTemplateRepository(database: Database): PlanTemplateRepository {
  const db = database;
  return {
    async Add(plan_info: Record<string, any>) {
      if (plan_info.user_id) plan_info.user_id = db.MakeId(plan_info.user_id);
      if (plan_info.parent_id) plan_info.parent_id = db.MakeId(plan_info.parent_id);
      if (plan_info.share_id) plan_info.share_id = db.MakeId(plan_info.share_id);
      plan_info.status = "active";
      plan_info.timestamp = Date.now();
      const { acknowledged, insertedId } = await db.collection(planCollection).insertOne(plan_info);
      const created = MakePlan({ ...plan_info, _id: insertedId.toString() });
      return { success: acknowledged, created };
    },
    async FindById(plan_id: string) {
      const found = await db
        .collection(planCollection)
        .findOne({ _id: db.MakeId(plan_id), status: "active" });
      return found ? MakePlan(found) : null;
    },
    async FindByUserId(user_id: string) {
      const plan_list = await db
        .collection(planCollection)
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      return plan_list.map(MakePlan);
    },
    async Update({ _id: plan_id, ...plan_info }) {
      plan_info.user_id = db.MakeId(plan_info.user_id);
      plan_info.modified_at = Date.now();
      if (plan_info.parent_id) plan_info.parent_id = db.MakeId(plan_info.parent_id);
      if (plan_info.share_id) plan_info.share_id = db.MakeId(plan_info.share_id);
      const { acknowledged } = await db
        .collection(planCollection)
        .updateMany(
          { _id: db.MakeId(plan_id), status: "active" },
          { $set: plan_info }
        );
      return { success: acknowledged };
    },
    async Delete(plan_id: string) {
      const { acknowledged } = await db
        .collection(planCollection)
        .updateMany(
          { _id: db.MakeId(plan_id), status: "active" },
          { $set: { status: "deleted" } }
        );
      return { success: acknowledged };
    },
    async RemoveCashflowAndAccount({ _id: plan_id, cashflow_list, account_list }) {
      const update: any = {
        $pull: { cashflow_list: { $in: [] }, account_list: { $in: [] } },
      };
      if (Array.isArray(cashflow_list))
        update.$pull.cashflow_list.$in = cashflow_list.map((_) => db.MakeId(_));
      if (Array.isArray(account_list))
        update.$pull.account_list.$in = account_list.map((_) => db.MakeId(_));
      const { acknowledged } = await db
        .collection(planCollection)
        .updateOne({ _id: db.MakeId(plan_id), status: "active" }, update);
      return { success: acknowledged };
    },
  };
}

/* ----------------------------- CashFlow ----------------------------- */

export function makeCashFlowRepository(database: Database): CashFlowRepository {
  const db = database;
  function DocToCashFlow(cash_flow_info: Record<string, any>): any {
    return MakeCashFlow({
      ...cash_flow_info,
      user_id: cash_flow_info.user_id.toString(),
      plan_id: cash_flow_info.plan_id.toString(),
    });
  }
  return {
    async GetIncomeList({ plan_id, user_id }) {
      const income_list = await db
        .collection(cashFlowCollection)
        .find({
          status: "active",
          category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
          plan_id: db.MakeId(plan_id),
          user_id: db.MakeId(user_id),
        })
        .toArray();
      return income_list.map(DocToCashFlow);
    },
    async GetExpenseList({ plan_id, user_id }) {
      const expense_list = await db
        .collection(cashFlowCollection)
        .find({
          status: "active",
          category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
          plan_id: db.MakeId(plan_id),
          user_id: db.MakeId(user_id),
        })
        .toArray();
      return expense_list.map(DocToCashFlow);
    },
    async Add(cash_flow_info: Record<string, any>) {
      cash_flow_info.status = "active";
      cash_flow_info.user_id = db.MakeId(cash_flow_info.user_id);
      cash_flow_info.plan_id = db.MakeId(cash_flow_info.plan_id);
      const { acknowledged, insertedId } = await db.collection(cashFlowCollection).insertOne(cash_flow_info);
      const created = DocToCashFlow({
        ...cash_flow_info,
        _id: insertedId.toString(),
      });
      return { success: acknowledged, created };
    },
    async FindById(cash_flow_id: string) {
      const found = await db
        .collection(cashFlowCollection)
        .findOne({ _id: db.MakeId(cash_flow_id), status: "active" });
      return found ? DocToCashFlow(found) : null;
    },
    async FindByUserId(user_id: string) {
      const list = await db
        .collection(cashFlowCollection)
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      return list.map(DocToCashFlow);
    },
    async Update({ _id: cash_flow_id, ...cash_flow_info }) {
      cash_flow_info.status = "active";
      const { acknowledged } = await db
        .collection(cashFlowCollection)
        .updateMany(
          { _id: db.MakeId(cash_flow_id), status: "active" },
          { $set: cash_flow_info }
        );
      return { success: acknowledged };
    },
    async Delete({ _id: cash_flow_id, id_list: cash_flow_ids }) {
      const filter: any = { status: "active" };
      if (typeof cash_flow_id === "string") filter._id = db.MakeId(cash_flow_id);
      if (Array.isArray(cash_flow_ids))
        filter._id = { $in: cash_flow_ids.map((_) => db.MakeId(_)) };
      const { acknowledged } = await db
        .collection(cashFlowCollection)
        .updateMany(filter, { $set: { status: "deleted" } });
      return { success: acknowledged };
    },
  };
}

/* ------------------------- CashFlowChange ------------------------- */

export function makeCashFlowChangeRepository(
  database: Database
): CashFlowChangeRepository {
  const db = database;
  function DocToCashFlowChange(cash_flow_info: Record<string, any>): any {
    return MakeCashFlowChange({
      ...cash_flow_info,
      _id: cash_flow_info._id.toString(),
      cashflow_id: cash_flow_info.cashflow_id.toString(),
      user_id: cash_flow_info.user_id.toString(),
    });
  }
  return {
    async GetCashflowChangeList({ category_id, cashflow_change_id, cashflow_id } = {}) {
      const filter: any = { status: "active" };
      if (category_id) filter.category_id = category_id;
      if (cashflow_change_id)
        filter.cashflow_change_id = db.MakeId(cashflow_change_id);
      if (cashflow_id) filter.cashflow_id = db.MakeId(cashflow_id);
      const list = await db
        .collection(cashFlowChangeCollection)
        .find(filter)
        .toArray();
      return list.map(DocToCashFlowChange);
    },
    async Add(cash_flow_change_info: Record<string, any>) {
      cash_flow_change_info.status = "active";
      cash_flow_change_info.user_id = db.MakeId(cash_flow_change_info.user_id);
      cash_flow_change_info.cashflow_id = db.MakeId(cash_flow_change_info.cashflow_id);
      const { acknowledged, insertedId } = await db
        .collection(cashFlowChangeCollection)
        .insertOne(cash_flow_change_info);
      const created = DocToCashFlowChange({
        ...cash_flow_change_info,
        _id: insertedId.toString(),
      });
      return { success: acknowledged, created };
    },
    async FindById(cash_flow_change_id: string) {
      const found = await db
        .collection(cashFlowChangeCollection)
        .findOne({ _id: db.MakeId(cash_flow_change_id), status: "active" });
      return found ? DocToCashFlowChange(found) : null;
    },
    async FindByUserId(user_id: string) {
      const list = await db
        .collection(cashFlowChangeCollection)
        .find({ user_id: db.MakeId(user_id), status: "active" })
        .toArray();
      return list.map(DocToCashFlowChange);
    },
    async Update({ _id: cash_flow_change_id, ...cash_flow_change_info }) {
      cash_flow_change_info.user_id = db.MakeId(cash_flow_change_info.user_id);
      cash_flow_change_info.cashflow_id = db.MakeId(cash_flow_change_info.cashflow_id);
      const { acknowledged } = await db
        .collection(cashFlowChangeCollection)
        .updateMany(
          { _id: db.MakeId(cash_flow_change_id), status: "active" },
          { $set: cash_flow_change_info }
        );
      return { success: acknowledged };
    },
    async Delete({ _id: cash_flow_change_id }) {
      const { acknowledged } = await db
        .collection(cashFlowChangeCollection)
        .updateMany(
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
