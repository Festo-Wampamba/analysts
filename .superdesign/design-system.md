# Analysts research workspace visual system

The root screen is a long-form equity research workspace based on `Designs/FinalDesing.html` and the supplied Image #5 reference. It is intentionally dark, editorial, and information-dense: a glass navigation shell, a two-column research report with a sticky section index, then a Daily Idea engine workspace below. The static template is the visual contract; backend wiring can replace the values without changing the composition.

## Tokens

- Canvas: `#070a0f`, with a 72px low-contrast grid and blue-gray radial ambient light.
- Ink: `#f6f8fb`; secondary: `#9ba7b5`; tertiary: `#718079`.
- Glass surfaces: `rgba(17,22,30,.66)` and `rgba(20,26,35,.84)` with `rgba(193,211,229,.12)` hairlines.
- Primary accent: steel blue `#9fc4df`; positive: `#22c55e`; negative: `#ef4444`.
- Display: Space Grotesk. Body/UI: IBM Plex Sans. Data, labels, timestamps: IBM Plex Mono.
- Shape: 15px cards, 18px navigation and chart surfaces, 26px hero/pick surfaces, pill controls.
- Shadow: `0 24px 80px rgba(0,0,0,.34)` with a subtle inset top highlight.
- Readability: body and decision-support copy are at least 16px with a 1.55–1.65 line height; table and form values are 14–15px; compact provenance labels may be smaller but never carry the main message.
- Layout: primary content uses a 1320px maximum width, 48px desktop gutters, a 196px report index, and consistent 18–20px inner panel padding. Related panels share left and right edges rather than drifting independently.
- Motion: ambient light, grid drift, and surface depth use slow transform/opacity-only animation in the existing blue-gray palette. Motion remains decorative, never moves content, and is disabled for `prefers-reduced-motion`.

## Information architecture

Topbar → Research report shell → sticky report navigation → AAPL hero/chart → Overview → Financials → Valuation → Peers → Catalysts → Risks → Bull / Base / Bear → Investment thesis → Sources → Daily Idea engine → qualified CRWD pick → no-idea state → ranked candidates → engine status → footer.

## Component rules

- Provider facts use the search icon and steel-blue eyebrow treatment.
- Generated narrative uses the sparkle icon and the same steel-blue language; avoid large saturated color rails.
- Financial changes use green/red only for direction, never as the primary surface treatment.
- Numbers, prices, scores, timestamps, and API paths use IBM Plex Mono for alignment and provenance.
- Tables preserve explicit columns on desktop and collapse to readable ticker/catalyst/confidence rows on mobile.
- The report index becomes a horizontal, scrollable anchor bar below 1023px.
- Research and Daily Idea are separate anchors in the topbar, but remain one scrollable page until routing/backend wiring is introduced.
- Price charts do not show a permanent terminal dot. A crosshair, temporary point, current value, and full day/date/time appear only when the user hovers or navigates the chart.

## Source of truth

The composition, copy, section order, and responsive intent come from `Designs/FinalDesing.html`. The production React implementation is in `app/page.tsx`; visual tokens and responsive rules are in `app/globals.css`.
