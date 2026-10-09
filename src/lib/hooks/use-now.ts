"use client";

import { useEffect, useState } from "react";

/** Current time, refreshed periodically, so "last 7 days" style views stay pure during render. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
