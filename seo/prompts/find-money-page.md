# Find the one page worth the week

Do not audit the whole site. Find one page where a better ranking turns into
more signups.

1. From `state.json` (after `node scripts/gsc.mjs pull` and `rollup`), list every
   page with impressions, clicks and average position over the last 28 days.
2. Line up conversions per landing page (`node scripts/conversions.mjs`) next
   to them, page by page. If conversions are missing, stop here, log that, and
   say what tracking is needed. Do not pick a page on traffic alone.
3. Shortlist two or three pages that already convert the visitors they get,
   already appear in search, and sit low enough that most searchers never see
   them (roughly positions 5–20). Flag high-impression, zero-conversion pages as
   traps.
4. For each candidate, take its main queries and run
   `node scripts/dataforseo.mjs volume "<query>"` and
   `node scripts/dataforseo.mjs serp "<query>"`.
5. Look at who ranks. If the top results are a different kind of page from the
   candidate (how-to guides against a sales page), the query wants something
   else, and tuning will not fix it.
6. If Ahrefs is connected, check whether the leaders win on links rather than
   content — that is a different job from rewriting the page.
7. Give each candidate one call: **keep**, **keep once <one condition> is
   fixed**, or **drop**, each with links to what you looked at.
8. Write the winner to `state.json` → `focus` (page, main query, one-paragraph
   reason, date) and append a log entry.
