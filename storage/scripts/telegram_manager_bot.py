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

BOT_TOKEN = get_conf("TELEGRAM_BOT_TOKEN", "8512499007:AAE2du0m0FMAlJu1FXv_UmkhEQBg0arrD0A")
CREATOR_ID = int(get_conf("TELEGRAM_CREATOR_ID", "9052978168"))
CREATOR_USERNAME = get_conf("TELEGRAM_CREATOR_USERNAME", "Surajpatel223").replace("@", "")

GOOGLE_CLIENT_ID = get_conf("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = get_conf("GOOGLE_CLIENT_SECRET")
FIREBASE_DATABASE_URL = get_conf("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com").rstrip("/")

LLM_API_KEY = get_conf("LLM_API_KEY", "sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F")
LLM_BASE_URL = get_conf("LLM_BASE_URL", "https://api.bluesminds.com/v1")
LLM_MODEL = get_conf("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")

DAILY_CHANNEL_LIMIT = 10
conversation_history = []
last_stats_state = {"subscribers": {}, "video_views": {}}

# Active upload tracking
active_pipeline_process = None
active_pipeline_info = {"is_running": False, "channel": "all", "count": 0, "start_time": 0}

# Known channel alias mapping for fuzzy matching
CHANNEL_ALIASES = {
    "UCOkeAWVV2ES-p9-75e2QH3A": {
        "name": "GTA6-INDIA",
        "aliases": ["gt6", "gta6", "gta 6", "gta", "gta-india", "channel 1", "gta channel"]
    },
    "UC0ETQHUTkhw1d7Ylu30FbIQ": {
        "name": "Drive X",
        "aliases": ["drive x", "drivex", "drive", "agsc", "cart", "agsc cart", "channel 2"]
    },
    "UCKJcMheLl_FJWeEWaz073MQ": {
        "name": "AutoTest YT",
        "aliases": ["autotest", "auto test", "autotest yt", "fashion", "d&v", "d & v", "d and v", "dv", "channel 3"]
    },
    "UCkJXq3gCfROIFW4UEK4A8Pg": {
        "name": "CrashZone",
        "aliases": ["crashzone", "crash zone", "crash", "cinema", "nest", "cinema nest", "channel 4"]
    }
}

# ==========================================
# 1. Telegram Bot API Communication
# ==========================================
def send_telegram(chat_id: int, text: str, reply_to_message_id: int = None):
    """Send text message to Telegram user via Bot API with plain text fallback"""
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
            with urllib.request.urlopen(req, timeout=12) as res:
                return json.loads(res.read().decode("utf-8"))
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
# 2. Firebase & State Helpers
# ==========================================
def get_stop_flags() -> dict:
    """Retrieve current stop flags from Firebase RTDB"""
    try:
        url = f"{FIREBASE_DATABASE_URL}/system_control/stop_flags.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except Exception:
        return {}

def set_stop_flags(data: dict):
    """Write stop flags to Firebase RTDB"""
    try:
        url = f"{FIREBASE_DATABASE_URL}/system_control/stop_flags.json"
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT"
        )
        urllib.request.urlopen(req, timeout=6)
    except Exception as e:
        print(f"[Set Stop Flags Notice] {e}")

def get_quota_status() -> dict:
    """Retrieve quota status per channel from Firebase RTDB"""
    try:
        url = f"{FIREBASE_DATABASE_URL}/system_control/quota_status.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except Exception:
        return {}

def log_system_event(event_type: str, details: str):
    """Log an execution event in Firebase RTDB"""
    try:
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        item = {"timestamp": ts, "type": event_type, "details": details}
        url = f"{FIREBASE_DATABASE_URL}/system_control/logs.json"
        req = urllib.request.Request(
            url,
            data=json.dumps(item).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

def sync_channel_title_to_db(channel_id: str, new_title: str):
    """Sync dynamic channel title to Firebase"""
    if not new_title:
        return
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels/{channel_id}/channelName.json"
        req = urllib.request.Request(
            url,
            data=json.dumps(new_title).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

# ==========================================
# 3. Fuzzy Channel Matcher
# ==========================================
def match_channel(query: str) -> dict:
    """Fuzzy match channel by current title, historical names, or channel ID"""
    if not query:
        return None
    lower = query.strip().lower()

    # Load connected channels from Firebase
    channels_map = {}
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels.json"
        with urllib.request.urlopen(url, timeout=5) as res:
            channels_map = json.loads(res.read().decode("utf-8") or "{}")
    except Exception:
        pass

    for ch_id, info in channels_map.items():
        name = (info.get("channelName") or "").strip()
        if name and name.lower() in lower:
            return {"channelId": ch_id, "channelName": name}
        for w in name.lower().split():
            if len(w) > 2 and re.search(r'\b' + re.escape(w) + r'\b', lower):
                return {"channelId": ch_id, "channelName": name}

    for ch_id in channels_map.keys():
        if ch_id.lower() in lower:
            return {"channelId": ch_id, "channelName": channels_map[ch_id].get("channelName", ch_id)}

    for ch_id, meta in CHANNEL_ALIASES.items():
        live_name = channels_map.get(ch_id, {}).get("channelName", meta["name"])
        if meta["name"].lower() in lower:
            return {"channelId": ch_id, "channelName": live_name}
        for alias in meta["aliases"]:
            if re.search(r'\b' + re.escape(alias) + r'\b', lower) or alias in lower:
                return {"channelId": ch_id, "channelName": live_name}

    return None

# ==========================================
# 4. Multi-Channel YouTube API & Data Fetching
# ==========================================
def get_channel_token(refresh_token: str, client_id: str = None, client_secret: str = None) -> str:
    url = "https://oauth2.googleapis.com/token"
    payload = urllib.parse.urlencode({
        "client_id": client_id or GOOGLE_CLIENT_ID,
        "client_secret": client_secret or GOOGLE_CLIENT_SECRET,
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
        with urllib.request.urlopen(url, timeout=6) as res:
            data = json.loads(res.read().decode("utf-8") or "{}")
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}

def fetch_single_channel_fast(ch_id: str, refresh_token: str, client_id: str = None, client_secret: str = None) -> dict:
    """Fetch live channel stats and auto-sync updated channel name from YouTube API"""
    try:
        token = get_channel_token(refresh_token, client_id, client_secret)
        ch_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true"
        req = urllib.request.Request(ch_url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=8) as res:
            ch_data = json.loads(res.read().decode("utf-8"))
        items = ch_data.get("items", [])
        if items:
            ch = items[0]
            stats = ch.get("statistics", {})
            snippet = ch.get("snippet", {})
            live_title = snippet.get("title", "YouTube Channel").strip()

            sync_channel_title_to_db(ch_id, live_title)

            return {
                "channelId": ch_id,
                "title": live_title,
                "subscribers": int(stats.get("subscriberCount", 0)),
                "videos": int(stats.get("videoCount", 0)),
                "views": int(stats.get("viewCount", 0))
            }
    except Exception as e:
        print(f"[Fetch Channel Fast Error {ch_id}]: {e}")
    meta = CHANNEL_ALIASES.get(ch_id, {})
    return {"channelId": ch_id, "title": meta.get("name", "Channel"), "subscribers": 0, "videos": 0, "views": 0}

def get_today_upload_stats() -> dict:
    """Fetch count of videos uploaded today per channel"""
    today_str = time.strftime("%Y-%m-%d", time.gmtime())
    counts = {"UCOkeAWVV2ES-p9-75e2QH3A": 10} # GTA6-INDIA
    try:
        url = f"{FIREBASE_DATABASE_URL}/uploaded_drive_files.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=6) as res:
            data = json.loads(res.read().decode("utf-8") or "{}")
            if data and isinstance(data, dict):
                for item in data.values():
                    ch_id = item.get("channelId")
                    up_at = item.get("uploadedAt", "")
                    if ch_id and up_at.startswith(today_str):
                        counts[ch_id] = counts.get(ch_id, 0) + 1
    except Exception:
        pass
    return counts

def get_all_channels_status() -> dict:
    """Tool: Get live operational status across all 4 channels"""
    channels = get_connected_channels()
    today_counts = get_today_upload_stats()
    stop_flags = get_stop_flags()
    quota_status = get_quota_status()

    results = {}
    for ch_id, meta in CHANNEL_ALIASES.items():
        ch_info = channels.get(ch_id, {})
        rf = ch_info.get("refreshToken")

        stats = None
        if rf:
            stats = fetch_single_channel_fast(ch_id, rf, ch_info.get("clientId"), ch_info.get("clientSecret"))

        if not stats:
            stats = {
                "channelId": ch_id,
                "title": ch_info.get("channelName", meta["name"]),
                "subscribers": 0,
                "videos": 0,
                "views": 0
            }

        used = today_counts.get(ch_id, 0)
        if "GTA6" in stats["title"].upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            used = 10
        rem = max(0, DAILY_CHANNEL_LIMIT - used)

        is_stopped = stop_flags.get("STOP_ALL", False) or stop_flags.get("channels", {}).get(ch_id, False)
        ch_quota = quota_status.get(ch_id, {})
        quota_exhausted = ch_quota.get("status") == "quota_exhausted" or rem == 0

        results[ch_id] = {
            "channelId": ch_id,
            "channelName": stats["title"],
            "subscribers": stats["subscribers"],
            "videos": stats["videos"],
            "views": stats["views"],
            "today_uploaded": used,
            "today_remaining": rem,
            "daily_limit": DAILY_CHANNEL_LIMIT,
            "is_stopped": is_stopped,
            "quota_exhausted": quota_exhausted,
            "next_reset": ch_quota.get("resets_at", "5:30 AM IST / Pacific Midnight")
        }

    return results

def get_channel_status(channel_name: str) -> dict:
    """Tool: Get live data for one specific channel"""
    matched = match_channel(channel_name)
    if not matched:
        return {"error": f"Channel '{channel_name}' identify nahi hua. Kripya naam dobara batayein."}

    all_stat = get_all_channels_status()
    return all_stat.get(matched["channelId"], {"channelName": matched["channelName"]})

def get_db_channel_uploads() -> dict:
    """Fetch video upload links from Firebase RTDB"""
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels.json"
        with urllib.request.urlopen(url, timeout=5) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except Exception:
        return {}

def get_logs(limit: int = 8) -> list:
    """Tool: Get recent logs and upload activity"""
    logs = []
    try:
        url = f"{FIREBASE_DATABASE_URL}/system_control/logs.json?orderBy=\"$key\"&limitToLast={limit}"
        with urllib.request.urlopen(url, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8") or "{}")
            for k in sorted(data.keys(), reverse=True):
                logs.append(data[k])
    except Exception:
        pass
    return logs

# ==========================================
# 5. Core Control Tools (Stop, Resume, Upload)
# ==========================================
def stop_all_uploads() -> dict:
    """Tool: Immediately stop ALL uploading processes and set global STOP flag"""
    global active_pipeline_process, active_pipeline_info

    stop_data = {
        "STOP_ALL": True,
        "channels": {
            "UC0ETQHUTkhw1d7Ylu30FbIQ": True,
            "UCKJcMheLl_FJWeEWaz073MQ": True,
            "UCkJXq3gCfROIFW4UEK4A8Pg": True,
            "UCOkeAWVV2ES-p9-75e2QH3A": True
        },
        "stopped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reason": "Stopped by Owner Command via Bot"
    }
    set_stop_flags(stop_data)

    killed = False
    if active_pipeline_process and active_pipeline_process.poll() is None:
        try:
            print(f"[STOP] Terminating active pipeline PID: {active_pipeline_process.pid}")
            active_pipeline_process.terminate()
            time.sleep(1)
            if active_pipeline_process.poll() is None:
                active_pipeline_process.kill()
            killed = True
        except Exception as e:
            print(f"[Process Kill Notice] {e}")

    active_pipeline_info["is_running"] = False
    log_system_event("STOP_ALL", "Owner executed stop_all_uploads via Bot.")

    return {
        "status": "stopped",
        "scope": "all",
        "process_killed": killed,
        "message": "🛑 Saari uploading band kar di hai Suraj sir. Running processes terminate kar diye gaye hain aur sabhi jobs hold pe hain."
    }

def stop_channel(channel_name: str) -> dict:
    """Tool: Stop uploading on a specific channel, other channels continue"""
    global active_pipeline_process, active_pipeline_info

    matched = match_channel(channel_name)
    if not matched:
        return {"error": f"Channel '{channel_name}' identify nahi ho paya. Kripya sahi channel naam batayein."}

    ch_id = matched["channelId"]
    ch_name = matched["channelName"]

    stop_data = get_stop_flags()
    if "channels" not in stop_data or not isinstance(stop_data["channels"], dict):
        stop_data["channels"] = {}
    stop_data["channels"][ch_id] = True
    stop_data["stopped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    set_stop_flags(stop_data)

    killed = False
    if active_pipeline_process and active_pipeline_process.poll() is None:
        if active_pipeline_info.get("channel") == ch_name or active_pipeline_info.get("channel") == ch_id:
            try:
                active_pipeline_process.terminate()
                time.sleep(1)
                if active_pipeline_process.poll() is None:
                    active_pipeline_process.kill()
                killed = True
                active_pipeline_info["is_running"] = False
            except Exception:
                pass

    log_system_event("STOP_CHANNEL", f"Stopped channel {ch_name} ({ch_id})")

    return {
        "status": "stopped",
        "scope": "single",
        "channel": ch_name,
        "channelId": ch_id,
        "process_killed": killed,
        "message": f"🛑 Channel '{ch_name}' ki uploading band kar di hai Suraj sir, baaki channels chalte rahenge."
    }

def resume_uploads(channel: str = "all") -> dict:
    """Tool: Clear stop flag and resume uploading permissions"""
    stop_data = get_stop_flags()

    if channel in ["all", "sab", "sabhi", None]:
        stop_data["STOP_ALL"] = False
        stop_data["channels"] = {}
        stop_data["resumed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        set_stop_flags(stop_data)
        log_system_event("RESUME_ALL", "Owner resumed all uploads.")
        return {"status": "resumed", "scope": "all", "message": "🟢 Sabhi channels par uploading resume kar di gayi hai Suraj sir."}
    else:
        matched = match_channel(channel)
        if matched:
            ch_id = matched["channelId"]
            ch_name = matched["channelName"]
            if "channels" in stop_data and isinstance(stop_data["channels"], dict):
                stop_data["channels"][ch_id] = False
            stop_data["STOP_ALL"] = False
            set_stop_flags(stop_data)
            log_system_event("RESUME_CHANNEL", f"Resumed channel {ch_name}")
            return {"status": "resumed", "scope": "single", "channel": ch_name, "message": f"🟢 Channel '{ch_name}' ki uploading resume kar di gayi hai Suraj sir."}
        else:
            return {"error": f"Channel '{channel}' identify nahi ho saka."}

def upload_now(channel: str = "all", count: int = 1) -> dict:
    """Tool: Trigger upload process for specific channel or all channels"""
    global active_pipeline_process, active_pipeline_info

    stop_data = get_stop_flags()
    if stop_data.get("STOP_ALL", False):
        return {
            "success": False,
            "error": "STOP_FLAG_ACTIVE",
            "message": "Uploading abhi STOP mode pe hai Suraj sir. Pehle 'resume karo' boliye, tabhi start hoga."
        }

    target_scope = "all"
    target_name = "All Channels"
    if channel and channel.lower() not in ["all", "sab", "sabhi"]:
        matched = match_channel(channel)
        if not matched:
            return {
                "success": False,
                "error": "UNCLEAR_CHANNEL",
                "message": f"Channel '{channel}' identify nahi ho paya. Kaun sa channel, ya sabhi channels pe upload karun?"
            }
        target_scope = matched["channelId"]
        target_name = matched["channelName"]

        if stop_data.get("channels", {}).get(target_scope, False):
            return {
                "success": False,
                "error": "CHANNEL_STOPPED",
                "message": f"Channel '{target_name}' pe stop flag laga hua hai. Pehle is channel ko 'resume karo' boliye."
            }

    if active_pipeline_process and active_pipeline_process.poll() is None:
        return {
            "success": False,
            "error": "ALREADY_RUNNING",
            "message": f"Ek upload process pehle se background me chal raha hai ({active_pipeline_info.get('channel')})."
        }

    pipeline_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "multi_channel_pipeline.py"))
    cmd = [sys.executable, pipeline_script, str(count), target_scope]

    try:
        active_pipeline_process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        active_pipeline_info = {
            "is_running": True,
            "channel": target_name,
            "count": count,
            "start_time": time.time(),
            "pid": active_pipeline_process.pid
        }
        log_system_event("UPLOAD_START", f"Started upload for {target_name} ({count} videos), PID: {active_pipeline_process.pid}")

        return {
            "success": True,
            "channel": target_name,
            "count": count,
            "pid": active_pipeline_process.pid,
            "message": f"🚀 Channel '{target_name}' par {count} video(s) upload shuru kar diya hai Suraj sir! Logs yahan aate rahenge."
        }
    except Exception as e:
        return {"success": False, "error": str(e), "message": f"Process launch error: {e}"}

# ==========================================
# 6. Live Context & Nemotron LLM Executive Brain
# ==========================================
def build_live_system_context() -> str:
    """Build live factual real-time context for the Executive LLM on every turn"""
    all_status = get_all_channels_status()
    db_uploads = get_db_channel_uploads()
    stop_flags = get_stop_flags()
    logs = get_logs(limit=4)

    lines = []
    for ch_id, s in all_status.items():
        name = s["channelName"]
        subs = s["subscribers"]
        vids = s["videos"]
        views = s["views"]
        used = s["today_uploaded"]
        rem = s["today_remaining"]
        exh = s["quota_exhausted"]
        st = s["is_stopped"]

        ch_db = db_uploads.get(ch_id)
        if not ch_db:
            for k, v in db_uploads.items():
                if v.get("channelName", "").strip().lower() == name.lower():
                    ch_db = v
                    break
        v_list = []
        if ch_db:
            for v in ch_db.get("videos", []):
                if v.get("isToday"):
                    v_list.append(f"  • '{v['title']}' (https://youtu.be/{v['id']})")

        status_flag = "🛑 STOPPED" if st else ("⏳ Quota Full / Rolling Limit" if exh else f"🟢 Active ({rem} capacity left)")
        recent_vids = v_list[-4:] if len(v_list) > 4 else v_list
        v_str = "\n".join(recent_vids) if recent_vids else "  (Aaj abhi tak koi naya video upload nahi hua)"

        lines.append(
            f"• Channel: {name} (ID: `{ch_id}`)\n"
            f"  Status: {status_flag}\n"
            f"  Subscribers: {subs} | Total Videos: {vids} | Views: {views}\n"
            f"  Aaj Ka Quota: {used}/10 Uploaded | {rem} Videos Remaining Today\n"
            f"  Recent Published Videos ({len(v_list)} total today):\n{v_str}"
        )

    channels_context = "\n\n".join(lines)
    stop_summary = "STOP_ALL ACTIVE (Saari uploading ruki hui hai)" if stop_flags.get("STOP_ALL") else "Uploading Allowed (Flags normal)"
    recent_logs_str = "\n".join([f"[{l.get('timestamp','')}] {l.get('type')}: {l.get('details')}" for l in logs]) if logs else "No recent errors"

    prompt = f"""Tum is YouTube automation system ke Executive AI ho. Tum Telegram (@Youtube_manager123_bot) ke through owner (Suraj sir) se baat karte ho aur poora automation control karte ho (4 channels: GTA6-INDIA, Drive X, AutoTest YT, CrashZone). Daily 10 videos per channel target hai.

Rules:
1. Owner jo bole, pehle use dhyan se samjho. Phir soch ke jawab do aur kaam karo. Koi fixed jawab ya template nahi.
2. Kisi bhi status/update ke sawal pe pehle tools se real data lo, phir uske hisaab se jawab do. Kabhi andaaza ya purana jawab mat do.
3. Owner ka sawal jo ho, usi ka seedha jawab do. Ek hi line baar baar mat bolo.
4. Owner trend, gaming strategy, IShowSpeed live clips, ya normal baat kare to ek smart, samajhdaar partner ki tarah baat karo.
5. Owner ka order sabse upar hai. "Stop", "ruko", "band karo", "pause" bole to turant maano.
6. Kaam karne ke baad batao ki kya kiya aur result kya aaya. Agar kuch fail hua ya quota limit hai to sach batao aur exact reason batao.
7. Agar order unclear ho to ek chhota sawal poochho, warna seedha kaam karo.
8. SCOPE RULE: Specific channel bola to sirf us channel pe action lo. "Sabhi/all" bola tabhi sab pe karo. Unclear ho to poochho: "Kaun sa channel, ya sabhi?"
9. Channel ka naam fuzzy match karo (Drive X, AutoTest YT, CrashZone, GTA6-INDIA).
10. Address owner respectfully as 'Suraj sir'. Jawab hamesha natural, intelligent Hinglish mein do.

=== LIVE SYSTEM DATA (REAL-TIME STATUS FROM TOOLS) ===
System Stop Status: {stop_summary}
Recent Events:
{recent_logs_str}

Channels Live Snapshot:
{channels_context}

Source Storage: 5,000+ BeamNG Google Drive Bundle + IShowSpeed HD Live Stream Clipper Pipeline.
YouTube Quota Logic: Google Cloud Project Quota is 10,000 units/day (each upload costs 1,600 units = ~6 uploads max). Additionally, YouTube limits standard channels to 10 uploads per rolling 24 hours (uploadLimitExceeded).
"""
    return prompt

def query_executive_llm(user_message: str, tool_result_context: str = "") -> str:
    """Call Nemotron LLM with live system context, multi-model fallback, and reasoning"""
    global conversation_history

    system_prompt = build_live_system_context()
    if tool_result_context:
        system_prompt += f"\n\n=== RECENT TOOL EXECUTION RESULT ===\n{tool_result_context}\n"

    system_message = {"role": "system", "content": system_prompt}

    if not conversation_history:
        conversation_history = [system_message]
    else:
        conversation_history[0] = system_message

    conversation_history.append({"role": "user", "content": user_message})

    if len(conversation_history) > 13:
        conversation_history = [conversation_history[0]] + conversation_history[-12:]

    # Primary and fallback models
    candidate_models = [
        LLM_MODEL,
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "nvidia/nemotron-3.5-lightning-30b-a3b"
    ]

    for model_name in candidate_models:
        try:
            url = f"{LLM_BASE_URL.rstrip('/')}/chat/completions"
            payload = {
                "model": model_name,
                "messages": conversation_history,
                "max_tokens": 800,
                "temperature": 0.65
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {LLM_API_KEY}"
                }
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                msg = data.get("choices", [{}])[0].get("message", {})
                content = msg.get("content")

                if not content:
                    reasoning = msg.get("reasoning_content") or ""
                    if "**Response:**" in reasoning:
                        content = reasoning.split("**Response:**")[-1].strip()
                    elif "Response:" in reasoning:
                        content = reasoning.split("Response:")[-1].strip()
                    else:
                        paras = [p.strip() for p in reasoning.split("\n\n") if p.strip()]
                        cand = [p for p in paras if not p.lower().startswith("here's a thinking") and not p.lower().startswith("1.") and not p.lower().startswith("let's") and not p.lower().startswith("we need")]
                        content = cand[-1] if cand else ""

                if content and len(content.strip()) > 5:
                    content = content.strip()
                    conversation_history.append({"role": "assistant", "content": content})
                    return content
        except Exception as e:
            print(f"[LLM Query Notice for {model_name}]: {e}", file=sys.stderr)
            continue

    # Fallback to intelligent factual summary if all upstream LLMs are rate-limited
    all_stat = get_all_channels_status()
    summary_lines = []
    for cid, st in all_stat.items():
        summary_lines.append(f"• *{st['channelName']}*: {st['today_uploaded']}/10 uploaded ({st['today_remaining']} remaining)")
    return (
        f"Namaste Suraj sir! 🙏 Main live status monitor kar raha hoon.\n\n"
        f"📊 *Channels Ka Live Status:*\n" + "\n".join(summary_lines) + "\n\n"
        f"⚡ Google Cloud Quota (10k units) reset hote hi sabhi channels par remaining batches auto-upload ho jayenge! Bataiye, kya action lena hai?"
    )

# ==========================================
# 7. Multi-Channel Views & Activity Tracker Thread
# ==========================================
def multi_channel_views_tracker_thread():
    """Monitors live views and subscriber counts across all 4 channels every 60s"""
    global last_stats_state
    time.sleep(15)

    while True:
        try:
            channels = get_connected_channels()
            for ch_id, ch_info in channels.items():
                rf = ch_info.get("refreshToken")
                if not rf:
                    continue
                stats = fetch_single_channel_fast(ch_id, rf)
                if not stats:
                    continue

                ch_title = stats.get("title", "Channel")
                current_subs = stats.get("subscribers", 0)

                # Track Subscribers
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

        except Exception as e:
            print(f"[Bot Views Tracker Error] {e}")

        time.sleep(60)

# Start activity tracker in background
threading.Thread(target=multi_channel_views_tracker_thread, daemon=True).start()

# ==========================================
# 8. Fast-Path Intent Routing & Telegram Polling Loop
# ==========================================
def handle_incoming_message(chat_id: int, text: str, msg_id: int):
    """Route message through Fast-Path Stop/Control or Nemotron LLM"""
    lower = text.lower().strip()
    send_chat_action(chat_id, "typing")

    # 1. FAST-PATH: Stop / Pause Commands (Executes instantly, zero LLM delay)
    stop_words = ["stop", "ruko", "rok do", "band karo", "pause", "khatam karo", "abort", "stopp"]
    if any(w in lower for w in stop_words) and not any(r in lower for r in ["resume", "chalu", "shuru"]):
        matched = match_channel(lower)
        if matched and not any(all_w in lower for all_w in ["all", "sab", "sabhi", "pure"]):
            # Specific channel stop
            res = stop_channel(matched["channelName"])
            send_telegram(chat_id, res.get("message", f"Channel {matched['channelName']} uploading stopped."), msg_id)
        else:
            # Global stop
            res = stop_all_uploads()
            send_telegram(chat_id, res.get("message", "🛑 Saari uploading band kar di hai Suraj sir."), msg_id)
        return

    # 2. FAST-PATH: Resume Commands
    resume_words = ["resume", "chalu karo", "shuru karo", "restart", "unpause"]
    if any(w in lower for w in resume_words):
        matched = match_channel(lower)
        scope = matched["channelName"] if matched else "all"
        res = resume_uploads(scope)
        send_telegram(chat_id, res.get("message", "Uploading resume kar di gayi hai."), msg_id)
        return

    # 3. FAST-PATH: Upload Now Commands
    if ("upload" in lower and any(w in lower for w in ["karo", "start", "now", "chalu", "shuru"])) or lower == "/upload":
        # Extract count if mentioned
        count = 1
        num_m = re.search(r'\b([1-9]|10)\b', lower)
        if num_m:
            count = int(num_m.group(1))

        matched = match_channel(lower)
        scope = matched["channelName"] if matched else "all"
        res = upload_now(scope, count)
        send_telegram(chat_id, res.get("message"), msg_id)
        return

    # 4. Standard /status Command or Report Request
    if lower in ["/status", "/report", "status", "/channels"]:
        all_stat = get_all_channels_status()
        lines = []
        tot_rem = 0
        tot_used = 0
        for ch_id, s in all_stat.items():
            used = s["today_uploaded"]
            rem = s["today_remaining"]
            tot_used += used
            tot_rem += rem
            tag = "🛑 STOPPED" if s["is_stopped"] else ("⏳ Limit Exceeded" if s["quota_exhausted"] else f"🟢 {rem} Videos Remaining")
            lines.append(
                f"📌 *{s['channelName']}*\n"
                f"  • Subs: *{s['subscribers']}* | Videos: *{s['videos']}* | Views: *{s['views']}*\n"
                f"  • Quota: `{used}/10 Uploaded` ({tag})"
            )
        status_text = (
            f"🤖 *AutoTube Multi-Channel Live Status:*\n\n"
            f"📊 *Upload Summary Today:*\n"
            f"• Total Uploaded Today: *{tot_used} Videos*\n"
            f"• Remaining Capacity Today: *{tot_rem} Videos* 🚀\n\n"
            + "\n\n".join(lines) + "\n\n"
            f"Bataiye Suraj sir, kis channel pe video upload karun ya aur kya update chahiye?"
        )
        send_telegram(chat_id, status_text, msg_id)
        return

    # 5. ALL OTHER QUERIES -> Nemotron LLM Executive Brain
    # Feeds live data context, channel stats, and recent logs to LLM
    print(f"[Executive AI] Querying Nemotron LLM for message: '{text}'...")
    llm_reply = query_executive_llm(text)
    send_telegram(chat_id, llm_reply, msg_id)

def run_telegram_bot_daemon():
    print("==========================================================")
    print("   MachinkoAuto 24/7 AI Executive Manager Bot Daemon       ")
    print(f"   Bot: @Youtube_manager123_bot | Creator: Suraj sir ({CREATOR_ID})")
    print("   LLM Engine: Nemotron-3.5-Lightning + Multi-Channel Tools")
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

                chat = message.get("chat", {})
                chat_id = chat.get("id")
                text = (message.get("text") or "").strip()
                msg_id = message.get("message_id")

                if not text:
                    continue

                # Process message
                handle_incoming_message(chat_id, text, msg_id)

        except Exception as loop_err:
            print(f"[Bot Polling Loop Notice] {loop_err}")
            time.sleep(3)

if __name__ == "__main__":
    run_telegram_bot_daemon()
