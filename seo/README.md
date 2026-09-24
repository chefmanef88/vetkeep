# SEO and answer-engine agent

A folder that Claude Code runs a weekly SEO loop from. It finds the one page
where a better ranking would bring more veterinarian signups, fixes that page
one change at a time, and records every decision.

The rule behind everything here: **a page that ranks and does not convert is
worth nothing.** The home page's call to action (create an account) was fixed
before any of this. Fix the page first, then chase visitors.

## What is in the folder

| File         | What it is                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| `CLAUDE.md`  | The agent's standing instructions. Frozen while a change is being measured.        |
| `brief.md`   | The business, the buyer, the conversion. The file you will edit most.              |
| `state.json` | Baseline numbers per page, the focus page, and every change with its go-live date. |
| `log.md`     | Append-only. One entry per run. Nothing is ever deleted.                           |
| `prompts/`   | The three jobs: find the money page, the four-pass checkup, the weekly loop.       |
| `scripts/`   | Dependency-free Node scripts the agent calls for data.                             |
| `reports/`   | Checkup reports, one file per run.                                                 |
| `data/`      | Raw pulls. Git-ignored; `state.json` holds what matters.                           |

## Scripts

Run from `seo/`. Each prints JSON. A missing credential exits with code 2 and
`{"missing": [...]}`, which the agent reports as missing data.

| Script                                       | Source                       | Needs                          |
| -------------------------------------------- | ---------------------------- | ------------------------------ |
| `gsc.mjs pull` / `rollup` / `inspect <url>`  | Google Search Console        | OAuth client and refresh token |
| `dataforseo.mjs volume` / `serp` / `ai-mode` | DataForSEO (sandbox default) | login and password             |
| `firecrawl.mjs <url>`                        | Firecrawl                    | API key                        |
| `pagespeed.mjs <url>`                        | PageSpeed Insights           | nothing (key optional)         |
| `parallel.mjs "<objective>"`                 | Parallel search              | API key                        |
| `conversions.mjs`                            | PostHog                      | personal API key (query:read)  |

Ahrefs is optional: connect it only if you already pay for it, as an MCP server,
for backlinks.

## Setup

1. `cp seo/.env.example seo/.env` and fill in what you have. Set spend limits on
   DataForSEO, Firecrawl and Parallel first.
2. **Search Console.** In the Google Cloud console: create a project, enable the
   Search Console API, create an OAuth client (desktop), and get a refresh token
   for an account with access to the property (for example with the OAuth
   Playground, scope `https://www.googleapis.com/auth/webmasters.readonly`).
   One sitting, done once.
3. **DataForSEO.** Leave `DATAFORSEO_LIVE` unset for the first runs. The sandbox
   returns fake data in the real shape at no cost.
4. **Conversions.** Resolve the blocker in `brief.md`: `account_created` must be
   a named event carrying the landing path before the loop can judge anything.
5. **Indexing.** Set `NEXT_PUBLIC_ALLOW_INDEXING=true` on the production
   deployment only. Every other deployment tells crawlers to stay out.

## Approval

`.claude/hooks/seo-approval-gate.mjs` runs before every Bash and MCP call in this
repository. It asks a person before anything that publishes: a push to `main`,
a force-push, a production deploy or promotion on Vercel, a merge, a direct
write to a GitHub branch through the API, or a URL or sitemap submitted to a
search engine. Everything else is left to the normal permission rules.

## Scheduling

- **Scheduled task (recommended).** Folder: this repository. Instructions:
  "Work in `seo/`. Follow `seo/prompts/weekly-loop.md`." Schedule: Mondays.
  Use the strongest model available, because the loop is mostly judgment about
  which page deserves the week. Keep the default permission mode, which stops
  and waits at anything not allowed — that pause is the approval step.
- **Cloud routines** run without stopping for approval. Give them read-only
  credentials only, and never anything that can publish.

## The first four weeks

1. **Connect and baseline.** Credentials, spend limits, the conversion event,
   `brief.md` reviewed. Run `node scripts/gsc.mjs pull` to fetch up to 90 days
   of history, then `rollup`.
2. **Find the page and check it.** Run `prompts/find-money-page.md`, then
   `prompts/page-checkup.md`. Read the report; push back on any finding without
   a source; agree the one change to make first.
3. **Ship.** The agent drafts the change as a pull request. You review it,
   merge it, and it deploys. Record the date in `state.json` → `liveChanges` and
   in the log.
4. **Loop.** Turn on the weekly schedule. Give the change a few more weeks
   before calling it a win or a miss.

Then the next change on the same page, or the next money page.
