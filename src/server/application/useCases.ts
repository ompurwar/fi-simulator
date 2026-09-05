import type {
  ApiTokenRepository,
  BugReportRepository,
  CashFlowChangeRepository,
  CashFlowRepository,
  ChatSessionRepository,
  CommonCollectionRepository,
  PasswordResetSessionRepository,
  PlanTemplateRepository,
  SessionRepository,
  ShareObjectRepository,
  UserRepository,
} from "../domain/ports";
import {
  ACCOUNT_CONSTANTS,
  CASHFLOW_CHANGE_CONSTANTS,
  CASHFLOW_CONSTANTS,
  SHARE_OBJECT_CONSTANTS,
  IsValidEmail,
  RequiredParam,
} from "../domain/constants";
import {
  MakeAccount,
  MakeApiToken,
  MakeBugReport,
  MakeCashFlow,
  MakeCashFlowChange,
  MakePlan,
  MakeSession,
  MakeShareObject,
  MakeUser,
  MakePasswordResetSession,
  MakeChatSession,
  GenerateRandomString,
} from "../domain/entities";
import { createHash } from "crypto";
import {
  DbInsertFailedError,
  DbUpdateFailedError,
  InvalidAuthTokenError,
  InvalidOperationError,
  InvalidPropertyError,
  UnAuthorizedAccessToPlan,
  UniqueConstraintError,
  UserNotFoundByEmailError,
} from "../domain/errors";
import { ComputePlanSnapshot } from "../engine/planSnapshot";
import type { NetWorthService } from "../networth";
import type { TaxRuleService } from "../tax";
import type { AuthTokenService } from "../auth-tokens";

export interface UseCaseDeps {
  user_list: UserRepository;
  session_list: SessionRepository;
  plan_list: PlanTemplateRepository;
  cashflow_list: CashFlowRepository;
  cashflow_change_list: CashFlowChangeRepository;
  share_object_list: ShareObjectRepository;
  password_reset_session_list: PasswordResetSessionRepository;
  common_collection_list: CommonCollectionRepository;
  api_token_list: ApiTokenRepository;
  auth_token_service: AuthTokenService;
  chat_session_list: ChatSessionRepository;
  bug_report_list: BugReportRepository;
  networth_service: NetWorthService;
  tax_service: TaxRuleService;
  GenerateHash: (pass: string, salt: string) => string;
  CreateCredentials: (password: string) => { salt: string; hash: string };
  defaultPlanDuration: number;
  sessionTimeoutHours: number;
  pwResetSessionLengthMin: number;
  cookieSecret: string;
  clientApplication: string;
  sendTemplateMail: (args: {
    to: { Email: string; Name: string };
    subject: string;
    template_id: number;
    variables?: Record<string, any>;
  }) => Promise<any>;
}

export interface ApplicationLayer {
  Login(input: { email: string; password: string }): Promise<any>;
  CreateSessionForUser(input: { user_id: string }): Promise<any>;
  Signup(input: {
    first_name?: string;
    last_name?: string;
    email: string;
    password: string;
    photos?: string[];
    src?: string;
  }): Promise<any>;
  Logout(input: { session_id: string; refresh_token?: string; access_token?: string }): Promise<any>;
  RefreshSession(input: { refresh_token: string }): Promise<any>;
  RevokeAllUserSessions(input: { user_id: string }): Promise<any>;
  CheckSession(input: { user_id: string; session_id: string }): Promise<any>;
  ChangePassword(input: {
    user_id?: string;
    mode: string;
    current_password?: string;
    new_password: string;
    session_secret?: string;
  }): Promise<any>;
  InitiateResetPasswordSession(input: { email: string }): Promise<any>;
  ResetForgottenPassword(input: {
    new_password: string;
    session_secret: string;
  }): Promise<any>;
  GetUser(input: { user_id: string }): Promise<any>;
  OnboardUser(input: { user_id: string; ob_params: Record<string, any> }): Promise<any>;
  SetDefaultPlan(input: { user_id: string; plan_id: string }): Promise<any>;
  GetPlan(input: { user_id: string }): Promise<any>;
  AddPlan(input: Record<string, any>): Promise<any>;
  UpdatePlan(input: Record<string, any>): Promise<any>;
  DeletePlan(input: { id: string }): Promise<any>;
  ForkPlan(input: Record<string, any>): Promise<any>;
  InitiatePlan(input: Record<string, any>): any;
  GetIncome(input: { plan_id: string; user_id: string }): Promise<any>;
  AddIncome(input: Record<string, any>): Promise<any>;
  UpdateIncome(input: Record<string, any>): Promise<any>;
  DeleteIncome(input: { id: string }): Promise<any>;
  GetExpense(input: { plan_id: string; user_id: string }): Promise<any>;
  AddExpense(input: Record<string, any>): Promise<any>;
  UpdateExpense(input: Record<string, any>): Promise<any>;
  DeleteExpense(input: { id: string }): Promise<any>;
  GetCashflowChanges(input: Record<string, any>): Promise<any>;
  AddCashflowChange(input: Record<string, any>): Promise<any>;
  UpdateCashflowChange(input: Record<string, any>): Promise<any>;
  DeleteCashflowChange(input: { id: string }): Promise<any>;
  GetShareObjects(input: Record<string, any>): Promise<any>;
  AddShareObject(input: Record<string, any>): Promise<any>;
  UpdateShareObject(input: Record<string, any>): Promise<any>;
  OptinShareObject(input: { share_id: string; user_id: string }): Promise<any>;
  DeleteShareObject(input: { id: string; user_id: string }): Promise<any>;
  GetCommonCollection(): Promise<any>;
  CreateApiToken(input: { user_id: string; name: string }): Promise<any>;
  ListApiTokens(input: { user_id: string }): Promise<any>;
  RevokeApiToken(input: { user_id: string; token_id: string }): Promise<any>;
  CreateChatSession(input: { user_id: string; title?: string }): Promise<any>;
  ListChatSessions(input: { user_id: string }): Promise<any>;
  GetChatSession(input: { user_id: string; session_id: string }): Promise<any>;
  DeleteChatSession(input: { user_id: string; session_id: string }): Promise<any>;
  AppendChatMessage(input: {
    user_id: string;
    session_id: string;
    role: string;
    content: string;
    tools?: string[];
  }): Promise<any>;
  SubmitEngineBug(input: Record<string, any>): Promise<any>;
  ListEngineBugs(input: {
    user_id: string;
    role?: string;
    status?: string;
    severity?: string;
  }): Promise<any>;
  GetEngineBug(input: { user_id: string; role?: string; bug_id: string }): Promise<any>;
  ResolveEngineBug(input: Record<string, any>): Promise<any>;
  PlanSnapshot(input: { plan: any; duration?: number }): Promise<any>;
  GetNetWorthStatus(input: { user_id: string }): Promise<any>;
  ConnectNetWorth(input: { user_id: string; redirect_url: string }): Promise<any>;
  HandleNetWorthCallback(input: { state: string; code: string }): Promise<any>;
  SyncNetWorth(input: { user_id: string }): Promise<any>;
  DisconnectNetWorth(input: { user_id: string }): Promise<any>;
}

export function MakeApplicationLayer(deps: UseCaseDeps): ApplicationLayer {
  const {
    user_list,
    session_list,
    plan_list,
    cashflow_list,
    cashflow_change_list,
    share_object_list,
    password_reset_session_list,
    common_collection_list,
    api_token_list,
    auth_token_service,
    chat_session_list,
    bug_report_list,
    networth_service,
    tax_service,
    GenerateHash,
    CreateCredentials,
    defaultPlanDuration,
    sessionTimeoutHours,
    pwResetSessionLengthMin,
    cookieSecret,
    clientApplication,
    sendTemplateMail,
  } = deps;

  /* ------------------------------ Auth ------------------------------ */

  async function Login({ email, password }: { email: string; password: string }) {
    if (!IsValidEmail(email))
      throw new InvalidPropertyError(`${email} is not a valid email`);

    const user_being_logging_in = await user_list.FindByEmail(email);
    if (user_being_logging_in.length) {
      const the_user = user_being_logging_in[0];
      if (the_user.IsValidPassword!(password)) {
        const session = MakeSession(
          { user_id: the_user._id.toString() },
          { sessionIdLength: 24, sessionTimeoutHours }
        );
        const { success, created } = await session_list.Add(session);
        if (success) {
          const tokens = await auth_token_service.IssueTokenPair({
            user_id: the_user._id.toString(),
          });
          // keep the legacy session shape (callers read .user_id/.session_id)
          return { ...created, tokens };
        }
      } else {
        throw new InvalidOperationError("invalid credentials"); // UnauthorizedAccess
      }
    } else {
      throw new UserNotFoundByEmailError(email);
    }
  }

  /** Open a session + token pair for an already-verified user (Google OAuth
   *  callback). Bypasses the password check — Google verified the email. */
  async function CreateSessionForUser({ user_id }: { user_id: string }) {
    const session = MakeSession(
      { user_id },
      { sessionIdLength: 24, sessionTimeoutHours }
    );
    const { success, created } = await session_list.Add(session);
    if (!success) throw new DbInsertFailedError("session");
    const tokens = await auth_token_service.IssueTokenPair({ user_id });
    return { ...created, tokens };
  }

  async function Signup({
    first_name,
    last_name,
    email,
    password,
    photos = [],
    src = "std",
  }: {
    first_name?: string;
    last_name?: string;
    email: string;
    password: string;
    photos?: string[];
    src?: string;
  }) {
    const user_obj = { first_name, last_name, email, password, photos, src };
    const user_info = MakeUser(user_obj, GenerateHash);
    const user_found = await user_list.FindByEmail(user_info.email);
    if (!user_found.length) {
      const user_add_result = await user_list.Add(user_info);
      if (user_add_result.success) {
        const session = MakeSession(
          { user_id: user_add_result.created._id },
          { sessionIdLength: 24, sessionTimeoutHours }
        );
        const { success, created } = await session_list.Add(session);
        if (success) {
          const tokens = await auth_token_service.IssueTokenPair({
            user_id: String(user_add_result.created._id),
          });
          return { ...created, tokens };
        }
      }
    }
    throw new UniqueConstraintError("User already exists.");
  }

  async function Logout({
    session_id,
    refresh_token,
    access_token,
  }: {
    session_id: string;
    refresh_token?: string;
    access_token?: string;
  }) {
    if (session_id) await session_list.DeactivateSession(session_id);
    if (refresh_token) await auth_token_service.RevokeRefreshToken(refresh_token);
    if (access_token) await auth_token_service.RevokeAccessToken(access_token);
  }

  async function RefreshSession({ refresh_token }: { refresh_token: string }) {
    return auth_token_service.RotateRefreshToken(refresh_token);
  }

  async function RevokeAllUserSessions({ user_id }: { user_id: string }) {
    const user = await user_list.FindById(user_id);
    if (!user) return;
    const next_version = ((user as any)?.token_version ?? 0) + 1;
    await user_list.Update({ _id: user_id, token_version: next_version });
    await auth_token_service.RevokeAllForUser(user_id);
    await session_list.DeactivateSessions(user_id);
  }

  async function CheckSession(_input: { user_id: string; session_id: string }) {
    return {};
  }

  async function ChangePassword({
    user_id,
    mode,
    current_password,
    new_password,
    session_secret,
  }: {
    user_id?: string;
    mode: string;
    current_password?: string;
    new_password: string;
    session_secret?: string;
  }) {
    let session = null;
    let all_okay = false;

    if (mode === "update") {
      if (!user_id) RequiredParam("user_id");
      if (!current_password) RequiredParam("current_password");

      const user = await user_list.FindById(user_id!);
      if (user && user.src !== "std")
        throw new InvalidOperationError(
          "this user do not have password based credentials"
        );
      const valid = user!.IsValidPassword!(current_password!);
      if (!valid) throw new InvalidOperationError(user!.email);

      const credentials = CreateCredentials(new_password);
      user_list.Update({ _id: user_id!, credentials });
      // password change invalidates every outstanding JWT pair + legacy session
      await RevokeAllUserSessions({ user_id: user_id! });
      session = MakeSession(
        { user_id: user!._id.toString() },
        { sessionIdLength: 24, sessionTimeoutHours }
      );
      const { success, created } = await session_list.Add(session);
      all_okay = true;
    }
    if (mode === "reset_forgotten") {
      if (!session_secret) RequiredParam("session_secret");
      const reset_session = await password_reset_session_list.FindByUserIdAndSecret(
        session_secret!
      );
      if (!reset_session)
        throw new InvalidOperationError("unauthorized session");
      if (reset_session.expires_at <= Date.now())
        throw new InvalidOperationError("Oops! session expired! try again.");
      if (reset_session.used)
        throw new InvalidOperationError("unauthorized session");

      const { user_id: reset_user_id } = reset_session;
      const user = await user_list.FindById(reset_user_id);
      const credentials = CreateCredentials(new_password);
      user_list.Update({ _id: reset_user_id, credentials });
      password_reset_session_list.Update({
        _id: reset_session._id!,
        used: true,
      });
    }

    if (all_okay) return { session };
  }

  async function InitiateResetPasswordSession({ email }: { email: string }) {
    const reset_password_link_template_id = 4418784;
    const [user] = await user_list.FindByEmail(email);
    if (!user) throw new UserNotFoundByEmailError(email);
    if (user && user.src !== "std")
      throw new InvalidOperationError(
        "this user do not have password based credentials"
      );

    const reset_session = MakePasswordResetSession(
      { user_id: user._id },
      pwResetSessionLengthMin
    );
    await password_reset_session_list.Add(reset_session);
    const link = CreatePasswordResetLink(reset_session.secret);

    sendTemplateMail({
      to: {
        Email: email,
        Name: `${user.first_name} ${user.last_name}`.trim(),
      },
      subject: "[Fi-Plan] Rest Password Link",
      template_id: reset_password_link_template_id,
      variables: { reset_link: link },
    });

    return { link };
  }

  function CreatePasswordResetLink(session_secret: string): string {
    return encodeURI(
      `${clientApplication}/forgot_password?mode=rst&rst_ses=${session_secret}`
    );
  }

  async function ResetForgottenPassword({
    new_password,
    session_secret,
  }: {
    new_password: string;
    session_secret: string;
  }) {
    return ChangePassword({
      mode: "reset_forgotten",
      new_password,
      session_secret,
    });
  }

  /* ------------------------------ User ------------------------------ */

  async function GetUser({ user_id }: { user_id: string }) {
    const user_found = await user_list.FindById(user_id);
    if (user_found) {
      const temp_user: any = { ...user_found };
      delete temp_user.credentials;
      delete temp_user.IsValidPassword;
      return temp_user;
    }
    throw new InvalidOperationError("User not found");
  }

  async function OnboardUser({
    user_id,
    ob_params,
  }: {
    user_id: string;
    ob_params: Record<string, any>;
  }) {
    const result = await user_list.Update({ _id: user_id, ob_params });
    if (result.success) {
      let new_plan = null;
      const user_found = await user_list.FindById(user_id);
      if (user_found) {
        const {
          income,
          monthly_expense,
          runway,
        } = ob_params;
        const plan_obj: Record<string, any> = {
          user_id,
          title: "My first plan.",
          description: "",
          account_list: [],
          cashflow_list: [],
          cashflow_change_list: [],
          fund_distribution_percentage: [],
          loan_accounts: [],
        };

        if (monthly_expense) {
          const expense_cashflow = MakeCashFlow({
            category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
            type: CASHFLOW_CONSTANTS.TYPE.PERIODIC,
            frequency: CASHFLOW_CONSTANTS.FREQUENCY.MONTHLY,
            amount: monthly_expense,
            start_month: 1,
            desc: "monthly expense",
            active: true,
            primary: true,
            end_month: defaultPlanDuration,
          });
          plan_obj.cashflow_list.push(expense_cashflow);
        }
        if (income) {
          const income_cashflow = MakeCashFlow({
            category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
            type: CASHFLOW_CONSTANTS.TYPE.PERIODIC,
            frequency: CASHFLOW_CONSTANTS.FREQUENCY.MONTHLY,
            amount: income,
            start_month: 1,
            desc: "salary",
            active: true,
            primary: true,
            end_month: defaultPlanDuration,
          });
          plan_obj.cashflow_list.push(income_cashflow);
        }

        const emergency_account = MakeAccount({
          title: "Emergency",
          init_balance: runway && monthly_expense ? monthly_expense * runway : 0,
          category: ACCOUNT_CONSTANTS.CATEGORY.EMERGENCY,
          default_investment_priority: 1,
          parent_id: null,
          type: ACCOUNT_CONSTANTS.TYPE.ASSET,
          roi: 3,
        });
        const saving_account = MakeAccount({
          title: "Saving",
          init_balance: 0,
          category: ACCOUNT_CONSTANTS.CATEGORY.SAVING,
          default_investment_priority: 2,
          parent_id: null,
          type: ACCOUNT_CONSTANTS.TYPE.ASSET,
          roi: 5,
        });
        const investment_account = MakeAccount({
          title: "Investment",
          init_balance: 0,
          category: ACCOUNT_CONSTANTS.CATEGORY.INVESTMENT,
          default_investment_priority: 3,
          parent_id: null,
          type: ACCOUNT_CONSTANTS.TYPE.ASSET,
          roi: 12,
        });

        plan_obj.account_list.push(emergency_account);
        plan_obj.account_list.push(saving_account);
        plan_obj.account_list.push(investment_account);

        new_plan = await AddPlan(plan_obj);
      }
      const temp_user = { ...user_found };
      delete (temp_user as any).credentials;
      delete (temp_user as any).IsValidPassword;
      return { user: temp_user, plan: new_plan };
    }
    throw new InvalidOperationError("User not found");
  }

  async function SetDefaultPlan({
    user_id,
    plan_id,
  }: {
    user_id: string;
    plan_id: string;
  }) {
    const plan = await plan_list.FindById(plan_id);
    if (!plan)
      throw new InvalidOperationError(`Sorry invalid plan selected plan_id:${plan_id}`);
    if (plan.user_id.toString() !== user_id)
      throw new InvalidOperationError(`Sorry invalid plan selected plan_id:${plan_id}`);

    const result = await user_list.Update({ _id: user_id, default_plan_id: plan_id });
    if (result.success) return null;
    throw new InvalidOperationError("Something went wrong.");
  }

  /* ------------------------------ Plan ------------------------------ */

  async function GetPlan({ user_id }: { user_id: string }) {
    return await plan_list.FindByUserId(user_id);
  }

  async function AddPlan(input: Record<string, any>) {
    const {
      user_id,
      title,
      description,
      monthly_income,
      monthly_expense,
      runway,
      account_list,
      loan_accounts,
      cashflow_list,
      cashflow_change_list,
      fund_distribution_percentage,
    } = input;
    let plan_object: any;
    if (
      monthly_income !== undefined ||
      monthly_expense !== undefined ||
      runway !== undefined
    ) {
      // The original add_plan controller posts these raw fields; build via InitiatePlan.
      plan_object = InitiatePlan({
        user_id,
        title,
        description,
        monthly_income,
        monthly_expense,
        runway,
      });
    } else {
      plan_object = MakePlan({
        user_id,
        cashflow_list: cashflow_list || [],
        cashflow_change_list: cashflow_change_list || [],
        account_list: account_list || [],
        loan_accounts: loan_accounts || [],
        fund_distribution_percentage: fund_distribution_percentage || [],
        title,
        description,
      });
    }
    const { success, created } = await plan_list.Add(plan_object);
    if (success) return created;
  }

  function InitiatePlan(input: Record<string, any>) {
    const {
      user_id,
      title,
      description,
      monthly_income,
      monthly_expense,
      runway,
    } = input;
    const plan_obj: Record<string, any> = {
      user_id,
      title,
      description,
      account_list: [],
      cashflow_list: [],
      cashflow_change_list: [],
      fund_distribution_percentage: [],
      loan_accounts: [],
    };

    if (monthly_income) {
      plan_obj.cashflow_list.push(
        MakeCashFlow({
          category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
          type: CASHFLOW_CONSTANTS.TYPE.PERIODIC,
          frequency: CASHFLOW_CONSTANTS.FREQUENCY.MONTHLY,
          amount: monthly_income,
          start_month: 1,
          desc: "monthly income",
          active: true,
          primary: true,
          end_month: defaultPlanDuration,
        })
      );
    }
    if (monthly_expense) {
      plan_obj.cashflow_list.push(
        MakeCashFlow({
          category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
          type: CASHFLOW_CONSTANTS.TYPE.PERIODIC,
          frequency: CASHFLOW_CONSTANTS.FREQUENCY.MONTHLY,
          amount: monthly_expense,
          start_month: 1,
          desc: "monthly expense",
          active: true,
          primary: true,
          end_month: defaultPlanDuration,
        })
      );
    }

    let emergency_runway_balance = 0;
    if (runway && monthly_expense) {
      emergency_runway_balance = monthly_expense * runway;
    }
    plan_obj.account_list.push(
      MakeAccount({
        title: "Emergency",
        init_balance: emergency_runway_balance,
        category: ACCOUNT_CONSTANTS.CATEGORY.EMERGENCY,
        default_investment_priority: 1,
        parent_id: null,
        type: ACCOUNT_CONSTANTS.TYPE.ASSET,
        roi: 3,
      })
    );
    plan_obj.account_list.push(
      MakeAccount({
        title: "Saving",
        init_balance: 0,
        category: ACCOUNT_CONSTANTS.CATEGORY.SAVING,
        default_investment_priority: 2,
        parent_id: null,
        type: ACCOUNT_CONSTANTS.TYPE.ASSET,
        roi: 5,
      })
    );
    plan_obj.account_list.push(
      MakeAccount({
        title: "Investment",
        init_balance: 0,
        category: ACCOUNT_CONSTANTS.CATEGORY.INVESTMENT,
        default_investment_priority: 3,
        parent_id: null,
        type: ACCOUNT_CONSTANTS.TYPE.ASSET,
        roi: 12,
      })
    );

    return MakePlan(plan_obj);
  }

  async function UpdatePlan(input: Record<string, any>) {
    const { _id, user_id, ...plan_info } = input;
    const plan_object = MakePlan({
      _id,
      user_id,
      cashflow_list: plan_info.cashflow_list || [],
      cashflow_change_list: plan_info.cashflow_change_list || [],
      account_list: plan_info.account_list || [],
      loan_accounts: plan_info.loan_accounts || [],
      fund_distribution_percentage: plan_info.fund_distribution_percentage || [],
      title: plan_info.title,
      description: plan_info.description,
      ...plan_info,
    });
    const { success } = await plan_list.Update(plan_object);
    return success ? { updated: true } : null;
  }

  async function DeletePlan({ id }: { id: string }) {
    const plan = await plan_list.FindById(id);
    if (plan) {
      const { success } = await plan_list.Delete(id);
      if (success) return true;
    }
  }

  async function ForkPlan(input: Record<string, any>) {
    const { plan_id, user_id, title, description, share_id, category } = input;
    const plan_to_be_forked = await plan_list.FindById(plan_id);
    if (!plan_to_be_forked) throw new InvalidOperationError("Plan not found!");
    if (
      !share_id &&
      plan_to_be_forked.user_id?.toString() !== user_id
    )
      throw new InvalidOperationError(
        "User is Un Authorized to access this plan!"
      );

    const {
      cashflow_list,
      account_list,
      loan_accounts,
      cashflow_change_list,
      fund_distribution_percentage,
      asset_list,
      withdrawal_order,
      withdrawal_settings,
    } = plan_to_be_forked;

    const plan_object = MakePlan({
      title: title || plan_to_be_forked.title,
      description: description || plan_to_be_forked.description,
      user_id,
      parent_id: plan_id,
      share_id,
      cashflow_list,
      cashflow_change_list,
      account_list,
      loan_accounts,
      fund_distribution_percentage,
      asset_list,
      withdrawal_order,
      withdrawal_settings,
      category,
    });
    const { success, created } = await plan_list.Add(plan_object);
    if (success) return created;
  }

  /* --------------------------- Income/Expense --------------------------- */

  async function GetIncome({ plan_id, user_id }: { plan_id: string; user_id: string }) {
    return await cashflow_list.GetIncomeList({ plan_id, user_id });
  }

  async function AddIncome(input: Record<string, any>) {
    const {
      user_id,
      plan_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active = true,
      primary = false,
    } = input;
    const plan = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError("Invalid plane Id Assigned");

    const income_object = MakeCashFlow({
      category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active,
      primary,
      plan_id,
    });

    const { success, created } = await cashflow_list.Add(income_object);
    // Embed the FULL line into the plan document (the projection engine iterates
    // cashflow_list as objects — a bare id string is silently dropped, making
    // the line "persisted but invisible" in statements).
    const embedded_lines = (plan.cashflow_list || []).map((c: any) =>
      c && typeof c === "object" && String(c._id) === String(created._id) ? created : c
    );
    if (!embedded_lines.some((c: any) => c && typeof c === "object" && c._id === created._id))
      embedded_lines.push(created);
    await plan_list.Update({ ...plan, cashflow_list: embedded_lines });
    if (success) return created;
  }

  async function UpdateIncome(input: Record<string, any>) {
    const {
      _id,
      plan_id,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active = true,
      primary = false,
    } = input;
    MakeCashFlow({
      category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
      plan_id,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
      active,
      primary,
    });
    const { updated } = await cashflow_list.Update({
      category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
    });
    // Keep the plan doc (engine source of truth) in sync — embed or upsert.
    if (plan_id) {
      const updated_line = await cashflow_list.FindById(_id);
      if (updated_line) await EmbedCashflowLine(plan_id, updated_line);
    }
    return updated;
  }

  async function DeleteIncome({ id }: { id: string }) {
    if (typeof id !== "string")
      throw new InvalidPropertyError("id should be of type string");
    if (id.length === 0) throw new InvalidPropertyError("id is required");
    const cashflow_changes = await cashflow_change_list.GetCashflowChangeList({
      cashflow_id: id,
    });
    const income = await cashflow_list.FindById(id);
    const plan = income?.plan_id
      ? await plan_list.FindById(String(income.plan_id))
      : null;
    const embedded_changes = (plan?.cashflow_change_list || []).filter(
      (c: any) => String(c.cashflow_id) === String(id)
    );
    if (!cashflow_changes.length && !embedded_changes.length) {
      if (income) {
        await plan_list.RemoveCashflowAndAccount({
          _id: income.plan_id,
          cashflow_list: [id],
        });
      }
      const { success } = await cashflow_list.Delete({ _id: id });
      if (success) return true;
    }
    throw new InvalidOperationError(
      "cannot delete income for which cashflow-changes exists"
    );
  }

  async function GetExpense({ plan_id, user_id }: { plan_id: string; user_id: string }) {
    return await cashflow_list.GetExpenseList({ plan_id, user_id });
  }

  async function AddExpense(input: Record<string, any>) {
    const {
      user_id,
      plan_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active = true,
      primary = false,
    } = input;
    const plan = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError("Invalid plane Id Assigned");

    const expense_object = MakeCashFlow({
      category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active,
      primary,
      plan_id,
    });

    const { success, created } = await cashflow_list.Add(expense_object);
    // Embed the FULL line into the plan document (the projection engine iterates
    // cashflow_list as objects — a bare id string is silently dropped, making
    // the line "persisted but invisible" in statements).
    const embedded_lines = (plan.cashflow_list || []).map((c: any) =>
      c && typeof c === "object" && String(c._id) === String(created._id) ? created : c
    );
    if (!embedded_lines.some((c: any) => c && typeof c === "object" && c._id === created._id))
      embedded_lines.push(created);
    await plan_list.Update({ ...plan, cashflow_list: embedded_lines });
    if (success) return created;
  }

  async function UpdateExpense(input: Record<string, any>) {
    const {
      _id,
      plan_id,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      active = true,
      primary = false,
    } = input;
    MakeCashFlow({
      category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
      plan_id,
      user_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
      active,
      primary,
    });
    const { updated } = await cashflow_list.Update({
      category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
    });
    // Keep the plan doc (engine source of truth) in sync — embed or upsert.
    if (plan_id) {
      const updated_line = await cashflow_list.FindById(_id);
      if (updated_line) await EmbedCashflowLine(plan_id, updated_line);
    }
    return updated;
  }

  async function DeleteExpense({ id }: { id: string }) {
    if (typeof id !== "string")
      throw new InvalidPropertyError("id should be of type string");
    if (id.length === 0) throw new InvalidPropertyError("id is required");
    const cashflow_changes = await cashflow_change_list.GetCashflowChangeList({
      cashflow_id: id,
    });
    const expense = await cashflow_list.FindById(id);
    const plan = expense?.plan_id
      ? await plan_list.FindById(String(expense.plan_id))
      : null;
    const embedded_changes = (plan?.cashflow_change_list || []).filter(
      (c: any) => String(c.cashflow_id) === String(id)
    );
    if (!cashflow_changes.length && !embedded_changes.length) {
      if (expense) {
        await plan_list.RemoveCashflowAndAccount({
          _id: expense.plan_id,
          cashflow_list: [id],
        });
      }
      const { success } = await cashflow_list.Delete({ _id: id });
      if (success) return true;
    }
    throw new InvalidOperationError(
      "cannot delete expense for which cashflow-changes exists"
    );
  }

  /* ------------------------- Cashflow Changes ------------------------- */

  /** The plan document is the source of truth the engine projects from.
   *  These helpers keep plan.cashflow_list / plan.cashflow_change_list in sync
   *  with store mutations (SSoT consolidation — fatal drift class). */

  async function EmbedCashflowLine(plan_id: string, line: any) {
    const plan = await plan_list.FindById(plan_id);
    if (!plan) return;
    const id = String(line._id);
    const list = (plan.cashflow_list || []).map((c: any) =>
      String(c._id) === id ? { ...line } : c
    );
    if (!list.some((c: any) => String(c._id) === id)) list.push({ ...line });
    await plan_list.Update({
      ...plan,
      _id: plan_id,
      user_id: plan.user_id ?? "",
      cashflow_list: list,
    });
  }

  async function EmbedCashflowChange(plan_id: string, change: any) {
    const plan = await plan_list.FindById(plan_id);
    if (!plan) return;
    const id = String(change._id);
    const list = (plan.cashflow_change_list || []).map((c: any) =>
      String(c._id) === id ? { ...change } : c
    );
    if (!list.some((c: any) => String(c._id) === id)) list.push({ ...change });
    await plan_list.Update({
      ...plan,
      _id: plan_id,
      user_id: plan.user_id ?? "",
      cashflow_change_list: list,
    });
  }

  async function RemoveCashflowChangeFromPlan(plan_id: string, change_id: string) {
    const plan = await plan_list.FindById(plan_id);
    if (!plan) return;
    await plan_list.Update({
      ...plan,
      _id: plan_id,
      user_id: plan.user_id ?? "",
      cashflow_change_list: (plan.cashflow_change_list || []).filter(
        (c: any) => String(c._id) !== String(change_id)
      ),
    });
  }

  /** Safety net: merge active store lines missing from the embedded list
   *  (heals any remaining legacy drift for engine projections). */
  async function ReconcileCashflowStore(plan: any) {
    if (!plan?._id) return plan;
    const [inc, exp] = await Promise.all([
      cashflow_list.GetIncomeList({ plan_id: String(plan._id), user_id: String(plan.user_id) }),
      cashflow_list.GetExpenseList({ plan_id: String(plan._id), user_id: String(plan.user_id) }),
    ]);
    if (!inc.length && !exp.length) return plan;
    const by_id = new Map<string, any>(
      (plan.cashflow_list || []).map((c: any) => [String(c._id), c])
    );
    let changed = false;
    for (const line of [...inc, ...exp]) {
      const key = String(line._id);
      if (!by_id.has(key)) {
        by_id.set(key, line);
        changed = true;
      }
    }
    return changed ? { ...plan, cashflow_list: [...by_id.values()] } : plan;
  }

  async function GetCashflowChanges(input: Record<string, any>) {
    return await cashflow_change_list.GetCashflowChangeList(input);
  }

  async function AddCashflowChange(input: Record<string, any>) {
    const { user_id, category, change_type, value, cashflow_id, plan_id } = input;
    const cashflow_change_object = MakeCashFlowChange({
      category,
      user_id,
      change_type,
      cashflow_id,
      value,
      active: true,
      ...input,
    });
    const cashflow = await cashflow_list.FindById(cashflow_id);
    if (cashflow) {
      const { success, created } = await cashflow_change_list.Add(cashflow_change_object);
      if (success) {
        // plan doc is the engine source of truth — embed the new change
        if (cashflow.plan_id) await EmbedCashflowChange(String(cashflow.plan_id), created);
        return created;
      }
    }
    // Plan-embedded line (no store row) — the web-onboarding model: attach via plan_id.
    if (plan_id) {
      const plan = await plan_list.FindById(plan_id);
      const line = (plan?.cashflow_list || []).find(
        (c: any) => String(c._id) === String(cashflow_id)
      );
      if (plan && line) {
        const sameMonth = (plan.cashflow_change_list || []).filter(
          (x: any) =>
            String(x.cashflow_id) === String(cashflow_id) &&
            x.start_month === cashflow_change_object.start_month &&
            x.category === cashflow_change_object.category
        );
        const remaining = (plan.cashflow_change_list || []).filter(
          (x: any) => !sameMonth.includes(x)
        );
        const { success, created } = await cashflow_change_list.Add({
          ...cashflow_change_object,
          plan_id,
        });
        if (success) {
          await plan_list.Update({
            ...plan,
            _id: plan_id,
            user_id: plan.user_id ?? "",
            cashflow_change_list: [...remaining, created],
          });
          return created;
        }
      }
    }
    throw new InvalidOperationError(
      "assign of cashflow-changes to non existing cashflow"
    );
  }

  async function UpdateCashflowChange(input: Record<string, any>) {
    const { _id } = input;
    const existing = await cashflow_change_list.FindById(_id);
    if (!existing)
      throw new InvalidOperationError(`cashflow change not found: ${_id}`);
    const merged_input = MakeCashFlowChange({
      ...existing,
      ...input,
      active: true,
    });
    const { updated } = await cashflow_change_list.Update({ ...merged_input, _id });
    // Keep plan.cashflow_change_list in sync after a store-side update.
    const updated_change = await cashflow_change_list.FindById(_id);
    if (updated_change) {
      const cashflow = updated_change.plan_id
        ? null
        : await cashflow_list.FindById(updated_change.cashflow_id);
      const embed_plan_id =
        updated_change.plan_id || cashflow?.plan_id || null;
      if (embed_plan_id)
        await EmbedCashflowChange(String(embed_plan_id), updated_change);
    }
    return updated;
  }

  async function DeleteCashflowChange({ id }: { id: string }) {
    const existing = await cashflow_change_list.FindById(id);
    const { success } = await cashflow_change_list.Delete({ _id: id });
    if (success) {
      if (existing) {
        const cashflow = existing.plan_id
          ? null
          : await cashflow_list.FindById(existing.cashflow_id);
        const plan_id = existing.plan_id || cashflow?.plan_id || null;
        if (plan_id) await RemoveCashflowChangeFromPlan(String(plan_id), id);
      }
      return true;
    }
  }

  /* ---------------------------- ShareObject ---------------------------- */

  async function GetShareObjects(input: Record<string, any>) {
    const { creator_id, filter_by, share_ids = [] } = input;
    if (!["creator_id", "share_id", "popularity"].includes(filter_by))
      throw new InvalidPropertyError("filter_by: invalid value of filter_by");
    if (share_ids.length === 0 && !creator_id)
      RequiredParam("share_ids or creator_id is required");

    if (filter_by === "creator_id" && !creator_id)
      throw new InvalidAuthTokenError("Unauthorized access");

    if (share_ids && filter_by === "share_id")
      return await share_object_list.FindByIds({
        share_ids,
        state: "public",
      });
    if (creator_id && filter_by === "creator_id")
      return await share_object_list.FindByCreatorId(creator_id);
    if (filter_by === "popularity")
      return await share_object_list.GetTrendingShareObject({ max: 10 });
  }

  async function AddShareObject(input: Record<string, any>) {
    const {
      title,
      description = "",
      type,
      category,
      promotional_links,
      creator_name,
      creator_id,
      img_url,
      plan_ids,
      ...other_info
    } = input;

    let share_object = MakeShareObject({
      title,
      description,
      type,
      category,
      promotional_links,
      creator_name,
      creator_id,
      img_url,
      plan_ids: [],
      onboard_count: 0,
      state: SHARE_OBJECT_CONSTANTS.STATE.PUBLIC,
      ...other_info,
    });

    const { success, created } = await share_object_list.Add(share_object);
    const map_for_given_plan_ids_to_cloned_plans: Record<string, any> = {};

    let fork_promises: any[] = [];
    if (created) {
      share_object = created;
      plan_ids.forEach((given_plan_id: string) => {
        fork_promises.push(
          ForkPlan({
            plan_id: given_plan_id,
            share_id: share_object._id,
            user_id: creator_id,
            category,
          })
        );
      });
      fork_promises = await Promise.all(fork_promises);
      fork_promises.forEach((plan) => {
        map_for_given_plan_ids_to_cloned_plans[plan.parent_id.toString()] = plan;
      });
    }
    const temp_share_object = {
      ...created,
      plan_ids: plan_ids.map((plan_id: string) => {
        return map_for_given_plan_ids_to_cloned_plans[plan_id]._id;
      }),
    };
    await share_object_list.Update(temp_share_object);
    return { share_object: temp_share_object, forked_plans: fork_promises };
  }

  async function UpdateShareObject(input: Record<string, any>) {
    const { _id, title, description = "", type, category, promotional_links, creator_name, user_id, img_url, plan_ids, ...other_info } = input;
    const _object = await share_object_list.FindById({ share_ids: [_id] });
    if (_object && String(_object.creator_id) !== String(user_id))
      throw new InvalidOperationError("Unauthorized access to share object");

    const share_object = MakeShareObject({
      _id,
      title,
      description,
      type,
      category,
      promotional_links,
      creator_name,
      creator_id: user_id,
      img_url,
      plan_ids,
      ...other_info,
    });
    const { success } = await share_object_list.Update(share_object);
    if (success) return { updated: true };
  }

  async function OptinShareObject({
    share_id,
    user_id,
  }: {
    share_id: string;
    user_id: string;
  }) {
    let fork_promises: any[] = [];
    const share_object = await share_object_list.FindById({
      share_ids: [share_id],
      state: "public",
    });

    if (share_object) {
      const { category, plan_ids } = share_object;
      plan_ids.forEach((given_plan_id: string) => {
        fork_promises.push(
          ForkPlan({
            plan_id: given_plan_id,
            share_id: share_object._id,
            user_id,
            category,
          })
        );
      });
      fork_promises = await Promise.all(fork_promises);
      await share_object_list.IncrementObCount(share_id);
      return { forked_plans: fork_promises };
    }
    throw new InvalidOperationError("share_object not found");
  }

  async function DeleteShareObject({ id, user_id }: { id: string; user_id: string }) {
    const share_object = await share_object_list.FindById({ share_ids: [id] });
    if (share_object) {
      if (String(share_object.creator_id) !== String(user_id))
        throw new InvalidOperationError("Un authorized access to the share_object");
      const { success } = await share_object_list.Delete(id);
      if (success) return true;
    }
  }

  /* ------------------------- CommonCollection ------------------------- */

  async function GetCommonCollection() {
    const common_collection = await common_collection_list.GetCommonCollectionList();
    if (common_collection) return common_collection;
    return {};
  }

  /* ----------------------------- ApiToken ----------------------------- */

  async function CreateApiToken({ user_id, name }: { user_id: string; name: string }) {
    if (!name) RequiredParam("name");
    const raw = "fp_" + GenerateRandomString(32);
    const token_hash = GenerateHash(raw, cookieSecret);
    const api_token = MakeApiToken({ user_id, name, token_hash });
    const { success, created } = await api_token_list.Add(api_token);
    if (success) return { api_token: raw, token_id: created._id };
    throw new DbInsertFailedError();
  }

  async function ListApiTokens({ user_id }: { user_id: string }) {
    const tokens = await api_token_list.FindByUserId(user_id);
    return tokens.map((token: any) => ({
      _id: token._id,
      name: token.name,
      status: token.status,
      created_at: token.created_at,
      last_used_at: token.last_used_at,
    }));
  }

  async function RevokeApiToken({
    user_id,
    token_id,
  }: {
    user_id: string;
    token_id: string;
  }) {
    if (!token_id) RequiredParam("token_id");
    const tokens = await api_token_list.FindByUserId(user_id);
    if (!tokens.some((token: any) => token._id === token_id))
      throw new InvalidOperationError("Unauthorized access to api token");
    const { success } = await api_token_list.Update({
      _id: token_id,
      status: "deleted",
    });
    if (success) return { revoked: true };
    throw new InvalidOperationError("Something went wrong.");
  }

  /* ----------------------------- ChatSession ----------------------------- */

  async function CreateChatSession({ user_id, title }: { user_id: string; title?: string }) {
    const session = MakeChatSession({ user_id, title });
    const { success, created } = await chat_session_list.Add(session);
    if (success) return { session_id: created._id };
    throw new DbInsertFailedError();
  }

  async function ListChatSessions({ user_id }: { user_id: string }) {
    const sessions = await chat_session_list.FindByUserId(user_id);
    return sessions.map((session: any) => ({
      _id: session._id,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
      message_count: Array.isArray(session.messages) ? session.messages.length : 0,
    }));
  }

  async function GetChatSession({ user_id, session_id }: { user_id: string; session_id: string }) {
    const session = await chat_session_list.FindById(session_id);
    if (!session || session.user_id !== user_id)
      throw new InvalidOperationError("Session not found");
    return session;
  }

  async function DeleteChatSession({ user_id, session_id }: { user_id: string; session_id: string }) {
    await GetChatSession({ user_id, session_id });
    const { success } = await chat_session_list.Delete(session_id);
    if (success) return { deleted: true };
    throw new InvalidOperationError("Something went wrong.");
  }

  async function AppendChatMessage({
    user_id,
    session_id,
    role,
    content,
    tools,
  }: {
    user_id: string;
    session_id: string;
    role: string;
    content: string;
    /** tool names the assistant ran for this message (persisted for resume context) */
    tools?: string[];
  }) {
    const session = await GetChatSession({ user_id, session_id });
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const message: Record<string, any> = { role, content, created_at: Date.now() };
    if (Array.isArray(tools) && tools.length > 0) message.tools = tools;
    const updates: Record<string, any> = {
      messages: [...messages, message],
    };
    if (role === "user" && (!session.title || session.title === "New chat")) {
      updates.title = content.slice(0, 60);
    }
    const { success } = await chat_session_list.Update({ _id: session_id, ...updates });
    if (success) return { success: true };
    throw new InvalidOperationError("Something went wrong.");
  }

  /* ---------------------------- Engine bug reports ---------------------------- */

  function BugFingerprint(
    category: string,
    title: string,
    description: string,
    severity: string
  ): string {
    return createHash("sha1")
      .update(`${category}|${title.toLowerCase().trim()}|${description.slice(0, 120).toLowerCase()}|${severity}`)
      .digest("hex");
  }

  async function SubmitEngineBug(input: Record<string, any>) {
    const {
      user_id,
      title,
      description,
      category = "engine",
      severity = "medium",
      steps_to_reproduce,
      expected_behavior,
      actual_behavior,
      plan_id,
      session_id,
    } = input;
    if (plan_id && typeof plan_id === "string" && plan_id.length) {
      const plan = await plan_list.FindById(plan_id);
      if (!plan) throw new InvalidPropertyError("invalid: plan_id not found");
    }
    const fingerprint = BugFingerprint(category, title || "", description || "", severity);
    const existing = await bug_report_list.FindOpenByFingerprint(fingerprint);
    if (existing) {
      return {
        status: "duplicate",
        bug_id: existing._id,
        duplicate_of: existing._id,
        existing: {
          severity: existing.severity,
          category: existing.category,
          created_at: existing.created_at,
        },
      };
    }
    const bug = MakeBugReport({
      user_id,
      title,
      description,
      category,
      severity,
      steps_to_reproduce,
      expected_behavior,
      actual_behavior,
      plan_id,
      session_id,
      fingerprint,
    });
    const { success, created } = await bug_report_list.Add(bug);
    if (!success) throw new DbInsertFailedError("Failed to create bug report");
    return { status: "open", bug_id: created._id };
  }

  async function GetEngineBug({ user_id, role, bug_id }: { user_id: string; role?: string; bug_id: string }) {
    const bug = await bug_report_list.FindById(bug_id);
    if (!bug) throw new InvalidOperationError("Bug not found!");
    if (role !== "admin" && String(bug.user_id) !== String(user_id))
      throw new UnAuthorizedAccessToPlan("You can only view your own bug reports");
    return bug;
  }

  async function ListEngineBugs({
    user_id,
    role,
    status,
    severity,
  }: {
    user_id: string;
    role?: string;
    status?: string;
    severity?: string;
  }) {
    const query = { status, severity };
    if (role === "admin") return bug_report_list.FindAll(query);
    return bug_report_list.FindByUser(user_id, query);
  }

  async function ResolveEngineBug(input: Record<string, any>) {
    const { user_id, role, bug_id, resolution_note, reopen } = input;
    const bug = await bug_report_list.FindById(bug_id);
    if (!bug) throw new InvalidOperationError("Bug not found!");
    if (role !== "admin" && String(bug.user_id) !== String(user_id))
      throw new UnAuthorizedAccessToPlan("Only the reporter or an admin can update this bug");
    const { success } = await bug_report_list.Update({
      _id: bug_id,
      status: reopen ? "open" : "resolved",
      ...(reopen ? {} : { resolved_at: Date.now() }),
      ...(resolution_note !== undefined ? { resolution_note } : {}),
    });
    if (!success) throw new DbUpdateFailedError("Failed to update bug report");
    return { status: reopen ? "open" : "resolved", bug_id };
  }

  /* ---------------------------- Engine snapshot ---------------------------- */

  async function PlanSnapshot({ plan, duration = 50 }: { plan: any; duration?: number }) {
    plan = await ReconcileCashflowStore(plan);
    const has_assets = Array.isArray(plan?.asset_list) && plan.asset_list.length > 0;
    const has_tax = !!plan?.tax_settings?.income_tax_enabled;
    if (!has_assets && !has_tax) return ComputePlanSnapshot(plan, duration);
    const tax_rules = await tax_service.rulesForTimestamp(plan.timestamp || Date.now());
    return ComputePlanSnapshot(plan, duration, { tax_rules });
  }

  return {
    Login,
    CreateSessionForUser,
    Signup,
    Logout,
    RefreshSession,
    RevokeAllUserSessions,
    CheckSession,
    ChangePassword,
    InitiateResetPasswordSession,
    ResetForgottenPassword,
    GetUser,
    OnboardUser,
    SetDefaultPlan,
    GetPlan,
    AddPlan,
    UpdatePlan,
    DeletePlan,
    ForkPlan,
    InitiatePlan,
    GetIncome,
    AddIncome,
    UpdateIncome,
    DeleteIncome,
    GetExpense,
    AddExpense,
    UpdateExpense,
    DeleteExpense,
    GetCashflowChanges,
    AddCashflowChange,
    UpdateCashflowChange,
    DeleteCashflowChange,
    GetShareObjects,
    AddShareObject,
    UpdateShareObject,
    OptinShareObject,
    DeleteShareObject,
    GetCommonCollection,
    CreateApiToken,
    ListApiTokens,
    RevokeApiToken,
    CreateChatSession,
    ListChatSessions,
    GetChatSession,
    DeleteChatSession,
    AppendChatMessage,
    SubmitEngineBug,
    ListEngineBugs,
    GetEngineBug,
    ResolveEngineBug,
    PlanSnapshot,
    GetNetWorthStatus: (input: { user_id: string }) => networth_service.GetStatus(input),
    ConnectNetWorth: (input: { user_id: string; redirect_url: string }) =>
      networth_service.Connect(input),
    HandleNetWorthCallback: (input: { state: string; code: string }) =>
      networth_service.HandleCallback(input),
    SyncNetWorth: (input: { user_id: string }) => networth_service.Sync(input),
    DisconnectNetWorth: (input: { user_id: string }) => networth_service.Disconnect(input),
  };
}
