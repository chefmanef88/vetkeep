// DataForSEO. Sandbox by default: it returns made-up data in the exact shape of
// the real thing and costs nothing, so the agent learns the format before it
// touches the budget. Set DATAFORSEO_LIVE=1 for real data.
//
//   node scripts/dataforseo.mjs volume "<keyword>" ["<keyword>" ...]
//   node scripts/dataforseo.mjs serp "<query>"
//   node scripts/dataforseo.mjs ai-mode "<query>"
//
// --location <code> overrides DATAFORSEO_LOCATION (2288 is Ghana; 2840 is the
// United States, where AI Mode coverage is widest).
import { flag, request, requireEnv, saveJson, slug } from "./lib.mjs";

const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = requireEnv(
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD"
);
const live = process.env.DATAFORSEO_LIVE === "1";
const base = live ? "https://api.dataforseo.com/v3" : "https://sandbox.dataforseo.com/v3";
const auth = `Basic ${Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64")}`;

const args = process.argv.slice(2);
const location_code = Number(flag(args, "location", process.env.DATAFORSEO_LOCATION ?? "2288"));
const language_code = flag(args, "language", "en");
const [command, ...terms] = args;

async function post(path, task) {
  const result = await request(`${base}/${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify([{ location_code, language_code, ...task }])
  });
  const first = result.tasks?.[0];
  if (first?.status_code !== 20000)
    throw new Error(`${path}: ${first?.status_message ?? "no task"}`);
  return { cost: result.cost, results: first.result ?? [] };
}

function summariseItems(items = []) {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => ({ rank: item.rank_group, url: item.url, title: item.title }));
}

let output;
if (command === "volume" && terms.length > 0) {
  // One result per keyword, unlike the SERP endpoints' single result.
  const { cost, results } = await post("keywords_data/google_ads/search_volume/live", {
    keywords: terms
  });
  output = {
    cost,
    keywords: results.map(({ keyword, search_volume, competition }) => ({
      keyword,
      search_volume,
      competition
    }))
  };
} else if (command === "serp" && terms[0]) {
  const {
    cost,
    results: [result]
  } = await post("serp/google/organic/live/advanced", { keyword: terms[0], depth: 10 });
  saveJson(`dataforseo/serp-${slug(terms[0])}.json`, result);
  output = { cost, query: terms[0], top: summariseItems(result?.items) };
} else if (command === "ai-mode" && terms[0]) {
  const {
    cost,
    results: [result]
  } = await post("serp/google/ai_mode/live/advanced", { keyword: terms[0] });
  saveJson(`dataforseo/ai-mode-${slug(terms[0])}.json`, result);
  const references = (result?.items ?? []).flatMap((item) => item.references ?? []);
  output = {
    cost,
    query: terms[0],
    cited: references.map((reference) => ({ url: reference.url, title: reference.title }))
  };
} else {
  console.error('Usage: node scripts/dataforseo.mjs volume|serp|ai-mode "<query>"');
  process.exit(1);
}

console.log(JSON.stringify({ sandbox: !live, location_code, ...output }, null, 2));
