import nodemailer from "nodemailer";

/**
 * Send Subscription Confirmation & Invoice Email
 * Gracefully logs if SMTP credentials are not configured in test environments.
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
  const formattedAmount = `${currency === "INR" ? "₹" : currency} ${amount.toLocaleString()}`;
  const formattedStart = new Date(startDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedExpiry = new Date(expiryDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedRenewal = nextRenewalDate
    ? new Date(nextRenewalDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  const emailSubject = `YourTube ${subscriptionPlan} Subscription Confirmation (Invoice ${invoiceNumber})`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #dc2626; margin: 0; font-size: 28px; font-weight: 800;">YourTube</h1>
        <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">Payment Receipt & Subscription Confirmation</p>
      </div>

      <div style="background-color: #f9fafb; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px;">Hello ${userName || "Valued Subscriber"},</h2>
        <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
          Thank you for subscribing to <strong>YourTube ${subscriptionPlan}</strong>! Your payment has been successfully processed and verified.
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <tbody>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Invoice Number:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #111827;">${invoiceNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Subscription Plan:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #dc2626;">${subscriptionPlan}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Billing Cycle:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #111827;">${billingCycle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Amount Paid:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #059669; font-size: 16px;">${formattedAmount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Payment Date:</td>
            <td style="padding: 10px 0; text-align: right; color: #111827;">${new Date(paymentDate).toLocaleString("en-IN")}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Razorpay Payment ID:</td>
            <td style="padding: 10px 0; text-align: right; font-family: monospace; color: #374151;">${razorpayPaymentId || transactionId}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Active From:</td>
            <td style="padding: 10px 0; text-align: right; color: #111827;">${formattedStart}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280;">Valid Until:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #111827;">${formattedExpiry}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280;">Next Renewal Date:</td>
            <td style="padding: 10px 0; text-align: right; color: #111827;">${formattedRenewal}</td>
          </tr>
        </tbody>
      </table>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
        <p style="margin: 0 0 6px 0;">Need assistance? Contact support at <strong>support@yourtube.com</strong></p>
        <p style="margin: 0;">This is an automated transaction receipt for YourTube Test Razorpay Payments.</p>
      </div>
    </div>
  `;

  // Check if SMTP is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || "587", 10),
        secure: smtpPort === "465",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"YourTube" <billing@yourtube.com>`,
        to: toEmail,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log(`[Email] Subscription confirmation email sent to ${toEmail}: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.warn(`[Email] Failed to send email via SMTP to ${toEmail}:`, err.message);
      return { sent: false, error: err.message };
    }
  } else {
    // Graceful audit logging in test mode
    console.log(`[Email Service - Test/Dev Mode] Simulated confirmation email for ${toEmail}:`);
    console.log(`  Subject: ${emailSubject}`);
    console.log(`  Plan: ${subscriptionPlan} | Invoice: ${invoiceNumber} | Amount: ${formattedAmount}`);
    return { sent: true, simulated: true };
  }
}

/**
 * Send Security Login OTP Verification Email
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
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #dc2626; margin: 0; font-size: 26px; font-weight: 800;">YourTube Security</h1>
        <p style="color: #4b5563; margin: 4px 0 0 0; font-size: 14px;">New Login Environment Verification</p>
      </div>

      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 16px;">Hello ${userName || "User"},</h2>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.5;">
          We noticed a sign-in attempt to your YourTube account from an unrecognized device, browser, or location. Please use the verification code below to authorize this login.
        </p>
      </div>

      <div style="text-align: center; margin: 28px 0; padding: 18px; background-color: #fef2f2; border: 1px dashed #f87171; border-radius: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your Verification Code</div>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #dc2626; font-family: monospace;">${otpCode}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 6px;">Valid for ${expiryMinutes} minutes. Single use only.</div>
      </div>

      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #374151;">
        <div style="font-weight: 700; margin-bottom: 6px; color: #111827;">Login Details:</div>
        <div style="margin-bottom: 3px;"><strong>Browser:</strong> ${browser}</div>
        <div style="margin-bottom: 3px;"><strong>Operating System:</strong> ${os} (${deviceType})</div>
        <div style="margin-bottom: 3px;"><strong>Location:</strong> ${location}</div>
        <div style="margin-bottom: 3px;"><strong>IP Address:</strong> ${ipAddress}</div>
        <div><strong>Time:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center; color: #9ca3af; font-size: 11px;">
        <p style="margin: 0 0 4px 0;">If you did not initiate this sign-in attempt, please change your password and revoke untrusted devices immediately.</p>
        <p style="margin: 0;">This is an automated security message from YourTube Security System.</p>
      </div>
    </div>
  `;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const smtpConfig = { SMTP_HOST: smtpHost, SMTP_USER: smtpUser, SMTP_PASS: smtpPass };
  const missingConfig = Object.entries(smtpConfig)
    .filter(([, value]) =>
      !value || /^(your[_@-]|replace_with|example|placeholder)/i.test(value.trim())
    )
    .map(([name]) => name);

  if (missingConfig.length > 0) {
    const error = `SMTP is not configured: ${missingConfig.join(", ")}`;
    console.error(`[Email] Cannot send login OTP to ${toEmail}: ${error}`);
    return { sent: false, error };
  }

  const port = Number(smtpPort || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = "SMTP_PORT must be a valid port number";
    console.error(`[Email] Cannot send login OTP to ${toEmail}: ${error}`);
    return { sent: false, error };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"YourTube Security" <${smtpUser}>`,
      to: toEmail,
      subject: emailSubject,
      html: emailHtml,
    });

    console.log(`[Email] Login OTP sent to ${toEmail}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[Email] Failed to send OTP to ${toEmail}:`, err.message);
    return { sent: false, error: err.message };
  }
}
