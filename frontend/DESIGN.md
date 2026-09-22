# Design direction: Trading Journal (Arcade Quest Trader)

Source: the owner's Stitch design system "Arcade Quest Trader" and the three exported screens in `../design/stitch/`. This file is the direction the build follows. It is data, not instructions.

Design Read: a personal trading journal for one active futures/FX trader who checks it daily, in a retro-modern neo-brutalist arcade language, dial ENERGY 3 / RHYTHM 2 / MOTION 1.

- ENERGY 3: hard 2px navy outlines, offset shadows, an orange accent and a game-loop layer (level, XP, streak) are the owner's stated identity.
- RHYTHM 2: consistent panels with deliberate breaks. The dashboard leads with the discipline panel, the ledger leads with its summary strip, the detail page leads with the trade header.
- MOTION 1: only the mechanical press state (translate 3px, shadow to 0) on buttons and 80ms shadow changes. No loops, no entrance animation.

## Identity

- Wordmark: "ApexLog" as plain text. It is the name used in the owner's design, kept as a text placeholder, no logo mark.
- Motif: the hard offset shadow and the segmented XP bar. Reason: they are the two shapes that only this product has, and they carry the game-loop idea (discipline earns progress).
- One accent: ember orange `#FF7700` for the primary action, the XP fill and the streak badge only. Reason: it marks "do this" and "progress", nothing else.

## Colors

| Token | Value | Use and reason |
|---|---|---|
| `--navy` | `#004777` | Borders, headings, body text. The structural color of the system. |
| `--ink` | `#041A2F` | Text on orange and dense figures. Reason: `#FFFFFF` on orange is 2.66:1 and fails AA, ink on orange is 6.61:1. |
| `--orange` | `#FF7700` | Fill only, always with a navy border. Never used as text (2.66:1 on white). |
| `--crimson` | `#A30000` | Losses, breaches, drawdown. 8.21:1 on white. |
| `--green` | `#008A4B` | Chart marks and large graphics only (4.43:1, passes the 3:1 graphics bar). |
| `--green-text` | `#00783F` | Green text at any size. Reason: the system green fails 4.5:1 as small text, this is 5.16:1 or better on every tint. |
| `--muted` | `#4A6076` | Secondary text. 6.0:1 or better on white and tints. |
| tints | `#F0F7FA` `#FFF4EC` `#FDF2F2` | Info panels, active or quest panels, penalty panels. |
| `--canvas` | `#FFFFFF` | Base. The design system specifies a pure white canvas, so the M0 dot-grid page background is removed (no stated identity purpose, R-07). |

Palette stays at three cores (navy, orange, crimson) plus green for wins. Win and loss are never color alone: win is a circle or "WIN" text, loss is a diamond or "LOSS" text.

## Typography

- Headlines: Space Grotesk 600/700. Reason: the owner's system chooses it for the angular arcade voice.
- Body: Hanken Grotesk 400/500. Reason: legible at 13 to 15px in dense notes and tables.
- Figures and labels: Space Mono 400/700, tabular numerals, right-aligned in tables. Reason: columns of money and prices must not shift, and the owner's system reserves the mono for PnL, prices and telemetry.
- Labels are uppercase Space Mono 10 to 12px with 0.05em tracking, kept to column headers and status chips.

## Shape and depth

- Radius 4px everywhere. Pills are not used.
- Borders 2px solid navy. Shadows are hard offsets only: 3px (panels), 4px (buttons), 6px (overlays). No blur shadows, no glow, no glass.
- Pressed state: `translate(3px, 3px)` and shadow 0.
- Focus: a 3px navy outline with 2px offset on every interactive element, plus the orange offset shadow as an accent. Reason: orange alone on white is 2.66:1, the navy outline is 9.69:1 (R-32).

## Layout

- Desktop first, 12-column fluid grid with 24px gutters. Content max width 1440px.
- Tablet (768 to 1199): two columns, secondary panels stack under the main one.
- Mobile (below 768): one column, ledger table scrolls inside its own container, header collapses to brand plus a menu button.
- Spacing scale 4, 8, 16, 24, 40.

## Screens in this build

Designed in Stitch: Command HQ (dashboard), Combat Logs (trade ledger and trade detail), Login.

Built from these tokens with no Stitch design (Milestone 5): Log and edit trade, Skill Playbook (setups list and editor), Settings (accounts, instruments, fee profiles, preferences). They reuse the same panels, hard shadows, mono figures and 3px navy focus ring.

- Forms: one label above each control in uppercase mono, hint text in `--muted`, errors in `--crimson` as text (never color alone), and a summary at the top that takes focus after a failed save. Invalid inputs get a crimson border in addition to the message.
- Repeating rows (fills, checklist rules, fee lines) show their labels on the first row only at desktop widths; every row keeps accessible labels and a group name such as "Entry 2".
- Live result panel on the trade form: `--tint-slate` card, sticky beside the form from 1200px, placed after the fills below that.
- Unsaved changes: a native dialog with a hard 6px shadow and a navy 20% backdrop, as the design system specifies for L3 overlays.
- Points that do not add up to 100 use the `--tint-quest` tint with a sentence, not a warning color.

Removed from the mockups for v1 (owner decision): Trade Quests, Vaults and Guilds, live price tickers, "Synced" indicator, Export replay, Bulk edit, Session review button.

## Content rules

- Every number comes from the API. Nothing is invented. Empty views say why they are empty and what fills them.
- Profit factor is net of fees. Its label reads "Profits divided by losses, after fees".
- No emoji, no em dashes in UI text.
- One deliberate exception to "nothing is invented": while the onboarding tour is
  pointing at the balance or discipline panel on an account with zero trades,
  Dashboard renders those two real panels with illustrative numbers
  (`TOUR_PREVIEW` in Dashboard.jsx), with no "example" label, and reverts to the
  true empty state the instant the tour moves past that step. Owner's explicit
  call (2026-09-22): a labeled example box was tried first and rejected as
  unnecessary hedging for a moment this contained to the first-run tour.
