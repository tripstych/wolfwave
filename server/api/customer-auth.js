import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { generateToken, requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-change-in-production';

// Customer-specific middleware that looks for customer_token
function requireCustomer(req, res, next) {
  const token = req.cookies?.customer_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SAFE_JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export { requireCustomer };

/**
 * Register a new customer
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if customer already exists
    const existing = await query('SELECT id FROM customers WHERE email = ?', [email]);
    if (existing[0]) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO customers (email, password, first_name, last_name, verification_token)
       VALUES (?, ?, ?, ?, ?)`,
      [email, hashedPassword, firstName || '', lastName || '', verificationToken]
    );

    const customerId = result.insertId;

    // Create token with customer data
    const token = generateToken({
      id: customerId,
      email: email
    });

    res.cookie('customer_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // TODO: Send verification email with token

    res.status(201).json({
      customer: {
        id: customerId,
        email,
        firstName: firstName || '',
        lastName: lastName || ''
      },
      token,
      message: 'Registration successful.'
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Login customer
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const customers = await query(
      'SELECT id, email, password, first_name, last_name FROM customers WHERE email = ?',
      [email]
    );

    const customer = customers[0];

    if (!customer || !(await bcrypt.compare(password, customer.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create token with customer data
    const token = generateToken({
      id: customer.id,
      email: customer.email
    });

    res.cookie('customer_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Logout customer
 */
router.post('/logout', (req, res) => {
  res.clearCookie('customer_token');
  res.json({ success: true });
});

/**
 * Get current customer
 */
router.get('/me', requireCustomer, async (req, res) => {
  try {
    const customers = await query(
      'SELECT id, email, first_name, last_name, phone, email_verified, created_at FROM customers WHERE id = ?',
      [req.user.id]
    );

    if (!customers[0]) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customers[0];
    res.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      emailVerified: customer.email_verified,
      createdAt: customer.created_at
    });
  } catch (err) {
    console.error('Get customer error:', err);
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

/**
 * Update customer profile
 */
router.put('/profile', requireCustomer, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const customerId = req.user.id;

    await query(
      `UPDATE customers SET first_name = ?, last_name = ?, phone = ?, updated_at = NOW()
       WHERE id = ?`,
      [firstName || '', lastName || '', phone || '', customerId]
    );

    const customers = await query(
      'SELECT id, email, first_name, last_name, phone FROM customers WHERE id = ?',
      [customerId]
    );

    const customer = customers[0];
    res.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * Save or update default shipping address
 */
router.put('/address', requireCustomer, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { first_name, last_name, address1, address2, city, province, postal_code, country, phone } = req.body;

    if (!first_name || !last_name || !address1 || !city || !province || !postal_code || !country) {
      return res.status(400).json({ error: 'Required address fields missing' });
    }

    const existing = await query(
      "SELECT id FROM addresses WHERE customer_id = ? AND type = 'shipping' AND is_default = 1 LIMIT 1",
      [customerId]
    );

    if (existing[0]) {
      await query(
        `UPDATE addresses SET first_name=?, last_name=?, address1=?, address2=?, city=?, province=?, postal_code=?, country=?, phone=? WHERE id=?`,
        [first_name, last_name, address1, address2 || null, city, province, postal_code, country, phone || null, existing[0].id]
      );
    } else {
      await query(
        `INSERT INTO addresses (customer_id, type, first_name, last_name, address1, address2, city, province, postal_code, country, phone, is_default)
         VALUES (?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [customerId, first_name, last_name, address1, address2 || null, city, province, postal_code, country, phone || null]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save address error:', err);
    res.status(500).json({ error: 'Failed to save address' });
  }
});

/**
 * Change password
 */
router.post('/change-password', requireCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const customerId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const customers = await query('SELECT password FROM customers WHERE id = ?', [customerId]);
    const customer = customers[0];

    if (!(await bcrypt.compare(currentPassword, customer.password))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query('UPDATE customers SET password = ? WHERE id = ?', [hashedPassword, customerId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const customers = await query('SELECT id FROM customers WHERE email = ?', [email]);

    if (!customers[0]) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link will be sent.'
      });
    }

    const customerId = customers[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    await query(
      `UPDATE customers SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?`,
      [resetTokenHash, expiresAt, customerId]
    );

    // Send password reset email
    const siteUrlRows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'site_url'"
    );
    const siteUrl = siteUrlRows[0]?.setting_value || 'http://localhost:3000';
    const resetUrl = `${siteUrl}/reset-password?token=${resetToken}`;

    sendEmail(email, 'password-reset', { reset_url: resetUrl });

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link will be sent.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find customer with valid reset token
    const customers = await query(
      `SELECT id FROM customers
       WHERE password_reset_token IS NOT NULL
       AND password_reset_expires > NOW()`,
      []
    );

    let customerId = null;
    for (const customer of customers) {
      try {
        const customers2 = await query('SELECT password_reset_token FROM customers WHERE id = ?', [customer.id]);
        if (await bcrypt.compare(token, customers2[0].password_reset_token)) {
          customerId = customer.id;
          break;
        }
      } catch (e) {
        // Continue checking other customers
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE customers SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?`,
      [hashedPassword, customerId]
    );

    res.json({ success: true, message: 'Password reset successful. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
