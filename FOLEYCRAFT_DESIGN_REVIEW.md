# FoleyCraft: Design and UX Review

Reviewed `http://127.0.0.1:8000/#landing` at 1440, 768-ish and 390 px, plus `#studio`, and read `frontend/src/components/LandingPage.tsx`, `index.css` and `App.tsx`.
Method: the taste-skill anti-slop rules, impeccable and design-critique heuristics, 21st.dev component research.

**Current score: 5.5 / 10.** The product is a 9. The landing page undersells it and looks like a template.

| Area | Now | Target |
| --- | --- | --- |
| Product idea and substance | 9 | 9 |
| First impression and distinctiveness | 4 | 9 |
| Layout and rhythm | 5 | 9 |
| Typography | 5 | 9 |
| Colour and surfaces | 6 | 9 |
| Mobile | 2 | 9 |
| Interaction and motion | 6 | 9 |
| Accessibility | 4 | 9 |
| Copy | 5 | 9 |

---

## 1. The one-line diagnosis

FoleyCraft is a spatial-audio instrument where you drag sounds around a listener's head. The landing page never shows that. It shows a dark page with a gold gradient headline, sine-wave ribbons that have nothing to do with 3D space, and three little fake "mockup" cards. Any audio tool from the last two years could wear it.

**The fix is not more polish. It is to let the product be the design.** Your `#studio` view (radar, listener at the centre, emitters with bearings) is already distinctive and good-looking. Put a live piece of it on the landing page.

---

## 2. Blocking bugs (fix before any design work)

### P0: The landing page cannot scroll
`index.css` sets `html, body, #root { height: 100%; overflow: hidden }`. The landing root `<div>` in `LandingPage.tsx:143` has only `minHeight: 100vh`, so it grows to 2822 px inside a 900 px `#root` that clips it. Verified in the browser: `scrollTop` stays 0 after setting it to 1000. Anyone visiting sees only the hero and the top of the studio mockup. Features, presets and the CTA are unreachable.

```tsx
// LandingPage.tsx:143 — add a fixed height so overflowY:auto actually engages
style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', ... }}
```

### P0: Two nav links go nowhere
`#acoustics` ("Spatial Engine") and `#library` ("Sound Catalog") have no matching `id` in the page. Either build those sections (recommended, see section 5.5) or delete the links.

### P1: Hero waveform canvas is distorted and blurry
`resize()` sets `canvas.height = 420` but the element is displayed at 240 px high, so the waves are squashed vertically. It also ignores `devicePixelRatio`, so it is soft on Retina, and the effect re-subscribes on every play/pause (`[isPlayingPreview]` dependency) and runs forever, even off-screen and with reduced motion on.

```ts
const dpr = Math.min(devicePixelRatio, 2);
const w = canvas.clientWidth, h = canvas.clientHeight;
canvas.width = w * dpr; canvas.height = h * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
// keep isPlayingPreview in a ref so the rAF loop is created once
// pause the loop with IntersectionObserver and skip it when prefers-reduced-motion
```

### P1: Mobile is broken
At 390 px (screenshot checked):
- The nav shows the brand, a `v2.0` badge and two wrapped links. The other two links and the **Launch Studio** button are pushed off-screen. There is no menu.
- The top pill wraps into a two-line capsule.
- The "Audition" preset bar is wider than the screen and clipped on both sides.
- There is a ~150 px dead gap between the buttons and the waveform.

### P2: Preset cards are not keyboard accessible
`<div onClick>` at `LandingPage.tsx:935`. Use `<button>` or `<a>`. Hover state is done with `onMouseEnter` JS handlers, so keyboard users get none of it. Move hover/focus to CSS.

---

## 3. The "AI slop" tells, and what replaces each

These are the specific patterns that make the page read as generated. Each is in your code today.

| Tell | Where | Replace with |
| --- | --- | --- |
| Gradient text on the H1 (white to gold) | `LandingPage.tsx:322` | One flat ink colour. Let size and tight tracking carry it. |
| Pill badge above the headline ("Next-Gen Spatial Soundscape Studio • Zero MP3 Loops") | `:290` | Delete. Put "no loops, nothing repeats" into the sub-headline. |
| Tiny uppercase letter-spaced eyebrows ("ACOUSTIC ENGINEERING", "INSTANT ATMOSPHERE") | `:778`, `:896` | Delete. The H2 already says it. |
| Glow shadows on every button and the logo | `:181`, `:244`, `:367` | Flat fills. A pressed/hover tone step instead of a glow. |
| Gradient fill buttons (`#D8A65C` to `#BA8943`) | `:237`, `:360`, `:1047` | One flat amber. Pill or square, decided once. |
| Radial ambient glow blob behind the hero | `:275` | Delete. |
| Glass: `backdropFilter: blur` on the pill and audition bar | `:299`, `:434` | Opaque surface step. |
| Icon in a tinted rounded square on feature cards | `:806` to `:880` | No icons. A real visual per feature (see 5.3). |
| Three identical feature cards in a row | `:797` | One composed layout: lead feature large, others varied. |
| macOS traffic-light dots on the fake window | `:502` | Cut the fake window. Show the real thing. |
| "Fake dashboard" cards: dial circles with `65%`, a radar of two dots | `:533` to `:762` | The actual radar and real knobs from `SpatialCanvas`/`RotaryKnob`. |
| Gradient CTA card with a centred icon circle | `:1007` | A full-width colour field with a large line and one button. |
| 1px borders and hairline dividers everywhere | cards, footer, section headers | Tone steps between surfaces; space for separation. |
| Stock copy: "Next-Gen", "genuine", "Built for Atmosphere & Precision", "in Seconds" | various | See section 7. |
| Dark ground + gold accent + Inter | whole page | The palette is fine (earthy, game-world). The *treatment* is the cliché. See section 4. |

---

## 4. Direction: make it feel like it belongs to this product

### Idea sentence
> On this page, **the listener's head at the centre of a radar** becomes **the hero itself**, and the visitor places the sounds.

Competitor test: a generic "audio tool" page cannot use this sentence. This one can, because the product literally is a radar with a listener in the middle.

### The one live thing (replaces the sine waves)
A real, draggable mini-stage in the hero:
- A headphone glyph at the centre, 3 emitters (torch, drips, wind) from `INITIAL_PRESETS[0].sources` positioned by their real `x, y`.
- The visitor drags an emitter; if audio is on, `audioEngine.syncScene` updates pan and distance live. They *hear* the sound move around them, which is the whole pitch.
- Plain fallback: static radar with the three emitters, and the "Listen" button.
- One button on first load: "Put on headphones and listen". Audio must wait for a click (browser autoplay rules), so the button also fixes that.

This replaces `canvasRef`, the sine ribbons, the "Audition" pill bar's role (it becomes a small preset switcher under the radar) and the three fake mockup cards. Roughly 200 lines of decorative code goes, 80 lines of real interaction comes in.

### Type
- **Display:** a face with some character instead of Inter 800 everywhere. Options that suit "analog hardware meets fantasy field recording": *Space Grotesk*, *Bricolage Grotesque*, *Instrument Sans*, or a condensed grotesk such as *Archivo Narrow*. One display face plus Inter for UI is the ceiling.
- **Scale:** two sizes do the work. H1 at about 88 to 120 px desktop (`clamp(3rem, 8vw, 7.5rem)`), body 18 px. Right now the biggest type is 68 px and most copy is 11 to 12.5 px.
- **Headline length:** 2 lines or fewer at every width. Today it wraps to 3 lines at 390 px.
- **JetBrains Mono** is imported in `index.css` but unused on the landing page. Either use it for real numeric readouts (dB, metres, bearing, as the studio does) or stop loading it (saves a request).
- **Minimum size:** nothing below 12 px; running copy 16 px+. You currently have 9, 9.5, 10, 10.5, 11 and 11.5 px text on the landing page.

### Colour
- Keep the moss-black ground and amber. Add **one** more field colour for a contrast section (for example a warm bone `#F2F0E7`, already your `--text-primary`) so the page has a light moment. All-dark, all-the-time is part of why it feels templated.
- Accent (amber) used for the action and the live emitters only. The green and blue accents should mean something (signal level, water emitter), not decorate.
- `--text-muted: #6E756D` on `#101311` is about 3.9:1 (my estimate from the hex values, not a tool reading). It fails WCAG AA for small text. Lift to roughly `#8A9188`.

### Surfaces
Drop shadows and borders. Separate with tone: `--bg-main #101311`, `--bg-panel #191D19`, `--bg-surface #242923`. Those three steps are already well chosen.

---

## 5. Section-by-section redesign

### 5.1 Nav
Wordmark, three links, one button. Remove the `v2.0` badge (nobody on a landing page needs it). Add a real mobile menu or collapse to wordmark + button below 700 px.
- 21st.dev: [Mini Navbar](https://21st.dev/@aghasisahakyan1/components/mini-navbar.md) (minimal, MIT) or [Sticky Blur Header](https://21st.dev/@mohammadshehadeh/components/header-01.md) (brand, centre links, mobile slide-down; swap the blur for a flat opaque bar).

### 5.2 Hero
Left-aligned, not centred. Headline on the left at huge size; the live radar on the right (or full-bleed behind, bleeding to the edges). One primary button ("Open the studio"), one secondary text link ("Hear it first").

Copy direction:
- H1: **Place sound around a listener.** (31 chars, fits two lines everywhere)
- Sub: **Drag torches, rain and wind around your head. Every sound is generated live, so nothing loops.**
- Button: **Open the studio** (use the same name in the nav, hero and footer; today it is "Launch Studio", "Open Studio Workspace" and "Launch FoleyCraft Studio Now")

Optional background texture, only if it stays quiet: a slow dot-grid or halftone shader behind the radar.
- 21st.dev: [dotgridshaderoncrack](https://21st.dev/@hardcoretiff/components/dotgridshaderoncrack.md) (Apache-2.0), [Dotted Veil](https://21st.dev/@serafimcloud/components/dotted-veil.md), [Hero background](https://21st.dev/@athenasolutionscompany/components/hero-background.md) (cursor-reactive swirl; heavy, use sparingly). Respect `prefers-reduced-motion` and pause off-screen.

### 5.3 Features (replace the 3 icon cards)
Say less, show more. Three claims, each with its own *real* visual, in an uneven layout (one wide, two narrow) rather than a row of equals:
1. **Hear it in 3D**: a head-turning diagram: the same emitter heard with the head rotated, with the left/right level meters from your `AudioMonitor`.
2. **Never loops**: a small timeline showing two renders of the same torch with different crackle positions. This is the proof for "no MP3 loops".
3. **Real rooms**: a toggle between cabin, cistern and cathedral that plays the same drip with different decay (you already have `reverbGenerator.ts`).

Keep it to six cells or fewer. Layout reference: [Feature Bento](https://21st.dev/@uilayout.contact/components/feature-bento.md) and [Feature Catalog Grid](https://21st.dev/@mohammadshehadeh/components/feature-09.md) for the cell proportions only; replace their icon tiles with your visuals. 21st.dev's own bento post suggests 6 to 8 cells as the maximum.

For a scroll-driven version of the three claims: [Sticky Scroll Reveal](https://21st.dev/@manuarora700/components/sticky-scroll-reveal.md) or [Scroll 01](https://21st.dev/@felipemenezes098/components/scroll-01.md), where the left column scrolls through claims and the sticky right panel swaps visuals.

### 5.4 Presets (the strongest section to upgrade)
Seven text cards with a small amber category label is weak, and the data to do better is already there: every preset has `sources[].x, y, color`.
- Draw each preset's **constellation** as a small SVG: the listener dot at centre and the emitters at their real coordinates in their real colours. Each card then looks different and says something true.
- Add a play button on the card (hover also previews, behind the same click-to-enable audio gate).
- Cards are `<button>`s. Press state, visible focus ring.
- Heading: "Seven places to stand" (or similar). Drop the hard-coded "Explore All 7 Presets" and compute `INITIAL_PRESETS.length`.
- Layout: one large featured preset (full width, constellation big, playing) and six smaller in a 3×2. Not seven identical tiles.

### 5.5 Missing sections the nav already promises
- **Spatial engine** (`#acoustics`): a short, honest explanation: distance → volume and air damping, azimuth → left/right level and filtering. One diagram plus the one sentence "HRTF" needs to be defined for non-audio people. (Right now "HRTF" appears three times and is never explained.)
- **Sound catalog** (`#library`): a dense, scannable grid or list of the 20-odd emitters (name, category, a tiny waveform). Reuses `SOUND_CATALOG`. This is real content that proves breadth.
- **Export** deserves its own short band: WAV, 44.1 kHz, "drop it into Unity, Unreal, Godot". Show the actual export dialog crop, not a fake file row.

### 5.6 Closing CTA and footer
- CTA: one full-bleed amber (or bone) field, one huge line ("Put on headphones."), one button. No card, no icon circle, no gradient.
- Footer: the wordmark returns at enormous size, cropped by the bottom edge. Real links (Studio, Presets, Catalog, Keyboard shortcuts) instead of four non-clickable tech words.
- 21st.dev: [Giant Wordmark Footer](https://21st.dev/@kedhareswer/components/kiln-wordmark-footer.md), [Footer with Suite](https://21st.dev/@scrollxui/components/footer-with-suite.md), [Bold Footer](https://21st.dev/@uilayout.contact/components/footer-bold.md) (all MIT).

---

## 6. UX flow and information architecture

1. **Land → hear something in under 5 seconds.** The strongest conversion moment this product has is the first time someone hears a torch move from left to right. Today that needs two clicks and a scroll that does not work.
2. **One primary action, one name.** "Launch Studio", "Open Studio Workspace", "Open Live Canvas", "Export in App", "Launch FoleyCraft Studio Now" are five labels for one thing.
3. **Studio → landing path.** The studio has an "Overview" button; keep it, and make the browser Back button work (you already use hash routing; add `history.pushState` for preset loads).
4. **Tell people about headphones.** Binaural audio over laptop speakers sounds wrong. One line, early: "Best with headphones."
5. **Audio gating.** Show a clear "Sound on" state and a visible meter so the user knows it is live. Never autoplay.
6. **No dead ends.** Every nav item scrolls to a real section; every card is a real link or button.

### Studio app notes (quick pass, `#studio`)
- First-run banner overlaps the top of the radar canvas and its text is clipped ("…environment.") at 1440×900. Give it its own row, or make it a dismissible toast.
- Many 9 to 10 px labels in the inspector and monitor. Raise to 11 to 12 px minimum.
- Sound library cards are 3 lines of clipped 11 px text. Allow 2-line descriptions with an ellipsis, or move the description into a tooltip.
- The radar is the best thing in the product. Give it more space (collapse the library by default on first visit).

---

## 7. Copy

| Now | Better | Why |
| --- | --- | --- |
| "Sculpt Living Soundscapes in 3D Space." | "Place sound around a listener." | Concrete verb, no "sculpt/living" filler, fits 2 lines |
| "Next-Gen Spatial Soundscape Studio" | cut | "Next-gen" is a tell |
| "Zero MP3 Loops · 100% Procedural" | "Every sound is generated live. Nothing loops." | Benefit, not a negation list |
| "genuine HRTF binaural physics" | "Real HRTF panning: sounds sit in front, behind, above." | Explain the word once |
| "Built for Atmosphere & Precision" | name the actual claim per section | Template headline |
| "Start Designing Your Soundscape in Seconds" | "Put on headphones." | Shorter, on-product |

The audience line ("indie game devs, RPG game masters, cinematic creators") is good and specific. Keep it, but move it under the hero as a small row of what they make (tavern for a tabletop session, cave level, short film ambience).

Avoid invented proof (user counts, logos, testimonials) until you have real ones.

---

## 8. Motion and interaction

Required rules:
- Transform and opacity only. Every move has a `prefers-reduced-motion` fallback that keeps content and drops travel.
- Section entrance: heading, then text, then visual, each 60 to 90 ms apart, 16 to 24 px rise, once. Content must be visible if JS fails.
- Replace the JS `onMouseEnter` style mutations with CSS `:hover`/`:focus-visible` and `:active { transform: scale(0.98) }`.
- The signature move should be the product's own: emitters drift slowly on the radar when idle (they already have a `drift` parameter), and pulse rings travel outward in time with each trigger.
- Do not add parallax, tilt cards, or cursor trails. They add motion, not meaning.

---

## 9. Code and maintainability

- `LandingPage.tsx` is 1087 lines with about 100 `style={{}}` blocks. Move to a `landing.css` (or CSS modules) using your existing tokens. Smaller, hover/focus work properly, and the page can be themed from `:root`.
- Define tokens you actually use: `--space-*`, `--text-sm/md/lg/xl`, and trim the radius variants (the page mixes 4, 6, 8, 10, 12, 14 px radii and pills; pick square or pill and stay there).
- Split into `Hero`, `Features`, `Presets`, `Closing`, `Footer` components.
- `index.css` hides overflow on `html, body, #root` for the studio. That is what causes the P0 bug. Scope it: apply `overflow:hidden` only to the studio shell, and let the landing page scroll normally.
- Django side: `template/index.html` is a small shell around the built bundle. Add `<meta property="og:*">`, `theme-color`, and a canonical link.
- Fonts: preconnect to `fonts.googleapis.com`/`fonts.gstatic.com`, self-host the faces you keep, set `font-display: swap`.
- After any change to `frontend/src`, rebuild (`npm run build`) so `statics/assets` picks it up. Django serves the built bundle, not the Vite source.

---

## 10. Accessibility checklist

- [ ] Preset cards → real buttons, keyboard operable
- [ ] Visible focus ring on every control (you have one for `button`; also links and the radar)
- [ ] Muted text ≥ 4.5:1 (see colour)
- [ ] Radar emitters reachable by keyboard (arrow keys nudge the selected emitter) and announced (`aria-label="Crackling torch, 3.2 m, 62° left"`)
- [ ] Canvas decorative → `aria-hidden="true"`
- [ ] `prefers-reduced-motion` honoured by canvas loops
- [ ] Touch targets ≥ 44 px on mobile (audition pills are about 28 px)
- [ ] Mobile layout is its own composition, not a squashed desktop

---

## 11. Reference sites (what to take from each)

Look at these for structure and attitude, not to copy their look:

- **[Teenage Engineering](https://teenage.engineering)**: the product as a physical object, flat colour fields, large confident type, little decoration. A hardware-flavoured audio brand does not need glow.
- **[Ableton](https://www.ableton.com)**: shows the real interface large and explains audio concepts in plain language.
- **[Linear](https://linear.app)**: restraint; one product shot doing the work, tight type, no ornament.
- **[Dolby Atmos](https://www.dolby.com/technologies/dolby-atmos/)**: how an invisible thing (3D sound) is made visible with a simple objects-in-space diagram.
- **[Rauno](https://rauno.me)**: small, tactile interaction details; the standard to hold your knobs and radar to.
- **Explorable explanations** (Bret Victor, Nicky Case): let the reader change a value and see or hear the result.

### 21st.dev shortlist
| Need | Component | License (as listed) |
| --- | --- | --- |
| Nav | [Mini Navbar](https://21st.dev/@aghasisahakyan1/components/mini-navbar.md) | MIT |
| Hero background (optional, quiet) | [dotgridshaderoncrack](https://21st.dev/@hardcoretiff/components/dotgridshaderoncrack.md) | Apache-2.0 |
| Hero background alt | [Dotted Veil](https://21st.dev/@serafimcloud/components/dotted-veil.md), [hero1 (Mesh drift)](https://21st.dev/@simone.psychk/components/hero1.md) | check each |
| Feature layout | [Feature Bento](https://21st.dev/@uilayout.contact/components/feature-bento.md) | MIT |
| Scroll storytelling | [Sticky Scroll Reveal](https://21st.dev/@manuarora700/components/sticky-scroll-reveal.md), [Scroll 01](https://21st.dev/@felipemenezes098/components/scroll-01.md) | check each |
| Statement text | [Unlumen Text Reveal](https://21st.dev/@unlumen/components/unlumen-text-reveal.md) | MIT |
| Footer | [Giant Wordmark Footer](https://21st.dev/@kedhareswer/components/kiln-wordmark-footer.md) | MIT |

Use 21st.dev components as **structure and behaviour**, then restyle them to your tokens and strip their glow, gradient and glass. Installed as-is, they are the slop. They install through the shadcn CLI and assume Tailwind; your project uses neither today (React + Vite + inline styles), so either port the markup by hand or add Tailwind deliberately. Several also need `framer-motion`, a new dependency.

---

## 12. Prioritised roadmap

| # | Change | Effort | Impact |
| --- | --- | --- | --- |
| 1 | Fix landing scroll (`height: 100%`) | 5 min | Unblocks everything |
| 2 | Fix mobile nav, pill, audition bar | 1 h | Mobile 2 → 7 |
| 3 | Remove tells: gradient text, pill, eyebrows, glows, gradient buttons, icon tiles, traffic lights | 2 h | Looks far less generated |
| 4 | Fix canvas distortion, DPR, rAF lifecycle | 1 h | Removes blur and jank |
| 5 | Type pass: bigger H1, 12 px floor, display face, contrast fix | 2 h | Biggest visual jump |
| 6 | Live draggable radar in hero (reuse `SpatialCanvas` logic) | 1 to 2 days | The signature move |
| 7 | Preset constellations + play-on-card + button semantics | 0.5 day | Makes the section unique |
| 8 | Build "Spatial engine" and "Sound catalog" sections, or drop the links | 1 day | Honest navigation |
| 9 | Bento features with real visuals (3 claims) | 1 day | Replaces the template block |
| 10 | CSS extraction, component split, tokens | 1 day | Maintainability |
| 11 | Wordmark footer, flat CTA field, one light section | 0.5 day | The memorable close |
| 12 | Motion layer and reduced-motion support | 0.5 day | Polish |
| 13 | A11y pass, studio banner/label fixes, SEO meta | 0.5 day | The 10/10 floor |

Steps 1 to 5 take about a day and should move the page from 5.5 to about 7. Steps 6 to 9 are what separate "clean" from "this could only be FoleyCraft".

---

## 13. The 10/10 test

A stranger looks at the first screen for five seconds and can say: *"You drag sounds around your head, and it plays them in 3D."* They then drag one and hear it move. Nothing else on the page could belong to a different product.

Limits of this review: I checked the desktop and 390 px layouts in the browser and read the code. I did not run Lighthouse, test with a screen reader, or listen to the audio. Scores are my judgement. The 21st.dev links come from a search, so check each component's licence and dependencies before installing. The reference-site notes describe what those sites are generally known for; check them live before borrowing anything.
