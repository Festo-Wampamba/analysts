import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyIdeaNarrative } from "@/lib/ai/report-schema";
import type { CandidateInput } from "./score";

// A minimal in-memory stand-in for the three tables the run touches.
const state = {
  existingRun: null as
    | { id: number; status: string; startedAt?: Date; error?: string }
    | null,
  insertedRuns: [] as Record<string, unknown>[],
  insertedCandidates: [] as Record<string, unknown>[],
  insertedIdeas: [] as Record<string, unknown>[],
  updatedRuns: [] as Record<string, unknown>[],
  deletedCandidateRuns: [] as number[],
  storedCandidateRows: [] as Record<string, unknown>[],
  storedIdeaRow: null as Record<string, unknown> | null,
  claimConflicts: false,
  reclaimClaimed: false,
};

// Mirrors claimRun's staleness threshold (lib/screen/run.ts) so the mock's
// reclaim-eligibility check matches what the real WHERE clause would match.
const STALE_RUNNING_MS = 10 * 60 * 1000;

vi.mock("@/lib/db", () => {
  const isRunsTable = (t: unknown) => t === tables.screenRuns;
  const isCandidatesTable = (t: unknown) => t === tables.screenCandidates;

  const tables = {
    screenRuns: { __table: "screen_runs" },
    screenCandidates: { __table: "screen_candidates" },
    dailyIdeas: { __table: "daily_ideas" },
    sourceCalls: { __table: "source_calls" },
    reportsCache: { __table: "reports_cache" },
  };

  const selectFrom = (table: unknown) => {
    const rows = isRunsTable(table)
      ? state.existingRun
        ? [state.existingRun]
        : []
      : isCandidatesTable(table)
        ? state.storedCandidateRows
        : state.storedIdeaRow
          ? [state.storedIdeaRow]
          : [];
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rows),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  };

  return {
    schema: tables,
    db: {
      select: () => ({ from: selectFrom }),
      insert: (table: unknown) => ({
        values: (row: Record<string, unknown> | Record<string, unknown>[]) => {
          if (isRunsTable(table)) {
            const result = {
              onConflictDoNothing: () => ({
                returning: () =>
                  Promise.resolve(
                    state.claimConflicts ? [] : [{ id: 1 }],
                  ),
              }),
            };
            state.insertedRuns.push(row as Record<string, unknown>);
            return result;
          }
          if (isCandidatesTable(table)) {
            state.insertedCandidates.push(...(row as Record<string, unknown>[]));
            return Promise.resolve();
          }
          state.insertedIdeas.push(row as Record<string, unknown>);
          return {
            onConflictDoUpdate: () => Promise.resolve(),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve().then(resolve),
          };
        },
      }),
      update: () => ({
        set: (row: Record<string, unknown>) => ({
          where: () => {
            state.updatedRuns.push(row);
            // Only claimRun's reclaim UPDATE sets status back to "running";
            // decide win/lose synchronously here (mirroring a real atomic
            // UPDATE ... RETURNING) so two concurrent reclaims can't both win.
            let reclaimedRows: { id: number }[] = [];
            if (row.status === "running" && state.existingRun) {
              const run = state.existingRun;
              const isReclaimable =
                run.status === "failed" ||
                (run.status === "running" &&
                  !!run.startedAt &&
                  Date.now() - run.startedAt.getTime() > STALE_RUNNING_MS);
              if (isReclaimable && !state.reclaimClaimed) {
                state.reclaimClaimed = true;
                reclaimedRows = [{ id: run.id }];
              }
            }
            return {
              returning: () => Promise.resolve(reclaimedRows),
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve().then(resolve),
            };
          },
        }),
      }),
      delete: () => ({
        where: () => {
          state.deletedCandidateRuns.push(1);
          return Promise.resolve();
        },
      }),
    },
  };
});

vi.mock("./fetch", () => ({ fetchUniverseCandidates: vi.fn() }));
vi.mock("@/lib/ai/groq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/groq")>();
  return { ...actual, groqJson: vi.fn() };
});
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/source/finnhub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/source/finnhub")>();
  return {
    ...actual,
    getQuote: vi.fn(),
    getProfile: vi.fn(),
    getCompanyNews: vi.fn(),
  };
});

import { groqJson } from "@/lib/ai/groq";
import { sendEmail } from "@/lib/email/resend";
import { getCompanyNews, getProfile, getQuote } from "@/lib/source/finnhub";
import { fetchUniverseCandidates } from "./fetch";
import {
  claimScreenRun,
  getScreenStatus,
  runDailyScreen,
  runScreenInBackground,
} from "./run";
import type { UniverseEntry } from "./universe";

const universe: UniverseEntry[] = [
  { ticker: "AAA", sector: "Technology" },
  { ticker: "BBB", sector: "Technology" },
];

// AAA dominates every factor, BBB trails, so AAA scores 1.0 and BBB 0.0.
function candidates(): CandidateInput[] {
  return [
    {
      ticker: "AAA",
      sector: "Technology",
      metrics: {
        revenueGrowthTTMYoy: 40,
        epsGrowthTTMYoy: 45,
        netProfitMarginTTM: 30,
        roeTTM: 35,
        peTTM: 12,
        psTTM: 2,
        debtToEquityQuarterly: 0.2,
        currentRatioQuarterly: 2.5,
        priceReturn13Week: 20,
        priceReturn26Week: 30,
        analystBuyRatio: 0.9,
        insiderNetShareChange: 50_000,
      },
    },
    {
      ticker: "BBB",
      sector: "Technology",
      metrics: {
        revenueGrowthTTMYoy: -5,
        epsGrowthTTMYoy: -10,
        netProfitMarginTTM: 2,
        roeTTM: 3,
        peTTM: 60,
        psTTM: 9,
        debtToEquityQuarterly: 3,
        currentRatioQuarterly: 0.8,
        priceReturn13Week: -15,
        priceReturn26Week: -20,
        analystBuyRatio: 0.2,
        insiderNetShareChange: -50_000,
      },
    },
  ];
}

const narrative: DailyIdeaNarrative = {
  selectionReason: "Ranked first across every factor in today's universe.",
  thesisPoints: ["Growing fast.", "Margins expanding.", "Cheap versus peers."],
  keyCatalyst: "Earnings due next week.",
  bullCase: "Multiple re-rates toward peers.",
  bearCase: "Growth decelerates sharply.",
  risks: ["Customer concentration."],
  confidenceRationale: "Full factor coverage and a wide margin over the bar.",
};

function sourced<T>(data: T, endpoint: string) {
  return {
    data,
    provenance: {
      provider: "finnhub",
      endpoint,
      fetchedAt: new Date().toISOString(),
      status: "fresh" as const,
      httpStatus: 200,
    },
  };
}

function mockHappyPath() {
  vi.mocked(fetchUniverseCandidates).mockResolvedValue({
    candidates: candidates(),
    failedTickers: [],
  });
  vi.mocked(getQuote).mockResolvedValue(
    sourced(
      { c: 100, d: 1, dp: 1, h: 101, l: 99, o: 99.5, pc: 99, t: 1754332800 },
      "/quote",
    ),
  );
  vi.mocked(getProfile).mockResolvedValue(
    sourced(
      { name: "Alpha Inc", ticker: "AAA", marketCapitalization: 50_000, currency: "USD" },
      "/stock/profile2",
    ),
  );
  vi.mocked(getCompanyNews).mockResolvedValue(sourced([], "/company-news"));
  vi.mocked(groqJson).mockResolvedValue({
    data: narrative,
    model: "llama-3.3-70b-versatile",
    usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
    meta: {
      generatedAt: new Date().toISOString(),
      basedOn: ["screen"],
      modelLabel: "llama-3.3-70b-versatile",
    },
  });
  vi.mocked(sendEmail).mockResolvedValue({ delivered: true, id: "email_1" });
}

beforeEach(() => {
  Object.assign(state, {
    existingRun: null,
    insertedRuns: [],
    insertedCandidates: [],
    insertedIdeas: [],
    updatedRuns: [],
    deletedCandidateRuns: [],
    storedCandidateRows: [],
    storedIdeaRow: null,
    claimConflicts: false,
    reclaimClaimed: false,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDailyScreen happy path", () => {
  it("selects the top-scoring candidate as the daily idea", async () => {
    mockHappyPath();
    const result = await runDailyScreen(universe);
    expect(result.idea?.facts.ticker).toBe("AAA");
  });

  it("reports a complete run", async () => {
    mockHappyPath();
    const result = await runDailyScreen(universe);
    expect(result.status).toBe("complete");
  });

  it("persists the ranked candidates", async () => {
    mockHappyPath();
    await runDailyScreen(universe);
    expect(state.insertedCandidates.map((c) => c.ticker)).toEqual(["AAA", "BBB"]);
  });

  it("stores the model's catalyst on the winning candidate row", async () => {
    mockHappyPath();
    await runDailyScreen(universe);
    expect(state.insertedCandidates[0].catalyst).toBe("Earnings due next week.");
  });

  it("records confidence as the winner's data coverage", async () => {
    mockHappyPath();
    await runDailyScreen(universe);
    expect(state.insertedIdeas[0].confidence).toBe("1");
  });

  it("sends the idea by email", async () => {
    mockHappyPath();
    await runDailyScreen(universe);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("includes peer valuation context computed from the universe", async () => {
    mockHappyPath();
    const result = await runDailyScreen(universe);
    expect(result.idea?.facts.sectorMedianPe).toBe(60);
  });
});

describe("runDailyScreen no qualifying idea", () => {
  it("records no_qualifying_idea when nothing clears the threshold", async () => {
    mockHappyPath();
    // Identical candidates all percentile to 0.5, below the 0.65 threshold.
    const flat = candidates().map((c) => ({ ...c, metrics: candidates()[0].metrics }));
    vi.mocked(fetchUniverseCandidates).mockResolvedValue({
      candidates: flat,
      failedTickers: [],
    });

    const result = await runDailyScreen(universe);

    expect(result.status).toBe("no_qualifying_idea");
  });

  it("writes an idea row with a null ticker rather than skipping the day", async () => {
    mockHappyPath();
    const flat = candidates().map((c) => ({ ...c, metrics: candidates()[0].metrics }));
    vi.mocked(fetchUniverseCandidates).mockResolvedValue({
      candidates: flat,
      failedTickers: [],
    });

    await runDailyScreen(universe);

    expect(state.insertedIdeas[0]).toMatchObject({ ticker: null, narrative: null });
  });

  it("does not send an email when no idea qualifies", async () => {
    mockHappyPath();
    const flat = candidates().map((c) => ({ ...c, metrics: candidates()[0].metrics }));
    vi.mocked(fetchUniverseCandidates).mockResolvedValue({
      candidates: flat,
      failedTickers: [],
    });

    await runDailyScreen(universe);

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("runDailyScreen idempotency", () => {
  it("returns the stored result without re-screening when the day already ran", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "complete" };

    const result = await runDailyScreen(universe);

    expect(result.alreadyRan).toBe(true);
  });

  it("spends no provider calls on a repeat run", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "complete" };

    await runDailyScreen(universe);

    expect(fetchUniverseCandidates).not.toHaveBeenCalled();
  });

  it("does not claim email delivery when the stored day had no qualifying idea", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "no_qualifying_idea" };
    state.storedIdeaRow = { ticker: null, narrative: null, emailDeliveryError: null };

    const result = await runDailyScreen(universe);

    expect(result.emailDelivered).toBe(false);
  });

  it("reports email delivery on a replayed day that did send one", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "complete" };
    state.storedIdeaRow = { ticker: "AAA", narrative: null, emailDeliveryError: null };

    const result = await runDailyScreen(universe);

    expect(result.emailDelivered).toBe(true);
  });

  it("re-runs a previously failed day instead of returning the failure", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "failed" };

    const result = await runDailyScreen(universe);

    expect(result.alreadyRan).toBe(false);
  });

  it("clears the failed attempt's candidates before re-running", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "failed" };

    await runDailyScreen(universe);

    expect(state.deletedCandidateRuns).toHaveLength(1);
  });
});

describe("runDailyScreen failure isolation", () => {
  it("marks the run failed when every universe ticker fails to load", async () => {
    mockHappyPath();
    vi.mocked(fetchUniverseCandidates).mockResolvedValue({
      candidates: [],
      failedTickers: universe.map(({ ticker }) => ticker),
    });

    await expect(runDailyScreen(universe)).rejects.toThrow(
      "unable to evaluate any of 2 universe tickers",
    );

    expect(state.updatedRuns[0]).toMatchObject({ status: "failed" });
    expect(state.insertedIdeas).toHaveLength(0);
  });

  it("keeps the run complete when email delivery fails", async () => {
    mockHappyPath();
    vi.mocked(sendEmail).mockResolvedValue({ delivered: false, error: "smtp down" });

    const result = await runDailyScreen(universe);

    expect(result.status).toBe("complete");
  });

  it("records the delivery error on the idea row", async () => {
    mockHappyPath();
    vi.mocked(sendEmail).mockResolvedValue({ delivered: false, error: "smtp down" });

    await runDailyScreen(universe);

    expect(state.insertedIdeas[0].emailDeliveryError).toBe("smtp down");
  });

  it("marks the run failed when the universe fetch throws", async () => {
    mockHappyPath();
    vi.mocked(fetchUniverseCandidates).mockRejectedValue(new Error("finnhub down"));

    await runDailyScreen(universe).catch(() => {});

    expect(state.updatedRuns[0]).toMatchObject({
      status: "failed",
      error: "finnhub down",
    });
  });

  it("rejects an idea whose narrative invents a figure twice", async () => {
    mockHappyPath();
    vi.mocked(groqJson).mockResolvedValue({
      data: { ...narrative, bullCase: "Revenue reaches $999.9 billion." },
      model: "llama-3.3-70b-versatile",
      usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
      meta: {
        generatedAt: new Date().toISOString(),
        basedOn: ["screen"],
        modelLabel: "llama-3.3-70b-versatile",
      },
    });

    await expect(runDailyScreen(universe)).rejects.toThrow(/unverifiable figures/);
  });
});

describe("claimScreenRun", () => {
  it("claims today's run without executing the screen", async () => {
    const result = await claimScreenRun(universe);

    expect(result.claimed).toBe(true);
    expect(fetchUniverseCandidates).not.toHaveBeenCalled();
  });

  it("reports not claimed when a run already exists", async () => {
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "complete" };

    const result = await claimScreenRun(universe);

    expect(result.claimed).toBe(false);
  });
});

describe("runScreenInBackground", () => {
  it("returns without waiting for the screen to finish", () => {
    mockHappyPath();
    const result = runScreenInBackground(1, "2026-08-05", universe);
    expect(result).toBeUndefined();
  });

  it("executes the screen in the background", async () => {
    mockHappyPath();
    runScreenInBackground(1, "2026-08-05", universe);

    await vi.waitFor(() => {
      expect(fetchUniverseCandidates).toHaveBeenCalled();
    });
  });

  it("logs rather than throws when the background run fails", async () => {
    vi.mocked(fetchUniverseCandidates).mockRejectedValue(new Error("finnhub down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    runScreenInBackground(1, "2026-08-05", universe);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "background screen run failed:",
        expect.any(Error),
      );
    });
  });
});

describe("getScreenStatus", () => {
  it("returns null when no run exists for the trading date", async () => {
    const result = await getScreenStatus("2026-08-05");
    expect(result).toBeNull();
  });

  it("surfaces a failed run's status and error", async () => {
    state.existingRun = { id: 1, status: "failed", error: "finnhub down" };

    const result = await getScreenStatus("2026-08-05");

    expect(result).toMatchObject({ status: "failed", runError: "finnhub down" });
  });

  it("reports a running screen without a stored idea", async () => {
    state.existingRun = { id: 1, status: "running", startedAt: new Date() };

    const result = await getScreenStatus("2026-08-05");

    expect(result?.status).toBe("running");
  });
});

describe("claimRun stale-running reclaim", () => {
  it("reclaims a running run stuck past the staleness window", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = {
      id: 1,
      status: "running",
      startedAt: new Date(Date.now() - 11 * 60 * 1000),
    };

    const result = await runDailyScreen(universe);

    expect(result.alreadyRan).toBe(false);
  });

  it("clears the stale attempt's candidates before re-running", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = {
      id: 1,
      status: "running",
      startedAt: new Date(Date.now() - 11 * 60 * 1000),
    };

    await runDailyScreen(universe);

    expect(state.deletedCandidateRuns).toHaveLength(1);
  });

  it("does not reclaim a running run inside the staleness window", async () => {
    mockHappyPath();
    state.claimConflicts = true;
    state.existingRun = {
      id: 1,
      status: "running",
      startedAt: new Date(Date.now() - 1 * 60 * 1000),
    };

    const result = await runDailyScreen(universe);

    expect(result.alreadyRan).toBe(true);
    expect(fetchUniverseCandidates).not.toHaveBeenCalled();
  });
});

describe("claimRun atomic reclaim", () => {
  it("lets only one of two concurrent reclaims win a failed run", async () => {
    state.claimConflicts = true;
    state.existingRun = { id: 1, status: "failed", error: "finnhub down" };

    const [a, b] = await Promise.all([
      claimScreenRun(universe),
      claimScreenRun(universe),
    ]);

    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
  });

  it("lets only one of two concurrent reclaims win a stale-running run", async () => {
    state.claimConflicts = true;
    state.existingRun = {
      id: 1,
      status: "running",
      startedAt: new Date(Date.now() - 11 * 60 * 1000),
    };

    const [a, b] = await Promise.all([
      claimScreenRun(universe),
      claimScreenRun(universe),
    ]);

    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
  });
});
