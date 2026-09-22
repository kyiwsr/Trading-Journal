# First-Time Tour — Design Spec

Date: 2026-09-22
Status: Approved shape (2026-09-22 chat); spec written for record and review

## 1. Purpose & Scope

A guided spotlight tour that runs automatically the first time a fresh
account reaches the Dashboard, walking through the app's core loop so a
first-time user (including the owner testing a fresh signup later) is not
dropped into a dense, unexplained screen. Directly addresses a finding from
the 2026-09-22 design critique: nothing in the UI explains what a setup or
a checklist score is.

In scope: 5 steps across 4 screens (Dashboard, header, Trade Log, Setups),
backend-persisted completion so it never repeats on any device, and a
manual "Replay tour" link in Settings.

Out of scope: covering every screen (Settings, Trade Form, Trade Detail),
a multi-tenant/first-run product tour library, analytics on tour
completion, per-step skip persistence (skip always marks the whole tour
done, same as finishing it).

## 2. Backend

One additive migration on `users`:

```
0003_user_has_seen_tour.py
  add column has_seen_tour boolean not null default false
```

`app/schemas/settings.py`:
```python
class SettingsOut(BaseModel):
    compliance_cutoff: int
    has_seen_tour: bool
    bands: BandsOut
    low_sample_threshold: int
    elite_setup_min: int

class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    compliance_cutoff: int = Field(ge=0, le=100)
    has_seen_tour: bool | None = None  # None = leave unchanged
```

`update_settings` only writes `has_seen_tour` when the body sends a
non-`None` value, so the existing Preferences-tab save (which only ever
sends `compliance_cutoff`) is unaffected.

## 3. Frontend

**Step registry** (`frontend/src/lib/tourSteps.js`), a plain array, each
entry: `{ id, path, target, title, body }`. `target` is a `data-tour="id"`
value already present (or newly added) on the real element.

```
1. dashboard-balance   /            Net P&L stat        "This is your running balance..."
2. dashboard-discipline /           Discipline panel     "Checklist score turns into a discipline read..."
3. header-log-trade    (any)        + Log Trade button   "Log a trade whenever you close one out."
4. trade-log           /trades      the ledger table     "Every trade you've logged, filterable and exportable."
5. setups              /setups      the setups list      Setup + checklist score explained (real copy, not
                                                           invented: reuses the existing empty-state sentence
                                                           "A setup is a way you trade, named in your own words")
```

**`TourProvider`** (`frontend/src/lib/TourProvider.jsx`), mounted once
inside `AppShell` (so it persists across route changes):
- Reads `/settings`; if `has_seen_tour === false`, arms the tour (does not
  start it until the Dashboard is actually reached, so a fresh account
  landing anywhere else does not get interrupted mid-task).
- Exposes `useTour()`: `{ active, currentStep, start(), next(), skip() }`.
- `next()` past the last step, and `skip()` at any point, both call
  `PUT /settings` with `{ has_seen_tour: true }` and deactivate.

**`Spotlight`** (`frontend/src/components/Spotlight.jsx`):
- Finds `document.querySelector('[data-tour="<target>"]')` for the active
  step; if not found on the current page (wrong route), renders nothing
  and waits for the route to match `path`.
- Renders a dimmed backdrop with a cut-out ring around the target
  (`position: fixed` overlay + a second `position: absolute` box sized to
  the target's `getBoundingClientRect()`, following it on scroll/resize),
  plus a tooltip `Card` (title, body, Skip / Next buttons) positioned
  next to the target, flipping side to stay on screen.
- Built from existing tokens/components only, no new dependency, matching
  the app's flat hard-shadow visual language.

**Wiring:** the 5 target elements get a `data-tour="..."` attribute added
where they don't already have one (`Dashboard.jsx`'s balance Stat and
DisciplinePanel, `AppShell.jsx`'s "+ Log Trade" link, `TradeLog.jsx`'s
table, `Setups.jsx`'s list). "Next" on a step whose next step is on a
different page navigates there (`useNavigate`) and the `Spotlight` picks
up the next step once that page's target mounts.

**Replay:** `PreferencesTab.jsx` gets a "Replay tour" button that calls
`start()` directly (no `PUT /settings` needed to replay; only finishing
or skipping marks it seen again).

**Interrupted tour:** closing the tab, navigating away mid-tour, or
reloading does not persist any in-progress step; since `has_seen_tour`
is only set on finish or skip, the tour simply restarts at step 1 the
next time the account reaches the Dashboard. No partial-progress state
is stored, by design (YAGNI).

## 4. Testing

- Backend: migration up/down; `SettingsOut`/`SettingsIn` round-trip test
  for `has_seen_tour`; `PUT /settings` with only `compliance_cutoff`
  leaves `has_seen_tour` unchanged.
- Frontend: a `TourProvider`/`Spotlight` behavioral test using the
  existing `renderApp` harness — a fresh account (`has_seen_tour: false`)
  reaching `/` sees step 1, `Next` advances through steps including a
  cross-page step (asserts the route changed), `Skip` deactivates and
  calls `PUT /settings` with `has_seen_tour: true`. A returning account
  (`has_seen_tour: true`) sees no spotlight. Replay button in Settings
  restarts it.
