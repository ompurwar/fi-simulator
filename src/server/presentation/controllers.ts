import type { ApplicationLayer } from "../application";
import { InvalidPropertyError } from "../domain/errors";

export interface HttpRequest {
  body: any;
  query: Record<string, any>;
  params: Record<string, any>;
  ip?: string;
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  cookies: Record<string, string>;
  session?: { user_id: string; session_id: string };
}

export interface HttpResponse {
  headers?: Record<string, string>;
  status_code: number;
  body: any;
  cookies?: Record<string, string>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function RequireData(http_request: HttpRequest) {
  if (!http_request.body?.data)
    throw new InvalidPropertyError(
      "request body doesn't contain field 'data'"
    );
}

export function MakeControllers(app: ApplicationLayer) {
  /* ------------------------------ Auth ------------------------------ */

  const Login = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { email, password } = http_request.body.data;
    const session = await app.Login({ email, password });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { status: "success", error: null, data: session },
      cookies: { session_id: session.session_id },
    };
  };

  const IsLoggedIn = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: {}, status: "success", error: null },
    };
  };

  const Signup = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { email, password, first_name, last_name } = http_request.body.data;
    const session = await app.Signup({
      email,
      password,
      first_name,
      last_name,
      src: "std",
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { status: "success", error: null, data: session },
      cookies: { session_id: session.session_id },
    };
  };

  const Logout = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { session_id } = http_request.session!;
    await app.Logout({ session_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: {}, status: "success", error: null },
    };
  };

  const UpdatePassword = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { current_password, new_password } = http_request.body.data;
    const result = await app.ChangePassword({
      user_id,
      current_password,
      new_password,
      mode: "update",
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
      cookies: { session_id: result.session.session_id },
    };
  };

  const InitiateResetPasswordSession = async (
    http_request: HttpRequest
  ): Promise<HttpResponse> => {
    RequireData(http_request);
    const { email } = http_request.body.data;
    await app.InitiateResetPasswordSession({ email });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const ResetForgottenPassword = async (
    http_request: HttpRequest
  ): Promise<HttpResponse> => {
    RequireData(http_request);
    const { session_secret, new_password } = http_request.body.data;
    const result = await app.ResetForgottenPassword({
      session_secret,
      new_password,
    });
    const rtr_obj: HttpResponse = {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
    if (result && result.session && result.session.session_id)
      rtr_obj.cookies = { session_id: result.session.session_id };
    return rtr_obj;
  };

  /* ------------------------------ User ------------------------------ */

  const GetUser = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const user = await app.GetUser({ user_id });
    const _user: any = { ...user };
    delete _user._id;
    delete _user.credentials;
    delete _user.IsValidPassword;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ..._user }, status: "success", error: null },
    };
  };

  const OnboardUser = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    if (!http_request.body.data.ob_params)
      throw new InvalidPropertyError(
        "request data doesn't contain field 'ob_params'"
      );
    const { user_id } = http_request.session!;
    const user = await app.OnboardUser({
      user_id,
      ob_params: http_request.body.data.ob_params,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...user }, status: "success", error: null },
    };
  };

  const SetDefaultPlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { plan_id } = http_request.body.data;
    const { user_id } = http_request.session!;
    await app.SetDefaultPlan({ user_id, plan_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: {}, status: "success", error: null },
    };
  };

  /* ------------------------------ Plan ------------------------------ */

  const AddPlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { title, description, monthly_income, monthly_expense, runway } =
      http_request.body.data;
    const plan_object = app.InitiatePlan({
      user_id,
      title,
      description,
      monthly_income,
      monthly_expense,
      runway,
    });
    const plan = await app.AddPlan(plan_object);
    const new_plan: any = { ...plan };
    delete new_plan.user_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...new_plan }, status: "success", error: null },
    };
  };

  const GetPlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const plan_list = await app.GetPlan({ user_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: plan_list, status: "success", error: null },
    };
  };

  const UpdatePlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const {
      title,
      description,
      account_list,
      cashflow_list,
      cashflow_change_list,
      loan_accounts,
      fund_distribution_percentage,
      _id,
      ...other_info
    } = http_request.body.data;
    await app.UpdatePlan({
      title,
      description,
      cashflow_change_list,
      account_list,
      loan_accounts,
      fund_distribution_percentage,
      cashflow_list,
      user_id,
      _id,
      ...other_info,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const DeletePlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { _id } = http_request.body.data;
    await app.DeletePlan({ id: _id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const ForkPlan = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { title, description, plan_id } = http_request.body.data;
    const forked_plan = await app.ForkPlan({
      user_id,
      title,
      description,
      plan_id,
    });
    const new_plan: any = { ...forked_plan };
    delete new_plan.user_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...new_plan }, status: "success", error: null },
    };
  };

  /* --------------------------- Income/Expense --------------------------- */

  const AddIncome = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { type, frequency, amount, desc, start_month, end_month, plan_id } =
      http_request.body.data;
    const income = await app.AddIncome({
      user_id,
      plan_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
    });
    const new_income: any = { ...income };
    delete new_income.user_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...new_income }, status: "success", error: null },
    };
  };

  const GetIncome = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { plan_id } = http_request.body.data;
    let income_list = await app.GetIncome({ plan_id, user_id });
    income_list = income_list.map((_: any) => {
      const a: any = { ..._ };
      delete a.user_id;
      return a;
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: income_list, status: "success", error: null },
    };
  };

  const UpdateIncome = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { type, frequency, amount, desc, start_month, end_month, plan_id, _id } =
      http_request.body.data;
    await app.UpdateIncome({
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      plan_id,
      user_id,
      _id,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const DeleteIncome = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { _id } = http_request.body.data;
    await app.DeleteIncome({ id: _id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const AddExpense = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { type, frequency, amount, desc, start_month, end_month, plan_id } =
      http_request.body.data;
    const expense = await app.AddExpense({
      user_id,
      plan_id,
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
    });
    const new_expense: any = { ...expense };
    delete new_expense.user_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...new_expense }, status: "success", error: null },
    };
  };

  const GetExpense = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { plan_id } = http_request.body.data;
    let expense_list = await app.GetExpense({ plan_id, user_id });
    expense_list = expense_list.map((_: any) => {
      const a: any = { ..._ };
      delete a.user_id;
      return a;
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: expense_list, status: "success", error: null },
    };
  };

  const UpdateExpense = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { type, frequency, amount, desc, start_month, end_month, plan_id, _id } =
      http_request.body.data;
    await app.UpdateExpense({
      type,
      frequency,
      amount,
      desc,
      start_month,
      end_month,
      plan_id,
      user_id,
      _id,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const DeleteExpense = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { _id } = http_request.body.data;
    await app.DeleteExpense({ id: _id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  /* ------------------------- Cashflow Changes ------------------------- */

  const GetCashflowChanges = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { cashflow_id } = http_request.body.data;
    const list = await app.GetCashflowChanges({ cashflow_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: list || [], status: "success", error: null },
    };
  };

  const AddCashflowChange = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { cashflow_id, change_type, value, category, start_month, end_month, frequency, title, desc } =
      http_request.body.data;
    const created = await app.AddCashflowChange({
      user_id,
      cashflow_id,
      change_type,
      value,
      category,
      start_month,
      end_month,
      frequency,
      title,
      desc,
    });
    const new_obj: any = { ...created };
    delete new_obj.user_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...new_obj }, status: "success", error: null },
    };
  };

  const UpdateCashflowChange = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { _id, change_type, value, category, start_month, end_month, frequency, title, desc } =
      http_request.body.data;
    await app.UpdateCashflowChange({
      _id,
      user_id,
      change_type,
      value,
      category,
      start_month,
      end_month,
      frequency,
      title,
      desc,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const DeleteCashflowChange = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { _id } = http_request.body.data;
    await app.DeleteCashflowChange({ id: _id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  /* ---------------------------- ShareObject ---------------------------- */

  const AddShareObject = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const {
      title,
      description,
      type,
      category,
      promotional_links,
      creator_name,
      img_url,
      plan_ids,
      currency,
      local,
    } = http_request.body.data;
    const result = await app.AddShareObject({
      creator_id: user_id,
      title,
      description,
      type,
      category,
      promotional_links,
      creator_name,
      img_url,
      plan_ids,
      currency,
      local,
    });
    delete result.creator_id;
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...result }, status: "success", error: null },
    };
  };

  const GetShareObject = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { filter_by, ids } = http_request.body.data;
    const share_object_list = await app.GetShareObjects({
      creator_id: user_id,
      share_ids: ids,
      filter_by,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: share_object_list || [], status: "success", error: null },
    };
  };

  const UpdateShareObject = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { _id, title, description, type, category, promotional_links, creator_name, img_url, plan_ids } =
      http_request.body.data;
    await app.UpdateShareObject({
      _id,
      title,
      description,
      type,
      category,
      promotional_links,
      creator_name,
      user_id,
      img_url,
      plan_ids,
    });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  const OptinShareObject = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { share_id } = http_request.body.data;
    const result = await app.OptinShareObject({ user_id, share_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: { ...result }, status: "success", error: null },
    };
  };

  const DeleteShareObject = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { user_id } = http_request.session!;
    const { _id } = http_request.body.data;
    await app.DeleteShareObject({ id: _id, user_id });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: null, status: "success", error: null },
    };
  };

  /* ------------------------- CommonCollection ------------------------- */

  const GetCommonCollection = async (_http_request: HttpRequest): Promise<HttpResponse> => {
    const common_collection = await app.GetCommonCollection();
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: common_collection, status: "success", error: null },
    };
  };

  const PlanSnapshot = async (http_request: HttpRequest): Promise<HttpResponse> => {
    RequireData(http_request);
    const { plan, duration } = http_request.body.data;
    const result = await app.PlanSnapshot({ plan, duration });
    return {
      headers: JSON_HEADERS,
      status_code: 200,
      body: { data: result, status: "success", error: null },
    };
  };

  return {
    Login,
    IsLoggedIn,
    Signup,
    Logout,
    UpdatePassword,
    InitiateResetPasswordSession,
    ResetForgottenPassword,
    GetUser,
    OnboardUser,
    SetDefaultPlan,
    AddPlan,
    GetPlan,
    UpdatePlan,
    DeletePlan,
    ForkPlan,
    AddIncome,
    GetIncome,
    UpdateIncome,
    DeleteIncome,
    AddExpense,
    GetExpense,
    UpdateExpense,
    DeleteExpense,
    GetCashflowChanges,
    AddCashflowChange,
    UpdateCashflowChange,
    DeleteCashflowChange,
    AddShareObject,
    GetShareObject,
    UpdateShareObject,
    OptinShareObject,
    DeleteShareObject,
    GetCommonCollection,
    PlanSnapshot,
  };
}

export type Controllers = ReturnType<typeof MakeControllers>;
