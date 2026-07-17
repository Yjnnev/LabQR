# LabQR

A QR-code-based lab equipment inventory and monitoring system. Students scan a QR code (or browse the web app directly) to check equipment in and out; admins manage the equipment catalog and process returns.

---

## Table of contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Features](#features)
- [Database schema](#database-schema)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Deployment](#deployment)
- [User guide — students](#user-guide--students)
- [User guide — admins](#user-guide--admins)
- [Routes](#routes)
- [Known limitations / roadmap](#known-limitations--roadmap)
- [Troubleshooting](#troubleshooting)

---

## Overview

Each physical item in the lab (microscope, glassware, tools, etc.) gets a QR code linking to `/item/:id`. Scanning it — or just browsing the catalog — lets a signed-in student check the item out. Only admins can mark an item returned, which keeps the audit trail reliable. Every checkout/return is logged, and admins get emailed the moment something's checked out (returns email the student back).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) + React Router |
| Styling | Plain CSS (`index.css`), no framework |
| Backend / DB | Supabase (Postgres) |
| Auth | Google OAuth via Supabase Auth |
| Notifications | Supabase Edge Function + Resend (email) |
| Hosting | Vercel (frontend), Supabase (backend, fully managed) |

## Features

- Google sign-in (also serves as sign-up — no separate registration flow needed)
- Guest browsing: anyone can view the equipment catalog and item details without logging in; login is only required to actually check something out
- Search + category filter on the browse page
- QR code generation + PNG download per equipment item (admin dashboard)
- Self-service checkout by students; **returns are admin-only**, preventing anyone from falsely clearing a checkout
- Real-time email alerts: admins are notified on checkout, the student is notified when an admin processes their return
- Full equipment CRUD for admins, presented as a card grid showing live status and current borrower (email + checkout timestamp)
- Row Level Security throughout — students can't edit equipment or tamper with logs; only exactly the actions the UI exposes are possible at the database level

## Database schema

**profiles** — mirrors `auth.users`, extended with a `role` (`student` / `admin`). Auto-created on first login via a trigger.

**equipment** — one row per physical item: `name`, `category`, `serial_number`, `status` (`available` / `in_use` / `maintenance` / `decommissioned`), `location`, `notes`, `checked_out_by` (FK → profiles), `checked_out_at`.

**usage_logs** — append-only audit trail: `equipment_id`, `user_id` (who the log concerns), `performed_by` (who actually took the action — matters for admin-processed returns), `action` (`viewed` / `checked_out` / `returned`), `created_at`.

**checkout_equipment(item_id, requested_action)** — a Postgres function (not raw table writes) that enforces the checkout/return rules: checkout requires the item to be `available`; return requires the caller to be an admin. This is what the frontend calls via `supabase.rpc(...)` instead of updating `equipment` directly.

## Local setup

```bash
# prerequisites
sudo pacman -Syu nodejs npm git    # or your distro's equivalent

# scaffold (already done if you're reading this from an existing clone)
npm create vite@latest LabQR -- --template react
cd LabQR
npm install
npm install @supabase/supabase-js react-router-dom qrcode

# run locally
npm run dev
```

## Environment variables

Create `.env.local` in the project root (never commit this):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Get both from Supabase → Project Settings → API. Note: the URL is the bare domain — no `/rest/v1/` suffix.

## Database migrations

Run these **in order** in Supabase's SQL Editor. Each file only needs to be run once, ever, per project.

| File | What it does |
|---|---|
| `schema.sql` | Base schema: `profiles`, `equipment`, `usage_logs`, RLS policies |
| `002_checkout_function.sql` | Adds `checkout_equipment()` so students can self-checkout without broad update permissions |
| `003_checked_out_by.sql` | Tracks *who* currently has an item, enforces only that person (or an admin) can return it |
| `004_admin_only_return.sql` | Restricts returns to admins only; adds `performed_by` to distinguish "whose item" from "who processed it" |
| `005_checked_out_at.sql` | Adds a timestamp for when an item was checked out (shown on admin cards) |
| `006_guest_browsing.sql` | Opens up equipment browsing to guests (not just logged-in users) |

If you're setting this up fresh, run all six in order. If you're catching up an existing project, run whichever ones you haven't yet, in order.

## Deployment

**Frontend (Vercel):**
1. Push the repo to GitHub.
2. Import it in Vercel — framework auto-detects as Vite.
3. Add the same two env vars from `.env.local` under Project Settings → Environment Variables.
4. A `vercel.json` with a SPA rewrite rule must be in the project root:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
   Without this, refreshing any route other than `/` (e.g. `/admin`, `/item/:id`) 404s.
5. Every push to your main branch auto-deploys.

**After deploying, update these to match your live domain:**
- Supabase → Authentication → URL Configuration → **Site URL** and **Redirect URLs** (must include `https://`, not just the bare domain)
- Google Cloud Console → your OAuth Client → **Authorized JavaScript origins**

**Backend (Supabase):** already hosted — nothing to deploy beyond running migrations and (optionally) the edge function below.

**Email alerts (optional, currently on hold per your call):**
```bash
npm install supabase --save-dev   # local CLI, avoids sudo/global-install issues
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase secrets set RESEND_API_KEY=your_resend_key
npx supabase functions deploy notify-admin
```
Then wire a Database Webhook (Supabase → Database → Webhooks) on `usage_logs` INSERT events, targeting the `notify-admin` function. See `supabase-functions/notify-admin/index.ts` — it currently uses Resend's shared test sender, which only reliably delivers to your own verified address until you verify a sending domain (or switch to Gmail SMTP — see conversation notes for that alternative if you revisit this).

## User guide — students

1. Go to the site (or scan an item's QR code).
2. Browse or search for equipment — no login needed to look around.
3. Tap an item to see its details.
4. To check it out: sign in with your Google account if prompted, then tap **Check out**.
5. When you're done, bring it back physically — an **admin** marks it returned in the system; you'll get an email once that happens.

## User guide — admins

1. Sign in, then go to **Admin Dashboard** (link appears in the header once your account has admin role).
2. **Add equipment:** fill out the form (name, category, serial number, status, location, notes) and submit.
3. **Edit/delete:** use the buttons on each card.
4. **Download a QR code:** each card has a QR image + Download button — print it and attach it to the physical item.
5. **Process a return:** when a card shows "Checked out by" info, click **Mark Returned** once the item's physically back.
6. **Promote another admin:** currently done manually in Supabase's Table Editor — find their row in `profiles` and set `role` to `admin`.

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Browse/search equipment (default landing page) |
| `/browse` | Public | Same as `/` |
| `/item/:id` | Public to view; login required to check out | Item details + checkout action |
| `/admin` | Admins only | Full equipment CRUD + return processing |

## Known limitations / roadmap

- No domain restriction — any Google account can log in, not just a school's
- No overdue tracking (e.g. "checked out 5 days ago, flag it")
- Categories are free-text, not a managed list — fine at small scale
- Email alerts are on hold pending a sending-domain decision (see Deployment section)
- No automated tests yet

## Troubleshooting

- **404 on refresh / on a QR scan:** `vercel.json`'s SPA rewrite is missing or not deployed — see Deployment section.
- **"Could not find a relationship between 'equipment' and 'profiles'":** the foreign key or PostgREST's schema cache is stale — run `NOTIFY pgrst, 'reload schema';` in the SQL Editor.
- **"requested path is invalid" during login:** Supabase's Site URL or Redirect URLs don't match your actual domain exactly (missing `https://`, wrong subdomain, or missing the `/**` wildcard).
- **Login redirects to `localhost` in production:** Supabase's Site URL is still set to the local dev URL — update it to your live domain.
- **Some admins don't get email alerts:** you're on Resend's shared test sender, which only delivers reliably to your own verified address — verify a real sending domain to fix.
