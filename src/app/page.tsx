'use client';

import { useEffect, useState, useRef } from 'react';
import { DecisionDocument } from '@/lib/decisions';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

// Sub-component voor een inklapbaar besluit (Collapsible) in Darkmode
function DecisionItem({ doc }: { doc: DecisionDocument }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article className="bg-zinc-900 rounded-xl shadow-md border border-zinc-800 overflow-hidden transition hover:border-zinc-700">
      {/* Klikbare Header (Toggle) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left p-6 flex items-center justify-between gap-4 hover:bg-zinc-800/50 focus:outline-none transition"
        aria-expanded={isOpen}
      >
        <div className="flex-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950 text-blue-300 border border-blue-900 mb-2">
            📅 {doc.date}
          </span>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
            {doc.title}
          </h2>
        </div>
        
        {/* Icoon dat meedraait wanneer open/dicht */}
        <div className="text-zinc-500 p-2">
          <svg
            className={`h-6 w-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Inklapbare Content Sectie */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden border-t border-zinc-800 bg-zinc-950/40 ${
          isOpen ? 'max-h-[3000px] opacity-100 p-6' : 'max-h-0 opacity-0 p-0 pointer-events-none'
        }`}
      >
        {/* GEUPGRADE: prose-invert zorgt voor perfecte lichte tekstkleuren binnen Markdown */}
        <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap prose-p:whitespace-pre-wrap prose-headings:font-bold prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300">
          <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{doc.simplifiedText}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [decisions, setDecisions] = useState<DecisionDocument[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const LIMIT = 5;

  const fetchMoreDecisions = async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/decisions?limit=${LIMIT}&offset=${offset}`);
      const newDecisions: DecisionDocument[] = await response.json();

      if (newDecisions.length < LIMIT) {
        setHasMore(false);
      }

      setDecisions((prev) => [...prev, ...newDecisions]);
      setOffset((prev) => prev + LIMIT);
    } catch (error) {
      console.error("Fout bij het laden van besluiten:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchMoreDecisions();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [offset, hasMore, loading]);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 px-4 sm:px-6 lg:px-8 text-zinc-100">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold text-zinc-100 tracking-tight sm:text-5xl">
            🏛️ Tilburgse Besluitenwijzer
          </h1>
          <p className="mt-3 text-xl text-zinc-400 sm:mt-4">
            Ingewikkelde gemeenteraadsstukken vertaald naar heldere, begrijpelijke taal.
          </p>
        </header>

        {/* Decisions List */}
        <div className="space-y-4">
          {decisions.map((doc) => (
            <DecisionItem key={doc.id} doc={doc} />
          ))}
        </div>

        {/* Infinite Scroll Trigger */}
        <div ref={loaderRef} className="mt-12 text-center py-4">
          {loading && (
            <div className="inline-flex items-center space-x-2 text-blue-400 font-medium">
              <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Nieuwe besluiten laden...</span>
            </div>
          )}
          
          {!hasMore && decisions.length > 0 && (
            <p className="text-zinc-500 text-sm font-medium">
              Einde van de beschikbare besluiten bereikt.
            </p>
          )}

          {!loading && decisions.length === 0 && (
            <p className="text-zinc-500 text-sm">
              Geen besluiten gevonden. Zorg dat uw server data synchroniseert.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}