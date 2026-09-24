// Google Search Console.
//
//   node scripts/gsc.mjs pull [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//   node scripts/gsc.mjs rollup
//   node scripts/gsc.mjs inspect <url>
//
// pull fetches one day at a time and stores each day under data/gsc/. One day
// per request keeps each response small enough to stay clear of the row cap
// and the quota, and a stored day never has to be fetched again.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_DIR,
  addDays,
  flag,
  isoDay,
  readState,
  request,
  requireEnv,
  saveJson,
  writeState
} from "./lib.mjs";

// Lazy, so rollup works from stored days without credentials.
let credentials;
const env = () =>
  (credentials ??= requireEnv(
    "GSC_CLIENT_ID",
    "GSC_CLIENT_SECRET",
    "GSC_REFRESH_TOKEN",
    "GSC_PROPERTY"
  ));

async function accessToken() {
  const body = new URLSearchParams({
    client_id: env().GSC_CLIENT_ID,
    client_secret: env().GSC_CLIENT_SECRET,
    refresh_token: env().GSC_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const { access_token } = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    body
  });
  return access_token;
}

async function query(token, day, dimensions) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env().GSC_PROPERTY)}/searchAnalytics/query`;
  const result = await request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: day,
      endDate: day,
      dimensions,
      rowLimit: 25000,
      dataState: "final"
    })
  });
  return result?.rows ?? [];
}

async function pull(args) {
  const state = readState();
  // Search Console lands two to three days late; asking for the last three days
  // returns partial numbers that look like a drop.
  const newest = addDays(isoDay(new Date()), -3);
  const from = flag(
    args,
    "from",
    state.searchConsole.lastDayPulled
      ? addDays(state.searchConsole.lastDayPulled, 1)
      : addDays(newest, -89)
  );
  const to = flag(args, "to", newest);
  if (to > newest)
    throw new Error(`--to ${to} is later than ${newest}; that data is not final yet.`);

  const token = await accessToken();
  let pulled = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    // Page totals come from a page-only query. Adding the query dimension drops
    // anonymised rows, so summing page+query rows undercounts every page.
    const pages = await query(token, day, ["page"]);
    const pageQueries = await query(token, day, ["page", "query"]);
    saveJson(`gsc/${day}.json`, { day, pages, pageQueries });
    state.searchConsole.lastDayPulled = day;
    pulled += 1;
  }
  state.searchConsole.property = env().GSC_PROPERTY;
  writeState(state);
  console.log(JSON.stringify({ pulled, from, to }));
}

function loadDays() {
  const dir = join(DATA_DIR, "gsc");
  let files = [];
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return files.sort().map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

function summarise(days, from, to) {
  const pages = {};
  for (const { day, pages: rows } of days) {
    if (day < from || day > to) continue;
    for (const row of rows) {
      const page = row.keys[0];
      const total = (pages[page] ??= { clicks: 0, impressions: 0, weightedPosition: 0 });
      total.clicks += row.clicks;
      total.impressions += row.impressions;
      total.weightedPosition += row.position * row.impressions;
    }
  }
  return Object.fromEntries(
    Object.entries(pages).map(([page, total]) => [
      page,
      {
        from,
        to,
        clicks: total.clicks,
        impressions: total.impressions,
        ctr: total.impressions ? +(total.clicks / total.impressions).toFixed(4) : 0,
        position: total.impressions
          ? +(total.weightedPosition / total.impressions).toFixed(1)
          : null
      }
    ])
  );
}

function rollup() {
  const state = readState();
  const last = state.searchConsole.lastDayPulled;
  if (!last) throw new Error("Nothing pulled yet. Run: node scripts/gsc.mjs pull");
  const days = loadDays();

  const current = summarise(days, addDays(last, -27), last);
  // The baseline is the 28 days before the most recent change went live, so the
  // comparison is always against the page as it was before we touched it.
  const lastChange = state.liveChanges.at(-1)?.date;
  const baselineEnd = lastChange ? addDays(lastChange, -1) : addDays(last, -28);
  const baseline = summarise(days, addDays(baselineEnd, -27), baselineEnd);

  const pages = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const page of pages) {
    state.pages[page] = {
      ...state.pages[page],
      search: { current: current[page] ?? null, baseline: baseline[page] ?? null }
    };
  }
  writeState(state);
  console.log(JSON.stringify({ pages: pages.size, current: last, baselineEnd }));
}

async function inspect(url) {
  if (!url) throw new Error("Usage: node scripts/gsc.mjs inspect <url>");
  const token = await accessToken();
  const result = await request(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: env().GSC_PROPERTY })
    }
  );
  console.log(JSON.stringify(result.inspectionResult, null, 2));
}

const [command, ...args] = process.argv.slice(2);
if (command === "pull") await pull(args);
else if (command === "rollup") rollup();
else if (command === "inspect") await inspect(args[0]);
else {
  console.error("Usage: node scripts/gsc.mjs pull|rollup|inspect <url>");
  process.exit(1);
}
