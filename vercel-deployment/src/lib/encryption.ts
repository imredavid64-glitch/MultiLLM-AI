/**
 * Encryption utilities for API key storage (TypeScript version)
 */

let encryptionKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
  if (encryptionKey) return encryptionKey;

  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error("ENCRYPTION_KEY not set in environment");
  }

  // Decode base64 key
  const keyBytes = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  
  // Import as AES-GCM key
  encryptionKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  
  return encryptionKey;
}

export async function encryptApiKey(apiKey: string): Promise<string> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  // Combine IV + encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  
  // Return as base64
  return btoa(String.fromCharCode.apply(null, Array.from(result)));
}

export async function decryptApiKey(encryptedKey: string): Promise<string> {
  const key = await getEncryptionKey();
  
  // Decode from base64
  const data = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes)
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export function generateEncryptionKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)));
}