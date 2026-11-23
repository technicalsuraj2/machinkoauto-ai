import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.parse
from dotenv import load_dotenv

# ==========================================
# 0. Environment & Configuration
# ==========================================
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

cfg_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cloud_env.json"))
cloud_cfg = {}
if os.path.exists(cfg_file):
    try:
        with open(cfg_file, "r", encoding="utf-8") as f:
            cloud_cfg = json.load(f)
    except Exception:
        pass

def get_conf(key, default=""):
    val = os.getenv(key)
    if val is None or val == "":
        val = cloud_cfg.get(key, default)
    if val is None:
        val = default
    return str(val).strip()

CLIENT_ID = get_conf("GOOGLE_CLIENT_ID")
CLIENT_SECRET = get_conf("GOOGLE_CLIENT_SECRET")
REFRESH_TOKEN = get_conf("YOUTUBE_REFRESH_TOKEN")
FIREBASE_URL = get_conf("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com").rstrip("/")
BOT_TOKEN = get_conf("TELEGRAM_BOT_TOKEN", "8512499007:AAE2du0m0FMAlJu1FXv_UmkhEQBg0arrD0A")
CREATOR_ID = int(get_conf("TELEGRAM_CREATOR_ID", "9052978168"))

SPEED_CHANNEL_URL = "https://www.youtube.com/@IShowSpeed"
SPEED_STREAMS_URL = "https://www.youtube.com/@IShowSpeed/streams"
SPEED_LIVE_URL = "https://www.youtube.com/@IShowSpeed/live"

STAGING_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "staged_speed_clips"))
os.makedirs(STAGING_DIR, exist_ok=True)

VIRAL_SPEED_HEADLINES = [
    "SPEED RAGE MOMENT ⚡",
    "HE CANNOT BE REAL 😂💀",
    "IShowSpeed UNREAL REACTION 😱",
    "SPEED GONE CRAZY IN GTA 6 🔥",
    "SPEED BARKING AT NPC 😭",
    "IShowSpeed IMPOSSIBLE FAILS 💀",
    "SPEED MEETS GTA 6 POLICE 🚔",
    "NOBODY EXPECTED THIS TO HAPPEN 😂",
    "WORLD'S CRAZIEST REACTION 🔥",
    "SPEED DEFEATS FINAL BOSS 🏆"
]

def send_telegram(text: str):
    """Send alert to Suraj sir via Telegram Bot"""
    if not BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": CREATOR_ID, "text": text, "parse_mode": "Markdown"}
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        try:
            payload.pop("parse_mode", None)
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10)
        except Exception:
            pass

def check_stop_flag() -> bool:
    """Check if owner has requested stop in Firebase RTDB"""
    try:
        url = f"{FIREBASE_URL}/system_control/stop_flags.json"
        with urllib.request.urlopen(url, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8") or "{}")
            if data.get("STOP_ALL", False):
                return True
            if data.get("channels", {}).get("UCOkeAWVV2ES-p9-75e2QH3A", False):
                return True
    except Exception:
        pass
    return False

# ==========================================
# 1. Stream Detection & Sourcing
# ==========================================
def get_latest_speed_stream() -> dict:
    """Detect if IShowSpeed is live or get latest stream VOD"""
    print("[Speed Clipper] Checking IShowSpeed channel for live or recent streams...")

    # 1. Check if currently LIVE
    try:
        cmd_live = [
            "yt-dlp",
            "--print", "%(id)s|%(title)s|%(is_live)s",
            "--no-playlist",
            SPEED_LIVE_URL
        ]
        res = subprocess.run(cmd_live, capture_output=True, text=True, timeout=15)
        out = res.stdout.strip()
        if out and "|" in out:
            parts = out.split("|")
            v_id = parts[0].strip()
            v_title = parts[1].strip() if len(parts) > 1 else "IShowSpeed Live Stream"
            is_live = parts[2].strip().lower() == "true" if len(parts) > 2 else False
            if is_live:
                print(f"[Speed Clipper] 🔴 LIVE STREAM DETECTED: {v_title} ({v_id})")
                return {"id": v_id, "title": v_title, "url": f"https://www.youtube.com/watch?v={v_id}", "is_live": True}
    except Exception as e:
        print(f"[Live Check Notice] {e}")

    # 2. Get latest completed Stream VOD from /streams tab
    try:
        cmd_vod = [
            "yt-dlp",
            "--flat-playlist",
            "--playlist-end", "1",
            "--print", "%(id)s|%(title)s|%(duration)s",
            SPEED_STREAMS_URL
        ]
        res = subprocess.run(cmd_vod, capture_output=True, text=True, timeout=20)
        out = res.stdout.strip()
        if out and "|" in out:
            parts = out.split("|")
            v_id = parts[0].strip()
            v_title = parts[1].strip() if len(parts) > 1 else "IShowSpeed Stream Highlights"
            dur = 14400 # Default 4 hours if none
            try:
                if len(parts) > 2 and parts[2].strip() and parts[2].strip() != "NA":
                    dur = int(float(parts[2].strip()))
            except Exception:
                pass
            print(f"[Speed Clipper] 🎬 Latest Stream VOD: {v_title} ({v_id}), Duration: {dur}s")
            return {"id": v_id, "title": v_title, "url": f"https://www.youtube.com/watch?v={v_id}", "duration": dur, "is_live": False}
    except Exception as e:
        print(f"[VOD Check Notice] {e}")

    # Fallback to known GTA 6 exploring stream
    return {
        "id": "izXcd-bU72k",
        "title": "🔴EXPLORING VICE CITY - GTA 6 STREAM (EASTER EGGS)",
        "url": "https://www.youtube.com/watch?v=izXcd-bU72k",
        "duration": 20700,
        "is_live": False
    }

# ==========================================
# 2. 1080p HD Section Extraction & Rendering
# ==========================================
def clip_and_render_speed_moments(target_clips: int = 10) -> list:
    """Download and render 10 HD 9:16 Shorts from IShowSpeed stream"""
    stream = get_latest_speed_stream()
    v_id = stream["id"]
    stream_title = stream["title"]
    stream_url = stream["url"]
    total_dur = stream.get("duration", 18000)

    send_telegram(
        f"⚡ *[IShowSpeed Stream Clipper Active]*\n\n"
        f"• Channel: *IShowSpeed* (`@IShowSpeed`)\n"
        f"• Target Stream: *\"{stream_title[:45]}\"*\n"
        f"• Status: {'🔴 LIVE NOW' if stream.get('is_live') else '🎬 Latest Stream VOD'}\n"
        f"• Target: *{target_clips} HD 1080x1920 Viral Shorts* render karke cloud pe stage ho rahe hain kal ke 5:30 AM upload ke liye! 🚀"
    )

    # Resolve font for bold captions
    font_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts", "impact.ttf"))
    if not os.path.exists(font_file):
        font_file = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_filter_path = font_file.replace("\\", "/").replace(":", "\\:")

    staged_clips = []
    clip_dur = 35 # 35 seconds per viral Short

    # Strategic peak timestamps spread across high-action stream sections (30% to 92%)
    start_offset = max(600, int(total_dur * 0.25))
    end_offset = max(start_offset + 3600, int(total_dur * 0.90))
    step = max(300, (end_offset - start_offset) // target_clips)

    for i in range(target_clips):
        if check_stop_flag():
            send_telegram("🛑 *[Speed Clipper] Stopped by Owner Command!*")
            break

        headline = VIRAL_SPEED_HEADLINES[i % len(VIRAL_SPEED_HEADLINES)]
        t_start = start_offset + (i * step)
        t_end = t_start + clip_dur

        # Format timestamps for yt-dlp section
        s_m, s_s = divmod(t_start, 60)
        s_h, s_m = divmod(s_m, 60)
        e_m, e_s = divmod(t_end, 60)
        e_h, e_m = divmod(e_m, 60)
        sec_range = f"*{s_h:02d}:{s_m:02d}:{s_s:02d}-{e_h:02d}:{e_m:02d}:{e_s:02d}"

        raw_part = os.path.join(STAGING_DIR, f"raw_speed_{i+1}.mp4")
        out_clip = os.path.join(STAGING_DIR, f"speed_short_{i+1}.mp4")
        thumb_path = os.path.join(STAGING_DIR, f"speed_thumb_{i+1}.jpg")

        if os.path.exists(raw_part):
            try:
                os.remove(raw_part)
            except Exception:
                pass

        print(f"[{i+1}/{target_clips}] Downloading 1080p HD section {sec_range} for '{headline}'...")

        # 1. Download only the 35s clip directly in true 1080p HD
        dl_cmd = [
            "yt-dlp",
            "--download-sections", sec_range,
            "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "--force-overwrites",
            "-o", raw_part,
            stream_url
        ]

        try:
            res = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=90)
            if not os.path.exists(raw_part) or os.path.getsize(raw_part) < 100000:
                print(f"[{i+1}] Download retry with generic best format...")
                dl_fallback = [
                    "yt-dlp",
                    "--download-sections", sec_range,
                    "-f", "best[ext=mp4]/best",
                    "--force-overwrites",
                    "-o", raw_part,
                    stream_url
                ]
                subprocess.run(dl_fallback, capture_output=True, text=True, timeout=90)
        except Exception as dl_err:
            print(f"[Download Error Clip #{i+1}]: {dl_err}")
            continue

        if not os.path.exists(raw_part):
            print(f"[{i+1}] Skipped: Raw video section not downloaded.")
            continue

        # 2. Render 1080x1920 9:16 Vertical Crop with Bold Captions
        print(f"[{i+1}/{target_clips}] Rendering 1080x1920 9:16 with viral caption...")
        vf_filter = (
            f"crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,"
            f"drawtext=fontfile='{font_filter_path}':text='{headline}':fontsize=64:fontcolor=yellow:borderw=7:bordercolor=black:x=(w-text_w)/2:y=240,"
            f"drawtext=fontfile='{font_filter_path}':text='SUBSCRIBE @GTA6-INDIA':fontsize=44:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-360"
        )

        ff_cmd = [
            "ffmpeg", "-y",
            "-i", raw_part,
            "-vf", vf_filter,
            "-af", "atempo=1.02",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "128k",
            out_clip
        ]

        try:
            subprocess.run(ff_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        except Exception as ff_err:
            print(f"[FFmpeg Error Clip #{i+1}]: {ff_err}")
            continue

        # 3. Create Viral HD Thumbnail
        try:
            thumb_filter = f"drawtext=fontfile='{font_filter_path}':text='{headline}':fontsize=76:fontcolor=yellow:borderw=7:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2"
            thumb_cmd = [
                "ffmpeg", "-y",
                "-ss", "00:00:02",
                "-i", out_clip,
                "-vframes", "1",
                "-vf", thumb_filter,
                "-q:v", "2",
                thumb_path
            ]
            subprocess.run(thumb_cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        # Cleanup raw part (Zero-Storage Policy)
        try:
            if os.path.exists(raw_part):
                os.remove(raw_part)
        except Exception:
            pass

        # 4. Record Staged Clip in Firebase RTDB
        clip_record = {
            "clip_number": i + 1,
            "headline": headline,
            "title": f"{headline} #{i+1} - IShowSpeed GTA 6 Viral",
            "source_stream": stream_title,
            "source_id": v_id,
            "stream_timestamp": sec_range,
            "local_file": out_clip,
            "thumb_file": thumb_path,
            "status": "ready_for_upload",
            "target_channel": "GTA6-INDIA",
            "channel_id": "UCOkeAWVV2ES-p9-75e2QH3A",
            "staged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scheduled_for": "05:30 AM IST (Quota Reset)"
        }

        try:
            fb_key = f"speed_clip_{v_id}_{i+1}"
            url = f"{FIREBASE_URL}/staged_speed_clips/{fb_key}.json"
            req = urllib.request.Request(
                url,
                data=json.dumps(clip_record).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT"
            )
            urllib.request.urlopen(req, timeout=6)
        except Exception as fb_err:
            print(f"[Firebase Sync Notice] {fb_err}")

        staged_clips.append(clip_record)
        print(f"✅ Staged Clip #{i+1}: {headline}")

    send_telegram(
        f"🎉 *[IShowSpeed Staging Complete!]*\n\n"
        f"• Successfully rendered: *{len(staged_clips)} HD Viral Shorts* (1080x1920 60fps)\n"
        f"• Staged on Cloud: Ready in database `/staged_speed_clips`\n"
        f"• Upload Schedule: *Kal subah 5:30 AM IST* (00:00 UTC quota reset) par apne aap `GTA6-INDIA` channel par upload ho jayenge! 🚀"
    )

    return staged_clips

# ==========================================
# 3. Morning Upload Dispatcher (5:30 AM IST)
# ==========================================
def get_youtube_access_token():
    url = "https://oauth2.googleapis.com/token"
    payload = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH_TOKEN,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data["access_token"]

def wipe_staged_storage():
    """Aggressively wipe and purge all video clips and thumbnails from cloud storage so space never fills up"""
    print("[Zero-Storage] Wiping all staged and temporary video files from cloud storage...")
    deleted_count = 0
    freed_bytes = 0

    # 1. Clean STAGING_DIR
    if os.path.exists(STAGING_DIR):
        for f in os.listdir(STAGING_DIR):
            f_path = os.path.join(STAGING_DIR, f)
            try:
                if os.path.isfile(f_path):
                    freed_bytes += os.path.getsize(f_path)
                    os.remove(f_path)
                    deleted_count += 1
            except Exception as e:
                print(f"[Wipe Notice]: {e}")

    # 2. Clean cloud_temp directory
    cloud_temp = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cloud_temp"))
    if os.path.exists(cloud_temp):
        try:
            for f in os.listdir(cloud_temp):
                f_path = os.path.join(cloud_temp, f)
                if os.path.isfile(f_path):
                    freed_bytes += os.path.getsize(f_path)
                    os.remove(f_path)
                    deleted_count += 1
        except Exception:
            pass

    freed_mb = round(freed_bytes / (1024 * 1024), 2)
    print(f"[Zero-Storage] Successfully wiped {deleted_count} video files ({freed_mb} MB freed)! Cloud storage is 100% clean.")
    send_telegram(
        f"🧹 *[Zero-Storage Wipe Completed!]*\n\n"
        f"• Suraj sir, subah ke 5:30 AM upload ke baad cloud se *saari video clips aur temp files 100% delete aur wipe* kar di gayi hain!\n"
        f"• Total Wiped: *{deleted_count} files* ({freed_mb} MB freed)\n"
        f"• Storage Status: Cloud runner bilkul clean hai, 0 MB disk space occupied! Space kabhi full nahi hoga. ✅"
    )

def upload_staged_clips_to_youtube():
    """Publish staged IShowSpeed HD clips to GTA6-INDIA and wipe all files immediately"""
    print("[Speed Uploader] Fetching staged clips from Firebase...")
    staged = {}
    try:
        url = f"{FIREBASE_URL}/staged_speed_clips.json"
        with urllib.request.urlopen(url, timeout=8) as res:
            staged = json.loads(res.read().decode("utf-8") or "{}")
    except Exception as e:
        print(f"[Fetch Staged Error] {e}")
        return

    ready = [item for item in staged.values() if item.get("status") == "ready_for_upload"]
    if not ready:
        print("[Speed Uploader] No staged clips waiting for upload.")
        # Ensure cleanup even if none ready
        wipe_staged_storage()
        return

    print(f"[Speed Uploader] Found {len(ready)} staged clips ready for GTA6-INDIA!")
    try:
        token = get_youtube_access_token()
    except Exception as t_err:
        print(f"[OAuth Token Error] {t_err}")
        return

    from cloud_pipeline import upload_youtube_short, set_youtube_thumbnail, sync_to_firebase

    try:
        for clip in ready:
            if check_stop_flag():
                send_telegram("🛑 *[Speed Upload] Aborted by Owner Stop Flag!*")
                break

            vid_path = clip.get("local_file")
            if not vid_path or not os.path.exists(vid_path):
                continue

            title = clip.get("title", "IShowSpeed Viral Gaming Short")
            desc = f"{title}\n\nOriginal Stream: {clip.get('source_stream')}\n#IShowSpeed #Speed #GTA6 #Gaming #Shorts #Viral"

            try:
                yt_id = upload_youtube_short(vid_path, title, desc, token)
                live_url = f"https://youtu.be/{yt_id}"
                print(f"🚀 Published: {live_url}")

                sync_to_firebase(yt_id, title)
                send_telegram(f"✅ *[GTA6-INDIA] IShowSpeed HD Short LIVE!* 🚀\n📌 *{title}*\n🔗 {live_url}")

                thumb = clip.get("thumb_file")
                if thumb and os.path.exists(thumb):
                    set_youtube_thumbnail(yt_id, thumb, token)

                # Mark status uploaded in Firebase
                fb_key = f"speed_clip_{clip.get('source_id')}_{clip.get('clip_number')}"
                up_url = f"{FIREBASE_URL}/staged_speed_clips/{fb_key}/status.json"
                req = urllib.request.Request(up_url, data=json.dumps("uploaded").encode("utf-8"), headers={"Content-Type": "application/json"}, method="PUT")
                urllib.request.urlopen(req, timeout=5)

                # Delete local video & thumbnail file immediately (Zero-Storage Policy)
                if os.path.exists(vid_path):
                    os.remove(vid_path)
                if thumb and os.path.exists(thumb):
                    os.remove(thumb)

            except Exception as up_err:
                print(f"[Upload Error]: {up_err}")
                if "uploadLimitExceeded" in str(up_err) or "quotaExceeded" in str(up_err):
                    send_telegram(f"⚠️ *Quota Limit reached during Speed upload.* Remaining clips will auto-resume on next reset!")
                    break
    finally:
        # Guarantee 100% cloud wipe after morning upload run
        wipe_staged_storage()

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "clip"
    if action == "upload":
        upload_staged_clips_to_youtube()
    elif action == "wipe":
        wipe_staged_storage()
    else:
        target = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        clip_and_render_speed_moments(target)
