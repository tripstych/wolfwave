import { runWithTenant } from '../lib/tenantContext.js';
import { debug } from '../lib/logger.js';

// Subdomains that are not tenants
const IGNORED_SUBDOMAINS = ['www', 'api', 'admin', 'mail', 'ftp'];

/**
 * Extract the subdomain from a hostname.
 * Returns null for localhost, IP addresses, and bare domains.
 */
function extractSubdomain(host) {
  // Remove port if present
  const hostname = host.split(':')[0];

  // Handle bare localhost or IP addresses
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split('.');
  
  // Support local development: zenblock.localhost
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0];
  }

  // Production: sub.domain.tld (3+ parts)
  if (parts.length < 3) {
    return null;
  }

  const subdomain = parts[0];
  if (IGNORED_SUBDOMAINS.includes(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Check if a database exists for the tenant
 */
async function checkTenantExists(dbName) {
  try {
    const { getPool } = await import('../db/connection.js');
    const pool = getPool();
    
    // Query the information_schema to check if database exists
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
        [dbName]
      );
      return rows.length > 0;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(`[TENANT] Error checking database existence for ${dbName}:`, err);
    return false;
  }
}

/**
 * Tenant placeholder page for unknown databases
 */
function renderTenantPlaceholder(req, res, subdomain) {
  const baseUrl = `${req.protocol}://${req.get('host').replace(subdomain + '.', '')}`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site Not Found - WolfWave CMS</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            background: white;
            padding: 3rem;
            border-radius: 1rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            margin: 0 1rem;
        }
        .logo {
            margin-bottom: 2rem;
        }
        .logo img {
            height: 60px;
            width: auto;
            max-width: 100%;
        }
        h1 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 2rem;
        }
        p {
            color: #666;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        .subdomain {
            background: #f5f5f5;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-family: monospace;
            color: #e74c3c;
            margin: 1rem 0;
            display: inline-block;
        }
        .btn {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 0.75rem 2rem;
            text-decoration: none;
            border-radius: 0.5rem;
            transition: all 0.3s ease;
            font-weight: 500;
        }
        .btn:hover {
            background: #5a6fd8;
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <img src="${baseUrl}/images/logo.png" alt="WolfWave CMS Logo" />
        </div>
        <h1>Site Not Found</h1>
        <p>
            The site <span class="subdomain">${subdomain}</span> doesn't exist yet or hasn't been set up.
        </p>
        <p>
            This is powered by WolfWave CMS - a flexible content management system for modern websites.
        </p>
        <a href="${baseUrl}" class="btn">Return to Main Site</a>
    </div>
</body>
</html>`;
  
  res.status(404).send(html);
}

/**
 * Tenant resolution middleware.
 * Extracts the subdomain from the Host header and wraps the request
 * in an AsyncLocalStorage context so all downstream DB calls use the correct database.
 *
 * Supports:
 * - Subdomain-based: shop1.example.com -> wolfwave_shop1
 * - Header override: X-Tenant-ID: shop1 (for dev/testing)
 * - Fallback: localhost / bare domain -> default DB_NAME
 */
export function tenantMiddleware(req, res, next) {
  const host = req.get('host') || '';

  // Development override via header
  const headerTenant = req.get('X-Tenant-ID');

  let dbName;
  let subdomain = null;

  if (headerTenant) {
    dbName = `wolfwave_${headerTenant}`;
    subdomain = headerTenant;
  } else {
    subdomain = extractSubdomain(host);
    if (subdomain) {
      dbName = `wolfwave_${subdomain}`;
    } else {
      // No subdomain (localhost, bare domain) -> default database
      dbName = process.env.DB_NAME || 'wolfwave_admin';
    }
  }

  // Attach to req for logging/debugging
  req.tenantDb = dbName;
  console.log(`[TENANT] Host: "${host}", Resolved DB: ${dbName}`);
  debug(req, 'TENANT', `Resolved to database: ${dbName}`);

  // If we have a subdomain, check if the tenant database exists
  if (subdomain) {
    checkTenantExists(dbName).then(exists => {
      if (!exists) {
        console.log(`[TENANT] Database not found for subdomain: ${subdomain}`);
        renderTenantPlaceholder(req, res, subdomain);
        return;
      }
      
      // Run the rest of the middleware/route chain inside tenant context
      runWithTenant(dbName, () => {
        next();
      });
    }).catch(err => {
      console.error(`[TENANT] Error checking tenant existence:`, err);
      renderTenantPlaceholder(req, res, subdomain);
    });
  } else {
    // No subdomain - proceed normally
    runWithTenant(dbName, () => {
      next();
    });
  }
}
