import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path'; // Added for absolute path safety

export interface DecisionDocument {
  id: string;
  title: string;
  date: string;
  simplifiedText: string;
}

let db: Database | null = null;

async function initDatabase(): Promise<Database> {
  if (db) return db;
  
  // Using an absolute path ensures both the worker and Next.js find the exact same file
  db = await open({
    filename: '/app/db/tilburg_decisions.db',
    driver: sqlite3.Database
  });

  // FIX: Re-add the defensive table creation statement here!
  // If the worker hasn't run yet, this empty table safely acts as an empty array 
  // instead of crashing your route handler with a 500 error.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      simplified_text TEXT
    )
  `);

  return db;
}

/**
 * FAST WEB INTERFACE: Draws purely from your local database file
 */
export async function getSimplifiedDecisions(limit: number = 5, offset: number = 0): Promise<DecisionDocument[]> {
  const database = await initDatabase();
  
  const rows = await database.all(
    `SELECT id, title, date, simplified_text as simplifiedText 
     FROM cached_decisions 
     ORDER BY date DESC 
     LIMIT ? OFFSET ?`,
    limit,
    offset
  );

  return rows as DecisionDocument[];
}