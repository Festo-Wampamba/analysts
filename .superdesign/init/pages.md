# Page dependency trees

## `/` — Daily Idea Engine

Entry: `app/page.tsx`

Dependencies:

- `app/page.tsx`
  - static Daily Idea template data
  - local presentational components: `Topbar`, `Hero`, `StatRow`, `Narrative`, `RankedCandidates`, `EngineStatus`
  - no API or database dependency in the visual-template phase

## `/research` — Ticker search

Entry: `app/research/page.tsx`

Dependencies:

- `app/research/page.tsx`
  - `next/navigation` router

## `/research/[ticker]` — Ticker research

Entry: `app/research/[ticker]/page.tsx`

Dependencies:

- `app/research/[ticker]/page.tsx`
  - `components/Badge.tsx`
  - `components/DirectionalValue.tsx`
  - `components/GeneratedLabel.tsx`
  - `components/GlassPanel.tsx`
  - `components/SourceLabel.tsx`
  - `components/StatusNotice.tsx`
  - `lib/research/report.ts`

All routes inherit `app/layout.tsx` and `app/globals.css`.
