# Fife College Recording Studio Booking System

Stage 2 is a working Next.js App Router application for the Fife College sound
production department. It supports room booking requests, staff approval, and
microphone/DI equipment requests with conflict checks.

## Stack

- Next.js 16 App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- FullCalendar

## Features

- Email/password authentication through Supabase
- Role-aware dashboard for students, staff, and admins
- Bookable rooms: Studio 1, Studio 2, Edit Suite 1, Edit Suite 2, Edit Suite 3, Dolby Atmos Suite
- Monday to Friday booking window, 9:00am to 5:00pm
- Student booking requests with required planned-task descriptions
- Pending Approval, Approved, Rejected, and Cancelled booking states
- Student edit/cancel for pending requests
- Staff approval, rejection, cancellation, pending dashboard, and staff notes
- Admin room management and user role management
- Frontend and database-level conflict checks
- Responsive day, week, month, and list calendar views
- Fife College branding, logo, metadata title, and colour palette
- Microphone and DI inventory grouped by category
- Student equipment selection with quantities and a no-equipment option
- Backend and database-level equipment availability checks
- Staff equipment approval, amendment, rejection, and notes
- Admin equipment inventory management

## Supabase Setup

1. Create a new Supabase project.
2. Copy the local environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Add these values from Supabase Project Settings > API:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-public-anon-key"
   ```

4. Open the Supabase SQL editor and run the Stage 1 migration first:

   ```sql
   supabase/migrations/20260527110000_stage_1_schema.sql
   ```

   The migration creates `profiles`, `rooms`, `bookings`, `approval_history`, and `staff_notes`, enables row level security, seeds the six rooms, and adds the database conflict-prevention constraint.

5. Run the Stage 2 migration:

   ```sql
   supabase/migrations/20260527123000_stage_2_equipment_inventory.sql
   ```

   This creates `equipment_categories`, `equipment_items`, and
   `booking_equipment`, enables RLS, seeds the microphone/DI inventory, and adds
   database-triggered equipment availability checks. The seed corrects the
   spreadsheet typo `SKG SE300B` to `AKG SE300B`.

6. Run the profile self-insert policy migration:

   ```sql
   supabase/migrations/20260527162000_profile_self_insert_policy.sql
   ```

   This lets the app repair missing profile rows for authenticated users who
   existed before the database trigger was added.

7. Create your first user from the app, then promote that user to admin in Supabase:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'your.email@college.ac.uk';
   ```

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Booking Rules

- New booking requests are always `Pending Approval`.
- Rooms cannot be double-booked when an existing booking is `Pending Approval` or `Approved`.
- Students can only edit or cancel their own pending requests.
- Staff and admins can approve, reject, cancel, and add staff notes.
- Admins can manage rooms and user roles.
- The database rejects weekend bookings and bookings outside 09:00-17:00 Europe/London.
- Students must select required equipment or choose `No equipment required`.
- Equipment attached to overlapping Pending Approval or Approved bookings counts
  as reserved.
- Rejected or Cancelled bookings and rejected/cancelled equipment rows do not
  reserve equipment.
- Equipment requests are rejected when the requested quantity is greater than
  total stock minus overlapping reservations.

## Stage 2 Manual Tests

Branding:

1. Confirm the Fife College logo appears on `/auth`.
2. Confirm the logo appears in the dashboard header.
3. Check desktop and mobile widths for readable navy, blue, teal, lime, white,
   and light grey contrast.

Equipment inventory:

1. Sign in as a student and confirm all equipment categories are visible.
2. Request `1 x Shure SM57`.
3. Try to request more than `5 x Shure SM57`; the UI should clamp/block it.
4. Submit a request with `No equipment required`.
5. Sign in as staff and confirm requested equipment appears in booking details.

Conflict checking:

1. Booking A requests Studio 1 and `5 x Shure SM57` from 10:00-12:00.
2. Booking B requests Studio 2 and `1 x Shure SM57` from 11:00-12:00.
3. Booking B should be blocked or warned because all SM57 microphones are
   reserved during the overlap.
4. Booking C requests Studio 2 and `1 x Shure SM57` from 12:00-13:00.
5. Booking C should be allowed because it does not overlap.
6. Reject or cancel Booking A and confirm the SM57 availability is released.

Approval:

1. Staff approves a booking and its equipment becomes approved.
2. Staff amends a requested equipment quantity before approval.
3. Staff rejects a booking and its equipment no longer counts as reserved.

Regression:

1. Existing room conflict checks still block overlapping same-room bookings.
2. Existing Monday-Friday, 09:00-17:00 rules still reject invalid times.
3. Existing student/staff/admin permissions still apply.

## Vercel Deployment

Before deploying, make sure all three Supabase migrations have been applied in
this order:

1. `supabase/migrations/20260527110000_stage_1_schema.sql`
2. `supabase/migrations/20260527123000_stage_2_equipment_inventory.sql`
3. `supabase/migrations/20260527162000_profile_self_insert_policy.sql`

Recommended GitHub flow:

1. Push the project to GitHub.
2. Create a new Vercel project from the repository.
3. Keep the default framework setting as `Next.js`.
4. Add these environment variables in Vercel Project Settings > Environment Variables for Production, Preview, and Development:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

5. Deploy with the default Next.js settings.
6. In Supabase Authentication > URL Configuration, set the Site URL to the production Vercel URL and add redirect URLs for the deployed app:

   ```text
   https://your-project.vercel.app/**
   https://your-project.vercel.app/auth/callback
   ```

   Keep this local redirect URL while developing:

   ```text
   http://localhost:3000/**
   ```

7. Register or invite test users, then promote staff/admin users in Supabase with:

   ```sql
   update public.profiles
   set role = 'staff'
   where email = 'staff.email@college.ac.uk';

   update public.profiles
   set role = 'admin'
   where email = 'admin.email@college.ac.uk';
   ```

CLI flow if you do not want to push to GitHub yet:

```bash
npx vercel
npx vercel --prod
```

The Vercel CLI will ask you to sign in, link or create a project, and then
print a deployment URL. Add the same Supabase environment variables in the Vercel
dashboard before using the production deployment.

## Stage 2 Notes

- No new environment variables are required beyond the Supabase URL and anon key.
- No Microsoft, SharePoint, Power Apps, Google Calendar, or Google Sheets
  dependencies are used.
- The admin inventory tools cover viewing, filtering, quantity edits,
  active/inactive toggles, notes, new items, and new categories. Existing category
  renaming can still be done in Supabase if needed.
