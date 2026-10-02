# Healing Hands — website + Site Editor

Plain HTML, CSS and JavaScript, hosted on Vercel. A small API stores your changes in a
Supabase database.

## Run it

The live site is already hosted — just open it and go to `/admin.html`.
Setup instructions for the developer are in `docs/DEPLOY.md`.

For local development:

```bash
npm install
npm run legacy    # old Express app on http://localhost:3000
npm test          # exercise the live API against Supabase
```

- Website: http://localhost:3000
- Site Editor: http://localhost:3000/admin.html
- Default passcode: `healinghands2026` (change it in the editor under *Settings & backup*)

## What you can edit

The editor has two sets of menu items.

**Website pages** — Home, About Us, Services, What We Treat, Blog, FAQ and Book Appointment.
Each page is split into blocks (top bar, header, hero, gallery, FAQ, footer…). Inside a block
you can change:

- every piece of text (headings, paragraphs, list items, captions, button labels)
- every photo, plus its description
- every background image
- where each button links to

Use the search box at the top to find any sentence on the page instantly, and
*Show preview* to watch the page update as you save.

**Content blocks** — the parts of the site that repeat or are generated:

- Doctors (photo, name, credentials, both bios, order, show/hide)
- Specialties carousel (image, title, order, show/hide)
- Treatments & pricing (title, description, price, icon, order, show/hide)
- Contact & hours (phone, WhatsApp, address, opening hours — used on every page)
- Appointments (requests from the booking form, status, CSV download)
- Settings & backup (passcode, download/restore a backup, reset content)

Changes are saved with the **Save changes** button (or Ctrl/Cmd + S). Open pages update
within a couple of seconds — no refresh needed.

## Images

Use *Choose / upload image* on any image field. Uploads are stored in `uploads/`
and are instantly available everywhere. Existing clinic photos live in `images/`.

## Where the content lives

| File | Contents |
| --- | --- |
| `data/content.json` | all page text, images, backgrounds and button links |
| `data/content.default.json` | the original content (used by *Reset*) |
| `data/content-schema.json` | how the editor groups and labels the fields |
| `data/doctors.json`, `specialties.json`, `services.json` | repeating content blocks |
| `data/sectionCopy.json`, `clinicInfo.json` | section intros and contact details |
| `data/appointments.json` | booking requests |
| `data/passcode.json` | editor passcode |

Back these up by downloading a backup from *Settings & backup*.

## How the pages pick up the content

Each editable element in the HTML carries one of these attributes:

```html
<h1 data-cms="index.t20">…</h1>                  <!-- text -->
<img data-cms-img="index.img3" data-cms-alt="index.img3alt">
<div data-cms-bg="index.bg9"></div>              <!-- background image -->
<a data-cms-href="index.href14">…</a>            <!-- button link -->
```

`js/cms.js` loads the saved values and applies them. If the API cannot be reached,
it falls back to the values cached in your browser, so the site still displays.
