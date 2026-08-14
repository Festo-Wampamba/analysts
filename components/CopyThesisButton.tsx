"use client";

import { useState } from "react";

export function CopyThesisButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="button" onClick={async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }}>{copied ? "Copied" : "Copy thesis"}</button>;
}
