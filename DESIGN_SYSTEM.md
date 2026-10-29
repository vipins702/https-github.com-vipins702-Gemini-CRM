# FlowCRM — Design System

**Style:** Apple-inspired — calm, content-first, shining white in light mode, true black in dark mode.
**Implementation:** `index.css` (tokens + component classes), `tailwind.config.cjs` (palettes → tokens),
`services/theme.ts` (light / dark / system, brand colour), `components/Record360.tsx` (360 building blocks).

---

## 1. Colour

All colours are CSS variables holding `R G B` channels, defined for light and dark. Tailwind's
palettes point at them, so the same class renders correctly in both themes.

| Role | Light | Dark | Tailwind |
|---|---|---|---|
| Page background | `#F5F5F7` | `#000000` | `bg-canvas` (set on `body`) |
| Card / panel | `#FFFFFF` | `#1C1C1E` | `bg-surface` |
| Raised / hover | `#FAFAFC` | `#2C2C2E` | `bg-surface-2`, `bg-gray-50` |
| Primary text | `#1D1D1F` | `#F5F5F7` | `text-gray-900`, `text-ink` |
| Secondary text | `#6E6E73` | `#98989D` | `text-gray-500`, `text-ink-muted` |
| Hairlines | `#E2E2E7` | `#38383A` | `border-gray-200` |
| Accent (brand) | `#0071E3` | `#0A84FF` | `bg-accent`, `text-accent`, `blue-*`, `indigo-*` |

**System colours** (status, charts, tinted icons): green `#34C759`, orange `#FF9500`, red `#FF3B30`,
purple `#AF52DE`, teal `#30B0C7`, pink `#FF2D55` — each a full 50–950 scale. Use the 50 shade as a
tint background with the 700 shade for text (`bg-green-50 text-green-700`); both adapt in dark mode.

**Brand colour** (Settings → Appearance) swaps the accent scale: blue (default), indigo, purple,
green, pink, orange.

Rules:
- Cards are `bg-surface` (never `bg-white`). `text-white` only on coloured fills.
- Never hard-code hex in components; charts use the Apple palette constants in `Dashboard.tsx`/`Reports.tsx`.
- An element that must stay dark in both themes (code blocks) uses `bg-[#1d1d1f]`.

## 2. Typography

One family: the Apple system font (`-apple-system`, SF Pro), with **Inter** where SF isn't available.

| Use | Size / weight |
|---|---|
| Page title | 28–34px, semibold/bold, tight tracking |
| Card title | 17px semibold |
| Body | 15px regular (14px in dense tables) |
| Labels (`.mono-label`) | 12px medium, secondary colour, sentence case |
| Minimum | 12px — nothing smaller |

No ALL-CAPS labels; numbers use `tnum` (tabular figures).

## 3. Shape, depth, motion

- Radius: inputs/buttons 10–12px, cards 18px (`glass-showcase`), pills fully round.
- Elevation: soft shadow + 0.5px hairline (`--elev-1/2/3/pop`); in dark mode a 1px light hairline.
- Materials: frosted sidebar and top bar (`bg-surface/80 backdrop-blur-xl`).
- Motion: 150–300ms, gentle ease; spring for small pop-ins; all motion respects
  `prefers-reduced-motion` and Settings → Animation.

## 4. Components

| Need | Use |
|---|---|
| Card | `<Card>` (default = white card with soft shadow) |
| Buttons | `<Button>`: `primary` (accent pill), `secondary` (grey pill), `ghost`, `outline`, `danger` |
| Status | `<Badge status>` or `.status-pill .status-{blue,green,orange,red,neutral}` (dot + tint) |
| App-icon tile | `.tri-ring-sq` (accent tile, white glyph) |
| 360 pages | `Avatar360`, `QuickActions` + `contactActions`, `StageProgress`, `StatTile`, `AboutList`, `ActivityTimeline` |

## 5. Accessibility checklist

- Text contrast ≥ 4.5:1 in both themes (secondary text uses the 500 neutral, not 400).
- Visible focus ring on every interactive element (`focus-ring` / global `:focus-visible`).
- Icon-only buttons have `aria-label`.
- Colour is never the only signal (status pills carry text; stage bar carries labels).
