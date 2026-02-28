/**
 * Dev Tools API - Open endpoint for running dev commands
 * 
 * WARNING: This is intentionally unsecured. Remove in production.
 * 
 * GET /dev/run/:command - Run a predefined command
 * GET /dev/commands     - List available commands
 */

import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Define available commands here
const commands = {
  'test-shipstation': {
    description: 'Run ShipStation integration tests',
    cmd: 'node test-shipstation.js'
  },
  'deploy': {
    description: 'Pull latest code, restart server, run tests',
    cmd: 'bash test-and-deploy.sh'
  },
  'restart': {
    description: 'Restart the PM2 process',
    cmd: 'pm2 restart wolfwave'
  },
  'logs': {
    description: 'Show recent PM2 logs',
    cmd: 'pm2 logs wolfwave --lines 50 --nostream'
  },
  'db-migrate': {
    description: 'Run database migrations',
    cmd: 'npx prisma db push --accept-data-loss && node server/db/migrate.js'
  },
  'insert-test-order': {
    description: 'Insert a test order for ShipStation',
    cmd: 'mysql -u toor wolfwave_admin < create-test-order.sql'
  },
  'check-api-keys': {
    description: 'List WooCommerce API keys',
    cmd: 'mysql -u toor wolfwave_admin -e "SELECT key_id, description, permissions, truncated_key FROM woocommerce_api_keys;"'
  },
  'check-orders': {
    description: 'List recent orders',
    cmd: 'mysql -u toor wolfwave_admin -e "SELECT id, order_number, status, total, email, updated_at FROM orders ORDER BY id DESC LIMIT 10;"'
  }
};

// List available commands
router.get('/commands', (req, res) => {
  const list = Object.entries(commands).map(([key, val]) => ({
    command: key,
    description: val.description,
    url: `/dev/run/${key}`
  }));
  res.json({ available_commands: list });
});

// Run a command
router.get('/run/:command', (req, res) => {
  const command = commands[req.params.command];
  
  if (!command) {
    return res.status(404).json({ 
      error: `Unknown command: ${req.params.command}`,
      available: Object.keys(commands)
    });
  }

  console.log(`[DEV] Running: ${command.cmd}`);
  
  res.setHeader('Content-Type', 'text/plain');
  res.write(`Running: ${command.description}\n`);
  res.write(`Command: ${command.cmd}\n`);
  res.write(`${'='.repeat(60)}\n\n`);

  const child = exec(command.cmd, { 
    cwd: PROJECT_ROOT,
    timeout: 60000,
    maxBuffer: 1024 * 1024
  });

  child.stdout.on('data', (data) => res.write(data));
  child.stderr.on('data', (data) => res.write(data));
  
  child.on('close', (code) => {
    res.write(`\n${'='.repeat(60)}\n`);
    res.write(`Exit code: ${code}\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`\nError: ${err.message}\n`);
    res.end();
  });
});

export default router;
