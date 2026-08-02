/**
 * Retry pacing for the outbound queue, per brief section 18.3: every queued job
 * is retry-safe, bounded, and can record a final failed state.
 */

export const MAX_ATTEMPTS = 8;

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 15 * 60 * 1000;

/**
 * Exponential backoff with a ceiling.
 *
 * `jitter` is injected rather than read from Math.random inside, so the pacing
 * is testable. In production a random jitter matters: a vet who drives back into
 * coverage syncs a whole day of queued work at once, and without it every device
 * that reconnected at the same moment would retry in lockstep.
 */
export function nextRetryDelayMs(attemptCount: number, jitter = 0): number {
  const clampedAttempt = Math.max(0, attemptCount);
  const exponential = BASE_DELAY_MS * 2 ** clampedAttempt;
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const spread = capped * 0.2 * clamp01(jitter);
  return Math.round(capped + spread);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * True once a mutation has failed often enough that retrying is no longer
 * useful. It moves to the dead-letter queue where it stays visible: a failed
 * clinical write must never disappear silently.
 */
export function shouldDeadLetter(attemptCount: number, maxAttempts = MAX_ATTEMPTS): boolean {
  return attemptCount >= maxAttempts;
}
