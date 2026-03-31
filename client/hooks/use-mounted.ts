"use client";

import * as React from "react";

/** True only after the first client commit — avoids Radix/useId hydration mismatches for SSR. */
export function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
