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
