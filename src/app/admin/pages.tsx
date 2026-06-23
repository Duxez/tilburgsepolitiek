'use client';

import { useState, useEffect } from 'react';
import { loginAdmin, registerAdmin, hasAdminAccount, logoutAdmin, checkAuth, getAllDecisionsRaw, updateDecision } from '@/lib/actions';
import ReactMarkdown from 'react-markdown';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasAccount, setHasAccount] = useState<boolean>(true);
  
  // Formuliervelden
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [formError, setFormError] = useState('');
  
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
      // Eenmalige WordPress-stijl registratie
      const res = await registerAdmin(usernameInput, passwordInput);
      if (res.success) {
        setIsAuthenticated(true);
        setHasAccount(true);
        loadData();
      } else {
        setFormError(res.error || 'Registratie mislukt.');
      }
    } else {
      // Normaal inloggen
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
  // (De rest van je bestand met de return () van het admin-paneel blijft exact hetzelfde als voorheen)