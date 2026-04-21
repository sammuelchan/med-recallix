/**
 * Shared API Type Definitions
 *
 * Standard response envelopes for all API routes:
 *   - ApiResponse<T>      — single-item success/error wrapper
 *   - ApiError            — error detail shape
 *   - PaginatedResponse<T> — list with total count and hasMore flag
 *
 * These types are available for future type-safe API consumers
 * (e.g. SWR hooks, tRPC-like wrappers).
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}
