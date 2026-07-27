# LabQR — Developer Documentation

This covers *how the code actually works* — what each file is for, and how the major features are wired together. Pair this with `README.md` (setup/usage) when onboarding someone new or picking this back up later.

---

## Table of contents

- [Project structure](#project-structure)
- [File reference](#file-reference)
- [How auth works](#how-auth-works)
- [How checkout/return works (quantity-based)](#how-checkoutreturn-works-quantity-based)
- [How the "effective status" / partial-checkout display works](#how-the-effective-status--partial-checkout-display-works)
- [How the admin edit/add modal works](#how-the-admin-editadd-modal-works)
- [How thumbnail cropping + full-image viewing works](#how-thumbnail-cropping--full-image-viewing-works)
- [How QR code generation works](#how-qr-code-generation-works)
- [How browsing/search/filter works](#how-browsingsearchfilter-works)
- [How the Borrowers and My Borrows pages work](#how-the-borrowers-and-my-borrows-pages-work)
- [How email alerts work](#how-email-alerts-work)
- [Shared conventions worth knowing](#shared-conventions-worth-knowing)

---

## Project structure

```
src/
  App.jsx                          Route definitions + top-level providers
  index.css                        All styling (no CSS framework used)
  lib/
    supabaseClient.js               Single shared Supabase client instance
    statusLabels.js                 Shared "available" -> "Available" label map
    authActions.js                  Google sign-in helper, shared by Header/ItemPage/Login
    equipmentPhotos.js              Shared upload/delete helpers for equipment-photos storage bucket
    equipmentStatus.js              Derives display status (adds 'in_use') from raw status + checkouts
    cropImage.js                    Canvas-based image cropping, used by ThumbnailCropper
  context/
    AuthContext.jsx                 Tracks session + profile (role) app-wide
  routes/
    Login.jsx                       Standalone login screen (rarely reached directly)
    ProtectedRoute.jsx              Route guard — session required, optionally adminOnly
    ItemPage.jsx                    /item/:id — item detail + quantity checkout + success popup
    BrowseEquipment.jsx             /  and /browse — searchable equipment grid (public)
    MyBorrows.jsx                   /my-borrows — a user's own checkout history
    AdminDashboard.jsx              /admin — equipment CRUD, status filters, search
    Borrowers.jsx                   /admin/borrowers — full checkout history, all users
  components/
    Header.jsx                     Persistent top nav: auth state, login/logout, My Borrows/Admin links
    AdminNav.jsx                    Tab nav shared by AdminDashboard and Borrowers
    EquipmentCard.jsx               Admin dashboard's per-item card
    EquipmentFormModal.jsx          Popup form for adding/editing equipment (thumbnail + gallery uploads)
    StatusSummary.jsx               Clickable, toggleable status-count pill bar
    ScrollToTopButton.jsx           Floating scroll-to-top button (admin + browse pages)
    BrowseEquipmentCard.jsx         Browse page's per-item card (clickable thumbnail, links to /item/:id)
    CheckoutSuccessModal.jsx        "You successfully checked out ..." popup
    PhotoGalleryModal.jsx           Lightbox used for gallery photos and full-res thumbnail viewing
    ThumbnailCropper.jsx            Crop UI shown after picking a thumbnail file
    QRCodeCell.jsx                  Renders + lets admin download a QR code

supabase/
  007_thumbnail_full_url.sql       Numbered migrations, tracked from this point forward
  functions/
    notify-admin/index.ts           Edge function: readable email to admins on checkout
```

---

## File reference

| File | Purpose |
|---|---|
| `App.jsx` | Defines every route and wraps the app in `AuthProvider` + `BrowserRouter` |
| `index.css` | All visual styling app-wide — no CSS framework, just shared classes |
| `lib/supabaseClient.js` | Creates the one Supabase client instance every other file imports |
| `lib/statusLabels.js` | Maps raw/effective status values (`in_use`) to display labels (`In use`) |
| `lib/authActions.js` | `signInWithGoogle()` — the single Google OAuth call, shared by 3 components |
| `lib/equipmentPhotos.js` | `uploadPhoto()` / `deletePhotoFile()` — shared by the form modal and the delete-item flow, so there's one place that knows how storage paths map to public URLs |
| `lib/equipmentStatus.js` | `getEffectiveStatus(item, checkedOutQuantity)` — see dedicated section below |
| `lib/cropImage.js` | `getCroppedImageFile()` — draws a cropped region to canvas, returns it as an uploadable `File` |
| `context/AuthContext.jsx` | Tracks the current session + profile (role); exposes `useAuth()` app-wide |
| `routes/Login.jsx` | Standalone login screen — rarely hit directly since login is contextual now |
| `routes/ProtectedRoute.jsx` | Route guard: requires a session; pass `adminOnly` to also require `profile.role === 'admin'` |
| `routes/ItemPage.jsx` | `/item/:id` — item details, quantity picker, checkout, success popup, full-image viewing |
| `routes/BrowseEquipment.jsx` | `/` and `/browse` — searchable, filterable equipment grid, public access |
| `routes/MyBorrows.jsx` | `/my-borrows` — any signed-in user's own checkout history |
| `routes/AdminDashboard.jsx` | `/admin` — equipment CRUD via modal, status pill filters, search |
| `routes/Borrowers.jsx` | `/admin/borrowers` — checkout history across every user, with search + active filter |
| `components/Header.jsx` | Persistent nav bar: brand link, My Borrows, admin link, login/logout buttons |
| `components/AdminNav.jsx` | Tab links between Equipment and Borrowers, shown on both admin pages |
| `components/EquipmentCard.jsx` | One equipment card in the admin grid — computes and shows the *effective* status |
| `components/EquipmentFormModal.jsx` | Add/edit form in a popup; manages thumbnail (cropped + full-res) and gallery photo lifecycle |
| `components/StatusSummary.jsx` | Renders one clickable pill per status; counts use effective status too |
| `components/ScrollToTopButton.jsx` | Appears after scrolling past a threshold; smooth-scrolls to top on click |
| `components/BrowseEquipmentCard.jsx` | Public browse card; thumbnail click opens the full-res image without navigating |
| `components/CheckoutSuccessModal.jsx` | Simple popup dialog shown after a successful checkout |
| `components/PhotoGalleryModal.jsx` | Photo lightbox with prev/next; reused for both the gallery and full-res thumbnail viewing |
| `components/ThumbnailCropper.jsx` | Crop UI shown right after a thumbnail file is picked, before upload |
| `components/QRCodeCell.jsx` | Draws a QR code to canvas and offers a PNG download |
| `supabase/functions/notify-admin/index.ts` | Edge function emailing admins a readable summary on checkout |

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

2. Once a session exists, fetches that user's `profiles` row — this is where `role` (`student`/`admin`) comes from.

Any component can read `{ session, profile, signOut }` via `useAuth()`. There's no prop-drilling — `AuthProvider` wraps the whole app in `App.jsx`.

**Route protection — `routes/ProtectedRoute.jsx`:** used on `/admin`, `/admin/borrowers` (with `adminOnly`), and `/my-borrows` (without it — any signed-in user). It checks for a session first (rendering `<Login />` if none), then `profile?.role === 'admin'` when `adminOnly` is passed.

**Login — `lib/authActions.js`, called from `Header.jsx`, `ItemPage.jsx`, and `Login.jsx`:** `signInWithGoogle()` defaults `redirectTo` to `window.location.href`, so signing in from an item page returns you to that same item, ready to check out, instead of dumping you on the homepage.

**Logout — `Header.jsx`:** always navigates to `/` after signing out, so logging out while on `/admin` never strands a now-unauthorized user on a page they can't see.

---

## How checkout/return works (quantity-based)

Unlike a single-item "one equipment row = one checkout" design, equipment here has a `total_quantity`, and any number of students can hold some of that stock simultaneously. The frontend never writes to `equipment` or `checkouts` directly — everything goes through two Postgres functions.

**`checkout_quantity(item_id, requested_quantity)`** — validates there's enough stock left (via `available_quantity()`), inserts a `checkouts` row, logs a `usage_logs` entry, then recomputes `equipment.status` (`available` if any stock remains, `out_of_stock` if not — see the effective-status section for why `in_use` is never set here).

**Frontend call site — `routes/ItemPage.jsx`:**

```js
const handleCheckout = async () => {
  setActionError(null)
  const { error } = await supabase.rpc('checkout_quantity', {
    item_id: id,
    requested_quantity: quantity,
  })
  if (error) {
    setActionError(error.message)
    return
  }
  setAvailable((prev) => prev - quantity)
  setSuccessMsg(`You successfully checked out ${quantity > 1 ? `${quantity} × ` : ''}${equipment.name}!`)
  setShowSuccessModal(true)
}
```

**`return_checkout(checkout_id)`** — admin-only (raises an exception if `is_admin()` is false, enforced at the database layer, not just hidden in the UI); marks that specific `checkouts` row returned, logs it, and updates `equipment.status`.

**Call sites:** both `EquipmentCard.jsx` (admin dashboard) and `Borrowers.jsx` call this identically:

```js
const { error } = await supabase.rpc('return_checkout', { checkout_id: checkoutId })
```

Because it's keyed by `checkout_id` rather than `equipment_id`, returning one student's checkout never touches anyone else's simultaneous checkout of the same item.

---

## How the "effective status" / partial-checkout display works

**File: `lib/equipmentStatus.js`**

The `equipment.status` enum has five values (`available`, `in_use`, `out_of_stock`, `maintenance`, `decommissioned`), but the database functions above only ever *set* it to `available` or `out_of_stock` (plus whatever an admin manually sets for `maintenance`/`decommissioned`). `in_use` is never assigned by the database — "available" there just means "some quantity remains," which is correct for a shared pool but not very informative when, say, 1 of 3 microscopes is out.

`getEffectiveStatus(item, checkedOutQuantity)` derives a better status client-side:

```js
export function getEffectiveStatus(item, checkedOutQuantity) {
  if (item.status === 'maintenance' || item.status === 'decommissioned') {
    return item.status
  }

  const available = item.total_quantity - checkedOutQuantity

  if (available <= 0) return 'out_of_stock'
  if (checkedOutQuantity > 0) return 'in_use'
  return 'available'
}
```

Every place that displays or filters by status uses this instead of the raw column: `EquipmentCard.jsx` (the pill on each card), `StatusSummary.jsx` (both the counts and what each pill filters by), and `AdminDashboard.jsx`'s `filteredItems` memo. All three need `checkedOutQuantity`, which comes from `checkoutsByEquipment` — a map of `equipment_id -> [active checkouts]` built once in `AdminDashboard.loadItems()` and passed down as a prop.

If you ever query `equipment.status` directly in SQL expecting it to reflect partial checkouts, it won't — join against `checkouts` for that, same as this file does in JS.

---

## How the admin edit/add modal works

**File: `components/EquipmentFormModal.jsx`**, opened from `AdminDashboard.jsx`

`AdminDashboard` tracks a single `modalItem` state with three meaningful values: `undefined` (modal closed), `null` (adding a new item), or an equipment object (editing that item). The modal itself doesn't know or care which — `editingId = item?.id ?? null` is the only branch point, used to decide between a Postgres `insert` and `update` on submit.

**Photo lifecycle** is the trickiest part, since every equipment item can have a cropped thumbnail, an original full-res thumbnail, and a gallery of extra photos, any of which might be added, replaced, or removed independently in one edit:

- On submit, if a *new* thumbnail file was picked, both the cropped version and its pre-crop original get uploaded, and whatever was there before gets deleted from storage.
- If the thumbnail was removed without a replacement, both old files get deleted and both URLs are set to `null`.
- Gallery photos: newly added files get uploaded and appended; anything present in the original snapshot but missing from the current list gets deleted.

All uploads/deletes go through `lib/equipmentPhotos.js` so there's one implementation of "how does a public URL map back to a storage path," shared with `AdminDashboard.handleDelete()` (which cleans up all of an item's photos, including `thumbnail_full_url`, when the item itself is deleted).

---

## How thumbnail cropping + full-image viewing works

**Files: `components/ThumbnailCropper.jsx`, `lib/cropImage.js`, `components/PhotoGalleryModal.jsx`**

When an admin picks a thumbnail file in `EquipmentFormModal`, it's held as `pendingCropFile` and `ThumbnailCropper` opens over it. `onCropComplete` receives the cropped result, but the modal also stashes the *original, pre-crop* file at that same moment:

```js
onCropComplete={(croppedFile) => {
  setThumbnailFile(croppedFile)
  setThumbnailFullFile(pendingCropFile)   // the untouched original
  setPendingCropFile(null)
}}
```

Both get uploaded on submit — the cropped one becomes `thumbnail_url` (shown everywhere as a small image), the original becomes `thumbnail_full_url`. Anywhere a thumbnail is shown to a student (`BrowseEquipmentCard.jsx`, `ItemPage.jsx`'s hero photo), clicking it opens `PhotoGalleryModal` with `[thumbnail_full_url || thumbnail_url]` — falling back to the cropped version for equipment added before this feature existed, since older rows have no `thumbnail_full_url` yet.

`BrowseEquipmentCard.jsx` needs a bit of extra care since the whole card is a `<Link>`: the thumbnail is a `<span role="button">` with `onClick` that calls `e.preventDefault(); e.stopPropagation()` before opening its own local modal state, so clicking the photo doesn't also navigate to the item page.

---

## How QR code generation works

**File: `components/QRCodeCell.jsx`**

Uses the `qrcode` npm package to draw directly onto a `<canvas>` element, then offers a download by reading the canvas back out as a PNG data URL. The encoded URL uses `window.location.origin` at render time — **QR codes generated locally point to `localhost`, and ones generated on the live site point to your production domain.** Always regenerate/reprint QR codes from wherever you intend students to actually scan them from.

---

## How browsing/search/filter works

**File: `routes/BrowseEquipment.jsx`**

Fetches all equipment once (including `thumbnail_full_url` now, for the click-to-zoom feature), then filters client-side — lab inventories are small enough that this is simpler and faster than debounced server queries. The category dropdown's options are derived from whatever categories actually exist in the fetched data, not a fixed list — adding a new category is just typing a new one into the equipment form, no schema change needed.

**Guest access:** this page and `ItemPage.jsx` intentionally have no `ProtectedRoute` wrapper — the `equipment` SELECT RLS policy includes the `anon` role. Only the checkout action requires a session, enforced both in the UI and by the database (`checkout_quantity()` uses `auth.uid()`, which is `null` for anonymous requests).

**Admin-side search + status filtering — `routes/AdminDashboard.jsx` + `components/StatusSummary.jsx`:** `activeStatuses` is a `Set`; clicking a pill toggles membership in it (multi-select — several statuses can be active at once). `filteredItems` is a `useMemo` combining the search term with `activeStatuses.size === 0 ? show everything : activeStatuses.has(effectiveStatus)`. The pills' *counts*, however, are always computed from the full unfiltered `items` list, so the numbers always reflect true totals even while filtered down.

---

## How the Borrowers and My Borrows pages work

**Files: `routes/Borrowers.jsx` (admin, all users) and `routes/MyBorrows.jsx` (any signed-in user, own history only)**

Both are thin wrappers around the same underlying data — a `checkouts` row joined to `equipment` (name/category/location) and `profiles` (borrower). `Borrowers.jsx` additionally embeds `profiles!returned_by` to show which admin processed each return, and has no user filter (RLS already restricts non-admins to their own rows, but admins can see everyone's via the `"Users can view their own checkouts, admins view all"` policy). `MyBorrows.jsx` adds `.eq('user_id', session.user.id)` explicitly for clarity, even though RLS would already scope it that way for a non-admin caller.

Both reuse the same `.equipment-table` CSS class (originally unused leftover styling from an earlier table-based admin view) rather than each inventing their own table styles.

---

## How email alerts work

**File: `supabase/functions/notify-admin/index.ts`**

A Supabase Edge Function (Deno runtime) triggered by a Database Webhook on `usage_logs` INSERT, filtered to `action === 'checked_out'`. The webhook payload only contains raw IDs (`equipment_id`, `user_id`, etc.), so the function uses a service-role Supabase client — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into edge functions, no manual secret needed — to look up the equipment name/location, the borrower's name, and the active checkout's quantity, in parallel:

```ts
const [{ data: equipment }, { data: borrower }, { data: checkout }] = await Promise.all([
  supabase.from('equipment').select('name, location').eq('id', record.equipment_id).single(),
  supabase.from('profiles').select('full_name, email').eq('id', record.user_id).single(),
  supabase.from('checkouts')
    .select('quantity')
    .eq('equipment_id', record.equipment_id)
    .eq('user_id', record.user_id)
    .is('returned_at', null)
    .order('checked_out_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
])
```

It then sends a subject like `LabQR: Maria Santos checked out Digital Multimeter` and a small HTML table (Item, Quantity, Location, Checked-out time) via Resend, instead of the raw-IDs-and-ISO-timestamp text it used to send.

**Important:** editing `index.ts` only changes the file on disk. The function only updates on Supabase's servers after running `npx supabase functions deploy notify-admin` — see `README.md`'s Email alerts section for the full command sequence, and `npx supabase functions logs notify-admin` for debugging if an email looks wrong.

---

## Shared conventions worth knowing

- **Status labels** (`lib/statusLabels.js`) are imported everywhere a status needs a human-readable name, instead of each component hardcoding its own copy.
- **Effective status** (`lib/equipmentStatus.js`) should be used instead of raw `item.status` anywhere partial checkouts matter for display or filtering — see the dedicated section above. Don't reintroduce a raw `item.status` pill somewhere new without checking whether it should actually be the effective one.
- **CSS classes are shared, not component-scoped** — e.g. `.status-pill` + `.status-available` etc. are used across `EquipmentCard`, `BrowseEquipmentCard`, `ItemPage`'s hero card, and the clickable pills in `StatusSummary`. If you restyle statuses, one edit in `index.css` covers all of them — but note `StatusSummary`'s pills have their own hover/active color rules layered on top (`.status-summary .status-available:hover`, etc.), since those needed to look different from the static, non-interactive pills elsewhere.
- **Photo storage helpers are centralized** in `lib/equipmentPhotos.js` — any new feature that uploads/deletes equipment photos should use `uploadPhoto()` / `deletePhotoFile()` rather than reimplementing the storage-path-from-URL parsing.
- **All database writes that matter go through RPC or RLS-guarded direct calls** — there's no separate backend server; Supabase's Postgres + RLS + the functions listed above *is* the backend logic layer. When adding a feature that needs permission rules more complex than "can this role touch this row," write a Postgres function; otherwise a plain RLS policy is enough.
- **Modals share one CSS pattern** (`.modal-overlay` + a content class per modal — `.equipment-modal`, `.checkout-success-modal`, `.gallery-modal`) — clicking the backdrop closes them (`onClick` on the overlay checking `e.target === e.currentTarget`, or `e.stopPropagation()` on the inner content), which is the pattern to copy for any new modal.
