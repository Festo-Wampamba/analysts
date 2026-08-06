import type { GeneratedContentMeta } from "@/lib/domain/provenance";

export function GeneratedLabel({ meta }: { meta: GeneratedContentMeta }) {
  return (
    <p className="text-xs text-ink-tertiary">
      Generated{meta.modelLabel ? ` by ${meta.modelLabel}` : ""} · based on{" "}
      {meta.basedOn.length} source{meta.basedOn.length === 1 ? "" : "s"}
    </p>
  );
}
