/**
 * YourTube Email Service
 * Uses the Resend HTTPS API for reliable transactional email delivery on Render.
 * Outbound SMTP (ports 25, 465, 587) is completely avoided.
 */

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
 * Resolve a valid sender address for Resend.
 * Resend rejects unverified sender domains like @gmail.com or @yahoo.com.
 * When an unverified or public mailbox domain is detected, we safely fallback
 * to Resend's default verified sandbox domain: onboarding@resend.dev.
 */
export function getEmailSender(prefix = "YourTube") {
  const configuredFrom = process.env.EMAIL_FROM?.trim();

  if (!configuredFrom) {
    return `${prefix} <onboarding@resend.dev>`;
  }

  // If someone specified an unverified public mailbox (e.g. @gmail.com)
  if (/@(gmail|yahoo|outlook|hotmail|icloud)\.com/i.test(configuredFrom)) {
    console.warn(
      `[Email] Configured EMAIL_FROM (${configuredFrom}) uses a public webmail domain that Resend will reject. Using '${prefix} <onboarding@resend.dev>' instead.`
    );
    return `${prefix} <onboarding@resend.dev>`;
  }

  return configuredFrom;
}

/**
 * Helper to dispatch an email via Resend HTTPS API
 */
async function sendViaResend({ to, subject, html, fromPrefix = "YourTube" }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = getEmailSender(fromPrefix);

  if (!apiKey) {
    const errorMsg = "RESEND_API_KEY environment variable is not configured.";
    console.error(`[Email] Cannot send email: ${errorMsg}`);
    return { sent: false, error: errorMsg };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const errorDetail =
        result?.message ||
        result?.name ||
        `Resend API error (HTTP ${response.status})`;
      console.error(`[Email] Resend API rejected message: ${errorDetail}`);
      return { sent: false, error: errorDetail };
    }

    console.log(`[Email] Email accepted by Resend. Email ID: ${result.id}`);
    return { sent: true, messageId: result.id };
  } catch (err) {
    console.error(`[Email] HTTPS request to Resend failed:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send Subscription Confirmation & Invoice Email via Resend HTTPS API.
 * Completely replaces legacy SMTP to avoid port 25/465/587 connection timeouts on Render.
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
        <p>This is an automated receipt for YourTube payments.</p>
      </div>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({
      to: toEmail,
      subject: emailSubject,
      html: emailHtml,
      fromPrefix: "YourTube Billing",
    });
  }

  // Development/fallback logging if no RESEND_API_KEY is configured
  console.log(
    `[Email Service - Dev Mode] Simulated confirmation email for ${toEmail}`
  );
  console.log(`Subject: ${emailSubject}`);
  console.log(
    `Plan: ${subscriptionPlan} | Invoice: ${invoiceNumber} | Amount: ${formattedAmount}`
  );

  return { sent: true, simulated: true };
}

/**
 * Send Security Login OTP Email using Resend HTTPS API.
 * Keeps the existing function signature fully compatible with auth.js.
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
        <p>If you did not initiate this sign-in attempt, review your account security immediately.</p>
        <p>This is an automated YourTube Security message.</p>
      </div>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({
      to: toEmail,
      subject: emailSubject,
      html: emailHtml,
      fromPrefix: "YourTube Security",
    });
  }

  // Development mode fallback when running locally without RESEND_API_KEY
  if (process.env.NODE_ENV === "development") {
    console.log(`[Email Service - Dev Mode] Simulated Login OTP for ${toEmail}: ${otpCode}`);
    return { sent: true, simulated: true };
  }

  const error = "Email service is not configured: RESEND_API_KEY is missing on server.";
  console.error(`[Email] Cannot send login OTP: ${error}`);
  return { sent: false, error };
}