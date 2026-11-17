# ZEJESH — Design System v1.0

**Status:** frozen current-state reference. This file documents the design that is on disk now. It is not a proposal and not a redesign brief.

**Brand:** ZEJESH — House of Modern Clothing  
**Direction:** quiet Nordic luxury, monochrome, cinematic, architectural, editorial  
**Storefront canvas:** paper white  
**Admin canvas:** ink black  
**Hard rule:** the homepage is frozen. Do not restyle, restructure, or reframe its imagery without an explicit instruction.

---

## 0. Source of truth

| Concern | File |
| --- | --- |
| Tokens, typography, surfaces, motion, component CSS | `src/index.css` |
| Tailwind theme extension | `@theme` block at the top of `src/index.css` |
| Product/editorial data and image framing | `src/catalog.ts`, `src/editorial.ts`, `src/types.ts` |
| Shared image renderer | `src/components/FashionImage.tsx` |
| Shared cinematic page hero | `src/components/CinematicHero.tsx` |
| Homepage opening frame | `src/components/HeroSection.tsx` |
| Homepage editorial sections | `src/components/HomeSections.tsx` |
| Admin shell and dark inversion | `src/admin/AdminLayout.tsx`, `.admin-scope` in `src/index.css` |
| Current design-system reference | this file |

`NULLA-DESIGN-SYSTEM.md` is legacy material for an earlier identity. This file supersedes it for ZEJESH.

---

## 1. Principles

1. **White is the room. Black is the ink. Photography is the event.** The interface is a frame, not the subject.
2. **Contrast is the only colour.** No hue, gradients, glow, glass, or decorative shadow. Hierarchy comes from scale, inversion, weight, and space.
3. **No visible boxes.** Avoid framed controls, rounded cards, heavy borders, and container chrome on the storefront. Structure is expressed by space and hairlines, not boxes.
4. **Scale as drama.** Oversized display serif against very small, widely tracked labels. The jump between the two is the signature.
5. **Slow, certain motion.** Long ease-outs, masked reveals, image scale, inversion wipes. Nothing bounces or wobbles.
6. **One italic word.** Display headlines use a single italic serif word for cadence.
7. **Every image is deliberate.** Full-bleed crops, clear faces, complete silhouettes where the frame allows, no letterboxing.
8. **Honest emptiness.** Empty data renders as an empty state or “No data yet.” Never invent a metric, product, order, or image.

---

## 2. Colour

All colour is black, white, or an alpha of one of those two.

| Token | Value | Primary use |
| --- | --- | --- |
| `--ink` / `--color-ink` | `#000000` | Text and hairlines on paper; admin surface |
| `--paper` / `--color-paper` | `#ffffff` | Storefront surface; text on ink |
| `--ink-a88` | `rgba(0,0,0,.88)` | Strong secondary ink |
| `--ink-a72` | `rgba(0,0,0,.72)` | Secondary copy |
| `--ink-a64` | `rgba(0,0,0,.64)` | Body copy |
| `--ink-a55` | `rgba(0,0,0,.55)` | Muted body |
| `--ink-a45` | `rgba(0,0,0,.45)` | Meta, tertiary labels |
| `--ink-a40` | `rgba(0,0,0,.40)` | Index numbers, low-emphasis meta |
| `--ink-a20` | `rgba(0,0,0,.20)` | Strong hairline |
| `--ink-a18` | `rgba(0,0,0,.18)` | Standard hairline |
| `--ink-a14` | `rgba(0,0,0,.14)` | Standard hairline |
| `--ink-a10` | `rgba(0,0,0,.10)` | Faint fill |
| `--ink-a06` | `rgba(0,0,0,.06)` | Hover fill |
| `--paper-a88` … `--paper-a06` | white alpha equivalents | Admin and inverted surfaces |

**Rules**

- Storefront default is light. Admin is always dark.
- Invert with `.on-ink` / `.on-paper`; do not invent an intermediate grey surface.
- Error, success, and sale states are communicated by typography, iconography, strikethrough, or an underline — not by red/green.
- `color-scheme` follows the surface: light for storefront, dark for `.admin-scope`.

---

## 3. Typography

### Families

| Role | Family | Stack |
| --- | --- | --- |
| Display / editorial | Bodoni Moda | `"Bodoni Moda", "Didot", "Times New Roman", serif` |
| UI / body | Jost | `"Jost", "Helvetica Neue", Arial, sans-serif` |
| Specs / numbers / labels | IBM Plex Mono | `"IBM Plex Mono", ui-monospace, monospace` |

### Scale

| Token / class | Size | Line-height | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--fs-xxl` / `.display-xxl` | `clamp(80px, 21vw, 380px)` | `0.78` | `-0.035em` | Giant wordmark / editorial punctuation |
| `--fs-xl` / `.display-xl` | `clamp(52px, 8.4vw, 148px)` | `0.86` | `-0.035em` | Page and section statements |
| `--fs-l` / `.display-l` | `clamp(38px, 5.2vw, 88px)` | `1` | `-0.025em` | Manifesto / statement blocks |
| `--fs-h3` / `.heading` | `clamp(24px, 2.2vw, 32px)` | `1.05` | `-0.01em` | Product names and section heads |
| `.text-title` | `clamp(20px, 2vw, 28px)` | `1.08` | `-0.005em` | Card titles, modal titles |
| `--fs-body-l` / `.body-copy-lg` | `17px` | `1.72` | normal | Long intro copy |
| `--fs-body` / `.body-copy` | `14px` | `1.8` | normal | Default body |
| `--fs-label` / `.label` | `10px` | `1.2` | `0.28em`, uppercase | Navigation, meta, actions |
| `.micro-sm` | `8px` | `1.2` | `0.30em`, uppercase | Admin micro-meta, image captions |
| `.edge-label` | `9px` | `1.2` | `0.26em`, uppercase | Edge labels |
| `.price` | `11px` mono | `1` | `0.14em` | Prices and numeric meta |

**Rules**

- Display serif is weight 400; italic is used for one word in a headline.
- UI copy is weight 300–400. Never bold a storefront headline.
- Labels are uppercase and tracked. Do not use tracking on body copy.
- Body copy is capped around `52ch`.
- Numerals in editorial contexts use display serif; operational numerals use mono.

---

## 4. Layout, spacing, and breakpoints

### Spacing

Base unit `4px`:

`4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192`

| Token | Value |
| --- | --- |
| `--gutter` | `clamp(18px, 3.4vw, 52px)` |
| `--section` | `clamp(92px, 11vw, 172px)` |
| `--nav-h` | `78px` |

### Shells

| Class | Max width | Use |
| --- | --- | --- |
| `.page-shell` | `1920px` | Full editorial canvas |
| `.page-narrow` | `1440px` | Text-heavy / utility pages |
| `.section` | — | `padding-block: var(--section)` |
| `.section-sm` | — | `clamp(60px, 7vw, 110px)` |

### Grid

- Main editorial grid: 12 columns desktop, 1 column mobile.
- Asymmetric editorial compositions are intentional; items do not need equal widths.
- Product catalogue: asymmetric 12-column editorial grid, then stacked on narrow screens.
- Breakpoints used across the project: `560 / 640 / 768 / 820 / 1024 / 1180 / 1440`.

### Radius and elevation

- `--radius: 0`.
- No storefront card shadows or floating glass panels.
- Admin also forces `border-radius: 0` and `box-shadow: none`.
- Hairlines: `1px` at `--line` / `--line-strong`.

---

## 5. Surfaces

### Storefront — paper

- Background: `var(--paper)`.
- Text: `var(--ink)`.
- Hairlines: `var(--ink-a14)` / `var(--ink-a20)`.
- Inverted moments use `.on-ink`; keep them deliberate, not constant.

### Admin — ink

- `.admin-scope` forces black surface, white text, square corners, no shadows.
- Admin content uses the same Bodoni / Jost / Plex Mono families, but more compact type.
- Admin controls may use hairlines and explicit buttons; this is operational UI, not the storefront.
- The dark admin surface is preserved and must not be lightened.

---

## 6. Imagery and video

### Treatment

- Monochrome only: `filter: grayscale(1)` with controlled contrast.
- Product imagery: `grayscale(1) contrast(1.04)`; hover deepens contrast and scales slightly.
- Editorial imagery: `grayscale(1) contrast(1.08)` or stronger.
- No duotone, no colour grade, no glow.

### Framing

- **Hero and cinematic bands:** full-bleed `object-cover`; no black bars, no letterboxing, no `object-contain` outside the homepage.
- **Hero focal points:** chosen per page; faces must remain visible.
- **Portrait editorial and commerce frames:** `2:3` where the source is `2:3`. This is the current standard for product cards, product detail galleries, lookbook cards, Story plates, Journal imagery, and Suggest proposal images.
- **Product cards:** `2:3`, full silhouette, no cropped feet.
- **Wide editorial bands:** crop for atmosphere; the subject may be partial, but the face must not be accidentally cut.
- **Labels and captions:** do not place labels over feet, faces, or hands. Prefer top-left negative space or a caption below the image.
- **Hover:** slight scale (`1.03–1.05`) and contrast shift only.

### Video

- Muted, looping, `playsInline`, grayscale, slow movement.
- Poster frame required.
- Autoplay is attempted; browsers may block it, in which case the poster remains. Do not add visible player chrome to the homepage.
- Video never replaces essential content or carries baked-in text.

---

## 7. Motion

| Token | Value |
| --- | --- |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-inout` | `cubic-bezier(0.76, 0, 0.24, 1)` |
| `--t-micro` | `300ms` |
| `--t-std` | `600ms` |
| `--t-reveal` | `1100ms` |

**Patterns**

- Masked rise: content translates from below inside `overflow: hidden`.
- Fade-up reveal on intersection; stagger `90ms`.
- Image zoom on hover: `1100ms` ease-out.
- Button fill wipe: horizontal scale from the right, reversing origin on hover.
- Header hides on the opening frame for cinematic routes and reveals on scroll.
- Hero slides crossfade over `1100ms`.

**Reduced motion**

- Honor `prefers-reduced-motion`.
- Disable transforms, marquee animation, and hero media scale; keep content visible in its final state.

---

## 8. Components

### 8.1 Header / navigation

- Fixed, transparent over the opening frame.
- Wordmark `ZEJESH`; nav labels in tracked uppercase.
- On `home`, `story`, `journal`, `lookbook`, and `vote`, the main navbar is hidden on the opening frame and reveals after scroll.
- On mobile: wordmark plus full-screen ink menu.
- No filled nav background unless the surface requires it.

### 8.2 Hero

- `CinematicHero`: full-bleed image/video, dark gradient veil, top meta, display headline, short description, quiet action, image caption.
- `HeroSection` (homepage): film reel, one slide at a time, tiny progress dots, no headline or caption over the opening film.
- Hero images never letterbox.

### 8.3 Buttons and links

| Variant | Behaviour |
| --- | --- |
| Primary | Ink fill on paper; inverts on hover |
| Secondary | Transparent with hairline; fills on hover |
| Text / underline | Label type with 1px underline; arrow shifts 5px |
| Disabled | 35% opacity, no pointer events |

- Storefront actions are often bare text, not framed buttons.
- Minimum interactive height `44px`.
- Visible focus outline: `1px` current colour, `4px` offset.

### 8.4 Product card

- `2:3` media, full silhouette.
- Caption below: index / category, display-serif name, price.
- Hairline or pure spacing, never a rounded card.
- Hover: image scale/contrast, quick actions rise from the bottom.
- Touch devices expose quick actions without hover.
- Sold-out state uses text/strikethrough, not colour.

### 8.5 Product detail

- Desktop: vertical image stack + sticky information panel.
- Mobile: swipeable gallery + stacked information.
- `2:3` images; image labels and captions must not cover the subject’s feet.
- Accordions for Details / Composition / Care / Shipping.
- Price in mono; name in display serif; size selector as square hairline controls.

### 8.6 Forms

- Underline-first fields; no heavy boxes.
- Label above in tracked uppercase.
- Focus: hairline becomes full-contrast.
- Error: dashed underline plus plain-language message.
- Min target `44px`.

### 8.7 Drawers and modals

- Cart, wishlist, search, quick look, journal article, image zoom, media picker.
- Ink or paper surface depending on context; full-height or centered.
- Hairline separators; no rounded corners.
- Close control always visible; escape and backdrop close where appropriate.
- Lock body scroll while open.

### 8.8 Admin components

- Dark console surface.
- Compact, operational type: mono for IDs/metrics, uppercase micro labels, display serif for view titles.
- Tables, filters, drawers, status chips, audit trails.
- No decorative storefront imagery in operational views unless it is content-specific.
- Admin actions must be explicit and auditable.

---

## 9. Page archetypes

| Page | Composition |
| --- | --- |
| Home | Frozen opening film reel → editorial scenes → collection panels → footer |
| Story (`/story`) | Cinematic hero → premise → full-bleed chapter band → plates → interlude → material standard → archive close |
| Journal (`/journal`) | Cinematic hero → cover story → index → article modal |
| Lookbook (`/lookbook`) | Cinematic hero → premise → full-bleed looks → asymmetric index |
| Suggest (`/suggest`) | Cinematic hero → pattern study → ballot → interlude → proposal modal |
| Archive (`/archive`) | Editorial intro → asymmetric product catalogue |
| Product | Image stack + sticky information panel |
| Static pages | Editorial intro + image/copy blocks |
| Auth/account | Quiet form surface with editorial image |
| Admin | Dark shell, sidebar, topbar, operational views |

---

## 10. Content and voice

- Calm, certain, spare. No exclamation marks, emojis, or urgency tactics.
- Sentence case body copy; uppercase labels only.
- CTA examples: `Explore the archive`, `View piece`, `Add to bag`, `Enter the archive`, `Suggest a piece`.
- Product names are short and noun-led.
- Empty states are honest: “No archival garments live yet”, “No data yet”, “Could not load data”.
- Never fabricate a number, order, customer, product, or image.

---

## 11. Accessibility

- Preserve 21:1 ink/paper contrast.
- Do not use text below 45% alpha for essential information.
- Minimum target `44×44px`.
- All images have descriptive alt text.
- Focus is never removed; it is restyled.
- Motion respects `prefers-reduced-motion`.
- Color is never the sole carrier of meaning.
- Modals trap focus and restore it on close.
- The mobile experience is the primary experience, not a compressed desktop.

---

## 12. Do / do not

### Do

- Use white space as structure.
- Let one image or one sentence carry a section.
- Use display serif for emotion and mono for operational fact.
- Use full-bleed imagery with deliberate focal points.
- Keep admin dark, dense, and legible.
- Document any deviation from this file.

### Do not

- Add gradients, glass, rounded cards, or decorative shadows.
- Put text over faces, feet, or hands without a compositional reason.
- Letterbox imagery or use `object-contain` on non-homepage editorial surfaces.
- Introduce colour for status.
- Add a new font family.
- Change the homepage.
- Invent content to fill an empty dashboard.

---

## 13. Governance

1. **Homepage freeze:** no changes to `HeroSection`, `HomeSections`, or homepage imagery without explicit approval.
2. **New surfaces:** reuse tokens, type classes, and existing image framing rules. Do not create a parallel visual language.
3. **New imagery:** verify desktop, tablet, Z Fold width, and phone. Check for cropped heads, cropped feet, labels over subjects, broken images, and horizontal overflow.
4. **New admin views:** keep the dark console; use real data or an honest empty state.
5. **Design-system changes:** update this file and `src/index.css` together.
