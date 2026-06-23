import { Pool } from 'pg';

export interface DecisionDocument {
  id: string;
  title: string;
  date: string;
  simplifiedText: string;
}

// Initialize a connection pool using standard environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Ensures the database schema exists on boot.
 */
async function initDatabase(): Promise<Pool> {
  // Creating the table if it doesn't exist yet
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      simplified_text TEXT
    )
  `);
  return pool;
}

/**
 * FAST WEB INTERFACE: Draws purely from your local Postgres instance
 */
export async function getSimplifiedDecisions(limit: number = 5, offset: number = 0): Promise<DecisionDocument[]> {
  await initDatabase();

  // Postgres uses $1, $2 for parameterized queries instead of SQLite's ?
  const result = await pool.query(
    `SELECT id, title, date, simplified_text as "simplifiedText" 
     FROM cached_decisions 
     ORDER BY date DESC 
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows as DecisionDocument[];
}