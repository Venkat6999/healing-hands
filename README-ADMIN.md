# Healing Hands — Admin Panel

## Getting in

Open **`admin.html`** (there's also a small "Admin" link in the footer of every page).

Default passcode: **`healinghands2026`**
Change it straight away under **Settings → Admin passcode**.

## What you can manage

**Appointments** — every booking submitted through the site appears here with the
patient's name, mobile, email, city, treatment, concern, and requested date/slot.
You can set a status (New → Confirmed → Completed / Cancelled), add an internal note,
call or WhatsApp the patient directly from the row, filter by status or date, search,
export to CSV for Excel, and print.

**Doctors** — edit name, qualifications, role, bio and photo. There are separate
role/bio fields for the homepage and the About page, because the two pages show
slightly different text. You can add doctors, reorder them, hide one temporarily
with the "Show on site" checkbox, or delete them.

**Homepage Section** — this is the "Find the right physiotherapy for you" block.
Edit the tag, heading and intro paragraph, and manage the sliding cards
(title, photo, alt text, order, visibility).

**Services** — the cards on the Services page: name, description, icon, order
and visibility, plus the section heading above them.

**Clinic Info** — phone number, WhatsApp number, address, and opening hours.
This information is displayed on every page of the site.

Photos can be typed in as a path (`images/doctor-name.jpeg`) or uploaded. Uploads are
automatically scaled down to 800px and compressed, so they don't blow past the
browser's storage limit.

## Where the data lives

All data is stored on the **Node.js backend** as JSON flat files in the `data/`
directory. The backend runs a REST API that the admin panel and public pages use
to read and write content.

Key data files:
- `data/doctors.json` — doctor records
- `data/specialties.json` — specialty cards
- `data/services.json` — service cards
- `data/sectionCopy.json` — section headings and intro text
- `data/clinicInfo.json` — phone, address, hours
- `data/appointments.json` — patient bookings
- `data/passcode.json` — admin passcode

The server polls for changes every 2 seconds and re-renders content automatically,
so edits appear in real time across devices.

**Use Settings → Download backup regularly.** It saves all content and appointments
as a JSON file you can restore later.

The passcode gate is a convenience, not security — anyone who views the page source
can see how it works. Don't treat `admin.html` as protected.

## Running the server

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` by default (or the `PORT` environment
variable).

## Files

```
server.js              Node.js/Express backend (REST API + static files)
admin.html             the admin panel
css/admin.css          admin styles
js/admin.js            admin logic
js/site-data.js        shared data layer + public page renderers
data/                  JSON flat-file database (created automatically)
uploads/               uploaded images (created automatically)
README-ADMIN.md        this file
```

If JavaScript is off, the original hard-coded content still shows — the renderers
only replace it when they run.
