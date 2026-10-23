/**
 * A way to be offline without turning off the network.
 *
 * Testing the offline paths on a phone tethered to its own hotspot is
 * impossible the obvious way: the phone is the network, so aeroplane mode takes
 * Metro down with the internet and the app stops being able to load at all.
 * Even on a normal network it only half works — Expo Go fetches the bundle from
 * the dev server at launch, so an app that is force-closed while offline cannot
 * reopen, and reopening is the case most worth testing.
 *
 * So this cuts the one connection that matters instead. It is passed to
 * supabase-js as its fetch, which means it can only ever affect calls to the
 * database: Metro, Fast Refresh and the debugger are reached by other means and
 * are untouched. The app genuinely cannot talk to the server, while the laptop
 * it is being developed on carries on as normal.
 *
 * Development only, twice over: the client is given this fetch only under
 * __DEV__, and the filter below refuses to engage without it either. Both
 * checks are on a constant the bundler replaces at build time, so there is no
 * runtime path to switching a release build offline — not a flag that happens
 * to default to false, and not something a saved preference could flip.
 *
 * Checked rather than assumed: `expo export` leaves none of this in the
 * bundle. Neither the toggle's wording nor this module's state survives the
 * dead-code pass, which is the thing worth knowing — an inert switch that
 * shipped would still be a switch.
 *
 * It is not a substitute for the real thing. It proves the app behaves when the
 * server is unreachable; it does not prove the phone behaves when its radio is
 * off. A build installed on the device — which is also what makes the
 * force-close test possible — is what proves that.
 */

let simulated = false;
const listeners = new Set<() => void>();

/** The error React Native itself raises when a fetch cannot leave the device. */
const OFFLINE_MESSAGE = "Network request failed";

export function isSimulatedOffline(): boolean {
  return simulated;
}

export function setSimulatedOffline(next: boolean): void {
  if (simulated === next) return;
  simulated = next;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore, so a toggle reflects the state it just set. */
export function subscribeToSimulatedOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The fetch supabase-js is given in development.
 *
 * Rejects rather than returning a failed response on purpose: a refused
 * connection is not a 503, and the queue's own classifier distinguishes the two
 * — a transport failure is retried, a server rejection is not. Returning the
 * wrong shape here would prove the wrong thing.
 */
export const offlineAwareFetch: typeof fetch = (input, init) => {
  if (__DEV__ && simulated) {
    return Promise.reject(new TypeError(OFFLINE_MESSAGE));
  }
  return fetch(input, init);
};
