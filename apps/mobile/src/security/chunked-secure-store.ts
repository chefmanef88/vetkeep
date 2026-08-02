import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;
const INDEX_SUFFIX = ":chunks";

/**
 * getItem refuses to reassemble more than this many chunks, so writing more
 * would store a value that can never be read back. Refusing the write is the
 * only safe answer: silently accepting it loses whatever the caller stored.
 */
const MAX_CHUNKS = 100;
export const MAX_VALUE_LENGTH = CHUNK_SIZE * MAX_CHUNKS;

async function removeChunks(key: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${key}:${index}`))
  );
}

export const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const countValue = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    if (!countValue) return SecureStore.getItemAsync(key);
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}:${index}`))
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length > MAX_VALUE_LENGTH) {
      throw new Error(
        `Value for "${key}" is ${value.length} characters, above the ${MAX_VALUE_LENGTH} this store can read back.`
      );
    }
    const oldCountValue = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    const oldCount = Number(oldCountValue ?? 0);
    if (oldCount > 0) await removeChunks(key, oldCount);
    await SecureStore.deleteItemAsync(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      await SecureStore.deleteItemAsync(`${key}${INDEX_SUFFIX}`);
      return;
    }

    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${key}:${index}`, chunk, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        })
      )
    );
    await SecureStore.setItemAsync(`${key}${INDEX_SUFFIX}`, String(chunks.length), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  },

  async removeItem(key: string): Promise<void> {
    const countValue = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    const count = Number(countValue ?? 0);
    if (count > 0) await removeChunks(key, count);
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(`${key}${INDEX_SUFFIX}`)
    ]);
  }
};
