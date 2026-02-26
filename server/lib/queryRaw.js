/**
 * Shared raw SQL query helpers for Prisma
 * 
 * Centralizes the queryRaw/executeRaw pattern used across
 * WooCommerce, ShipStation, and other integration modules.
 */

import prisma from './prisma.js';

/**
 * Execute a raw SQL SELECT query safely.
 * Handles BigInt → Number conversion for JSON serialization.
 * 
 * @param {string} sql - SQL query with ? placeholders
 * @param {...any} params - Positional parameters
 * @returns {Promise<Array>} Array of row objects
 */
export async function queryRaw(sql, ...params) {
  try {
    const results = params.length > 0
      ? await prisma.$queryRawUnsafe(sql, ...params)
      : await prisma.$queryRawUnsafe(sql);
    const converted = JSON.parse(JSON.stringify(results, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    return Array.isArray(converted) ? converted : [];
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

/**
 * Execute a raw SQL write (INSERT/UPDATE/DELETE) query safely.
 * 
 * @param {string} sql - SQL query with ? placeholders
 * @param {...any} params - Positional parameters
 * @returns {Promise<number>} Number of affected rows
 */
export async function executeRaw(sql, ...params) {
  return await prisma.$executeRawUnsafe(sql, ...params);
}
