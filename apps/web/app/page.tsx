import Link from "next/link";

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
