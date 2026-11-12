// Firebase web config is public by design; access is protected by App Check (reCAPTCHA Enterprise).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: 'veil-hybrid-ai.firebaseapp.com',
  projectId: 'veil-hybrid-ai',
  storageBucket: 'veil-hybrid-ai.firebasestorage.app',
  messagingSenderId: '793228998399',
  appId: '1:793228998399:web:bd25f0cdaed67a09fcbeca',
};
export const RECAPTCHA_SITE_KEY = '6Lf4ORwuAAAAAFBrBd3wAVuvC1CsKk_IX_o2rFxj';
export const CLOUD_MODEL = 'gemini-2.5-flash';
