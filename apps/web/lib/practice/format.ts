/**
 * Money is stored as integer pesewas everywhere, per brief 4.3. These helpers are
 * the only place the UI converts between that and what a person reads, so a
 * float never reaches the database.
 */

export function formatPesewas(pesewas: number, currency = "GHS"): string {
  const major = pesewas / 100;
  return `${currency} ${major.toFixed(2)}`;
}

/**
 * Parses a cedi amount typed by a person into integer pesewas. Returns null when
 * the value is not a usable amount, so a caller cannot mistake a bad parse for
 * zero.
 */
export function parseCedisToPesewas(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  // Round after scaling: 0.1 + 0.2 style drift would otherwise reach the ledger.
  return Math.round(Number(trimmed) * 100);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Turns a database error into something a vet can act on. */
export function readableError(message: string): string {
  if (message.includes("Multi-factor authentication required")) {
    return "Your session needs re-verification. Sign in again to continue.";
  }
  if (message.includes("Active veterinarian account required")) {
    return "This account cannot make changes. Contact VetKeep support.";
  }
  return message;
}
