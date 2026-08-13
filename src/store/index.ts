import { create } from "zustand";
import { api, FiPlanServerHttpError } from "@/lib/api";

export interface Plan {
  _id: string;
  user_id?: string;
  title: string;
  description: string;
  category?: "std" | "t-i" | "t-c";
  cashflow_list: any[];
  cashflow_change_list: any[];
  account_list: any[];
  loan_accounts: any[];
  fund_distribution_percentage: any[];
  parent_id?: string | null;
  share_id?: string | null;
  timestamp?: number;
  modified_at?: number;
  [key: string]: any;
}

interface FiPlanState {
  logged_in: boolean;
  is_on_board: boolean;
  ob_params: any;
  profile: any;
  plans: Plan[];
  plan_duration: number;
  currency: string;
  local: string;
  selected_plan_id: string;
  god_plan_entity: any;
  auto_save_enabled: boolean;
  plan_component_state: "open" | "closed";
  plan_synced_map: Record<string, boolean>;
  share_data: any;
  published_templates: any[];
  common_collection: any;
  loading: boolean;

  set_profile: (profile: any) => void;
  set_plans: (plans: Plan[], override?: boolean) => void;
  set_selected_plan_id: (id: string) => void;
  set_default_plan_id: (id: string) => void;
  set_god_plan_entity: (entity: any) => void;
  set_auto_save: (enabled: boolean) => void;
  set_plan_component_state: (state: "open" | "closed") => void;
  set_plan_synced_map: (map: Record<string, boolean>) => void;
  set_share_data: (data: any) => void;
  set_published_templates: (templates: any[], override?: boolean) => void;
  set_common_collection: (collection: any) => void;
  set_currency: (currency: string) => void;
  set_plan_duration: (duration: number) => void;
  set_loading: (loading: boolean) => void;

  sync_plan: (plan_id: string) => Promise<void>;
  refresh_plan_list: () => Promise<void>;
  set_common_collection_action: () => Promise<void>;
  create_plan: (info: any) => Promise<any>;
  fork_plan: (info: any) => Promise<any>;
  update_plan_local: (plan: Plan) => void;
}

export const useFiPlanStore = create<FiPlanState>((set, get) => ({
  logged_in: false,
  is_on_board: false,
  ob_params: false,
  profile: null,
  plans: [],
  plan_duration: 600,
  currency: "",
  local: "en-IN",
  selected_plan_id: "",
  god_plan_entity: {},
  auto_save_enabled: true,
  plan_component_state: "closed",
  plan_synced_map: {},
  share_data: { modal_state: "closed" },
  published_templates: [],
  common_collection: {},
  loading: true,

  set_profile: (profile) =>
    set((state) => ({
      profile,
      selected_plan_id: profile?.default_plan_id || state.selected_plan_id,
    })),

  set_plans: (plans, override = true) =>
    set((state) => ({
      plans: override ? plans : [...state.plans, ...plans],
    })),

  set_selected_plan_id: (selected_plan_id) => set({ selected_plan_id }),
  set_default_plan_id: (default_plan_id) => set((s) => ({ profile: { ...s.profile, default_plan_id } })),
  set_god_plan_entity: (god_plan_entity) => set({ god_plan_entity }),
  set_auto_save: (auto_save_enabled) => set({ auto_save_enabled }),
  set_plan_component_state: (plan_component_state) => set({ plan_component_state }),
  set_plan_synced_map: (plan_synced_map) => set({ plan_synced_map }),
  set_share_data: (share_data) => set({ share_data }),
  set_published_templates: (published_templates, override = true) =>
    set((state) => ({
      published_templates: override
        ? published_templates
        : [...state.published_templates, ...published_templates],
    })),
  set_common_collection: (common_collection) => set({ common_collection }),
  set_currency: (currency) => set({ currency }),
  set_plan_duration: (plan_duration) => set({ plan_duration }),
  set_loading: (loading) => set({ loading }),

  sync_plan: async (plan_id) => {
    const state = get();
    const plan = state.plans.find((p) => p._id === plan_id);
    if (!plan) return;
    try {
      await api.UpdatePlan(plan);
      set((s) => ({
        plan_synced_map: { ...s.plan_synced_map, [plan_id]: true },
      }));
    } catch (e) {
      set((s) => ({
        plan_synced_map: { ...s.plan_synced_map, [plan_id]: false },
      }));
      throw e;
    }
  },

  refresh_plan_list: async () => {
    const plans = await api.GetMyPLANS();
    set({ plans });
  },

  set_common_collection_action: async () => {
    const common_collection = await api.GetCommonCollection();
    set({ common_collection });
  },

  create_plan: async (info) => {
    const plan = await api.CreatePlan(info);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },

  fork_plan: async (info) => {
    const plan = await api.ForkPlan(info.plan_id, info.title, info.description);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },

  update_plan_local: (plan) =>
    set((s) => ({
      plans: s.plans.map((p) => (p._id === plan._id ? { ...p, ...plan } : p)),
      plan_synced_map: { ...s.plan_synced_map, [plan._id]: false },
    })),
}));

/** Helpers for IsLoggedIn / IsOnBoard from localStorage, ported from utilFunction.js. */
export function IsLoggedIn(): boolean {
  return !!localStorage.getItem("ob-data");
}
export function IsOnBoard(): boolean {
  return !!localStorage.getItem("ob-data");
}
export function GetDataFromLocalStorage(key: string) {
  const data = localStorage.getItem(key);
  try {
    if (data) return JSON.parse(data);
  } catch {
    return data;
  }
  return false;
}
export function SetDataToLocalStorage(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    localStorage.setItem(key, data);
  }
}
export function ClearAllCookie() {
  document.cookie.split(";").forEach((c) => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });
}

export { FiPlanServerHttpError };
