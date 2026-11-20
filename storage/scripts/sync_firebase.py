import urllib.request
import json
import os
from dotenv import load_dotenv

load_dotenv(".env")
fb_url = os.getenv("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com")

videos = [
    {"id": "5kxFWbcrv9k", "title": "Best Viral Moment #6 😱 #Shorts", "publishedAt": "2026-11-20T09:10:35Z"},
    {"id": "MQiLtGc4fLQ", "title": "Best Viral Moment #5 😱 #Shorts", "publishedAt": "2026-11-20T09:10:17Z"},
    {"id": "0S0_sGAwAgk", "title": "Best Viral Moment #4 😱 #Shorts", "publishedAt": "2026-11-20T09:10:07Z"},
    {"id": "KW2Epw3_jbc", "title": "Best Viral Moment #3 😱 #Shorts", "publishedAt": "2026-11-20T09:09:51Z"},
    {"id": "ENJQO3EDpy0", "title": "Best Viral Moment #2 😱 #Shorts", "publishedAt": "2026-11-20T09:09:33Z"},
    {"id": "FrwIoJ-Mbek", "title": "Best Viral Moment #1 😱 #Shorts", "publishedAt": "2026-11-20T09:09:16Z"},
    {"id": "YSvWdcHheig", "title": "Free Fire Momenet #Shorts", "publishedAt": "2026-11-20T09:04:20Z"}
]

for v in videos:
    url = f"{fb_url.rstrip('/')}/videos/{v['id']}.json"
    data = json.dumps({
        "youtubeId": v["id"],
        "title": v["title"],
        "channelTitle": "GTA6-INDIA",
        "publishedAt": v["publishedAt"],
        "status": "completed",
        "url": f"https://youtu.be/{v['id']}"
    }).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as res:
        print(f"Synced {v['id']}: {res.status}")
print("All 7 videos synced to Firebase RTDB!")
