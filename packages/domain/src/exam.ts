/**
 * The order a physical examination is actually performed in.
 *
 * The database stores the eleven systems as text and a query returns them
 * alphabetically, which puts Aural before Cardiovascular before
 * Gastrointestinal — an order no clinician works in. A vet moves head to tail:
 * overall impression first, then the head, the neck, the chest, the abdomen,
 * the hindquarters, the limbs, and finally the assessments made throughout.
 *
 * Presenting the list out of order costs more than tidiness. An examination
 * followed down a screen is a checklist; one that jumps around the animal is a
 * lookup exercise, and systems get missed.
 */

export const EXAM_SYSTEM_ORDER = [
  // Standing back and looking at the animal before touching it.
  "General",
  // Head.
  "Ocular",
  "Aural",
  // Neck and the drainage the head empties into.
  "Lymphatic",
  // Chest.
  "Cardiovascular",
  "Respiratory",
  // Abdomen, front to back.
  "Gastrointestinal",
  "Urogenital",
  // Limbs.
  "Musculoskeletal",
  // Assessed throughout the examination and concluded at the end.
  "Neurological",
  "Integumentary"
] as const;

export type ExamSystem = (typeof EXAM_SYSTEM_ORDER)[number];

/**
 * Position in the examination. An unrecognised system sorts to the end rather
 * than to the front, so a name added to the database before this list is
 * updated appears last instead of displacing the head of the examination.
 */
export function examSystemRank(systemName: string): number {
  const index = (EXAM_SYSTEM_ORDER as readonly string[]).indexOf(systemName);
  return index === -1 ? EXAM_SYSTEM_ORDER.length : index;
}

/** Sorts a copy; the caller's array is left alone. */
export function sortByExamOrder<T extends { system_name: string }>(findings: readonly T[]): T[] {
  return [...findings].sort((a, b) => {
    const rank = examSystemRank(a.system_name) - examSystemRank(b.system_name);
    // Alphabetical only as a tie-break, so two unknown systems keep a stable order.
    return rank !== 0 ? rank : a.system_name.localeCompare(b.system_name);
  });
}
