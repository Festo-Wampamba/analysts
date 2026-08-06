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
