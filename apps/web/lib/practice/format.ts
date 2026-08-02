export { formatPesewas, parseCedisToPesewas } from "@vetkeep/contracts";

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
