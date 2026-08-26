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
        <Link href="/practice/clients">Clients</Link>
        {/* The drug list, not a stock count. Quantities are not tracked (§7.8). */}
        <Link href="/practice/inventory">Products</Link>
        <Link href="/dashboard">Account</Link>
      </nav>
      {children}
    </main>
  );
}
