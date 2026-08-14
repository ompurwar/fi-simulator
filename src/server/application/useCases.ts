import type {
  CashFlowChangeRepository,
  CashFlowRepository,
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
  MakeCashFlow,
  MakeCashFlowChange,
  MakePlan,
  MakeSession,
  MakeShareObject,
  MakeUser,
  MakePasswordResetSession,
} from "../domain/entities";
import {
  DbInsertFailedError,
  InvalidAuthTokenError,
  InvalidOperationError,
  InvalidPropertyError,
  UnAuthorizedAccessToPlan,
  UniqueConstraintError,
  UserNotFoundByEmailError,
} from "../domain/errors";
import { ComputePlanSnapshot } from "../engine/planSnapshot";

export interface UseCaseDeps {
  user_list: UserRepository;
  session_list: SessionRepository;
  plan_list: PlanTemplateRepository;
  cashflow_list: CashFlowRepository;
  cashflow_change_list: CashFlowChangeRepository;
  share_object_list: ShareObjectRepository;
  password_reset_session_list: PasswordResetSessionRepository;
  common_collection_list: CommonCollectionRepository;
  GenerateHash: (pass: string, salt: string) => string;
  CreateCredentials: (password: string) => { salt: string; hash: string };
  defaultPlanDuration: number;
  sessionTimeoutHours: number;
  pwResetSessionLengthMin: number;
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
  Signup(input: {
    first_name?: string;
    last_name?: string;
    email: string;
    password: string;
    photos?: string[];
    src?: string;
  }): Promise<any>;
  Logout(input: { session_id: string }): Promise<any>;
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
  PlanSnapshot(input: { plan: any; duration?: number }): Promise<any>;
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
    GenerateHash,
    CreateCredentials,
    defaultPlanDuration,
    sessionTimeoutHours,
    pwResetSessionLengthMin,
    clientApplication,
    sendTemplateMail,
  } = deps;

  /* ------------------------------ Auth ------------------------------ */

  async function Login({ email, password }: { email: string; password: string }) {
    if (!IsValidEmail(email))
      throw new InvalidPropertyError(`${email} is not a valid email`);

    let user_being_logging_in = await user_list.FindByEmail(email);
    if (user_being_logging_in.length) {
      let the_user = user_being_logging_in[0];
      if (the_user.IsValidPassword!(password)) {
        let session = MakeSession(
          { user_id: the_user._id.toString() },
          { sessionIdLength: 24, sessionTimeoutHours }
        );
        const { success, created } = await session_list.Add(session);
        if (success) return created;
      } else {
        throw new InvalidOperationError("invalid credentials"); // UnauthorizedAccess
      }
    } else {
      throw new UserNotFoundByEmailError(email);
    }
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
    let user_obj = { first_name, last_name, email, password, photos, src };
    let user_info = MakeUser(user_obj, GenerateHash);
    let user_found = await user_list.FindByEmail(user_info.email);
    if (!user_found.length) {
      const user_add_result = await user_list.Add(user_info);
      if (user_add_result.success) {
        let session = MakeSession(
          { user_id: user_add_result.created._id },
          { sessionIdLength: 24, sessionTimeoutHours }
        );
        const { success, created } = await session_list.Add(session);
        if (success) return created;
      }
    }
    throw new UniqueConstraintError("User already exists.");
  }

  async function Logout({ session_id }: { session_id: string }) {
    await session_list.DeactivateSession(session_id);
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

      let user = await user_list.FindById(user_id!);
      if (user && user.src !== "std")
        throw new InvalidOperationError(
          "this user do not have password based credentials"
        );
      let valid = user!.IsValidPassword!(current_password!);
      if (!valid) throw new InvalidOperationError(user!.email);

      const credentials = CreateCredentials(new_password);
      user_list.Update({ _id: user_id!, credentials });
      session = MakeSession(
        { user_id: user!._id.toString() },
        { sessionIdLength: 24, sessionTimeoutHours }
      );
      const { success, created } = await session_list.Add(session);
      all_okay = true;
    }
    if (mode === "reset_forgotten") {
      if (!session_secret) RequiredParam("session_secret");
      let reset_session = await password_reset_session_list.FindByUserIdAndSecret(
        session_secret!
      );
      if (!reset_session)
        throw new InvalidOperationError("unauthorized session");
      if (reset_session.expires_at <= Date.now())
        throw new InvalidOperationError("Oops! session expired! try again.");
      if (reset_session.used)
        throw new InvalidOperationError("unauthorized session");

      const { user_id: reset_user_id } = reset_session;
      let user = await user_list.FindById(reset_user_id);
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
    let [user] = await user_list.FindByEmail(email);
    if (!user) throw new UserNotFoundByEmailError(email);
    if (user && user.src !== "std")
      throw new InvalidOperationError(
        "this user do not have password based credentials"
      );

    let reset_session = MakePasswordResetSession(
      { user_id: user._id },
      pwResetSessionLengthMin
    );
    await password_reset_session_list.Add(reset_session);
    let link = CreatePasswordResetLink(reset_session.secret);

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
    let user_found = await user_list.FindById(user_id);
    if (user_found) {
      let temp_user: any = { ...user_found };
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
    let result = await user_list.Update({ _id: user_id, ob_params });
    if (result.success) {
      let new_plan = null;
      let user_found = await user_list.FindById(user_id);
      if (user_found) {
        let {
          income,
          monthly_expense,
          runway,
        } = ob_params;
        let plan_obj: Record<string, any> = {
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
          let expense_cashflow = MakeCashFlow({
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
          let income_cashflow = MakeCashFlow({
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

        let emergency_account = MakeAccount({
          title: "Emergency",
          init_balance: runway && monthly_expense ? monthly_expense * runway : 0,
          category: ACCOUNT_CONSTANTS.CATEGORY.EMERGENCY,
          default_investment_priority: 1,
          parent_id: null,
          type: ACCOUNT_CONSTANTS.TYPE.ASSET,
          roi: 3,
        });
        let saving_account = MakeAccount({
          title: "Saving",
          init_balance: 0,
          category: ACCOUNT_CONSTANTS.CATEGORY.SAVING,
          default_investment_priority: 2,
          parent_id: null,
          type: ACCOUNT_CONSTANTS.TYPE.ASSET,
          roi: 5,
        });
        let investment_account = MakeAccount({
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
      let temp_user = { ...user_found };
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
    let plan = await plan_list.FindById(plan_id);
    if (!plan)
      throw new InvalidOperationError(`Sorry invalid plan selected plan_id:${plan_id}`);
    if (plan.user_id.toString() !== user_id)
      throw new InvalidOperationError(`Sorry invalid plan selected plan_id:${plan_id}`);

    let result = await user_list.Update({ _id: user_id, default_plan_id: plan_id });
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
    let { success, created } = await plan_list.Add(plan_object);
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
    let plan_obj: Record<string, any> = {
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
    let { success } = await plan_list.Update(plan_object);
    return success ? { updated: true } : null;
  }

  async function DeletePlan({ id }: { id: string }) {
    let plan = await plan_list.FindById(id);
    if (plan) {
      let { success } = await plan_list.Delete(id);
      if (success) return true;
    }
  }

  async function ForkPlan(input: Record<string, any>) {
    const { plan_id, user_id, title, description, share_id, category } = input;
    let plan_to_be_forked = await plan_list.FindById(plan_id);
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
      category,
    });
    let { success, created } = await plan_list.Add(plan_object);
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
    let plan = await plan_list.FindById(plan_id);
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

    let { success, created } = await cashflow_list.Add(income_object);
    if (!plan.cashflow_list.some((c: any) => c._id === created._id))
      (plan.cashflow_list as any).push(created._id);
    await plan_list.Update({ ...plan });
    if (success) return created;
  }

  async function UpdateIncome(input: Record<string, any>) {
    const { _id, plan_id, user_id, type, frequency, amount, desc, start_month, end_month } = input;
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
    });
    let { updated } = await cashflow_list.Update({
      category: CASHFLOW_CONSTANTS.CATEGORY.INCOME,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
    });
    return updated;
  }

  async function DeleteIncome({ id }: { id: string }) {
    if (typeof id !== "string")
      throw new InvalidPropertyError("id should be of type string");
    if (id.length === 0) throw new InvalidPropertyError("id is required");
    let cashflow_changes = await cashflow_change_list.GetCashflowChangeList({
      cashflow_id: id,
    });
    if (!cashflow_changes.length) {
      let income = await cashflow_list.FindById(id);
      if (income) {
        await plan_list.RemoveCashflowAndAccount({
          _id: income.plan_id,
          cashflow_list: [id],
        });
      }
      let { success } = await cashflow_list.Delete({ _id: id });
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
    let plan = await plan_list.FindById(plan_id);
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

    let { success, created } = await cashflow_list.Add(expense_object);
    if (!plan.cashflow_list.some((c: any) => c._id === created._id))
      (plan.cashflow_list as any).push(created._id);
    await plan_list.Update({ ...plan });
    if (success) return created;
  }

  async function UpdateExpense(input: Record<string, any>) {
    const { _id, plan_id, user_id, type, frequency, amount, desc, start_month, end_month } = input;
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
    });
    let { updated } = await cashflow_list.Update({
      category: CASHFLOW_CONSTANTS.CATEGORY.EXPENSE,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      _id,
    });
    return updated;
  }

  async function DeleteExpense({ id }: { id: string }) {
    if (typeof id !== "string")
      throw new InvalidPropertyError("id should be of type string");
    if (id.length === 0) throw new InvalidPropertyError("id is required");
    let cashflow_changes = await cashflow_change_list.GetCashflowChangeList({
      cashflow_id: id,
    });
    if (!cashflow_changes.length) {
      let expense = await cashflow_list.FindById(id);
      if (expense) {
        await plan_list.RemoveCashflowAndAccount({
          _id: expense.plan_id,
          cashflow_list: [id],
        });
      }
      let { success } = await cashflow_list.Delete({ _id: id });
      if (success) return true;
    }
    throw new InvalidOperationError(
      "cannot delete expense for which cashflow-changes exists"
    );
  }

  /* ------------------------- Cashflow Changes ------------------------- */

  async function GetCashflowChanges(input: Record<string, any>) {
    return await cashflow_change_list.GetCashflowChangeList(input);
  }

  async function AddCashflowChange(input: Record<string, any>) {
    const { user_id, category, change_type, value, cashflow_id } = input;
    const cashflow_change_object = MakeCashFlowChange({
      category,
      user_id,
      change_type,
      cashflow_id,
      value,
      active: true,
      ...input,
    });
    let cashflow = await cashflow_list.FindById(cashflow_id);
    if (cashflow) {
      let { success, created } = await cashflow_change_list.Add(cashflow_change_object);
      if (success) return created;
    }
    throw new InvalidOperationError(
      "assign of cashflow-changes to non existing cashflow"
    );
  }

  async function UpdateCashflowChange(input: Record<string, any>) {
    const { _id, user_id, category, change_type, value } = input;
    MakeCashFlowChange({
      user_id,
      category,
      change_type,
      value,
      active: true,
      ...input,
    });
    let { updated } = await cashflow_change_list.Update({
      _id,
      category,
      change_type,
      value,
    });
    return updated;
  }

  async function DeleteCashflowChange({ id }: { id: string }) {
    let { success } = await cashflow_change_list.Delete({ _id: id });
    if (success) return true;
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

    let { success, created } = await share_object_list.Add(share_object);
    let map_for_given_plan_ids_to_cloned_plans: Record<string, any> = {};

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
    let temp_share_object = {
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
    let _object = await share_object_list.FindById({ share_ids: [_id] });
    if (_object && _object.creator_id !== user_id)
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
    let { success } = await share_object_list.Update(share_object);
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
    let share_object = await share_object_list.FindById({
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
    let share_object = await share_object_list.FindById({ share_ids: [id] });
    if (share_object) {
      if (share_object.creator_id !== user_id)
        throw new InvalidOperationError("Un authorized access to the share_object");
      let { success } = await share_object_list.Delete(id);
      if (success) return true;
    }
  }

  /* ------------------------- CommonCollection ------------------------- */

  async function GetCommonCollection() {
    let common_collection = await common_collection_list.GetCommonCollectionList();
    if (common_collection) return common_collection;
    return {};
  }

  /* ---------------------------- Engine snapshot ---------------------------- */

  async function PlanSnapshot({ plan, duration = 50 }: { plan: any; duration?: number }) {
    return ComputePlanSnapshot(plan, duration);
  }

  return {
    Login,
    Signup,
    Logout,
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
    PlanSnapshot,
  };
}
