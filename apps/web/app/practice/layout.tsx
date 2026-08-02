import Link from "next/link";
import { requireMfa } from "@/lib/auth/require-mfa";

export const dynamic = "force-dynamic";

export default async function PracticeLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  await requireMfa();

  return (
    <main className="stack">
      <nav className="practice-nav" aria-label="Practice">
        <Link href="/practice/today">Today</Link>
        <Link href="/practice/clients">Clients</Link>
        <Link href="/practice/appointments">Appointments</Link>
        <Link href="/practice/inventory">Stock</Link>
        <Link href="/dashboard">Account</Link>
      </nav>
      {children}
    </main>
  );
}
