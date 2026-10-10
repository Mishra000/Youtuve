
/**
 * YourTube Email Service
 * Subscription confirmation and login OTP emails.
 * Login OTP uses Resend HTTPS API instead of SMTP.
 */

import nodemailer from "nodemailer";

/**
 * Escape user-provided values before inserting them into HTML.
 */
function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

/**
 * Send Subscription Confirmation & Invoice Email.
 * Existing SMTP behavior is preserved.
 */
export async function sendSubscriptionConfirmationEmail({
  toEmail,
  userName,
  subscriptionPlan,
  billingCycle,
  amount,
  currency,
  paymentDate,
  transactionId,
  razorpayPaymentId,
  invoiceNumber,
  startDate,
  expiryDate,
  nextRenewalDate,
}) {
  const formattedAmount = `${currency === "INR" ? "₹" : currency} ${Number(amount).toLocaleString("en-IN")}`;

  const formatDate = (date) =>
    new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formattedStart = formatDate(startDate);
  const formattedExpiry = formatDate(expiryDate);
  const formattedRenewal = nextRenewalDate
    ? formatDate(nextRenewalDate)
    : "N/A";

  const emailSubject = `YourTube ${subscriptionPlan} Subscription Confirmation (Invoice ${invoiceNumber})`;

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#dc2626;margin:0;font-size:28px;">YourTube</h1>
        <p style="color:#6b7280;font-size:14px;">Payment Receipt &amp; Subscription Confirmation</p>
      </div>

      <div style="background:#f9fafb;border-radius:8px;padding:18px;margin-bottom:24px;">
        <h2 style="color:#111827;font-size:18px;">
          Hello ${escapeEmailHtml(userName || "Valued Subscriber")},
        </h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.5;">
          Thank you for subscribing to
          <strong>YourTube ${escapeEmailHtml(subscriptionPlan)}</strong>!
          Your payment has been successfully processed and verified.
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <tbody>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Invoice Number:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Subscription Plan:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(subscriptionPlan)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Billing Cycle:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(billingCycle)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Amount Paid:</td>
            <td style="padding:10px 0;text-align:right;font-weight:bold;color:#059669;">
              ${escapeEmailHtml(formattedAmount)}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Payment Date:</td>
            <td style="padding:10px 0;text-align:right;">
              ${escapeEmailHtml(new Date(paymentDate).toLocaleString("en-IN"))}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Razorpay Payment ID:</td>
            <td style="padding:10px 0;text-align:right;">
              ${escapeEmailHtml(razorpayPaymentId || transactionId)}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Active From:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(formattedStart)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Valid Until:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(formattedExpiry)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Next Renewal Date:</td>
            <td style="padding:10px 0;text-align:right;">${escapeEmailHtml(formattedRenewal)}</td>
          </tr>
        </tbody>
      </table>

      <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;color:#9ca3af;font-size:12px;">
        <p>Need assistance? Contact support at support@yourtube.com</p>
        <p>This is an automated receipt for YourTube test Razorpay payments.</p>
      </div>
    </div>
  `;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const port = Number(smtpPort || 587);

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"YourTube" <${smtpUser}>`,
        to: toEmail,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log(
        `[Email] Subscription confirmation sent. Message ID: ${info.messageId}`
      );

      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error(
        "[Email] Subscription confirmation failed:",
        err.message
      );

      return { sent: false, error: err.message };
    }
  }

  // Preserve the existing development/test behavior.
  console.log(
    `[Email Service - Test/Dev Mode] Simulated confirmation email for ${toEmail}`
  );
  console.log(`Subject: ${emailSubject}`);
  console.log(
    `Plan: ${subscriptionPlan} | Invoice: ${invoiceNumber} | Amount: ${formattedAmount}`
  );

  return { sent: true, simulated: true };
}

/**
 * Send Security Login OTP Email using Resend HTTPS API.
 * Required environment variables:
 * RESEND_API_KEY
 * EMAIL_FROM (a sender/domain verified in Resend)
 */
export async function sendLoginOtpEmail({
  toEmail,
  userName,
  otpCode,
  browser = "Unknown Browser",
  os = "Unknown OS",
  deviceType = "Desktop",
  ipAddress = "Unknown IP",
  location = "Unknown Location",
  expiryMinutes = 10,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    const error =
      "Email service is not configured: RESEND_API_KEY or EMAIL_FROM is missing.";

    console.error(`[Email] Cannot send login OTP: ${error}`);

    return { sent: false, error };
  }

  const emailSubject = `YourTube Security Verification Code: ${otpCode}`;

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#dc2626;margin:0;font-size:26px;">YourTube Security</h1>
        <p style="color:#4b5563;font-size:14px;">New Login Environment Verification</p>
      </div>

      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
        <h2 style="color:#111827;font-size:16px;">
          Hello ${escapeEmailHtml(userName || "User")},
        </h2>
        <p style="color:#4b5563;font-size:13px;line-height:1.5;">
          We noticed a sign-in attempt from an unrecognized device, browser,
          or location. Use the verification code below to authorize this login.
        </p>
      </div>

      <div style="text-align:center;margin:28px 0;padding:18px;background:#fef2f2;border:1px dashed #f87171;border-radius:10px;">
        <div style="font-size:12px;font-weight:600;color:#991b1b;margin-bottom:6px;">
          YOUR VERIFICATION CODE
        </div>
        <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#dc2626;font-family:monospace;">
          ${escapeEmailHtml(otpCode)}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:6px;">
          Valid for ${Number(expiryMinutes)} minutes. Single use only.
        </div>
      </div>

      <div style="background:#f3f4f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:12px;color:#374151;">
        <div style="font-weight:700;margin-bottom:6px;color:#111827;">Login Details:</div>
        <div><strong>Browser:</strong> ${escapeEmailHtml(browser)}</div>
        <div><strong>Operating System:</strong> ${escapeEmailHtml(os)} (${escapeEmailHtml(deviceType)})</div>
        <div><strong>Location:</strong> ${escapeEmailHtml(location)}</div>
        <div><strong>IP Address:</strong> ${escapeEmailHtml(ipAddress)}</div>
        <div><strong>Time:</strong> ${new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })} IST</div>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding-top:14px;text-align:center;color:#9ca3af;font-size:11px;">
        <p>If you did not initiate this sign-in attempt, change your password and review your account security.</p>
        <p>This is an automated YourTube Security message.</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const error =
        result?.message ||
        result?.name ||
        `Resend API error (${response.status})`;

      console.error(`[Email] Resend failed to send login OTP: ${error}`);

      return { sent: false, error };
    }

    console.log(
      `[Email] Login OTP accepted by Resend. Email ID: ${result.id}`
    );

    return { sent: true, messageId: result.id };
  } catch (err) {
    console.error("[Email] Resend request failed:", err.message);

    return { sent: false, error: err.message };
  }
}