# Backlog Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six items from the post-launch backlog: provider retry/backoff, a real PR CI gate, the missing research-workspace frontend, an extracted component primitive library, an accessibility pass, and real project docs.

**Architecture:** No new services or dependencies. Each task is additive to the existing Next.js 16 App Router codebase (`app/`, `lib/`, `.github/workflows/`) and follows patterns already established in the repo (vitest for tests, plain Tailwind v4 utility classes, hand-rolled components, zod schemas for provider data).

**Tech Stack:** Next.js 16.3.0 (App Router), React 19.2.8, TypeScript 5 (strict), Tailwind v4, vitest 4, pnpm 11.9.0, Node 22.

## Global Constraints

- Package manager: **pnpm** (`packageManager: "pnpm@11.9.0"` in `package.json`) — never `npm`/`yarn`.
- Node version: **22** (only source of truth is `Dockerfile`: `FROM node:22-alpine`; no `.nvmrc`, no `engines` field — add none, just pin CI to 22).
- Test runner: **vitest**. Run a single file with `pnpm exec vitest run <path>`. Full suite: `pnpm test` (= `vitest run`). `vitest.config.ts` currently scopes `include: ["lib/**/*.test.ts"]` — a task below extends this.
- Typecheck: **no npm script exists**. Use `pnpm exec tsc --noEmit` directly (`tsconfig.json` already has `"noEmit": true`).
- Lint: `pnpm run lint` (`"lint": "eslint"`).
- Build: `pnpm run build` (`"build": "next build"`).
- No new runtime dependencies. No icon library, no `clsx`/`cva`, no component-library package — none are installed today and none of these tasks need one.
- Styling: Tailwind v4 utility classes only, using the existing semantic color tokens from `app/globals.css` (`bg-canvas`, `text-ink`, `text-ink-subtle`, `text-ink-tertiary`, `text-ink-muted`, `border-hairline`, `bg-surface-1`, `bg-surface-2`, `text-primary`, `text-success`, `text-danger`). Do not introduce a new styling framework (Final-design.md §15.3).
- Component style: named function declarations (not arrow-const), not default-exported except page components, prop types as inline object literals matching the existing `Badge`/`GlassPanel` shape in `app/page.tsx`.
- Do not infer positive/negative styling from a formatted string — always consume the existing `DirectionalValue`/`Direction` types from `lib/domain/directional.ts` (Final-design.md §13.2).

---

### Task 1: Shared retry/backoff for Finnhub + Groq

**Files:**
- Create: `lib/http/retry.ts`
- Test: `lib/http/retry.test.ts`
- Modify: `lib/source/finnhub.ts:79` (the `fetch(url, ...)` call inside `finnhubGet`)
- Modify: `lib/ai/groq.ts:91-107` (the `fetch(...)` call inside `groqJson`)

**Interfaces:**
- Produces: `fetchWithRetry(input: string | URL, init: RequestInit, opts?: { retries?: number; baseDelayMs?: number }): Promise<Response>` — exported from `lib/http/retry.ts`. Retries on network error (fetch throws) or HTTP 429/500/502/503/504, with exponential backoff (`baseDelayMs * 2 ** attempt`). Returns the final `Response` (which may still be non-2xx after retries exhaust — callers keep their existing `!res.ok` handling unchanged). Re-throws the last error if every attempt's `fetch()` call itself threw.
- Consumes: nothing new — both call sites already have a `Response`-shaped return type contract to preserve.

- [ ] **Step 1: Write the failing test for `fetchWithRetry`**

Create `lib/http/retry.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry } from "./retry";

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns immediately on a successful first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {});

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a 503 and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com", {}, { retries: 2, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404 and returns it as-is", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { retries: 2, baseDelayMs: 10 });

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a thrown network error and re-throws after exhausting retries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com", {}, { retries: 2, baseDelayMs: 10 });
    const assertion = expect(promise).rejects.toThrow("network down");
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/http/retry.test.ts`
Expected: FAIL — `Cannot find module './retry'` (file doesn't exist yet).

- [ ] **Step 3: Implement `fetchWithRetry`**

Create `lib/http/retry.ts`:

```ts
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries a fetch on network failure or a 429/5xx response, with exponential
// backoff. The signal/deadline in `init` (e.g. AbortSignal.timeout(...)) is
// shared across every attempt, so total wall-clock time stays bounded by the
// caller's existing timeout rather than growing with the retry count.
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 300;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/http/retry.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/http/retry.ts lib/http/retry.test.ts
git commit -m "feat: add fetchWithRetry helper for provider HTTP calls"
```

- [ ] **Step 6: Wire into Finnhub**

In `lib/source/finnhub.ts`, add the import (alongside the existing imports at the top):

```ts
import { fetchWithRetry } from "@/lib/http/retry";
```

Replace line 79:

```ts
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
```

with:

```ts
    res = await fetchWithRetry(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
```

- [ ] **Step 7: Wire into Groq**

In `lib/ai/groq.ts`, add the import:

```ts
import { fetchWithRetry } from "@/lib/http/retry";
```

Replace the `fetch(...)` call (lines 91-107):

```ts
    res = await fetch(`${BASE_URL}${ENDPOINT}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
```

with:

```ts
    res = await fetchWithRetry(`${BASE_URL}${ENDPOINT}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
```

- [ ] **Step 8: Add one integration test to each provider's existing test file**

Append to `lib/source/finnhub.test.ts` (inside the existing top-level `describe` block, following the file's established `vi.stubGlobal("fetch", ...)` mocking pattern already used by its other tests):

```ts
  it("retries once on a 503 before succeeding", async () => {
    const ok = new Response(
      JSON.stringify({ c: 100, d: 1, dp: 1, h: 101, l: 99, o: 99, pc: 99, t: 1735689600 }),
      { status: 200 },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getQuote("AAPL");

    expect(result.data.c).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
```

Append to `lib/ai/groq.test.ts` (same pattern, matching its existing mocked-completion shape):

```ts
  it("retries once on a 500 before succeeding", async () => {
    const completion = {
      model: "llama-3.3-70b-versatile",
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outputSchema = z.object({ ok: z.boolean() });
    const result = await groqJson({
      system: "s",
      user: "u",
      outputSchema,
      basedOn: ["test"],
    });

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
```

If `z` isn't already imported in `lib/ai/groq.test.ts`, add `import { z } from "zod";` to its imports.

- [ ] **Step 9: Run both test files and verify all pass**

Run: `pnpm exec vitest run lib/source/finnhub.test.ts lib/ai/groq.test.ts`
Expected: all tests PASS, including the two new ones.

- [ ] **Step 10: Run the full suite and commit**

Run: `pnpm test`
Expected: all tests PASS (no regressions elsewhere).

```bash
git add lib/source/finnhub.ts lib/source/finnhub.test.ts lib/ai/groq.ts lib/ai/groq.test.ts
git commit -m "feat: retry Finnhub and Groq calls on 429/5xx and network failure"
```

---

### Task 2: PR CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none (standalone GitHub Actions workflow, no code interfaces).

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main, development]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11.9.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm run lint

      - run: pnpm exec tsc --noEmit

      - run: pnpm test

      - run: pnpm run build
        env:
          DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
          FINNHUB_API_KEY: ci-placeholder
          GROQ_API_KEY: ci-placeholder
          CRON_SECRET: ci-placeholder
```

Note on the `build` env vars: `next build` needs these to be *set* (not necessarily valid/reachable) because route modules read `process.env` at module scope in some files (e.g. `app/api/health/route.ts` reads `DATABASE_URL` when constructing its `Pool` at import time). Placeholder values are sufficient since no route runs at build time — confirm this holds during Step 3; if the build fails on a missing/invalid env var not listed here, add it to this list with a placeholder rather than skip the check.

- [ ] **Step 2: Verify the lockfile is in sync locally before pushing**

Run: `pnpm install --frozen-lockfile`
Expected: exits 0 with no lockfile changes. If it fails, run `pnpm install` (without `--frozen-lockfile`), commit the updated `pnpm-lock.yaml`, and re-run this check — `--frozen-lockfile` in CI will fail the same way on every PR otherwise.

- [ ] **Step 3: Push and confirm the workflow runs**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add PR gate for lint, typecheck, test, and build"
git push
```

Then: `gh run list --workflow=ci.yml --limit 1` and `gh run view <run-id> --log` to confirm all four steps (lint, typecheck, test, build) pass. Fix any failure surfaced here before moving on — this workflow is the deliverable, so it must actually be green once, not just present.

---

### Task 3: Component primitive library

Extracts `Badge` and `GlassPanel` out of `app/page.tsx` into a shared `components/` directory (doesn't exist yet — this task creates it) and adds the remaining primitives named in Final-design.md §15.1 step 3: `IconLabel`, `DirectionalValue`, `SourceLabel`, `GeneratedLabel`, `StatusNotice`. Task 4 (research frontend) consumes these; do this task first.

**Files:**
- Create: `components/Badge.tsx`
- Create: `components/GlassPanel.tsx`
- Create: `components/IconLabel.tsx`
- Create: `components/DirectionalValue.tsx`
- Create: `components/SourceLabel.tsx`
- Create: `components/GeneratedLabel.tsx`
- Create: `components/StatusNotice.tsx`
- Test: `components/DirectionalValue.test.tsx`
- Test: `components/SourceLabel.test.tsx`
- Modify: `app/page.tsx` (remove inline `Badge`/`GlassPanel`, import from `components/`)
- Modify: `vitest.config.ts` (extend `include` to cover `.tsx` tests, add jsdom environment)

**Interfaces:**
- Produces:
  - `Badge({ tone?: "neutral" | "primary" | "success" | "danger", children }): JSX.Element`
  - `GlassPanel({ children, className? }): JSX.Element`
  - `IconLabel({ tone?: "neutral" | "primary" | "success" | "danger", children }): JSX.Element` — a small status-dot + text pairing (no icon library is installed; the "icon" is the existing dot-indicator pattern already used in `Topbar`).
  - `DirectionalValue({ value: DirectionalValueData, className? }): JSX.Element` — consumes `DirectionalValue` type from `@/lib/domain/directional` (aliased on import as `DirectionalValueData` to avoid the name clash with this component).
  - `SourceLabel({ provenance: Provenance }): JSX.Element` — consumes `Provenance` from `@/lib/domain/provenance`.
  - `GeneratedLabel({ meta: GeneratedContentMeta }): JSX.Element` — consumes `GeneratedContentMeta` from `@/lib/domain/provenance`.
  - `StatusNotice({ tone: "info" | "warning" | "error", title, detail }): JSX.Element`.
- Consumes: `Direction`, `DirectionalValue` (type) from `lib/domain/directional.ts`; `Provenance`, `SourceStatus`, `GeneratedContentMeta` from `lib/domain/provenance.ts` — both already exist, unchanged by this task.

- [ ] **Step 1: Extend vitest to run `.tsx` component tests**

`vitest.config.ts` currently only picks up `lib/**/*.test.ts` with `environment: "node"`. Component tests need jsdom. Replace its content:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [
      ["components/**/*.test.tsx", "jsdom"],
      ["app/**/*.test.tsx", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `vitest.setup.ts` at the repo root (registers the `toHaveClass`/`toBeInTheDocument` matchers used by the component tests below — `@testing-library/react` alone does not provide them):

```ts
import "@testing-library/jest-dom/vitest";
```

Add `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` as dev dependencies (needed to render/query components in tests and to get the `toHaveClass`/`toBeInTheDocument` matchers — nothing else in this plan needs a new dependency, this is the one unavoidable exception since there is currently no way to test a `.tsx` component in this repo):

```bash
pnpm add -D jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `components/Badge.tsx`** (verbatim extraction of the existing inline component)

```tsx
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "primary" | "success" | "danger";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-ink-subtle border-hairline",
    primary: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
    danger: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Create `components/GlassPanel.tsx`** (verbatim extraction)

```tsx
export function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-hairline bg-surface-1/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Update `app/page.tsx` to import instead of declaring these inline**

Add near the top of `app/page.tsx`:

```ts
import { Badge } from "@/components/Badge";
import { GlassPanel } from "@/components/GlassPanel";
```

Delete the inline `function Badge(...)` (lines 14-34) and `function GlassPanel(...)` (lines 36-50) blocks from `app/page.tsx` — everything else in the file is unchanged since both are still used the same way.

- [ ] **Step 5: Verify `app/page.tsx` still builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit the extraction**

```bash
git add components/Badge.tsx components/GlassPanel.tsx app/page.tsx vitest.config.ts package.json pnpm-lock.yaml
git commit -m "refactor: extract Badge and GlassPanel into components/"
```

- [ ] **Step 7: Create `components/IconLabel.tsx`**

```tsx
export function IconLabel({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "primary" | "success" | "danger";
  children: React.ReactNode;
}) {
  const dotTones: Record<string, string> = {
    neutral: "bg-ink-tertiary",
    primary: "bg-primary",
    success: "bg-success",
    danger: "bg-danger",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-subtle">
      <span className={`h-1.5 w-1.5 rounded-full ${dotTones[tone]}`} />
      {children}
    </span>
  );
}
```

- [ ] **Step 8: Write the failing test for `DirectionalValue`**

Create `components/DirectionalValue.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DirectionalValue } from "./DirectionalValue";

describe("DirectionalValue", () => {
  it("renders a positive value with the success tone", () => {
    render(
      <DirectionalValue
        value={{ value: 1.5, formatted: "+1.50", direction: "positive" }}
      />,
    );
    expect(screen.getByText("+1.50")).toHaveClass("text-success");
  });

  it("renders a negative value with the danger tone", () => {
    render(
      <DirectionalValue
        value={{ value: -2.1, formatted: "-2.10", direction: "negative" }}
      />,
    );
    expect(screen.getByText("-2.10")).toHaveClass("text-danger");
  });

  it("renders the comparison label when provided", () => {
    render(
      <DirectionalValue
        value={{
          value: 0,
          formatted: "0.00",
          direction: "neutral",
          comparisonLabel: "vs previous close",
        }}
      />,
    );
    expect(screen.getByText("vs previous close")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `pnpm exec vitest run components/DirectionalValue.test.tsx`
Expected: FAIL — `Cannot find module './DirectionalValue'`.

- [ ] **Step 10: Implement `components/DirectionalValue.tsx`**

```tsx
import type { DirectionalValue as DirectionalValueData } from "@/lib/domain/directional";

export function DirectionalValue({
  value,
  className = "",
}: {
  value: DirectionalValueData;
  className?: string;
}) {
  const toneClass =
    value.direction === "positive"
      ? "text-success"
      : value.direction === "negative"
        ? "text-danger"
        : "text-ink-subtle";
  return (
    <span className={`font-mono ${toneClass} ${className}`}>
      {value.formatted}
      {value.comparisonLabel && (
        <span className="ml-1.5 text-xs text-ink-tertiary">{value.comparisonLabel}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 11: Run it to verify it passes**

Run: `pnpm exec vitest run components/DirectionalValue.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 12: Write the failing test for `SourceLabel`**

Create `components/SourceLabel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceLabel } from "./SourceLabel";

describe("SourceLabel", () => {
  it("renders the provider name and fresh status", () => {
    render(
      <SourceLabel
        provenance={{
          provider: "finnhub",
          endpoint: "/quote",
          fetchedAt: "2026-08-05T10:07:25.451Z",
          status: "fresh",
          httpStatus: 200,
        }}
      />,
    );
    expect(screen.getByText("finnhub")).toBeInTheDocument();
    expect(screen.getByText("fresh")).toBeInTheDocument();
  });

  it("renders a failed source with the danger tone", () => {
    render(
      <SourceLabel
        provenance={{
          provider: "groq",
          fetchedAt: "2026-08-05T10:07:25.451Z",
          status: "failed",
        }}
      />,
    );
    expect(screen.getByText("failed")).toHaveClass("text-danger");
  });
});
```

- [ ] **Step 13: Run it to verify it fails**

Run: `pnpm exec vitest run components/SourceLabel.test.tsx`
Expected: FAIL — `Cannot find module './SourceLabel'`.

- [ ] **Step 14: Implement `components/SourceLabel.tsx`**

```tsx
import type { Provenance, SourceStatus } from "@/lib/domain/provenance";

const STATUS_TONE: Record<SourceStatus, string> = {
  fresh: "text-success",
  stale: "text-ink-subtle",
  failed: "text-danger",
  unknown: "text-ink-tertiary",
};

export function SourceLabel({ provenance }: { provenance: Provenance }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span className="font-medium text-ink-subtle">{provenance.provider}</span>
      <span className={STATUS_TONE[provenance.status]}>{provenance.status}</span>
    </span>
  );
}
```

- [ ] **Step 15: Run it to verify it passes**

Run: `pnpm exec vitest run components/SourceLabel.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 16: Implement `components/GeneratedLabel.tsx`** (no separate test — thin presentational wrapper, covered by Task 4's page-level test instead)

```tsx
import type { GeneratedContentMeta } from "@/lib/domain/provenance";

export function GeneratedLabel({ meta }: { meta: GeneratedContentMeta }) {
  return (
    <p className="text-xs text-ink-tertiary">
      Generated{meta.modelLabel ? ` by ${meta.modelLabel}` : ""} · based on{" "}
      {meta.basedOn.length} source{meta.basedOn.length === 1 ? "" : "s"}
    </p>
  );
}
```

- [ ] **Step 17: Implement `components/StatusNotice.tsx`** (generalizes the inline `EmptyState` pattern already in `app/page.tsx`, with a tone)

```tsx
export function StatusNotice({
  tone = "info",
  title,
  detail,
}: {
  tone?: "info" | "warning" | "error";
  title: string;
  detail: string;
}) {
  const toneClass =
    tone === "error" ? "text-danger" : tone === "warning" ? "text-primary" : "text-ink";
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-hairline bg-surface-1/80 px-8 py-16 text-center backdrop-blur-sm">
      <p className={`text-lg font-medium ${toneClass}`}>{title}</p>
      <p className="max-w-md text-sm text-ink-subtle">{detail}</p>
    </div>
  );
}
```

- [ ] **Step 18: Run the full component test suite and typecheck**

Run: `pnpm exec vitest run components/ && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 19: Commit**

```bash
git add components/
git commit -m "feat: add IconLabel, DirectionalValue, SourceLabel, GeneratedLabel, StatusNotice primitives"
```

---

### Task 4: Research workspace frontend

Builds the missing UI for the existing `GET /api/research/[ticker]` route. No page currently consumes it (`app/page.tsx` only renders the daily idea, not per-ticker research).

**Files:**
- Create: `app/research/[ticker]/page.tsx`
- Create: `app/research/page.tsx` (ticker search entry point)
- Test: `app/research/[ticker]/page.test.tsx`

**Interfaces:**
- Consumes: `ResearchReport` type (`{ ticker, facts: ResearchFacts, narrative: ResearchNarrative, provenance: Provenance[], generated: GeneratedContentMeta, failedProviders: string[], cached: boolean }`) from `lib/research/report.ts`; `ResearchFacts` from `lib/research/facts.ts` (has `quote.change`/`quote.changePercent` as `DirectionalValue`, `company`, `news[]`, etc.); components from Task 3 (`GlassPanel`, `Badge`, `DirectionalValue`, `SourceLabel`, `GeneratedLabel`, `StatusNotice`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create the ticker search entry point**

Create `app/research/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Write the failing test for the ticker report page**

Create `app/research/[ticker]/page.test.tsx`. This mocks the fetch used by the page (Step 3 below fetches the internal API route directly rather than importing `getResearchReport` — see the note in Step 3 for why):

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResearchTickerPage from "./page";

describe("ResearchTickerPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the company name and price for a successful report", async () => {
    const report = {
      ticker: "AAPL",
      facts: {
        ticker: "AAPL",
        company: { name: "Apple Inc" },
        quote: {
          price: 200,
          previousClose: 198,
          open: 199,
          dayHigh: 201,
          dayLow: 198,
          change: { value: 2, formatted: "+2.00", direction: "positive" },
          changePercent: { value: 1.01, formatted: "+1.01%", direction: "positive" },
        },
      },
      narrative: {
        thesisPoints: ["Strong margins"],
        keyCatalyst: "Product cycle",
        bullCase: "Bull",
        bearCase: "Bear",
        risks: ["Competition"],
        confidenceRationale: "High coverage",
        scenarios: [],
        limitations: [],
      },
      provenance: [
        { provider: "finnhub", fetchedAt: "2026-08-05T10:00:00.000Z", status: "fresh" },
      ],
      generated: { generatedAt: "2026-08-05T10:00:00.000Z", basedOn: ["quote"], modelLabel: "llama-3.3-70b-versatile" },
      failedProviders: [],
      cached: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 })),
    );

    const Page = await ResearchTickerPage({ params: Promise.resolve({ ticker: "AAPL" }) });
    render(Page);

    expect(await screen.findByText("Apple Inc")).toBeInTheDocument();
    expect(screen.getByText("+2.00")).toBeInTheDocument();
  });

  it("renders a StatusNotice when the ticker is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "unknown_ticker", message: "No such ticker." }),
          { status: 404 },
        ),
      ),
    );

    const Page = await ResearchTickerPage({ params: Promise.resolve({ ticker: "ZZZZ" }) });
    render(Page);

    expect(await screen.findByText("No such ticker.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run "app/research/[ticker]/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 4: Implement `app/research/[ticker]/page.tsx`**

The page fetches the already-existing `/api/research/[ticker]` route over HTTP (via an absolute URL built from `process.env`) rather than calling `getResearchReport` directly — this keeps the page a thin consumer of the public API contract (same one external clients use) and matches how the test mocks `fetch`. Add `NEXT_PUBLIC_APP_URL` handling with a `localhost:3000` dev fallback, since no such env var exists yet in this repo:

```tsx
import { Badge } from "@/components/Badge";
import { DirectionalValue } from "@/components/DirectionalValue";
import { GeneratedLabel } from "@/components/GeneratedLabel";
import { GlassPanel } from "@/components/GlassPanel";
import { SourceLabel } from "@/components/SourceLabel";
import { StatusNotice } from "@/components/StatusNotice";
import type { ResearchReport } from "@/lib/research/report";

export const dynamic = "force-dynamic";

type ApiError = { error: string; message: string };

async function fetchReport(ticker: string): Promise<ResearchReport | ApiError> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/research/${ticker}`, { cache: "no-store" });
  return res.json();
}

export default async function ResearchTickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const result = await fetchReport(ticker);

  if ("error" in result) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <StatusNotice tone="error" title={result.error.replace(/_/g, " ")} detail={result.message} />
      </main>
    );
  }

  const { facts, narrative, provenance, generated, failedProviders } = result;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <GlassPanel className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">{facts.ticker}</h1>
            {facts.company?.name && (
              <p className="mt-1 text-sm text-ink-subtle">{facts.company.name}</p>
            )}
          </div>
          {failedProviders.length > 0 && (
            <Badge tone="danger">{failedProviders.length} source(s) unavailable</Badge>
          )}
        </div>
        {facts.quote && (
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-mono text-2xl text-ink">${facts.quote.price.toFixed(2)}</span>
            <DirectionalValue value={facts.quote.changePercent} />
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-ink-subtle">Key catalyst</h2>
        <p className="mt-3 text-sm text-ink-muted">{narrative.keyCatalyst}</p>
      </GlassPanel>

      <section className="flex flex-wrap gap-3">
        {provenance.map((p, i) => (
          <SourceLabel key={i} provenance={p} />
        ))}
      </section>

      <GeneratedLabel meta={generated} />
    </main>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm exec vitest run "app/research/[ticker]/page.test.tsx"`
Expected: PASS (2/2).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/research/
git commit -m "feat: add research workspace frontend (ticker search + report page)"
```

---

### Task 5: Accessibility/interaction QA pass

Audits `app/page.tsx`, `app/research/page.tsx`, and `app/research/[ticker]/page.tsx` (Task 4) against the checklist Final-design.md §16.2 already specifies for this project, plus baseline WCAG contrast/keyboard checks. This is an audit-and-fix task, not new-feature TDD — there's no test to write first for "is this button keyboard-reachable."

**Files:**
- Modify: whichever of `app/page.tsx`, `app/research/page.tsx`, `app/research/[ticker]/page.tsx`, `components/*.tsx` have findings.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Run the checklist below against `/`, `/research`, and `/research/AAPL`**

- [ ] All interactive elements (the `/research` search input and submit button) reachable and operable via `Tab` + `Enter` alone, no mouse.
- [ ] Focus is visible on the search input and button (check computed `outline`/`ring` — Tailwind's default focus ring should already apply; if any element has `outline: none` without a replacement, that's a finding).
- [ ] The `/research` `<input>` has its `aria-label="Ticker symbol"` (already added in Task 4) — confirm it's actually announced by inspecting the accessibility tree in devtools, not just present in JSX.
- [ ] Color is never the only signal: `Badge`/`DirectionalValue`/`SourceLabel` all pair color with text (tone name, formatted value, status word) — confirm no component was changed in Task 3/4 to drop the text and rely on color alone.
- [ ] Contrast: check `text-ink-tertiary` and `text-ink-subtle` against `bg-canvas`/`bg-surface-1` at their actual rendered opacity (some panels use `/80` backdrop-blur backgrounds) — use browser devtools' contrast checker on the rendered page, not the token values in isolation. Flag anything under 4.5:1 for body text / 3:1 for large text (Final-design.md's own dark-glass palette was designed for this, but panel opacity can shift the effective contrast — verify, don't assume).
- [ ] No horizontal page overflow at 390×844 (mobile) — resize the viewport and check for a horizontal scrollbar on `/`, `/research`, `/research/AAPL`.
- [ ] `prefers-reduced-motion`: nothing in the current pages/components uses CSS transitions/animations beyond `backdrop-blur` (static, not animated) — confirm this is still true after Tasks 3-4 (no new component introduced a hover/transition effect that needs a reduced-motion fallback).

- [ ] **Step 3: Fix every finding from Step 2 directly in the component/page it was found in**

There's no fabricated code sample here — the fix depends entirely on what Step 2 finds. Common fixes if anything surfaces: add `focus-visible:ring-2 focus-visible:ring-primary` to interactive elements missing a visible focus state; add an explicit text label anywhere color was found to be the sole signal; adjust `text-ink-tertiary`/`text-ink-subtle` opacity if a contrast check fails.

- [ ] **Step 4: Re-run the Step 2 checklist after fixes to confirm each finding is resolved**

- [ ] **Step 5: Commit**

```bash
git add app/ components/
git commit -m "fix: accessibility pass — focus states, contrast, and keyboard reachability"
```

If Step 2 finds nothing to fix, skip the commit and note in the plan's progress ledger that the audit ran clean.

---

### Task 6: Docs — README, architecture, runbook, deploy guide

**Files:**
- Modify: `README.md` (currently unmodified `create-next-app` boilerplate — full replacement)
- Create: `docs/architecture.md`
- Create: `docs/runbook.md`
- Create: `docs/deploy.md`

- [ ] **Step 1: Replace `README.md`**

Write `README.md` covering: what the app does (daily cross-sectional equity screen across a 54-ticker/9-sector universe, Finnhub for market data, Groq/Llama for narrative generation, results emailed and shown at `/`), local setup (`pnpm install`, required env vars — `DATABASE_URL`, `FINNHUB_API_KEY`, `GROQ_API_KEY`, `CRON_SECRET`, and any others found by grepping `process.env\.` across `lib/` and `app/` for the authoritative list), `pnpm dev`/`pnpm test`/`pnpm run build` commands, and links to `docs/architecture.md`, `docs/runbook.md`, `docs/deploy.md`.

- [ ] **Step 2: Write `docs/architecture.md`**

Cover: request flow for `POST /api/screen` (fire-and-forget 202, background execution, `GET /api/screen` for polling — reference `docs/superpowers/specs/2026-08-05-async-screen-design.md` for the detailed design already written), the `lib/screen/`, `lib/source/`, `lib/ai/`, `lib/research/`, `lib/domain/`, `lib/email/` module boundaries (one paragraph each, grounded in the actual files found in Task 1-4's exploration — `lib/source/finnhub.ts` and `lib/ai/groq.ts` as the two provider choke points, `lib/domain/provenance.ts` and `lib/domain/directional.ts` as the shared display-contract types), and the GitHub Actions → Cloudflare → Dokploy → Neon deployment path (from `DEPLOY-HANDOFF.md`).

- [ ] **Step 3: Write `docs/runbook.md`**

Cover: how to manually trigger a screen run (`gh workflow run daily-screen.yml --ref main`, or `curl -X POST $SCREEN_URL -H "authorization: Bearer $CRON_SECRET"`), how to check run status (`GET /api/screen`), how to check `/api/health`, what a stale-running reclaim looks like and when it fires (10-minute threshold — reference the async screen design spec), and what to do if a screen run shows `status: "failed"` (check `runError` field in the `GET /api/screen` response, check `source_calls` table for which provider failed).

- [ ] **Step 4: Write `docs/deploy.md`**

Summarize the current verified state from `DEPLOY-HANDOFF.md`: Dokploy on the Contabo VPS, Traefik reverse proxy, Cloudflare in front (DNS proxied, SSL mode Full), git-push autodeploy (`main`→prod, `development`→dev) via GitHub webhooks confirmed firing. Explicitly list what's still outstanding per that doc and this session's work: DNS-01/Full-Strict TLS migration not done, `BUILD_SHA` not wired into the Dokploy build (`/api/health` reports `build: "unknown"`), Bot Fight Mode currently disabled zone-wide on `korestandard.com` (Free-plan limitation — Super Bot Fight Mode's WAF-skip doesn't cover it, tracked as a trade-off, revisit if upgrading past Free plan or moving the cron trigger off GitHub-hosted runners).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture.md docs/runbook.md docs/deploy.md
git commit -m "docs: add README, architecture, runbook, and deploy guide"
```

---

## Explicitly out of scope for this plan

These three backlog items are **not** tasks above — they don't fit a code-TDD plan and shouldn't be dispatched to an implementer subagent:

- **`BUILD_SHA` wiring** — the fix lives in Dokploy's build configuration (passing `--build-arg BUILD_SHA=$(git rev-parse HEAD)`), not in this repo. Needs a manual Dokploy dashboard change, same category as the Cloudflare changes made earlier this session.
- **Infra/TLS cleanup (Traefik DNS-01, Full-Strict)** — also Dokploy dashboard + a Cloudflare API token with `Zone:DNS:Edit`, per `DEPLOY-HANDOFF.md`'s own documented next step. Not a code change.
- **Orphaned Neon project cleanup (`floral-morning-80776988`)** — explicitly blocked until the production database mismatch is resolved (separate, already in progress).
