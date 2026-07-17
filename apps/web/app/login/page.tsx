import { AuthForm } from "./auth-form";

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
