# BZ Energy Tracker

Software for the whole "BodyZone Electricity and Operational Savings" proposal to CMD Sir. It follows the proposal section by section, and everything is saved date-wise in a database.

| Proposal section | Where it is in the app |
| --- | --- |
| Proposed owners and selection scorecard | Settings: choose Energy Owner and Backup, score Rohit and Meshpal 1 to 5 on the four criteria |
| Where BodyZone can save (7 areas) | Saving areas: status, what was found, action taken, owner, estimated saving for each area |
| Equipment with kW rating and running hours | Equipment: estimated kWh per day, compared with the metered use on the Dashboard |
| 30/60/90-day plan | Plan: 17 tasks with owner, due date, status and notes. Overdue tasks turn red |
| Tracking: meter reading, kWh per member visit, checklist, DG diesel, bill vs last year | Entry (daily), History, Bills, Dashboard |
| Weekly report to CMD Sir | Monday email with usage, KPIs, plan progress, overdue tasks, issues and pending approvals |
| Approvals needed from CMD Sir | CMD approvals: Pending, Approved or Needs changes, with his remark |

**Stack:** Vercel (app and API) + Neon (Postgres database). No installs needed on your computer.

## Roles

| PIN | Who | Can do |
| --- | --- | --- |
| APP_PIN | Rohit, Meshpal | Enter readings (today and last 3 days), see up to 31 days of history, update plan task status and notes, update saving areas, add equipment |
| ADMIN_PIN | Raj / CMD Sir | Everything, including older dates, Dashboard, Bills, CMD approvals, Settings, scorecard, adding or deleting plan tasks, CSV download |

Bills, CMD approvals and the scorecard are visible only to the admin PIN.

## Setup (about 15 minutes)

### Step 1: Database (Neon)
1. Open https://console.neon.tech in Chrome and sign in. Open your project (or click **New Project**, name it `bz-energy`, region Singapore or Mumbai if offered).
2. In the left menu click **SQL Editor**.
3. Open the file `database\schema.sql` from this folder in Notepad. Press **Ctrl+A**, then **Ctrl+C**.
4. Click inside the Neon SQL Editor box, press **Ctrl+V**, then click **Run**. You should see a success message (no red error). If you already ran an older version of `schema.sql`, run this new one again: it only adds the new tables and never deletes your data.
5. Click **Dashboard** in the left menu, then the **Connect** button. Copy the **connection string**. It starts with `postgresql://` and contains your password. Paste it into Notepad for the next steps. Keep it secret and never send it on WhatsApp.

### Step 2: Put the code on GitHub
1. Open https://github.com, sign in, click **+** (top right), then **New repository**. Name: `bz-energy-tracker`. Choose **Private**. Click **Create repository**.
2. On the next page click **uploading an existing file**.
3. Open this folder (`C:\Users\Rajinder\Documents\Electricty saving tracker\bz-energy-tracker`) in File Explorer. Select everything inside it (**Ctrl+A**) and drag it into the GitHub page. Make sure the folders `api`, `public`, `database` and the files `vercel.json`, `package.json` are included.
4. Click **Commit changes**.

### Step 3: Deploy on Vercel
1. Open https://vercel.com, sign in with GitHub. Click **Add New**, then **Project**. Click **Import** next to `bz-energy-tracker`.
2. Framework Preset: choose **Other**. Leave Build Command and Output Directory empty.
3. Open **Environment Variables** and add these one by one (Name, then Value, then Add):

   | Name | Value |
   | --- | --- |
   | DATABASE_URL | the Neon connection string from Step 1 |
   | APP_PIN | a PIN for Rohit and Meshpal, for example 4821 |
   | ADMIN_PIN | a different PIN for you and CMD Sir |

4. Click **Deploy**. After about a minute you get a link such as `https://bz-energy-tracker.vercel.app`.

### Step 4: First use (Day 1 of the plan)
1. Open the link, enter ADMIN_PIN, go to **Settings**. Enter the real meter names (one per line), confirm the staff names, edit the checklist if needed, and set the **Plan start date** to today. Click **Save settings**.
2. Show the **Plan** tab to CMD Sir's team: every task now has a due date. Tasks are owned by "Energy Owner" or "Raj" until you change them.
3. Send the link and APP_PIN to Rohit and Meshpal. On their phones: open in Chrome, tap the three dots, choose **Add to Home screen**.
4. In **Bills**, enter the last 12 months of electricity bills. In **Equipment**, list each machine with its kW and daily hours (ask Rohit and Meshpal to do this in week 1).
5. Test: save one Opening entry, check the **History** tab, then continue with real readings from the next morning.
6. Take the proposal to CMD Sir. After his decisions, update the **CMD approvals** tab and choose the Energy Owner and Backup in Settings.

## Daily routine for staff
- **Opening:** choose name, tap Opening, type each meter reading, tick the checklist, Save.
- **Closing:** same with Closing.
- A day's usage appears after the next morning's Opening reading is saved. The Closing reading splits it into day and night usage, so you can spot power wasted overnight.
- A mistake? Save the same date and shift again. The new values replace the old ones.
- The app refuses a reading lower than the previous one, to catch typing mistakes. If a meter was replaced, the admin can confirm and save anyway.

## Member visits
In the Entry screen there is an optional "Member visits" box. Type that day's face-ID attendance count once per day (either shift). The app then shows units per member visit in History, Dashboard and the weekly email.

## Baseline
After about 30 days, take the average units per day from the Dashboard, type it into **Settings > Baseline**, and the Dashboard and weekly email will show the percentage saved or overspent.

## Optional: Monday email to CMD Sir
1. Create a free account at https://resend.com and make an API key.
2. In Vercel > Settings > Environment Variables add: `RESEND_API_KEY`, `CMD_EMAIL` (comma-separate several), `CRON_SECRET` (any long random text), and `MAIL_FROM`.
3. Resend's test sender (`onboarding@resend.dev`) delivers only to the email you signed up with. To email CMD Sir, verify your company domain in Resend and set `MAIL_FROM` to an address on it.
4. Click **Deployments**, then **Redeploy**. The email goes out every Monday around 9 AM India time.

## Files
- `public/index.html` is the app screen.
- `api/` holds the server code (entry, summary, settings, records for plan/areas/equipment/bills/approvals/scorecard, KPIs, issues, export, weekly email).
- `database/schema.sql` creates the tables and the starting plan, saving areas and approvals. Daily data is stored in `readings`, `checklist`, `issues` and `daily_visits`, each with a date. The `daily_usage` view calculates date-wise units.
- You can view and export raw data any time in Neon > Tables.
