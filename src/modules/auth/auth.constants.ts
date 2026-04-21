/** Auth security constants — cookie name, JWT lifetime, and PBKDF2 parameters. */
export const AUTH_COOKIE_NAME = "med-recallix-token";
export const JWT_EXPIRY = "7d";
export const PBKDF2_ITERATIONS = 100_000; // OWASP recommended minimum
export const SALT_LENGTH = 16;            // 128-bit random salt
export const HASH_LENGTH = 32;            // 256-bit derived key
