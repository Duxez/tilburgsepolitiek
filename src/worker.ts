import { GoogleGenAI } from '@google/genai';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * All data variables are self-contained here. 
 * When this function resolves, its entire execution scope is discarded.
 */
async function runWorkerCycle() {
    console.log(`[⏰ WORKER START] Wake cycle initiated...`);

    // 1. Initialize API SDK locally inside the run block
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 2. Open DB locally
    const database = await open({
        filename: '/app/db/tilburg_decisions.db',
        driver: sqlite3.Database
    });

    await database.exec(`
    CREATE TABLE IF NOT EXISTS cached_decisions (
      id TEXT PRIMARY KEY, title TEXT, date TEXT, simplified_text TEXT
    )
  `);

    try {
        const API_URL = "https://api.openraadsinformatie.nl/v1/elastic/ori_tilburg*/_search";
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

        for (const hit of hits) {
            const id = hit._id;
            const source = hit._source;
            const title = source.name || 'Geen titel';
            const date = (source.date_modified || 'Onbekend').substring(0, 10);
            console.log(date);

            // Keep strings block-scoped
            const rawText = (source.text || []).join(" ").substring(0, 8000);

            const cachedRow = await database.get('SELECT id FROM cached_decisions WHERE id = ?', id);
            if (cachedRow) continue;

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
                        } catch (err: any) {
                            // If 503 (Overloaded) or 429 (Rate Limit), try 2.0-flash as immediate fallback
                            if (err?.status === 503 || err?.status === 429) {
                                console.log(`[⚠️ GEMINI BOTTLENECK] Status ${err.status}. Trying fallback model...`);
                                aiResponse = await ai.models.generateContent({
                                    model: 'gemini-2.0-flash',
                                    contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes. Geef enkel de herschreven tekst terug en geen extra tekst:\n\n${rawText}`,
                                });
                            } else {
                                throw err;
                            }
                        }

                        const simplifiedText = aiResponse.text || "Fout bij genereren.";
                        await database.run(
                            'INSERT INTO cached_decisions (id, title, date, simplified_text) VALUES (?, ?, ?, ?)',
                            id, title, date, simplifiedText
                        );
                        console.log(`[💾 SUCCESS] Saved translation for ${id}`);

                        success = true; // Breaks the retry loop
                        await delay(3000); // Increased safety delay between separate documents

                    } catch (aiError: any) {
                        retryCount++;

                        if (aiError?.status === 429) {
                            // Look for the exact retry delay from Google (defaults to 25 seconds if not readable)
                            const waitTimeSec = 25;
                            console.log(`[🛑 RATE LIMIT HIT] Exceeded free quota allocation. Sleeping for ${waitTimeSec} seconds before retry attempt ${retryCount}/${maxRetries}...`);

                            await delay(waitTimeSec * 1000); // Dynamic backoff sleep window
                        } else {
                            console.error(`[❌ ERROR] Non-rate-limit error on doc ${id}:`, aiError?.message || aiError);
                            await delay(3000);
                            break; // Stop retrying if it's an unrecoverable structural error
                        }
                    }
                }
            } if (rawText.trim()) {
                let retryCount = 0;
                const maxRetries = 3;
                let success = false;

                while (retryCount < maxRetries && !success) {
                    try {
                        let aiResponse;
                        try {
                            aiResponse = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes. Geef enkel de herschreven tekst terug en geen extra tekst:\n\n${rawText}`,
                            });
                        } catch (err: any) {
                            // If 503 (Overloaded) or 429 (Rate Limit), try 2.0-flash as immediate fallback
                            if (err?.status === 503 || err?.status === 429) {
                                console.log(`[⚠️ GEMINI BOTTLENECK] Status ${err.status}. Trying fallback model...`);
                                aiResponse = await ai.models.generateContent({
                                    model: 'gemini-2.0-flash',
                                    contents: `Je bent een expert in begrijpelijke taal (B1-niveau). Herschrijf de volgende gemeentelijke tekst zodat deze makkelijk te lezen is voor een gemiddelde burger. Gebruik duidelijke tussenkopjes:\n\n${rawText}`,
                                });
                            } else {
                                throw err;
                            }
                        }

                        const simplifiedText = aiResponse.text || "Fout bij genereren.";
                        await database.run(
                            'INSERT INTO cached_decisions (id, title, date, simplified_text) VALUES (?, ?, ?, ?)',
                            id, title, date, simplifiedText
                        );
                        console.log(`[💾 SUCCESS] Saved translation for ${id}`);

                        success = true; // Breaks the retry loop
                        await delay(3000); // Increased safety delay between separate documents

                    } catch (aiError: any) {
                        retryCount++;

                        if (aiError?.status === 429) {
                            // Look for the exact retry delay from Google (defaults to 25 seconds if not readable)
                            const waitTimeSec = 25;
                            console.log(`[🛑 RATE LIMIT HIT] Exceeded free quota allocation. Sleeping for ${waitTimeSec} seconds before retry attempt ${retryCount}/${maxRetries}...`);

                            await delay(waitTimeSec * 1000); // Dynamic backoff sleep window
                        } else {
                            console.error(`[❌ ERROR] Non-rate-limit error on doc ${id}:`, aiError?.message || aiError);
                            await delay(3000);
                            break; // Stop retrying if it's an unrecoverable structural error
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("[❌ CRITICAL SYSTEM ERROR]", error);
    } finally {
        // CRITICAL: Fully close and release database handles/locks
        await database.close();
        console.log(`[📦 DB] Connection severed. Scope ready for cleanup.`);
    }
}

async function main() {
    // Initial run
    try { await runWorkerCycle(); } catch (e) { console.error(e); }

    // Call manual Garbage Collection if available
    if (global.gc) {
        console.log('[🧹 GC] Cleaning memory allocations explicitly...');
        global.gc();
    }

    const ONE_HOUR = 60 * 60 * 1000;

    setInterval(async () => {
        try {
            await runWorkerCycle();
        } catch (e) {
            console.error(e);
        } finally {
            // Force memory sweep after every single hour loop completes
            if (global.gc) {
                console.log('[🧹 GC] Running post-cycle garbage collection...');
                global.gc();
            }
        }
    }, ONE_HOUR);
}

main();