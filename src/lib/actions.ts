'use server';

import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { Pool } from 'pg';
import * as crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface SessionData {
  isAdmin?: boolean;
  username?: string;
}

async function getSession() {
  const sessionPassword = process.env.SESSION_PASSWORD || "a_secure_password_that_is_at_least_32_characters_long";
  return getIronSession<SessionData>(await cookies(), {
    password: sessionPassword,
    cookieName: "tilburg_admin_session",
    cookieOptions: { secure: process.env.NODE_ENV === "production" }
  });
}

// Hulpfunctie om wachtwoorden veilig te hashen
function hashPassword(password: string): string {
  return crypto.createHmac('sha256', process.env.SESSION_PASSWORD || 'static_salt').update(password).digest('hex');
}

/**
 * Check of er al MINSTENS één gebruiker in de database staat (WordPress style)
 */
export async function hasAdminAccount(): Promise<boolean> {
  const result = await pool.query('SELECT id FROM tilburg_users LIMIT 1');
  return (result.rowCount ?? 0) > 0;
}

/**
 * Eenmalige registratie actie
 */
export async function registerAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const alreadyExists = await hasAdminAccount();
  if (alreadyExists) {
    return { success: false, error: "Registratie gesloten. Er is al een beheerder." };
  }

  if (password.length < 8) {
    return { success: false, error: "Wachtwoord moet minimaal 8 tekens lang zijn." };
  }

  const passwordHash = hashPassword(password);

  try {
    await pool.query(
      'INSERT INTO tilburg_users (username, password_hash) VALUES ($1, $2)',
      [username.toLowerCase().trim(), passwordHash]
    );
    
    // Log direct in na registratie
    const session = await getSession();
    session.isAdmin = true;
    session.username = username;
    await session.save();

    return { success: true };
  } catch (e) {
    return { success: false, error: "Gebruikersnaam is al bezet." };
  }
}

/**
 * Inloggen met gebruikersnaam en wachtwoord
 */
export async function loginAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const passwordHash = hashPassword(password);
  
  const result = await pool.query(
    'SELECT username FROM tilburg_users WHERE username = $1 AND password_hash = $2',
    [username.toLowerCase().trim(), passwordHash]
  );

  if (result.rowCount && result.rowCount > 0) {
    const session = await getSession();
    session.isAdmin = true;
    session.username = result.rows[0].username;
    await session.save();
    return { success: true };
  }

  return { success: false, error: "Onjuiste gebruikersnaam of wachtwoord." };
}

export async function logoutAdmin() {
  const session = await getSession();
  session.destroy();
}

export async function checkAuth(): Promise<boolean> {
  const session = await getSession();
  return !!session.isAdmin;
}

export async function updateDecision(id: string, date: string, title: string, text: string) {
  const authorized = await checkAuth();
  if (!authorized) throw new Error("Unauthorized");

  await pool.query(
    `UPDATE cached_decisions SET date = $1, title = $2, simplified_text = $3 WHERE id = $4`,
    [date, title, text, id]
  );
  return { success: true };
}

export async function getAllDecisionsRaw() {
  const authorized = await checkAuth();
  if (!authorized) throw new Error("Unauthorized");

  const result = await pool.query(
    `SELECT id, title, date, simplified_text as "simplifiedText" FROM cached_decisions ORDER BY date DESC`
  );
  return result.rows;
}