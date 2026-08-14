"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faEnvelope, faCircleCheck, faArrowLeft } from "@fortawesome/free-solid-svg-icons";

function ForgotPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "rst" ? "rst" : "init";
  const rst_ses = searchParams.get("rst_ses") || "";

  const [email, setEmail] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");
  const [stage, setStage] = useState(mode === "init" ? "input-email" : "set-password");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function fmtTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  async function handleInit() {
    setError("");
    if (!email) return;
    try {
      setBusy(true);
      await api.CreateForgotPasswordSession(email);
      setStage("email-sent");
      setCooldown(30);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setError("");
    if (new_password.length < 8) return setError("Password must be at least 8 characters");
    if (new_password !== confirm_password) return setError("Passwords do not match");
    try {
      setBusy(true);
      await api.ResetForgottenPassword(new_password, rst_ses);
      setStage("set-password-done");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function BackToLogin() {
    router.push("/login");
  }

  const inputCls =
    "px-3 py-[.25rem] border-[1.6px] rounded-[.5rem] shadow-sm w-full placeholder-dark-300 placeholder:text-[1rem] text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none";

  return (
    <div className="flex h-screen justify-center gap-2">
      {mode === "init" && (
        <form className="mt-32 flex h-full w-full flex-col items-center gap-3 px-3 md:w-1/4 md:px-0">
          <div className="mb-2 flex text-4xl font-medium">
            <div className="rounded-full bg-primary-100 p-3">
              <div className="grid h-[2.5ch] w-[2.5ch] place-content-center rounded-full bg-primary-200 p-1">
                {stage === "input-email" ? (
                  <FontAwesomeIcon icon={faKey} className="text-primary-500" />
                ) : (
                  <FontAwesomeIcon icon={faEnvelope} className="text-primary-500" />
                )}
              </div>
            </div>
          </div>

          <div className="mb-2 flex text-2xl font-semibold">
            {stage === "input-email" ? "Forgot password?" : "Check your Email"}
          </div>

          <div className="mb-2 flex text-center text-base font-semibold">
            {stage === "input-email" ? (
              <div className="opacity-50">No worries, will send you a reset link.</div>
            ) : (
              <div className="flex flex-col">
                <div className="opacity-50">We sent a password reset link to </div>
                <div className="font-semibold text-dark-500">{email}</div>
              </div>
            )}
          </div>

          <div className="w-full" style={{ display: stage === "input-email" ? "block" : "none" }}>
            <span className="text-sm font-bold text-dark-400">Email </span>
            <input
              type="text"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>

          {stage === "input-email" && (
            <Button type="submit" className="w-full px-4 py-2" variant="primary" sub_variant="solid" onClick={handleInit} disabled={!email || busy}>
              Update
              {busy ? (
                <svg className="mr-3 -ml-1 h-5 w-5 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FontAwesomeIcon icon={faKey} className="self-center" />
              )}
            </Button>
          )}

          {stage === "email-sent" && (
            <div className="flex">
              <div className="flex w-fit flex-col items-center px-4 py-1 text-xs font-semibold">
                Did not received the email?
                <span className="cursor-pointer font-semibold uppercase text-primary-500 underline" onClick={handleInit}>
                  <span className={cooldown > 0 ? "opacity-30" : ""}>Resend</span>
                  {cooldown > 0 && (
                    <>
                      <span className={cooldown > 0 ? "opacity-30" : ""}> in</span>
                      <span className="text-danger-500">{fmtTime(cooldown)}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="flex">
            <div className="w-fit cursor-pointer px-4 py-1 text-base font-semibold opacity-50 hover:cursor-pointer" onClick={BackToLogin}>
              <FontAwesomeIcon icon={faArrowLeft} className="self-center" /> Back to login
            </div>
          </div>
        </form>
      )}

      {mode === "rst" && (
        <form className="mt-32 flex h-full w-full flex-col items-center gap-3 px-3 md:w-1/4 md:px-0">
          <div className="mb-2 flex text-4xl font-medium">
            <div className="rounded-full bg-primary-100 p-3">
              <div className="grid h-[2.5ch] w-[2.5ch] place-content-center rounded-full bg-primary-200 p-1">
                {stage === "set-password" ? (
                  <FontAwesomeIcon icon={faKey} className="text-primary-500" />
                ) : (
                  <FontAwesomeIcon icon={faCircleCheck} className="text-primary-500" />
                )}
              </div>
            </div>
          </div>

          <div className="mb-2 flex text-2xl font-semibold">
            {stage === "set-password" ? <div className="text-center">Set new password</div> : <div className="text-center">Password Reset</div>}
          </div>

          <div className="mb-2 flex flex-col text-base font-semibold opacity-50">
            {stage === "set-password-done" && (
              <>
                <div className="text-center">Your password has been successfully reset.</div>
                <div className="text-center">Click below to login</div>
              </>
            )}
          </div>

          <div className="w-full" style={{ display: stage === "set-password" ? "block" : "none" }}>
            <span className="text-sm font-bold text-dark-400">New Password </span>
            <input type="text" placeholder="Enter New Password" value={new_password} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
          </div>

          <div className="w-full" style={{ display: stage === "set-password" ? "block" : "none" }}>
            <span className="text-sm font-bold text-dark-400">Confirm Password </span>
            <input type="text" placeholder="Confirm password" value={confirm_password} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
          </div>

          {error && <p className="text-xs text-danger-500">{error}</p>}

          {stage === "set-password" && (
            <Button type="submit" className="w-full px-4 py-2" variant="primary" sub_variant="solid" onClick={handleReset} disabled={busy}>
              Reset Password
              {busy ? (
                <svg className="mr-3 -ml-1 h-5 w-5 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FontAwesomeIcon icon={faKey} className="self-center" />
              )}
            </Button>
          )}

          {stage === "set-password-done" && (
            <Button type="submit" className="w-full px-4 py-2" variant="primary" sub_variant="solid" onClick={BackToLogin}>
              Continue
            </Button>
          )}

          <div className="flex">
            <div className="w-fit cursor-pointer px-4 py-1 text-base font-semibold opacity-50 hover:cursor-pointer" onClick={BackToLogin}>
              <FontAwesomeIcon icon={faArrowLeft} className="self-center" /> Back to login
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
