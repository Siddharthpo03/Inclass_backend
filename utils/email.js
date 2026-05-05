const nodemailer = require("nodemailer");
const logger = require("./logger");

const GMAIL_USER = process.env.EMAIL_USER || "";
const GMAIL_APP_PASSWORD = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

function buildOtpEmailMessage({ name, otp, expiresInMinutes }) {
  const displayName = name || "Student";
  const expiryText = `${expiresInMinutes} minutes`;

  return {
    subject: "Your InClass verification code",
    text: [
      `Hello ${displayName},`,
      "",
      `Your InClass verification code is: ${otp}`,
      `This code expires in ${expiryText}.`,
      "",
      "Do not share this code with anyone.",
      "If you did not request this code, please ignore this email.",
      "",
      "Regards,",
      "InClass Team",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f7fafc; padding: 24px; color: #1f2937;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
          <div style="background: linear-gradient(135deg, #0ea5e9, #2563eb); padding: 24px; color: #ffffff;">
            <div style="font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">InClass</div>
            <h1 style="margin: 8px 0 0; font-size: 24px; line-height: 1.2;">Verify your email address</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="margin: 0 0 16px; font-size: 16px;">Hello ${displayName},</p>
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #4b5563;">
              Use the verification code below to continue with your InClass account setup.
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <div style="display: inline-block; padding: 16px 28px; border-radius: 14px; background: #eff6ff; border: 1px solid #bfdbfe; font-size: 32px; font-weight: 700; letter-spacing: 0.18em; color: #1d4ed8;">
                ${otp}
              </div>
            </div>
            <p style="margin: 0 0 12px; font-size: 14px; color: #374151;"><strong>Expires in:</strong> ${expiryText}</p>
            <p style="margin: 0; font-size: 14px; color: #b91c1c;"><strong>Warning:</strong> Never share this code with anyone.</p>
          </div>
        </div>
      </div>
    `,
  };
}

async function sendOtpEmail({ to, name, otp, expiresInMinutes = 10 }) {
  const mailTransporter = getTransporter();

  if (!mailTransporter) {
    return {
      success: false,
      error:
        "Gmail SMTP is not configured. Please set EMAIL_USER and EMAIL_PASS in .env.",
    };
  }

  if (!to || !otp) {
    return {
      success: false,
      error: "Recipient email and OTP are required.",
    };
  }

  try {
    const { subject, text, html } = buildOtpEmailMessage({
      name,
      otp,
      expiresInMinutes,
    });

    const info = await mailTransporter.sendMail({
      from: `InClass <${GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    logger.info("OTP email sent successfully", {
      to,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logger.error("Failed to send OTP email: " + (error.message || error));
    return {
      success: false,
      error: error.message || "Failed to send OTP email.",
    };
  }
}

module.exports = {
  sendOtpEmail,
};
