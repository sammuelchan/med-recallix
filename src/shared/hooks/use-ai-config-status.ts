/**
 * Hook: AI Config Status
 *
 * Client-side hook that checks whether the AI API key has been configured.
 * Calls GET /api/config on mount and exposes { hasKey, loading }.
 *
 * Used by AIConfigBanner to conditionally show the "configure AI" prompt
 * on Dashboard and Chat pages.
 */
"use client";

import { useState, useEffect } from "react";

interface AIConfigStatus {
  hasKey: boolean;
  loading: boolean;
}

/** Returns whether the user has configured an AI API key. */
export function useAIConfigStatus(): AIConfigStatus {
  const [status, setStatus] = useState<AIConfigStatus>({
    hasKey: true,
    loading: true,
  });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setStatus({ hasKey: !!json.data.hasKey, loading: false });
        } else {
          setStatus({ hasKey: false, loading: false });
        }
      })
      .catch(() => setStatus({ hasKey: false, loading: false }));
  }, []);

  return status;
}
