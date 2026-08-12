from backend.repository import fetch_pending_reviews


def list_pending_reviews():
    return [
        {"id": row[0], "title": row[1], "status": row[2]}
        for row in fetch_pending_reviews()
    ]
