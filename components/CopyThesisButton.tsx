"use client";

import { useState } from "react";

export function CopyThesisButton({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return <button type="button" className="button" onClick={async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("failed");
    }
  }}>{status === "copied" ? "Copied" : "Copy thesis"}<span className="sr-only" aria-live="polite">{status === "copied" ? "Thesis copied to clipboard." : status === "failed" ? "Could not copy the thesis. Select and copy the text manually." : ""}</span></button>;
}
