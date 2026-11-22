import os
import sys
import json
import time
import re
import urllib.request
import urllib.parse
import threading
import subprocess
from dotenv import load_dotenv

# Load environment
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

# Cloud env fallback
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

BOT_TOKEN = get_conf("TELEGRAM_BOT_TOKEN", "8512499007:AAE2du0m0FMAlJu1FXv_UmkhEQBg0arrD0A")
CREATOR_ID = int(get_conf("TELEGRAM_CREATOR_ID", "9052978168"))
CREATOR_USERNAME = get_conf("TELEGRAM_CREATOR_USERNAME", "Surajpatel223").replace("@", "")

GOOGLE_CLIENT_ID = get_conf("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = get_conf("GOOGLE_CLIENT_SECRET")
FIREBASE_DATABASE_URL = get_conf("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com").rstrip("/")

LLM_API_KEY = get_conf("LLM_API_KEY", "sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F")
LLM_BASE_URL = get_conf("LLM_BASE_URL", "https://api.bluesminds.com/v1")
LLM_MODEL = get_conf("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")

conversation_history = []
last_stats_state = {"subscribers": {}, "video_views": {}}

# ==========================================
# 1. Telegram Bot API Communication
# ==========================================
def send_telegram(chat_id: int, text: str, reply_to_message_id: int = None):
    """Send text message to Telegram user via Bot API with fallback"""
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }
        if reply_to_message_id:
            payload["reply_to_message_id"] = reply_to_message_id

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=12) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:
        try:
            payload.pop("parse_mode", None)
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=12)
        except Exception as e:
            print(f"[Telegram Send Error] {e}")

def send_chat_action(chat_id: int, action: str = "typing"):
    """Show typing status in Telegram chat"""
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendChatAction"
        data = json.dumps({"chat_id": chat_id, "action": action}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

# ==========================================
# 2. Multi-Channel YouTube API
# ==========================================
def get_channel_token(refresh_token: str) -> str:
    url = "https://oauth2.googleapis.com/token"
    payload = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data["access_token"]

def get_connected_channels() -> dict:
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data and isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}

def fetch_channel_stats(channel_id: str, refresh_token: str) -> dict:
    try:
        token = get_channel_token(refresh_token)
        ch_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true"
        req = urllib.request.Request(ch_url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=10) as res:
            ch_data = json.loads(res.read().decode("utf-8"))

        items = ch_data.get("items", [])
        if not items:
            return None

        ch = items[0]
        stats = ch.get("statistics", {})
        snippet = ch.get("snippet", {})
        pl_id = ch.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")

        recent_uploads = []
        if pl_id:
            try:
                pl_url = f"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={pl_id}&maxResults=5"
                pl_req = urllib.request.Request(pl_url, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(pl_req, timeout=10) as pl_res:
                    pl_data = json.loads(pl_res.read().decode("utf-8"))
                    raw = pl_data.get("items", [])
                    v_ids = [it["snippet"]["resourceId"]["videoId"] for it in raw if it.get("snippet", {}).get("resourceId", {}).get("videoId")]

                    stats_map = {}
                    if v_ids:
                        v_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={','.join(v_ids)}"
                        v_req = urllib.request.Request(v_url, headers={"Authorization": f"Bearer {token}"})
                        with urllib.request.urlopen(v_req, timeout=10) as v_res:
                            v_data = json.loads(v_res.read().decode("utf-8"))
                            for v_item in v_data.get("items", []):
                                stats_map[v_item["id"]] = {
                                    "likes": int(v_item.get("statistics", {}).get("likeCount", 0)),
                                    "views": int(v_item.get("statistics", {}).get("viewCount", 0))
                                }

                    for it in raw:
                        vid = it["snippet"]["resourceId"]["videoId"]
                        s = stats_map.get(vid, {"likes": 0, "views": 0})
                        recent_uploads.append({
                            "id": vid,
                            "title": it["snippet"].get("title", "Untitled"),
                            "publishedAt": it["snippet"].get("publishedAt", ""),
                            "likes": s["likes"],
                            "views": s["views"]
                        })
            except Exception:
                pass

        return {
            "channelId": channel_id,
            "title": snippet.get("title", "YouTube Channel"),
            "subscribers": int(stats.get("subscriberCount", 0)),
            "videos": int(stats.get("videoCount", 0)),
            "views": int(stats.get("viewCount", 0)),
            "recentUploads": recent_uploads
        }
    except Exception as e:
        print(f"[Bot Fetch Stats Error {channel_id}]: {e}")
        return None

def get_network_stats() -> dict:
    channels = get_connected_channels()
    res = {}
    for ch_id, ch_info in channels.items():
        rf = ch_info.get("refreshToken")
        if not rf:
            continue
        st = fetch_channel_stats(ch_id, rf)
        if st:
            res[ch_id] = st
    return res

def format_bot_network_status(network: dict) -> str:
    if not network:
        return "Suraj sir, abhi channels connect check ho raha hai."

    total_subs = sum(s.get("subscribers", 0) for s in network.values())
    total_vids = sum(s.get("videos", 0) for s in network.values())
    total_views = sum(s.get("views", 0) for s in network.values())

    lines = []
    for ch_id, s in network.items():
        name = s.get("title", "Channel")
        status_tag = "Quota Full (Resets 5:30 AM)" if "GTA6" in name.upper() else "Active & Uploading"
        lines.append(
            f"📌 *{name}*\n"
            f"  • Subs: *{s.get('subscribers', 0)}* | Videos: *{s.get('videos', 0)}* | Views: *{s.get('views', 0)}*\n"
            f"  • Status: `{status_tag}`"
        )

    return (
        f"🤖 *AutoTube Live Network Status:*\n\n"
        f"• Connected Channels: *{len(network)}*\n"
        f"• Total Network Subscribers: *{total_subs}*\n"
        f"• Total Network Videos: *{total_vids}*\n"
        f"• Total Network Views: *{total_views}*\n"
        f"• Source Storage: *5,000+ BeamNG Google Drive Bundle*\n\n"
        f"=== *Channels Status:* ===\n"
        + "\n\n".join(lines) + "\n\n"
        f"Yeh Bot aapka 24/7 Live Pipeline Logs & Views Monitor hai! 🚀"
    )

# ==========================================
# 3. Continuous Multi-Channel Views & Activity Tracker Thread
# ==========================================
def multi_channel_views_tracker_thread():
    """Monitors live views and subscriber counts across all 4 channels every 60s"""
    global last_stats_state
    time.sleep(15)

    while True:
        try:
            network = get_network_stats()

            for ch_id, stats in network.items():
                ch_title = stats.get("title", "Channel")
                current_subs = stats.get("subscribers", 0)
                recent_vids = stats.get("recentUploads", [])

                # 1. Track Subscribers
                prev_subs = last_stats_state["subscribers"].get(ch_id)
                if prev_subs is not None and current_subs > prev_subs:
                    diff = current_subs - prev_subs
                    send_telegram(
                        CREATOR_ID,
                        f"🎉 *[{ch_title}] New Subscriber Alert!*\n\n"
                        f"• +{diff} naya subscriber jud chuka hai!\n"
                        f"• Total Subscribers: *{current_subs}* 🚀"
                    )
                last_stats_state["subscribers"][ch_id] = current_subs

                # 2. Track Views per video
                for vid in recent_vids:
                    v_id = vid.get("id")
                    v_title = vid.get("title", "Shorts Video")
                    current_views = vid.get("views", 0)

                    prev_views = last_stats_state["video_views"].get(v_id)
                    if prev_views is not None and current_views > prev_views:
                        diff = current_views - prev_views
                        send_telegram(
                            CREATOR_ID,
                            f"📈 *[{ch_title}] Live View Log!*\n\n"
                            f"• Video: *\"{v_title[:40]}\"*\n"
                            f"• Views: +{diff} naye views! (Total: *{current_views}* views) 👁️🔥\n"
                            f"• Link: https://youtu.be/{v_id}"
                        )
                    last_stats_state["video_views"][v_id] = current_views

        except Exception as e:
            print(f"[Bot Views Tracker Error] {e}")

        time.sleep(60)

# Start activity tracker in background
threading.Thread(target=multi_channel_views_tracker_thread, daemon=True).start()

# ==========================================
# 4. Background Execution of Drive Upload
# ==========================================
active_batch_running = False

def run_drive_upload_batch(count: int = 3):
    global active_batch_running
    if active_batch_running:
        send_telegram(CREATOR_ID, "⚡ *Notice Suraj sir:* Ek upload batch pehle se background me run ho raha hai!")
        return

    active_batch_running = True
    def _worker():
        global active_batch_running
        try:
            send_telegram(
                CREATOR_ID,
                f"🎬 *Multi-Channel Drive Upload Batch Started!*\n\n"
                f"• Target Channels: AGSC CART, D& V fashion, Cinema Nest\n"
                f"• Videos per channel: {count}\n"
                f"• Source: 5,000 BeamNG Drive Bundle\n"
                f"• Har video ke step logs yahan aate rahenge! 🚀"
            )
            script = os.path.abspath(os.path.join(os.path.dirname(__file__), "multi_channel_pipeline.py"))
            subprocess.run([sys.executable, script, str(count)], timeout=1800)
        except Exception as e:
            send_telegram(CREATOR_ID, f"⚠️ *Upload Batch Notice:* {e}")
        finally:
            active_batch_running = False

    threading.Thread(target=_worker, daemon=True).start()

# ==========================================
# 5. Telegram Bot Polling Loop
# ==========================================
def run_telegram_bot_daemon():
    print("==========================================================")
    print("   MachinkoAuto.Ai Multi-Channel Live Activity & Logs Bot  ")
    print(f"   Bot: @Youtube_manager123_bot | Creator: Suraj sir ({CREATOR_ID})")
    print("==========================================================")

    last_offset = 0

    while True:
        try:
            url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={last_offset}&timeout=30"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=40) as res:
                data = json.loads(res.read().decode("utf-8"))

            if not data.get("ok"):
                time.sleep(2)
                continue

            updates = data.get("result", [])
            for update in updates:
                last_offset = update["update_id"] + 1

                message = update.get("message") or update.get("edited_message")
                if not message:
                    continue

                from_user = message.get("from", {})
                chat = message.get("chat", {})
                chat_id = chat.get("id")
                text = (message.get("text") or "").strip()
                msg_id = message.get("message_id")

                if not text:
                    continue

                lower = text.lower()
                send_chat_action(chat_id, "typing")

                # /start or /help
                if lower in ["/start", "/help", "help", "hi", "hello"]:
                    send_telegram(
                        chat_id,
                        f"👋 *Namaste Suraj sir!*\n\n"
                        f"Main aapka **Official AutoTube System Operations & Logs Bot** hoon! 🤖\n\n"
                        f"• **Yahan kya aayega:**\n"
                        f"  1. 🔍 Video finding & sourcing logs\n"
                        f"  2. 🎬 9:16 vertical crop & subtitles rendering logs\n"
                        f"  3. 🚀 YouTube upload live links\n"
                        f"  4. 📈 Naye Views & Subscriber real-time alert logs\n\n"
                        f"• **Commands:**\n"
                        f"  • `/status` - Multi-Channel Live Report\n"
                        f"  • `/upload` - Upload next batch from Google Drive\n"
                        f"  • `/channels` - Connected channels list\n\n"
                        f"*(Personal conversation aur channel reports ke liye aap apne Telegram AI Manager account par direct chat kar sakte hain!)*",
                        msg_id
                    )
                    continue

                # /status
                if "/status" in lower or "status" in lower or "report" in lower or "analytics" in lower:
                    net = get_network_stats()
                    send_telegram(chat_id, format_bot_network_status(net), msg_id)
                    continue

                # /upload
                if "/upload" in lower or ("upload" in lower and "karo" in lower):
                    run_drive_upload_batch(count=3)
                    continue

                # Default fallback response
                send_telegram(
                    chat_id,
                    f"Suraj sir, main 24/7 active logs bot hoon! Agar channels ka live status dekhna hai to `/status` bhejiye, ya video upload karni hai to `/upload` bhejiye. 🚀",
                    msg_id
                )

        except Exception as loop_err:
            print(f"[Bot Loop Error] {loop_err}")
            time.sleep(3)

if __name__ == "__main__":
    run_telegram_bot_daemon()
