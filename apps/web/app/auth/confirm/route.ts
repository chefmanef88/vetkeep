import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const destination = request.nextUrl.clone();
  destination.pathname = "/onboarding";
  destination.search = "";

  if (!tokenHash || !type) {
    destination.pathname = "/login";
    destination.searchParams.set("error", "invalid_confirmation_link");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    destination.pathname = "/login";
    destination.searchParams.set("error", "confirmation_failed");
  }
  return NextResponse.redirect(destination);
}
