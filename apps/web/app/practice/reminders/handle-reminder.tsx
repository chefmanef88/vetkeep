"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";

/**
 * Clearing a reminder the veterinarian acted on by telephone.
 *
 * Until messaging is connected this is how the queue drains: a vet rings the
 * client and says so. Marking it done is recorded in the audit trail, so
 * "nobody told me the milk was clear" has an answer.
 */
export function HandleReminder({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("mark_reminder_handled", { p_id: id });

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  return (
    <>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void handle()}>
        {busy ? "Marking…" : "I have contacted them"}
      </button>
    </>
  );
}
