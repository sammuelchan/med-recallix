"use client";

import { useState, useEffect } from "react";

interface AIConfigStatus {
  hasKey: boolean;
  loading: boolean;
}

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
