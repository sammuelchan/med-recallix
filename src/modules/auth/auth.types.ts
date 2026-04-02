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
