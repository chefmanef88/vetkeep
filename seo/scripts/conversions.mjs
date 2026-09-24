// Conversions per landing page, from PostHog.
//
//   node scripts/conversions.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--event account_created]
//
// Counts one named event grouped by the landing path it carries. The event must
// be sent on purpose with a `landing_path` property (see seo/brief.md); an
// autocaptured click is not a conversion.
//
// If PostHog is not configured this exits 2 with "missing", which the agent
// reports as missing — it never substitutes traffic for conversions.
import { addDays, flag, isoDay, readState, request, requireEnv, saveJson } from "./lib.mjs";

const { POSTHOG_HOST, POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY } = requireEnv(
  "POSTHOG_HOST",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_PERSONAL_API_KEY"
);

const args = process.argv.slice(2);
const state = readState();
const to = flag(args, "to", state.searchConsole.lastDayPulled ?? addDays(isoDay(new Date()), -3));
const from = flag(args, "from", addDays(to, -27));
const event = flag(args, "event", "account_created");

// Values are interpolated into HogQL, so they are held to a strict shape first.
for (const day of [from, to]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a date: ${day}`);
}
if (!/^[a-z_]+$/.test(event)) throw new Error(`Not an event name: ${event}`);

const result = await request(
  `${POSTHOG_HOST.replace(/\/$/, "")}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: `
        SELECT properties.landing_path AS page, count() AS conversions
        FROM events
        WHERE event = '${event}'
          AND timestamp >= toDate('${from}')
          AND timestamp < toDate('${addDays(to, 1)}')
        GROUP BY page
        ORDER BY conversions DESC`
      }
    })
  }
);

const rows = (result.results ?? []).map(([page, conversions]) => ({ page, conversions }));
saveJson(`conversions/${event}-${from}-${to}.json`, rows);
console.log(JSON.stringify({ event, from, to, rows }, null, 2));
