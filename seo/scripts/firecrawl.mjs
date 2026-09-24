// Firecrawl: read a page in full, JavaScript rendered, as clean Markdown.
//
//   node scripts/firecrawl.mjs <url>
//
// Saves to data/pages/<slug>.md and prints the path and the page's metadata.
// The agent reads the saved file; it never describes a page it has not read.
import { request, requireEnv, saveText, slug } from "./lib.mjs";

const { FIRECRAWL_API_KEY } = requireEnv("FIRECRAWL_API_KEY");
const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/firecrawl.mjs <url>");
  process.exit(1);
}

const result = await request("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false })
});

const markdown = result.data?.markdown ?? "";
const path = saveText(`pages/${slug(url)}.md`, `<!-- source: ${url} -->\n\n${markdown}`);
const { title, description, statusCode } = result.data?.metadata ?? {};
console.log(
  JSON.stringify(
    { url, path, statusCode, title, description, characters: markdown.length },
    null,
    2
  )
);
