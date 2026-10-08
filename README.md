# MeritScholars CBT

Complete Progressive Web App for JAMB / WAEC practice.

## Contents
- `index.html` · `app.css` · `app.js` — UI (dashboard, practice, premium, AI, analytics, tools)
- `config.js` — Paystack, Supabase, Gemini AI
- `bank/` — unique question bank (JSON per subject)
- `questions-free.js` — free sample pool
- `backend/` — optional Python SQLite API (non-repeat)
- `sw.js` · `manifest.json` · `vercel.json` — PWA + deploy
- SEO: `robots.txt`, `sitemap.xml`, `llms.txt`

## Deploy to GitHub → Vercel
Upload **everything in this folder** to the **repo root**, then connect Vercel.

```cmd
cd MeritScholars_Complete
git init
git add .
git commit -m "MeritScholars complete"
git branch -M main
git remote add origin https://github.com/lumeriqdesigns/excellence-cbt-pwa.git
git push -u origin main --force
```

## Config
1. `AI_API_KEY` — free Gemini key: https://aistudio.google.com/apikey  
2. Paystack + Supabase keys already in `config.js`  
3. Premium: ₦2,000 / 90 days one-time  

## Optional Python API
```bash
cd backend
python import_bank.py
python app.py
```
Set `BACKEND_URL` in `config.js` to `http://127.0.0.1:8000`.
