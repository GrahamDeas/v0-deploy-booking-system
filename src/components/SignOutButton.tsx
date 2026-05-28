"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  return (
    <button
      className="icon-button border-line bg-white text-navy hover:border-coral/40 hover:bg-coral/5 hover:text-coral"
      disabled={isSigningOut}
      type="button"
      onClick={handleSignOut}
    >
      <LogOut size={18} aria-hidden="true" />
      {isSigningOut ? "Signing out" : "Sign out"}
    </button>
  );
}
