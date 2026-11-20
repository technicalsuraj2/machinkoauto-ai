import sys
import json
import urllib.request
import re

def get_video_id(url):
    m = re.search(r'(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})', url)
    return m.group(1) if m else None

def get_fast_metadata(url):
    video_id = get_video_id(url)
    if not video_id:
        return None
    
    title = "YouTube Video"
    author = "Creator"
    thumb = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
    duration = 300

    # 1. oEmbed for instant title, author & thumbnail
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            title = data.get("title", title)
            author = data.get("author_name", author)
            thumb = data.get("thumbnail_url", thumb)
    except Exception as e:
        pass

    # 2. Watch page HTML for exact duration
    try:
        watch_url = f"https://www.youtube.com/watch?v={video_id}"
        req = urllib.request.Request(watch_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            m = re.search(r'["\']lengthSeconds["\']:\s*["\']?(\d+)', html)
            if m:
                duration = int(m.group(1))
    except Exception as e:
        pass

    return {
        "id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "title": title,
        "thumbnail": thumb,
        "duration": duration,
        "channelTitle": author,
        "viewCount": 0
    }

if __name__ == "__main__":
    test_url = sys.argv[1] if len(sys.argv) > 1 else "https://youtu.be/kR8bhkVAgBY?si=ZrQvF2h9_IO9THUU"
    res = get_fast_metadata(test_url)
    print(json.dumps(res, indent=2))
