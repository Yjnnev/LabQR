# LabQR — Developer Documentation

This covers *how the code actually works* — what each file is for, and how the major features are wired together. Pair this with `README.md` (setup/usage) when onboarding someone new or picking this back up later.

---

## Table of contents

- [Project structure](#project-structure)
- [File reference](#file-reference)
- [How auth works](#how-auth-works)
- [How checkout/return works](#how-checkoutreturn-works)
- [How QR code generation works](#how-qr-code-generation-works)
- [How browsing/search/filter works](#how-browsingsearchfilter-works)
- [How the borrower info on admin cards works](#how-the-borrower-info-on-admin-cards-works)
- [How email alerts work](#how-email-alerts-work-currently-disconnected-see-readme)
- [Shared conventions worth knowing](#shared-conventions-worth-knowing)

---

## Project structure

```
src/
  App.jsx                          Route definitions + top-level providers
  index.css                        All styling (no CSS framework used)
  lib/
    supabaseClient.js               Single shared Supabase client instance
    statusLabels.js                 Shared "available" → "Available" label map
    authActions.js                  Google sign-in helper, shared by Header/ItemPage/Login
  context/
    AuthContext.jsx                 Tracks session + profile (role) app-wide
  routes/
    Login.jsx                       Standalone login screen (rarely reached directly)
    ProtectedRoute.jsx              Route guard — used only for /admin
    ItemPage.jsx                    /item/:id — item detail + checkout action
    BrowseEquipment.jsx             /  and /browse — searchable equipment grid
    AdminDashboard.jsx              /admin — equipment CRUD + return processing
  components/
    Header.jsx                     Persistent top nav: auth state, login/logout
    EquipmentCard.jsx               Admin dashboard's per-item card
    BrowseEquipmentCard.jsx         Browse page's per-item card (simpler, clickable)
    QRCodeCell.jsx                  Renders + lets admin download a QR code

supabase-functions/
  notify-admin/index.ts             Edge function: emails on checkout/return

migrations/
  schema.sql, 002–006*.sql          Run in order against a fresh Supabase project
```

---

## File reference

| File | Purpose |
|---|---|
| `App.jsx` | Defines every route and wraps the app in `AuthProvider` + `BrowserRouter` |
| `index.css` | All visual styling app-wide — no CSS framework, just shared classes |
| `lib/supabaseClient.js` | Creates the one Supabase client instance every other file imports |
| `lib/statusLabels.js` | Maps raw status values (`in_use`) to display labels (`In use`) |
| `lib/authActions.js` | `signInWithGoogle()` — the single Google OAuth call, shared by 3 components |
| `context/AuthContext.jsx` | Tracks the current session + profile (role); exposes `useAuth()` app-wide |
| `routes/Login.jsx` | Standalone login screen — rarely hit directly since login is contextual now |
| `routes/ProtectedRoute.jsx` | Route guard checking for a session (and optionally admin role); used only on `/admin` |
| `routes/ItemPage.jsx` | `/item/:id` — shows one item's details and the checkout action |
| `routes/BrowseEquipment.jsx` | `/` and `/browse` — searchable, filterable equipment grid, public access |
| `routes/AdminDashboard.jsx` | `/admin` — full equipment CRUD plus the "Mark Returned" action |
| `components/Header.jsx` | Persistent nav bar: brand link, admin link, login/logout buttons |
| `components/EquipmentCard.jsx` | One equipment card as rendered in the admin dashboard grid |
| `components/BrowseEquipmentCard.jsx` | One equipment card as rendered in the public browse grid |
| `components/QRCodeCell.jsx` | Draws a QR code to canvas and offers a PNG download |
| `supabase-functions/notify-admin/index.ts` | Edge function emailing admins on checkout, students on return |
| `migrations/*.sql` | Database schema + policies + the `checkout_equipment()` function, applied in numeric order |

---

## How auth works

**File: `context/AuthContext.jsx`**

This is the single source of truth for "who's logged in and what's their role." It does two things on mount:

1. Reads any existing Supabase session, and subscribes to future auth changes (login/logout anywhere in the app updates this automatically):

```jsx
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
    setLoading(false)
  })

  const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
    setSession(newSession)
  })

  return () => listener.subscription.unsubscribe()
}, [])
```

2. Once a session exists, fetches that user's `profiles` row — this is where `role` (`student`/`admin`) comes from:

```jsx
useEffect(() => {
  if (!session?.user) { setProfile(null); return }
  supabase.from('profiles').select('*').eq('id', session.user.id).single()
    .then(({ data }) => setProfile(data))
}, [session])
```

Any component can read `{ session, profile, signOut }` via `useAuth()`. There's no prop-drilling — `AuthProvider` wraps the whole app in `App.jsx`.

**Route protection — `routes/ProtectedRoute.jsx`:** only used on `/admin`. It checks `profile?.role === 'admin'` and renders a "no access" message otherwise. Every other route is intentionally public — see the Guest Browsing section below for why.

**Login — `lib/authActions.js`, called from `Header.jsx`, `ItemPage.jsx`, and `Login.jsx`:**

```js
export async function signInWithGoogle(redirectTo = window.location.href) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) console.error('Login error:', error.message)
}
```

All three call sites just do `signInWithGoogle()` — the default parameter means "come back to wherever I currently am" applies automatically without each caller having to pass it explicitly. `redirectTo` defaulting to `window.location.href` is the key detail — it sends the user back to *whatever page they were on*, not a fixed URL. That's why clicking "Sign in" on an item page returns you to that same item, ready to check out, instead of dumping you on the homepage.

**Logout — `Header.jsx`:**

```js
const handleSignOut = async () => {
  await signOut()
  navigate('/')
}
```

Always navigates to `/` after signing out. This was a deliberate fix — without it, logging out while on `/admin` and logging back in as a non-admin would strand you on a page you no longer had access to.

---

## How checkout/return works

This is the most "backend logic" part of the app, and it deliberately does **not** let the frontend update `equipment` directly. Instead there's one Postgres function both actions go through.

**File: `migrations/005_checked_out_at.sql`** (current version of the function — it's been revised twice since `002`):

```sql
create or replace function public.checkout_equipment(item_id uuid, requested_action log_action)
returns void as $$
declare
  current_status equipment_status;
  current_holder uuid;
begin
  select status, checked_out_by into current_status, current_holder
  from equipment where id = item_id;

  if requested_action = 'checked_out' then
    if current_status != 'available' then
      raise exception 'This item is not available for checkout.';
    end if;

    update equipment
    set status = 'in_use', checked_out_by = auth.uid(), checked_out_at = now()
    where id = item_id;

    insert into usage_logs (equipment_id, user_id, performed_by, action)
    values (item_id, auth.uid(), auth.uid(), requested_action);

  elsif requested_action = 'returned' then
    if not public.is_admin() then
      raise exception 'Only an admin can mark equipment as returned.';
    end if;
    ...
```

Why a function instead of RLS-permitted direct updates: students need to flip `equipment.status` on checkout, but should never be allowed to edit equipment freely (name, location, etc). A `security definer` function lets it run with elevated privileges for *exactly this one narrow operation*, while RLS still blocks any direct `UPDATE equipment` from a student role.

**Frontend call site — `routes/ItemPage.jsx`:**

```js
const handleAction = async (action) => {
  const { error } = await supabase.rpc('checkout_equipment', {
    item_id: id,
    requested_action: action,
  })
  ...
}
```

Only `'checked_out'` is ever called from here — the UI simply doesn't render a "Return" button for students anymore (removed in the admin-only-return revision). The button that calls `requested_action: 'returned'` lives only in:

**`routes/AdminDashboard.jsx`:**

```js
const handleMarkReturned = async (id) => {
  const { error } = await supabase.rpc('checkout_equipment', {
    item_id: id,
    requested_action: 'returned',
  })
  ...
}
```

Even if someone bypassed the UI and called the RPC directly as a non-admin, the SQL function itself checks `public.is_admin()` and raises an exception — the restriction is enforced at the database layer, not just hidden in the frontend.

---

## How QR code generation works

**File: `components/QRCodeCell.jsx`**

Uses the `qrcode` npm package to draw directly onto a `<canvas>` element, then offers a download by reading the canvas back out as a PNG data URL:

```jsx
const canvasRef = useRef(null)
const url = `${window.location.origin}/item/${itemId}`

useEffect(() => {
  QRCode.toCanvas(canvasRef.current, url, { width: 96, margin: 1 })
}, [url])

const handleDownload = () => {
  const link = document.createElement('a')
  link.download = `${itemName.replace(/\s+/g, '-').toLowerCase()}-qr.png`
  link.href = canvasRef.current.toDataURL('image/png')
  link.click()
}
```

Key detail: the encoded URL uses `window.location.origin` at render time — meaning **QR codes generated locally point to `localhost`, and ones generated on the live site point to your production domain.** Always regenerate/reprint QR codes from wherever you intend students to actually scan them from.

This component is used inside `EquipmentCard.jsx` (admin dashboard only) — students never see the raw QR image, they just scan the printed sticker.

---

## How browsing/search/filter works

**File: `routes/BrowseEquipment.jsx`**

Fetches all equipment once, then filters client-side — no server round-trip per keystroke, since lab inventories are small enough that this is simpler and faster than debounced server queries:

```js
const filtered = items.filter((item) => {
  const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase())
  const matchesCategory = category === 'all' || item.category === category
  return matchesSearch && matchesCategory
})
```

The category dropdown's options are derived from whatever categories actually exist in the fetched data, not a fixed list:

```js
const categories = ['all', ...new Set(items.map((i) => i.category).filter(Boolean))]
```

This means adding a new category is as simple as typing a new one into the equipment form — no schema change, no dropdown to update elsewhere. (Trade-off: typos create a new "category" silently — fine at current scale, but the first thing to fix if categories start multiplying inconsistently.)

**Guest access:** this page (and `ItemPage.jsx`) intentionally has no `ProtectedRoute` wrapper — see `migrations/006_guest_browsing.sql`, which changed the `equipment` SELECT policy to include the `anon` role:

```sql
create policy "Anyone can view equipment"
  on equipment for select
  to authenticated, anon
  using (true);
```

Only the *checkout action* still requires a session — enforced both in the UI (`ItemPage.jsx` conditionally shows Sign in/Sign up buttons instead of a Check out button when `!session`) and in the database (`checkout_equipment()` uses `auth.uid()`, which is `null` for anonymous requests, and the `usage_logs.user_id` column is `not null`, so an anonymous call would fail even if someone bypassed the UI).

---

## How the borrower info on admin cards works

**File: `routes/AdminDashboard.jsx`**

Rather than a second query, the borrower's email comes from a single Postgres embed via the `checked_out_by` foreign key:

```js
const { data } = await supabase
  .from('equipment')
  .select('*, borrower:profiles!checked_out_by(email, full_name)')
  .order('created_at', { ascending: false })
```

`profiles!checked_out_by` tells PostgREST which foreign key to follow (needed since `profiles` could theoretically be reached from equipment via more than one path in the future). The result lands in `item.borrower.email` / `item.borrower.full_name`, consumed directly in `components/EquipmentCard.jsx`.

---

## How email alerts work (currently disconnected, see README)

**File: `supabase-functions/notify-admin/index.ts`**

A Supabase Edge Function (Deno runtime) triggered by a Database Webhook on `usage_logs` INSERT. It:

1. Ignores `'viewed'` events entirely — only reacts to `'checked_out'` / `'returned'`.
2. Uses the **service role key** (auto-injected as `SUPABASE_SERVICE_ROLE_KEY`, no manual secret needed) to look up the equipment name and the relevant student's profile, bypassing RLS since this runs server-side, not as a logged-in user.
3. Picks the recipient based on the action:

```ts
const recipient = isReturn
  ? studentProfile?.email                                    // notify the student
  : (admins || []).map((a) => a.email).filter(Boolean)        // notify every admin
```

Admin recipients are pulled live from `profiles where role = 'admin'` at send-time — no hardcoded email list, so promoting a new admin automatically includes them in future alerts.

It's currently not wired to a live webhook (put on hold to deal with later) — see `README.md`'s Deployment section for the redeploy steps whenever you pick this back up.

---

## Shared conventions worth knowing

- **Status labels** (`lib/statusLabels.js`) are imported everywhere a status needs a human-readable name, instead of each component hardcoding its own copy — keep new status-displaying components importing from here rather than re-defining the map.
- **CSS classes are shared, not component-scoped** — e.g. `.status-pill` + `.status-available` etc. are used by both `EquipmentCard` and `BrowseEquipmentCard` and the `ItemPage` hero card. If you restyle statuses, one edit in `index.css` covers all three.
- **All database writes that matter go through RPC or RLS-guarded direct calls** — there's no separate backend server; Supabase's Postgres + RLS + the `checkout_equipment()` function *is* the backend logic layer. When adding a new feature that needs permission rules, the pattern to follow is: write a Postgres function if the rule is more complex than "can this role touch this row," otherwise a plain RLS policy is enough (see `schema.sql` for policy examples).
