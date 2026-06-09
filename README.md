# Fife College Recording Studio Booking System

A Next.js booking system for the Fife College Sound Production Department. The app supports student booking requests, staff approval, equipment requests, and admin inventory management.

## Email Notifications

Booking request email notifications can use the Fife College Microsoft 365 mailbox first, then fall back to Resend when SMTP is not configured.

Vercel environment variables:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
RESEND_API_KEY
BOOKING_NOTIFICATION_FROM
BOOKING_NOTIFICATION_RECIPIENTS
```

For the College mailbox, use:

```text
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="RecordingStudioBookings@fife.ac.uk"
SMTP_PASSWORD="the mailbox password or app password"
BOOKING_NOTIFICATION_RECIPIENTS="grahamdeas@fife.ac.uk,neilbethune@fife.ac.uk,traviswhalley@fife.ac.uk,billthaw@fife.ac.uk"
```

If `SMTP_USER`, `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` are omitted, the app defaults to `RecordingStudioBookings@fife.ac.uk` over Microsoft 365 and only needs `SMTP_PASSWORD`.

Microsoft 365 may require Fife IT to enable authenticated SMTP for `RecordingStudioBookings@fife.ac.uk`. Resend still requires `BOOKING_NOTIFICATION_FROM` to use a verified sending domain before emails can be sent to the Fife College staff addresses.

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local` and add the Supabase and email values.
3. Run the Supabase migrations.
4. Start the Next.js development server.

## User Rules

- All registered users must use an `@fife.ac.uk` email address.
- Staff/admin access is limited to the approved staff email allowlist in `src/lib/user-rules.ts`.
