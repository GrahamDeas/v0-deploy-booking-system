# Fife College Recording Studio Booking System

A Next.js booking system for the Fife College Sound Production Department. The app supports student booking requests, staff approval, equipment requests, and admin inventory management.

## Email Notifications

Booking request email notifications use Resend.

Vercel environment variables:

```text
RESEND_API_KEY
BOOKING_NOTIFICATION_FROM
BOOKING_NOTIFICATION_RECIPIENTS
```

`BOOKING_NOTIFICATION_FROM` must use a verified sending domain in Resend before emails can be sent to the Fife College staff addresses. Resend's testing sender, `onboarding@resend.dev`, can only email the Resend account owner.

Example:

```text
BOOKING_NOTIFICATION_FROM="Studio Booking System <bookings@your-verified-domain.example>"
BOOKING_NOTIFICATION_RECIPIENTS="grahamdeas@fife.ac.uk,neilbethune@fife.ac.uk,traviswhalley@fife.ac.uk,billthaw@fife.ac.uk"
```

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local` and add the Supabase and Resend values.
3. Run the Supabase migrations.
4. Start the Next.js development server.

## User Rules

- All registered users must use an `@fife.ac.uk` email address.
- Staff/admin access is limited to the approved staff email allowlist in `src/lib/user-rules.ts`.
