/**
 * The keychain keys the outbound queue used before the local database.
 *
 * Their own module, with no imports, because two things need them: the
 * keychain storage that wrote them, and the one-time adoption that reads them
 * and clears them. Keeping them here means the adoption path does not have to
 * pull in the implementation it is replacing.
 */

export const QUEUE_KEY = "vetkeep.sync.outbound";
export const DEAD_KEY = "vetkeep.sync.dead_letter";
export const CHECKPOINT_KEY = "vetkeep.sync.checkpoints";
