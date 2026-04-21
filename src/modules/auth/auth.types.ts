/**
 * Auth Domain Types
 *
 * AuthUser   — public user info returned by API (no sensitive fields)
 * StoredUser — full record in KV including password hash and salt
 * JWTPayload — decoded claims from the session token
 */

export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface JWTPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}
