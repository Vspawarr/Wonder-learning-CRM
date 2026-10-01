// Outgoing email over SMTP (e.g. Google Workspace/Gmail with an app password,
// or any provider's SMTP). Email features stay switched off until these are set:
// SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, MAIL_FROM.
import nodemailer from "nodemailer";

export const isEmailConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);

export async function sendMail(msg: {
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  if (!isEmailConfigured()) throw new Error("Email is not set up.");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, ...msg });
}
