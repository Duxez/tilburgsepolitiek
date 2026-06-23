import { GoogleGenAI } from '@google/genai';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environmental variables safely from root path context
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWorkerCycle() {
  const timestamp = new Date().toISOString();
  console.log(`\n[⏰ WORKER START - ${timestamp}] Wake cycle initiated.`);
  
  if (!process.env.DATABASE_URL) {
    console.error(`[❌ CRITICAL] DATABASE_URL is missing from environment context!`);
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;
  let attempts = 0;
  const maxAttempts = 5;

  // 1. Connection Lifecycle Handler
  while (!connected && attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`[🗄️ POSTGRES] Connection attempt ${attempts}/${maxAttempts} out to cluster network...`);
      await client.connect();
      connected = true;
      console.log(`[📦 DB SUCCESS] Linked to PostgreSQL engine successfully on attempt ${attempts}.`);
    } catch (connError: any) {
      if (attempts >= maxAttempts) {
        console.error(`[❌ DB CRITICAL] Connection dropped persistently after ${maxAttempts} attempts.`);
        throw connError;
      }
      console.log(`[⏳ DB WAITING] Engine unreachable (${connError.message}). Retrying in 5 seconds...`);
      await delay(5000);
    }
  }

  // 2. Table Guard Check
  console.log(`[🛠️ SCHEMA] Verifying cache table structure exists...`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY, title TEXT, date TEXT, simplified_text TEXT
    )
  `);

  try {
    const API_URL = "https://api.openraadsinformatie.nl/v1/elastic/ori_tilburg*/_search";
    console.log(`[🌐 API REQUEST] Querying OpenBesluitvorming documents repository...`);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { exists: { field: "text" } },
        sort: [{ start_date: { order: "desc" } }],
        size: 15
      })
    });
    
    const data = await response.json();
    const hits = data.hits?.hits || [];
    console.log(`[🌐 API RESPONSE] Extracted ${hits.length} total raw documents from ElasticSearch endpoint.`);

    let processedCount = 0;

    // 3. Document Processing Iteration Loop
    for (const hit of hits) {
      const id = hit._id;
      const source = hit._source;
      const title = source.name || 'Geen titel';
      const date = (source.start_date || 'Onbekend').substring(0, 10);
      const rawText = (source.text || []).join(" ").substring(0, 8000);

      // Check for document existence
      const checkRes = await client.query('SELECT id FROM cached_decisions WHERE id = $1', [id]);
      if (checkRes.rowCount && checkRes.rowCount > 0) {
        // Document already found in system cache, skip it quietly
        continue;
      }

      console.log(`[✨ NEW DATA] Document cache-miss found. ID: ${id} | Title: "${title}"`);

      if (rawText.trim()) {
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;

        // 4. Gemini AI Translation Iteration Logic
        while (retryCount < maxRetries && !success) {
          try {
            console.log(`[🤖 AI COMPILING] Sending payload to Gemini for evaluation (Length: ${rawText.length} chars). Attempt ${retryCount + 1}/${maxRetries}...`);
            
            let aiResponse;
            try {
              aiResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
              });
            } catch (err) {
              console.log(`[⚠️ AI CONGESTION] Primary model busy. Dropping to gemini-2.0-flash cluster infrastructure fallback...`);
              aiResponse = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
              });
            }

            const simplifiedText = aiResponse.text || "Fout bij genereren.";
            
            console.log(`[💾 SQL WRITE] Writing simplified B1 text for doc ${id} to database layout...`);
            await client.query(
              `INSERT INTO cached_decisions (id, title, date, simplified_text) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (id) DO NOTHING`,
              [id, title, date, simplifiedText]
            );
            
            console.log(`[🎉 SUCCESS] Document ${id} completely synchronized.`);
            success = true;
            processedCount++;
            
            console.log(`[⏳ COOLDOWN] Sleeping 3 seconds to protect API rate bucket rules...`);
            await delay(3000);

          } catch (aiError: any) {
            retryCount++;
            if (aiError?.status === 429) {
              console.log(`[🛑 RATE LIMIT OVERFLOW] Free quota hit. Freezing engine sequence for 25 seconds...`);
              await delay(25000);
            } else {
              console.error(`[❌ AI EXCEPTION] Processing stopped for doc ${id}:`, aiError?.message || aiError);
              await delay(3000);
              break; // Break retry loops on structural system formatting failures
            }
          }
        }
      }
    }
    console.log(`[⏰ WORKER END] Loop complete. Added ${processedCount} fresh translations onto table indexes.`);
  } catch (error) {
    console.error("[❌ RUNTIME ERROR] Fatal loop processing abort:", error);
  } finally {
    await client.end();
    console.log(`[📦 DB DISCONNECT] PostgreSQL engine connection severed safely.`);
  }
}

async function main() {
  // Execute the initial launch sequence tracking
  try { 
    await runWorkerCycle(); 
  } catch (e) { 
    console.error("Initial block boot routine failed:", e); 
  }

  if (global.gc) {
    console.log('[🧹 MEMORY CLEAN] Sweeping runtime footprint variables down...');
    global.gc();
  }

  const ONE_HOUR = 60 * 60 * 1000;
  console.log(`[🐳 DOCKER PROCESS] Continuous interval loop scheduled. Sync active every 1 hour.`);
  
  setInterval(async () => {
    try {
      await runWorkerCycle();
    } catch (e) {
      console.error("Scheduled task automation lifecycle failure:", e);
    } finally {
      if (global.gc) {
        console.log('[🧹 MEMORY CLEAN] Running standard cyclic garbage collection routine...');
        global.gc();
      }
    }
  }, ONE_HOUR);
}

main();