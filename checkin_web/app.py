from __future__ import annotations

import os
import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent


def resolve_db_path() -> Path:
    explicit_path = os.getenv("DB_PATH", "").strip()
    if explicit_path:
        return Path(explicit_path).expanduser()

    volume_path = os.getenv("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
    if volume_path:
        return Path(volume_path) / "checkin.db"

    return BASE_DIR / "data" / "checkin.db"


DB_PATH = resolve_db_path()

DEFAULT_USERS = [
    ("user_a", os.getenv("USER_A_NAME", "我")),
    ("user_b", os.getenv("USER_B_NAME", "搭子")),
]

ENCOURAGE_MESSAGES = [
    "太棒了，今天目标达成，继续保持这个节奏。",
    "你又完成了一次打卡，行动力非常稳。",
    "做得很好，小步前进也能走出很远。",
    "今天的坚持很有价值，给自己点个赞。",
]

COMFORT_MESSAGES = [
    "今天没完全做到也没关系，我们明天继续。",
    "进度慢一点也可以，先照顾好自己。",
    "没完成不代表失败，愿意继续就是进步。",
    "辛苦了，先放松一下，明天再出发。",
]


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["JSON_AS_ASCII"] = False

    init_db()

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/api/bootstrap")
    def bootstrap() -> Any:
        with get_conn() as conn:
            users = [
                {
                    "id": row["id"],
                    "key": row["user_key"],
                    "name": row["display_name"],
                }
                for row in conn.execute(
                    "SELECT id, user_key, display_name FROM users ORDER BY id"
                ).fetchall()
            ]

        return jsonify({"today": date.today().isoformat(), "users": users})

    @app.get("/api/tasks")
    def list_tasks() -> Any:
        user_id = request.args.get("user_id", type=int)
        task_date = request.args.get("date", default="")

        if not user_id:
            return jsonify({"error": "缺少 user_id"}), 400

        parsed_date = parse_date(task_date)
        if not parsed_date:
            return jsonify({"error": "日期格式错误，应为 YYYY-MM-DD"}), 400

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            rows = conn.execute(
                """
                SELECT id, title, completed, task_date, created_at
                FROM tasks
                WHERE user_id = ? AND task_date = ?
                ORDER BY completed ASC, id DESC
                """,
                (user_id, parsed_date.isoformat()),
            ).fetchall()

        tasks = [
            {
                "id": row["id"],
                "title": row["title"],
                "completed": bool(row["completed"]),
                "task_date": row["task_date"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        return jsonify({"tasks": tasks})

    @app.post("/api/tasks")
    def create_task() -> Any:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id")
        task_date = payload.get("date", "")
        title = str(payload.get("title", "")).strip()

        if not isinstance(user_id, int):
            return jsonify({"error": "user_id 无效"}), 400

        parsed_date = parse_date(task_date)
        if not parsed_date:
            return jsonify({"error": "日期格式错误，应为 YYYY-MM-DD"}), 400

        if not title:
            return jsonify({"error": "任务内容不能为空"}), 400

        if len(title) > 80:
            return jsonify({"error": "任务内容请控制在 80 个字以内"}), 400

        now = datetime.now().isoformat(timespec="seconds")

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            try:
                cursor = conn.execute(
                    """
                    INSERT INTO tasks (user_id, task_date, title, completed, created_at)
                    VALUES (?, ?, ?, 0, ?)
                    """,
                    (user_id, parsed_date.isoformat(), title, now),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                return jsonify({"error": "这个日期下已存在同名任务"}), 409

            task_id = cursor.lastrowid
            row = conn.execute(
                """
                SELECT id, title, completed, task_date, created_at
                FROM tasks
                WHERE id = ?
                """,
                (task_id,),
            ).fetchone()

        return (
            jsonify(
                {
                    "task": {
                        "id": row["id"],
                        "title": row["title"],
                        "completed": bool(row["completed"]),
                        "task_date": row["task_date"],
                        "created_at": row["created_at"],
                    }
                }
            ),
            201,
        )

    @app.patch("/api/tasks/<int:task_id>")
    def update_task(task_id: int) -> Any:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id")
        completed = payload.get("completed")

        if not isinstance(user_id, int):
            return jsonify({"error": "user_id 无效"}), 400

        if not isinstance(completed, bool):
            return jsonify({"error": "completed 需要 true 或 false"}), 400

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            conn.execute(
                """
                UPDATE tasks
                SET completed = ?
                WHERE id = ? AND user_id = ?
                """,
                (1 if completed else 0, task_id, user_id),
            )

            row = conn.execute(
                """
                SELECT id, title, completed, task_date, created_at
                FROM tasks
                WHERE id = ? AND user_id = ?
                """,
                (task_id, user_id),
            ).fetchone()

            if not row:
                return jsonify({"error": "任务不存在"}), 404

            conn.commit()

        feedback = random.choice(ENCOURAGE_MESSAGES if completed else COMFORT_MESSAGES)

        return jsonify(
            {
                "task": {
                    "id": row["id"],
                    "title": row["title"],
                    "completed": bool(row["completed"]),
                    "task_date": row["task_date"],
                    "created_at": row["created_at"],
                },
                "feedback": feedback,
                "tone": "encourage" if completed else "comfort",
            }
        )

    @app.delete("/api/tasks/<int:task_id>")
    def delete_task(task_id: int) -> Any:
        user_id = request.args.get("user_id", type=int)
        if not user_id:
            return jsonify({"error": "缺少 user_id"}), 400

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            cursor = conn.execute(
                "DELETE FROM tasks WHERE id = ? AND user_id = ?",
                (task_id, user_id),
            )
            conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"error": "任务不存在"}), 404

        return "", 204

    @app.post("/api/checkin")
    def checkin() -> Any:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id")
        task_date = payload.get("date", "")

        if not isinstance(user_id, int):
            return jsonify({"error": "user_id 无效"}), 400

        parsed_date = parse_date(task_date)
        if not parsed_date:
            return jsonify({"error": "日期格式错误，应为 YYYY-MM-DD"}), 400

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            total, completed = get_task_stats(conn, user_id, parsed_date)
            pending = total - completed
            streak = calculate_streak(conn, user_id, parsed_date)

        if total == 0:
            message = "今天还没有任务，先给自己定一个小目标吧。"
            tone = "comfort"
        elif completed == total:
            base = random.choice(ENCOURAGE_MESSAGES)
            if streak >= 2:
                message = f"{base} 连续全完成 {streak} 天，状态很稳。"
            else:
                message = base
            tone = "encourage"
        elif completed == 0:
            message = random.choice(COMFORT_MESSAGES)
            tone = "comfort"
        else:
            message = (
                f"你今天完成了 {completed}/{total} 项，已经很不错。"
                "剩下的任务我们明天继续。"
            )
            tone = "comfort"

        return jsonify(
            {
                "summary": {
                    "total": total,
                    "completed": completed,
                    "pending": pending,
                    "streak": streak,
                    "message": message,
                    "tone": tone,
                }
            }
        )

    @app.post("/api/clone-to-next-day")
    def clone_to_next_day() -> Any:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id")
        task_date = payload.get("date", "")

        if not isinstance(user_id, int):
            return jsonify({"error": "user_id 无效"}), 400

        parsed_date = parse_date(task_date)
        if not parsed_date:
            return jsonify({"error": "日期格式错误，应为 YYYY-MM-DD"}), 400

        target_date = parsed_date + timedelta(days=1)

        with get_conn() as conn:
            if not ensure_user_exists(conn, user_id):
                return jsonify({"error": "用户不存在"}), 404

            rows = conn.execute(
                """
                SELECT title
                FROM tasks
                WHERE user_id = ? AND task_date = ? AND completed = 0
                ORDER BY id DESC
                """,
                (user_id, parsed_date.isoformat()),
            ).fetchall()

            if not rows:
                return jsonify(
                    {
                        "inserted": 0,
                        "target_date": target_date.isoformat(),
                        "message": "今天没有未完成任务，明天可以从零开始。",
                    }
                )

            now = datetime.now().isoformat(timespec="seconds")
            inserted = 0
            for row in rows:
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO tasks (user_id, task_date, title, completed, created_at)
                    VALUES (?, ?, ?, 0, ?)
                    """,
                    (user_id, target_date.isoformat(), row["title"], now),
                )
                inserted += cursor.rowcount

            conn.commit()

        return jsonify(
            {
                "inserted": inserted,
                "target_date": target_date.isoformat(),
                "message": f"已复制 {inserted} 项未完成任务到 {target_date.isoformat()}。",
            }
        )

    return app


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def parse_date(raw: str) -> date | None:
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        return None


def ensure_user_exists(conn: sqlite3.Connection, user_id: int) -> bool:
    row = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
    return row is not None


def get_task_stats(conn: sqlite3.Connection, user_id: int, target_date: date) -> tuple[int, int]:
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completed
        FROM tasks
        WHERE user_id = ? AND task_date = ?
        """,
        (user_id, target_date.isoformat()),
    ).fetchone()
    return int(row["total"]), int(row["completed"])


def calculate_streak(conn: sqlite3.Connection, user_id: int, end_date: date) -> int:
    streak = 0
    pointer = end_date
    for _ in range(366):
        total, completed = get_task_stats(conn, user_id, pointer)
        if total == 0 or completed < total:
            break
        streak += 1
        pointer -= timedelta(days=1)
    return streak


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_key TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                task_date TEXT NOT NULL,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, task_date, title),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )

        for user_key, display_name in DEFAULT_USERS:
            conn.execute(
                """
                INSERT INTO users (user_key, display_name)
                VALUES (?, ?)
                ON CONFLICT(user_key) DO UPDATE SET display_name = excluded.display_name
                """,
                (user_key, display_name),
            )

        conn.commit()


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)
