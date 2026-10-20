/**
 * Reading a row out of a query result, for the tests.
 *
 * This repo sets noUncheckedIndexedAccess, so `rows[0]` is `T | undefined` and
 * every assertion on it needs narrowing. Weakening that for the tests would be
 * the wrong trade — it is on because a missing row is a real thing that
 * happens. Throwing here instead gives the test a clear failure at the line
 * that expected a row, rather than a non-null assertion that quietly reads
 * undefined and fails somewhere less obvious.
 */

export function row<T>(rows: readonly T[], index = 0): T {
  const found = rows[index];
  if (found === undefined) {
    throw new Error(`expected a row at index ${index}, but there were ${rows.length}`);
  }
  return found;
}
