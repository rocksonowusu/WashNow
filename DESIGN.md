# WashNow — design rules

Cool off-whites everywhere, one deep "rinse blue" accent for actions, plain and sturdy — a working tool, not an AI template.

## Colour tokens
| Token | Hex | Use |
|---|---|---|
| bg | #F4F6F7 | Page background |
| surface | #FFFFFF | Cards, inputs, sheets |
| surface-alt | #EBEEF0 | Table stripes, inactive tabs |
| border | #DCE1E4 | Dividers, input borders |
| text | #15202B | Main text |
| text-muted | #5B6770 | Labels, helper text |
| accent | #155EA6 | Primary buttons, active states, links, logo |
| accent-pressed | #0F4C87 | Pressed/hover |
| accent-tint | #E3EEF8 | Selected category, highlight rows |
| success | #2E7D4F | Synced, closed day |
| danger | #B93A32 | Void, out-of-range price, errors |
| warning | #B7791F | Pending sync, override needed |

Put these in `tailwind.config` as named colours; never use Tailwind's default palette classes.

## Type and shape
- Headings: Archivo 600–700. Body/UI: Source Sans 3 400/600 (Google Fonts). Money uses tabular figures.
- Radius: 12 px inputs and choice tiles, 20 px cards and panels, fully round (pill) buttons, status chips, icon blocks and navigation items. (Was 6/8 px until the owner's direction of 20 Nov 2026 below.)
- Flat surfaces, 1 px borders; at most one soft shadow on modals/bottom sheets.
- Icons: Lucide only, one stroke width. No emoji.
- Touch targets ≥ 48 px. New Sale is the biggest control on the cashier home screen.
- Light theme only for now (sunlight readability).

## Solid colour, not paper (owner's direction, 10 Nov 2026)
The first screens were white cards with thin grey lines and read like a paper form. Every screen should carry solid blocks of colour:
- **Frame:** the side navigation (laptop) and the header (phone) are solid `accent` with the white logo (`washnow-logo-white.svg`). The current page is a white block on the blue; on phones the current tab's icon sits on a solid `accent` block.
- **Chosen things are filled:** a selected vehicle, crew member or payment method is solid `accent` with white text, never just a tinted outline.
- **Cards have a heading bar** in `surface-alt`, and table heading rows use `surface-alt` too.
- **Headline numbers** go in tiles with an icon block in `accent-tint`; the single most important figure on a screen is a tile filled solid `accent`.
- **Status is a filled chip:** `success`, `danger` and `warning` backgrounds. Use white text on `success` and `danger`, and `text` (dark) on `warning`, because white on the amber is too faint.
- Still no gradients, glow, glass or drop shadows. The weight comes from flat solid colour.

## Rounder and slicker (owner's direction, 20 Nov 2026)
The owner shared a reference dashboard and asked for its slick, rounded feel across the whole app, keeping our colours and the corner stripes:
- **Shapes:** cards and panels `rounded-panel` (20 px); buttons, status chips, the sync badge, the toast and navigation items `rounded-pill`; fields and choice tiles `rounded-control` (12 px). Dialogs use 20 px corners; the side drawer has square corners.
- **Buttons** look 40 px tall but answer taps over 48 px (`hitArea` in `components/styles.ts`), so the touch-target rule still holds.
- **Forms open as a side drawer** from the right, full height and square-cornered against the right edge, with a light backdrop so the screen behind stays readable (full screen on phones). Confirmations stay a small dialog in the middle.
- **Entry motion (owner asked for it):** the drawer glides in (480 ms, soft ease-out), the backdrop fades, then the form's parts rise in one after another and the footer last. Dialogs scale up slightly. All of it is off when the device asks for reduced motion. This is the only decorative motion allowed.
- **New sale drawer:** a bar under the amount shows where the price sits in the vehicle's lowest–highest range (red outside it); for the owner, the footer splits the sale live into the full amount, crew pay and what the business keeps, worked out exactly as the server does (`lib/commission.ts`).
- **Card titles sit on the white card** (no grey heading bar). The solid colour now comes from what is inside: blue totals tiles (inset with rounded corners and corner art), filled choices, table heading rows in `surface-alt`, filled status chips.
- **Dashboard:** Day / Week / Month / Year pills (owner only) and a date chip with ‹ › to step back; headline tiles show a trend chip against the same stretch of the period before; the sales chart uses fully rounded bars on pale tracks, and the bar still filling up (this hour, today, this month) is striped; a week strip where today is a tall blue pill and tapping a day shows that day; Cash and MoMo as a ring.
- Everything in "Banned" still applies: no gradients, glass, glow, purple, or black-and-grey look. Blue stays the colour of every action.

## Supporting colours and stripes (owner's direction, 10 Nov 2026)
Blue is still the colour of every action. These add life in small doses only:

| Token | Hex | Use |
|---|---|---|
| aqua / aqua-tint | #0B7F86 / #DCF0F1 | Icon blocks for counts (vehicles, crew) |
| sun / sun-tint | #F0B429 / #FCF1D2 | Only the short marker line under the logo on the sign-in and PIN screens. Never on the dashboard or inside the app (owner disliked it there). |
| success-tint | #DCEFE3 | Icon block for cash and money kept |
| danger-tint | #F7E1DF | Icon block for expenses |

- **Corner art:** no pattern runs across a whole page. Faint thin lines sit only in corners and fade out before the middle: rings spreading from a corner like ripples, mixed with straight diagonal lines. They go in the corners of the page, the blue side bar and the sign-in panel, and in a few chosen blue blocks (the main dashboard tile, the totals band on Today). About 5% blue on the page and 10 to 15% white on blue; if you notice them straight away they are too strong. Use `components/CornerArt.tsx` (`art-rings`, `art-lines`).
- **Sign-in and PIN screens:** the logo is large and centred in the blue panel, with a short `sun` line under it.
- Never use a supporting colour for a button, link or selected state, and still no purple or indigo.

## Words
- The people who wash vehicles are the **crew** ("crew member", "Washed by"). The database table is still `washers`; that name never appears on screen.

## Logo
Files in `web/public/brand/`: `washnow-icon.svg` (app icon mark), `washnow-logo.svg` (mark + wordmark).
PWA theme colour #155EA6, background #F4F6F7. Generate 192, 512 and maskable 512 PNG icons from `washnow-icon.svg`.

## Banned (AI-slop patterns)
| Don't | Do instead |
|---|---|
| Purple/indigo, purple-to-blue gradients | The tokens above only |
| Gradient text on headings or totals | Solid text colour; size/weight for emphasis |
| Inter, Roboto, Geist, system-default fonts | Archivo + Source Sans 3 |
| Glassmorphism, backdrop blur, neon glow | Flat surfaces, 1 px borders |
| Centred hero + three icon cards | Screens built around the task |
| Default shadcn/Tailwind look | The radius scale above (12 / 20 px, pills), custom tokens |
| Dark mode with glowing accents | Light theme first |
| Warm cream + terracotta | Cool whites + one blue |
| Emoji icons, "01/02/03" on non-steps | One icon set; numbers only for real sequences |
| Decorative animations, scroll effects | Feedback motion, plus the drawer entry above |
