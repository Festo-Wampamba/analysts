// Final-design.md §6.1 glass recipes. Only the two surfaces the current pages
// render are defined; topbar/nav/footer recipes land with the shell.
// ponytail: add variants when the component that needs them exists.
const recipes = {
  card: [
    "rounded-card border border-hairline shadow-panel",
    "bg-[linear-gradient(160deg,rgba(20,26,35,0.74),rgba(15,20,28,0.54))]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-blur-[24px]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-saturate-[1.18]",
  ].join(" "),
  hero: [
    // §5.2: hero radius drops to 20px on mobile.
    "rounded-[20px] sm:rounded-hero border border-hairline-strong shadow-panel",
    "bg-[linear-gradient(160deg,rgba(24,31,41,0.84),rgba(17,22,30,0.70))]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-blur-[28px]",
    "supports-[backdrop-filter:blur(0px)]:backdrop-saturate-[1.25]",
  ].join(" "),
} as const;

export function GlassPanel({
  children,
  className = "",
  tone = "card",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: keyof typeof recipes;
}) {
  return <div className={`${recipes[tone]} ${className}`}>{children}</div>;
}
