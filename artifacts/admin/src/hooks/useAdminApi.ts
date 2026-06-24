import { useAuth } from "@clerk/react";
import { useCallback } from "react";

const BASE = "/api";

export function useAdminApi() {
  const { getToken } = useAuth();

  const request = useCallback(
    async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Request failed");
      }
      return res.json();
    },
    [getToken],
  );

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  };
}
