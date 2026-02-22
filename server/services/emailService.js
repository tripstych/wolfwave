import nodemailer from 'nodemailer';
import emailjs from '@emailjs/nodejs';
import { Resend } from 'resend';
import { query } from '../db/connection.js';

/**
 * Get email settings from the database
 */
async function getEmailSettings() {
  const rows = await query(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure',
       'emailjs_service_id','emailjs_template_id','emailjs_public_key','emailjs_private_key',
       'resend_api_key', 'resend_from',
       'site_name','site_url'
     )`
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
 * Send an email using EmailJS
 */
async function sendEmailViaEmailJS(to, templateSlug, variables, settings) {
  const {
    emailjs_service_id,
    emailjs_template_id,
    emailjs_public_key,
    emailjs_private_key
  } = settings;

  if (!emailjs_service_id || !emailjs_public_key) return false;

  // Load template from DB to get subject and body if needed
  // (EmailJS usually uses its own templates, but we can pass the content)
  const templates = await query(
    'SELECT subject, html_body FROM email_templates WHERE slug = ?',
    [templateSlug]
  );

  let message = '';
  let subject = '';
  if (templates && templates[0]) {
    subject = interpolate(templates[0].subject, variables);
    message = interpolate(templates[0].html_body, variables);
  }

  const templateParams = {
    ...variables,
    to_email: to,
    subject: subject,
    message: message,
    site_name: settings.site_name,
    site_url: settings.site_url
  };

  await emailjs.send(
    emailjs_service_id,
    emailjs_template_id || templateSlug, // Fallback to slug if template ID not set
    templateParams,
    {
      publicKey: emailjs_public_key,
      privateKey: emailjs_private_key,
    }
  );

  return true;
}

/**
 * Send an email using Resend
 */
async function sendEmailViaResend(to, templateSlug, variables, settings) {
  const { resend_api_key, resend_from } = settings;
  if (!resend_api_key) {
    console.warn('[Resend] No API key configured');
    return false;
  }

  console.log(`[Resend] Attempting to send "${templateSlug}" to ${to}...`);
  console.log(`[Resend] Using From: ${resend_from || 'onboarding@resend.dev'}`);

  const resend = new Resend(resend_api_key);

  const templates = await query(
    'SELECT subject, html_body FROM email_templates WHERE slug = ?',
    [templateSlug]
  );

  if (!templates || !templates[0]) {
    console.warn(`[Resend] Template "${templateSlug}" not found in DB`);
    return false;
  }

  const subject = interpolate(templates[0].subject, variables);
  const html = interpolate(templates[0].html_body, variables);

  try {
    const { data, error } = await resend.emails.send({
      from: resend_from || 'onboarding@resend.dev',
      to,
      subject,
      html
    });

    if (error) {
      console.error('[Resend] API Error:', error);
      throw new Error(error.message || 'Resend API error');
    }

    console.log('[Resend] Success! ID:', data?.id);
    return true;
  } catch (err) {
    console.error('[Resend] Send failed:', err.message);
    throw err;
  }
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
    variables.site_name = variables.site_name || settings.site_name || 'WebWolf';
    variables.site_url = variables.site_url || settings.site_url || '';

    // 1. Try Resend
    if (settings.resend_api_key) {
      try {
        const success = await sendEmailViaResend(to, templateSlug, variables, settings);
        if (success) {
          console.log(`[Email] Sent via Resend: "${templateSlug}" to ${to}`);
          return;
        }
      } catch (resendErr) {
        console.error(`[Email] Resend failed, trying next provider:`, resendErr.message);
      }
    }

    // 2. Try EmailJS
    if (settings.emailjs_service_id && settings.emailjs_public_key) {
      try {
        const success = await sendEmailViaEmailJS(to, templateSlug, variables, settings);
        if (success) {
          console.log(`[Email] Sent via EmailJS: "${templateSlug}" to ${to}`);
          return;
        }
      } catch (ejsErr) {
        console.error(`[Email] EmailJS failed, falling back to SMTP:`, ejsErr.message);
      }
    }

    const transporter = createTransporter(settings);
    if (!transporter) {
      console.log(`[Email] Email not configured (no SMTP or EmailJS) — skipping "${templateSlug}" to ${to}`);
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

    console.log(`[Email] Sent via SMTP: "${templateSlug}" to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send "${templateSlug}" to ${to}:`, err.message);
  }
}

/**
 * Send a test email to verify configuration
 */
export async function sendTestEmail(to, preferredProvider = null) {
  const settings = await getEmailSettings();

  // 1. Try Resend test
  if ((preferredProvider === 'resend' || !preferredProvider) && settings.resend_api_key) {
    console.log(`[Resend] Starting test email to ${to}...`);
    const resend = new Resend(settings.resend_api_key);
    try {
      const from = settings.resend_from || 'onboarding@resend.dev';
      console.log(`[Resend] Sending from: ${from}`);
      
      const { data, error } = await resend.emails.send({
        from: from,
        to,
        subject: 'Test Email from ' + (settings.site_name || 'WebWolf CMS'),
        html: '<strong>Resend Configuration Working</strong><p>If you\'re reading this, your Resend settings are configured correctly.</p>'
      });

      if (error) {
        console.error('[Resend] Test failed with API error:', error);
        if (preferredProvider === 'resend') throw new Error(error.message);
      } else {
        console.log('[Resend] Test Success! Response:', data);
        if (preferredProvider === 'resend') return;
      }
    } catch (err) {
      console.error('[Resend] Test exception:', err.message);
      if (preferredProvider === 'resend') throw err;
    }
  }

  // 2. Try EmailJS test
  if ((preferredProvider === 'emailjs' || !preferredProvider) && settings.emailjs_service_id && settings.emailjs_public_key) {
    const templateParams = {
      to_email: to,
      subject: 'Test Email from ' + (settings.site_name || 'WebWolf CMS'),
      message: 'EmailJS Configuration Working',
      site_name: settings.site_name
    };

    await emailjs.send(
      settings.emailjs_service_id,
      settings.emailjs_template_id || 'test',
      templateParams,
      {
        publicKey: settings.emailjs_public_key,
        privateKey: settings.emailjs_private_key,
      }
    );
    if (preferredProvider === 'emailjs') return;
  }

  // 3. SMTP test
  if (preferredProvider === 'smtp' || !preferredProvider) {
    const transporter = createTransporter(settings);
    if (!transporter) {
      if (preferredProvider === 'smtp') throw new Error('SMTP is not configured');
      // If we got here via !preferredProvider and no SMTP exists, we already tried others
      return;
    }

    await transporter.sendMail({
      from: settings.smtp_from || settings.smtp_user,
      to,
      subject: 'Test Email from ' + (settings.site_name || 'WebWolf CMS'),
      html: `<div style="font-family:sans-serif;padding:20px"><h2>Email Configuration Working</h2><p>If you're reading this, your email settings are configured correctly.</p></div>`
    });
  }
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
