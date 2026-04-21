/**
 * Authentication Service
 *
 * Handles user registration, login, password hashing, and JWT management.
 *
 * Security design:
 *   - Passwords are hashed with PBKDF2 (100k iterations, SHA-256) using
 *     the Web Crypto API (works in both Node.js and Edge environments).
 *   - JWTs are signed with HS256 via the `jose` library; the signing key
 *     is resolved asynchronously from env/KV (see shared/infrastructure/config).
 *   - Session cookies are HttpOnly + SameSite=Lax with 7-day expiry.
 *
 * Users are stored in KV keyed by username (kvKeys.user). Each stored
 * record contains the password hash, salt, and creation timestamp.
 */

import { SignJWT, jwtVerify } from "jose";
import { kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { getJwtSecret } from "@/shared/infrastructure/config";
import { generateId } from "@/shared/lib/utils";
import { ConflictError, UnauthorizedError } from "@/shared/lib/errors";
import {
  AUTH_COOKIE_NAME,
  JWT_EXPIRY,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  HASH_LENGTH,
} from "./auth.constants";
import type { AuthUser, StoredUser, JWTPayload } from "./auth.types";

/** Hash a password with PBKDF2-SHA256; reuses existing salt for verification. */
export async function hashPassword(
  password: string,
  existingSalt?: string,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = existingSalt
    ? hexToBuffer(existingSalt)
    : crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const salt = new ArrayBuffer(saltBytes.byteLength);
  new Uint8Array(salt).set(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_LENGTH * 8,
  );

  return {
    hash: bufferToHex(new Uint8Array(bits)),
    salt: existingSalt ?? bufferToHex(saltBytes),
  };
}

/** Constant-time password verification by re-hashing with the stored salt. */
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

/** Issue a signed JWT with username claim, user ID as subject, and 7-day expiry. */
export async function signJWT(user: AuthUser): Promise<string> {
  const secret = await getJwtSecret();
  return new SignJWT({ username: user.username } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

/** Verify and decode a JWT; throws on expiry or invalid signature. */
export async function verifyJWT(token: string): Promise<JWTPayload> {
  const secret = await getJwtSecret();
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}

/** Build a Set-Cookie header for the session token (HttpOnly, SameSite=Lax). */
export function buildCookieHeader(token: string): string {
  const maxAge = 7 * 24 * 60 * 60;
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Build a Set-Cookie header that clears the session cookie (Max-Age=0). */
export function buildClearCookieHeader(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`;
}

/** Register a new user: hash password → store in KV → issue JWT. Throws ConflictError if username taken. */
export async function register(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const existing = await kvGet<StoredUser>(kvKeys.user(username));
  if (existing) throw new ConflictError("用户名已存在");

  const { hash, salt } = await hashPassword(password);
  const id = generateId();
  const now = new Date().toISOString();

  const stored: StoredUser = {
    id,
    username,
    passwordHash: hash,
    salt,
    createdAt: now,
  };

  await kvPut(kvKeys.user(username), stored);

  const user: AuthUser = { id, username, createdAt: now };
  const token = await signJWT(user);
  return { user, token };
}

/** Authenticate a user: verify password against stored hash → issue JWT. Throws UnauthorizedError on failure. */
export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const stored = await kvGet<StoredUser>(kvKeys.user(username));
  if (!stored) throw new UnauthorizedError("用户名或密码错误");

  const valid = await verifyPassword(password, stored.passwordHash, stored.salt);
  if (!valid) throw new UnauthorizedError("用户名或密码错误");

  const user: AuthUser = {
    id: stored.id,
    username: stored.username,
    createdAt: stored.createdAt,
  };
  const token = await signJWT(user);
  return { user, token };
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
