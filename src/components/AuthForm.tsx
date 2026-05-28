"use client";

import { GraduationCap, LockKeyhole, LogIn, Mail, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { COURSE_CLASS_OPTIONS, DEFAULT_COURSE_CLASS } from "@/lib/booking-options";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = {
  isConfigured: boolean;
  next: string;
};

export function AuthForm({ isConfigured, next }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [courseClass, setCourseClass] = useState<string>(DEFAULT_COURSE_CLASS);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isConfigured) {
      setError("Add Supabase values to .env.local before signing in.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
            data: {
              full_name: fullName,
              course_class: courseClass
            }
          }
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        }

        setMessage("Check your email to confirm the account.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push(next);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-line bg-slate-50 p-1">
        <button
          className={cn(
            "icon-button border-line",
            mode === "sign-in"
              ? "bg-navy text-white"
              : "bg-transparent text-slate-600 hover:bg-white"
          )}
          type="button"
          onClick={() => setMode("sign-in")}
        >
          <LogIn size={17} aria-hidden="true" />
          Sign in
        </button>
        <button
          className={cn(
            "icon-button border-line",
            mode === "sign-up"
              ? "bg-navy text-white"
              : "bg-transparent text-slate-600 hover:bg-white"
          )}
          type="button"
          onClick={() => setMode("sign-up")}
        >
          <UserPlus size={17} aria-hidden="true" />
          Register
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {isSignUp ? (
          <>
            <label className="block space-y-2">
              <span className="field-label">Full name</span>
              <div className="relative">
                <GraduationCap
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                  aria-hidden="true"
                />
                <input
                  className="field-control pl-10"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="field-label">Course / class</span>
              <select
                className="field-control"
                value={courseClass}
                onChange={(event) => setCourseClass(event.target.value)}
                required
              >
                {COURSE_CLASS_OPTIONS.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="block space-y-2">
          <span className="field-label">Email</span>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
              aria-hidden="true"
            />
            <input
              className="field-control pl-10"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="field-label">Password</span>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
              aria-hidden="true"
            />
            <input
              className="field-control pl-10"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        ) : null}

        <button
          className="icon-button w-full bg-teal text-white hover:bg-teal/90"
          disabled={isSubmitting || !isConfigured}
          type="submit"
        >
          {isSignUp ? (
            <UserPlus size={18} aria-hidden="true" />
          ) : (
            <LogIn size={18} aria-hidden="true" />
          )}
          {isSubmitting ? "Working" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
