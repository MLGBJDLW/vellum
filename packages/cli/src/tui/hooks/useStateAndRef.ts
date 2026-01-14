/**
 * useStateAndRef Hook
 *
 * Combines useState and useRef to provide both reactive state and
 * a stable ref for use in callbacks without stale closures.
 *
 * Pattern from Gemini CLI - solves the problem where callbacks
 * capture stale state values.
 *
 * @module tui/hooks/useStateAndRef
 */

import { useCallback, useRef, useState } from "react";

/**
 * Combines useState and useRef to provide both reactive state and
 * a stable ref for use in callbacks without stale closures.
 *
 * Pattern from Gemini CLI - solves the problem where callbacks
 * capture stale state values.
 *
 * @example
 * const [messages, messagesRef, setMessages] = useStateAndRef<Message[]>([]);
 *
 * // In callbacks, read from ref for latest value:
 * const handleText = useCallback((text) => {
 *   const current = messagesRef.current; // Always latest
 *   setMessages([...current, { text }]);
 * }, []); // Empty deps = stable callback
 *
 * @param initialValue - Initial state value
 * @returns Tuple of [state, ref, setState]
 */
export function useStateAndRef<T>(
  initialValue: T
): readonly [T, React.RefObject<T>, (newValue: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const ref = useRef<T>(initialValue);

  const setStateAndRef = useCallback((newValue: T | ((prev: T) => T)) => {
    const resolved =
      typeof newValue === "function" ? (newValue as (prev: T) => T)(ref.current) : newValue;
    ref.current = resolved;
    setState(resolved);
  }, []);

  return [state, ref, setStateAndRef] as const;
}

export default useStateAndRef;
