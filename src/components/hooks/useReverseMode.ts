import { useCallback, useState } from "react";

/**
 * Per-set "reverse mode" preference, persisted in localStorage under
 * `reverseMode:<setId>`. Defaults to `false` when no value is stored.
 *
 * The initial value is read in the useState initializer (guarded for SSR);
 * consumers are `client:load` islands so there is no hydration mismatch and
 * no Front→Back flash. Nothing is written on mount — only an explicit
 * `setReverse(...)` call persists the choice.
 */
export function useReverseMode(setId: string): [boolean, (value: boolean) => void] {
  const storageKey = `reverseMode:${setId}`;

  const [reverse, setReverse] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "true";
  });

  const persistReverse = useCallback(
    (value: boolean) => {
      setReverse(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, value ? "true" : "false");
      }
    },
    [storageKey],
  );

  return [reverse, persistReverse];
}
