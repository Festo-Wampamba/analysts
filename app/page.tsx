import { getLatestIdea, type LatestIdea } from "@/lib/screen/get-latest-idea";
import { Badge } from "@/components/Badge";
import { GlassPanel } from "@/components/GlassPanel";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Topbar({ run }: { run: LatestIdea["run"] }) {
  const isLive = run?.status === "complete" || run?.status === "no_qualifying_idea";
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Analysts
          </span>
          <span className="hidden text-xs text-ink-tertiary sm:inline">
            Daily Idea Engine
          </span>
        </div>
        <Badge tone={isLive ? "success" : "neutral"}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-success" : "bg-ink-tertiary"}`}
          />
          {run ? run.status.replace(/_/g, " ") : "awaiting first run"}
        </Badge>
      </div>
    </header>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <GlassPanel className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <p className="text-lg font-medium text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-subtle">{detail}</p>
    </GlassPanel>
  );
}

function StatRow({ idea }: { idea: LatestIdea }) {
  const stats = [
    { label: "Universe", value: `${idea.run?.universeEvaluated ?? 0} / ${idea.run?.universeSize ?? 0}` },
    { label: "Threshold", value: idea.threshold.toFixed(4) },
    { label: "Highest score", value: idea.run?.highestScore?.toFixed(4) ?? "—" },
    {
      label: "Run time",
      value:
        idea.run?.durationMs != null ? `${(idea.run.durationMs / 1000).toFixed(1)}s` : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface-1 px-4 py-3">
          <p className="text-xs text-ink-tertiary">{s.label}</p>
          <p className="font-mono text-sm text-ink">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function Hero({ idea }: { idea: LatestIdea }) {
  if (!idea.ticker) {
    return (
      <section className="flex flex-col gap-6">
        <EmptyState
          title="No qualifying idea today"
          detail={`Every candidate scored below the ${idea.threshold.toFixed(4)} threshold on ${formatDate(idea.tradingDate)}. Nothing cleared the bar, so nothing shipped — that's the engine working as designed, not a failure.`}
        />
        <StatRow idea={idea} />
      </section>
    );
  }

  const facts = idea.idea?.facts;
  return (
    <section className="flex flex-col gap-6">
      <GlassPanel className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-ink-tertiary">{formatDate(idea.tradingDate)}</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-ink">
              {idea.ticker}
            </h1>
            {facts?.company?.name && (
              <p className="mt-1 text-sm text-ink-subtle">{facts.company.name}</p>
            )}
          </div>
          <div className="flex gap-2">
            {facts?.sector && <Badge>{facts.sector}</Badge>}
            <Badge tone="primary">
              score {idea.score?.toFixed(4)} · conf {idea.confidence?.toFixed(2)}
            </Badge>
          </div>
        </div>

        {facts?.price && (
          <div className="mt-6 flex items-baseline gap-3 font-mono">
            <span className="text-2xl text-ink">${facts.price.current.toFixed(2)}</span>
            <span
              className={facts.price.changePercent >= 0 ? "text-success" : "text-danger"}
            >
              {facts.price.changePercent >= 0 ? "+" : ""}
              {facts.price.changePercent.toFixed(2)}%
            </span>
          </div>
        )}

        {idea.idea?.narrative?.selectionReason && (
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            {idea.idea.narrative.selectionReason}
          </p>
        )}
      </GlassPanel>
      <StatRow idea={idea} />
    </section>
  );
}

function Narrative({ idea }: { idea: LatestIdea }) {
  const n = idea.idea?.narrative;
  if (!n) return null;
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-ink-subtle">Thesis</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {n.thesisPoints.map((point, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-muted">
              <span className="text-primary">·</span>
              {point}
            </li>
          ))}
        </ul>
      </GlassPanel>
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-ink-subtle">Key catalyst</h2>
        <p className="mt-3 text-sm text-ink-muted">{n.keyCatalyst}</p>
      </GlassPanel>
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-success">Bull case</h2>
        <p className="mt-3 text-sm text-ink-muted">{n.bullCase}</p>
      </GlassPanel>
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-danger">Bear case</h2>
        <p className="mt-3 text-sm text-ink-muted">{n.bearCase}</p>
      </GlassPanel>
      <GlassPanel className="p-6 sm:col-span-2">
        <h2 className="text-sm font-medium text-ink-subtle">Risks</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {n.risks.map((risk, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-muted">
              <span className="text-ink-tertiary">·</span>
              {risk}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-tertiary">{n.confidenceRationale}</p>
      </GlassPanel>
    </section>
  );
}

function Candidates({ candidates }: { candidates: LatestIdea["candidates"] }) {
  if (candidates.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-ink-subtle">
        Ranked candidates ({candidates.length})
      </h2>
      <GlassPanel className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-ink-tertiary">
              <th className="px-4 py-2 font-normal">#</th>
              <th className="px-4 py-2 font-normal">Ticker</th>
              <th className="px-4 py-2 font-normal">Sector</th>
              <th className="px-4 py-2 font-normal text-right">Composite</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.ticker} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2.5 font-mono text-ink-tertiary">{c.rank}</td>
                <td className="px-4 py-2.5 font-medium text-ink">{c.ticker}</td>
                <td className="px-4 py-2.5 text-ink-subtle">{c.sector ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink">
                  {c.compositeScore.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </section>
  );
}

export default async function Home() {
  let idea: LatestIdea | null = null;
  let dbError = false;
  try {
    idea = await getLatestIdea();
  } catch {
    dbError = true;
  }

  return (
    <>
      <Topbar run={idea?.run ?? null} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
        {dbError ? (
          <EmptyState
            title="Engine offline"
            detail="Can't reach the database right now. Once it's connected, the day's screening run will show up here automatically."
          />
        ) : !idea ? (
          <EmptyState
            title="No screen has run yet"
            detail="The daily idea engine runs weekdays at 13:00 UTC and screens a 54-ticker universe across 9 sectors. The first result lands here after the next scheduled run."
          />
        ) : (
          <>
            <Hero idea={idea} />
            <Narrative idea={idea} />
            <Candidates candidates={idea.candidates} />
          </>
        )}
      </main>
      <footer className="border-t border-hairline px-6 py-6 text-center text-xs text-ink-tertiary">
        Cross-sectional equity screening, sourced facts only, no unsourced numbers.
      </footer>
    </>
  );
}
