# LabQR

A QR-code-based lab equipment inventory and monitoring system. Students scan a QR code (or browse the web app directly) to check equipment out by quantity; admins manage the equipment catalog, track who has what, and process returns.

[![Status](https://img.shields.io/badge/status-live-brightgreen)](https://labqr-six.vercel.app)

**Live site:** https://labqr-six.vercel.app

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
- [Email alerts](#email-alerts)
- [Security notes](#security-notes)
- [User guide — students](#user-guide--students)
- [User guide — admins](#user-guide--admins)
- [Routes](#routes)
- [Resetting borrower history (e.g. before a new term)](#resetting-borrower-history-eg-before-a-new-term)
- [Known limitations / roadmap](#known-limitations--roadmap)
- [Troubleshooting](#troubleshooting)

---

## Overview

Each physical item in the lab (microscope, glassware, tools, etc.) gets a QR code linking to `/item/:id`. Scanning it — or just browsing the catalog — lets a signed-in student check out some quantity of it (e.g. 1 of 3 microscopes). Only admins can mark a checkout returned, which keeps the audit trail reliable. Every checkout/return is logged, students can see their own borrow history, and admins get an email the moment something's checked out.

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
- **Quantity-based checkout** — equipment has a `total_quantity`; students check out however many they need (up to what's available), and different students can borrow the same item simultaneously
- Search + category filter on the browse page, plus a floating "scroll to top" button on long lists
- **Click-to-view full-resolution photos** — thumbnails are cropped for display, but clicking/tapping one shows the original, uncropped upload
- A confirmation popup after checkout ("You successfully checked out ...")
- **My Borrows** (`/my-borrows`) — any signed-in user can see their own full borrow history, with a "currently borrowed only" filter
- QR code generation + PNG download per equipment item (admin dashboard)
- Self-service checkout by students; **returns are admin-only**, preventing anyone from falsely clearing a checkout
- Email alerts: admins get a readable email (borrower name, item, quantity, location, time) the moment something's checked out
- Full equipment CRUD for admins via a popup modal (add/edit), instead of a form pinned to the top of the page
- **Status summary** bar above the admin equipment grid — clickable, toggleable pill filters (Available / In use / Out of stock / Maintenance / Decommissioned) that combine with the search box. "In use" is computed from actual checkout data, not just the raw database status (see [Known limitations](#known-limitations--roadmap) below for why that distinction matters)
- **Borrowers** (`/admin/borrowers`) — admin-only page showing full checkout history across all users: who borrowed what, when, how many, and whether it's been returned, with search + an active-only filter
- Row Level Security throughout — students can't edit equipment or tamper with logs; only exactly the actions the UI exposes are possible at the database level

## Database schema

**profiles** — mirrors `auth.users`, extended with a `role` (`student` / `admin`). Auto-created on first login via the `handle_new_user()` trigger.

**equipment** — one row per equipment type: `name`, `category`, `total_quantity`, `status` (`available` / `in_use` / `maintenance` / `decommissioned` / `out_of_stock` — see note below), `location`, `notes`, `thumbnail_url` (cropped display image), `thumbnail_full_url` (original uncropped upload, shown when a user clicks the thumbnail), `photo_urls` (additional gallery photos).

> **Note on `status`:** the database only ever sets this column to `available` or `out_of_stock` automatically (based on remaining quantity), plus `maintenance` / `decommissioned` when an admin sets them manually. `in_use` is a valid enum value that the database itself never assigns — the frontend derives it client-side (see `src/lib/equipmentStatus.js`) whenever *some but not all* of an item's stock is checked out. Keep this in mind if you ever query `equipment.status` directly from SQL — it won't tell you whether something is partially checked out; you need to join against `checkouts` for that.

**checkouts** — one row per checkout: `equipment_id`, `user_id` (borrower), `quantity`, `checked_out_at`, `returned_at` (null while still out), `returned_by` (which admin processed the return).

**usage_logs** — append-only audit trail: `equipment_id`, `user_id` (who the log concerns), `performed_by` (who actually took the action), `action` (`viewed` / `checked_out` / `returned`), `created_at`. This is what triggers the admin notification email.

**Key Postgres functions** (called via `supabase.rpc(...)`, never via raw table writes):
- `available_quantity(item_id)` — `total_quantity` minus the sum of all not-yet-returned checkout quantities
- `checkout_quantity(item_id, requested_quantity)` — validates there's enough stock, inserts the `checkouts` row, logs it, and updates `equipment.status`
- `return_checkout(checkout_id)` — admin-only; marks a checkout returned, logs it, updates `equipment.status`
- `is_admin()` — used throughout RLS policies

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

Get both from Supabase → Project Settings → API. Note: the URL is the bare domain — no `/rest/v1/` suffix. This key is meant to be public (Row Level Security is what actually protects your data), so it being in a frontend bundle is expected and fine.

## Database migrations

The base schema (`profiles`, `equipment`, `checkouts`, `usage_logs`, RLS policies, and the functions above) was set up directly via Supabase's SQL Editor and isn't tracked as migration files in this repo. Going forward, incremental schema changes are tracked under `supabase/` as numbered `.sql` files, run once each in the SQL Editor:

| File | What it does |
|---|---|
| `007_thumbnail_full_url.sql` | Adds `thumbnail_full_url` to `equipment`, storing the original uncropped upload alongside the cropped display thumbnail |

If you're setting this up fresh from scratch, you'll need to recreate the base schema first (tables, enums, RLS policies, and the functions listed above) before running any numbered files.

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
5. Every push to your main branch auto-deploys. Pushing a feature branch spins up a separate preview deployment.

**After deploying, update these to match your live domain:**
- Supabase → Authentication → URL Configuration → **Site URL** and **Redirect URLs** (must include `https://`, not just the bare domain) — add `http://localhost:5173` here too if you want Google sign-in to work in local dev
- Google Cloud Console → your OAuth Client → **Authorized JavaScript origins**

**Backend (Supabase):** already hosted — nothing to deploy beyond running migrations and the edge function below.

## Email alerts

Admins get an email the moment a checkout happens, via a Database Webhook on `usage_logs` INSERT → the `notify-admin` edge function → Resend.

```bash
npm install supabase --save-dev   # local CLI, avoids sudo/global-install issues
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase secrets set RESEND_API_KEY=your_resend_key
npx supabase secrets set ADMIN_EMAIL=the_email_you_signed_up_to_resend_with
npx supabase functions deploy notify-admin
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set manually — Supabase injects them automatically inside edge functions. The function uses the service role client to look up the borrower's name, the equipment name/location, and the checkout quantity (the raw webhook payload only contains IDs), then sends a readable email like:

> **Subject:** LabQR: Maria Santos checked out Digital Multimeter
> Item, Quantity, Location, and Checked-out time, in a small table.

It currently uses Resend's shared test sender, which only reliably delivers to your own verified address until you verify a real sending domain.

If you change `supabase/functions/notify-admin/index.ts`, remember that editing the file locally does nothing on its own — you have to re-run `npx supabase functions deploy notify-admin` for the change to actually go live. Check `npx supabase functions logs notify-admin` if an email looks wrong or doesn't arrive.

## Security notes

- The database triggers that call `notify-admin` (`notify_admin_on_checkout`, `notify_admin_webhook`) historically had Supabase API keys — including a **service role key**, which bypasses Row Level Security entirely — hardcoded directly in the trigger definition, visible to anyone who can read a schema dump. **If you haven't already, rotate your service role key** (Supabase → Project Settings → API) and move any secrets used by triggers into **Supabase Vault** instead of literal values in the trigger body.
- Never commit `.env.local` (it isn't, via `.gitignore` — keep it that way). The anon key inside it is meant to be public; nothing else in this repo should contain a service role key or Resend API key in plaintext.

## User guide — students

1. Go to the site (or scan an item's QR code).
2. Browse or search for equipment — no login needed to look around. Click a thumbnail to see the full, uncropped photo.
3. Tap an item to see its details, including how many are currently available.
4. To check it out: sign in with your Google account if prompted, choose a quantity (if more than one is available), then tap **Check out**. You'll get a confirmation popup.
5. See everything you've ever borrowed — and what's still out — under **My Borrows** in the header.
6. When you're done, bring it back physically — an **admin** marks it returned in the system.

## User guide — admins

1. Sign in, then go to **Admin Dashboard** (link appears in the header once your account has admin role).
2. **Add equipment:** click **Add equipment** to open the form in a popup — fill it out and submit.
3. **Edit/delete:** click **Edit** on any card to reopen that same popup, pre-filled.
4. **Filter the grid:** click any pill in the status summary bar (Available / In use / etc.) to filter to that status — click it again to clear. Multiple pills combine. Use the search box for name/category/location.
5. **Download a QR code:** each card has a QR image + Download button — print it and attach it to the physical item.
6. **Process a return:** when a card shows "Currently checked out" info, click **Mark Returned** once the item's physically back — or do this from the **Borrowers** tab instead, which shows every checkout across every student.
7. **Promote another admin:** currently done manually in Supabase's Table Editor — find their row in `profiles` and set `role` to `admin`.

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Browse/search equipment (default landing page) |
| `/browse` | Public | Same as `/` |
| `/item/:id` | Public to view; login required to check out | Item details + checkout action |
| `/my-borrows` | Any signed-in user | Your own borrow history |
| `/admin` | Admins only | Equipment CRUD, status filters, search |
| `/admin/borrowers` | Admins only | Full checkout history across all students |

## Resetting borrower history (e.g. before a new term)

To wipe test/old checkout activity without touching your equipment list, run in Supabase's SQL Editor:

```sql
delete from usage_logs;
delete from checkouts;

update equipment
set status = 'available'
where status = 'out_of_stock';
```

This is irreversible — take a `supabase db dump --data-only` first if you want a backup. It does not delete equipment rows or `profiles` (past student accounts still exist as real auth users; delete those separately if needed).

## Known limitations / roadmap

- No domain restriction — any Google account can log in, not just a school's
- No overdue tracking (e.g. "checked out 5 days ago, flag it")
- Categories are free-text, not a managed list — fine at small scale
- No automated tests yet
- Items whose thumbnail was uploaded before the "full image" feature existed won't have a `thumbnail_full_url` until someone re-uploads the thumbnail through the edit modal — clicking those falls back to showing the cropped version

## Troubleshooting

- **404 on refresh / on a QR scan:** `vercel.json`'s SPA rewrite is missing or not deployed — see Deployment section.
- **"Could not find a relationship between 'equipment' and 'profiles'":** the foreign key or PostgREST's schema cache is stale — run `NOTIFY pgrst, 'reload schema';` in the SQL Editor.
- **"requested path is invalid" during login:** Supabase's Site URL or Redirect URLs don't match your actual domain exactly (missing `https://`, wrong subdomain, or missing the `/**` wildcard).
- **Login redirects to `localhost` in production:** Supabase's Site URL is still set to the local dev URL — update it to your live domain.
- **Some admins don't get email alerts:** you're on Resend's shared test sender, which only delivers reliably to your own verified address — verify a real sending domain to fix.
- **Edited `notify-admin/index.ts` but the email looks unchanged:** you edited the file locally but haven't run `npx supabase functions deploy notify-admin` yet — edge function code only updates on Supabase's servers after a deploy.
