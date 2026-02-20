import pkg from '@prisma/client';
import 'dotenv/config';
import { getCurrentDbName } from './tenantContext.js';

const { PrismaClient } = pkg;

const prismaClients = new Map();

function buildDatabaseUrl(dbName) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  return password
    ? `mysql://${user}:${password}@${host}:${port}/${dbName}`
    : `mysql://${user}@${host}:${port}/${dbName}`;
}

function getPrismaForDb(dbName) {
  if (prismaClients.has(dbName)) {
    return prismaClients.get(dbName);
  }

  const client = new PrismaClient({
    datasources: {
      db: { url: buildDatabaseUrl(dbName) }
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

  prismaClients.set(dbName, client);
  return client;
}

export function getPrisma() {
  const dbName = getCurrentDbName();
  return getPrismaForDb(dbName);
}

export async function closePrisma() {
  for (const [name, client] of prismaClients) {
    await client.$disconnect();
  }
  prismaClients.clear();
}

// Lazy proxy that resolves to the correct PrismaClient per request
export default new Proxy({}, {
  get: (target, prop) => {
    return getPrisma()[prop];
  }
});
