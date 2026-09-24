import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "VetKeep — clinical records for solo and field veterinarians",
  description:
    "Keep a complete, signed clinical record for every animal and herd you attend, from your phone: examinations by species, vaccinations and deworming with due dates, treatments with withdrawal periods, and a health passport for the owner."
};

// Every claim here must be true of the built product. seo/brief.md lists what is
// not yet true (full offline use, sending WhatsApp reminders) and must stay off
// this page until it is.
export default function HomePage() {
  return (
    <main className="stack">
      <section className="card stack">
        <p className="muted">For independent, home-call and field veterinarians</p>
        <h1>Clinical records you can keep on your phone, at the farm or the front door.</h1>
        <p>
          VetKeep gives every animal and every herd a folder: its standing details, and a dated,
          signed record of each consultation. You read the history before you knock, document the
          visit in the form the species calls for, and leave the owner a copy.
        </p>
        <div className="cta-row">
          <Link className="button" href="/login?mode=signup">
            Create a veterinarian account
          </Link>
          <Link className="button secondary" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card stack">
          <h2>What does VetKeep record?</h2>
          <p>
            Examinations shaped by species, including groups of food animals; vaccinations,
            deworming and ectoparasite control with next-due dates; diagnostics and photographs; and
            treatments with the dose calculated and the working shown.
          </p>
        </article>
        <article className="card stack">
          <h2>When is milk, meat or egg safe again?</h2>
          <p>
            Record the treatment and VetKeep works out the withdrawal period for you, so the date
            the owner needs is on the record rather than in your head.
          </p>
        </article>
        <article className="card stack">
          <h2>Can a signed record be changed?</h2>
          <p>
            No. Once you sign a consultation it is locked. A correction is added beside the original
            and dated, so the record you hand over is the record you made.
          </p>
        </article>
        <article className="card stack">
          <h2>What does the owner get?</h2>
          <p>
            A copy of the consultation record, a simple invoice you issue yourself, and, if you
            choose, a health passport they can open from a QR code showing only the details you
            allow.
          </p>
        </article>
        <article className="card stack">
          <h2>Who is it for?</h2>
          <p>
            One veterinarian, one private account. VetKeep is built for solo practice, not for
            clinics, hospitals or teams, and it is not an appointment book.
          </p>
        </article>
        <article className="card stack">
          <h2>What about poor signal?</h2>
          <p>
            A consultation you have started can be documented without a connection and syncs when
            you are back in range. Opening or creating a folder still needs a connection today.
          </p>
        </article>
      </section>

      <section className="card stack">
        <h2>Start your first folder today.</h2>
        <div>
          <Link className="button" href="/login?mode=signup">
            Create a veterinarian account
          </Link>
        </div>
      </section>
    </main>
  );
}
