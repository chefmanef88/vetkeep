/**
 * Writes packages/database/src/database.types.ts from the local database.
 *
 * Reads `supabase gen types typescript --local` on stdin. Two things that
 * output needs before it can be committed:
 *
 * 1. The CLI writes telemetry to stdout, not stderr — lines of
 *    {"_tag":"Error",...} that have already landed in the middle of this file
 *    once and broken every build that imported it.
 * 2. It ends with a trailing blank line that nothing else in the repo has.
 *
 * This lives in a file rather than inline in package.json because the inline
 * version used backticks to quote that telemetry prefix. Windows treats a
 * backtick inside double quotes as a literal; sh treats it as command
 * substitution. So the script worked on the machine it was written on and
 * silently mangled the file everywhere else, CI included, where it showed up
 * as `sh: 1: {_tag:Error: not found` and a types file missing its first line.
 */
import { writeFileSync } from "node:fs";

const TARGET = "packages/database/src/database.types.ts";
const TELEMETRY = /^\s*\{"_tag":"Error"/;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  const body = raw
    .split("\n")
    .filter((line) => !TELEMETRY.test(line))
    .join("\n")
    .trimEnd();

  // The failure this guards against is not a crash: it is writing something
  // plausible-looking over a file the whole repository type-checks against.
  // Both ways of getting here — the CLI erroring into stdout, or the filter
  // itself misbehaving — produce output that is missing the one thing every
  // valid generation contains.
  if (!body.includes("export type Database")) {
    process.stderr.write(
      `Refusing to write ${TARGET}: the generator produced no Database type.\n` +
        `Is the local database running? First 400 characters received:\n\n` +
        `${body.slice(0, 400)}\n`
    );
    process.exit(1);
  }

  writeFileSync(TARGET, `${body}\n`);
});
