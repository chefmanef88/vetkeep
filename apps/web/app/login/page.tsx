import type { Metadata } from "next";
import { AuthForm } from "./auth-form";

// Rendered per request, not prerendered, and the reason is the Content Security
// Policy rather than anything about this page.
//
// script-src carries a nonce. Next.js can only inject that nonce while
// rendering a request, so a statically prerendered page ships HTML with no
// nonce on any script tag — and every script, inline and external, is then
// blocked by the very policy meant to protect it. React never hydrates and the
// form falls back to a native submit that clears the fields and does nothing.
//
// Development never showed this because development always renders per request.
export const dynamic = "force-dynamic";

// A form, not a page to rank: the home page is what search should send people to.
export const metadata: Metadata = {
  title: "Sign in — VetKeep",
  robots: { index: false, follow: true }
};

/**
 * ?mode=signup opens straight on the create-account form, so the home page's
 * call to action lands on the thing it promised rather than on sign-in.
 */
export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const signup = mode === "signup";

  return (
    <main>
      <section className="card stack">
        <h1>{signup ? "Create your veterinarian account" : "Veterinarian access"}</h1>
        <p className="muted">Use a unique account. Shared logins are not permitted.</p>
        <AuthForm initialMode={signup ? "signup" : "signin"} />
      </section>
    </main>
  );
}
