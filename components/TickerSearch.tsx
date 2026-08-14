"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function TickerSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ticker, setTicker] = useState("");

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <form
      className="nav-search"
      role="search"
      aria-label="Search a stock ticker"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = ticker.trim().toUpperCase();
        if (/^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/.test(normalized)) {
          router.push(`/research/${encodeURIComponent(normalized)}`);
        }
      }}
    >
      <button
        type="button"
        className="search-trigger"
        aria-label="Focus ticker search"
        onClick={() => inputRef.current?.focus()}
      >
        <svg className="nav-search__icon" aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="search"
        value={ticker}
        onChange={(event) => setTicker(event.target.value.toUpperCase())}
        placeholder="Search a ticker"
        aria-label="Ticker symbol"
        maxLength={9}
        autoComplete="off"
      />
      <kbd>/</kbd>
    </form>
  );
}
