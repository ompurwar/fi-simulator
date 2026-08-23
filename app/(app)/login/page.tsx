"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore, SetDataToLocalStorage, ClearAllCookie } from "@/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { PlaySound } from "@/lib/sound";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { FireNotification } from "@/store/notifications";

const STAGES = { CAROUSEL: 1, ACTION: 2 };
const IMAGE_COUNT = 5;

const SLIDES = [
  { img: "/login-vector/Business-Plan-bro.svg", title: "Your personal financial system.", sub: "Create a practical financial blueprint in minutes." },
  { img: "/login-vector/Refund-amico.svg", title: "Add Various Income Sources", sub: "Salaries, side income, one time gift etc and their projected increments." },
  { img: "/login-vector/Credit-card-pana.svg", title: "List all your expenses", sub: "Break down your recurring and one time expenses and their projected rise/fall." },
  { img: "/login-vector/Savings-amico.svg", title: "Gauge your savings.", sub: "Get a month by month view of your money across savings, investment and emergency fund." },
  { img: "/login-vector/Audit-rafiki.svg", title: "Analyze, Compare, Refine and Repeat.", sub: "Keep tracking your progress, create and compare different plans and take smart financial decisions." },
];

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sid = searchParams.get("sid");
  const oauth = searchParams.get("oauth");
  const modeParam = searchParams.get("mode");

  const [mode, setMode] = useState<"login" | "signup">(
    modeParam === "signup" ? "signup" : "login"
  );
  const [page_stage, setPageStage] = useState(STAGES.CAROUSEL);
  const [is_desktop, setIsDesktop] = useState(true);
  const [current_image_number, setCurrentImageNumber] = useState(0);
  const [logging_in_with_google, setLoggingInWithGoogle] = useState(false);
  const [logging_in_with_out_google, setLoggingInWithOutGoogle] = useState(false);
  const [values, setValues] = useState({ name: "", email: "", password: "" });

  const commit = useFiPlanStore((s) => s.set_profile);
  const setPlans = useFiPlanStore((s) => s.set_plans);
  const set_common_collection = useFiPlanStore((s) => s.set_common_collection_action);

  useEffect(() => {
    if (sid) SetDataToLocalStorage("sid", sid);
  }, [sid]);

  useEffect(() => {
    if (modeParam === "login" || modeParam === "signup") setMode(modeParam);
  }, [modeParam]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageNumber((n) => (n + 1) % IMAGE_COUNT);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Desktop always shows the action form; mobile shows the carousel first.
  const show_action_stage = is_desktop || page_stage === STAGES.ACTION;

  function ToggleMode() {
    const next = mode === "login" ? "signup" : "login";
    setMode(next);
    router.replace(`/login?mode=${next}`);
  }
  function SetActionStageMode(_mode: "login" | "signup") {
    setPageStage(STAGES.ACTION);
    setMode(_mode);
  }

  const validate_input = useCallback(
    (vals: typeof values, m: string): boolean => {
      if (m === "signup") return !!(vals.email && vals.password && vals.name);
      return !!(vals.email && vals.password);
    },
    []
  );

  async function Login(strategy: "std" | "google") {
    try {
      ClearAllCookie();
      if (strategy === "google") {
        setLoggingInWithGoogle(true);
        PlaySound("access_allowed");
        SetDataToLocalStorage("signup_event_tracked", false);
        setTimeout(() => {
          window.location.href = `/api/oauth/google`;
        }, 500);
      } else {
        if (!validate_input(values, mode)) {
          FireNotification({ title: "Please fill all fields", variant: "warning" });
          return;
        }
        try {
          setLoggingInWithOutGoogle(true);
          await api.Login(values.email, values.password);
          const profile = await api.GetUser();
          const plans = await api.GetMyPLANS();
          const full_name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
          await set_common_collection();
          commit(profile);
          setPlans(plans);

          setLoggingInWithOutGoogle(false);
          PlaySound("access_allowed");
          Track(
            EVENT_TYPES.SIGN_IN.id,
            { $email: profile.email, name: full_name },
            { $email: values.email, name: full_name, last_login_date: new Date().toISOString(), inc: { login_count: 1 } }
          );

          // OAuth MCP sign-in (IndMoney-style): the /login?oauth=<id> flow —
          // after login the server issues the authorization code and redirects
          // back to the MCP client.
          if (oauth) {
            const res = await fetch("/api/mcp/oauth/authorize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              redirect: "manual",
              body: JSON.stringify({ oauth_id: oauth }),
            });
            const location = res.headers.get("location");
            if (location) {
              window.location.href = location;
              return;
            }
          }

          if (!sid) {
            if (profile.ob_params) router.push("/plan");
            else router.push("/onboarding");
          } else {
            router.push(`/link_page?sid=${sid}`);
          }
        } catch (error: any) {
          console.log(error);
          setLoggingInWithOutGoogle(false);
          if (error.code === 401 || error.code === 404) {
            FireNotification({ title: "Login failed", desc: error.message, variant: "danger" });
          }
          if (window.location.pathname !== "/login") router.push("/login");
        }
      }
    } catch (error: any) {
      console.log(error);
      if (error.code === 401) FireNotification({ title: "Invalid Credentials!", variant: "danger" });
    }
  }

  async function Signup() {
    ClearAllCookie();
    if (!validate_input(values, mode)) {
      FireNotification({ title: "Please fill all fields", variant: "warning" });
      return;
    }
    try {
      const { email, password, name } = values;
      setLoggingInWithOutGoogle(true);
      commit(null);
      const [first_name, last_name = ""] = name.split(" ");
      const full_name = name.toLowerCase().trim();
      await api.Signup(email, password, first_name, last_name);
      setLoggingInWithOutGoogle(false);
      Track(
        EVENT_TYPES.SIGN_UP.id,
        { $email: email, name: full_name },
        { $email: email, name: full_name, registration_date: new Date().toISOString() }
      );
      router.push("/onboarding");
    } catch (error: any) {
      setLoggingInWithOutGoogle(false);
      if (error.code === 601) FireNotification({ title: "Email already exists", variant: "danger" });
    }
  }

  const inputClass =
    "appearance-none relative block w-full md:w-[37ch] text-center md:text-start p-5 px-9 shadow-sm border-[1.6px] border-dark-300 placeholder-dark-300 text-dark-300 rounded-[.5rem] focus:outline-none focus:ring-2 focus:ring-dark-300 focus:border-dark-300 focus:shadow-primary-500 bg-dark-100 focus:bg-dark-100 sm:text-sm";

  return (
    <div className="flex justify-center md:-mt-16 md:left-0 md:absolute md:w-[100vw] h-[100vh]">
      <div className="flex transition-all duration-300 mt-20- md:mt-1- md:w-full md:p-3">
        {/* Desktop carousel */}
        <div className="hidden h-full md:flex md:flex-col place-content-center self-center grow w-[35rem] bg-warning-100 rounded-xl md:px-11 md:py-16 gap-6">
          <div className="h-[80vh] grow-0 select-none flex overflow-y-clip rounded-lg snap-x gap-11 snap-mandatory">
            <div className="h-[80%] w-full scroll-mx-6 shrink-0 flex flex-col snap-center self-center snap-always rounded-lg">
              <img
                src={SLIDES[current_image_number].img}
                className="h-[80%] object-contain w-full rounded-lg"
                alt={SLIDES[current_image_number].title}
              />
              <div className="flex flex-col gap-1 mt-auto">
                <div className="text-xl font-semibold text-center uppercase">
                  {SLIDES[current_image_number].title}
                </div>
                <div className="text-center text-dark-400">
                  {SLIDES[current_image_number].sub}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right action panel */}
        <div className="flex flex-col gap-3 justify-evenly backdrop-blur-sm w-[75vw] md:w-[57vw] h-[100vh] md:h-[97vh]">
          <div className="flex flex-col justify-center md:hidden mt-11- md:mt-0 h-[15vh]">
            <Logo className="justify-center text-4xl md:w-fit md:-ml-4" />
          </div>

          {!show_action_stage && (
            <div className="flex flex-col gap-4 md:gap-3 mb-10 h-[80vh] md:hidden">
              <div className="h-[60vh] grow-0 w-[17rem] sm:w-[20rem] flex overflow-x-scroll overflow-y-clip rounded-lg snap-x gap-11 snap-mandatory">
                <div className="h-[80%] w-full scroll-mx-6 shrink-0 flex flex-col snap-center self-center snap-always rounded-lg">
                  <img
                    src={SLIDES[current_image_number].img}
                    className="h-[80%] object-contain w-full rounded-lg"
                    alt={SLIDES[current_image_number].title}
                  />
                  <div className="flex flex-col gap-1 mt-auto">
                    <div className="text-lg font-semibold text-center uppercase">
                      {SLIDES[current_image_number].title}
                    </div>
                    <div className="text-center text-dark-300">
                      {SLIDES[current_image_number].sub}
                    </div>
                  </div>
                </div>
              </div>
              {/* buttons live INSIDE the h-[80vh] container (matches original template) */}
              <div className="flex justify-between w-full gap-6 mt-auto md:justify-center md:gap-8 md:mb-10">
                <button
                  onClick={() => SetActionStageMode("signup")}
                  className={`rounded-[.6rem] px-4 py-2 block grow justify-center border-2 shadow-sm border-dark-500 md:grow-0 md:px-10 md:py-3 ${
                    mode === "signup" ? "bg-primary-400 text-primary-50" : "bg-dark-50 text-dark-500"
                  }`}
                >
                  Sign Up
                </button>
                <button
                  onClick={() => SetActionStageMode("login")}
                  className={`rounded-[.6rem] px-4 py-2 block grow justify-center border-2 shadow-sm border-dark-500 md:grow-0 md:px-10 md:py-3 ${
                    mode === "login" ? "bg-primary-400 text-primary-50" : "bg-dark-50 text-dark-500"
                  }`}
                >
                  Sign In
                </button>
              </div>
            </div>
          )}

          {show_action_stage && (
            <div className="flex flex-col md:flex-row md:min-h-[80vh] md:justify-center md:p-11">
              <form className="flex flex-col gap-4 mb-10 md:gap-3" onSubmit={(e) => e.preventDefault()}>
                <Logo className="self-center hidden text-4xl md:w-fit md:-ml-4 md:flex" />
                <div className="flex flex-col justify-center">
                  <div className="flex justify-center my-2 text-2xl md:font-bold first-letter:uppercase">
                    <div className="flex gap-2 text-dark-700">
                      {mode === "login" ? "Sign into" : "Sign up with "} Fi-Plan
                    </div>
                  </div>
                </div>
                {mode === "signup" && (
                  <input
                    placeholder="Your Name "
                    className={inputClass}
                    name="name"
                    type="text"
                    value={values.name}
                    onChange={(e) => setValues({ ...values, name: e.target.value })}
                  />
                )}
                <input
                  placeholder="Your Email "
                  className={inputClass}
                  name="email"
                  type="text"
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                />
                <input
                  placeholder="Your Password "
                  className={inputClass}
                  name="password"
                  type="password"
                  value={values.password}
                  onChange={(e) => setValues({ ...values, password: e.target.value })}
                />
                <div
                  className="text-sm text-right opacity-50 hover:opacity-100 hover:underline hover:cursor-pointer"
                  onClick={() => router.push("/forgot_password?mode=init")}
                >
                  forgot password?
                </div>
                <button
                  type="button"
                  name="standard-log-signup"
                  onClick={() => (mode === "login" ? Login("std") : Signup())}
                  disabled={logging_in_with_out_google || !validate_input(values, mode)}
                  className="mt-1 rounded-[.6rem] w-[100%] pl-3 pr-6 h-[60px] grid place-content-center border-2 shadow-sm bg-primary-400 disabled:opacity-60 text-dark-50 focus:ring-dark-900 focus:border-dark-400 border-dark-400"
                >
                  <div className="flex h-full text-center justify-center py-2 ml-2 font-medium text-[20px] text-dark-50">
                    {logging_in_with_out_google && (
                      <svg className="self-center w-5 h-5 text-dark-50 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <div className="ml-2 w-fit h-fit">{mode === "login" ? "Login" : "Sign Up"}</div>
                  </div>
                </button>

                <div className="flex justify-center gap-2 place-content-center">
                  <div className="flex justify-center text-sm md:text-xs text-dark-400">
                    <span className="self-center">
                      {mode === "login" ? "Don't have an Account?" : "Already Have an Account?"}
                    </span>
                  </div>
                  <div className="flex self-center justify-center font-bold lowercase cursor-pointer text-lg md:text-xs first-letter:uppercase">
                    <span className="underline text-primary-500" onClick={ToggleMode}>
                      {mode === "login" ? "Sign Up" : "Login"}
                    </span>
                  </div>
                </div>

                <div className="text-center w-[100%] capitalize my-5 flex justify-center">
                  <hr className="h-[1px] border-0 bg-gradient-to-r from-dark-100 via-dark-600 to-dark-100 w-[100px]" />
                </div>

                <button
                  type="button"
                  onClick={() => Login("google")}
                  className="rounded-[.6rem] pl-3 pr-6 h-[60px] grid place-content-center w-[100%] justify-center border-2 shadow-sm bg-dark-50 text-dark-500 focus:ring-dark-900 focus:border-dark-700 border-dark-500"
                >
                  <div className="flex">
                    <div className="grid self-center h-full place-content-center">
                      {!logging_in_with_google && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512" className="h-[25px] inline fill-dark-500">
                          <path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                        </svg>
                      )}
                      {logging_in_with_google && (
                        <svg className="self-center w-5 h-5 text-dark-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                    <div className="grid self-center h-full text-center place-items-center">
                      <p className="ml-1 font-medium text-[20px] whitespace-nowrap text-dark-500">
                        <span>oogle</span> {mode === "login" ? "Login" : "Sign Up"}
                      </p>
                    </div>
                  </div>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <LoginInner />
    </Suspense>
  );
}
