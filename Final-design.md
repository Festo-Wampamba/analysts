# Analysts — Product UI Design Specification

**Status:** Implementation-ready design source for the Analysts equity-research interface  
**Source of truth:** `Analysts.polished.dc.html`, final polished version  
**Scope:** Research workspace and Daily Idea workspace, desktop through mobile  
**Validation status:** The design system is derived from the implemented HTML. Product usability with real analysts is unvalidated, and visual parity must be checked after the cloud-code implementation is rendered.

---

## 1. Product and design intent

Analysts is a dark, professional equity-research interface. It must feel like a serious financial workstation: calm, legible, source-aware, and information-dense without looking crowded.

The visual language combines:

- a graphite/slate canvas;
- restrained, readable glass surfaces;
- steel-blue accents for interaction and navigation;
- green only for genuine positive financial movement;
- red only for genuine negative movement, failure, or material risk;
- clear separation between sourced facts and AI-generated interpretation;
- human-scale spacing, purposeful icons, and minimal decoration.

### Non-negotiable rules

1. Do not add decorative connector lines, dashed side rails, colored dots, neon glows, or crypto-style effects.
2. Do not use yellow, pink, or green as general decoration.
3. Green means positive financial movement only. Red means negative movement, failure, or warning.
4. Navigation and actions use the neutral steel-blue accent, not financial semantic colors.
5. Sourced facts and AI narrative must be identified by icon plus text, never by color alone.
6. Glass must remain readable. Text contrast is more important than transparency.
7. Financial values, dates, percentages, tickers, scores, and provider metadata use tabular/monospace typography.

---

## 2. Information architecture

The product has two primary workspaces.

### 2.1 Research

Purpose: create and read a complete equity-research report for one ticker.

Order of content:

1. Global navigation
2. Report section navigation
3. Research hero
4. Overview
5. Financials
6. Valuation
7. Peers
8. Catalysts
9. Risks
10. Bull / Base / Bear cases
11. Thesis
12. Sources and provider status
13. Legal/footer disclosure

### 2.2 Daily Idea

Purpose: show the best qualifying idea from the scheduled daily screen without forcing a pick.

Order of content:

1. Global navigation
2. Daily Idea heading and screen timestamp
3. Qualified-pick card or empty state
4. Ranked candidates
5. Engine status
6. Legal/footer disclosure

### 2.3 Required application states

- Research loading
- Research complete
- Research partially complete with one or more provider failures
- Research not found / invalid ticker
- Daily Idea loading
- Daily Idea with a qualifying pick
- Daily Idea with no qualifying pick
- Daily Idea engine failure
- Search idle, focused, loading, success, and error

Do not hide upstream failures. Display what succeeded, identify what failed, and state which analysis was omitted as a result.

---

## 3. Design tokens

The tokens below are canonical. The prototype contains legacy inline yellow, pink, and green declarations that are overridden by its final stylesheet; do not copy those literal inline values into the production implementation.

### 3.1 Color palette

#### Neutral foundation

| Token | Value | Use |
|---|---:|---|
| `color.canvas` | `#070A0F` | Page background |
| `color.canvas.deep` | `#05070B` | Deep background fallback and footer depth |
| `color.ink` | `#F6F8FB` | Primary text and high-emphasis values |
| `color.ink.soft` | `#E7F1F8` | Selected labels on accent surfaces |
| `color.muted` | `#9BA7B5` | Supporting text, metadata, labels |
| `color.muted.low` | `#718079` | Low-emphasis controls and inactive chart ranges |
| `color.surface` | `rgba(17, 22, 30, 0.66)` | Default glass panel |
| `color.surface.strong` | `rgba(20, 26, 35, 0.84)` | High-priority glass panel |
| `color.surface.hover` | `rgba(255, 255, 255, 0.045)` | Neutral hover |
| `color.surface.selected` | `rgba(255, 255, 255, 0.065)` | Selected navigation surface |
| `color.border` | `rgba(193, 211, 229, 0.12)` | Default border/divider |
| `color.border.strong` | `rgba(193, 211, 229, 0.21)` | Hero and selected panel border |

#### Interaction accent

| Token | Value | Use |
|---|---:|---|
| `color.accent` | `#9FC4DF` | Links, active navigation, focus, primary action |
| `color.accent.strong` | `#8FB8D8` | Strong accent and charts that are not directional |
| `color.accent.soft` | `rgba(143, 184, 216, 0.105)` | Selected navigation background |
| `color.accent.tint` | `rgba(159, 196, 223, 0.055)` | Provenance and neutral information tint |
| `color.accent.hover` | `#B7D5E9` | Link/button hover |

#### Financial and system semantics

| Token | Value | Use |
|---|---:|---|
| `color.positive` | `#22C55E` | Rising chart line, positive delta, positive growth |
| `color.positive.point` | `#86EFAC` | Positive chart point outline |
| `color.positive.soft` | `rgba(34, 197, 94, 0.12)` | Optional positive tint; use sparingly |
| `color.negative` | `#EF4444` | Decline, failed provider, material negative signal |
| `color.negative.soft` | `rgba(239, 68, 68, 0.10)` | Error/failure surface tint |
| `color.warning` | `#F59E0B` | Reserved for real caution states only; not decorative |
| `color.warning.soft` | `rgba(245, 158, 11, 0.10)` | Reserved warning background |

### 3.2 Semantic color rules

- Positive price change: green text plus `▲` and signed percentage.
- Negative price change: red text plus `▼` and signed percentage.
- Flat/neutral change: muted text plus `—` or `0.00%`.
- Rising price chart: green line and green area gradient.
- Falling price chart: red line and red area gradient.
- Mixed/time-series chart: segment by direction only when the data model supports it; otherwise use the latest net direction and include values/tooltips.
- Primary buttons, links, tabs, provider labels, AI labels, and verification states stay steel-blue/neutral.
- Warnings may use amber only when a user decision needs caution. Never use amber to mean AI-generated.
- Never communicate status through color alone.

### 3.3 Canonical CSS variables

```css
:root {
  --color-canvas: #070a0f;
  --color-canvas-deep: #05070b;
  --color-ink: #f6f8fb;
  --color-ink-soft: #e7f1f8;
  --color-muted: #9ba7b5;
  --color-muted-low: #718079;

  --color-accent: #9fc4df;
  --color-accent-strong: #8fb8d8;
  --color-positive: #22c55e;
  --color-positive-point: #86efac;
  --color-negative: #ef4444;
  --color-warning: #f59e0b;

  --surface-glass: rgba(17, 22, 30, 0.66);
  --surface-glass-strong: rgba(20, 26, 35, 0.84);
  --surface-hover: rgba(255, 255, 255, 0.045);
  --surface-selected: rgba(255, 255, 255, 0.065);
  --border-default: rgba(193, 211, 229, 0.12);
  --border-strong: rgba(193, 211, 229, 0.21);

  --shadow-panel: 0 24px 80px rgba(0, 0, 0, 0.34),
                  inset 0 1px 0 rgba(255, 255, 255, 0.045);
  --shadow-floating: 0 14px 46px rgba(0, 0, 0, 0.28),
                     inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

---

## 4. Typography

### 4.1 Font families

| Role | Family | Weights | Fallback |
|---|---|---|---|
| Display and headings | Space Grotesk | 400, 500, 600 | `system-ui, sans-serif` |
| UI and body | IBM Plex Sans | 400, 500, 600 | `system-ui, sans-serif` |
| Financial data and metadata | IBM Plex Mono | 400, 500 | `ui-monospace, monospace` |

Use `font-variant-numeric: tabular-nums` for prices, financial statements, scores, timestamps, percentages, and tables even when a fallback font is active.

### 4.2 Type scale

| Token | Desktop | Mobile | Family/weight | Line height | Use |
|---|---:|---:|---|---:|---|
| `type.ticker` | 56 px | 44–45 px | Space Grotesk 500 | 0.92–1.0 | Main ticker symbol |
| `type.page-title` | 36 px | 32 px | Space Grotesk 500 | 1.05 | Workspace title / empty state title |
| `type.section-title` | 23–24 px | 22 px | Space Grotesk 500 | 1.2 | Report sections |
| `type.card-title` | 20 px | 19 px | Space Grotesk 500 | 1.25 | Card headings |
| `type.company` | 18 px | 17 px | IBM Plex Sans 400 | 1.35 | Company name |
| `type.body-large` | 17 px | 16 px | IBM Plex Sans 400 | 1.6 | Thesis and primary narrative |
| `type.body` | 16 px | 15–16 px | IBM Plex Sans 400 | 1.6–1.62 | Report narrative |
| `type.ui` | 14 px | 14 px | IBM Plex Sans 400/500 | 1.4 | Buttons, navigation, table copy |
| `type.data` | 15 px | 14–15 px | IBM Plex Mono 400/500 | 1.35 | Standard financial value |
| `type.data-large` | 32 px | 28 px | IBM Plex Mono 500 | 1.1 | Quote price |
| `type.meta` | 12 px | 11–12 px | IBM Plex Mono 400 | 1.5 | Timestamps and provenance |
| `type.overline` | 10–11 px | 10–11 px | IBM Plex Mono 500 | 1.3 | Uppercase labels |

### 4.3 Typography behavior

- Display headings use slight negative tracking: `-0.02em` to `-0.03em`.
- Financial data uses `0.01em` to `0.02em` positive tracking for scanability.
- Overlines use uppercase with `0.12em` to `0.16em` tracking.
- Narrative copy should normally stay below 72 characters per line.
- Use `text-wrap: pretty` for narrative and `text-wrap: balance` for short headings where supported.
- Never use monospace for long narrative paragraphs.

---

## 5. Spacing, sizing, and shape

### 5.1 Spacing scale

Use a 4 px base grid.

```text
space-1  = 4 px
space-2  = 8 px
space-3  = 12 px
space-4  = 16 px
space-5  = 20 px
space-6  = 24 px
space-7  = 28 px
space-8  = 32 px
space-10 = 40 px
space-14 = 56 px
space-18 = 72 px
space-24 = 96 px
```

Irregular values such as 10, 14, 18, 22, 26, and 30 px may be retained where they already define the polished optical spacing, but new components should start on the 4 px scale.

### 5.2 Radius scale

| Token | Value | Use |
|---|---:|---|
| `radius.control` | 9–12 px | Nav item, input, compact control |
| `radius.card` | 15–18 px | Standard glass card |
| `radius.hero` | 26 px | Research hero and Daily Idea main card |
| `radius.hero.mobile` | 20 px | Main cards on mobile |
| `radius.pill` | 999 px | Tags and compact status chips only |

### 5.3 Borders

- Standard: `1px solid var(--border-default)`.
- Emphasized: `1px solid var(--border-strong)`.
- Dividers: `1px solid rgba(255,255,255,0.05–0.08)`.
- No decorative dashed borders.
- No colored left rails on sourced or AI cards.

---

## 6. Glass and depth system

Glassmorphism is selective, not universal.

### 6.1 Glass recipes

| Surface | Background | Blur/saturation | Border | Shadow |
|---|---|---|---|---|
| Floating topbar | `rgba(11,16,22,.72)` | `blur(28px) saturate(135%)` | default | floating |
| Report section nav | `rgba(15,20,28,.64)` | `blur(22px) saturate(125%)` | default | panel |
| Research hero | graphite/slate gradient, 70–84% alpha | `blur(28px) saturate(125%)` | strong | panel |
| Standard card | dark graphite gradient, 54–74% alpha | `blur(24px) saturate(118%)` | default | panel/subtle |
| Footer | `rgba(5,7,11,.56)` | `blur(18px)` | top divider | none |

### 6.2 Readability rules

- Do not place body text directly on a bright ambient orb.
- Major text panels must retain at least approximately 70% dark opacity in their strongest layer.
- Use only a faint inner highlight at the top edge.
- Avoid white haze, frosted-milk surfaces, and blur values above 32 px.
- If `backdrop-filter` is unsupported, fall back to `--surface-glass-strong` without changing layout.

### 6.3 Ambient background

Use two very low-contrast steel-blue radial lights and a subtle 72 px grid. The background must disappear progressively toward the page bottom. Ambient elements are decorative, fixed, non-interactive, and `aria-hidden`.

Do not use blue/pink dots, particle fields, chart-like decoration, or glowing connector lines.

---

## 7. Layout system

### 7.1 Global shell

- Viewport minimum height: `100vh`.
- Content maximum width: `1320px`.
- Desktop page gutters: `24px` minimum.
- Mobile page gutters: `16px`.
- Main top spacing beneath topbar: `56px` desktop, `34px` mobile.
- Bottom content padding: `96px` desktop, `72px` mobile.

### 7.2 Topbar

- Sticky/floating at 14 px from the top on desktop, 8 px on mobile.
- Maximum width: 1320 px.
- Height: 64 px.
- Radius: 18 px desktop, 15 px mobile.
- Horizontal padding: 18 px desktop, 12 px mobile.
- Content order: brand, workspace switcher, ticker search, market-data status.
- Hide the domain label and live-status chip when space becomes constrained.
- Hide the ticker search on mobile; expose search through a dedicated icon/button or mobile sheet in production.

### 7.3 Research layout

Desktop (`>1100px`):

- Two-column layout.
- Section navigation: 196 px fixed basis.
- Gap between navigation and report: 30 px.
- Report column: flexible, minimum practical width 600 px.
- Section navigation is sticky below the topbar.

Tablet (`768–1100px`):

- Stack navigation above report content.
- Convert section navigation to a horizontally scrollable tab rail.
- Keep the rail sticky beneath the topbar.
- Preserve active-section visibility by scrolling the active tab into view.

Mobile (`≤767px`):

- One-column layout.
- 16 px horizontal gutters.
- Horizontal section rail remains sticky.
- Do not show a desktop-style side navigation.
- Hero padding: `22px 18px`.
- Hero/chart radius: 20 px / 14–18 px.

### 7.4 Daily Idea layout

- Single vertical page, max width 1320 px.
- Main pick card has a 1.15fr / 1fr split on desktop.
- Collapse to one column at 767 px.
- Ranked Candidates and Engine Status use a 2:1 flexible split on desktop and stack on narrow screens.

### 7.5 Breakpoint implementation

Use these normalized production breakpoints:

```css
/* Mobile */
@media (max-width: 767px) { }

/* Tablet and compact desktop */
@media (min-width: 768px) and (max-width: 1100px) { }

/* Full desktop */
@media (min-width: 1101px) { }
```

The prototype uses both 1023 px and 1100 px for closely related layout transitions. Consolidate them to 1100 px in production to avoid a narrow inconsistent range.

---

## 8. Iconography

Use simple outline SVG icons with:

- 14–16 px default size;
- 1.8 px stroke;
- round caps and joins;
- `currentColor` stroke;
- no filled colored circles behind icons unless the control itself requires a selected surface.

Recommended semantic mapping:

| Meaning | Icon |
|---|---|
| Research | Bar chart / analytics |
| Daily Idea / AI narrative | Sparkles |
| Search | Magnifying glass |
| Sourced provider data | Database |
| Verified engine/provider | Shield check |
| Failed provider | Triangle alert |
| Copy thesis | Copy |
| Open report | Arrow right / external link |
| Positive move | Arrow up-right plus signed value |
| Negative move | Arrow down-right plus signed value |

Use inline SVGs or the icon system already present in the production repository. Do not add a new icon dependency solely for this interface.

---

## 9. Component specification

### 9.1 Brand lockup

- Mark: 30 × 30 px desktop, 28 × 28 px mobile.
- Radius: 10 px.
- Letter `A` in Space Grotesk 600, approximately 13 px.
- Product name: Space Grotesk 500, 17 px.
- Domain: IBM Plex Mono 400, 11 px, muted; hide on small screens.

### 9.2 Workspace switcher

- Two items: `Research` and `Daily Idea`.
- Each item includes icon and text.
- Minimum target height: 40 px.
- Padding: 9 px 14 px.
- Active: primary text, neutral selected surface, subtle inner border.
- Inactive: muted text, transparent background.
- Hover: neutral surface hover.
- Do not represent active state with a colored dot.

### 9.3 Ticker search

- Desktop size: minimum 246 × 40 px.
- Radius: 12 px.
- Search icon at start; `/` keyboard shortcut hint at end.
- IBM Plex Mono 13 px input text.
- Focus: stronger accent border plus 3 px low-opacity focus halo.
- Support keyboard submit and Escape to clear/close.
- Production mobile pattern: search icon opens a full-width search sheet/dialog.

### 9.4 Market status chip

- Icon plus text, never dot-only.
- IBM Plex Mono 10–11 px.
- Neutral border and surface.
- `Market data live` must reflect real state. If freshness is unknown, label `Market data status unknown` rather than showing live.

### 9.5 Report section navigation

- Label: `REPORT SECTIONS`, 10 px mono overline.
- Items: 13 px IBM Plex Sans.
- Active: accent text, faint accent gradient, and structural border indicator.
- Desktop uses a left indicator; tablet/mobile uses a bottom indicator.
- No full-height rails or lines extending beyond each item.
- Smooth scrolling is allowed, but respect reduced motion.

### 9.6 Research hero

Contains:

1. Research-type badge with Search icon
2. Generated timestamp and duration
3. Ticker symbol
4. Company name, exchange, sector, and industry
5. Sourced quote card
6. Provenance legend
7. Price-profile chart

Desktop padding: 30 px. Gap: 24 px. Radius: 26 px. Mobile padding: `22px 18px`; radius: 20 px.

The ticker is the visual anchor. The company name and classification are secondary. Quote freshness must be shown close to the price.

### 9.7 Provenance badge/card

Two semantic types:

- **Sourced fact:** Database icon + exact provider name + dataset/endpoint label where useful.
- **AI-generated:** Sparkles icon + `AI-generated` + description of what was generated.

Both types use neutral glass styling. Their difference is conveyed through icon and text, not green/yellow/pink borders.

### 9.8 Quote card

- Provider/source overline at top.
- Price: 32 px IBM Plex Mono 500.
- Delta: 15 px IBM Plex Mono, positioned on the same baseline.
- Freshness and previous close: 11 px mono below.
- Positive delta green; negative delta red; neutral gray.
- The card itself remains neutral glass.

### 9.9 Market chart

- Height: 188 px desktop, 164 px mobile.
- Radius: 18 px desktop.
- Header includes label and selectable time ranges.
- Chart plot height: approximately 132 px desktop, 112 px mobile.
- Grid: white at 5.5% alpha.
- Positive net movement: `#22C55E` line, 2.2 px, round joins; gradient from 20% green alpha to transparent.
- Negative net movement: `#EF4444` line with matching red-to-transparent gradient.
- Latest point: dark fill and semantic outline, 2.5 px stroke.
- Add accessible text summary and keyboard-readable values/tooltips in production.
- Chart color must be computed from the displayed period, not hard-coded.

### 9.10 Report section

- Heading: number in muted mono plus title in Space Grotesk.
- Section vertical gap: 18 px.
- Gap between major sections: 56–58 px.
- No decorative line after heading.
- Content can contain sourced cards, AI narrative cards, financial tables, scenario cards, or failure notices.

### 9.11 Financial metric grid

- Use CSS Grid with `repeat(auto-fit, minmax(150px, 1fr))` for overview metrics.
- Each metric has a 12 px muted label and 15 px mono value.
- Growth/delta columns align right.
- Use tabular numerals and consistent units.
- Never color a raw value green merely because the company is generally performing well; color only the explicit delta/direction.

### 9.12 Data tables

- Header: 10–11 px mono uppercase with 0.14em tracking.
- Body: 14 px labels, 15 px mono values.
- Row vertical padding: 13 px.
- Dividers: 5–8% white alpha.
- Hover: faint steel-blue surface and maximum 2 px horizontal movement.
- Right-align numeric columns.
- Preserve header associations and table semantics in production.

Responsive behavior:

- Ranked candidates desktop columns: `64px 60px 1fr 1.25fr 74px`.
- Ranked candidates mobile columns: `56px 1fr 72px`; hide Score and Sector, retain Ticker, Catalyst, and Confidence.
- Peers desktop retains the full comparison; mobile prioritizes ticker/company, valuation, and growth/return columns.
- If information is hidden visually, it must remain available through row expansion or a detail view.

### 9.13 Scenario cards: Bull / Base / Bear

- Keep all three cards structurally identical.
- Use neutral glass by default.
- Directional financial outcome may use a small semantic icon/value, but not a fully saturated green/red card.
- Show assumptions, target/range, and falsifier for each case.
- Base case should not appear more certain than the underlying data supports.

### 9.14 Daily pick card

- Radius: 26 px desktop, 20 px mobile.
- Padding: 30 px desktop, `22px 18px` mobile.
- Ticker: 56 px Space Grotesk 500.
- Display sector and rank as neutral pills.
- Score bar uses the interaction accent, not pink or green.
- Sourced quote and metrics stay neutral cards; only directional deltas use green/red.
- AI rationale uses Sparkles icon and text label.

Primary action: `Open full report`  
Secondary action: `Copy thesis`

Both actions use neutral/accent styling. Green is not an action color.

### 9.15 No-qualifying-idea state

Required content:

- Explicit title: `No qualifying idea today`.
- Plain explanation that the engine ran successfully but no candidate crossed the threshold.
- Highest score, threshold, and universe evaluated.
- Next scheduled run.
- Secondary route to research a ticker manually.

Never manufacture or promote a low-confidence pick to avoid an empty state.

### 9.16 Provider failure state

- Triangle Alert icon + `Failed` label.
- Red semantic text/border used sparingly.
- Display provider/endpoint, time, and machine-readable status where helpful.
- State the direct impact: for example, `Sentiment was rate-limited, so this report does not use sentiment data.`
- Never silently substitute AI output for missing sourced data.

### 9.17 Footer

- Provider attribution on the left.
- `Research output, not investment advice` disclosure and Methodology link on the right.
- Stack naturally on mobile.
- The disclaimer must remain visible on both workspaces.

---

## 10. Interaction states

Every interactive component must define:

- default;
- hover;
- keyboard focus-visible;
- pressed/active;
- disabled;
- loading;
- error where applicable.

### 10.1 Focus

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
```

Do not remove focus outlines unless a visible equivalent is provided.

### 10.2 Hover

- Controls: background transition, 150–180 ms.
- Table rows: faint background and at most 2 px translation.
- Primary action: at most 1 px upward movement.
- No scaling, bouncing, or neon glow.

### 10.3 Loading

- Prefer structural skeletons that match the final component geometry.
- Keep the current workspace visible during background refresh when safe.
- Do not shift major layout when data arrives.
- Announce asynchronous results through an appropriate live region.

---

## 11. Motion

Motion should clarify state, not decorate the page.

| Motion | Duration | Easing |
|---|---:|---|
| Card entrance | 400 ms | `cubic-bezier(.22,.7,.3,1)` |
| Hover/focus | 150–180 ms | `ease` |
| Tab/section state | 150 ms | `ease` |
| Scroll to report section | browser smooth | disabled for reduced motion |

Entrance motion: opacity 0 to 1, translateY 14 px to 0.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 12. Accessibility requirements

Target WCAG 2.2 AA. This target is not yet verified against the cloud implementation.

- All controls must be keyboard reachable.
- Use semantic `nav`, `main`, `article`, `section`, `table`, `button`, and `footer` elements.
- The active workspace uses `aria-current="page"` or an equivalent selected-tab pattern.
- The report section nav exposes the current section programmatically.
- Search has a visible label or accessible name.
- Icon-only buttons have accessible labels.
- Decorative SVGs and ambient layers use `aria-hidden="true"`.
- Provider and AI provenance always include readable text.
- Positive/negative movement always includes direction/sign, not color alone.
- Charts require a text summary and data access through tooltip/table/detail.
- Minimum interactive target: 40 × 40 px; prefer 44 × 44 px on touch screens.
- Body text should not fall below 14 px; metadata may use 10–12 px only when non-critical.
- Do not trap horizontal keyboard scrolling in the mobile report rail.

---

## 13. Data display and provenance contract

### 13.1 Display model

Every externally sourced data block should support:

```ts
type Provenance = {
  provider: string;
  endpoint?: string;
  fetchedAt: string;       // ISO timestamp
  providerTimestamp?: string;
  status: 'fresh' | 'stale' | 'failed' | 'unknown';
  httpStatus?: number;
};
```

Every AI-generated block should support:

```ts
type GeneratedContentMeta = {
  generatedAt: string;     // ISO timestamp
  basedOn: string[];       // source block identifiers
  modelLabel?: string;     // optional user-visible disclosure
  limitations?: string[];
};
```

### 13.2 Directional value model

Do not infer positive/negative styling from a formatted string.

```ts
type Direction = 'positive' | 'negative' | 'neutral';

type DirectionalValue = {
  value: number;
  formatted: string;
  direction: Direction;
  comparisonLabel?: string; // e.g. "vs previous close"
};
```

The API/domain layer determines direction. The UI only renders the semantic state.

### 13.3 Chart direction

For a selected chart period:

```ts
const direction = lastClose > firstClose
  ? 'positive'
  : lastClose < firstClose
    ? 'negative'
    : 'neutral';
```

Use adjusted or unadjusted prices consistently. The backend/API contract must state which is provided.

---

## 14. Suggested component hierarchy

Framework names are illustrative; preserve the boundaries in any stack.

```text
AnalystsApp
├── AmbientBackground
├── Topbar
│   ├── BrandLockup
│   ├── WorkspaceSwitcher
│   ├── TickerSearch
│   └── MarketStatusChip
├── ResearchWorkspace
│   ├── ReportSectionNav
│   └── ResearchReport
│       ├── ResearchHero
│       │   ├── TickerIdentity
│       │   ├── QuoteCard
│       │   ├── ProvenanceLegend
│       │   └── MarketChart
│       ├── OverviewSection
│       ├── FinancialsSection
│       ├── ValuationSection
│       ├── PeersSection
│       ├── CatalystsSection
│       ├── RisksSection
│       ├── ScenariosSection
│       ├── ThesisSection
│       └── SourcesSection
├── DailyIdeaWorkspace
│   ├── DailyIdeaHeader
│   ├── DailyPickCard | NoQualifiedIdea
│   ├── RankedCandidates
│   └── EngineStatus
└── LegalFooter
```

### Component design rule

Keep data fetching/domain logic outside visual primitives. Components receive typed values, direction, provenance, freshness, and failure state explicitly.

---

## 15. Implementation guidance for cloud code

### 15.1 Recommended order

1. Create global tokens, font loading, reset, and app canvas.
2. Build the shell and responsive topbar.
3. Build reusable primitives: `GlassPanel`, `Badge`, `IconLabel`, `DirectionalValue`, `SourceLabel`, `GeneratedLabel`, and `StatusNotice`.
4. Implement the Research layout and section navigation.
5. Implement Research Hero and semantic chart colors.
6. Implement report sections and responsive data tables.
7. Implement Daily Idea qualified and empty states.
8. Wire loading, empty, stale, partial failure, and error states.
9. Add keyboard behavior, accessible chart alternative, and reduced motion.
10. Run visual, responsive, accessibility, and data-provenance QA.

### 15.2 Do not port from the prototype

- Inline styles as the long-term styling architecture.
- Legacy literal `#10B981`, `#F59E0B`, `#38BDF8`, or `#EC4899` declarations that the final CSS override neutralizes.
- Hard-coded tickers, prices, timestamps, scores, provider status, or chart direction.
- Runtime loading of React from a public CDN.
- Provider credentials or secrets in browser code.
- Dot-only status indicators.
- Decorative rail lines.

### 15.3 Production styling structure

Use one of these existing-project-compatible approaches:

- CSS variables + CSS Modules;
- CSS variables + scoped component styles;
- design tokens mapped into the repository's existing utility framework.

Do not introduce a new styling framework only for this page.

### 15.4 Font delivery

Prefer self-hosted WOFF2 assets or the application's existing font pipeline. If remote font loading fails, the interface must remain functional and legible with the specified fallbacks.

### 15.5 Performance

- Avoid applying backdrop blur to every nested element.
- Keep ambient layers to two radial elements plus one pseudo-element/grid.
- Render SVG charts responsively without expensive filters.
- Reserve layout space for asynchronously loaded values.
- Bundle framework dependencies locally.

---

## 16. Verification checklist

### 16.1 Visual parity

- [ ] Desktop checked at 1600 × 1000.
- [ ] Compact desktop/tablet checked at 1024 × 768.
- [ ] Mobile checked at 390 × 844.
- [ ] No clipped ticker, value, label, or table content.
- [ ] No horizontal page overflow.
- [ ] Glass panels remain readable over ambient lights.
- [ ] No yellow or pink decorative styling appears.
- [ ] No blue/pink dots or decorative connector rails appear.
- [ ] Positive chart and positive deltas are green.
- [ ] Negative chart and negative deltas are red.
- [ ] Actions and navigation remain steel-blue/neutral.

### 16.2 Functional states

- [ ] Research and Daily Idea switch without losing expected state.
- [ ] Section navigation selects and scrolls to the correct section.
- [ ] Search handles valid, invalid, loading, and network-failure cases.
- [ ] Daily Idea shows a qualifying pick only above the configured threshold.
- [ ] No-pick state shows threshold, highest score, universe, and next run.
- [ ] Partial provider failure does not hide successful sections.
- [ ] Failed source is excluded from generated conclusions.
- [ ] Copy Thesis provides success/failure feedback.

### 16.3 Accessibility

- [ ] Keyboard-only navigation completes both workflows.
- [ ] Focus is always visible.
- [ ] Screen reader identifies workspace, active section, provenance, and status.
- [ ] Direction remains understandable with color disabled.
- [ ] Contrast passes WCAG 2.2 AA for all essential text and controls.
- [ ] Reduced-motion preference disables entrance and smooth-scroll motion.
- [ ] Chart has equivalent text/data access.

### 16.4 Data correctness

- [ ] Price freshness is displayed from a real timestamp.
- [ ] Positive/negative direction is computed from numeric data, not string parsing.
- [ ] Chart color matches the selected range's net direction.
- [ ] Units, currency, period, and comparison basis are explicit.
- [ ] Provider status reflects the actual request outcome.
- [ ] AI narrative lists or links to the source blocks it used.

### 16.5 Performance and resilience

- [ ] Application works when remote fonts fail.
- [ ] Application has no public-CDN framework runtime dependency.
- [ ] Fallback surfaces work when backdrop-filter is unavailable.
- [ ] Layout remains stable while data loads.
- [ ] Browser console has no uncaught errors.

---

## 17. Failure and falsifier review

### Most likely production failure

**Failure:** semantic colors become inconsistent because components infer direction independently or reuse green for success/actions.  
**Observable signal:** a positive value or rising chart appears red/neutral, a negative value appears green, or non-financial buttons/verification chips begin using green.

**Prevention:** calculate `direction` once in the data/domain layer, pass it as a typed property, and restrict all directional rendering to `DirectionalValue` and chart primitives.

### Falsifier

This specification should be revised if rendered cloud-code screens at 1600 × 1000, 1024 × 768, and 390 × 844 show that the normalized tokens or 1100 px breakpoint materially reduce readability or fail to reproduce the approved hierarchy. Real analyst usability tests may also falsify the current density, section order, or navigation pattern.

### Checks still owed

Run the finished application and capture:

```bash
npm run build
npm run test
npm run lint
```

Then perform browser QA at `1600x1000`, `1024x768`, and `390x844`, plus an automated accessibility scan with the repository's existing test tooling. Exact commands may differ because the production repository and framework were not provided.

---

## 18. Handoff definition of done

The cloud-code implementation is complete only when:

1. both workspaces and all required states are functional;
2. canonical tokens replace prototype inline overrides;
3. positive/negative semantics are data-driven;
4. provenance is explicit and accessible;
5. desktop, tablet, and mobile layouts pass the checklist;
6. framework dependencies are bundled locally;
7. tests/build/lint pass in the actual repository; and
8. screenshots are reviewed against the final polished design.

