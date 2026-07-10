/**
 * Auto-scroll behavior for the chat log: stick to the bottom on new messages, but don't
 * yank the view down if the user has scrolled up to read history (threshold ~120px).
 */

import { useCallback, useEffect, useRef } from "react";

const PIN_THRESHOLD_PX = 120;

export function useAutoScroll<T>(dep: T) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const isNearBottom = (el: HTMLDivElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD_PX;

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) pinnedRef.current = isNearBottom(el);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    pinnedRef.current = true;
  }, []);

  // On dependency change (new message / typing), stick to bottom only if already pinned.
  useEffect(() => {
    const el = containerRef.current;
    if (el && pinnedRef.current) el.scrollTo({ top: el.scrollHeight });
  }, [dep]);

  return { containerRef, onScroll, scrollToBottom };
}
