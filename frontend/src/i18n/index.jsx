import React, { createContext, useContext, useState } from 'react';
import en from './en.json';
import hi from './hi.json';
import bn from './bn.json';
import mr from './mr.json';
import pa from './pa.json';
import ta from './ta.json';
import te from './te.json';
import kn from './kn.json';
import gu from './gu.json';
import ml from './ml.json';

const translations = {
  en, hi, bn, mr, pa, ta, te, kn, gu, ml
};

export const languageNames = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
  mr: 'मराठी',
  pa: 'ਪੰਜਾਬੀ',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  gu: 'ગુજરાતી',
  ml: 'മലയാളம்'
};

export const languages = Object.keys(languageNames).map(code => ({
  code,
  name: languageNames[code]
}));

const I18nContext = createContext();

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en');

  const t = (path) => {
    const keys = path.split('.');
    let result = translations[lang] || translations['en'];
    for (const key of keys) {
      if (!result || typeof result !== 'object') break;
      result = result[key];
    }
    return result || path;
  };

  const switchLang = (newLang) => {
    if (translations[newLang]) {
      setLang(newLang);
      localStorage.setItem('lang', newLang);
    }
  };

  return (
    <I18nContext.Provider value={{ t, lang, switchLang, languageNames, languages }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
