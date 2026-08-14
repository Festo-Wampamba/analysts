import { describe, expect, it } from "vitest";

import { normalizeCompanyFacts } from "./sec";

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

    expect(normalizeCompanyFacts("EX", raw).freeCashFlow).toBeUndefined();
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
