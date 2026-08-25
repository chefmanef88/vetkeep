import Link from "next/link";

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

export default function HomePage() {
  return (
    <main className="stack">
      <section className="card stack">
        <p className="muted">VetKeep Phase 1</p>
        <h1>Secure clinical records for independent veterinarians.</h1>
        <p>
          The current build establishes authenticated veterinarian accounts, controlled onboarding,
          registered devices, tenant isolation, and append-only audit history.
        </p>
        <div>
          <Link className="button" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
