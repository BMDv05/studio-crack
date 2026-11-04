import React from 'react';
import { createRoot } from 'react-dom/client';
/* Only the scripts the site is written in: Poppins for Latin text, Cairo for
   Arabic. The packages' default entry points also pull in Devanagari faces
   (and Cairo's Latin-extended set), which no page uses. */
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-ext-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-ext-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-ext-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-ext-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-ext-700.css';
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/latin-600.css';
import '@fontsource/cairo/arabic-900.css';
import '@fontsource/cairo/latin-900.css';
import './styles/tokens.css';
import './styles/global.css';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
