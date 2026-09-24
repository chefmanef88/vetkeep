# Brief

The agent reads this file first on every run. It judges a page only as well as
this file explains what the page is supposed to sell, so when the offer, the
buyer or the conversion changes, change it here before the next run.

Lines marked **TODO** are facts the repository does not hold. The agent must
treat them as missing data, not guess them.

## What VetKeep sells

A subscription clinical record-keeping application for **independent, solo
veterinarians**, especially those doing home-call, mobile, ambulatory and field
work. One veterinarian, one private account, no staff seats.

What a veterinarian gets (from `docs/product/vetkeep-developer-brief-revised.md`
§1.1, and only the parts that are built):

- A folder per animal or per group of animals, searchable, with every dated
  consultation record in it.
- Examination forms shaped by the species, including groups of food animals.
- Vaccination, deworming and ectoparasite control with next-due dates.
- Treatments with withdrawal periods: when milk, meat or eggs are safe again,
  calculated rather than worked out by hand.
- Dose calculation with the working shown.
- A controlled public health passport, reachable by QR code.
- A copy of the consultation record for the client.
- Simple client invoices (VetKeep never handles the client's payment).
- Records that cannot be silently altered once signed.

What it is **not**, and pages must not imply otherwise: a clinic or hospital
system, a multi-vet product, an appointment book or route planner, a pharmacy,
or a herd production-management system.

Claims that must **not** appear on a page yet, because they are not true yet:

- Full offline operation. Documenting a consultation offline works once the
  record exists; opening a folder or creating one needs a connection (brief
  §15, "Known divergences").
- Sending WhatsApp reminders. Reminders are built; sending is not (§12).

## Who buys

- A veterinarian working alone, usually from a phone, often in a yard or on a
  farm with poor signal.
- Primary market: Ghana, then West Africa. English. Payment by Mobile Money.
- Licensed: onboarding records a licence number and verification state.

## What counts as a conversion

In order of value:

1. **`account_created`** — a veterinarian submits the create-account form on
   `/login?mode=signup`. This is the conversion the loop optimises.
2. **`onboarding_completed`** — the account finishes onboarding (profile and
   licence). A signup that never onboards is a weak signal.
3. **`subscription_started`** — first paid period. **TODO**: billing (§13) is
   specified, not built, so this event cannot exist yet.

**TODO — blocker for week one:** none of these is tracked as a named event with
the landing page attached. The site has no product analytics, and its Content
Security Policy allows no third-party script or connection. Until one of these
exists, the agent cannot line conversions up against search pages and must say
so rather than infer conversions from traffic:

- a first-party analytics event (for example Vercel Web Analytics custom events,
  which are served from the site's own origin), or
- PostHog with the CSP and `docs/compliance/data-inventory.md` updated first.

Either way, the event carries the landing path only. No email, name, licence
number or anything from a clinical record is ever sent to an analytics tool.

## The site

- Production URL: `https://vetkeep-liart.vercel.app` — **TODO**: confirm this is
  production and not `vetkeep-staging` before verifying it in Search Console. A
  custom domain, if one is coming, should come before any SEO work, because
  moving domains later resets much of what this loop builds.
- Framework: Next.js in `apps/web`. Changes ship through a pull request and a
  Vercel deployment. The agent drafts; a person merges.
- Public, indexable pages: `/` today. `/login` is public but is a form, not a
  page to rank. `/passport/*` is deliberately `noindex` and never a candidate.
  Everything under `/dashboard`, `/practice`, `/onboarding`, `/security` is
  private.
- Indexing is off until `NEXT_PUBLIC_ALLOW_INDEXING=true` is set on the
  production deployment (see `apps/web/app/robots.ts`), so staging is never
  indexed.

## Starting pages

The site has no pages to judge yet, so the first month follows the
"zero to first page" path: exactly two pages.

1. **Landing page** (`/`): one offer, one buyer, one next step near the top —
   create an account.
2. **Supporting page**: **TODO**. One question a solo veterinarian asks right
   before paying for a fix. Candidates to test with DataForSEO, not assume:
   - withdrawal period records for milk, meat and eggs
   - keeping veterinary records on a phone during farm visits
   - vaccination record and reminder keeping for a mobile vet
     Pick the one searched by someone ready to act, not someone curious. It links
     to `/` with the same call to action.

## Voice

Plain, specific, and unhyped. The product's own documents explain what is
missing as readily as what is built; pages do the same. Never promise a
capability from the "must not appear" list above.
