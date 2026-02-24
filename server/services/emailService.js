import { Resend } from 'resend';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { query } from '../db/connection.js';

/**
 * Get email settings from the database
 */
async function getEmailSettings() {
  const rows = await query(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'resend_api_key', 'resend_from',
       'mailersend_api_key', 'mailersend_from',
       'email_provider',
       'site_name', 'site_url'
     )`
  );
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  return settings;
}

/**
 * Replace {{placeholder}} variables in a string
 */
function interpolate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Send via Resend
 */
async function sendViaResend(to, subject, html, settings) {
  const resend = new Resend(settings.resend_api_key);
  const { data, error } = await resend.emails.send({
    from: settings.resend_from || 'onboarding@resend.dev',
    to,
    subject,
    html
  });
  if (error) throw new Error(error.message || 'Resend API error');
  console.log(`[Email] Sent via Resend to ${to} (ID: ${data?.id})`);
}

/**
 * Send via MailerSend
 */
async function sendViaMailerSend(to, subject, html, settings) {
  const mailerSend = new MailerSend({ apiKey: settings.mailersend_api_key });
  const from = settings.mailersend_from || 'noreply@yourdomain.com';

  // Parse "Name <email>" format or plain email
  let fromName = '';
  let fromEmail = from;
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    fromName = match[1].trim();
    fromEmail = match[2].trim();
  }

  const emailParams = new EmailParams()
    .setFrom(new Sender(fromEmail, fromName))
    .setTo([new Recipient(to)])
    .setSubject(subject)
    .setHtml(html);

  await mailerSend.email.send(emailParams);
  console.log(`[Email] Sent via MailerSend to ${to}`);
}

/**
 * Route to the configured provider
 */
async function sendWithProvider(to, subject, html, settings) {
  const provider = settings.email_provider || 'mailersend';

  if (provider === 'resend' && settings.resend_api_key) {
    return sendViaResend(to, subject, html, settings);
  }
  if (provider === 'mailersend' && settings.mailersend_api_key) {
    return sendViaMailerSend(to, subject, html, settings);
  }

  // Fallback: try whichever is configured
  if (settings.mailersend_api_key) return sendViaMailerSend(to, subject, html, settings);
  if (settings.resend_api_key) return sendViaResend(to, subject, html, settings);

  console.warn(`[Email] No email provider configured — skipping email to ${to}`);
}

/**
 * Send an email using a stored template
 * @param {string} to - Recipient email
 * @param {string} templateSlug - Template slug (e.g. 'order-confirmation')
 * @param {object} variables - Variables to interpolate into the template
 */
export async function sendEmail(to, templateSlug, variables = {}) {
  try {
    const settings = await getEmailSettings();

    // Inject site-level variables
    variables.site_name = variables.site_name || settings.site_name || 'WolfWave';
    variables.site_url = variables.site_url || settings.site_url || '';

    // Load template from DB
    const templates = await query(
      'SELECT subject, html_body FROM email_templates WHERE slug = ?',
      [templateSlug]
    );

    if (!templates || !templates.length || !templates[0]) {
      console.warn(`[Email] Template "${templateSlug}" not found`);
      return;
    }

    const subject = interpolate(templates[0].subject, variables);
    const html = interpolate(templates[0].html_body, variables);

    await sendWithProvider(to, subject, html, settings);
  } catch (err) {
    console.error(`[Email] Failed to send "${templateSlug}" to ${to}:`, err.message);
  }
}

/**
 * Send a test email to verify configuration
 */
export async function sendTestEmail(to) {
  const settings = await getEmailSettings();

  if (!settings.mailersend_api_key && !settings.resend_api_key) {
    throw new Error('No email provider configured. Add a MailerSend or Resend API key in Settings.');
  }

  const subject = 'Test Email from ' + (settings.site_name || 'WolfWave');
  const html = '<div style="font-family:sans-serif;padding:20px"><h2>Email Configuration Working</h2><p>If you\'re reading this, your email settings are configured correctly.</p></div>';

  await sendWithProvider(to, subject, html, settings);
}

/**
 * Build order items HTML rows for email templates
 */
export function buildOrderItemsHtml(items) {
  return items.map(item => {
    const name = item.variant_title
      ? `${item.product_title} — ${item.variant_title}`
      : item.product_title;
    return `<tr style="border-bottom:1px solid #e4e4e7"><td style="padding:8px 0;font-size:14px;color:#18181b">${name}</td><td style="padding:8px 0;font-size:14px;color:#18181b;text-align:center">${item.quantity}</td><td style="padding:8px 0;font-size:14px;color:#18181b;text-align:right">$${Number(item.subtotal).toFixed(2)}</td></tr>`;
  }).join('');
}
