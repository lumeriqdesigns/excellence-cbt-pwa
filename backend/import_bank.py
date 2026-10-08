"""Import bank JSON into SQLite with stem-hash dedupe."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from db import connect, init_db

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "bank"


def norm_stem(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").lower()).strip()
    t = re.sub(r"\s*[·•]\s*id\d+\b", "", t)
    t = re.sub(r"\s+id\d+\b", "", t)
    return t.strip()


def stem_hash(text: str) -> str:
    return hashlib.sha256(norm_stem(text).encode("utf-8")).hexdigest()[:32]


def main() -> int:
    init_db()
    conn = connect()
    existing = {r[0] for r in conn.execute("SELECT record_id FROM questions")}
    stems = {r[0] for r in conn.execute("SELECT stem_hash FROM questions")}
    added = skipped = 0
    files = [f for f in sorted(BANK.glob("*.json")) if f.name != "index.json"]
    if not files:
        print("No bank JSON at", BANK)
        return 1
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            continue
        for q in data:
            text = str(q.get("question_text") or "").strip()
            if not text:
                skipped += 1
                continue
            rid = str(q.get("record_id") or "").strip() or f"GEN-{stem_hash(text)}"
            sh = stem_hash(text)
            if rid in existing or sh in stems:
                skipped += 1
                continue
            conn.execute(
                """INSERT INTO questions
                (record_id, exam_type, subject, topic, question_text,
                 option_a, option_b, option_c, option_d, correct_option,
                 explanation, year, difficulty, stem_hash)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    rid,
                    str(q.get("exam_type") or "JAMB")[:16],
                    str(q.get("subject") or path.stem).upper(),
                    str(q.get("topic") or "")[:128],
                    text,
                    str(q.get("option_a") or ""),
                    str(q.get("option_b") or ""),
                    str(q.get("option_c") or ""),
                    str(q.get("option_d") or ""),
                    str(q.get("correct_option") or "A")[:1].upper(),
                    str(q.get("explanation") or ""),
                    q.get("year"),
                    str(q.get("difficulty") or "medium").lower()[:16],
                    sh,
                ),
            )
            existing.add(rid)
            stems.add(sh)
            added += 1
        conn.commit()
        print(path.name, "ok")
    total = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    conn.close()
    print(f"Imported +{added}, skipped {skipped}, total {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
