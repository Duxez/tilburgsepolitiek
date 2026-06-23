'use client';

import { useState, useEffect } from 'react';
import { loginAdmin, registerAdmin, hasAdminAccount, logoutAdmin, checkAuth, getAllDecisionsRaw, updateDecision } from '@/lib/actions';
import ReactMarkdown from 'react-markdown';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasAccount, setHasAccount] = useState<boolean>(true);
  
  // Formuliervelden voor authenticatie
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [formError, setFormError] = useState('');
  
  // Data- en editor-states
  const [decisions, setDecisions] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function init() {
      const auth = await checkAuth();
      setIsAuthenticated(auth);
      
      const accountExists = await hasAdminAccount();
      setHasAccount(accountExists);

      if (auth) loadData();
    }
    init();
  }, []);

  async function loadData() {
    try {
      const data = await getAllDecisionsRaw();
      setDecisions(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!hasAccount) {
      const res = await registerAdmin(usernameInput, passwordInput);
      if (res.success) {
        setIsAuthenticated(true);
        setHasAccount(true);
        loadData();
      } else {
        setFormError(res.error || 'Registratie mislukt.');
      }
    } else {
      const res = await loginAdmin(usernameInput, passwordInput);
      if (res.success) {
        setIsAuthenticated(true);
        loadData();
      } else {
        setFormError(res.error || 'Inloggen mislukt.');
      }
    }
  }

  function handleSelect(doc: any) {
    setSelectedDoc(doc);
    setEditTitle(doc.title);
    setEditDate(doc.date);
    setEditText(doc.simplifiedText);
  }

  async function handleSave() {
    if (!selectedDoc) return;
    setIsSaving(true);
    try {
      await updateDecision(selectedDoc.id, editDate, editTitle, editText);
      alert('Wijzigingen succesvol opgeslagen!');
      setDecisions(decisions.map(d => d.id === selectedDoc.id ? { ...d, title: editTitle, date: editDate, simplifiedText: editText } : d));
    } catch (err) {
      alert('Opslaan mislukt.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthenticated === null) return <div className="min-h-screen bg-zinc-950 p-8 text-zinc-400">Verifiëren...</div>;

  // --- Auth Guard (Inloggen / Eenmalige Registratie) ---
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl max-w-md w-full shadow-xl">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2 flex items-center gap-2">
            {hasAccount ? '🔐 Beheerderspoort' : '🚀 Eerste installatie'}
          </h1>
          <p className="text-zinc-400 text-sm mb-6">
            {hasAccount 
              ? 'Log in om stukken aan te passen.' 
              : 'Maak het allereerste administrator-account aan. Hierna sluit de registratie automatisch.'}
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Gebruikersnaam</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-blue-500 transition"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Wachtwoord</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
                required
              />
            </div>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition shadow-md">
              {hasAccount ? 'Inloggen' : 'Account aanmaken & Inloggen'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // --- Core Administration Panel View layout ---
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col h-screen">
      {/* Top Banner Navigation Bar */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏛️</span>
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">Tilburgse Politiek — Admin Control</h1>
        </div>
        <button
          onClick={async () => { await logoutAdmin(); window.location.reload(); }}
          className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-lg transition text-zinc-300"
        >
          Uitloggen
        </button>
      </header>

      {/* Main Workspace Frame split grids layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Hand Column: Document Inventory Index */}
        <aside className="w-1/3 border-r border-zinc-800 overflow-y-auto bg-zinc-900/30">
          <div className="p-4 border-b border-zinc-800/60 bg-zinc-900/10 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Gecachte Documenten ({decisions.length})
          </div>
          <div className="divide-y divide-zinc-800/50">
            {decisions.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleSelect(doc)}
                className={`w-full text-left p-4 transition block hover:bg-zinc-900 ${selectedDoc?.id === doc.id ? 'bg-zinc-800/80 border-l-4 border-blue-500 pl-3' : ''}`}
              >
                <div className="text-xs text-blue-400 font-medium mb-1">{doc.date}</div>
                <div className="text-sm font-bold text-zinc-200 line-clamp-2 leading-snug">{doc.title}</div>
                <div className="text-xs text-zinc-500 mt-1 truncate">ID: {doc.id}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Hand Column: Interactive Workplace and Markdown Editor */}
        <section className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
          {selectedDoc ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Form Metadata control bar */}
              <div className="p-6 border-b border-zinc-800 bg-zinc-900/20 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Titel van het stuk</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Publicatiedatum</label>
                    <input
                      type="text"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Editor Mode Controller Bar */}
                <div className="flex items-center justify-between pt-2">
                  <div className="bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 inline-flex">
                    <button
                      onClick={() => setIsPreview(false)}
                      className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${!isPreview ? 'bg-zinc-800 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      ✏️ Edit Markdown
                    </button>
                    <button
                      onClick={() => setIsPreview(true)}
                      className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${isPreview ? 'bg-zinc-800 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      👁️ Live Preview
                    </button>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium text-xs px-5 py-2 rounded-lg transition flex items-center gap-2 shadow"
                  >
                    {isSaving ? 'Opslaan...' : '💾 Wijzigingen Opslaan'}
                  </button>
                </div>
              </div>

              {/* Core Text Editing Canvas view frames */}
              <div className="flex-1 overflow-y-auto p-6">
                {!isPreview ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full h-full min-h-[450px] bg-zinc-900/40 text-zinc-200 font-mono text-sm border border-zinc-800 rounded-xl p-5 focus:outline-none focus:border-zinc-800 resize-none leading-relaxed"
                    placeholder="Voer hier de vereenvoudigde tekst in (Markdown ondersteund)..."
                  />
                ) : (
                  <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-xl p-6 min-h-[450px] prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{editText}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
              <span className="text-3xl">👈</span>
              <p className="text-sm">Selecteer een besluit uit de linkerlijst om de tekst aan te passen.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}