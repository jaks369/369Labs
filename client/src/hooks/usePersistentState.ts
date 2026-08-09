import { useCallback, useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* ignore corrupt values */
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full / unavailable */
    }
  }, [key, value]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(typeof initial === "function" ? (initial as () => T)() : initial);
  }, [key, initial]);

  return [value, setValue, reset] as const;
}
