import { ENV } from "./env";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] No RESEND_API_KEY configured. Would send email to ${to}: ${subject}`);
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: ENV.emailFrom,
      to,
      subject,
      html,
    });
    if (result.error) {
      console.error("[Email] Resend error:", result.error);
      return false;
    }
    console.log(`[Email] Sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}

export function buildResetEmail(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; background: #0A0E14; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #151B23; border: 1px solid #252B35; border-radius: 8px; padding: 32px;">
    <h1 style="color: #F5B80B; font-size: 20px; margin: 0 0 16px;">Reset your 369Labs password</h1>
    <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      Click the button below to reset your password. This link expires in 1 hour.
    </p>
    <a href="${resetUrl}" style="display: inline-block; background: #F5B80B; color: #0A0E14; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 6px; font-size: 14px;">
      Reset Password
    </a>
    <p style="color: #64748B; font-size: 12px; margin-top: 24px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;
}

export function buildVerificationEmail(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; background: #0A0E14; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #151B23; border: 1px solid #252B35; border-radius: 8px; padding: 32px;">
    <h1 style="color: #F5B80B; font-size: 20px; margin: 0 0 16px;">Verify your email</h1>
    <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      Thanks for signing up! Click the button below to verify your email address.
    </p>
    <a href="${verifyUrl}" style="display: inline-block; background: #F5B80B; color: #0A0E14; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 6px; font-size: 14px;">
      Verify Email
    </a>
    <p style="color: #64748B; font-size: 12px; margin-top: 24px;">
      This link expires in 24 hours.
    </p>
  </div>
</body>
</html>`;
}

export function buildNotificationEmail(title: string, body: string, details?: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; background: #0A0E14; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #151B23; border: 1px solid #252B35; border-radius: 8px; padding: 32px;">
    <h1 style="color: #F5B80B; font-size: 18px; margin: 0 0 12px;">${title}</h1>
    <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">${body}</p>
    ${details ? `<pre style="background: #0A0E14; color: #94A3B8; font-size: 12px; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 0;">${details}</pre>` : ""}
    <p style="color: #64748B; font-size: 11px; margin-top: 20px;">Sent by 369Labs Trading Platform</p>
  </div>
</body>
</html>`;
}
