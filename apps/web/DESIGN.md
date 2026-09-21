# Design

<!-- impeccable:design-schema 1 -->

## World

**Pit Wall** — the walking billboard treated as a liveried race panel: numbered sponsor zones sold by
position value, priced and stated with pit-lane precision. Chosen explicitly by the user over an
assigned alternate ("sponsorship media kit / rate card" direction) during the 2026-09 rebrand.
Replaces the previous dark neon-lime "hacker" aesthetic (Syne + IBM Plex + `#d6ff3c` lime).

Scope: the public marketing shell — landing page (`app/page.tsx`), header, footer, legal-page shell,
and the marketplace grid card — were rebuilt against this world. The rest of the app (dashboard,
campaign editor, 3D arena, photo editor, checkout overlays, auth) was **not** restructured, but
inherits the same color and type tokens automatically (see Tokens below), so it re-skins consistently
without a rewrite. Treat any new UI in those areas as inheriting this world, not a new one.

## Tokens (`app/globals.css`)

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#131418` | Base dark ground and primary text-on-light |
| `--panel` | `#1c1e24` | Raised dark surface (cards, the arena/photo "stage", carbon chrome) |
| `--paper` | `#f2efe6` | Light foreground (text-on-dark, light card fills) |
| `--accent` | `#e8641c` | The one committed color — Pit Orange. CTAs, prices, active/sold states, brand mark |
| `--accent-dim` | `#b94c15` | Accent hover/active |
| `--signal` | `#d1272f` | Flag Red — reserved *only* for live/sold/urgent/error states, never decorative |
| `--muted` | `#93918a` | Secondary text |
| `--line` | `rgba(242,239,230,.12)` | Hairline borders/dividers |

Tailwind v4 `@theme inline` maps these 1:1 to utilities (`bg-ink`, `text-accent`, `border-signal`, …).
**Do not add new brand colors** without updating this table — the palette is a closed, named set
(Restrained/Committed strategy: one accent carries the brand, red is meaning-coded, everything else
is neutral).

Historical note: the CSS custom properties and Tailwind classes were previously named `--lime` /
`--live`; they were renamed to `--accent` / `--signal` project-wide during the rebrand. If you find
`lime` or a color-purpose `live` class anywhere, it's stale and should be renamed to match.

## Type

- **Display** (`font-display`, `--font-big-shoulders` → Big Shoulders): all `h1`/`h2`/`h3` and `.display`.
  Always rendered uppercase, condensed, weight 800, tight negative tracking. This is the "livery
  lettering" voice — never use it for body copy or long-form text.
- **Body/UI** (`font-sans`, `--font-archivo` → Archivo): everything else — paragraphs, nav, buttons, labels.
- **Numeric/data** (`.figures`, `--font-jetbrains-mono` → JetBrains Mono, `font-variant-numeric: tabular-nums`):
  every price, slot number, timestamp, and counter. Reserve this for actual numbers/data — not a
  "technical" costume for arbitrary UI text.
- **Pit-board label** (`.pit-label`): small uppercase tracked mono, for status chips and table headers
  (e.g. "SOLD", "ARENA", "RESPONSE TIMES"). This is the one small-caps-label pattern in the system —
  don't add a second, differently-styled label convention.

## Motifs (use sparingly — these are signature, not decoration)

- **Roundel badge**: a numbered circle badge (ink fill, paper stroke, `.figures` numeral) marking a
  sellable zone or a ranked position (`P1`, `P2`, …). Used on the hero slot diagram and marketplace
  grid cards.
- **Pit stripe** (`.pit-stripe`): a single 3px diagonal orange/ink hazard stripe, used once per major
  section break (before a closing CTA, under a footer). Never stack more than one per view, never use
  as a generic rule/divider.
- **Carbon texture** (`.carbon`): a <6%-opacity diagonal weave, reserved for dark chrome/placeholder
  surfaces (e.g. `CampaignThumb`'s pending-render fallback). Not a background for body content.
- **Pit-board data readout**: a bordered list/table of label + `.figures` value rows (response-time
  SLAs, rate-card sheet, hero stat strip). This is the system's stand-in for "stat cards" — always a
  ruled list, never a grid of icon+number+label cards.

## Components

- `components/brand-mark.tsx` — `BrandRoundel` (SVG mark) and `BrandWordmark` (display wordmark). Used
  in header, footer, and should back any future favicon/OG work.
- `components/hero-livery-diagram.tsx` — the hand-authored SVG "garment flat" (numbered zones on a
  jacket silhouette) plus `HeroLiverySheet`, its paired rate-card list. Content is **illustrative
  demo data**, explicitly labeled "Sample slot map" — never wire real campaign data into this
  component's copy without removing that label.
- `components/campaign-thumb.tsx` — client component wrapping a campaign OG image with a branded
  carbon-texture + label fallback on load error. Use this instead of a bare `<img>` for any
  campaign-thumbnail rendering.
- `components/site-header.tsx` — desktop nav (`md:flex`) plus a `<details>`-based disclosure menu
  (no client JS) for `<md`. Add new top-level nav items to the shared `NAV_LINKS` array so desktop and
  mobile stay in sync.
- `components/legal-shell.tsx` — heading + `.pit-stripe` underline, no eyebrow/kicker label (banned
  pattern — do not reintroduce a small label above an `h1`).

## Explicit rules (from the craft floor, worth restating here)

- No kicker/eyebrow text above a heading, anywhere. Fold that information into a subhead line below
  the heading instead (see the `dashboard/page.tsx` fix: "Creator L2 · verified" moved under the `h1`).
- No same-size icon+heading+text card grids as page structure — prefer ruled lists/tables (the
  pit-board readout) or a sequenced list with real ordering information (the `P1`–`P4` how-it-works
  steps).
- `--signal` (Flag Red) is reserved for live/sold/urgent/error meaning only. If you want a second
  "loud" color for something decorative, that's a signal the system needs a real design decision, not
  a quiet reuse of this token.
- Self-host/open-source facts are real and must stay accurate, but stay in the footer/pricing
  footnote — never headline copy. Any real fee/pricing figure shown must come from `appConfig`
  (`hostedFeeBps`, etc.), never a hardcoded number.
- No invented customer names, testimonials, or metrics. The only demo content on the site is the
  hero's labeled-illustrative slot map.

## Known follow-ups (not done in this pass)

- The 3D arena canvas (`components/arena-canvas.tsx`) and photo editor still use hardcoded hex values
  for scene colors (updated to the new accent where they referenced the old brand color, but the
  broader scene palette — skin tones, fog, mannequin materials — was left as-is; it's 3D art
  direction, not brand color, and out of scope for this pass).
- `public/favicon.ico` and OG images are still the pre-rebrand defaults; a proper favicon/OG asset
  generated from `BrandRoundel` is a good next step.
- Campaign OG thumbnail generation (the `/api/images/[campaignId]/[variant]` pipeline) 404s in local
  dev/seed data — unrelated to this rebrand, but worth fixing so `CampaignThumb`'s real path renders
  instead of the fallback in practice.
