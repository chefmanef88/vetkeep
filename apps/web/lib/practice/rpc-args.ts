/**
 * The argument helpers live in @vetkeep/contracts so web and mobile cannot drift
 * in how they treat an unsupplied field. This module adapts them to the browser,
 * where form values arrive as FormDataEntryValue rather than string.
 */
import {
  optionalNumber as optionalNumberValue,
  optionalText as optionalTextValue
} from "@vetkeep/contracts";

export { definedArgs } from "@vetkeep/contracts";

/** Empty strings from a form field mean "not supplied", not "set to empty". */
export function optionalText(value: FormDataEntryValue | null): string | undefined {
  return optionalTextValue(value === null ? null : String(value));
}

/** Numeric form fields: blank stays absent, a non-number never reaches the database. */
export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  return optionalNumberValue(value === null ? null : String(value));
}
