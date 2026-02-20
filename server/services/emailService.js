import nodemailer from 'nodemailer';
import { query } from '../db/connection.js';

/**
 * Get SMTP settings from the database
 */
async function getSmtpSettings() {
  const rows = await query(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','site_name','site_url')`
  );
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  return settings;
}

/**
 * Create a Nodemailer transporter from DB settings
 */
function createTransporter(settings) {
  if (!settings.smtp_host) return null;

  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port) || 587,
    secure: settings.smtp_secure === 'true',
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    }
  });
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
 * Send an email using a stored template
 * @param {string} to - Recipient email
 * @param {string} templateSlug - Template slug (e.g. 'order-confirmation')
 * @param {object} variables - Variables to interpolate into the template
 */
export async function sendEmail(to, templateSlug, variables = {}) {
  try {
    const settings = await getSmtpSettings();

    // Inject site-level variables
    variables.site_name = variables.site_name || settings.site_name || 'WebWolf';
    variables.site_url = variables.site_url || settings.site_url || '';

    const transporter = createTransporter(settings);
    if (!transporter) {
      console.log(`[Email] SMTP not configured — skipping "${templateSlug}" to ${to}`);
      return;
    }

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

    await transporter.sendMail({
      from: settings.smtp_from || settings.smtp_user,
      to,
      subject,
      html
    });

    console.log(`[Email] Sent "${templateSlug}" to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send "${templateSlug}" to ${to}:`, err.message);
  }
}

/**
 * Send a test email to verify SMTP configuration
 */
export async function sendTestEmail(to) {
  const settings = await getSmtpSettings();
  const transporter = createTransporter(settings);

  if (!transporter) {
    throw new Error('SMTP is not configured');
  }

  await transporter.sendMail({
    from: settings.smtp_from || settings.smtp_user,
    to,
    subject: 'Test Email from ' + (settings.site_name || 'WebWolf CMS'),
    html: `<div style="font-family:sans-serif;padding:20px"><h2>SMTP Configuration Working</h2><p>If you're reading this, your email settings are configured correctly.</p></div>`
  });
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
