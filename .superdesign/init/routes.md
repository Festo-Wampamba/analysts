# Routes

This is a Next.js 16 App Router project.

| URL | File | Summary |
| --- | --- | --- |
| `/` | `app/page.tsx` | Daily Idea Engine landing screen. |
| `/research` | `app/research/page.tsx` | Client-side ticker search entry point. |
| `/research/[ticker]` | `app/research/[ticker]/page.tsx` | Server-rendered ticker research result. |
| `/api/health` | `app/api/health/route.ts` | Health endpoint. |
| `/api/daily-idea` | `app/api/daily-idea/route.ts` | Latest daily idea endpoint. |
| `/api/research/[ticker]` | `app/api/research/[ticker]/route.ts` | Research data endpoint. |
| `/api/screen` | `app/api/screen/route.ts` | Screening trigger/status endpoint. |

The requested template targets `/` only. Backend route behavior remains outside the visual redesign.
