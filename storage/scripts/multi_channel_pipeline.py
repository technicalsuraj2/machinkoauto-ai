import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.parse
from dotenv import load_dotenv

# Load config from .env or cloud_env.json
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")))
env_config = {}
cfg_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cloud_env.json"))
if os.path.exists(cfg_file):
    try:
        with open(cfg_file, "r", encoding="utf-8") as f:
            env_config = json.load(f)
    except Exception:
        pass

def get_conf(key, default=""):
    return os.getenv(key) or env_config.get(key) or default

CLIENT_ID = get_conf("GOOGLE_CLIENT_ID")
CLIENT_SECRET = get_conf("GOOGLE_CLIENT_SECRET")
FIREBASE_URL = get_conf("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com").rstrip("/")
TELEGRAM_BOT_TOKEN = get_conf("TELEGRAM_BOT_TOKEN")
CREATOR_ID = str(get_conf("TELEGRAM_CREATOR_ID", "9052978168")).strip()

BEAMNG_VIRAL_TITLES = [
    "CAN THIS CAR SURVIVE? 🚗💥",
    "INSANE CAR CRASH TEST 😱🔥",
    "EXTREME SUSPENSION TEST GONE WRONG 🤯",
    "SPEED RUN ACCIDENT AT 300 KM/H 🏎️💥",
    "BEST CAR CRASH MOMENT EVER 😱",
    "UNREAL BEAMNG PHYSICS MOMENT 🔥🚗",
    "NOBODY SURVIVES THIS CRASH 💥",
    "POLICE CHASE ENDS IN MASSIVE PILEUP 🚓🚨",
    "FLYING CAR OFF THE CLIFF JUMP ✈️😱",
    "LEVEL 1 VS LEVEL 100 CAR IMPACT 🚗💥"
]

def send_telegram(text: str):
    """Send notification to Suraj sir with markdown fallback"""
    if not TELEGRAM_BOT_TOKEN:
        print(f"[Telegram Notice] {text}")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        payload = {"chat_id": CREATOR_ID, "text": text, "parse_mode": "Markdown"}
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        try:
            payload = {"chat_id": CREATOR_ID, "text": text}
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print(f"[Telegram Alert Error] {e}")

def get_access_token(refresh_token: str) -> str:
    """Exchange refresh token for fresh Google OAuth access token"""
    url = "https://oauth2.googleapis.com/token"
    payload = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data["access_token"]

def get_drive_files(folder_id: str, drive_token: str, limit: int = 50) -> list:
    """List video files from target Google Drive folder"""
    q = f"'{folder_id}' in parents and mimeType contains 'video/' and trashed = false"
    url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode({
        "q": q,
        "fields": "files(id, name, size, mimeType, videoMediaMetadata)",
        "pageSize": limit,
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true"
    })
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {drive_token}"})
    with urllib.request.urlopen(req, timeout=20) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data.get("files", [])

def get_uploaded_drive_file_ids() -> set:
    """Retrieve already uploaded Drive file IDs from Firebase RTDB"""
    try:
        url = f"{FIREBASE_URL}/uploaded_drive_files.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data and isinstance(data, dict):
                return set(data.keys())
    except Exception:
        pass
    return set()

def record_uploaded_file(file_id: str, file_name: str, channel_id: str, channel_name: str, video_id: str, title: str):
    """Mark file as uploaded in Firebase RTDB"""
    try:
        record_url = f"{FIREBASE_URL}/uploaded_drive_files/{file_id}.json"
        data = {
            "fileName": file_name,
            "channelId": channel_id,
            "channelName": channel_name,
            "youtubeVideoId": video_id,
            "title": title,
            "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        req = urllib.request.Request(record_url, data=json.dumps(data).encode("utf-8"), headers={"Content-Type": "application/json"}, method="PUT")
        urllib.request.urlopen(req, timeout=10)

        # Also add to /uploads
        upload_url = f"{FIREBASE_URL}/uploads/{video_id}.json"
        upload_data = {
            "youtubeId": video_id,
            "title": title,
            "channelTitle": channel_name,
            "publishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "completed",
            "url": f"https://youtu.be/{video_id}"
        }
        req2 = urllib.request.Request(upload_url, data=json.dumps(upload_data).encode("utf-8"), headers={"Content-Type": "application/json"}, method="PUT")
        urllib.request.urlopen(req2, timeout=10)
    except Exception as e:
        print(f"[Firebase Sync Notice] {e}")

def download_drive_video(file_id: str, dest_path: str, drive_token: str):
    """Download video from Google Drive via direct stream"""
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {drive_token}"})
    with urllib.request.urlopen(req, timeout=180) as res, open(dest_path, "wb") as f:
        while True:
            chunk = res.read(1024 * 512)
            if not chunk:
                break
            f.write(chunk)

def edit_video_clip(input_path: str, output_path: str) -> bool:
    """Edit video: 720x1280 vertical framing, anti-Content-ID audio shift, optimized bitrate, no watermark"""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,eq=contrast=1.04:saturation=1.05",
        "-af", "atempo=1.03",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "24",
        "-b:v", "2000k",
        "-maxrate", "2800k",
        "-bufsize", "4000k",
        "-c:a", "aac",
        "-b:a", "128k",
        "-max_muxing_queue_size", "1024",
        output_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000

def upload_to_youtube(video_path: str, title: str, access_token: str, max_retries: int = 3) -> str:
    """Upload vertical 9:16 video as a YouTube Short via multipart upload with retry logic"""
    url = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart"
    metadata = {
        "snippet": {
            "title": f"{title} #Shorts",
            "description": f"{title}\n\nExtreme Car Crash & Physics Simulation Compilation.\n\n#Shorts #Gaming #BeamNG #CarCrash #Viral #Reaction #Simulation",
            "tags": ["shorts", "gaming", "beamng", "carcrash", "viral", "simulation", "cars"],
            "categoryId": "20"
        },
        "status": {
            "privacyStatus": "public",
            "selfDeclaredMadeForKids": False
        }
    }

    boundary = "==============MACHINKO_CLOUD_BOUNDARY=============="
    body = bytearray()
    body.extend(f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode("utf-8"))
    body.extend(json.dumps(metadata).encode("utf-8"))
    body.extend(f"\r\n--{boundary}\r\nContent-Type: video/mp4\r\n\r\n".encode("utf-8"))
    
    with open(video_path, "rb") as f:
        body.extend(f.read())
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": f"multipart/related; boundary={boundary}"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=300) as res:
                res_data = json.loads(res.read().decode("utf-8"))
                return res_data["id"]
        except Exception as e:
            last_err = e
            print(f"[Upload Attempt {attempt}/{max_retries} Notice] {e}")
            if attempt < max_retries:
                time.sleep(5 * attempt)

    raise last_err or Exception("Upload failed after retries")

def run_pipeline(videos_per_channel: int = 1):
    """Main execution orchestrator for multi-channel Google Drive uploads"""
    print("=== Multi-Channel 5,000 Video Google Drive Pipeline Starting ===")

    # 1. Fetch Drive configuration
    try:
        drive_res = urllib.request.urlopen(f"{FIREBASE_URL}/drive_config.json", timeout=10)
        drive_cfg = json.loads(drive_res.read().decode("utf-8"))
        folder_id = drive_cfg.get("folderId")
        drive_refresh = drive_cfg.get("refreshToken")
    except Exception as e:
        send_telegram(f"❌ *Drive Config Error:* Could not read drive configuration: {e}")
        return

    if not folder_id or not drive_refresh:
        send_telegram("❌ *Drive Config Error:* Folder ID or Drive Refresh Token missing in Firebase.")
        return

    drive_token = get_access_token(drive_refresh)
    print(f"Acquired Drive access token for folder: {folder_id}")

    # 2. Fetch Connected Channels
    try:
        ch_res = urllib.request.urlopen(f"{FIREBASE_URL}/channels.json", timeout=10)
        all_channels = json.loads(ch_res.read().decode("utf-8"))
    except Exception as e:
        send_telegram(f"❌ *Channels Error:* Could not read channels from Firebase: {e}")
        return

    # Filter channels: Skip GTA6-INDIA as requested by Suraj sir (quota completed today)
    target_channels = []
    for ch_id, ch_info in all_channels.items():
        ch_name = ch_info.get("channelName", "")
        # Suraj sir: "suno gt6 wale me aaja ka complte ho gya he quta ok to baki ke chennl par drive wale video upload karo"
        if "GTA6" in ch_name.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            print(f"Skipping {ch_name} ({ch_id}) - Quota completed today.")
            continue
        if ch_info.get("refreshToken"):
            target_channels.append(ch_info)

    if not target_channels:
        send_telegram("⚠️ *Notice:* No active target channels found for Drive uploads.")
        return

    print(f"Targeting {len(target_channels)} channels for Drive uploads: {[c.get('channelName') for c in target_channels]}")

    # 3. Fetch Drive video files
    drive_files = get_drive_files(folder_id, drive_token, limit=60)
    uploaded_ids = get_uploaded_drive_file_ids()
    available_files = [f for f in drive_files if f["id"] not in uploaded_ids]

    print(f"Total files in folder: {len(drive_files)}, Already uploaded: {len(uploaded_ids)}, Available: {len(available_files)}")

    if not available_files:
        send_telegram("⚠️ *Notice:* No new un-uploaded videos found in Google Drive folder.")
        return

    file_index = 0
    total_uploaded = 0

    # 4. Upload loop per channel
    for ch in target_channels:
        ch_name = ch.get("channelName", "YouTube Channel").strip()
        ch_id = ch.get("channelId")
        ch_refresh = ch.get("refreshToken")

        print(f"\n--- Processing Channel: {ch_name} ({ch_id}) ---")

        for i in range(videos_per_channel):
            if file_index >= len(available_files):
                print("No more available files in batch.")
                break

            target_file = available_files[file_index]
            file_index += 1
            file_id = target_file["id"]
            file_name = target_file["name"]
            raw_title = BEAMNG_VIRAL_TITLES[(file_index - 1) % len(BEAMNG_VIRAL_TITLES)]

            temp_raw = os.path.abspath(f"temp_raw_{file_id}.mp4")
            temp_edited = os.path.abspath(f"temp_edited_{file_id}.mp4")

            try:
                # Step 1: Download
                print(f"[{ch_name}] Downloading {file_name} from Drive...")
                send_telegram(
                    f"📥 *[{ch_name}] Step 1/3: Downloading*\n"
                    f"• Video: `{file_name}`\n"
                    f"• Source: Google Drive Bundle (5,000 Videos)"
                )
                download_drive_video(file_id, temp_raw, drive_token)

                # Step 2: Edit
                print(f"[{ch_name}] Editing video (9:16 vertical crop, audio tuning, no watermark)...")
                send_telegram(
                    f"🎬 *[{ch_name}] Step 2/3: Editing Video*\n"
                    f"• Applying 9:16 Vertical Framing\n"
                    f"• Anti-Content-ID Audio Tuning (1.03x)\n"
                    f"• Watermark: None (Channel Name Skipped per instruction)"
                )
                edit_ok = edit_video_clip(temp_raw, temp_edited)
                upload_file = temp_edited if edit_ok else temp_raw

                # Step 3: Upload
                print(f"[{ch_name}] Uploading to YouTube...")
                send_telegram(
                    f"🚀 *[{ch_name}] Step 3/3: Uploading to YouTube*\n"
                    f"• Title: *{raw_title}*\n"
                    f"• Format: YouTube Short (#Shorts)"
                )

                ch_access_token = get_access_token(ch_refresh)
                yt_video_id = upload_to_youtube(upload_file, raw_title, ch_access_token)

                # Success Notification
                video_url = f"https://youtu.be/{yt_video_id}"
                print(f"SUCCESS: Uploaded to {ch_name}! ID: {yt_video_id}")
                send_telegram(
                    f"✅ *[{ch_name}] Video Uploaded Successfully!* 🎉\n\n"
                    f"📌 *Title:* {raw_title} #Shorts\n"
                    f"🔗 *Video Link:* {video_url}\n"
                    f"📁 *Source File:* `{file_name}`\n"
                    f"📊 *Status:* Public Short Active"
                )

                # Record in Firebase
                record_uploaded_file(file_id, file_name, ch_id, ch_name, yt_video_id, raw_title)
                total_uploaded += 1

            except Exception as ex:
                err_msg = str(ex)
                print(f"ERROR uploading to {ch_name}: {err_msg}")
                send_telegram(f"⚠️ *[{ch_name}] Upload Notice:* {err_msg}")
            finally:
                # Zero-Storage Guarantee: Wipe local temp files immediately
                for p in [temp_raw, temp_edited]:
                    if os.path.exists(p):
                        try:
                            os.remove(p)
                        except Exception:
                            pass

            # Small delay between uploads
            time.sleep(4)

    send_telegram(
        f"🏁 *Multi-Channel Upload Batch Complete!* 🚀\n\n"
        f"• Total Videos Uploaded: *{total_uploaded}*\n"
        f"• Channels Updated: *{len(target_channels)}*\n"
        f"• Source: 5,000+ BeamNG Google Drive Bundle\n"
        f"• All temporary files wiped (Zero-Storage Policy)"
    )
    print("=== Pipeline Execution Finished Successfully ===")

if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    run_pipeline(videos_per_channel=count)
