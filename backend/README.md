# MeritScholars Python Backend (SQLite)

**UI (HTML/CSS) is unchanged.** This API only supplies questions and tracks what each device has already seen so mocks do not repeat until the pool is finished.

## 1. Import the question bank

```bash
cd backend
python import_bank.py
```

## 2. Run the API

```bash
python app.py
```

Server: http://127.0.0.1:8000  
Health: http://127.0.0.1:8000/api/health

## 3. Point the frontend at it

In `config.js`:

```js
BACKEND_URL: "http://127.0.0.1:8000",
```

Keep serving `index.html` as before (Live Server / Vercel / etc.). When `BACKEND_URL` is set, `app.js` asks the API for questions; if the API is down it falls back to the offline bank.

## Smart non-repeat logic

| Step | Behaviour |
|------|-----------|
| 1 | Identify user by `device_id` (saved in browser localStorage) |
| 2 | Serve only questions **not** in `seen_questions` for that user |
| 3 | Mark returned questions as seen |
| 4 | When the filtered pool is exhausted, clear seen for that filter and start a new cycle |

Stem-hash dedupe in the database also blocks near-duplicate question text.

## Main endpoints

- `POST /api/quiz` — smart question pack  
- `POST /api/attempts` — save score  
- `GET /api/progress/{device_id}` — seen count + history  
- `GET /api/subjects` — counts per subject  
- `DELETE /api/seen/{device_id}` — reset history  

## Database file

`backend/data/meritscholars.db` (created automatically)
