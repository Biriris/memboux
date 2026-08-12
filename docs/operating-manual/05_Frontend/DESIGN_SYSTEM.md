# Design System

Memboux uses a light-only, token-driven visual system defined in
`src/styles.css`. Server-rendered pages opt into the current system through
`data-design-system="memboux-v2"` in `src/views/shared.ts`.

## Direction

The visual direction is warm, playful and editorial without sacrificing the
clarity required by event operations. The primary palette combines a neutral
ivory canvas, deep aubergine ink, electric violet actions and restrained aqua,
coral and sun accents.

## Foundations

- Typography: the variable Manrope family is loaded once by `page()` in
  `src/views/shared.ts`. Body text uses weight 400; headings use stronger weight,
  tighter tracking and balanced wrapping.
- Color: use the semantic custom properties `--canvas`, `--surface`, `--ink`,
  `--muted`, `--line`, `--accent` and their documented variants. Do not add a
  raw color when an existing semantic token expresses the same purpose.
- Shape: use `--radius-sm` through `--radius-xl`. Primary actions are pill
  shaped; content surfaces use the medium-to-large radius scale.
- Elevation: use `--shadow-sm` through `--shadow-2xl`. Elevation communicates
  hierarchy, not decoration.
- Layout: the shared maximum content width is `--content-width` (80rem).

## Shared presentation primitives

The following classes are presentation-only and may be composed with Tailwind
utilities:

- `.mbx-container`, `.mbx-section`: responsive page and section layout.
- `.mbx-eyebrow`, `.mbx-display`, `.mbx-title`, `.mbx-lead`: marketing and
  product typography hierarchy.
- `.mbx-card`: standard raised content surface.
- `.mbx-button` with `--primary`, `--secondary` or `--quiet`: shared actions.
- `.mbx-field`: shared text-entry presentation.
- `.mbx-chip`: compact metadata or status label.
- `.mbx-app-header`, `.mbx-header-inner`: authenticated application shell.

These classes must not contain routing, state or business behavior. Existing
server-rendered flows may migrate to them incrementally, but new shared UI must
prefer them over one-off visual declarations.

## Interaction and accessibility

- Interactive controls have a minimum target height of 46px; mobile buttons
  use at least 48px.
- Keyboard focus remains visibly outlined. Never remove focus indication.
- Hover is an enhancement and is only applied on devices that report hover.
- Motion must respect `prefers-reduced-motion`.
- The site explicitly advertises a light color scheme to prevent device dark
  mode from auto-transforming controls into an unreadable mixed palette.

Event templates may define their own artistic palettes, but application and
account surfaces must keep the shared semantic system. Avoid one-off styles.
