# Case study: ApexLog, a trading journal that scores discipline

## The problem

Trading journals log outcomes: entry, exit, profit. A trader can win a trade while breaking every rule they set for
themselves, and the journal records it as a good trade. I wanted one that records the rules too. Each setup gets a
weighted checklist, each trade gets a score for how much of it was followed, and the dashboard shows what the
disciplined trades earned against the sloppy ones.

I am the first user. The journal is built around how I trade (custom setup names, prop-firm accounts with their own
fee tariffs), with a data model that does not need a rework if other people use it later.

## Decisions

**Fills are the source of truth.** A trade is a set of entry and exit fills. Average entry, average exit and
quantity on the trade are derived. A single-fill trade is just one entry and one exit, so scale-ins and partial
exits need no special case. All derived numbers (P&L, risk, R-multiple, execution score) are computed on the server
at save time and stored. The client's values are never trusted.

**Generic instruments.** Every instrument is a tick size and a tick value, and P&L is
`points / tick_size * tick_value * quantity`. Futures, forex and crypto all fit the same formula. Adding a contract
is a form, not a code change.

**Fee snapshots.** Each account points at a fee profile (a tariff). When a trade saves, the fee lines are copied
onto the trade. Changing the tariff later does not rewrite old trades.

**Null scores, not zero scores.** A trade with no setup, or a setup with no checklist, has no execution score. It
is stored as `null` and left out of averages. Counting it as 0% would punish the trader for a missing checklist.

**Own login instead of Supabase Auth.** One seeded user, a JWT in an httpOnly cookie. Supabase is used only as a
Postgres host and file store, so the API has no dependency on its auth service. Every table is still rooted to
`user_id`, so real signup later is additive.

**$0 a month.** Vercel, Render and Supabase free tiers. I chose this over a $5 Railway host. The cost is a Render
cold start of 30 to 60 seconds after idle, handled by a "waking up the server" state in the UI and an uptime ping
on `/health`. The upgrade path is changing the deploy target, not the code.

**Design first, then build.** The dashboard, trade log and trade detail screens were designed in Stitch and built
against the exported HTML. The trade form, setup editor and settings had no mockup and were built later from the
design tokens. A design critique run on 2026-09-22 scored the app 22 of 32 and said so directly: the designed
screens read as made for this trader, the undesigned ones read like a generic admin panel.

**Plain JavaScript.** The frontend started in TypeScript. On 2026-09-21 I had it converted to JS/JSX and the TypeScript tooling removed,
and the plan was updated to say plain JavaScript.

## Problems I hit

**Vercel silently refused to deploy.** Pushes went through and nothing deployed. The cause was the commit author's
email, which was not verified on the GitHub account doing the push. Vercel's only sign was "GitHub couldn't verify
an account for the commit". The fix was a repo-local `git config user.email` set to a verified address. The
runbook now says to do this before relying on push-to-deploy.

**The wrong Vercel URL got rejected.** The API checks the request origin. Opening a per-deployment URL
(`project-hash-username.vercel.app`) instead of the production one failed the check. The runbook now names which
URL to use.

**A missing storage bucket showed up as a vague error.** If the `screenshots` bucket does not exist, uploads fail
later with a generic "storage unavailable" message and nothing points at the bucket. Step 2 of the runbook now
includes a `curl` that must return 200 before moving on.

**Supabase's direct connection does not work from most hosts.** It is IPv6-only unless you pay for an add-on, and
the transaction pooler breaks `pg_dump`. The session pooler is the one that works for both the API and the GitHub
Actions backup job.

**The login page clipped on a phone.** The design critique flagged the login card's right border and shadow being
cut off at 390px, confirmed by two captures. A later commit retracts that finding in the critique record ("Retract
the mobile login clipping finding in the critique record"), so the finding did not hold up on a second check.

**The login lockout looked like a typo.** After five failed attempts the API returns 429 with a `Retry-After`
header, but the client ignored it and showed the same red sentence as a wrong password. The login now shows a
countdown and its own message.

**The onboarding tour kept failing on real data states.** The first-time tour broke in two ways: it gave up before
a fresh page's data arrived, and it found nothing to highlight on a genuinely empty dashboard. Both were fixed in
separate commits, and the tour now previews the real dashboard panels instead of a labeled example box.

**Slippage did not earn its place.** The original data model had a slippage field on every trade, subtracted from net
P&L. It was removed on 2026-09-24 (commit "Remove slippage from trades").

## Testing and safety nets

- The backend has 383 test functions, run against a real PostgreSQL in CI (some are parametrized, so the number of
  cases is higher). Trade math, fees, scoring, XP and dashboard aggregates are pure functions tested against fixed
  cases.
- The frontend has 221 test cases (Vitest and Testing Library): the trade form's fill math and checklist toggling,
  plus a render test per screen against mocked API data.
- CI runs on every push. A weekly GitHub Actions job takes a `pg_dump` of the `public` schema, encrypts it with gpg
  and keeps it for 30 days. A restore script checks that a dump can actually be loaded back. Screenshots in
  Storage are not included in the backup.

## What I would do differently

- Design the trade form before building it. It is the screen used most, and it is one of the three the critique
  called generic.
- Add undo for archiving. The critique found that archive actions fire on a single click with no confirmation and
  no way back.

## Where it stands

Live and in daily use. Source: this repository. Sign in with the demo account described in
[demo-account.md](demo-account.md).
