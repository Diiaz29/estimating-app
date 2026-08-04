# Millwork Estimating App

A shared web app for a millwork shop's estimating and bid tracking. It replaces the
`ESTIMATING_FORM_V9.xlsx` spreadsheet and wraps a full pipeline around it: a bid tracker with due
dates, contractor/CRM records, per-room (area) estimates that don't step on each other, a
parametric pricing engine with live cost/margin, price snapshots on every revision, customer
proposals, production scheduling, and estimated-vs-actual job costing.

Guiding rule: **the estimator's judgment stays in charge; the app does the arithmetic.** Every
rate, markup, threshold, and factor lives in the editable Settings page or a library — nothing is
hardcoded in the pricing engine.

Built to the spec in `Millwork_Estimating_App_Build_Plan.md`. Milestones M0–M6 are complete.

## Stack

| Piece | Tool |
|---|---|
| Frontend | React 19 + Vite + React Router 7 + Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Row-Level Security, Storage, Edge Functions) |
| PDFs | `pdfjs-dist` for plan viewing; proposals print via the browser |
| Hosting | Vercel (SPA, `vercel.json` rewrites all routes to `index.html`) |
| Tests | Vitest (`src/lib/*.test.ts`) |
| Lint | oxlint |

## Local setup

Requires Node 20+ (developed on Node 26).

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Supabase.** Copy the template and fill in your project's values from the Supabase
   dashboard → **Settings → API**:
   ```bash
   cp .env.example .env
   ```
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
   The app boots without these but shows a "not connected" message — it needs a real project to do
   anything. `.env` is gitignored; never commit real keys.

3. **Apply the database schema.** The migrations in `supabase/migrations/` (0001–0017) create every
   table, RLS policy, and trigger. With the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref YOUR-PROJECT-ref
   supabase db push
   ```
   (Or paste each migration into the dashboard SQL editor in order.) Migration `0002_roles.sql`
   seeds the first admin account — edit it to your admin email before applying, or promote a user
   later from the Team page.

4. **Deploy the Edge Functions** (used by the Team page to create/remove users):
   ```bash
   supabase functions deploy create-user
   supabase functions deploy delete-user
   ```

5. **Run the dev server**
   ```bash
   npm run dev          # http://localhost:5173
   ```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`, strict) then production build |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build locally |

## Deploy

Push to the connected GitHub repo; Vercel auto-builds and deploys. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as Vercel environment variables. `vercel.json` handles SPA routing so deep
links and refreshes don't 404.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the code map — the pricing engine, snapshot model, roles, and
where each feature lives.
