/**
 * i18n Configuration
 * Based on Section 6.3: Internationalization (i18n) Implementation
 * 
 * Implements:
 * - react-i18next for React integration
 * - i18next-http-backend for lazy-loading translations from /public/locales
 * - i18next-browser-languagedetector for automatic language detection
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  // Load translation files from /public/locales/{{lng}}/common.json
  .use(HttpBackend)
  // Detect user language from browser
  .use(LanguageDetector)
  // Pass i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    fallbackLng: 'es', // Spanish as primary language
    lng: 'es', // Default language
    debug: import.meta.env.DEV,
    
    // Supported languages (Spanish first as primary)
    supportedLngs: ['es', 'en'],
    
    // Namespace configuration - organized by view/component
    ns: ['common', 'dashboard', 'teams', 'matches', 'login', 'logger', 'admin'],
    defaultNS: 'common',
    
    // Backend configuration for lazy-loading
    backend: {
      // Load from /public/locales/{{lng}}/common.json
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    // Detector options
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'preferredLanguage',
    },
    
    // React i18next options
    react: {
      useSuspense: false, // Disable suspense for immediate updates
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
    },
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
