import { GoogleGenAI } from '@google/genai';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environmental variables safely from root folder pathing
dotenv.config();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWorkerCycle() {
  console.log(`[⏰ WORKER START] Wake cycle initiated at ${new Date().toISOString()}...`);
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  // Safe connection framework loop
  let connected = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!connected && attempts < maxAttempts) {
    try {
      attempts++;
      await client.connect();
      connected = true;
      console.log(`[📦 DB] Connected to PostgreSQL on attempt ${attempts}.`);
    } catch (connError) {
      if (attempts >= maxAttempts) throw connError;
      console.log(`[⏳ DB WAITING] Database not ready yet. Retrying in 5 seconds...`);
      await delay(5000);
    }
  }

  // Ensure the schema exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY, title TEXT, date TEXT, simplified_text TEXT
    )
  `);

  // QUOTA PROTECTION: Calculate requests sent today (UTC date boundaries)
  const todayStr = new Date().toISOString().substring(0, 10);
  
  // Initialize AI client scoped within execution block
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Global request limit state for this execution run (Free Tier Cap)
  let totalRequestsThisRun = 0;
  const MAX_DAILY_QUOTA = 20;

  if (totalRequestsThisRun >= MAX_DAILY_QUOTA) {
    console.log(`[🛑 QUOTA SAFEGUARD] Daily allocation limit of ${MAX_DAILY_QUOTA} requests already processed for today (${todayStr}). Exiting worker early.`);
    await client.end();
    return;
  }

  // Optimize payload size based on remaining daily capacity room
  const remainingSlots = MAX_DAILY_QUOTA - totalRequestsThisRun;
  console.log(`[📊 CAPACITY] Safe slots remaining for this execution block: ${remainingSlots}`);

  const API_URL = "https://api.openraadsinformatie.nl/v1/elastic/ori_tilburg*/_search";
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { exists: { field: "text" } },
        sort: [{ start_date: { order: "desc" } }],
        size: Math.min(remainingSlots, 15) // Never request more than our capacity space
      })
    });
    
    const data = await response.json();
    const hits = data.hits?.hits || [];
    let itemsAdded = 0;

    for (const hit of hits) {
      // Emergency breaks: prevent running if quota is exhausted mid-loop
      if (totalRequestsThisRun >= MAX_DAILY_QUOTA) {
        console.log(`[🛑 QUOTA SAFEGUARD] Hard ceiling of ${MAX_DAILY_QUOTA} requests hit mid-execution. Suspending run.`);
        break;
      }

      const id = hit._id;
      const source = hit._source;
      const title = source.name || 'Geen titel';
      const date = (source.start_date || 'Onbekend').substring(0, 10);
      const rawText = (source.text || []).join(" ").substring(0, 8000);

      // Presence Check
      const checkRes = await client.query('SELECT id FROM cached_decisions WHERE id = $1', [id]);
      if (checkRes.rowCount && checkRes.rowCount > 0) continue;

      if (rawText.trim()) {
        let retryCount = 0;
        const maxRetries = 2;
        let success = false;

        while (retryCount < maxRetries && !success) {
          if (totalRequestsThisRun >= MAX_DAILY_QUOTA) break;

          try {
            let aiResponse;
            totalRequestsThisRun++; // Increment request count before the call
            console.log(`[🤖 GEMINI] Request ${totalRequestsThisRun}/${MAX_DAILY_QUOTA} -> Processing item ${id}`);

            try {
              // Primary Attempt: 2.5 Flash
              aiResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
              });
            } catch (err: any) {
              // Alternative Fallback Attempt: 2.5 Flash Lite
              if (err?.status === 503 || err?.status === 429) {
                console.log(`[⚠️ GEMINI BOTTLENECK] Status ${err.status}. Trying fallback model (gemini-2.5-flash-lite)...`);
                
                // Track the second model's call separately against daily allocation
                totalRequestsThisRun++; 
                aiResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-flash-lite',
                  contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
                });
              } else {
                throw err;
              }
            }

            const simplifiedText = aiResponse.text || "Fout bij genereren.";
            
            await client.query(
              `INSERT INTO cached_decisions (id, title, date, simplified_text) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (id) DO NOTHING`,
              [id, title, date, simplifiedText]
            );
            
            console.log(`[💾 SUCCESS] Saved translation for ${id}`);
            success = true;
            itemsAdded++;
            await delay(4000); // 4-second safety buffer to stay within RPM boundaries

          } catch (aiError: any) {
            retryCount++;
            if (aiError?.status === 429) {
              console.log(`[🛑 RATE LIMIT] Resource exhausted. Cooling down for 30s...`);
              await delay(30000);
            } else {
              console.error(`[❌ ERROR] Non-rate-limit failure for item ${id}:`, aiError?.message || aiError);
              await delay(3000);
              break; 
            }
          }
        }
      }
    }
    console.log(`[⏰ WORKER END] Finished loop run. Generated ${itemsAdded} new translations. Total calls tracked: ${totalRequestsThisRun}`);
  } catch (error) {
    console.error("[❌ CRITICAL SYSTEM ERROR]", error);
  } finally {
    await client.end();
    console.log(`[📦 DB] Database client closed safely.`);
  }
}

async function main() {
  try { await runWorkerCycle(); } catch (e) { console.error(e); }
  if (global.gc) global.gc();

  // Run cycle scheduled hourly
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