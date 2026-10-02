# Deploy to Vercel + Supabase — step by step

Follow the steps **in order**. Each one lists what you should see if it worked.

---

## What you need first

- A **Supabase** account (<https://supabase.com>) — free
- A **Vercel** account (<https://vercel.com>) — free
- Node.js 18+ installed (you already have it — `node -v` works)

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> → **New project**
2. **Name**: `healing-hands`
3. **Database Password**: invent a strong one, click the eye icon to reveal it,
   and **copy it somewhere safe** (you will need it if you ever have to reset)
4. **Region**: pick **Mumbai (ap-south-1)** if offered — closest to Warangal
5. Click **Create new project**
6. Wait ~1 minute for it to finish setting up

> **You should see:** the project dashboard opens automatically.

---

## Step 2 — Create the database tables

1. In Supabase, click **SQL Editor** in the left sidebar → **+ New query**
2. Open the file `supabase/schema.sql` from this project in a text editor
3. Select **all** of it, copy it
4. Paste into the SQL editor
5. Click **Run** (bottom right)

> **You should see:** `Success. No rows returned` — that is correct and means
> the tables were created. There is nothing to return because you ran DDL, not a query.

**To confirm it worked**, replace the editor contents with this and Run:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

> **You should see:** `appointments`, `documents`, `login_attempts`, `meta`,
> `sessions` (plus Supabase's own internal tables).
>
> If a table is missing, the schema errored — read the red message and fix it before continuing.

---

## Step 3 — Put your keys in `.env`

1. Copy `.env.example` to `.env`
   - Windows PowerShell: `copy .env.example .env`
   - macOS/Linux: `cp .env.example .env`
2. In Supabase go to **Project Settings** (gear icon) → **API**
3. Copy **Project URL** — paste after `SUPABASE_URL=`
4. Scroll to **API Keys**, find the row called **`service_role`**,
   click **Reveal**, copy it — paste after `SUPABASE_SERVICE_ROLE_KEY=`

Your `.env` should look like:

```
SUPABASE_URL=https://abcdefghijklm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

> ⚠️ **`service_role` is a master key** — it bypasses all database security.
> Keep it only in `.env`, never in a file the browser loads, never in a screenshot.
> `.env` is already in `.gitignore` and `.vercelignore`, so it will not be deployed.

---

## Step 4 — Install and seed

```bash
npm install
npm run seed
```

> **You should see:**
> ```
>   Healing Hands — Supabase seed
>   project : https://abcdefghijklm.supabase.co
>   + doctors
>   + specialties
>   ...
>   written 12  ·  skipped 0  ·  failed 0
> ```
>
> **If it says "Cannot read the documents table"** — Step 2 didn't work.
> **If `failed` is above 0** — stop and read the red error before deploying.

This copies all 485 content fields, 71 conditions, the therapies, blog posts,
booking options and any existing appointments into Supabase.

---

## Step 5 — Test everything

```bash
npm test
```

> **You should see:** `40+ passed, 0 failed`
>
> This exercises every API endpoint: public reads, sign-in, protected routes,
> appointment create/edit/delete, content round-trips, backup/restore, and it
> verifies sessions and the brute-force lockout are really stored in the database.

**If you already changed the passcode**, prefix the command:
```bash
HH_TEST_PASSCODE=your-new-passcode npm test
```

> **Do not deploy if this reports any failures.**

---

## Step 6 — Change the admin passcode

There is no default passcode. Set `ADMIN_PASSCODE` in the Vercel environment variables before the first sign-in, then change it in the admin panel.
panel under **Settings & backup** once the site is reachable (Step 9).
Changing it in Supabase before first deploy is not possible — the panel is the
intended route.

---

## Step 7 — Install and sign in to Vercel

```bash
npm install -g vercel
vercel login
```

> **You should see:** a browser window opens, you sign in or create an account,
> then the terminal confirms you are logged in.

---

## Step 8 — Create the project and upload

```bash
vercel
```

Answer the prompts:

| Prompt | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | pick your personal account |
| Link to existing project? | **N** |
| What's the project name? | `healing-hands` (or your name) |
| In which directory? | accept the current one |
| Want to modify these settings? | **N** |

> **You should see:** a preview URL printed, e.g. `https://healing-hands-xxx.vercel.app`
> and a build log showing `✓ Compiled successfully`.

---

## Step 9 — Add the environment variables to Vercel

This is the step people most often forget, and it shows up as
*"Server is not configured"* on the live site.

Either do it on the web:

1. <https://vercel.com> → your project → **Settings** → **Environment Variables**
2. **Add** → Name `SUPABASE_URL`, Value = your Project URL
3. **Add** → Name `SUPABASE_SERVICE_ROLE_KEY`, Value = your service_role key
4. Make sure **both** are applied to **Production, Preview, and Development**
   (tick all three environments)

…or from the terminal:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

> Paste the value when prompted, then re-run the deploy so Vercel picks it up.

---

## Step 10 — Deploy to production

```bash
vercel --prod
```

> **You should see:** `✓ Production: https://your-site.vercel.app`

---

## Step 11 — Verify the live site

Open your production URL and check:

- [ ] Home page loads, images show
- [ ] Nav links work — About, Services, What We Treat, Blog, FAQ, Book Appointment
- [ ] Scroll the home page — the conditions carousel moves
- [ ] Book a test appointment, then confirm it appears in the admin panel
- [ ] Go to `/admin.html` and sign in
- [ ] Edit one therapy name, click **Save**, and confirm the public page updates
- [ ] **Settings & backup** → change the passcode
- [ ] Upload a small image, confirm it appears in the image picker

Run the full automated check against the live site:
```bash
vercel --prod && npm test
```
(if you point the test at the live URL)

---

## Step 12 — After launch

1. **Change the admin passcode** (if not done in Step 11)
2. **Download a backup** from Settings & backup and save it somewhere safe
3. **Custom domain** (optional): Vercel → Settings → Domains → add yours.
   Supabase free allows 500 MB of storage and 5 GB bandwidth per month.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| *"Server is not configured"* | env vars missing on Vercel | Step 9, then redeploy |
| *"Cannot read the documents table"* | schema never ran | Step 2 |
| Site shows default text, not your content | seed never ran | `npm run seed` |
| 404 on a page | route missing | `npm test` checks every URL over real HTTP |
| Images broken | `content.default.json` was excluded from the build | it must ship — see `.vercelignore` |
| Build fails on `scripts/build-image-manifest.js` | `scripts/` was excluded | it is **not** in `.vercelignore`; do not add it |
| 413 on image upload | over Vercel's 4 MB body limit | compress the image |
| Function count error | one file per endpoint exceeds the Hobby limit of 12 | routes live in server.js, not api/ |

---

## Notes

- **Backups still matter.** Use **Settings & backup → download** before big edits.
- **Rotate the `service_role` key** if it ever leaks: Supabase → Project Settings → API.
- **`legacy/` is dead code** — the old Express server. Safe to delete entirely.
- **`data/` is now seed input only** (except the three bundled reference files).
  Editing those JSON files will **not** change the live site; use the admin panel.