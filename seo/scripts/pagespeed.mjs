// PageSpeed Insights, mobile first.
//
//   node scripts/pagespeed.mjs <url> [--strategy desktop]
//
// Prints real-visitor (field) metrics when Chrome has enough traffic to report
// them, the lab metrics, and only the audits that fail badly — the ones big
// enough to hurt a visitor, not every yellow warning.
import { flag, request, saveJson, slug } from "./lib.mjs";

const args = process.argv.slice(2);
const strategy = flag(args, "strategy", "mobile");
const url = args[0];
if (!url) {
  console.error("Usage: node scripts/pagespeed.mjs <url> [--strategy desktop]");
  process.exit(1);
}

const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
endpoint.searchParams.set("url", url);
endpoint.searchParams.set("strategy", strategy);
endpoint.searchParams.set("category", "performance");
// Works without a key at low volume; a key only raises the quota.
if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);

const result = await request(endpoint);
saveJson(`pagespeed/${slug(url)}-${strategy}.json`, result);

const lighthouse = result.lighthouseResult;
const lab = Object.fromEntries(
  [
    "largest-contentful-paint",
    "cumulative-layout-shift",
    "total-blocking-time",
    "first-contentful-paint"
  ].map((id) => [id, lighthouse.audits[id]?.displayValue ?? null])
);
const field = Object.fromEntries(
  Object.entries(result.loadingExperience?.metrics ?? {}).map(([name, metric]) => [
    name,
    { p75: metric.percentile, category: metric.category }
  ])
);
const failing = Object.values(lighthouse.audits)
  .filter(
    (audit) => audit.score !== null && audit.score < 0.5 && audit.scoreDisplayMode !== "informative"
  )
  .map((audit) => ({ id: audit.id, title: audit.title, value: audit.displayValue ?? null }));

console.log(
  JSON.stringify(
    {
      url,
      strategy,
      score: lighthouse.categories.performance.score,
      field: Object.keys(field).length > 0 ? field : "missing: not enough Chrome traffic",
      lab,
      failing
    },
    null,
    2
  )
);
