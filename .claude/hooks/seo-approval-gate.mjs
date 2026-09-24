#!/usr/bin/env node
// PreToolUse hook: stop and ask a person before anything that publishes, edits
// the live site, or submits a URL to a search engine.
//
// It answers "ask" rather than "deny": the action is often right, it just must
// not happen without a yes. In a session nobody is watching, "ask" is a pause,
// which is the point. Everything not matched here is left to the normal
// permission rules, so ordinary work — including pushing a feature branch —
// is untouched.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const tool = input.tool_name ?? "";
const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";

// Production is what the default branch deploys to, so a push there is a publish.
const bashRules = [
  [/\bgit\s+push\b[^\n;&|]*\b(main|master)\b/, "pushes to the branch production deploys from"],
  [/\bgit\s+push\b[^\n;&|]*\s(-f|--force|--force-with-lease)\b/, "force-pushes"],
  [
    /\bvercel\b[^\n;&|]*(--prod\b|\bpromote\b|\brollback\b|\balias\b)/,
    "changes the production deployment"
  ],
  [/\bvercel\s+deploy\b/, "creates a deployment"],
  [
    /indexing\.googleapis\.com|\/indexnow\b|searchconsole\.googleapis\.com\/v1\/.*(submit|sitemaps)/i,
    "submits URLs to a search engine"
  ],
  [/webmasters\/v3\/sites\/[^\s]*\/sitemaps\//, "submits a sitemap"],
  [/\bgh\s+pr\s+merge\b/, "merges a pull request"]
];

const toolRules = [
  [
    /^mcp__Vercel__(create_deployment|request_promote|request_rollback|assign_alias|stage_redirects|stage_routes|add_route|edit_route|update_route_versions|update_project|start_rolling_release|approve_rolling_release_stage|complete_rolling_release|invalidate_by_tags|invalidate_by_src_images)$/,
    "changes the live site on Vercel"
  ],
  [/^mcp__github__(merge_pull_request|enable_pr_auto_merge)$/, "merges a pull request"],
  [
    /^mcp__github__(create_or_update_file|push_files|delete_file)$/,
    "writes directly to a GitHub branch"
  ],
  [/(publish|submit_url|request_indexing|indexnow)/i, "publishes or submits a URL"]
];

let reason = null;
if (tool === "Bash") {
  reason = bashRules.find(([pattern]) => pattern.test(command))?.[1] ?? null;
} else {
  reason = toolRules.find(([pattern]) => pattern.test(tool))?.[1] ?? null;
}

if (reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Approval required: this ${reason}.`
      }
    })
  );
}
process.exit(0);
