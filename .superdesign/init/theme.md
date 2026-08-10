# Theme tokens

## Compact token summary

- Canvas: `#070a0f` / deep `#05070b`; redesigned Daily Idea surface uses near-black `#050505`.
- Ink: `#f6f8fb`; soft `#e7f1f8`; muted `#9ba7b5`; low `#718079`.
- Accent: steel blue `#9fc4df`; strong `#8fb8d8`.
- Semantic: positive `#22c55e`, negative `#ef4444`, warning `#f59e0b`.
- Surfaces: glass `rgba(17,22,30,.66)`, strong `rgba(20,26,35,.84)`.
- Borders: default `rgba(193,211,229,.12)`, strong `rgba(193,211,229,.21)`.
- Fonts: Space Grotesk display, IBM Plex Sans body/UI, IBM Plex Mono data/metadata.
- Radii: control `10px`, card `16px`, hero `26px`.
- Shadows: dark panel shadow with a subtle inset top highlight.
- Tailwind: v4 via `@import "tailwindcss"` and `@theme inline` in `app/globals.css`.

## Raw source

```css
:root {
  --canvas: #070a0f;
  --canvas-deep: #05070b;
  --ink: #f6f8fb;
  --ink-soft: #e7f1f8;
  --muted: #9ba7b5;
  --muted-low: #718079;
  --accent: #9fc4df;
  --positive: #22c55e;
  --negative: #ef4444;
  --warning: #f59e0b;
  --surface-glass: rgba(17, 22, 30, 0.66);
  --surface-glass-strong: rgba(20, 26, 35, 0.84);
  --border-default: rgba(193, 211, 229, 0.12);
  --border-strong: rgba(193, 211, 229, 0.21);
}
```

The complete implementation is in `app/globals.css`; the reference Daily Idea CSS is scoped under `.daily-idea-page`.
