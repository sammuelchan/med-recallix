/**
 * Input Validators — lightweight checks for auth fields and API key masking.
 *
 * Note: production auth validation uses Zod schemas in auth.service;
 * these functions are available for client-side pre-checks.
 */

/** 3–20 chars, alphanumeric + underscore only. */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 6;
}

/** Mask an API key for safe display (e.g. "sk-ab****yz"). */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
