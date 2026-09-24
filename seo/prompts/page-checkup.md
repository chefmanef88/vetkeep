# Four-pass checkup of the focus page

Write the result to `reports/YYYY-MM-DD-checkup.md`. Every finding carries its
source. Missing data is written as missing.

## Pass 1 — can Google reach it

- `node scripts/gsc.mjs inspect <page>`: indexing state, last crawl, canonical,
  robots.
- `node scripts/firecrawl.mjs <page>` for the rendered text, and a plain fetch
  (`curl -s <page>`) for what the server ships. If the indexable text differs
  materially, report it.
- `node scripts/pagespeed.mjs <page>` on mobile. Report only failures large
  enough to hurt a real visitor.

A page must be crawlable, indexed and snippet-eligible before it can appear as
a link in AI features, so a failure here outranks everything below.

## Pass 2 — the competition

- `node scripts/dataforseo.mjs serp "<main query>"` for the top ten.
- `node scripts/firecrawl.mjs <url>` for each, in full.
- Read them beside the focus page. Report: what the winners cover that the page
  does not, questions they answer that it skips, and what the page says better
  than all of them.

## Pass 3 — answer engines

- `node scripts/dataforseo.mjs ai-mode "<main query>"`: is VetKeep cited, and
  who is?
- Bing Webmaster Tools AI Performance, if connected: which pages are cited.
- Check the page reads well for an answer engine: the answer is the first line
  under each heading, headings match how people ask, sections stand alone.
- `node scripts/parallel.mjs "<topic or VetKeep>"`: where the topic and the
  brand are discussed (forums, Reddit, YouTube, veterinary associations).
  List wrong business details and conversations VetKeep is missing from.
- Schema: recommend only if the page fits a rich result.

## Pass 4 — page to conversion

- Read it as a solo veterinarian would. Is there one obvious next step? Is it
  visible without scrolling on a phone? Does the page answer the doubts before
  signup (offline use, price, data ownership, what happens to records)?
- Check nothing on the page promises something the brief lists as not yet true.
- Is `account_created` tracked as a named event with the landing page? If not,
  that is the first fix, whatever else the report says.
- Internal links: which pages already get traffic, and where a link to the
  focus page belongs.

## End

Rank the fixes. Recommend **one** to make first. Append a log entry.
