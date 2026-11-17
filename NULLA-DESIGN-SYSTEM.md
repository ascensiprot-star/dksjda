# NULLA — Design System v1.0

Ultra-premium monochrome fashion brand. Black and white only. Editorial, architectural, quiet.
Use this file as the single source of truth when designing or building any NULLA surface (web, mobile, email, print, social).

---

## 0. Principles

1. **Subtraction is the brand.** If an element does not earn its place, delete it. Luxury = restraint + precision.
2. **Contrast is the only color.** Hierarchy comes from scale, weight, inversion (black ↔ white), and space. Never from hue, gradients, or shadows.
3. **Scale as drama.** Pair oversized display type with tiny, widely tracked labels. The jump between the two is the signature.
4. **Structure is visible.** Hairline rules and grids are part of the aesthetic, like architectural drawings.
5. **Motion is slow and certain.** Long ease-outs, masked reveals, inversion wipes. Nothing bounces, nothing wiggles.
6. **Photography leads.** UI is a frame for the garment. Type never fights the image.

---

## 1. Color

Strictly two colors plus transparency. No grays hard-coded; derive them with alpha so contrast stays pure on either theme.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#000000` | Primary background (dark theme), text (light theme) |
| `--paper` | `#FFFFFF` | Primary text (dark theme), background (light theme) |
| `--ink-a64` | `rgba(0,0,0,.64)` | Secondary text on paper |
| `--ink-a40` | `rgba(0,0,0,.40)` | Tertiary text, placeholders on paper |
| `--ink-a14` | `rgba(0,0,0,.14)` | Hairlines on paper |
| `--paper-a72` | `rgba(255,255,255,.72)` | Secondary text on ink |
| `--paper-a45` | `rgba(255,255,255,.45)` | Tertiary text, placeholders on ink |
| `--paper-a18` | `rgba(255,255,255,.18)` | Hairlines on ink |
| `--paper-a06` | `rgba(255,255,255,.06)` | Subtle hover fill on ink |

**Rules**
- Default theme is **dark** (ink canvas). Use **paper sections** as deliberate inverted moments (max 1 per viewport-length of scroll).
- Never use pure-gray flat fills as surfaces. Use alpha overlays, borders, or full inversion.
- No gradients, no glows, no drop shadows. Exception: a single soft white glow behind a hero object (`0 0 160px 20px rgba(255,255,255,.25)`).
- Sale/error/success states use **typography and iconography**, not color (e.g. strikethrough + "−30%" label; error = underlined field + message text).

---

## 2. Typography

| Role | Family | Fallback |
|---|---|---|
| Display | **Instrument Serif** or **Cormorant Garamond** (300/400 + italic) | `'Times New Roman', serif` |
| UI / Body | **Inter Tight** (300/400/500) or **Geist** | `'Helvetica Neue', Arial, sans-serif` |
| Mono (specs, SKU, sizes) | **Geist Mono** / **JetBrains Mono** (400) | `ui-monospace, monospace` |

**Scale (fluid)**

| Token | Size | Line-height | Tracking | Notes |
|---|---|---|---|---|
| `display-xxl` | `clamp(96px, 25vw, 440px)` | .8 | −0.02em | Hero wordmark only. Serif 300 |
| `display-xl` | `clamp(56px, 9vw, 150px)` | .85 | −0.03em | Section titles. Serif 300, italic on one word |
| `display-l` | `clamp(40px, 5.6vw, 92px)` | 1.05 | −0.015em | Manifesto / statements |
| `h3` | `28–34px` | 1.1 | 0 | Product names. Serif 400 |
| `body-l` | `18px` | 1.7 | 0 | Intro paragraphs. Sans 300 |
| `body` | `15–16px` | 1.85 | 0 | Sans 300. Max width 52ch |
| `label` | `10–11px` | 1 | **.26–.32em** | UPPERCASE, sans 400–500. Nav, tags, meta |
| `price` | `12–13px` | 1 | .18em | Sans 400 or mono |

**Rules**
- Every display headline contains **one italic word** for rhythm ("The *Collection*").
- Labels are always uppercase with wide tracking. Never bold.
- Never use weights above 500. Never underline body text; use a 1px bottom border on hover/active.
- Numerals in editorial contexts (plates, counters, indexes) use the display serif at large size.

---

## 3. Layout & Spacing

- **Base unit:** 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256.
- **Page gutter:** `clamp(20px, 4vw, 64px)`.
- **Grid:** 12 columns desktop, 4 columns mobile, 24px gutter (0 gutter + hairline borders for product grids).
- **Max content width:** none for editorial sections (bleed to gutters); 1440px for text-heavy pages.
- **Section rhythm:** vertical padding `clamp(100px, 14vw, 200px)`. Generous, always.
- **Breakpoints:** 560 / 820 / 1000 / 1440.
- **Border radius:** **0** everywhere. Exception: circles (hero eclipse, cursor, avatar dots).
- **Hairlines:** 1px, `--paper-a18` on ink / `--ink-a14` on paper. Used for grids, section dividers, form underlines.

---

## 4. Elevation & Depth

No shadows. Depth comes from:
1. **Inversion** (black card on white section and vice versa)
2. **Blend modes:** `mix-blend-mode: difference` for nav and hero type over imagery
3. **Layering** of oversized type behind/in front of images
4. **Scale parallax** (images move slower than text)

---

## 5. Motion

**Easing tokens**
```
--ease-out-expo: cubic-bezier(.16, 1, .3, 1);
--ease-inout:    cubic-bezier(.76, 0, .24, 1);   /* signature */
```
**Durations:** micro 300ms · standard 600ms · reveal 1100ms · page transition 1100ms.

**Signature patterns**
| Pattern | Spec |
|---|---|
| Masked rise | Text/letters translateY(110%) → 0 inside overflow-hidden wrapper, staggered 80–100ms |
| Fade-up reveal | opacity 0→1, translateY(46px)→0, 1100ms ease-inout, IntersectionObserver at 15% |
| Inversion wipe | Card hover: white panel slides up from bottom (translateY 101%→0, 700ms), text flips to ink |
| Word fill | Statement text at 14% opacity → 100% word by word, scroll-linked |
| Counter | Ease-out quartic over 1.6s when stat enters viewport |
| Loader | White screen, giant counter 000→100, slides up (translateY −100%) |
| Cursor | 14px white dot, `mix-blend-mode: difference`, grows to 84px over links/cards, lerp .2 |
| Marquee | Serif italic, 32s linear infinite, separated by ✦ |
| Underline link | 1px line scaleX 0→1, origin flips from right to left on hover |

**Rules:** no bounce, no spring, no rotation, no shake. Always honor `prefers-reduced-motion` (disable all of the above, show final state).

---

## 5.1 Imagery & Photography

- **Treatment:** pure monochrome. Apply `filter: grayscale(1) contrast(1.08)`. Deep blacks, controlled highlights, subtle film grain (≤4% opacity overlay).
- **Direction:** studio on black or white sweep; single hard light source; garment architecture and fabric texture over faces. Models are anonymous, cropped, or turned away.
- **Aspect ratios:** product 3:4 (primary), editorial 4:5, hero 16:9 / full-bleed, detail crops 1:1.
- **Crops:** tight, asymmetric, bleeding off edge. Never centered stock-style catalog shots as the only view.
- **Video:** muted loop, ≤8s, slow movement (fabric in wind, turn on a plinth), grayscale.
- **No** lifestyle clichés, no smiling-on-beach, no colored props, no text baked into images.

---

## 6. Components

### 6.1 Navigation
- Fixed, transparent, `mix-blend-mode: difference`, white text.
- Left: wordmark `NULLA` serif 26px, tracking .5em. Center: 4 labels. Right: `Bag (n)`.
- Hover: underline wipe. Mobile: wordmark + full-screen ink menu, display-xl links stacked, masked rise.

### 6.2 Buttons
| Variant | Spec |
|---|---|
| **Primary** | Paper fill, ink text, label type, height 56px, padding 0 40px, radius 0. Hover: fill wipes to ink with paper border (500ms ease-inout) |
| **Secondary** | Transparent, 1px paper border, paper text. Hover: inverts |
| **Text** | Label type + 1px underline; arrow `→` shifts 6px on hover |
| **Disabled** | 40% opacity, no hover |
Focus: 2px paper outline, 4px offset (ink outline on paper surfaces).

### 6.3 Product Card
- 1px hairline border grid cell, padding 22px, aspect 3:4.6.
- Top row: index `01` + category (label, 70% opacity).
- Center: product image (or line illustration) at 78% width.
- Bottom: name (serif 28px) + price (label). "Add to bag" underlined label fades in on hover.
- Hover: white panel wipes up, content flips to ink, image scales 1.07 and lifts 6px.
- Sold out: strikethrough price + `SOLD OUT` label; no hover wipe.

### 6.4 Collection Grid
4 cols desktop → 2 at ≤1000px → 1 at ≤560px. Zero gap; borders form the grid. Optional editorial tile (2×2 cells) breaks the rhythm every 8 products.

### 6.5 Form Fields
- Underline only (1px bottom border), no box. Label above in label type. Input 15px sans, tracking .08em.
- Focus: border becomes 100% opacity paper + label shifts to full opacity. Error: 1px dashed underline + message below in label type (`— INVALID EMAIL`).
- Submit lives inline at the right: text button `REQUEST ACCESS →`.

### 6.6 Size Selector
Mono type squares, 48×48 hairline border, selected = paper fill + ink text, unavailable = diagonal hairline strike.

### 6.7 Cart Drawer
Right-side panel, 480px, ink background, hairline left border, slides in 700ms ease-inout. Lines separated by hairlines. Total in display-l serif. Checkout = primary button, full width.

### 6.8 Tags / Chips
Label type, 1px hairline border, 10px × 16px padding. Active = paper fill.

### 6.9 Footer
Four-column link grid, then a **giant outlined wordmark** (`-webkit-text-stroke: 1px`, transparent fill → solid on hover) spanning full width. Legal row in label type with live local time.

### 6.10 Section Header
Left: display-xl title with one italic word. Right: label with 40px leading rule (`Four pieces — Season 01`).

---

## 7. Page Templates

**Home:** Loader → Hero (eclipse + wordmark) → Marquee → Manifesto (word fill) → Collection grid → Inverted Craft section with stat grid → Lookbook horizontal strip → Newsletter → Footer.

**Collection (PLP):** Sticky filter bar (labels only: Category / Size / Sort) → hairline product grid → infinite scroll with counter `24 / 112`.

**Product (PDP):** Split screen. Left: vertical stack of full-height images (scroll). Right: sticky panel (name display-l, price, size selector, add-to-bag primary, accordions for Details / Composition / Care / Shipping). Details use mono type.

**Journal / Editorial:** Single column display-l intro, full-bleed images, pull quotes in serif italic at display-l.

**Checkout:** Minimal, two columns, hairlines, no distractions, no upsells.

---

## 8. Voice & Copy

- **Tone:** sparse, certain, slightly austere. Short declaratives. No exclamation marks. No emojis.
- **Patterns:** "Cut from nothing but intent." · "Made slowly. Worn forever." · "Enter the silence."
- **CTAs:** `Request access` · `Add to bag` · `View piece` · `Book an appointment`. Avoid "Buy now", "Shop now", "Don't miss out".
- **Product names:** two words max, noun-led (The Void Coat, Poplin Shirt).
- **Microcopy:** errors are plain and calm ("Check your email address.").

---

## 9. Accessibility

- Ink/paper contrast is 21:1. Never use text below `--paper-a45` for anything essential (a 45% white on black is 5.7:1, minimum acceptable).
- Minimum interactive target 44×44px.
- Visible focus on every interactive element.
- Custom cursor is enhancement only; disable on touch and respect reduced motion.
- All imagery needs descriptive alt text (garment, cut, fabric).
- Do not rely on hover for essential info; expose "Add to bag" always on touch.

---

## 10. What Makes It Look Cheap or 90s (Avoid)

- Gradients, glassmorphism blur cards, neon/glow accents, rounded pill buttons
- Drop shadows and bordered boxes with radius
- Bold sans-serif headlines, centered everything, emoji icons
- Carousel hero with arrows and dots, auto-playing slideshows
- Stock "diverse smiling models", colored overlays, text over busy images
- Dense menus, popups, countdown timers, "SALE!!" banners
- Mixed font families beyond the three defined
- Symmetrical card grids with equal padding and no scale contrast

---

## 11. Tokens (copy-paste)

```css
:root{
  /* color */
  --ink:#000; --paper:#fff;
  --paper-a72:rgba(255,255,255,.72);
  --paper-a45:rgba(255,255,255,.45);
  --paper-a18:rgba(255,255,255,.18);
  --paper-a06:rgba(255,255,255,.06);
  --ink-a64:rgba(0,0,0,.64);
  --ink-a40:rgba(0,0,0,.40);
  --ink-a14:rgba(0,0,0,.14);

  /* type */
  --font-display:'Instrument Serif','Cormorant Garamond','Times New Roman',serif;
  --font-ui:'Inter Tight','Geist','Helvetica Neue',Arial,sans-serif;
  --font-mono:'Geist Mono','JetBrains Mono',ui-monospace,monospace;

  --fs-xxl:clamp(96px,25vw,440px);
  --fs-xl:clamp(56px,9vw,150px);
  --fs-l:clamp(40px,5.6vw,92px);
  --fs-h3:clamp(26px,2.4vw,34px);
  --fs-body-l:18px; --fs-body:15px; --fs-label:11px;
  --track-label:.28em; --track-display:-.03em;

  /* space */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-6:24px;
  --s-8:32px; --s-12:48px; --s-16:64px; --s-24:96px; --s-32:128px; --s-48:192px;
  --gutter:clamp(20px,4vw,64px);
  --section:clamp(100px,14vw,200px);

  /* shape */
  --radius:0; --hairline:1px solid var(--paper-a18);

  /* motion */
  --ease-out-expo:cubic-bezier(.16,1,.3,1);
  --ease-inout:cubic-bezier(.76,0,.24,1);
  --t-micro:300ms; --t-std:600ms; --t-reveal:1100ms;
}

/* inverted section helper */
.on-paper{
  background:var(--paper); color:var(--ink);
  --hairline:1px solid var(--ink-a14);
}

/* label utility */
.label{
  font:400 var(--fs-label)/1 var(--font-ui);
  letter-spacing:var(--track-label);
  text-transform:uppercase;
}

/* image treatment */
.img-mono{ filter:grayscale(1) contrast(1.08); }
```

---

## 12. Handoff Checklist

- [ ] Only `--ink`, `--paper`, and their alpha tints used
- [ ] Radius 0 everywhere (except circles)
- [ ] One italic word per display headline
- [ ] Labels uppercase, tracked ≥ .26em
- [ ] Hairline grid structure visible
- [ ] At least one inverted (paper) section per page
- [ ] All motion uses the two easing tokens and respects reduced motion
- [ ] Imagery grayscale, 3:4 primary crop, no text baked in
- [ ] Focus states and 44px targets verified
