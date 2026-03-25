/**
 * Ponyfill for `Object.fromEntries`, because our compile target ES2017, which
 * does not include `Object.fromEntries`.
 */
export default function fromEntries<K extends PropertyKey, T>(
  entries: Iterable<readonly [K, T]>,
): Record<K, T> {
  const result: Partial<Record<K, T>> = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result as Record<K, T>;
}
