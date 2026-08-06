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
  try {
    const res = await fetch(`${base}/api/research/${ticker}`, { cache: "no-store" });
    return await res.json();
  } catch {
    return { error: "fetch_failed", message: "Could not reach the research service." };
  }
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
            <DirectionalValue value={{ ...facts.quote.change, comparisonLabel: undefined }} />
            <DirectionalValue value={facts.quote.changePercent} />
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-ink-subtle">Key catalyst</h2>
        <p className="mt-3 text-sm text-ink-muted">{narrative.catalysts}</p>
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
