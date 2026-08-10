# Analysts Daily Idea Engine visual system

The `/` screen is a dark, editorial equity-screening readout modeled on the supplied Image #2 reference. It is intentionally narrow and calm: a centered `880px` desktop column, a `56px` top bar, low-contrast graphite surfaces, and one green system accent used only for the complete state and positive price movement.

## Tokens

- Page: `#050505`; panel: `#0d0f10`; elevated panel: `#101112`; border: `#242628`.
- Main text: `#f0f1f2`; secondary: `#a2a5aa`; muted: `#686c72`.
- Positive/complete: `#00a63c`; positive soft: `rgba(0,166,60,.12)`.
- Score badge: `#17172a` with indigo text; no decorative gradients.
- Display: Space Grotesk. Body/UI: IBM Plex Sans. Data: IBM Plex Mono.
- Shape: `10px`–`12px` panel radius, `6px` row radius, 1px borders.
- Spacing: 16px base, 22px panel padding, 26px section rhythm.

## Required structure

Topbar → hero pick → four-cell stats row → Thesis / Key catalyst → Bull / Bear → Risks → Ranked candidates → footer.

Keep content source-aware, use bullets for thesis/risks, and keep all numeric values tabular. The visual-template phase is static; later backend wiring may replace these values without changing the layout.
