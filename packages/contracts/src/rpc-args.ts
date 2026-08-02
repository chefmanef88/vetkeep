/**
 * Helpers for building controlled-RPC arguments. Shared by web and mobile so the
 * two clients cannot drift in how they treat an unsupplied field.
 */

/**
 * Drops keys whose value is `undefined`.
 *
 * The generated RPC argument types are checked under `exactOptionalPropertyTypes`,
 * where an explicit `undefined` is not the same as an absent key. That
 * distinction matters beyond the type system: sending an explicit null through
 * PostgREST overwrites a column, whereas omitting the key lets the function's own
 * default apply. Building the object and then stripping undefined keeps call
 * sites readable without pushing a conditional spread onto every optional field.
 */
export function definedArgs<T extends object>(
  args: T
): {
  [K in keyof T]-?: Exclude<T[K], undefined>;
} {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]-?: Exclude<T[K], undefined>;
  };
}

/** A blank field means "not supplied", never "set this to an empty string". */
export function optionalText(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

/** Blank stays absent, and a value that is not a number never reaches the database. */
export function optionalNumber(value: string | null | undefined): number | undefined {
  const text = (value ?? "").trim();
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses an amount a person typed into integer pesewas, per brief 4.3. Returns
 * null when the value is not a usable amount, so a caller cannot mistake a failed
 * parse for zero.
 */
export function parseCedisToPesewas(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  // Round after scaling: binary floating point drift would otherwise reach the ledger.
  return Math.round(Number(trimmed) * 100);
}

export function formatPesewas(pesewas: number, currency = "GHS"): string {
  return `${currency} ${(pesewas / 100).toFixed(2)}`;
}
