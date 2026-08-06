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
