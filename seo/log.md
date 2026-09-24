# Log

Append-only. Every run adds one entry at the bottom and never edits or deletes
an earlier one. A later correction is a new entry that points back at the old
one.

Each entry:

```
## YYYY-MM-DD — <run type: baseline | money page | checkup | weekly | shipped>

- Numbers: what was pulled, for which dates, and anything missing.
- Compared with: which baseline, and how many days since the last change went live.
- Finding: what changed, with the URL or file behind each claim.
- Recommendation: one change, or "none this week" and why.
- Decision: approved / declined / pending, and by whom.
- Shipped: what went live, the date, and the pull request.
```

---

## 2026-09-24 — setup

- Numbers: none. No Search Console property, no DataForSEO account, no
  conversion event yet.
- Finding: the home page had no call to action for a new veterinarian — only
  "Sign in". Per the conversion rule, that was fixed before any search work: it
  now leads with "Create a veterinarian account" linking to `/login?mode=signup`.
- Finding: the site had no robots.txt or sitemap. Both added; indexing stays
  off until `NEXT_PUBLIC_ALLOW_INDEXING=true` on production.
- Recommendation: week one — confirm the production domain, connect Search
  Console and DataForSEO (sandbox first), and decide how `account_created` is
  tracked (see brief).
- Decision: pending.
