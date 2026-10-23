/**
 * The slice of expo-sqlite this app actually uses.
 *
 * Declared as a port rather than imported directly so the storage built on it
 * can be tested in node, where expo-sqlite has no native module to bind to.
 * packages/sync already keeps the engine storage-agnostic for the same reason;
 * this does the same one layer down.
 */

export type SqliteParam = string | number | null;

export interface SqliteRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqliteDatabase {
  /** Several statements at once. No parameters, so never used with input. */
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqliteParam[]): Promise<SqliteRunResult>;
  getAllAsync<T>(sql: string, params?: SqliteParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqliteParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
