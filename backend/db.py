"""SQLite helpers — stdlib only."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

_default = Path(__file__).resolve().parent / "data"
try:
    _default.mkdir(parents=True, exist_ok=True)
    (_default / ".write_test").write_text("ok", encoding="utf-8")
    (_default / ".write_test").unlink(missing_ok=True)
except Exception:
    _default = Path("/tmp/merit-data")
    _default.mkdir(parents=True, exist_ok=True)
DATA_DIR = Path(os.environ.get("MERIT_DATA_DIR", _default))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("MERIT_DB_PATH", DATA_DIR / "meritscholars.db"))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT UNIQUE NOT NULL,
          exam_type TEXT DEFAULT 'JAMB',
          subject TEXT NOT NULL,
          topic TEXT DEFAULT '',
          question_text TEXT NOT NULL,
          option_a TEXT NOT NULL,
          option_b TEXT NOT NULL,
          option_c TEXT NOT NULL,
          option_d TEXT NOT NULL,
          correct_option TEXT NOT NULL,
          explanation TEXT DEFAULT '',
          year INTEGER,
          difficulty TEXT DEFAULT 'medium',
          stem_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_q_subject ON questions(subject);
        CREATE INDEX IF NOT EXISTS idx_q_diff ON questions(difficulty);
        CREATE INDEX IF NOT EXISTS idx_q_stem ON questions(stem_hash);

        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT UNIQUE NOT NULL,
          display_name TEXT DEFAULT 'Student',
          email TEXT,
          is_premium INTEGER DEFAULT 0,
          premium_until TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS seen_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, question_id),
          FOREIGN KEY(user_id) REFERENCES users(id),
          FOREIGN KEY(question_id) REFERENCES questions(id)
        );

        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          subject TEXT DEFAULT '',
          score INTEGER DEFAULT 0,
          total INTEGER DEFAULT 0,
          percent REAL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()
    conn.close()
