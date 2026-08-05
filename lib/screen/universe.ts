// The screening universe: large- and mid-cap US listings across sectors,
// fixed in source so a run is reproducible and reviewable. Finnhub's index
// constituents endpoint is premium-only, so an index cannot be pulled live
// on the free tier.
//
// Size is bounded by the free-tier rate limit: the screen makes 3 calls per
// ticker, so a 54-name universe is ~162 calls per run.

export type UniverseEntry = {
  ticker: string;
  sector: string;
};

export const SCREEN_UNIVERSE: UniverseEntry[] = [
  { ticker: "AAPL", sector: "Technology" },
  { ticker: "MSFT", sector: "Technology" },
  { ticker: "NVDA", sector: "Technology" },
  { ticker: "AVGO", sector: "Technology" },
  { ticker: "ORCL", sector: "Technology" },
  { ticker: "CRM", sector: "Technology" },
  { ticker: "AMD", sector: "Technology" },
  { ticker: "ADBE", sector: "Technology" },
  { ticker: "CSCO", sector: "Technology" },
  { ticker: "TXN", sector: "Technology" },
  { ticker: "QCOM", sector: "Technology" },
  { ticker: "INTC", sector: "Technology" },
  { ticker: "GOOGL", sector: "Communication Services" },
  { ticker: "META", sector: "Communication Services" },
  { ticker: "NFLX", sector: "Communication Services" },
  { ticker: "DIS", sector: "Communication Services" },
  { ticker: "TMUS", sector: "Communication Services" },
  { ticker: "AMZN", sector: "Consumer Discretionary" },
  { ticker: "TSLA", sector: "Consumer Discretionary" },
  { ticker: "HD", sector: "Consumer Discretionary" },
  { ticker: "MCD", sector: "Consumer Discretionary" },
  { ticker: "NKE", sector: "Consumer Discretionary" },
  { ticker: "SBUX", sector: "Consumer Discretionary" },
  { ticker: "LOW", sector: "Consumer Discretionary" },
  { ticker: "WMT", sector: "Consumer Staples" },
  { ticker: "PG", sector: "Consumer Staples" },
  { ticker: "KO", sector: "Consumer Staples" },
  { ticker: "PEP", sector: "Consumer Staples" },
  { ticker: "COST", sector: "Consumer Staples" },
  { ticker: "MDLZ", sector: "Consumer Staples" },
  { ticker: "JPM", sector: "Financials" },
  { ticker: "BAC", sector: "Financials" },
  { ticker: "WFC", sector: "Financials" },
  { ticker: "GS", sector: "Financials" },
  { ticker: "MS", sector: "Financials" },
  { ticker: "AXP", sector: "Financials" },
  { ticker: "BLK", sector: "Financials" },
  { ticker: "UNH", sector: "Health Care" },
  { ticker: "JNJ", sector: "Health Care" },
  { ticker: "LLY", sector: "Health Care" },
  { ticker: "ABBV", sector: "Health Care" },
  { ticker: "MRK", sector: "Health Care" },
  { ticker: "PFE", sector: "Health Care" },
  { ticker: "TMO", sector: "Health Care" },
  { ticker: "AMGN", sector: "Health Care" },
  { ticker: "CAT", sector: "Industrials" },
  { ticker: "HON", sector: "Industrials" },
  { ticker: "UNP", sector: "Industrials" },
  { ticker: "GE", sector: "Industrials" },
  { ticker: "DE", sector: "Industrials" },
  { ticker: "XOM", sector: "Energy" },
  { ticker: "CVX", sector: "Energy" },
  { ticker: "COP", sector: "Energy" },
  { ticker: "NEE", sector: "Utilities" },
];
