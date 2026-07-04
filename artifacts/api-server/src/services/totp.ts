/**
 * TOTP (RFC 6238) implementation using only Node.js built-in crypto.
 * No external packages required.
 */
import { createHmac, randomBytes } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function b32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function b32Decode(s: string): Buffer {
  const str = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  const bytes: number[] = [];
  let bits = 0, val = 0;
  for (const c of str) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // counter as 8-byte big-endian (handle up to 2^32)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[19] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return b32Encode(randomBytes(20));
}

export function generateTOTP(secret: string, windowOffset = 0): string {
  const counter = Math.floor(Date.now() / 30_000) + windowOffset;
  return hotp(b32Decode(secret), counter);
}

/** Validates a 6-digit code against the secret, allowing ±1 time-step for clock drift. */
export function verifyTOTP(secret: string, token: string): boolean {
  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) return false;
  for (const w of [-1, 0, 1]) {
    if (generateTOTP(secret, w) === token) return true;
  }
  return false;
}

/** Builds the otpauth:// URL that authenticator apps (Google Authenticator, Authy) scan. */
export function buildOtpAuthUrl(secret: string, email: string, issuer = "TrustCorp"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params}`;
}

/** Formats a raw base32 secret into groups of 4 for easy manual entry. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
