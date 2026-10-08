"""
MeritScholars CBT API — pure Python stdlib (no pip).
Smart non-repeat quizzes + SQLite. HTML/CSS frontend unchanged.
"""
from __future__ import annotations

import json
import secrets
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple

from db import connect, init_db

HOST = "0.0.0.0"
PORT = int(__import__("os").environ.get("PORT", "8000"))


def j(obj: Any, code: int = 200) -> Tuple[int, bytes, str]:
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    return code, body, "application/json; charset=utf-8"


def get_or_create_user(conn, device_id: str, name: str = "Student") -> int:
    row = conn.execute("SELECT id FROM users WHERE device_id=?", (device_id,)).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO users (device_id, display_name) VALUES (?, ?)",
        (device_id, name or "Student"),
    )
    conn.commit()
    return int(cur.lastrowid)


def row_question(r) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "record_id": r["record_id"],
        "exam_type": r["exam_type"],
        "subject": r["subject"],
        "topic": r["topic"],
        "question_text": r["question_text"],
        "option_a": r["option_a"],
        "option_b": r["option_b"],
        "option_c": r["option_c"],
        "option_d": r["option_d"],
        "correct_option": r["correct_option"],
        "explanation": r["explanation"],
        "year": r["year"],
        "difficulty": r["difficulty"],
    }


def build_filter(subject, subjects, exam_type, difficulty) -> Tuple[str, list]:
    clauses = ["1=1"]
    params: list = []
    if subject:
        clauses.append("UPPER(subject)=?")
        params.append(subject.upper())
    if subjects:
        placeholders = ",".join("?" for _ in subjects)
        clauses.append(f"UPPER(subject) IN ({placeholders})")
        params.extend([s.upper() for s in subjects])
    if exam_type and str(exam_type).upper() not in ("ALL", "", "ANY"):
        clauses.append("UPPER(exam_type)=?")
        params.append(str(exam_type).upper())
    if difficulty and str(difficulty).lower() not in ("all", "", "any"):
        clauses.append("LOWER(difficulty)=?")
        params.append(str(difficulty).lower())
    return " AND ".join(clauses), params


def smart_quiz(body: dict) -> List[dict]:
    device_id = body.get("device_id") or ""
    if len(device_id) < 6:
        raise ValueError("device_id required")
    limit = max(1, min(int(body.get("limit") or 15), 50))
    mark_seen = body.get("mark_seen", True)
    allow_recycle = body.get("allow_recycle", True)
    where, params = build_filter(
        body.get("subject"),
        body.get("subjects"),
        body.get("exam_type"),
        body.get("difficulty"),
    )

    conn = connect()
    try:
        user_id = get_or_create_user(conn, device_id)

        def fetch(unseen_only: bool):
            sql = f"SELECT * FROM questions WHERE {where}"
            p = list(params)
            if unseen_only:
                sql += " AND id NOT IN (SELECT question_id FROM seen_questions WHERE user_id=?)"
                p.append(user_id)
            sql += " ORDER BY RANDOM() LIMIT ?"
            p.append(limit)
            return conn.execute(sql, p).fetchall()

        rows = fetch(True)
        if len(rows) < limit and allow_recycle:
            # clear seen for this filter only
            id_sql = f"SELECT id FROM questions WHERE {where}"
            ids = [r[0] for r in conn.execute(id_sql, params).fetchall()]
            if ids:
                conn.execute(
                    f"DELETE FROM seen_questions WHERE user_id=? AND question_id IN ({','.join('?'*len(ids))})",
                    [user_id] + ids,
                )
                conn.commit()
            rows = fetch(True)

        if len(rows) < limit:
            have = {r["id"] for r in rows}
            for r in fetch(False):
                if r["id"] not in have:
                    rows.append(r)
                    have.add(r["id"])
                if len(rows) >= limit:
                    break

        rows = rows[:limit]
        if mark_seen and rows:
            for r in rows:
                conn.execute(
                    "INSERT OR IGNORE INTO seen_questions (user_id, question_id) VALUES (?, ?)",
                    (user_id, r["id"]),
                )
            conn.commit()
        return [row_question(r) for r in rows]
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(parsed.query)
        conn = connect()
        try:
            if path in ("/", "/api/health"):
                n = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
                code, body, ct = j({"ok": True, "questions": n})
            elif path == "/api/stats":
                code, body, ct = j(
                    {
                        "questions": conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0],
                        "subjects": conn.execute("SELECT COUNT(DISTINCT subject) FROM questions").fetchone()[0],
                        "users": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
                        "attempts": conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0],
                    }
                )
            elif path == "/api/subjects":
                rows = conn.execute(
                    "SELECT subject, COUNT(*) AS c FROM questions GROUP BY subject ORDER BY subject"
                ).fetchall()
                code, body, ct = j([{"subject": r["subject"], "count": r["c"]} for r in rows])
            elif path == "/api/device-id":
                code, body, ct = j({"device_id": secrets.token_hex(16)})
            elif path.startswith("/api/progress/"):
                device_id = path.split("/api/progress/", 1)[1]
                user = conn.execute("SELECT * FROM users WHERE device_id=?", (device_id,)).fetchone()
                if not user:
                    code, body, ct = j({"seen": 0, "attempts": [], "display_name": "Student"})
                else:
                    seen = conn.execute(
                        "SELECT COUNT(*) FROM seen_questions WHERE user_id=?", (user["id"],)
                    ).fetchone()[0]
                    attempts = conn.execute(
                        "SELECT subject, score, total, percent, created_at FROM attempts WHERE user_id=? ORDER BY id DESC LIMIT 50",
                        (user["id"],),
                    ).fetchall()
                    code, body, ct = j(
                        {
                            "display_name": user["display_name"],
                            "seen": seen,
                            "is_premium": bool(user["is_premium"]),
                            "attempts": [dict(a) for a in attempts],
                        }
                    )
            else:
                code, body, ct = j({"error": "not found"}, 404)
        finally:
            conn.close()
        self._send(code, body, ct)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._send(*j({"error": "invalid json"}, 400))
            return
        path = urllib.parse.urlparse(self.path).path.rstrip("/")

        if path == "/api/register":
            device_id = body.get("device_id") or ""
            if len(device_id) < 6:
                self._send(*j({"error": "device_id required"}, 400))
                return
            conn = connect()
            try:
                uid = get_or_create_user(conn, device_id, body.get("display_name") or "Student")
                if body.get("display_name"):
                    conn.execute(
                        "UPDATE users SET display_name=? WHERE id=?",
                        (body["display_name"], uid),
                    )
                if body.get("email"):
                    conn.execute("UPDATE users SET email=? WHERE id=?", (body["email"], uid))
                conn.commit()
                row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
                self._send(
                    *j(
                        {
                            "id": row["id"],
                            "device_id": row["device_id"],
                            "display_name": row["display_name"],
                            "is_premium": bool(row["is_premium"]),
                            "premium_until": row["premium_until"],
                        }
                    )
                )
            finally:
                conn.close()
            return

        if path == "/api/quiz":
            try:
                self._send(*j(smart_quiz(body)))
            except ValueError as e:
                self._send(*j({"error": str(e)}, 400))
            except Exception as e:
                self._send(*j({"error": str(e)}, 500))
            return

        if path == "/api/attempts":
            device_id = body.get("device_id") or ""
            if len(device_id) < 6:
                self._send(*j({"error": "device_id required"}, 400))
                return
            conn = connect()
            try:
                uid = get_or_create_user(conn, device_id)
                total = max(int(body.get("total") or 1), 1)
                score = int(body.get("score") or 0)
                pct = round(100.0 * score / total, 2)
                conn.execute(
                    "INSERT INTO attempts (user_id, subject, score, total, percent) VALUES (?,?,?,?,?)",
                    (uid, body.get("subject") or "", score, total, pct),
                )
                for qid in body.get("question_ids") or []:
                    conn.execute(
                        "INSERT OR IGNORE INTO seen_questions (user_id, question_id) VALUES (?, ?)",
                        (uid, int(qid)),
                    )
                conn.commit()
                self._send(*j({"ok": True, "percent": pct}))
            finally:
                conn.close()
            return

        self._send(*j({"error": "not found"}, 404))

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = urllib.parse.parse_qs(parsed.query)
        if path.startswith("/api/seen/"):
            device_id = path.split("/api/seen/", 1)[1]
            subject = (qs.get("subject") or [None])[0]
            conn = connect()
            try:
                user = conn.execute("SELECT id FROM users WHERE device_id=?", (device_id,)).fetchone()
                if not user:
                    self._send(*j({"ok": True, "cleared": 0}))
                    return
                if subject:
                    cur = conn.execute(
                        """DELETE FROM seen_questions WHERE user_id=? AND question_id IN
                           (SELECT id FROM questions WHERE UPPER(subject)=?)""",
                        (user["id"], subject.upper()),
                    )
                else:
                    cur = conn.execute("DELETE FROM seen_questions WHERE user_id=?", (user["id"],))
                conn.commit()
                self._send(*j({"ok": True, "cleared": cur.rowcount}))
            finally:
                conn.close()
            return
        self._send(*j({"error": "not found"}, 404))

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main():
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"MeritScholars API on http://{HOST}:{PORT}")
    print("Smart quiz: POST /api/quiz  |  Health: GET /api/health")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
