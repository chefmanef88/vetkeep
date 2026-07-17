const SENSITIVE_KEYS = new Set([
  "password",
  "access_token",
  "refresh_token",
  "authorization",
  "phone",
  "phone_display",
  "phone_e164",
  "email",
  "address",
  "owner_name",
  "client_name",
  "chief_complaint",
  "history_of_complaint",
  "soap",
  "clinical_notes",
  "diagnosis",
  "treatment_plan"
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(nested)
    ])
  );
}

export function log(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    context: redact(context)
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}
