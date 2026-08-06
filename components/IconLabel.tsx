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
