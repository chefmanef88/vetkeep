import { describe, expect, it } from "vitest";

import { INITIAL_QUERY_STATE, failed, settled, type QueryState } from "./use-query";

/**
 * The rule these guard is one sentence: what was on screen stays on screen.
 *
 * It is worth a test because it was wrong, and wrong in a way nothing caught.
 * Every write calls reload, so a read that failed after a save emptied the
 * consultation the save had just been added to — the queue held the record and
 * the screen had nowhere left to show it. Typecheck cannot see that, and the
 * hook cannot be exercised without a renderer, so the decision lives in a pure
 * function instead.
 */

const loaded: QueryState<string[]> = {
  data: ["a treatment the vet can see"],
  error: null,
  loading: false,
  stale: false
};

describe("settled", () => {
  it("replaces everything, including a previous failure", () => {
    const after = settled(["fresh from the server"]);
    expect(after).toEqual({
      data: ["fresh from the server"],
      error: null,
      loading: false,
      stale: false
    });
  });

  it("clears a stale mark once the read succeeds again", () => {
    const recovered = settled(["fresh"]);
    expect(recovered.stale).toBe(false);
    expect(recovered.error).toBeNull();
  });

  it("can settle on emptiness", () => {
    // An empty list is an answer. It is not the same as not having asked.
    const after = settled([]);
    expect(after.data).toEqual([]);
    expect(after.stale).toBe(false);
  });
});

describe("failed", () => {
  it("keeps what was already on screen", () => {
    const after = failed(loaded, new Error("Network request failed"));
    expect(after.data).toEqual(["a treatment the vet can see"]);
  });

  it("marks kept data as stale", () => {
    const after = failed(loaded, new Error("Network request failed"));
    expect(after.stale).toBe(true);
    expect(after.error).toBe("Network request failed");
    expect(after.loading).toBe(false);
  });

  it("is not stale when there was nothing to keep", () => {
    // A first read that fails has nothing behind it, so the empty state is the
    // honest thing to show rather than a warning about data nobody has.
    const after = failed(INITIAL_QUERY_STATE, new Error("Network request failed"));
    expect(after.data).toBeNull();
    expect(after.stale).toBe(false);
  });

  it("keeps data across repeated failures", () => {
    // Offline, every save triggers another failed reload. The record must
    // survive all of them, not just the first.
    let state: QueryState<string[]> = loaded;
    for (let i = 0; i < 5; i++) state = failed(state, new Error("Network request failed"));

    expect(state.data).toEqual(["a treatment the vet can see"]);
    expect(state.stale).toBe(true);
  });

  it("describes a thrown non-error without claiming to know what it was", () => {
    const after = failed(loaded, "something odd");
    expect(after.error).toBe("Something went wrong.");
    expect(after.data).toEqual(["a treatment the vet can see"]);
  });

  it("does not mutate the state it was given", () => {
    const before = { ...loaded };
    failed(loaded, new Error("Network request failed"));
    expect(loaded).toEqual(before);
  });
});

describe("the initial state", () => {
  it("starts loading with nothing and no error", () => {
    expect(INITIAL_QUERY_STATE).toEqual({
      data: null,
      error: null,
      loading: true,
      stale: false
    });
  });
});
