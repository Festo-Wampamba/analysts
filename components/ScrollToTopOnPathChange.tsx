"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

export function ScrollToTopOnPathChange() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
