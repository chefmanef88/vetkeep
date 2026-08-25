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

export default function LoginPage() {
  return (
    <main>
      <section className="card stack">
        <h1>Veterinarian access</h1>
        <p className="muted">Use a unique account. Shared logins are not permitted.</p>
        <AuthForm />
      </section>
    </main>
  );
}
