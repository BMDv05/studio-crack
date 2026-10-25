import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { dictionaries } from './translations.js';

/* Language context: English / العربية. Persists the choice in localStorage,
   keeps <html lang> + dir in sync, and exposes a t() lookup with {token} interpolation. */

const STORAGE_KEY = 'dh-lang';
const LANGS = ['en', 'ar'];

function readInitialLang() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage unavailable — fall through */ }
  return 'en';
}

function lookup(dict, path) {
  let node = dict;
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
    if (!m) return undefined;
    node = node[m[1]];
    if (m[2] != null) node = node == null ? undefined : node[Number(m[2])];
  }
  return node;
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  /* Layout effect: flip direction before paint so nothing flashes LTR in Arabic. */
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* storage unavailable */ }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (LANGS.includes(next)) setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'en' ? 'ar' : 'en'));
  }, []);

  const value = useMemo(() => {
    const dict = dictionaries[lang] || dictionaries.en;
    const t = (key, vars) => {
      let str = lookup(dict, key);
      if (typeof str !== 'string') {
        str = lookup(dictionaries.en, key);
        if (typeof str !== 'string') return key;
      }
      if (vars) {
        str = str.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
      }
      return str;
    };
    return { lang, isArabic: lang === 'ar', setLang, toggleLang, t };
  }, [lang, setLang, toggleLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>');
  return ctx;
}
