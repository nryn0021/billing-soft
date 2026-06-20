import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = scryptSync(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function newCsrfToken() {
  return randomBytes(24).toString("base64url");
}

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
