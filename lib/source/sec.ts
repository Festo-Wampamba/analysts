import { z } from "zod";

import type { Provenance } from "@/lib/domain/provenance";
import { fetchWithRetry } from "@/lib/http/retry";
import { readProviderCache, writeProviderCache } from "./cache";
import { recordSourceCall } from "./log";

const PROVIDER = "sec";
const BASE_URL = "https://data.sec.gov";
const TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type SecCallContext = { ticker?: string; researchRunId?: number };

export type FinancialValue = {
  value: number;
  previousValue?: number;
  previousPeriodEnd?: string;
  unit: string;
  periodEnd: string;
  fiscalYear?: number;
  form: string;
  filed: string;
  accession: string;
};

export type FinancialSnapshot = {
  ticker: string;
  cik: string;
  entityName: string;
  periodEnd: string;
  filed: string;
  accession: string;
  revenue?: FinancialValue;
  grossProfit?: FinancialValue;
  operatingIncome?: FinancialValue;
  netIncome?: FinancialValue;
  dilutedEps?: FinancialValue;
  operatingCashFlow?: FinancialValue;
  capitalExpenditure?: FinancialValue;
  freeCashFlow?: FinancialValue;
  cash?: FinancialValue;
  debt?: FinancialValue;
  netCash?: FinancialValue;
};

const tickerMapSchema = z.record(
  z.string(),
  z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() }),
);

const factEntrySchema = z.object({
  val: z.number(),
  accn: z.string(),
  fy: z.number().nullable().optional(),
  fp: z.string().nullable().optional(),
  form: z.string(),
  filed: z.string(),
  start: z.string().optional(),
  end: z.string(),
  frame: z.string().nullable().optional(),
});

const companyFactsSchema = z.object({
  cik: z.number(),
  entityName: z.string(),
  facts: z.object({
    "us-gaap": z.record(
      z.string(),
      z.object({
        // SEC returns null for labels on some taxonomy facts. Labels are
        // metadata only; financial selection uses tags and units instead.
        label: z.string().nullable().optional(),
        units: z.record(z.string(), z.array(factEntrySchema)),
      }),
    ),
  }),
});

type CompanyFacts = z.infer<typeof companyFactsSchema>;
type FactEntry = z.infer<typeof factEntrySchema>;

const TAGS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  dilutedEps: ["EarningsPerShareDiluted"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditure: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  debtCurrent: ["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtCurrent"],
  debtNoncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent"],
} as const;

function annualEntries(facts: CompanyFacts, tags: readonly string[], unit: string): FactEntry[] {
  for (const tag of tags) {
    const entries = facts.facts["us-gaap"][tag]?.units[unit];
    if (!entries) continue;
    const annual = entries
      .filter((entry) => entry.form === "10-K" && entry.fp === "FY")
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
    if (annual.length) return annual;
  }
  return [];
}

function toFinancialValue(entries: FactEntry[], unit: string): FinancialValue | undefined {
  const latest = entries[0];
  if (!latest) return undefined;
  const previous = entries.find(
    (entry) => entry.end !== latest.end && entry.filed <= latest.filed,
  );
  return {
    value: latest.val,
    previousValue: previous?.val,
    previousPeriodEnd: previous?.end,
    unit,
    periodEnd: latest.end,
    fiscalYear: latest.fy ?? undefined,
    form: latest.form,
    filed: latest.filed,
    accession: latest.accn,
  };
}

function samePeriodDerived(
  left: FinancialValue | undefined,
  right: FinancialValue | undefined,
  operation: (a: number, b: number) => number,
): FinancialValue | undefined {
  if (!left || !right || left.periodEnd !== right.periodEnd) return undefined;
  const leftPrevious = left.previousValue;
  const rightPrevious = right.previousValue;
  const hasCoherentPrevious =
    leftPrevious !== undefined &&
    rightPrevious !== undefined &&
    left.previousPeriodEnd !== undefined &&
    left.previousPeriodEnd === right.previousPeriodEnd;
  const previousValue = hasCoherentPrevious
    ? operation(leftPrevious, rightPrevious)
    : undefined;
  return {
    ...left,
    value: operation(left.value, right.value),
    previousValue,
    previousPeriodEnd: hasCoherentPrevious ? left.previousPeriodEnd : undefined,
  };
}

export function normalizeCompanyFacts(
  ticker: string,
  raw: unknown,
): FinancialSnapshot {
  const facts = companyFactsSchema.parse(raw);
  const revenue = toFinancialValue(annualEntries(facts, TAGS.revenue, "USD"), "USD");
  const grossProfit = toFinancialValue(annualEntries(facts, TAGS.grossProfit, "USD"), "USD");
  const operatingIncome = toFinancialValue(annualEntries(facts, TAGS.operatingIncome, "USD"), "USD");
  const netIncome = toFinancialValue(annualEntries(facts, TAGS.netIncome, "USD"), "USD");
  const dilutedEps = toFinancialValue(annualEntries(facts, TAGS.dilutedEps, "USD/shares"), "USD/shares");
  const operatingCashFlow = toFinancialValue(annualEntries(facts, TAGS.operatingCashFlow, "USD"), "USD");
  const capitalExpenditure = toFinancialValue(annualEntries(facts, TAGS.capitalExpenditure, "USD"), "USD");
  const cash = toFinancialValue(annualEntries(facts, TAGS.cash, "USD"), "USD");
  const debtParts = [TAGS.debtCurrent, TAGS.debtNoncurrent]
    .map((tags) => toFinancialValue(annualEntries(facts, tags, "USD"), "USD"))
    .filter((value): value is FinancialValue => !!value);
  const debt = debtParts.length
    ? debtParts.slice(1).reduce((sum, value) => {
        if (value.periodEnd !== sum.periodEnd) return sum;
        const sumPrevious = sum.previousValue;
        const valuePrevious = value.previousValue;
        const hasCoherentPrevious =
          sumPrevious !== undefined &&
          valuePrevious !== undefined &&
          sum.previousPeriodEnd !== undefined &&
          sum.previousPeriodEnd === value.previousPeriodEnd;
        return {
          ...sum,
          value: sum.value + value.value,
          previousValue: hasCoherentPrevious
            ? sumPrevious + valuePrevious
            : undefined,
          previousPeriodEnd: hasCoherentPrevious ? sum.previousPeriodEnd : undefined,
        };
      }, debtParts[0])
    : undefined;
  const freeCashFlow = samePeriodDerived(operatingCashFlow, capitalExpenditure, (a, b) => a - Math.abs(b));
  const netCash = samePeriodDerived(cash, debt, (a, b) => a - b);
  const anchor = revenue ?? operatingIncome ?? netIncome ?? cash;
  if (!anchor) throw new Error(`SEC returned no supported financial facts for ${ticker}`);
  return {
    ticker,
    cik: String(facts.cik).padStart(10, "0"),
    entityName: facts.entityName,
    periodEnd: anchor.periodEnd,
    filed: anchor.filed,
    accession: anchor.accession,
    revenue,
    grossProfit,
    operatingIncome,
    netIncome,
    dilutedEps,
    operatingCashFlow,
    capitalExpenditure,
    freeCashFlow,
    cash,
    debt,
    netCash,
  };
}

async function secJson(url: string, endpoint: string, ctx: SecCallContext): Promise<unknown> {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) throw new Error("SEC_USER_AGENT is not set");
  const fetchedAt = new Date();
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      headers: { "user-agent": userAgent, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    await recordSourceCall({
      provider: PROVIDER,
      endpoint,
      ticker: ctx.ticker,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      researchRunId: ctx.researchRunId,
      meta: { error: (error as Error).message },
    });
    throw error;
  }
  const payload = await response.json().catch(() => undefined);
  await recordSourceCall({
    provider: PROVIDER,
    endpoint,
    ticker: ctx.ticker,
    httpStatus: response.status,
    fetchedAt,
    latencyMs: Math.round(performance.now() - started),
    status: response.ok ? "fresh" : "failed",
    researchRunId: ctx.researchRunId,
  });
  if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
  return payload;
}

export async function getFinancialSnapshot(
  ticker: string,
  ctx: SecCallContext = {},
): Promise<{ data: FinancialSnapshot; provenance: Provenance; cached: boolean }> {
  const symbol = ticker.toUpperCase();
  const cacheKey = { provider: PROVIDER, kind: "companyfacts", ticker: symbol };
  const cached = await readProviderCache<FinancialSnapshot>(cacheKey);
  if (cached) return cached;

  const tickerMap = tickerMapSchema.parse(
    await secJson(TICKER_URL, "/files/company_tickers.json", { ...ctx, ticker: symbol }),
  );
  const match = Object.values(tickerMap).find((entry) => entry.ticker.toUpperCase() === symbol);
  if (!match) throw new Error(`SEC CIK not found for ${symbol}`);
  const cik = String(match.cik_str).padStart(10, "0");
  const endpoint = `/api/xbrl/companyfacts/CIK${cik}.json`;
  const raw = await secJson(`${BASE_URL}${endpoint}`, endpoint, { ...ctx, ticker: symbol });
  const data = normalizeCompanyFacts(symbol, raw);
  const fetchedAt = new Date();
  await writeProviderCache(cacheKey, data, {
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS),
    providerTimestamp: new Date(data.filed),
  });
  return {
    data,
    cached: false,
    provenance: {
      provider: PROVIDER,
      endpoint,
      fetchedAt: fetchedAt.toISOString(),
      providerTimestamp: new Date(data.filed).toISOString(),
      status: "fresh",
      httpStatus: 200,
    },
  };
}
