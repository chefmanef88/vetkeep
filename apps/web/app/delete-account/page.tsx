import type { Metadata } from "next";
import Link from "next/link";
import { getPublicEnv } from "@/lib/env";

/**
 * How to have an account and its data deleted (brief §17.2).
 *
 * Public and outside the sign-in wall on purpose. Google Play requires a
 * deletion route reachable by someone who cannot get into the application —
 * because they have lost their device, their password, or their second factor.
 * Explaining it only inside the app would fail exactly the person who needs it.
 *
 * What this page must not do is promise more deletion than happens. Closing a
 * veterinary account does not erase the clinical records, and saying otherwise
 * to satisfy a form would be a lie told to a regulator and to a farmer whose
 * animal's withholding period is in there. So the page separates the two
 * plainly: what goes, and what stays and why.
 */

export const metadata: Metadata = {
  title: "Deleting your VetKeep account"
};

export default function DeleteAccountPage() {
  const { NEXT_PUBLIC_SUPPORT_EMAIL: supportEmail } = getPublicEnv();

  return (
    <main className="stack">
      <section className="card stack">
        <h1>Deleting your VetKeep account</h1>
        <p className="muted">
          VetKeep keeps clinical records for veterinarians in independent practice. What can be
          deleted depends on who you are, so this page answers for both.
        </p>
      </section>

      <section className="card stack">
        <h2>If you are a veterinarian with a VetKeep account</h2>
        <p>You can close your account yourself, from either application:</p>
        <ol>
          <li>Sign in on the mobile app or the web application.</li>
          <li>
            Open the menu and choose <strong>Close your account</strong>.
          </li>
          <li>
            Confirm with your second factor and type <strong>CLOSE MY ACCOUNT</strong>.
          </li>
        </ol>
        <p>It takes effect immediately. There is no waiting period and no confirmation email.</p>

        <h3>Take a copy first</h3>
        <p>
          Closing does not send you your records. Use <strong>Export your practice</strong> before
          you close — it produces a complete copy of everything you have recorded. Once the account
          is closed you cannot sign in to run it.
        </p>

        <h3>What is deleted</h3>
        <ul>
          <li>Your account is closed and you can no longer sign in.</li>
          <li>Every device registered to you is revoked, including any holding offline records.</li>
        </ul>

        <h3>What is kept, and why</h3>
        <p>
          <strong>Clinical records are retained.</strong> They are veterinary records, and they are
          not only about you: they document treatments given to animals belonging to your clients,
          including the withholding periods that say when milk, meat or eggs are safe again. Erasing
          them on request would remove evidence a food-safety authority, a client or a subsequent
          veterinarian may need.
        </p>
        <p>
          The audit trail of who did what is retained for the same reason, and the record of your
          closure is part of it.
        </p>
        {/* The period itself is a policy decision, not a code one: it belongs to
            Ghana's Data Protection Act and the Veterinary Council's
            record-keeping requirements. When §17 settles it, the figure goes
            here and in the privacy notice, and the two must agree. */}
        <p className="muted">
          Records are kept for the period set out in our privacy notice, in line with veterinary
          record-keeping requirements.
        </p>
      </section>

      <section className="card stack">
        <h2>If your details are held by a veterinarian who uses VetKeep</h2>
        <p>
          If you are a farmer or an animal owner, your name and contact details are in VetKeep
          because your veterinarian recorded them. Your veterinarian decides what is kept about you
          and for how long, so a request to correct or remove your details goes to them directly —
          they can do it from within the application.
        </p>
        <p>
          We hold that information on their behalf and cannot delete one client's details out of a
          practice's records without them.
        </p>
      </section>

      {supportEmail ? (
        <section className="card stack">
          <h2>If you cannot sign in</h2>
          <p>
            If you have lost your device or your second factor and cannot reach the closure screen,
            write to <a href={`mailto:${supportEmail}`}>{supportEmail}</a> from the email address on
            the account. We will verify it is yours before closing anything, because an account
            closed by the wrong person cannot be reopened.
          </p>
        </section>
      ) : null}

      <section className="card stack">
        <Link href="/">Back to VetKeep</Link>
      </section>
    </main>
  );
}
