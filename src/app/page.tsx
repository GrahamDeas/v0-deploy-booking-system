import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    redirect("/auth");
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/auth");
}
