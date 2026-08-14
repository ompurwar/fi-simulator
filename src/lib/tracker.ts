"use client";

import mixpanel from "mixpanel-browser";

/** Port of src/tracker/tracker.js — Mixpanel + GA4 + Meta Pixel, gated on production. */

let TOKEN = "";
const DEV_TOKEN = "c7762ddf7c3c01a14c7dcd6352dada64";
const PROD_TOKEN = "b18c53aed7d5b2f40b4496e9dc16ce0f";
const GA4_ID = "G-PJRSSJL6NS";
const META_PIXEL_ID = "552842670124836";

export function InitiateTracker(NODE_ENV: string) {
  if (typeof window === "undefined") return;
  let debug = true;
  if (NODE_ENV === "production") {
    TOKEN = PROD_TOKEN;
    debug = false;
  }
  if (NODE_ENV === "development") {
    TOKEN = DEV_TOKEN;
  }
  mixpanel.init(TOKEN, { debug, ignore_dnt: true } as any);

  try {
    if (NODE_ENV === "production") {
      (window as any).dataLayer = (window as any).dataLayer || [];
      function gtag(...args: any[]) {
        (window as any).dataLayer.push(args);
      }
      gtag("js", new Date());
      gtag("config", GA4_ID);

      try {
        // Meta Pixel
        const f: any = window;
        const b: any = document;
        const e: any = "script";
        const v = "https://connect.facebook.net/en_US/fbevents.js";
        if (!f.fbq) {
          const n: any = (f.fbq = function (...args: any[]) {
            n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
          });
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = true;
          n.version = "2.0";
          n.queue = [];
          const t = b.createElement(e);
          t.async = true;
          t.src = v;
          const s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        }
        f.fbq("init", META_PIXEL_ID);
        f.fbq("track", "PageView");
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
}

function CountPropsInObj(obj: Record<string, any> = {}): number {
  let prop_count = 0;
  for (const prop in obj) {
    if (Object.hasOwnProperty.call(obj, prop)) prop_count++;
  }
  return prop_count;
}

export const EVENT_TYPES: Record<string, any> = {
  SIGN_IN: { id: "SIGN_IN", title: "Sign In", type: "s", identity: "i", event_parameters: { $email: "" }, profile_parameters: { last_login_date: "", inc: { login_count: 1 } } },
  SIGN_UP: { id: "SIGN_UP", title: "Sign Up", type: "o", identity: "i", event_parameters: { $name: "", $email: "", registration_date: "" }, profile_parameters: { $name: "", $email: "", registration_date: "" } },
  COMPLETED_ONBOARDING: { id: "COMPLETED_ONBOARDING", title: "Completed Onboarding", type: "o", identity: "i", event_parameters: { currency: "" }, profile_parameters: { currency: "" } },
  PLAN_CREATED: { id: "PLAN_CREATED", title: "Plan Created", type: "s", identity: null, event_parameters: { plan_title: "", mode: "copy|new" }, profile_parameters: { inc: { plan_count: 1 } } },
  PLAN_UPDATED: { id: "PLAN_UPDATED", title: "Plan Updated", type: "s", identity: null, event_parameters: { plan_id: "" }, profile_parameters: {} },
  COMPARE: { id: "COMPARE", title: "Compare", type: "s", identity: null, event_parameters: { plan_ids: [] }, profile_parameters: {} },
  TEMPLATE_SHARED: { id: "TEMPLATE_SHARED", title: "Template Shared", type: "s", identity: null, event_parameters: { category: "t-i|t-c", Template_ids: [], share_id: "", title: "", desc: "" }, profile_parameters: { inc: { template_shared_count: 1 } } },
  TEMPLATE_BOARDED: { id: "TEMPLATE_BOARDED", title: "Template Boarded", type: "s", identity: null, event_parameters: { category: "t-i|t-c", plan_ids: [], share_id: "", title: "", desc: "" }, profile_parameters: { inc: { template_boarded_count: 1, plan_count: 1 } } },
  PAGE_VISIT: { id: "PAGE_VISIT", title: "Page Visit", type: "s", identity: null, event_parameters: { url: "" }, profile_parameters: {} },
  PLAN_SWITCHED: { id: "PLAN_SWITCHED", title: "Plan Switched", type: "s", identity: null, event_parameters: { from: "", to: "" }, profile_parameters: { active_plan: "", active_plan_id: "", inc: { plan_switched_count: 1 } } },
  LOAN_ADDED: { id: "LOAN_ADDED", title: "Loan Added", type: "s", identity: null, event_parameters: {}, profile_parameters: {} },
  LOAN_REMOVED: { id: "LOAN_REMOVED", title: "Loan Removed", type: "s", identity: null, event_parameters: {}, profile_parameters: {} },
  CASHFLOW_ADDED: { id: "CASHFLOW_ADDED", title: "Cashflow Added", type: "s", identity: null, event_parameters: { category: "i|e" }, profile_parameters: {} },
  CASHFLOW_REMOVED: { id: "CASHFLOW_REMOVED", title: "Cashflow Removed", type: "s", identity: null, event_parameters: { category: "i|e" }, profile_parameters: {} },
  ADD_PLAN_TO_COMPARE: { id: "ADD_PLAN_TO_COMPARE", title: "Add plan to compare", type: "s", identity: null, event_parameters: {}, profile_parameters: {} },
};

export function Track(event_id: string, event_parameters: any, profile_parameters: any) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;

  try {
    const event_configuration = EVENT_TYPES[event_id];
    if (!event_configuration) return;

    if (event_configuration.identity === "i") {
      if (!event_parameters || !event_parameters.$email) return;
      mixpanel.identify(event_parameters.$email.toLowerCase());
      mixpanel.register_once({ distinct_id: event_parameters.$email.toLowerCase() });
    }

    if (event_parameters === undefined) return;
    mixpanel.track(event_configuration.title, event_parameters);

    if (profile_parameters && CountPropsInObj(profile_parameters)) {
      const inc = profile_parameters.inc;
      const people_params = { ...profile_parameters };
      delete people_params.inc;
      mixpanel.people.set(people_params);
      if (inc)
        for (const property in inc) {
          if (Object.hasOwnProperty.call(inc, property)) {
            mixpanel.people.increment(property, inc[property]);
          }
        }
    }
  } catch {
    // Analytics must never break the app flow.
    /* noop */
  }
}
