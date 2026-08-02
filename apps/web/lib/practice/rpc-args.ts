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

/** Empty strings from a form field mean "not supplied", not "set to empty". */
export function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}

/** Numeric form fields: blank stays absent, a non-number never reaches the database. */
export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
