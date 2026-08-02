import { useCallback, useEffect, useState } from "react";

type QueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

type QueryResult<T> = QueryState<T> & { reload: () => void };

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
 */
export function useQuery<T>(run: () => Promise<T>, deps: unknown[]): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    loading: true
  });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    run()
      .then((result) => {
        if (active) setState({ data: result, error: null, loading: false });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState({
          data: null,
          error: reason instanceof Error ? reason.message : "Something went wrong.",
          loading: false
        });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload };
}
