import { NextResponse } from "next/server";
import { log } from "@vetkeep/observability";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("vets").select("id").limit(1);
    if (error) throw new Error(`database:${error.code}`);

    return NextResponse.json(
      { status: "ok", requestId },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    log("error", "health.readiness_failed", {
      requestId,
      reason: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json(
      { status: "unavailable", requestId },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
