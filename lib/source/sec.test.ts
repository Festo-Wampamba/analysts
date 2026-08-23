import { describe, expect, it } from "vitest";

import { normalizeCachedFinancialSnapshot, normalizeCompanyFacts } from "./sec";

function fact(val: number, end: string, filed: string, accn: string) {
  return { val, start: `${Number(end.slice(0, 4)) - 1}-01-01`, end, filed, accn, fy: Number(end.slice(0, 4)), fp: "FY", form: "10-K" };
}

describe("normalizeCompanyFacts", () => {
  it("selects coherent annual facts and derives free cash flow", () => {
    const raw = {
      cik: 320193,
      entityName: "Apple Inc.",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [fact(90, "2024-09-28", "2024-11-01", "old"), fact(100, "2025-09-27", "2025-10-31", "new")] },
          },
          // SEC taxonomy metadata may use null labels for facts that are not
          // part of the financial snapshot we consume.
          EffectiveIncomeTaxRateReconciliationFdiiAmount: {
            label: null,
            units: { USD: [] },
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: { USD: [fact(25, "2024-09-28", "2024-11-01", "old"), fact(30, "2025-09-27", "2025-10-31", "new")] },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: { USD: [fact(7, "2024-09-28", "2024-11-01", "old"), fact(8, "2025-09-27", "2025-10-31", "new")] },
          },
        },
      },
    };

    const snapshot = normalizeCompanyFacts("AAPL", raw);

    expect(snapshot.revenue).toMatchObject({ value: 100, previousValue: 90 });
    expect(snapshot.freeCashFlow).toMatchObject({ value: 22, previousValue: 18 });
    expect(snapshot.freeCashFlowAvailability).toEqual({ available: true });
    expect(snapshot.annualHistory.freeCashFlow).toMatchObject([
      { value: 22, periodEnd: "2025-09-27" },
      { value: 18, periodEnd: "2024-09-28" },
    ]);
    expect(snapshot.periodEnd).toBe("2025-09-27");
  });

  it("does not derive free cash flow across different fiscal periods", () => {
    const raw = {
      cik: 1,
      entityName: "Example",
      facts: {
        "us-gaap": {
          Revenues: { units: { USD: [fact(100, "2025-12-31", "2026-02-01", "r")] } },
          NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fact(30, "2025-12-31", "2026-02-01", "c")] } },
          PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact(8, "2024-12-31", "2025-02-01", "p")] } },
        },
      },
    };

    const snapshot = normalizeCompanyFacts("EX", raw);
    expect(snapshot.freeCashFlow).toBeUndefined();
    expect(snapshot.freeCashFlowAvailability).toEqual({
      available: false,
      reason: expect.stringContaining("different annual periods"),
    });
  });

  it("retains up to five annual observations with SEC filing provenance", () => {
    const raw = {
      cik: 1,
      entityName: "Example",
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                fact(60, "2021-12-31", "2022-02-01", "r21"),
                fact(70, "2022-12-31", "2023-02-01", "r22"),
                fact(80, "2023-12-31", "2024-02-01", "r23"),
                fact(90, "2024-12-31", "2025-02-01", "r24"),
                fact(100, "2025-12-31", "2026-02-01", "r25"),
                fact(110, "2026-12-31", "2027-02-01", "r26"),
              ],
            },
          },
        },
      },
    };

    const history = normalizeCompanyFacts("EX", raw).annualHistory.revenue;

    expect(history).toHaveLength(5);
    expect(history?.map((value) => value.value)).toEqual([110, 100, 90, 80, 70]);
    expect(history?.[0]).toMatchObject({ form: "10-K", accession: "r26", filed: "2027-02-01" });
  });

  it("uses the newest coherent annual period across alternate revenue tags", () => {
    const raw = {
      cik: 1,
      entityName: "Example",
      facts: {
        "us-gaap": {
          // This legacy tag is still present, but it must not anchor the
          // report to an older filing when a supported current tag exists.
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [fact(26.9, "2022-01-30", "2022-03-18", "legacy-revenue")] },
          },
          Revenues: {
            units: { USD: [fact(100, "2024-01-28", "2024-02-21", "revenue-old"), fact(120, "2025-01-26", "2025-02-26", "revenue-current")] },
          },
          GrossProfit: {
            units: { USD: [fact(78, "2024-01-28", "2024-02-21", "gross-old"), fact(95, "2025-01-26", "2025-02-26", "gross-current")] },
          },
        },
      },
    };

    const snapshot = normalizeCompanyFacts("EX", raw);

    expect(snapshot.periodEnd).toBe("2025-01-26");
    expect(snapshot.revenue).toMatchObject({ value: 120, periodEnd: "2025-01-26" });
    expect(snapshot.grossProfit).toMatchObject({ value: 95, periodEnd: "2025-01-26" });
  });

  it("uses alternative current-debt tags without double counting them", () => {
    const current = [
      fact(8, "2024-12-31", "2025-02-01", "current-old"),
      fact(10, "2025-12-31", "2026-02-01", "current"),
    ];
    const raw = {
      cik: 1,
      entityName: "Example",
      facts: {
        "us-gaap": {
          Revenues: { units: { USD: [fact(100, "2025-12-31", "2026-02-01", "r")] } },
          LongTermDebtAndFinanceLeaseObligationsCurrent: { units: { USD: current } },
          LongTermDebtCurrent: { units: { USD: current } },
          LongTermDebtNoncurrent: { units: { USD: [fact(35, "2024-12-31", "2025-02-01", "long-old"), fact(40, "2025-12-31", "2026-02-01", "long")] } },
        },
      },
    };

    expect(normalizeCompanyFacts("EX", raw).debt).toMatchObject({
      value: 50,
      previousValue: 43,
      previousPeriodEnd: "2024-12-31",
    });
  });
});

describe("normalizeCachedFinancialSnapshot", () => {
  it("keeps legacy provider-cache rows renderable after new fields are added", () => {
    const snapshot = normalizeCachedFinancialSnapshot({
      ticker: "NVDA",
      cik: "0001045810",
      entityName: "NVIDIA Corporation",
      periodEnd: "2025-01-26",
      filed: "2025-02-26",
      accession: "legacy",
      revenue: { value: 100, unit: "USD", periodEnd: "2025-01-26", form: "10-K", filed: "2025-02-26", accession: "legacy" },
    });

    expect(snapshot.annualHistory).toEqual({});
    expect(snapshot.freeCashFlowAvailability).toEqual({
      available: false,
      reason: "This cached SEC snapshot predates free-cash-flow provenance.",
    });
  });
});
