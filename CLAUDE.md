# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for setup/deploy and
`Millwork_Estimating_App_Build_Plan.md` for the original product spec.

## What this is

A millwork shop's estimating + bid-tracking app: React 19 + Vite + Tailwind on the front, Supabase
(Postgres + Auth + RLS + Storage + Edge Functions) on the back. It replaces a pricing spreadsheet
(ESTIMATING_FORM_V9). Milestones M0–M6 are all shipped.

**Core principle: nothing about pricing is hardcoded.** Every rate, markup, threshold, and factor
lives in the `settings` table (edited on the Settings page) or a library. The pricing engine reads
them by key. When adding a pricing behavior, add a setting — don't inline a constant.

## Commands

- `npm run dev` — dev server (needs `.env` with Supabase URL + anon key).
- `npm test` — Vitest suite (`src/lib/*.test.ts`). Pure-logic modules only; no DB, no DOM.
- `npm run build` — `tsc -b` (**strict mode on**) then Vite build. Keep both green.
- `npm run lint` — oxlint.

## Where things live

- `src/App.tsx` — all routes. Auth gate + role gating via `src/lib/auth.tsx`.
- `src/lib/pricing.ts` — **the heart of the app.** Pure functions: `buildContext`, `priceLine`,
  `priceBid`, `resolveMaterialId`. Implements build-plan §5 (materials × BOM ratios × markups,
  labor at shop rate, 8 job-level adders, cost/margin side, staleness/blank-cost warnings).
- `src/lib/types.ts` — all domain types (mirror the DB schema).
- `src/lib/schedule.ts` — business-day date math for the production schedule.
- `src/lib/format.ts` — money/cost/phone formatting, setting display transforms, `nextJobNumber`.
- `src/lib/branding.ts` — company logo URL (from the `branding` storage bucket).
- `src/pages/*` — one file per screen; `src/pages/libraries/*` for the library screens.
- `src/components/*` — shared UI (Layout, LibraryBits with staleness badges, ConfirmDialog, etc.).
- `supabase/migrations/*` — ordered SQL (0001–0017). Each adds tables + RLS. Add new migrations,
  never edit applied ones.
- `supabase/functions/{create-user,delete-user}` — admin-only Edge Functions (service-role) behind
  the Team page.

## Key domain concepts (get these right)

- **Pricing units.** Assemblies price per **EA** (cabinets — labor/BOM per box) or per **LF**
  (tops, trim, panels). Takeoff can be entered in feet and converted via `typical_width_in`.
- **Finish slots.** BOM rows reference either a concrete `material_id` or a **slot**
  (`CABINET_LAM`, `PLAM 1–4`, `SS 1–4`). Each bid assigns a finish to each used slot
  (`bid_finishes`); pricing resolves the slot → finish cost. Unassigned used slots raise warnings.
- **Material override precedence** (`resolveMaterialId`): **per-room (`area_material_overrides`)
  beats job-wide (`bid_material_overrides`) beats the standard material.** Preserve this order in
  any code that resolves materials (pricing, order sheet, proposal, snapshots).
- **Areas are first-class.** A bid has areas (rooms), each with line items, a `multiplier`
  ("typ of ×N"), and an `is_alternate` flag. **Alternates are excluded from the base bid** and
  totaled separately — check `is_alternate` whenever you aggregate.
- **Adders** are 8 per-bid toggles (`bid.adders`): install, delivery, design, punch, per_diem,
  lodging, general_conditions, insurance. Distance/LF thresholds gate several of them.
- **Snapshots are immutable.** `revisions.snapshot` is a frozen JSON of resolved prices + rates +
  settings, written by "Snapshot Rn" in `Estimate.tsx`. `RevisionView` and `Proposal` render the
  snapshot **verbatim and never recompute.** A sent number must never silently drift when library
  prices change. Don't add code that recalculates a locked revision.
- **Two-sided math.** Every bid computes a price side (customer) and a cost side (materials at cost,
  labor at cost rate, subs at quote, direct expenses) so margin % shows live. Note in `priceBid`:
  overhead is computed for display but **not** subtracted from profit (salaried labor already
  carries it — matches V9's BUDGET).
- **Validation.** Any line touching a blank-cost or stale (> `price_staleness_days`) material/finish
  raises a `Warning`. Surface these; don't let silent zeros through.

## Roles & security

Roles: `admin`, `estimator`, `pm`, `viewer` (`src/lib/auth.tsx` exposes `isAdmin`, `canEdit`,
`canSchedule`). RLS enforces the same tiers server-side — UI gating is not the security boundary.
Admins have a "view as" role preview (UI only). Cost/margin figures are admin-visible.

## Conventions

- TypeScript strict is on; keep it clean (no new `any`, handle nulls). `tsc -b` must pass.
- Pricing/schedule/format logic goes in `src/lib` as pure functions **with tests** — that's the
  tested core. Components stay thin.
- Money is handled in dollars (numbers); format only at display via `fmtMoney`/`fmtCost`.
- Cross-check any pricing-touching change against `src/lib/pricing.test.ts` and a known job's
  totals before/after.
