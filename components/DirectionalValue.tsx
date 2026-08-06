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
