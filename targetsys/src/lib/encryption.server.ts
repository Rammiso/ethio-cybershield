// AES-256-GCM symmetric encryption for integration credential secrets (APP_ENCRYPTION_KEY).

const DEFAULT_SECRET = "shieldbank-app-encryption-key-default-32bytes-pass";

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret =
    (typeof process !== "undefined" && process.env?.["APP_ENCRYPTION_KEY"]) ||
    (typeof Bun !== "undefined" && Bun.env?.["APP_ENCRYPTION_KEY"]) ||
    DEFAULT_SECRET;

  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts a plaintext secret string using AES-256-GCM.
 * Returns `${ivHex}:${ciphertextHex}`.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const cipherHex = Array.from(new Uint8Array(cipherBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${ivHex}:${cipherHex}`;
}

/**
 * Decrypts a ciphertext string created by encryptSecret.
 * If the string does not have the iv:ciphertext format, returns it as-is for development convenience.
 */
export async function decryptSecret(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.includes(":")) {
    return ciphertext;
  }

  const [ivHex, cipherHex] = ciphertext.split(":");
  if (!ivHex || !cipherHex || ivHex.length !== 24) {
    return ciphertext;
  }

  try {
    const key = await getEncryptionKey();
    const iv = new Uint8Array(
      ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const cipherBytes = new Uint8Array(
      cipherHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBytes,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // Return original string if decryption fails (e.g. was plaintext)
    return ciphertext;
  }
}
