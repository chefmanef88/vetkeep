"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="secondary"
      onClick={async () => {
        await createClient().auth.signOut({ scope: "local" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
