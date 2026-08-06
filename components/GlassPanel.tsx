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
