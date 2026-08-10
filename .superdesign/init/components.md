# Shared UI components

Framework: Next.js 16 App Router, React 19, Tailwind CSS v4, custom components.

## `components/Badge.tsx`

Reusable pill badge for neutral, primary, success, and danger states.

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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
```

## `components/GlassPanel.tsx`

Glass surface with card and hero recipes.

```tsx
const recipes = {
  card: [
    "rounded-card border border-hairline shadow-panel",
    "bg-[linear-gradient(160deg,rgba(20,26,35,0.74),rgba(15,20,28,0.54))]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-blur-[24px]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-saturate-[1.18]",
  ].join(" "),
  hero: [
    "rounded-[20px] sm:rounded-hero border border-hairline-strong shadow-panel",
    "bg-[linear-gradient(160deg,rgba(24,31,41,0.84),rgba(17,22,30,0.70))]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-blur-[28px]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-saturate-[1.25]",
  ].join(" "),
} as const;

export function GlassPanel({ children, className = "", tone = "card" }: {
  children: React.ReactNode;
  className?: string;
  tone?: keyof typeof recipes;
}) {
  return <div className={`${recipes[tone]} ${className}`}>{children}</div>;
}
```

## `components/StatusNotice.tsx`

Centered status message for loading, empty, or error states.

```tsx
export function StatusNotice({ tone = "info", title, detail }: {
  tone?: "info" | "warning" | "error";
  title: string;
  detail: string;
}) {
  const toneClass = tone === "error" ? "text-danger" : tone === "warning" ? "text-primary" : "text-ink";
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-hairline bg-surface-1/80 px-8 py-16 text-center backdrop-blur-sm">
      <p className={`text-lg font-medium ${toneClass}`}>{title}</p>
      <p className="max-w-md text-sm text-ink-subtle">{detail}</p>
    </div>
  );
}
```

Other component files are page-independent data labels: `DirectionalValue`, `GeneratedLabel`, and `SourceLabel`.
