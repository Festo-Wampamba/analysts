/**
 * Keep generated prose readable without em or en dash punctuation.
 * Hyphenated words and numeric minus signs are intentionally unchanged.
 */
export function removeStatementDashes(value: string): string {
  return value.replace(/\s*[—–]\s*/g, ": ").replace(/ {2,}/g, " ").trim();
}
