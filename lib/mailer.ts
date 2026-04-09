// lib/mailer.ts
// Nodemailer transport configured for Gmail.
// Uses an App Password — NOT your real Gmail password.
//
// Setup (one-time):
//   1. Go to myaccount.google.com → Security → 2-Step Verification → App passwords
//   2. Create an app password for "PriceHound"
//   3. Add to .env.local:
//      GMAIL_USER=yourapp@gmail.com
//      GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

import nodemailer from "nodemailer";

// Lazily create the transporter so it doesn't error at import time
// if env vars aren't set yet (e.g. during build).
let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local"
    );
  }

  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  return _transporter;
}

// ── Send a price-drop alert ───────────────────────────────────
export interface PriceAlertPayload {
  to:           string;   // recipient email
  productName:  string;
  productUrl:   string;
  currentPrice: number;
  targetPrice:  number;
}

export async function sendPriceAlert(payload: PriceAlertPayload): Promise<void> {
  const { to, productName, productUrl, currentPrice, targetPrice } = payload;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const saving    = targetPrice - currentPrice;
  const savingPct = Math.round((saving / targetPrice) * 100);

  const transporter = getTransporter();

  await transporter.sendMail({
    from:    `"PriceHound 🐕" <${process.env.GMAIL_USER}>`,
    to,
    subject: `🎯 Price drop! ${productName} is now ${fmt(currentPrice)}`,
    text: `
Hey there!

Great news — a product you're tracking just hit your target price.

Product:       ${productName}
Current price: ${fmt(currentPrice)}
Your target:   ${fmt(targetPrice)}
You save:      ${fmt(Math.abs(saving))} (${savingPct}%)

👉 Buy now: ${productUrl}

Happy hunting,
PriceHound

---
You're receiving this because you added this product to your PriceHound dashboard.
To stop alerts for this product, log in and pause or delete it.
    `.trim(),
    html: buildEmailHtml({ productName, productUrl, currentPrice, targetPrice, fmt }),
  });
}

// ── HTML email template ───────────────────────────────────────
function buildEmailHtml({
  productName,
  productUrl,
  currentPrice,
  targetPrice,
  fmt,
}: Omit<PriceAlertPayload, "to"> & { fmt: (n: number) => string }) {
  const saving    = targetPrice - currentPrice;
  const savingAbs = Math.abs(saving);
  const savingPct = Math.round((savingAbs / targetPrice) * 100);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Price Drop Alert</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:800;color:#f0ede8;letter-spacing:-0.5px;">
                      ●&nbsp;PriceHound
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-family:monospace;font-size:11px;color:#6b6b6b;letter-spacing:0.1em;">
                      PRICE ALERT
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:#141414;border:1px solid rgba(232,255,71,0.25);padding:32px;">
              <!-- Accent bar -->
              <div style="height:2px;background:linear-gradient(90deg,#e8ff47,transparent);margin-bottom:24px;"></div>

              <p style="font-family:monospace;font-size:11px;color:#e8ff47;letter-spacing:0.12em;margin:0 0 12px;">
                🎯 TARGET PRICE REACHED
              </p>

              <h1 style="font-size:22px;font-weight:800;color:#f0ede8;letter-spacing:-1px;line-height:1.2;margin:0 0 8px;">
                ${productName}
              </h1>

              <p style="font-family:monospace;font-size:12px;color:#6b6b6b;margin:0 0 28px;word-break:break-all;">
                ${productUrl}
              </p>

              <!-- Price row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td width="33%" style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);padding:14px 16px;">
                    <p style="font-family:monospace;font-size:10px;color:#6b6b6b;letter-spacing:0.1em;margin:0 0 6px;">CURRENT PRICE</p>
                    <p style="font-size:20px;font-weight:800;color:#6ee7b7;margin:0;">${fmt(currentPrice)}</p>
                  </td>
                  <td width="4%"></td>
                  <td width="33%" style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);padding:14px 16px;">
                    <p style="font-family:monospace;font-size:10px;color:#6b6b6b;letter-spacing:0.1em;margin:0 0 6px;">YOUR TARGET</p>
                    <p style="font-size:20px;font-weight:800;color:#e8ff47;margin:0;">${fmt(targetPrice)}</p>
                  </td>
                  <td width="4%"></td>
                  <td width="26%" style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);padding:14px 16px;">
                    <p style="font-family:monospace;font-size:10px;color:#6b6b6b;letter-spacing:0.1em;margin:0 0 6px;">YOU SAVE</p>
                    <p style="font-size:20px;font-weight:800;color:#e8ff47;margin:0;">${savingPct}%</p>
                    <p style="font-family:monospace;font-size:10px;color:#6b6b6b;margin:4px 0 0;">${fmt(savingAbs)}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <a href="${productUrl}"
                style="display:inline-block;background:#e8ff47;color:#0a0a0a;font-family:monospace;font-size:13px;font-weight:700;padding:14px 32px;text-decoration:none;letter-spacing:0.06em;">
                BUY NOW →
              </a>
            </td>
          </tr>

          <!-- Note -->
          <tr>
            <td style="padding:24px 0 0;">
              <p style="font-family:monospace;font-size:11px;color:#6b6b6b;line-height:1.7;margin:0;">
                You're receiving this because you're tracking this product on PriceHound.<br/>
                To pause or remove this alert, visit your
                <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://pricehound.app"}/dashboard"
                   style="color:#9a9a9a;">dashboard</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
