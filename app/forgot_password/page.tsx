"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

function ForgotPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "rst" ? "rst" : "init";
  const rst_ses = searchParams.get("rst_ses") || "";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [new_password, setNewPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleInit() {
    setError("");
    try {
      await api.CreateForgotPasswordSession(email);
      setSent(true);
      setCooldown(30);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
  }

  async function handleReset() {
    setError("");
    if (new_password.length < 8) return setError("Password must be at least 8 characters");
    if (new_password !== confirm_password) return setError("Passwords do not match");
    try {
      await api.ResetForgottenPassword(new_password, rst_ses);
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-50 px-4">
      <Logo className="mb-8 text-4xl" />
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {mode === "init" && !sent && (
          <>
            <h1 className="mb-2 text-xl font-bold text-dark-800">Reset your password</h1>
            <p className="mb-4 text-sm text-dark-500">Enter your email and we'll send you a reset link.</p>
            <input
              className="input-filed"
              placeholder="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
            <Button className="mt-4 w-full" onClick={handleInit} disabled={!email}>
              Update
            </Button>
            <button onClick={() => router.push("/login")} className="mt-4 w-full text-center text-sm text-dark-400 hover:underline">
              Back to login
            </button>
          </>
        )}

        {mode === "init" && sent && (
          <>
            <h1 className="text-xl font-bold text-dark-800">Check your Email</h1>
            <p className="mt-2 text-sm text-dark-500">We've sent a reset link to {email || "your email"}.</p>
            <Button
              variant="neutral"
              className="mt-4 w-full"
              onClick={handleInit}
              disabled={cooldown > 0}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
            </Button>
            <button onClick={() => router.push("/login")} className="mt-4 w-full text-center text-sm text-dark-400 hover:underline">
              Back to login
            </button>
          </>
        )}

        {mode === "rst" && !done && (
          <>
            <h1 className="mb-4 text-xl font-bold text-dark-800">Set a new password</h1>
            <input
              className="input-filed"
              placeholder="New password"
              type="password"
              value={new_password}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              className="input-filed mt-3"
              placeholder="Confirm password"
              type="password"
              value={confirm_password}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
            <Button className="mt-4 w-full" onClick={handleReset}>
              Reset Password
            </Button>
          </>
        )}

        {mode === "rst" && done && (
          <>
            <h1 className="text-xl font-bold text-success-600">Password Reset</h1>
            <p className="mt-2 text-sm text-dark-500">Your password has been updated.</p>
            <Button className="mt-4 w-full" onClick={() => router.push("/login")}>
              Continue
            </Button>
          </>
        )}
      </div>
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
