/** Frontend API client — port of fi_plan_http_wrapper + backend_com. */

export class FiPlanServerHttpError extends Error {
  code?: number;
  constructor(message: string, error?: { code?: number; msg?: string }) {
    super(error?.msg || message);
    this.name = "FiPlanServerHttpError";
    this.code = error?.code;
  }
}

const ENDPOINTS = {
  GET_COMMON_COLLECTION: "/get/common_collection",
  GET_USER_PROFILE: "/user/get/profile",
  SET_DEFAULT_PLAN: "/user/set_default_plan",
  ONBOARD_USER: "/user/onboard",
  LOGIN: "/login",
  LOGOUT: "/logout",
  SIGNUP: "/signup",
  CHECK_SESSION: "/check/session",
  UPDATE_PASSWORD: "/password/update",
  CREATE_FORGOT_PASSWORD_SESSION: "/password_reset_session/create",
  RESET_FORGOTTEN_PASSWORD: "/reset_forgotten_password",
  GET_PLAN: "/get/plan",
  ADD_PLAN: "/plan/add",
  UPDATE_PLAN: "/plan/update",
  DELETE_PLAN: "/plan/delete",
  FORK_PLAN: "/plan/fork",
  GET_PUBLIC_SHARE_OBJECT: "/get/share_object",
  GET_MY_SHARE_OBJECT: "/get/share_object_details",
  CREATE_SHARE_OBJECT: "/share_object/create",
  OPTIN_SHARE_OBJECT: "/share_object/optin",
  DELETE_SHARE_OBJECT: "/share_object/delete",
  PLAN_SNAPSHOT: "/engine/plan_snapshot",
  NETWORTH_STATUS: "/networth/status",
  NETWORTH_CONNECT: "/networth/connect",
  NETWORTH_SYNC: "/networth/sync",
  NETWORTH_DISCONNECT: "/networth/disconnect",
  API_TOKEN_CREATE: "/api_token/create",
  API_TOKEN_LIST: "/api_token/list",
  API_TOKEN_REVOKE: "/api_token/revoke",
  ASSISTANT_CHAT: "/assistant/chat",
  CHAT_SESSION_CREATE: "/chat_session/create",
  CHAT_SESSION_LIST: "/chat_session/list",
  CHAT_SESSION_GET: "/chat_session/get",
  CHAT_SESSION_DELETE: "/chat_session/delete",
};

export { ENDPOINTS };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

/** Absolute base URL of the backend (public origin + path), for building callback URLs. */
export const API_BASE_URL = API_BASE.startsWith("http")
  ? API_BASE.replace(/\/+$/, "")
  : null;

async function Post<T = any>(url: string, data: any): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
  } catch (e) {
    throw new FiPlanServerHttpError("network error", { code: 0 });
  }
  const json = await response.json().catch(() => ({}));
  if (json.status === "success") return json.data as T;
  throw new FiPlanServerHttpError("", json.error || {});
}

export const api = {
  /* ------- user ------- */
  GetUser: () => Post(ENDPOINTS.GET_USER_PROFILE, { data: {} }),
  Login: (email: string, password: string) => Post(ENDPOINTS.LOGIN, { data: { email, password } }),
  Signup: (email: string, password: string, first_name: string, last_name: string) =>
    Post(ENDPOINTS.SIGNUP, { data: { email, password, first_name, last_name } }),
  Logout: () => Post(ENDPOINTS.LOGOUT, { data: {} }),
  IsLoggedIn: () => Post(ENDPOINTS.CHECK_SESSION, { data: {} }),
  UpdatePassword: (current_password: string, new_password: string) =>
    Post(ENDPOINTS.UPDATE_PASSWORD, { data: { current_password, new_password } }),
  CreateForgotPasswordSession: (email: string) =>
    Post(ENDPOINTS.CREATE_FORGOT_PASSWORD_SESSION, { data: { email } }),
  ResetForgottenPassword: (new_password: string, session_secret: string) =>
    Post(ENDPOINTS.RESET_FORGOTTEN_PASSWORD, { data: { new_password, session_secret } }),
  OnboardUser: (ob_params: any) => Post(ENDPOINTS.ONBOARD_USER, { data: { ob_params } }),
  SetDefaultPlan: (plan_id: string) => Post(ENDPOINTS.SET_DEFAULT_PLAN, { data: { plan_id } }),

  /* ------- plans ------- */
  GetMyPLANS: () => Post(ENDPOINTS.GET_PLAN, { data: {} }),
  UpdatePlan: (plan_info: any) => {
    const { user_id, status, ...rest } = plan_info;
    return Post(ENDPOINTS.UPDATE_PLAN, { data: rest });
  },
  DeletePlan: (_id: string) => Post(ENDPOINTS.DELETE_PLAN, { data: { _id } }),
  CreatePlan: (info: { title: string; description: string; monthly_income: number; monthly_expense: number; runway: number }) =>
    Post(ENDPOINTS.ADD_PLAN, { data: info }),
  ForkPlan: (plan_id: string, title: string, description: string) =>
    Post(ENDPOINTS.FORK_PLAN, { data: { plan_id, title, description } }),

  /* ------- share object ------- */
  GetTrendingShareObjects: () => Post(ENDPOINTS.GET_MY_SHARE_OBJECT, { data: { filter_by: "popularity" } }),
  GetMyShareObjects: () => Post(ENDPOINTS.GET_MY_SHARE_OBJECT, { data: { filter_by: "creator_id" } }),
  GetPublicShareObjects: (share_ids: string[]) =>
    Post(ENDPOINTS.GET_PUBLIC_SHARE_OBJECT, { data: { ids: share_ids, filter_by: "share_id" } }),
  CreateShareObject: (info: any) => Post(ENDPOINTS.CREATE_SHARE_OBJECT, { data: info }),
  OptinShareObject: (share_id: string) => Post(ENDPOINTS.OPTIN_SHARE_OBJECT, { data: { share_id } }),
  DeleteShareObject: (_id: string) => Post(ENDPOINTS.DELETE_SHARE_OBJECT, { data: { _id } }),

  /* ------- common ------- */
  GetCommonCollection: () => Post(ENDPOINTS.GET_COMMON_COLLECTION, { data: {} }),

  /* ------- engine ------- */
  PlanSnapshot: (plan: any, duration?: number) =>
    Post(ENDPOINTS.PLAN_SNAPSHOT, { data: { plan, duration } }),

  /* ------- net worth ------- */
  GetNetWorthStatus: () => Post(ENDPOINTS.NETWORTH_STATUS, { data: {} }),
  ConnectNetWorth: (redirect_url: string) =>
    Post(ENDPOINTS.NETWORTH_CONNECT, { data: { redirect_url } }),
  SyncNetWorth: () => Post(ENDPOINTS.NETWORTH_SYNC, { data: {} }),
  DisconnectNetWorth: () => Post(ENDPOINTS.NETWORTH_DISCONNECT, { data: {} }),

  /* ------- api tokens ------- */
  CreateApiToken: (name: string) => Post(ENDPOINTS.API_TOKEN_CREATE, { data: { name } }),
  ListApiTokens: () => Post(ENDPOINTS.API_TOKEN_LIST, { data: {} }),
  RevokeApiToken: (token_id: string) => Post(ENDPOINTS.API_TOKEN_REVOKE, { data: { token_id } }),

  /* ------- assistant ------- */
  /** Raw SSE fetch for the assistant — returns the Response so the caller can read res.body. */
  ChatAssistant: async (messages: AssistantMessage[], session_id?: string): Promise<Response> => {
    try {
      return await fetch(`${API_BASE}${ENDPOINTS.ASSISTANT_CHAT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...(session_id ? { session_id } : {}), messages }),
      });
    } catch {
      throw new FiPlanServerHttpError("network error", { code: 0 });
    }
  },

  /* ------- chat sessions ------- */
  CreateChatSession: (title?: string) =>
    Post<{ session_id: string }>(ENDPOINTS.CHAT_SESSION_CREATE, { data: { title } }),
  ListChatSessions: () => Post<ChatSessionSummary[]>(ENDPOINTS.CHAT_SESSION_LIST, { data: {} }),
  GetChatSession: (session_id: string) =>
    Post<{ session: ChatSessionDetail }>(ENDPOINTS.CHAT_SESSION_GET, { data: { session_id } }),
  DeleteChatSession: (session_id: string) =>
    Post<{ deleted: boolean }>(ENDPOINTS.CHAT_SESSION_DELETE, { data: { session_id } }),
};

export interface ApiToken {
  _id: string;
  name: string;
  status: string;
  created_at: number;
  last_used_at?: number | null;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSessionSummary {
  _id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export interface ChatSessionMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: number;
}

export interface ChatSessionDetail {
  _id: string;
  title: string;
  updated_at: number;
  messages: ChatSessionMessage[];
}

export default api;
