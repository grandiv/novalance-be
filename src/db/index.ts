import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// For local development with SQLite
let _localDb: any = null;

export function getLocalDb() {
  if (_localDb) return _localDb;
  const sqlite = new Database('./novalance.db');
  sqlite.pragma('foreign_keys = ON');
  _localDb = drizzle(sqlite, { schema });
  return _localDb;
}

// For D1 (production on Vercel)
export function getD1Db(d1: any) {
  const { drizzle: drizzleD1 } = require('drizzle-orm/d1-http');
  return drizzleD1(d1, { schema }) as any;
}

// Legacy export for backward compatibility (uses local SQLite)
export const db = getLocalDb();

// Export schema for use in other files
export * from './schema';
