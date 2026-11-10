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
- Radius: 6 px buttons/inputs, 8 px cards.
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

## Supporting colours and stripes (owner's direction, 10 Nov 2026)
Blue is still the colour of every action. These add life in small doses only:

| Token | Hex | Use |
|---|---|---|
| aqua / aqua-tint | #0B7F86 / #DCF0F1 | Icon blocks for counts (vehicles, crew) |
| sun / sun-tint | #F0B429 / #FCF1D2 | The short marker line under the logo, MoMo, the icon block on the main blue tile. Dark text on `sun`. |
| success-tint | #DCEFE3 | Icon block for cash and money kept |
| danger-tint | #F7E1DF | Icon block for expenses |

- **Stripes:** faint diagonal bands (135°, 18 px) run behind every screen and across the blue panels: about 2% blue on the page background and 3% white on blue. Hard edges, never a fade. They should be barely noticeable; cards stay solid white on top. Classes: `stripes-on-page`, `stripes-on-blue`.
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
| Default shadcn/Tailwind look, huge radius | 6–8 px radius, custom tokens |
| Dark mode with glowing accents | Light theme first |
| Warm cream + terracotta | Cool whites + one blue |
| Emoji icons, "01/02/03" on non-steps | One icon set; numbers only for real sequences |
| Decorative animations, scroll effects | Feedback motion only (save, sync) |
