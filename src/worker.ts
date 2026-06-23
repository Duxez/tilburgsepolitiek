import { GoogleGenAI } from '@google/genai';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWorkerCycle() {
  console.log(`[⏰ WORKER START] Wake cycle initiated...`);
  
  // Connect using a dedicated single client for the worker run
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY, title TEXT, date TEXT, simplified_text TEXT
    )
  `);

  try {
    const API_URL = "https://api.openraadsinformatie.nl/v1/elastic/ori_tilburg_documents/_search";
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { exists: { field: "text" } },
        sort: [{ sort_date: { order: "desc" } }],
        size: 15
      })
    });
    
    const data = await response.json();
    const hits = data.hits?.hits || [];

    for (const hit of hits) {
      const id = hit._id;
      const source = hit._source;
      const title = source.name || 'Geen titel';
      const date = (source.sort_date || 'Onbekend').substring(0, 10);
      const rawText = (source.text || []).join(" ").substring(0, 8000);

      // Fast presence check in Postgres
      const checkRes = await client.query('SELECT id FROM cached_decisions WHERE id = $1', [id]);
      if (checkRes.rowCount && checkRes.rowCount > 0) continue;

      if (rawText.trim()) {
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;

        while (retryCount < maxRetries && !success) {
          try {
            let aiResponse;
            try {
              aiResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
              });
            } catch {
              aiResponse = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
              });
            }

            const simplifiedText = aiResponse.text || "Fout bij genereren.";
            
            // Standard Postgres upsert syntax
            await client.query(
              `INSERT INTO cached_decisions (id, title, date, simplified_text) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (id) DO NOTHING`,
              [id, title, date, simplifiedText]
            );
            
            console.log(`[💾 SUCCESS] Saved translation for ${id}`);
            success = true;
            await delay(3000);

          } catch (aiError: any) {
            retryCount++;
            if (aiError?.status === 429) {
              console.log(`[🛑 RATE LIMIT] Sleeping 25s...`);
              await delay(25000);
            } else {
              console.error(`[❌ ERROR] Non-rate-limit failure:`, aiError?.message || aiError);
              await delay(3000);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[❌ CRITICAL SYSTEM ERROR]", error);
  } finally {
    await client.end();
    console.log(`[📦 DB] Client connection safely closed.`);
  }
}

async function main() {
  try { await runWorkerCycle(); } catch (e) { console.error(e); }
  if (global.gc) global.gc();

  const ONE_HOUR = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      await runWorkerCycle();
    } catch (e) {
      console.error(e);
    } finally {
      if (global.gc) global.gc();
    }
  }, ONE_HOUR);
}

main();