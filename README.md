# Healing Hands Physiotherapy — Website

Website with an admin panel so **the clinic can change almost everything without touching code**.

Deployed on **Vercel** (static files + serverless API) with **Supabase** for content,
appointments, sessions and image storage. The live site needs no server of its own.

> **Deploying?** Follow **[docs/DEPLOY.md](docs/DEPLOY.md)** — 12 numbered steps,
> each with the exact output to look for.

---

## Running it locally

The live site is hosted, so local running is only needed for development.
The old Node/Express server is still included for comparison:

```bash
npm install
npm run legacy    # old Express app on http://localhost:3000
```

Admin panel: <http://localhost:3000/admin.html>

Default passcode: `healinghands2026` — **change it in Settings & backup** on first login.
(The passcode is stored as a scrypt hash, never in plain text.)

To work against Supabase instead:

```bash
npm run seed      # import data/*.json into Supabase once
npm test          # exercise every API endpoint
```

---

## How the site is organised

```
pages/                 the HTML pages
  index.html  about.html  services.html  what-we-treat.html
  blog.html   faq.html    book-appointment.html   admin.html
api/                   the live backend (Vercel functions)
  [...path].js           every /api route
  lib/                   supabase · store · auth · validate · upload
scripts/               build-image-manifest · seed · test-api
supabase/schema.sql    database tables, RLS, storage bucket
docs/                  DEPLOY.md · ADMIN-GUIDE.md
legacy/                old Express server (unused, kept for reference)

css/style.css          all styling
js/cms.js              applies saved text/image/link values to every page
js/site-data.js        loads all data and renders the editable lists
js/main.js             nav, parallax, modals, animations
js/admin.js            the admin panel
js/conditions-data.js  fallback copy of the conditions list
js/appointment.js      booking form validation

data/                  seed input for `npm run seed`, plus the three files the
                       site actually uses (content.default.json and
                       content-schema.json are bundled; content.json is the
                       offline fallback)
images/                all pictures
images/resp/           smaller versions used on phones
uploads/               images uploaded through the admin panel
```

---

## What the client can change (no developer needed)

### 1. Page content — the "Website pages" section
Every heading, paragraph, button label, link, image, background image and alt-text on all
7 public pages. Grouped by area (Top bar, Header, Hero, Footer…) and searchable.
Changes save instantly; the preview pane updates.

### 2. Content blocks
| Panel | Controls |
|---|---|
| **Doctors** | Photo, name, credentials, roles, short and long bio, show/hide, reorder |
| **Specialties carousel** | The scrolling cards on the home page |
| **Treatments & pricing** | Treatment cards with prices |
| **Therapies** | The Basic and Advanced therapy groups on the Services page — rename, reorder, add, delete, show/hide |
| **Conditions we treat** | All 71 conditions: picture, name, symptoms, show/hide, reorder, add, delete |
| **Blog posts** | Add/edit/reorder/hide posts, cover image, category, date, summary and full article text |
| **What We Treat lists** | The symptoms, therapies and services lists on that page (one per line) |
| **Booking form options** | Cities, treatment types, service types and time slots in the booking form |
| **Contact & hours** | Phone, WhatsApp, address, opening hours — used across the whole site |
| **Appointments** | Every booking request, with status and notes |
| **Settings & backup** | Change passcode, download a full backup, restore a backup, reset |

---

## Data files

| File | Holds |
|---|---|
| `data/content.json` | All page text, image paths and links (485 keys) |
| `data/doctors.json` | The physiotherapists |
| `data/specialties.json` | Specialty carousel cards |
| `data/services.json` | Treatments and prices |
| `data/therapies.json` | Basic + Advanced therapy groups |
| `data/conditions.json` | Conditions with image and symptoms |
| `data/directory.json` | What We Treat lists |
| `data/blogposts.json` | Blog articles |
| `data/booking-options.json` | Booking form dropdown options |
| `data/clinicInfo.json` | Contact details and hours |
| `data/sectionCopy.json` | Section headings |
| `data/appointments.json` | Booking requests |
| `data/content-schema.json` | Describes every field so the admin can render it |
| `data/passcode.json` | Hashed admin passcode |

**Backups** (Settings & backup) now include all of the above.

---

## How editing works

1. Client signs in at `/admin.html`.
2. The panel loads the current content and shows a form.
3. **Save changes** posts everything back; the API writes it to the database and bumps a version number.
4. Public pages poll the version and re-render within ~2 seconds — no rebuild, no upload.

---

## Security notes

- Admin passcode is **scrypt-hashed**; plain-text passcodes migrate automatically on first login.
- All admin API routes require a bearer token.
- Login is rate limited: 10 failed attempts per IP per 15 minutes.
- Uploads are restricted to JPG / PNG / WEBP / GIF / AVIF. **SVG is blocked** on purpose —
  an SVG can carry JavaScript, and these files are served from the site's own origin.
- Uploaded filenames are rebuilt server-side from a random token, so a crafted filename
  cannot escape the uploads folder or choose its own extension.
- Security headers are sent on every response: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, plus a restrictive CSP on `/uploads`.

---

## Deploying

Hosted on **Vercel** (site + API functions) with **Supabase** (database + image
storage). Full steps in [DEPLOY.md](docs/DEPLOY.md). In short:

1. Create the Supabase project and run `supabase/schema.sql`.
2. `npm run seed` to import the existing content.
3. `npm test` to confirm every endpoint works.
4. `vercel --prod`, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as
   environment variables.

**Before going live:** change the admin passcode from Settings & backup.

---

## Known limitations

- Uploads are capped at **4 MB** (Vercel's request-body limit). The largest image
  on the site is 2.7 MB.
- The header and footer markup is copied into each of the 7 pages, so a structural change to
  the nav has to be repeated per page (the *text* is still editable per page from the panel).
- The 71 condition images are the slowest part of the home page.
