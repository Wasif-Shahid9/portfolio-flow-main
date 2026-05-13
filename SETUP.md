# ScalpBook — Setup Guide

Follow these steps exactly, one time only. After setup the app will just work.

---

## STEP 1 — Create Your Supabase Project

1. Go to **https://supabase.com** and sign up (free)
2. Click **"New Project"**
3. Give it any name (e.g. `scalpbook`)
4. Choose a strong password — save it somewhere
5. Select the region closest to you
6. Wait ~1 minute for the project to spin up

---

## STEP 2 — Run the Database Schema

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Open the file `supabase_schema.sql` from this folder
4. Copy the entire contents and paste it into the SQL Editor
5. Click **"Run"** (or press Ctrl+Enter)
6. You should see "Success" — this creates all tables and adds Wasif + Talha as partners

---

## STEP 3 — Get Your API Keys

1. In Supabase, go to **Settings → API** (in the left sidebar)
2. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`

---

## STEP 4 — Create Your .env File

1. In the `crypto-portfolio` folder, find the file called `.env.example`
2. Make a **copy** of it and rename the copy to `.env`
3. Open `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

4. Save the file

---

## STEP 5 — Install & Run

Open a terminal / command prompt in the `crypto-portfolio` folder and run:

```bash
npm install
npm run dev
```

Then open your browser at **http://localhost:5173**

---

## STEP 6 — Add Initial Investments

The schema already added Wasif and Talha as partners.
Now go to the **Partners** page and add your real investment amounts for each person.

---

## DAILY USE

After setup, just run `npm run dev` from the `crypto-portfolio` folder each time you want to use the app.

---

## ADDING INVESTMENT AMOUNTS MANUALLY (Alternative to Step 6)

If you prefer, open Supabase SQL Editor and run:

```sql
-- Replace XXXX with Wasif's actual investment amount
INSERT INTO ledger (partner_id, type, amount, date, notes)
VALUES (
  (SELECT id FROM partners WHERE name = 'Wasif'),
  'investment', XXXX, CURRENT_DATE, 'Initial investment'
);

-- Replace YYYY with Talha's actual investment amount
INSERT INTO ledger (partner_id, type, amount, date, notes)
VALUES (
  (SELECT id FROM partners WHERE name = 'Talha'),
  'investment', YYYY, CURRENT_DATE, 'Initial investment'
);
```

---

## TROUBLESHOOTING

**"Missing Supabase environment variables"** — Your `.env` file is missing or has wrong values. Check Step 4.

**"Failed to fetch" errors** — Check your Supabase URL and anon key. Make sure they have no extra spaces.

**Blank screen** — Open browser DevTools (F12) → Console tab and check for errors.

**npm install fails** — Make sure Node.js is installed: https://nodejs.org (download LTS version)
