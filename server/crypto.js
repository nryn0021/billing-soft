// Manual AES-256-GCM encryption for sensitive fields (bank account numbers).
// Preserved exactly from the original SQLite implementation: the key is derived
// from JMD_DATA_SECRET (env, preferred in containers) or a locally generated
// data/.jmd-secret file. The `.jmd-secret` file MUST be backed up alongside the
// database or encrypted bank details become unrecoverable.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.JMD_DATA_DIR ? path.resolve(process.env.JMD_DATA_DIR) : path.join(root, "data");
const secretPath = path.join(dataDirectory, ".jmd-secret");

function readDataSecret() {
  if (process.env.JMD_DATA_SECRET) return process.env.JMD_DATA_SECRET;
  mkdirSync(dataDirectory, { recursive: true });
  if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32).toString("base64url"), { mode: 0o600 });
  return readFileSync(secretPath, "utf8").trim();
}

const dataKey = createHash("sha256").update(readDataSecret()).digest();

export function encryptSensitive(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSensitive(value) {
  const text = String(value || "");
  if (!text) return "";
  if (!text.startsWith("v1:")) return text;
  try {
    const [, ivText, tagText, encryptedText] = text.split(":");
    const decipher = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
