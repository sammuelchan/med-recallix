"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "./auth.types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const json = await res.json();
        setUser(json.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/me", { method: "DELETE" }).catch(() => {});
    document.cookie =
      "med-recallix-token=; Path=/; Max-Age=0";
    setUser(null);
    window.location.href = "/login";
  }, []);

  return { user, loading, logout, refresh: fetchUser };
}
