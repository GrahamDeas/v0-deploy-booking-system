import { formatDateTime } from "@/lib/utils";

type EquipmentNotificationItem = {
  name: string;
  quantity: number;
};

type BookingNotificationInput = {
  additionalNotes: string | null;
  bookingId: string;
  courseClass: string;
  description: string;
  endsAt: string;
  equipment: EquipmentNotificationItem[];
  roomName: string;
  startsAt: string;
  studentEmail: string;
  studentName: string;
};

const STAFF_BOOKING_NOTIFICATION_RECIPIENTS = [
  "grahamdeas@fife.ac.uk",
  "neilbethune@fife.ac.uk",
  "traviswhalley@fife.ac.uk",
  "billthaw@fife.ac.uk"
] as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEquipmentText(equipment: EquipmentNotificationItem[]) {
  if (equipment.length === 0) {
    return "No equipment required";
  }

  return equipment.map((item) => `${item.quantity} x ${item.name}`).join(", ");
}

function buildBookingNotificationEmail(input: BookingNotificationInput) {
  const subject = `New studio booking request: ${input.roomName}`;
  const equipmentText = formatEquipmentText(input.equipment);
  const plainText = [
    "A new studio booking request has been submitted.",
    "",
    `Student: ${input.studentName}`,
    `Email: ${input.studentEmail}`,
    `Course / class: ${input.courseClass}`,
    `Room: ${input.roomName}`,
    `Starts: ${formatDateTime(input.startsAt)}`,
    `Ends: ${formatDateTime(input.endsAt)}`,
    "",
    "Description of planned tasks:",
    input.description,
    "",
    "Additional notes:",
    input.additionalNotes || "None",
    "",
    "Equipment required:",
    equipmentText,
    "",
    `Booking ID: ${input.bookingId}`
  ].join("\n");

  const equipmentHtml =
    input.equipment.length === 0
      ? "<p>No equipment required</p>"
      : `<ul>${input.equipment
          .map(
            (item) =>
              `<li>${item.quantity} x ${escapeHtml(item.name)}</li>`
          )
          .join("")}</ul>`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0b2f5f; line-height: 1.5;">
      <h1 style="font-size: 20px;">New studio booking request</h1>
      <p>A new studio booking request has been submitted and is waiting for review.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tbody>
          <tr><td><strong>Student</strong></td><td>${escapeHtml(input.studentName)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(input.studentEmail)}</td></tr>
          <tr><td><strong>Course / class</strong></td><td>${escapeHtml(input.courseClass)}</td></tr>
          <tr><td><strong>Room</strong></td><td>${escapeHtml(input.roomName)}</td></tr>
          <tr><td><strong>Starts</strong></td><td>${escapeHtml(formatDateTime(input.startsAt))}</td></tr>
          <tr><td><strong>Ends</strong></td><td>${escapeHtml(formatDateTime(input.endsAt))}</td></tr>
        </tbody>
      </table>
      <h2 style="font-size: 16px;">Description of planned tasks</h2>
      <p>${escapeHtml(input.description).replaceAll("\n", "<br />")}</p>
      <h2 style="font-size: 16px;">Additional notes</h2>
      <p>${escapeHtml(input.additionalNotes || "None").replaceAll("\n", "<br />")}</p>
      <h2 style="font-size: 16px;">Equipment required</h2>
      ${equipmentHtml}
      <p style="font-size: 12px; color: #64748b;">Booking ID: ${escapeHtml(input.bookingId)}</p>
    </div>
  `;

  return { html, plainText, subject };
}

export function hasBookingNotificationEmailConfig() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendBookingRequestNotification(
  input: BookingNotificationInput
) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { ok: false, skipped: true };
  }

  const from =
    process.env.BOOKING_NOTIFICATION_FROM ||
    "Studio Booking System <onboarding@resend.dev>";
  const { html, plainText, subject } = buildBookingNotificationEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html,
      subject,
      text: plainText,
      to: STAFF_BOOKING_NOTIFICATION_RECIPIENTS
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `booking-request-${input.bookingId}`
    },
    method: "POST"
  });

  if (!response.ok) {
    const details = await response.text();

    return {
      ok: false,
      skipped: false,
      error: details || "Resend rejected the notification email."
    };
  }

  return { ok: true, skipped: false };
}
