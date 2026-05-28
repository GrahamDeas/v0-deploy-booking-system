import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { anonKey, url } = getSupabaseEnv();

  return createBrowserClient(url, anonKey);
}
