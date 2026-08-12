import sqlite3
from pathlib import Path


DATABASE = Path(__file__).parents[1] / "data" / "reviews.sqlite"


def fetch_pending_reviews():
    with sqlite3.connect(DATABASE) as connection:
        return connection.execute(
            "SELECT id, title, status FROM reviews WHERE status = ? ORDER BY id",
            ("pending",),
        ).fetchall()
