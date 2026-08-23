"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SCREEN_UNIVERSE } from "@/lib/screen/universe";

const RECENT_SEARCHES_KEY = "analysts.recent-tickers";

const companyNames: Record<string, string> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AVGO: "Broadcom", ORCL: "Oracle", CRM: "Salesforce", AMD: "AMD", ADBE: "Adobe", CSCO: "Cisco", TXN: "Texas Instruments", QCOM: "Qualcomm", INTC: "Intel",
  GOOGL: "Alphabet", META: "Meta Platforms", NFLX: "Netflix", DIS: "Walt Disney", TMUS: "T-Mobile", AMZN: "Amazon", TSLA: "Tesla", HD: "Home Depot", MCD: "McDonald's", NKE: "Nike", SBUX: "Starbucks", LOW: "Lowe's",
  WMT: "Walmart", PG: "Procter & Gamble", KO: "Coca-Cola", PEP: "PepsiCo", COST: "Costco", MDLZ: "Mondelez", JPM: "JPMorgan Chase", BAC: "Bank of America", WFC: "Wells Fargo", GS: "Goldman Sachs", MS: "Morgan Stanley", AXP: "American Express", BLK: "BlackRock",
  UNH: "UnitedHealth", JNJ: "Johnson & Johnson", LLY: "Eli Lilly", ABBV: "AbbVie", MRK: "Merck", PFE: "Pfizer", TMO: "Thermo Fisher Scientific", AMGN: "Amgen", CAT: "Caterpillar", HON: "Honeywell", UNP: "Union Pacific", GE: "GE Aerospace", DE: "Deere", XOM: "Exxon Mobil", CVX: "Chevron", COP: "ConocoPhillips", NEE: "NextEra Energy",
};

const knownTickers = SCREEN_UNIVERSE.map((entry) => ({
  ...entry,
  name: companyNames[entry.ticker] ?? entry.ticker,
}));

type Suggestion = (typeof knownTickers)[number];

function fuzzyMatch(query: string, value: string): boolean {
  let cursor = 0;
  for (const character of query) {
    cursor = value.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

function suggestionsFor(query: string): Suggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return knownTickers
    .map((entry) => {
      const ticker = entry.ticker.toLowerCase();
      const name = entry.name.toLowerCase();
      const rank = ticker.startsWith(normalized) ? 0 : name.startsWith(normalized) ? 1 : ticker.includes(normalized) || name.includes(normalized) ? 2 : fuzzyMatch(normalized, `${ticker} ${name}`) ? 3 : 99;
      return { entry, rank };
    })
    .filter((match) => match.rank < 99)
    .sort((a, b) => a.rank - b.rank || a.entry.ticker.localeCompare(b.entry.ticker))
    .slice(0, 8)
    .map((match) => match.entry);
}

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearch(ticker: string, recent: string[]) {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([ticker, ...recent.filter((item) => item !== ticker)].slice(0, 5)));
  } catch {
    // Storage can be disabled; search remains usable without history.
  }
}

export function TickerSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ticker, setTicker] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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

  const matches = useMemo(() => suggestionsFor(ticker), [ticker]);
  const recentSuggestions = useMemo(
    () => recent.map((item) => knownTickers.find((entry) => entry.ticker === item) ?? { ticker: item, sector: "Recent search", name: item }),
    [recent],
  );
  const visibleSuggestions = ticker.trim() ? matches : focused ? recentSuggestions : [];
  const listId = "ticker-search-suggestions";

  function navigateTo(nextTicker: string) {
    const normalized = nextTicker.trim().toUpperCase();
    if (!/^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/.test(normalized)) return;
    const nextRecent = [normalized, ...recent.filter((item) => item !== normalized)].slice(0, 5);
    setRecent(nextRecent);
    writeRecentSearch(normalized, recent);
    setTicker(normalized);
    setActiveIndex(-1);
    router.push(`/research/${encodeURIComponent(normalized)}`);
  }

  return (
    <form
      className="nav-search"
      role="search"
      aria-label="Search a stock ticker"
      onSubmit={(event) => {
        event.preventDefault();
        navigateTo(visibleSuggestions[activeIndex]?.ticker ?? ticker);
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
        role="combobox"
        value={ticker}
        onChange={(event) => { setTicker(event.target.value.toUpperCase()); setActiveIndex(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, visibleSuggestions.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, -1)); }
          if (event.key === "Escape") setActiveIndex(-1);
          if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); navigateTo(visibleSuggestions[activeIndex]?.ticker ?? ticker); }
        }}
        placeholder="Search a ticker"
        aria-label="Ticker symbol"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={visibleSuggestions.length > 0}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${visibleSuggestions[activeIndex]?.ticker}` : undefined}
        maxLength={9}
        autoComplete="off"
      />
      <kbd>/</kbd>
      {visibleSuggestions.length > 0 && (
        <div className="ticker-suggestions" id={listId} role="listbox" aria-label={ticker.trim() ? "Ticker suggestions" : "Recent searches"}>
          {!ticker.trim() && <div className="ticker-suggestions__label">Recent searches <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setRecent([]); try { window.localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* ignore */ } }}>Clear</button></div>}
          {visibleSuggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              id={`${listId}-${suggestion.ticker}`}
              className={index === activeIndex ? "is-active" : ""}
              key={suggestion.ticker}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => navigateTo(suggestion.ticker)}
            >
              <strong>{suggestion.ticker}</strong>{" "}<span>{suggestion.name}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
