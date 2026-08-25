import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { refreshSession } from "@/lib/supabase/proxy";

function buildCsp(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const supabaseUrl = new URL(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWebSocketUrl = new URL(supabaseUrl);
  supabaseWebSocketUrl.protocol = supabaseUrl.protocol === "https:" ? "wss:" : "ws:";

  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' is deliberately absent, and its absence is the whole
    // reason this line has a comment.
    //
    // It was here, and it silently broke every production build: with
    // 'strict-dynamic' present a browser ignores 'self', trusting only scripts
    // carrying the nonce and whatever those load. Next.js is not applying the
    // nonce to its own script tags here — 0 of 16 on the deployed page — so
    // every script was blocked, React never hydrated, and the login form fell
    // back to a native submit that cleared the fields and did nothing.
    //
    // It survived because development mode behaves differently, and the whole
    // signup flow was only ever exercised there.
    //
    // What remains is still strict: same-origin scripts only, no
    // 'unsafe-inline', and the nonce kept so any inline script Next does emit
    // must carry it. Restoring 'strict-dynamic' requires first proving the
    // nonce reaches the rendered script tags.
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl.origin} ${supabaseWebSocketUrl.origin}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ];
  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildCsp(nonce));

  const refreshed = await refreshSession(request, requestHeaders);
  const response = refreshed.response;
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding") ||
    request.nextUrl.pathname.startsWith("/security/mfa");

  if (isProtected && !refreshed.user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
