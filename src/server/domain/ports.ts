/** Repository ports (interfaces), so domain/application never depend on Mongo. */

import type {
  CashFlow,
  CashFlowChange,
  PlanTemplate,
  Session,
  ShareObject,
  UserProfile,
  PasswordResetSession,
} from "./entities";

export interface UserRepository {
  Add(info: Record<string, any>): Promise<{ success: boolean; created: UserProfile }>;
  FindByEmail(email: string): Promise<UserProfile[]>;
  FindById(user_id: string): Promise<UserProfile | null>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean }>;
}

export interface SessionRepository {
  Add(info: Record<string, any>): Promise<{ success: boolean; created: Session }>;
  FindBySessionId(session_id: string): Promise<Session | null>;
  FindByActiveSessionId(session_id: string): Promise<Session | null>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean }>;
  DeactivateSession(session_id: string): Promise<{ success: boolean }>;
  DeactivateSessions(user_id: string): Promise<{ success: boolean }>;
}

export interface PlanTemplateRepository {
  Add(info: Record<string, any>): Promise<{ success: boolean; created: PlanTemplate }>;
  FindById(plan_id: string): Promise<PlanTemplate | null>;
  FindByUserId(user_id: string): Promise<PlanTemplate[]>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean }>;
  Delete(plan_id: string): Promise<{ success: boolean }>;
  RemoveCashflowAndAccount(info: {
    _id: string;
    cashflow_list?: string[];
    account_list?: string[];
  }): Promise<{ success: boolean }>;
}

export interface CashFlowRepository {
  GetIncomeList(info: { plan_id: string; user_id: string }): Promise<CashFlow[]>;
  GetExpenseList(info: { plan_id: string; user_id: string }): Promise<CashFlow[]>;
  Add(info: Record<string, any>): Promise<{ success: boolean; created: CashFlow }>;
  Delete(info: { _id?: string; id_list?: string[] }): Promise<{ success: boolean }>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean; updated?: any }>;
  FindById(cash_flow_id: string): Promise<CashFlow | null>;
  FindByUserId(user_id: string): Promise<CashFlow[]>;
}

export interface CashFlowChangeRepository {
  GetCashflowChangeList(info: {
    category_id?: string;
    cashflow_change_id?: string;
    cashflow_id?: string;
  }): Promise<CashFlowChange[]>;
  Add(info: Record<string, any>): Promise<{ success: boolean; created: CashFlowChange }>;
  FindById(cash_flow_change_id: string): Promise<CashFlowChange | null>;
  FindByUserId(user_id: string): Promise<CashFlowChange[]>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean; updated?: any }>;
  Delete(info: { _id: string }): Promise<{ success: boolean }>;
}

export interface ShareObjectRepository {
  Add(info: Record<string, any>): Promise<{ success: boolean; created: ShareObject }>;
  FindById(info: { share_ids: string[]; state?: string }): Promise<ShareObject | null>;
  FindByIds(info: { share_ids: string[]; state?: string }): Promise<ShareObject[]>;
  FindByCreatorId(creator_id: string): Promise<ShareObject[]>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean }>;
  Delete(share_id: string): Promise<{ success: boolean }>;
  IncrementObCount(share_id: string): Promise<{ success: boolean }>;
  GetTrendingShareObject(info?: { max?: number }): Promise<ShareObject[]>;
}

export interface PasswordResetSessionRepository {
  Add(info: Record<string, any>): Promise<{ success: boolean; created: PasswordResetSession }>;
  FindById(_id: string): Promise<PasswordResetSession | null>;
  FindByUserId(user_id: string): Promise<PasswordResetSession[]>;
  FindByUserIdAndSecret(secret: string): Promise<PasswordResetSession | null>;
  Update(info: { _id: string } & Record<string, any>): Promise<{ success: boolean }>;
  Delete(_id: string): Promise<{ success: boolean }>;
}

export interface CommonCollectionRepository {
  GetCommonCollectionList(): Promise<any>;
}

export interface Database {
  /** Wrap a string id into a Mongo ObjectId. */
  MakeId(id: string): any;
  MakeDate(): number;
  collection(name: string): any;
}
