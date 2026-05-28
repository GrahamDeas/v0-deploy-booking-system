import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";

type ConfigurationNoticeProps = {
  compact?: boolean;
};

export function ConfigurationNotice({ compact = false }: ConfigurationNoticeProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 text-amber-950",
        compact ? "p-4" : "w-full p-5"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-amber-100 p-2 text-brass">
          <Settings size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-black">Supabase setup needed</h2>
          <p className="mt-1 text-sm leading-6">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
            to `.env.local`, then run the migration in Supabase.
          </p>
        </div>
      </div>
    </section>
  );
}
