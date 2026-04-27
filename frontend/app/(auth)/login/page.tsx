"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  Smartphone,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup";
type AccountType = "B2C" | "B2B" | null;
type ErrorField = "name" | "email" | "password" | "accountType" | "general";
type ErrorState = Partial<Record<ErrorField, string>>;

const OTP_FLOW = [
  {
    title: "OTP requested",
    detail: "MSISDN: +1 *** *** 1842",
  },
  {
    title: "Primary route delivered",
    detail: "Provider latency: 1.2s",
  },
  {
    title: "Fallback monitor active",
    detail: "Backup SLA: 2.0s",
  },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-11 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-brand-cyan focus:ring-3 focus:ring-brand-cyan/20";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");
  const [activeOtpStep, setActiveOtpStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<ErrorState>({});

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [signupData, setSignupData] = useState({
    fullName: "",
    email: "",
    password: "",
    accountType: null as AccountType,
  });

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveOtpStep((prev) => (prev + 1) % OTP_FLOW.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, []);

  const formTitle = useMemo(
    () => (mode === "login" ? "Welcome back" : "Create your SMSVIBES account"),
    [mode],
  );

  const clearFieldError = (field: ErrorField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateForm = () => {
    const nextErrors: ErrorState = {};

    if (mode === "signup") {
      if (!signupData.fullName.trim()) {
        nextErrors.name = "Full name is required.";
      } else if (signupData.fullName.trim().length < 2) {
        nextErrors.name = "Please enter your complete name.";
      }

      if (!signupData.email.trim()) {
        nextErrors.email = "Email is required.";
      } else if (!emailRegex.test(signupData.email.trim())) {
        nextErrors.email = "Enter a valid email address.";
      }

      if (!signupData.password.trim()) {
        nextErrors.password = "Password is required.";
      } else if (signupData.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }

      if (!signupData.accountType) {
        nextErrors.accountType = "Select an account type to continue.";
      }
    }

    if (mode === "login") {
      if (!loginData.email.trim()) {
        nextErrors.email = "Email is required.";
      } else if (!emailRegex.test(loginData.email.trim())) {
        nextErrors.email = "Enter a valid email address.";
      }

      if (!loginData.password.trim()) {
        nextErrors.password = "Password is required.";
      }
    }

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validateForm();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);

    const endpoint =
      mode === "login"
        ? "https://api.smsvibes.com/api/v1/auth/login"
        : "https://api.smsvibes.com/api/v1/auth/signup";

    const payload =
      mode === "login"
        ? {
            email: loginData.email.trim(),
            password: loginData.password,
          }
        : {
            fullName: signupData.fullName.trim(),
            email: signupData.email.trim(),
            password: signupData.password,
            accountType: signupData.accountType,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Authentication failed. Please try again.";
        try {
          const data = (await response.json()) as { message?: string };
          if (data?.message) message = data.message;
        } catch {
          // Keep default message when backend returns non-JSON.
        }
        setErrors({ general: message });
        return;
      }

      router.push("/dashboard");
    } catch {
      setErrors({
        general:
          "We could not connect to the authentication service. Please retry.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (mode === "signup" && !signupData.accountType) {
      setErrors((prev) => ({
        ...prev,
        accountType: "Select an account type before continuing with Google.",
      }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next.general;
      return next;
    });

    setIsGoogleLoading(true);

    try {
      const response = await fetch(
        "https://api.smsvibes.com/api/v1/auth/google/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountType: mode === "signup" ? signupData.accountType : undefined,
          }),
        },
      );

      if (!response.ok) {
        setErrors({
          general: "Google sign-in could not be started. Please try again.",
        });
        return;
      }

      router.push("/dashboard");
    } catch {
      setErrors({
        general: "Google sign-in is temporarily unavailable. Please retry.",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-[#0F172A] p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-24 h-56 w-56 rounded-full bg-brand-cyan/10 blur-3xl" />
            <div className="absolute bottom-16 right-8 h-72 w-72 rounded-full bg-brand-indigo/50 blur-3xl" />
          </div>

          <div className="relative">
            <p className="inline-flex items-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs font-medium text-brand-cyan">
              Multi-provider OTP reliability
            </p>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight text-white">
              SMS
              <span className="text-brand-cyan">VIBES</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
              Deliver OTP at scale with intelligent provider fallback, delivery
              telemetry, and route failover designed for zero-friction checkout.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="relative mt-14 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-2xl shadow-brand-indigo/30 backdrop-blur"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <ShieldCheck className="size-4 text-brand-cyan" />
                OTP Delivery Status
              </div>
              <span className="font-mono text-xs text-slate-400">LIVE</span>
            </div>

            <div className="mt-5 space-y-3">
              {OTP_FLOW.map((step, index) => {
                const isPast = index < activeOtpStep;
                const isActive = index === activeOtpStep;

                return (
                  <motion.div
                    key={step.title}
                    layout
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3 py-2",
                      isActive
                        ? "border-brand-cyan/60 bg-brand-cyan/10"
                        : "border-slate-700 bg-slate-900/80",
                    )}
                  >
                    <div className="mt-0.5">
                      {isPast ? (
                        <CheckCircle2 className="size-4 text-brand-cyan" />
                      ) : (
                        <motion.div
                          animate={{
                            scale: isActive ? [1, 1.2, 1] : 1,
                            opacity: isActive ? [0.6, 1, 0.6] : 0.5,
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: isActive ? Number.POSITIVE_INFINITY : 0,
                            ease: "easeInOut",
                          }}
                          className={cn(
                            "size-4 rounded-full border",
                            isActive
                              ? "border-brand-cyan bg-brand-cyan/40"
                              : "border-slate-600 bg-slate-800",
                          )}
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-100">
                        {step.title}
                      </p>
                      <p className="font-mono text-xs text-slate-400">
                        {step.detail}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2">
                <p className="font-mono text-[11px] text-slate-400">SLA</p>
                <p className="text-sm font-semibold text-brand-cyan">99.97%</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2">
                <p className="font-mono text-[11px] text-slate-400">P95</p>
                <p className="text-sm font-semibold text-white">1.4s</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2">
                <p className="font-mono text-[11px] text-slate-400">Retry</p>
                <p className="text-sm font-semibold text-brand-amber">Active</p>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:bg-slate-950">
          <div className="w-full max-w-lg">
            <div className="mb-8 text-center lg:hidden">
              <p className="text-3xl font-semibold tracking-tight text-white">
                SMS<span className="text-brand-cyan">VIBES</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">Secure OTP Platform</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 shadow-xl shadow-black/20 backdrop-blur sm:p-8">
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-2 rounded-xl bg-slate-800/80 p-1">
                  {(["login", "signup"] as const).map((item) => {
                    const active = mode === item;

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setMode(item);
                          setErrors({});
                        }}
                        className={cn(
                          "relative rounded-lg px-3 py-2 text-sm font-medium transition",
                          active ? "text-white" : "text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="auth-mode-pill"
                            className="absolute inset-0 -z-10 rounded-lg bg-brand-indigo"
                            transition={{
                              type: "spring",
                              stiffness: 360,
                              damping: 28,
                            }}
                          />
                        )}
                        {item === "login" ? "Login" : "Signup"}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <h2 className="text-2xl font-semibold text-white">{formTitle}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {mode === "login"
                      ? "Sign in to manage routes, pricing, and delivery analytics."
                      : "Set up your account and start sending OTP instantly."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isGoogleLoading || isSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8a6 6 0 1 1 0-12c2.2 0 3.6.9 4.5 1.8l3-2.9C17.8 3 15.1 2 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.9 0-.7-.1-1.3-.2-1.9H12Z"
                  />
                </svg>
                {isGoogleLoading ? "Connecting..." : "Continue with Google"}
              </button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-800" />
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  or
                </span>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.form
                  key={mode}
                  initial={{
                    opacity: 0,
                    x: mode === "login" ? -14 : 14,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: mode === "login" ? 14 : -14,
                  }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  {mode === "signup" && (
                    <div>
                      <label htmlFor="full-name" className="text-sm text-slate-300">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                        <input
                          id="full-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Ahsan Khan"
                          value={signupData.fullName}
                          onChange={(event) => {
                            setSignupData((prev) => ({
                              ...prev,
                              fullName: event.target.value,
                            }));
                            clearFieldError("name");
                          }}
                          className={cn(
                            inputClassName,
                            errors.name &&
                              "border-red-500/70 focus:border-red-500 focus:ring-red-500/20",
                          )}
                        />
                      </div>
                      {errors.name && (
                        <p className="mt-1 text-xs text-red-400">{errors.name}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label htmlFor="email" className="text-sm text-slate-300">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={mode === "login" ? loginData.email : signupData.email}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (mode === "login") {
                            setLoginData((prev) => ({ ...prev, email: value }));
                          } else {
                            setSignupData((prev) => ({ ...prev, email: value }));
                          }
                          clearFieldError("email");
                        }}
                        className={cn(
                          inputClassName,
                          errors.email &&
                            "border-red-500/70 focus:border-red-500 focus:ring-red-500/20",
                        )}
                      />
                    </div>
                    {errors.email && (
                      <p className="mt-1 text-xs text-red-400">{errors.email}</p>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="password" className="text-sm text-slate-300">
                        Password
                      </label>
                      {mode === "login" && (
                        <a
                          href="#"
                          className="text-xs font-medium text-brand-cyan hover:text-brand-cyan/80"
                        >
                          Forgot password?
                        </a>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="password"
                        type={
                          mode === "login"
                            ? showLoginPassword
                              ? "text"
                              : "password"
                            : showSignupPassword
                              ? "text"
                              : "password"
                        }
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        placeholder={mode === "login" ? "Enter password" : "Min. 8 characters"}
                        value={
                          mode === "login" ? loginData.password : signupData.password
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          if (mode === "login") {
                            setLoginData((prev) => ({ ...prev, password: value }));
                          } else {
                            setSignupData((prev) => ({ ...prev, password: value }));
                          }
                          clearFieldError("password");
                        }}
                        className={cn(
                          inputClassName,
                          "pr-12",
                          errors.password &&
                            "border-red-500/70 focus:border-red-500 focus:ring-red-500/20",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (mode === "login") {
                            setShowLoginPassword((prev) => !prev);
                          } else {
                            setShowSignupPassword((prev) => !prev);
                          }
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-200"
                        aria-label={
                          mode === "login"
                            ? showLoginPassword
                              ? "Hide password"
                              : "Show password"
                            : showSignupPassword
                              ? "Hide password"
                              : "Show password"
                        }
                      >
                        {(mode === "login" ? showLoginPassword : showSignupPassword) ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="mt-1 text-xs text-red-400">{errors.password}</p>
                    )}
                  </div>

                  {mode === "signup" && (
                    <div>
                      <p className="mb-2 text-sm text-slate-300">Account Type</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSignupData((prev) => ({
                              ...prev,
                              accountType: "B2C",
                            }));
                            clearFieldError("accountType");
                          }}
                          className={cn(
                            "rounded-xl border px-4 py-4 text-left transition",
                            signupData.accountType === "B2C"
                              ? "border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/20"
                              : "border-slate-700 bg-slate-900/70 hover:border-slate-600",
                          )}
                        >
                          <User className="mb-2 size-4 text-brand-cyan" />
                          <p className="text-sm font-semibold text-slate-100">
                            Individual (B2C)
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Personal OTP and app verification.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSignupData((prev) => ({
                              ...prev,
                              accountType: "B2B",
                            }));
                            clearFieldError("accountType");
                          }}
                          className={cn(
                            "rounded-xl border px-4 py-4 text-left transition",
                            signupData.accountType === "B2B"
                              ? "border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/20"
                              : "border-slate-700 bg-slate-900/70 hover:border-slate-600",
                          )}
                        >
                          <BriefcaseBusiness className="mb-2 size-4 text-brand-cyan" />
                          <p className="text-sm font-semibold text-slate-100">
                            Developer/Business (B2B)
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            API-first OTP routing and scale controls.
                          </p>
                        </button>
                      </div>
                      {errors.accountType && (
                        <p className="mt-1 text-xs text-red-400">
                          {errors.accountType}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Google users must choose an account type on first login.
                      </p>
                    </div>
                  )}

                  {errors.general && (
                    <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {errors.general}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || isGoogleLoading}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan px-4 text-sm font-semibold text-slate-950 transition hover:bg-brand-cyan/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting
                      ? "Please wait..."
                      : mode === "login"
                        ? "Login to Dashboard"
                        : "Create Account"}
                    <ArrowRight className="size-4" />
                  </button>
                </motion.form>
              </AnimatePresence>

              <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Smartphone className="size-3.5" />
                <span className="font-mono">All balances shown in USD ($)</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
