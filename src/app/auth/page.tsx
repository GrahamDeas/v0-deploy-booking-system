import { redirect } from "next/navigation";
import Image from "next/image";

import { AuthForm } from "@/components/AuthForm";
import { ConfigurationNotice } from "@/components/ConfigurationNotice";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type AuthPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const isConfigured = hasSupabaseEnv();
  const next =
    params?.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  if (isConfigured) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="panel flex flex-col justify-between gap-8 overflow-hidden border-navy/10 bg-navy p-6 text-white">
          <div>
            <div className="mb-8 inline-flex rounded-md bg-white p-3 shadow-soft">
              <Image
                alt="Fife College"
                className="h-auto w-40 object-contain"
                height={72}
                priority
                src="/branding/fife-college-logo.svg"
                width={180}
              />
            </div>
            <p className="text-sm font-bold uppercase text-sky">
              Sound Production Department
            </p>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
              Recording Studio Booking System
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
              Sign in with your Fife College account to manage studio sessions,
              equipment requests and production room availability.
            </p>
          </div>

          {!isConfigured ? <ConfigurationNotice compact /> : null}
        </section>

        <AuthForm isConfigured={isConfigured} next={next} />
      </div>
    </main>
  );
}
