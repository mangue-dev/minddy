"use client";
import { useEffect, useRef } from "react";
import { useOptionalAppTabNavigation } from "./app-tabs-context";

/** Close transient surfaces on activation, while retaining startup deep links. */
export function useAppTabChange(onChange: () => void) {
  const activeId = useOptionalAppTabNavigation()?.activeId;
  const previous = useRef(activeId);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (previous.current && activeId && previous.current !== activeId) callback.current();
    previous.current = activeId;
  }, [activeId]);
}
