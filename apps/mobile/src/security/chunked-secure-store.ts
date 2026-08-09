import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;

/**
 * SecureStore accepts only alphanumerics and ".", "-" and "_" in a key, and
 * rejects anything else outright.
 *
 * This is not cosmetic. Every read starts by looking up the chunk-count key, so
 * a separator outside that set makes the very first call throw and no value can
 * ever be read back. That is what a colon did here: it broke Supabase session
 * persistence, the outbound sync queue and the attachment queue alike, and went
 * unnoticed because nothing had run on a device.
 */
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const INDEX_SUFFIX = ".__chunks";
const CHUNK_INFIX = ".__chunk.";

/**
 * getItem refuses to reassemble more than this many chunks, so writing more
 * would store a value that can never be read back. Refusing the write is the
 * only safe answer: silently accepting it loses whatever the caller stored.
 */
const MAX_CHUNKS = 100;
export const MAX_VALUE_LENGTH = CHUNK_SIZE * MAX_CHUNKS;

/**
 * Fails at the call site rather than inside SecureStore, where the message
 * names neither the key nor the caller.
 */
function assertUsableKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      `"${key}" cannot be a secure store key. Use only letters, digits, ".", "-" and "_".`
    );
  }
}

function indexKey(key: string): string {
  return `${key}${INDEX_SUFFIX}`;
}

function chunkKey(key: string, index: number): string {
  return `${key}${CHUNK_INFIX}${index}`;
}

async function removeChunks(key: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index)))
  );
}

export const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    assertUsableKey(key);
    const countValue = await SecureStore.getItemAsync(indexKey(key));
    if (!countValue) return SecureStore.getItemAsync(key);
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index)))
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    assertUsableKey(key);
    if (value.length > MAX_VALUE_LENGTH) {
      throw new Error(
        `Value for "${key}" is ${value.length} characters, above the ${MAX_VALUE_LENGTH} this store can read back.`
      );
    }
    const oldCountValue = await SecureStore.getItemAsync(indexKey(key));
    const oldCount = Number(oldCountValue ?? 0);
    if (oldCount > 0) await removeChunks(key, oldCount);
    await SecureStore.deleteItemAsync(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      await SecureStore.deleteItemAsync(indexKey(key));
      return;
    }

    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        })
      )
    );
    await SecureStore.setItemAsync(indexKey(key), String(chunks.length), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  },

  async removeItem(key: string): Promise<void> {
    assertUsableKey(key);
    const countValue = await SecureStore.getItemAsync(indexKey(key));
    const count = Number(countValue ?? 0);
    if (count > 0) await removeChunks(key, count);
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(indexKey(key))
    ]);
  }
};
