// Parallel web search: where a topic or VetKeep is discussed outside the site.
//
//   node scripts/parallel.mjs "<objective>" ["<search query>" ...]
//
// The objective says what to find in plain words; the optional queries steer
// it. Results are saved and printed as url, title and excerpts, so every claim
// the agent makes from them can cite its source.
import { request, requireEnv, saveJson, slug } from "./lib.mjs";

const { PARALLEL_API_KEY } = requireEnv("PARALLEL_API_KEY");
const [objective, ...searchQueries] = process.argv.slice(2);
if (!objective) {
  console.error('Usage: node scripts/parallel.mjs "<objective>" ["<search query>" ...]');
  process.exit(1);
}

const result = await request("https://api.parallel.ai/v1beta/search", {
  method: "POST",
  headers: { "x-api-key": PARALLEL_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    objective,
    ...(searchQueries.length > 0 ? { search_queries: searchQueries } : {}),
    max_results: 15
  })
});

saveJson(`parallel/${slug(objective)}.json`, result);
const results = (result.results ?? []).map(({ url, title, excerpts }) => ({
  url,
  title,
  excerpts
}));
console.log(JSON.stringify({ objective, results }, null, 2));
