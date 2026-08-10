# Extractable components

No shared layout component exists yet. The requested Daily Idea screen is currently self-contained in `app/page.tsx`, so there is no component extraction step required for this visual pass.

Potential future extractions:

## DailyIdeaTopbar

- Source: `app/page.tsx`
- Category: `layout`
- Description: Minimal Analysts brand bar with Daily Idea Engine label and complete status.
- Extractable props: `status` (string, default: `complete`)
- Hardcoded: brand copy, status styling, border, typography.

## EvidenceCard

- Source: `app/page.tsx`
- Category: `basic`
- Description: Dark bordered content card for thesis, catalyst, and scenario copy.
- Extractable props: `title`, `children`, `tone` (string)
- Hardcoded: border, surface, padding, heading typography.
