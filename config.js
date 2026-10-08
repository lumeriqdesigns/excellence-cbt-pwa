// MeritScholars configuration
// Keys configured for live use.

window.EXCELLENCE_CONFIG = {
  // Python API (empty = offline-only local bank)
  BACKEND_URL: "",  // e.g. "http://127.0.0.1:8000" or your API host

  // ---------- Paystack (Premium) ----------
  PAYSTACK_PUBLIC_KEY: "pk_live_aeada4922e25c724c8ec7648f483fb5b7d679ba7",
  PREMIUM_PRICE_KOBO: 200000,   // ₦2,000 one-time
  PREMIUM_DAYS: 90,
  PREMIUM_PLAN_NAME: "MeritScholars Premium (90 days one-time)",

  // ---------- Supabase (accounts + multi-device) ----------
  SUPABASE_URL: "https://oaqxdtlwjmwqsgrhamxz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcXhkdGx3am13cXNncmhhbXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk3MzQsImV4cCI6MjEwNjY5NTczNH0.w68ZVqtIm2CiumaIdUofZ1zwpUhqn2Z7g5gju7UHVAY",

  // ---------- Support ----------
  SUPPORT_EMAIL: "lumeriqdesigns@gmail.com",
  SUPPORT_WHATSAPP: "2349031512760",

  // ---------- Merit AI (Google Gemini — free tier) ----------
  // Get a free key: https://aistudio.google.com/apikey
  // Models: gemini-2.0-flash | gemini-2.5-flash-preview-05-20 | gemini-1.5-flash
  AI_PROVIDER: "gemini",
  AI_API_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  AI_API_KEY: "",  // paste your Gemini API key here
  AI_MODEL: "gemini-2.0-flash",
  AI_MAX_TOKENS: 2048,
  AI_FREE_DAILY_LIMIT: 3,
  AI_PREMIUM_DAILY_LIMIT: 40
};
