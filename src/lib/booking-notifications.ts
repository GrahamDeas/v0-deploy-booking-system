import { randomUUID } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";

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

type SmtpConfig = {
  host: string;
  pass: string;
  port: number;
  secure: boolean;
  user: string;
};

type SmtpResponse = {
  code: number;
  lines: string[];
  text: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

const STAFF_BOOKING_NOTIFICATION_RECIPIENTS = [
  "grahamdeas@fife.ac.uk",
  "neilbethune@fife.ac.uk",
  "traviswhalley@fife.ac.uk",
  "billthaw@fife.ac.uk"
] as const;

const DEFAULT_BOOKING_NOTIFICATION_SENDER =
  "RecordingStudioBookings@fife.ac.uk";

function getBookingNotificationRecipients() {
  const configuredRecipients = process.env.BOOKING_NOTIFICATION_RECIPIENTS;

  if (!configuredRecipients) {
    return [...STAFF_BOOKING_NOTIFICATION_RECIPIENTS];
  }

  return configuredRecipients
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function getSmtpConfig(): SmtpConfig | null {
  const user = (
    process.env.SMTP_USER ||
    process.env.GMAIL_USER ||
    DEFAULT_BOOKING_NOTIFICATION_SENDER
  ).trim();
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  const defaultHost = user.toLowerCase().endsWith("@fife.ac.uk")
    ? "smtp.office365.com"
    : "smtp.gmail.com";
  const host = (process.env.SMTP_HOST || defaultHost).trim();
  const defaultPort = host.toLowerCase().includes("office365") ? 587 : 465;
  const port = Number(process.env.SMTP_PORT || defaultPort);
  const resolvedPort = Number.isFinite(port) ? port : defaultPort;
  const defaultSecure =
    !host.toLowerCase().includes("office365") && resolvedPort !== 587;

  return {
    host,
    port: resolvedPort,
    secure:
      process.env.SMTP_SECURE === undefined
        ? defaultSecure
        : process.env.SMTP_SECURE.toLowerCase() !== "false",
    user,
    pass: pass.replace(/[\s"']/g, "")
  };
}

function encodeBase64Lines(value: string) {
  const base64 = Buffer.from(value, "utf8").toString("base64");

  return base64.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodeHeader(value: string) {
  const sanitized = sanitizeHeader(value);

  if (/^[\x20-\x7e]*$/.test(sanitized)) {
    return sanitized;
  }

  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^<>]+)>/);

  return sanitizeHeader(match?.[1] ?? value);
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function dotEscape(value: string) {
  return value
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildSmtpMessage({
  from,
  html,
  input,
  plainText,
  recipients,
  subject
}: {
  from: string;
  html: string;
  input: BookingNotificationInput;
  plainText: string;
  recipients: string[];
  subject: string;
}) {
  const boundary = `booking-${randomUUID()}`;
  const headers = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${recipients.map(sanitizeHeader).join(", ")}`,
    `Reply-To: ${sanitizeHeader(input.studentEmail)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Message-ID: <booking-${input.bookingId}@studio-booking.local>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];

  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(plainText),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(html),
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

function openSecureSmtpSocket(smtp: SmtpConfig) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({
      host: smtp.host,
      port: smtp.port,
      servername: smtp.host
    });

    socket.setTimeout(20_000);
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    });
  });
}

function openPlainSmtpSocket(smtp: SmtpConfig) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({
      host: smtp.host,
      port: smtp.port
    });

    socket.setTimeout(20_000);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    });
  });
}

function upgradeSmtpSocketToTls(socket: net.Socket, smtp: SmtpConfig) {
  socket.removeAllListeners("data");
  socket.removeAllListeners("error");
  socket.removeAllListeners("timeout");

  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      servername: smtp.host,
      socket
    });

    secureSocket.setTimeout(20_000);
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
    secureSocket.once("timeout", () => {
      secureSocket.destroy();
      reject(new Error("SMTP STARTTLS connection timed out."));
    });
  });
}

function createSmtpReader(socket: SmtpSocket) {
  let buffer = "";
  let currentLines: string[] = [];
  const queuedResponses: SmtpResponse[] = [];
  let pending:
    | {
        reject: (error: Error) => void;
        resolve: (response: SmtpResponse) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | null = null;

  function finishResponse(response: SmtpResponse) {
    if (pending) {
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = null;
      resolve(response);
      return;
    }

    queuedResponses.push(response);
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
      buffer = buffer.slice(lineEnd + 1);

      if (/^\d{3}[ -]/.test(line)) {
        currentLines.push(line);

        if (line[3] === " ") {
          const code = Number(line.slice(0, 3));
          finishResponse({
            code,
            lines: currentLines,
            text: currentLines.join("\n")
          });
          currentLines = [];
        }
      }

      lineEnd = buffer.indexOf("\n");
    }
  });

  socket.on("error", (error) => {
    if (pending) {
      clearTimeout(pending.timer);
      const { reject } = pending;
      pending = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  return {
    readResponse() {
      const response = queuedResponses.shift();

      if (response) {
        return Promise.resolve(response);
      }

      return new Promise<SmtpResponse>((resolve, reject) => {
        pending = {
          reject,
          resolve,
          timer: setTimeout(() => {
            pending = null;
            reject(new Error("SMTP server response timed out."));
          }, 20_000)
        };
      });
    }
  };
}

async function expectSmtpResponse(
  response: SmtpResponse,
  expectedCodes: number[]
) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP ${response.code}: ${response.text}`);
  }
}

async function sendSmtpCommand({
  command,
  expectedCodes,
  reader,
  socket
}: {
  command: string;
  expectedCodes: number[];
  reader: ReturnType<typeof createSmtpReader>;
  socket: SmtpSocket;
}) {
  socket.write(`${command}\r\n`);
  await expectSmtpResponse(await reader.readResponse(), expectedCodes);
}

async function openPreparedSmtpConnection(smtp: SmtpConfig) {
  if (smtp.secure) {
    const socket = await openSecureSmtpSocket(smtp);
    const reader = createSmtpReader(socket);

    await expectSmtpResponse(await reader.readResponse(), [220]);
    await sendSmtpCommand({
      command: "EHLO studio-booking.local",
      expectedCodes: [250],
      reader,
      socket
    });

    return { reader, socket };
  }

  const plainSocket = await openPlainSmtpSocket(smtp);
  const plainReader = createSmtpReader(plainSocket);

  await expectSmtpResponse(await plainReader.readResponse(), [220]);
  await sendSmtpCommand({
    command: "EHLO studio-booking.local",
    expectedCodes: [250],
    reader: plainReader,
    socket: plainSocket
  });
  await sendSmtpCommand({
    command: "STARTTLS",
    expectedCodes: [220],
    reader: plainReader,
    socket: plainSocket
  });

  const socket = await upgradeSmtpSocketToTls(plainSocket, smtp);
  const reader = createSmtpReader(socket);

  await sendSmtpCommand({
    command: "EHLO studio-booking.local",
    expectedCodes: [250],
    reader,
    socket
  });

  return { reader, socket };
}

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
  return Boolean(getSmtpConfig() || process.env.RESEND_API_KEY);
}

export function explainBookingNotificationError(error: string | undefined) {
  if (!error) {
    return "The booking was saved, but the staff notification email could not be sent.";
  }

  if (
    error.includes("You can only send testing emails") ||
    error.includes("verify a domain")
  ) {
    return (
      "The booking was saved, but staff email notifications are blocked in Resend testing mode. " +
      "Verify a sending domain in Resend, then update BOOKING_NOTIFICATION_FROM to use that domain."
    );
  }

  if (
    error.includes("Invalid login") ||
    error.includes("Username and Password not accepted") ||
    error.includes("535-5.7.8") ||
    error.includes("5.7.57") ||
    error.includes("Client not authenticated")
  ) {
    return (
      "The booking was saved, but the notification mailbox rejected the email login. " +
      "Check the password for RecordingStudioBookings@fife.ac.uk and ask Fife IT to enable authenticated SMTP for that mailbox."
    );
  }

  return "The booking was saved, but the staff notification email could not be sent.";
}

async function sendWithSmtp({
  html,
  input,
  plainText,
  recipients,
  subject
}: {
  html: string;
  input: BookingNotificationInput;
  plainText: string;
  recipients: string[];
  subject: string;
}) {
  const smtp = getSmtpConfig();

  if (!smtp) {
    return { ok: false, skipped: true };
  }

  const from = `Studio Booking System <${smtp.user}>`;
  const fromAddress = extractEmailAddress(from);
  const message = buildSmtpMessage({
    from,
    html,
    input,
    plainText,
    recipients,
    subject
  });

  try {
    const { reader, socket } = await openPreparedSmtpConnection(smtp);

    try {
      await sendSmtpCommand({
        command: "AUTH LOGIN",
        expectedCodes: [334],
        reader,
        socket
      });
      await sendSmtpCommand({
        command: Buffer.from(smtp.user, "utf8").toString("base64"),
        expectedCodes: [334],
        reader,
        socket
      });
      await sendSmtpCommand({
        command: Buffer.from(smtp.pass, "utf8").toString("base64"),
        expectedCodes: [235],
        reader,
        socket
      });
      await sendSmtpCommand({
        command: `MAIL FROM:<${fromAddress}>`,
        expectedCodes: [250],
        reader,
        socket
      });

      for (const recipient of recipients) {
        await sendSmtpCommand({
          command: `RCPT TO:<${extractEmailAddress(recipient)}>` ,
          expectedCodes: [250, 251],
          reader,
          socket
        });
      }

      await sendSmtpCommand({
        command: "DATA",
        expectedCodes: [354],
        reader,
        socket
      });
      socket.write(`${dotEscape(message)}\r\n.\r\n`);
      await expectSmtpResponse(await reader.readResponse(), [250]);
      socket.write("QUIT\r\n");
    } finally {
      socket.end();
    }
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error:
        error instanceof Error
          ? error.message
          : "The notification mailbox rejected the email."
    };
  }

  return { ok: true, skipped: false };
}

async function sendWithResend({
  html,
  input,
  plainText,
  recipients,
  subject
}: {
  html: string;
  input: BookingNotificationInput;
  plainText: string;
  recipients: string[];
  subject: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { ok: false, skipped: true };
  }

  const from =
    process.env.BOOKING_NOTIFICATION_FROM ||
    "Studio Booking System <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html,
      subject,
      text: plainText,
      to: recipients
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

export async function sendBookingRequestNotification(
  input: BookingNotificationInput
) {
  const { html, plainText, subject } = buildBookingNotificationEmail(input);
  const recipients = getBookingNotificationRecipients();

  if (recipients.length === 0) {
    return {
      ok: false,
      skipped: false,
      error: "No booking notification recipients are configured."
    };
  }

  if (getSmtpConfig()) {
    return sendWithSmtp({
      html,
      input,
      plainText,
      recipients,
      subject
    });
  }

  return sendWithResend({
    html,
    input,
    plainText,
    recipients,
    subject
  });
}
