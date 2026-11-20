import sqlite3
import os
import json
import urllib.request
from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

def get_stats():
    # 1. Check local Prisma SQLite DB
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "prisma", "dev.db"))
    local_data = {
        "completed_videos_count": 0,
        "pending_videos_count": 0,
        "total_videos_count": 0,
        "today_upload_count": 0,
        "daily_limit": 10,
        "recent_completed_videos": []
    }
    
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM Video WHERE status='completed'")
            local_data["completed_videos_count"] = cur.fetchone()[0]
            
            cur.execute("SELECT count(*) FROM Video WHERE status='pending'")
            local_data["pending_videos_count"] = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM Video")
            local_data["total_videos_count"] = cur.fetchone()[0]

            cur.execute("SELECT title, youtubeVideoId, updatedAt FROM Video WHERE status='completed' ORDER BY updatedAt DESC LIMIT 10")
            local_data["recent_completed_videos"] = [
                {"title": r[0], "youtubeId": r[1], "updatedAt": r[2]}
                for r in cur.fetchall()
            ]

            cur.execute("SELECT todayUploadCount, dailyLimit, isRunning FROM AutomationSetting LIMIT 1")
            row = cur.fetchone()
            if row:
                local_data["today_upload_count"] = row[0] or 0
                local_data["daily_limit"] = row[1] or 10
                local_data["is_running"] = bool(row[2])
            conn.close()
        except Exception as e:
            print("SQLite error:", e)

    # 2. Check Firebase Realtime Database
    firebase_url = os.getenv("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com")
    firebase_data = None
    try:
        req = urllib.request.Request(f"{firebase_url.rstrip('/')}/videos.json")
        with urllib.request.urlopen(req, timeout=5) as res:
            raw = res.read().decode("utf-8")
            if raw and raw != "null":
                firebase_data = json.loads(raw)
    except Exception as fe:
        pass

    # 3. Call local API endpoint /api/telegram/stats if web server is up
    api_stats = None
    try:
        req = urllib.request.Request("http://localhost:3000/api/dashboard/stats")
        with urllib.request.urlopen(req, timeout=3) as res:
            api_stats = json.loads(res.read().decode("utf-8"))
    except Exception:
        pass

    return {
        "local_db": local_data,
        "firebase": firebase_data,
        "api_stats": api_stats
    }

if __name__ == "__main__":
    print(json.dumps(get_stats(), indent=2))
