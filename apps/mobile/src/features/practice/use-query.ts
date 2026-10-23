import { useCallback, useEffect, useState } from "react";

export type QueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True when `data` is from an earlier read and the latest one failed. */
  stale: boolean;
};

type QueryResult<T> = QueryState<T> & { reload: () => void };

export const INITIAL_QUERY_STATE: QueryState<never> = {
  data: null,
  error: null,
  loading: true,
  stale: false
};

/** A read that came back. Replaces everything, including a previous failure. */
export function settled<T>(result: T): QueryState<T> {
  return { data: result, error: null, loading: false, stale: false };
}

/**
 * A read that did not come back.
 *
 * Separated from the hook so the rule it encodes can be tested, because the
 * rule is the whole point and it is easy to get backwards: what was on screen
 * stays on screen. These two functions are pure, which is the only reason that
 * is checkable without a renderer.
 */
export function failed<T>(previous: QueryState<T>, reason: unknown): QueryState<T> {
  return {
    // Kept. On a first load there is nothing to keep and this is null anyway,
    // which is the case the empty states already handle.
    data: previous.data,
    error: reason instanceof Error ? reason.message : "Something went wrong.",
    loading: false,
    stale: previous.data !== null
  };
}

/**
 * A minimal loader for screen data.
 *
 * Deliberately not a caching library: a vet in the field needs the record in
 * front of them to be what the server actually holds, and a stale cached read of
 * a clinical record is worse than a spinner. Phase 3 replaces this with the
 * offline store, which is a different problem with different rules.
 *
 * State is written only once the promise settles, never synchronously inside the
 * effect. A reload therefore keeps the current data on screen until the new data
 * arrives, which avoids a spinner flashing over a record the vet is reading.
 *
 * A failed reload keeps it too, which it did not used to. Clearing the data on
 * failure meant that the moment a read went wrong the record emptied — and
 * every write calls reload, so recording a treatment with no signal wiped the
 * consultation off the screen it had just been added to. Losing the record in
 * front of the vet is a worse answer to "the network is down" than showing what
 * was last read and saying so.
 *
 * Which is what `stale` is for. The brief's worry — that a cached clinical read
 * is worse than a spinner — is right, and the answer to it is to mark the data
 * rather than to delete it.
 */
export function useQuery<T>(run: () => Promise<T>, deps: unknown[]): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>(INITIAL_QUERY_STATE);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    run()
      .then((result) => {
        if (active) setState(settled(result));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState((previous) => failed(previous, reason));
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload };
}
