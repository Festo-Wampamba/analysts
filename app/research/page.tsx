"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResearchSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (ticker) router.push(`/research/${ticker}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Research a ticker</h1>
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AAPL"
          aria-label="Ticker symbol"
          className="flex-1 rounded-lg border border-hairline bg-surface-1 px-4 py-2 text-ink outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        >
          Search
        </button>
      </form>
    </main>
  );
}
