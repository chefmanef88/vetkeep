# Weekly loop

Frozen while a change is being measured. See `CLAUDE.md`.

Run from the `seo/` folder. Read `CLAUDE.md`, `brief.md`, `state.json` and the
end of `log.md` first.

1. **Pull.** Run `node scripts/gsc.mjs pull` to fetch every day since
   `searchConsole.lastDayPulled`, up to today minus three. Pull conversions per
   landing page for the same days with `node scripts/conversions.mjs`. If
   conversions are unavailable, say so in the log entry and continue with
   search data only — but make no recommendation that depends on conversions.
2. **Roll up.** Run `node scripts/gsc.mjs rollup` so `state.json` holds the last
   28 days per page next to the 28 days before the last live change.
3. **Compare.** For the focus page: search (clicks, impressions, position,
   CTR) and business (conversions, conversion rate) against the baseline. Note
   how many days the last change has been live. Anything under fourteen days is
   "too early to judge", not a result.
4. **Check for breakage.** Run `node scripts/pagespeed.mjs <focus page>` and
   `node scripts/gsc.mjs inspect <focus page>`. Report a changed indexing
   state, a non-200 response, or a new Core Web Vitals failure.
5. **Recommend one change**, or "none this week" with the reason. Every reason
   links to its evidence.
6. **Stop.** Do not draft or publish anything. Write the recommendation to
   `state.json` as `pendingChange` and wait for a yes.
7. **Log.** Append one entry to `log.md` in the format at its top.
