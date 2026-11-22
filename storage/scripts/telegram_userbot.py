import os
import sys
import asyncio
import json
import urllib.request
import urllib.parse
import traceback
import time
import re
import subprocess
import concurrent.futures
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

API_ID = int(get_conf("TELEGRAM_API_ID", "38595785"))
API_HASH = get_conf("TELEGRAM_API_HASH", "061fb3e46d0d9a3076eada93d91c4d81")
CREATOR_USERNAME = get_conf("TELEGRAM_CREATOR_USERNAME", "Surajpatel223").replace("@", "")
CREATOR_ID = int(get_conf("TELEGRAM_CREATOR_ID", "9052978168"))
TELEGRAM_STRING_SESSION = get_conf("TELEGRAM_STRING_SESSION")

GOOGLE_CLIENT_ID = get_conf("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = get_conf("GOOGLE_CLIENT_SECRET")
YOUTUBE_REFRESH_TOKEN = get_conf("YOUTUBE_REFRESH_TOKEN")
FIREBASE_DATABASE_URL = get_conf("FIREBASE_DATABASE_URL", "https://ai-agent-24af3-default-rtdb.firebaseio.com").rstrip("/")
BOT_TOKEN = get_conf("TELEGRAM_BOT_TOKEN")

LLM_API_KEY = get_conf("LLM_API_KEY", "sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F")
LLM_BASE_URL = get_conf("LLM_BASE_URL", "https://api.bluesminds.com/v1")
LLM_MODEL = get_conf("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")

SESSION_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_ai_user"))
DAILY_CHANNEL_LIMIT = 10

# Global active process and task tracking
active_pipeline_process = None
active_pipeline_info = {"is_running": False, "channel": "all", "count": 0, "start_time": 0}
conversation_history = []

# Known channel alias mapping for intelligent fuzzy matching
CHANNEL_ALIASES = {
    "UCOkeAWVV2ES-p9-75e2QH3A": {
        "name": "GTA6-INDIA",
        "aliases": ["gt6", "gta6", "gta 6", "gta", "gta-india", "channel 1", "gta channel"]
    },
    "UC0ETQHUTkhw1d7Ylu30FbIQ": {
        "name": "AGSC CART",
        "aliases": ["agsc", "cart", "agsc cart", "channel 2", "agsc channel"]
    },
    "UCKJcMheLl_FJWeEWaz073MQ": {
        "name": "D& V fashion ",
        "aliases": ["fashion", "d&v", "d & v", "d and v", "dv", "channel 3", "fashion channel"]
    },
    "UCkJXq3gCfROIFW4UEK4A8Pg": {
        "name": "Cinema Nest",
        "aliases": ["cinema", "nest", "cinema nest", "channel 4", "cinema channel"]
    }
}

# ==========================================
# 1. Firebase State & Stop Flag Helpers
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
        ts = int(time.time() * 1000)
        url = f"{FIREBASE_DATABASE_URL}/system_control/logs/{ts}.json"
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "type": event_type,
            "details": details
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

# ==========================================
# 2. Fuzzy Channel Matcher
# ==========================================
def match_channel(text: str) -> dict | None:
    """Fuzzy match user text to a connected YouTube channel"""
    if not text:
        return None
    lower = text.lower()

    # Exact alias check
    for ch_id, meta in CHANNEL_ALIASES.items():
        if meta["name"].lower() in lower:
            return {"channelId": ch_id, "channelName": meta["name"]}
        for alias in meta["aliases"]:
            # Word boundary search
            if re.search(r'\b' + re.escape(alias) + r'\b', lower):
                return {"channelId": ch_id, "channelName": meta["name"]}

    # Fallback partial substring check
    for ch_id, meta in CHANNEL_ALIASES.items():
        for alias in meta["aliases"]:
            if alias in lower:
                return {"channelId": ch_id, "channelName": meta["name"]}

    return None

# ==========================================
# 3. Core Tools Suite (As Required)
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

def fetch_single_channel_fast(ch_id: str, refresh_token: str) -> dict:
    """Fetch live channel stats quickly from YouTube API"""
    try:
        token = get_channel_token(refresh_token)
        ch_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true"
        req = urllib.request.Request(ch_url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=8) as res:
            ch_data = json.loads(res.read().decode("utf-8"))
        items = ch_data.get("items", [])
        if items:
            ch = items[0]
            stats = ch.get("statistics", {})
            snippet = ch.get("snippet", {})
            return {
                "channelId": ch_id,
                "title": snippet.get("title", "YouTube Channel"),
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
    counts = {"UCOkeAWVV2ES-p9-75e2QH3A": 10} # GTA6-INDIA 10 completed
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

def get_db_channel_uploads() -> dict:
    """Fetch exact uploaded videos today per channel from Firebase RTDB"""
    today_str = time.strftime("%Y-%m-%d", time.gmtime())
    res = {}
    try:
        url = f"{FIREBASE_DATABASE_URL}/uploaded_drive_files.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=6) as r:
            data = json.loads(r.read().decode("utf-8") or "{}")
            for fid, item in data.items():
                ch_name = item.get("channelName", "Channel").strip()
                ch_id = item.get("channelId", "")
                up_at = item.get("uploadedAt", "")
                key = ch_id or ch_name
                if key not in res:
                    res[key] = {"channelName": ch_name, "channelId": ch_id, "videos": []}
                res[key]["videos"].append({
                    "id": item.get("youtubeVideoId"),
                    "title": item.get("title"),
                    "uploadedAt": up_at,
                    "isToday": up_at.startswith(today_str)
                })

        gta_url = f"{FIREBASE_DATABASE_URL}/uploads.json"
        req2 = urllib.request.Request(gta_url)
        with urllib.request.urlopen(req2, timeout=6) as r2:
            data2 = json.loads(r2.read().decode("utf-8") or "{}")
            gta_key = "UCOkeAWVV2ES-p9-75e2QH3A"
            if gta_key not in res:
                res[gta_key] = {"channelName": "GTA6-INDIA", "channelId": gta_key, "videos": []}
            for vid, item in data2.items():
                pub_at = item.get("publishedAt", "")
                res[gta_key]["videos"].append({
                    "id": item.get("youtubeId"),
                    "title": item.get("title"),
                    "uploadedAt": pub_at,
                    "isToday": pub_at.startswith(today_str)
                })
    except Exception as e:
        print(f"[DB Uploads Fetch Error]: {e}")
    return res

def get_all_channels_status() -> dict:
    """Tool: Get real-time status, quota, and errors for all channels"""
    channels_map = {}
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=6) as res:
            channels_map = json.loads(res.read().decode("utf-8") or "{}")
    except Exception:
        pass

    today_counts = get_today_upload_stats()
    quota_status = get_quota_status()
    stop_flags = get_stop_flags()
    is_global_stop = stop_flags.get("STOP_ALL", False)

    # Parallel YouTube fetch
    yt_stats = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {}
        for ch_id, info in channels_map.items():
            rf = info.get("refreshToken")
            if rf:
                futures[executor.submit(fetch_single_channel_fast, ch_id, rf)] = ch_id
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res:
                yt_stats[res["channelId"]] = res

    network_report = {}
    for ch_id, info in channels_map.items():
        name = info.get("channelName", CHANNEL_ALIASES.get(ch_id, {}).get("name", "Channel")).strip()
        stats = yt_stats.get(ch_id, {"subscribers": 0, "views": 0, "videos": 0})
        used = today_counts.get(ch_id, 0)
        if "GTA6" in name.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            used = 10
        rem = max(0, DAILY_CHANNEL_LIMIT - used)
        
        is_exhausted = quota_status.get(ch_id, {}).get("quota_exhausted", False) or used >= 10
        ch_stop = is_global_stop or stop_flags.get("channels", {}).get(ch_id, False)

        network_report[ch_id] = {
            "channelId": ch_id,
            "channelName": name,
            "subscribers": stats.get("subscribers", 0),
            "views": stats.get("views", 0),
            "videos": stats.get("videos", 0),
            "today_uploaded": used,
            "today_remaining": rem,
            "quota_exhausted": is_exhausted,
            "quota_reset": "00:00 UTC (05:30 AM IST)",
            "is_stopped": ch_stop
        }

    return network_report

def get_channel_status(channel_identifier: str) -> dict:
    """Tool: Get detailed status, recent uploaded videos, and quota for a single channel"""
    matched = match_channel(channel_identifier)
    all_status = get_all_channels_status()
    db_uploads = get_db_channel_uploads()

    target_id = matched["channelId"] if matched else None
    if not target_id:
        for ch_id, s in all_status.items():
            if channel_identifier.lower() in s["channelName"].lower():
                target_id = ch_id
                break

    if not target_id or target_id not in all_status:
        return {"error": f"Channel '{channel_identifier}' not found in connected channels."}

    ch_info = all_status[target_id]
    ch_db = db_uploads.get(target_id)
    if not ch_db:
        for k, v in db_uploads.items():
            if v.get("channelName", "").strip().lower() == ch_info["channelName"].lower():
                ch_db = v
                break

    today_vids = []
    if ch_db:
        today_vids = [
            {"title": v["title"], "url": f"https://youtu.be/{v['id']}", "id": v["id"]}
            for v in ch_db.get("videos", []) if v.get("isToday")
        ]

    ch_info["today_videos"] = today_vids
    return ch_info

def get_logs(limit: int = 8) -> list:
    """Tool: Get recent logs and upload activity"""
    logs = []
    try:
        url = f"{FIREBASE_DATABASE_URL}/system_control/logs.json?orderBy=\"$key\"&limitToLast={limit}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8") or "{}")
            for k in sorted(data.keys(), reverse=True):
                logs.append(data[k])
    except Exception:
        pass
    return logs

def stop_all_uploads() -> dict:
    """Tool: Immediately stop ALL uploading processes and set global STOP flag"""
    global active_pipeline_process, active_pipeline_info

    # 1. Update Firebase RTDB STOP_ALL = True
    stop_data = {
        "STOP_ALL": True,
        "channels": {
            "UC0ETQHUTkhw1d7Ylu30FbIQ": True,
            "UCKJcMheLl_FJWeEWaz073MQ": True,
            "UCkJXq3gCfROIFW4UEK4A8Pg": True,
            "UCOkeAWVV2ES-p9-75e2QH3A": True
        },
        "stopped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reason": "Stopped by Owner Command"
    }
    set_stop_flags(stop_data)

    # 2. Terminate and Force Kill any active running subprocess
    killed = False
    if active_pipeline_process and active_pipeline_process.poll() is None:
        try:
            print(f"[STOP] Terminating running pipeline process PID: {active_pipeline_process.pid}")
            active_pipeline_process.terminate()
            time.sleep(1)
            if active_pipeline_process.poll() is None:
                active_pipeline_process.kill()
            killed = True
        except Exception as e:
            print(f"[Process Kill Notice] {e}")

    active_pipeline_info["is_running"] = False
    log_system_event("STOP_ALL", "Owner executed stop_all_uploads. Subprocess terminated.")

    return {
        "status": "stopped",
        "scope": "all",
        "process_killed": killed,
        "message": "Saari uploading band kar di hai. Running processes terminate kar diye gaye hain aur sabhi jobs hold pe daal diye gaye hain."
    }

def stop_channel(channel_name: str) -> dict:
    """Tool: Stop uploading on a specific channel, other channels continue"""
    global active_pipeline_process, active_pipeline_info

    matched = match_channel(channel_name)
    if not matched:
        return {"error": f"Channel '{channel_name}' identify nahi ho paya. Kripya channel ka sahi naam batayein."}

    ch_id = matched["channelId"]
    ch_name = matched["channelName"]

    # 1. Update Firebase RTDB for this specific channel
    stop_data = get_stop_flags()
    if "channels" not in stop_data or not isinstance(stop_data["channels"], dict):
        stop_data["channels"] = {}
    stop_data["channels"][ch_id] = True
    stop_data["stopped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    set_stop_flags(stop_data)

    # 2. If running process is specifically for this channel, kill it
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
        "message": f"Channel '{ch_name}' ki uploading band kar di hai, baaki channels chalte rahenge."
    }

def pause_channel(channel_name: str) -> dict:
    """Tool: Alias for stop_channel"""
    return stop_channel(channel_name)

def resume_uploads(channel: str = "all") -> dict:
    """Tool: Clear stop flag and resume uploading permissions"""
    stop_data = get_stop_flags()

    if channel in ["all", "sab", "sabhi", None]:
        stop_data["STOP_ALL"] = False
        stop_data["channels"] = {}
        stop_data["resumed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        set_stop_flags(stop_data)
        log_system_event("RESUME_ALL", "Owner resumed all uploads.")
        return {"status": "resumed", "scope": "all", "message": "Sabhi channels par uploading resume kar di gayi hai."}
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
            return {"status": "resumed", "scope": "single", "channel": ch_name, "message": f"Channel '{ch_name}' ki uploading resume kar di gayi hai."}
        else:
            return {"error": f"Channel '{channel}' identify nahi ho saka."}

def upload_now(channel: str = "all", count: int = 1) -> dict:
    """Tool: Trigger upload process for specific channel or all channels"""
    global active_pipeline_process, active_pipeline_info

    # Check Stop Flags
    stop_data = get_stop_flags()
    if stop_data.get("STOP_ALL", False):
        return {
            "success": False,
            "error": "STOP_FLAG_ACTIVE",
            "message": "Uploading abhi STOP mode pe hai. Pehle 'resume karo' boliye, uske baad uploading shuru hogi."
        }

    # Check scope
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

    # Check if pipeline already running
    if active_pipeline_process and active_pipeline_process.poll() is None:
        return {
            "success": False,
            "error": "ALREADY_RUNNING",
            "message": f"Ek upload process pehle se background me chal raha hai ({active_pipeline_info.get('channel')}). Naya batch start karne ke liye purana khatam hone dein ya 'stop karo' bolein."
        }

    # Spawn background pipeline subprocess
    pipeline_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "multi_channel_pipeline.py"))
    cmd = [sys.executable, pipeline_script, str(count), target_scope]
    
    try:
        active_pipeline_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
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
            "message": f"Channel '{target_name}' par {count} video(s) upload karne ka process shuru kar diya hai. Saare step logs @Youtube_manager123_bot par aa rahe hain."
        }
    except Exception as e:
        return {"success": False, "error": str(e), "message": f"Process launch error: {e}"}

# ==========================================
# 4. Live System Context for LLM Reasoning
# ==========================================
def build_live_system_context() -> str:
    """Build live, factual real-time context for the Executive LLM on every turn"""
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

        # Today's uploaded videos list with links
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

        status_flag = "🛑 STOPPED" if st else ("⏳ Quota Exhausted (10/10)" if exh else f"🟢 Active ({rem} capacity left)")
        recent_vids = v_list[-5:] if len(v_list) > 5 else v_list
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

    prompt = f"""Tum is YouTube automation system ke Executive AI ho. Tum Telegram ke through owner se baat karte ho aur poora automation control karte ho (5 channels, daily 10 videos, Upload AI tumhare under hai).

Rules:
1. Owner jo bole, pehle use dhyan se samjho. Phir soch ke jawab do aur kaam karo. Koi fixed jawab ya template nahi.
2. Kisi bhi status/update ke sawal pe pehle tools se real data lo, phir uske hisaab se jawab do. Kabhi andaaza ya purana jawab mat do.
3. Owner ka sawal jo ho, usi ka jawab do. Ek hi line baar baar mat bolo.
4. Owner trend, strategy, ya normal baat kare to ek samajhdaar partner ki tarah baat karo.
5. Owner ka order sabse upar hai. "Stop", "ruko", "band karo", "pause" jaisa kuch bhi bole to turant maano (neeche STOP rule dekho).
6. Kaam karne ke baad batao ki kya kiya aur result kya aaya. Agar kuch fail hua to sach batao aur reason batao.
7. Agar order unclear ho to ek chhota sawal poochho, warna seedha kaam karo.
8. SCOPE RULE: Owner kisi specific channel ka naam le (jaise "Channel 2 pe upload karo", "Tech channel roko") to SIRF usi channel pe kaam karo, baaki channels ko bilkul touch mat karo. Owner "sabhi", "all channels", "sab pe", "sabko" bole tabhi saare channels pe kaam karo. Agar scope unclear ho (channel ka naam nahi bola aur "all" bhi nahi bola) to ek chhota sawal poochho: "Kaun sa channel, ya sabhi?"
9. Channel ka naam fuzzy match karo (spelling/Hinglish ki chhoti galti ho to bhi sahi channel pehchano), lekin agar do channels confuse ho rahe hain to pooch lo.

=== LIVE SYSTEM DATA (REAL-TIME STATUS FROM TOOLS) ===
System Stop Status: {stop_summary}
Recent Events:
{recent_logs_str}

Channels Live Snapshot:
{channels_context}

INSTRUCTION: Address the owner respectfully as 'Suraj sir'. Speak in natural, human Hinglish without repeating generic lines. Always base your reply on the real-time data above. When asked about video links or uploads, cite the exact titles and https://youtu.be/ links from the live data.
"""
    return prompt

def query_executive_llm(user_message: str, tool_result_context: str = "") -> str:
    """Call Nemotron LLM with live system context and reasoning"""
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

    # Keep conversation context compact
    if len(conversation_history) > 13:
        conversation_history = [conversation_history[0]] + conversation_history[-12:]

    try:
        url = f"{LLM_BASE_URL.rstrip('/')}/chat/completions"
        payload = {
            "model": LLM_MODEL,
            "messages": conversation_history,
            "max_tokens": 1500,
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
        with urllib.request.urlopen(req, timeout=30) as resp:
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
                    cand = [p for p in paras if not p.lower().startswith("here's a thinking") and not p.lower().startswith("1.") and not p.lower().startswith("let's")]
                    content = cand[-1] if cand else "Suraj sir, sabhi channels ka data live database se track ho raha hai."

            content = content.strip()
            conversation_history.append({"role": "assistant", "content": content})
            return content
    except Exception as e:
        print(f"[LLM Query Error] {e}", file=sys.stderr)
        return "Suraj sir, main 24/7 active hoon aur sabhi channels ka data monitor kar rahi hoon. Bataiye, kis channel ka update chahiye ya kya action lena hai?"

# ==========================================
# 5. Telethon Client Event Loop & Message Routing
# ==========================================
async def run_client():
    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    while True:
        try:
            print(f"[Executive Userbot] Connecting client (API ID: {API_ID})...")
            if TELEGRAM_STRING_SESSION:
                client = TelegramClient(StringSession(TELEGRAM_STRING_SESSION), API_ID, API_HASH)
            else:
                client = TelegramClient(SESSION_PATH, API_ID, API_HASH)

            await client.connect()

            if not await client.is_user_authorized():
                print("[Executive Userbot Error] Session not authorized.")
                await client.disconnect()
                return

            me = await client.get_me()
            print(f"[Executive Userbot] Online as: {me.first_name} (ID: {me.id})")

            @client.on(events.NewMessage)
            async def handler(event):
                if event.out:
                    return

                sender = await event.get_sender()
                sender_id = getattr(sender, "id", None)
                sender_username = (getattr(sender, "username", "") or "").lower()

                is_from_suraj = (
                    sender_id == CREATOR_ID or
                    CREATOR_USERNAME.lower() in sender_username or
                    event.is_private
                )
                if not is_from_suraj:
                    return

                text = (event.text or "").strip()
                if not text:
                    return

                lower = text.lower()
                print(f"[Executive AI Received from Suraj sir]: {text}")

                # ====================================================
                # ⚡ FAST-PATH 1: URGENT STOP / PAUSE INTENT (NO LLM DELAY)
                # Evaluated FIRST before any LLM processing to guarantee immediate process kill!
                # ====================================================
                is_stop_word = any(w in lower for w in [
                    "stop", "ruko", "rok do", "band karo", "pause", "rok lo",
                    "rokna", "abort", "cancel", "stopp", "band kar do"
                ])
                if is_stop_word:
                    matched_ch = match_channel(lower)
                    is_all = any(w in lower for w in ["sab", "sabhi", "all", "pura", "saare"])

                    if matched_ch and not is_all:
                        # Specific channel stop
                        res = stop_channel(matched_ch["channelName"])
                        reply_msg = (
                            f"🛑 **Suraj sir, {matched_ch['channelName']} ki uploading turant band kar di hai!**\n\n"
                            f"• Channel Stop Flag: Set ✅\n"
                            f"• Process Status: Running tasks abort kar diye gaye hain.\n"
                            f"• Baaki channels normal chalte rahenge."
                        )
                    else:
                        # Stop ALL uploads (Default for safety if scope is all or unclear)
                        res = stop_all_uploads()
                        reply_msg = (
                            f"🛑 **Suraj sir, SAARE channels ki uploading TURANT band kar di hai!**\n\n"
                            f"• Global Stop Flag: `STOP_ALL = True` set kar diya hai.\n"
                            f"• Running Subprocesses: Force kill/terminate kar diye gaye hain.\n"
                            f"• Sabhi pending upload jobs hold pe daal diye gaye hain.\n\n"
                            f"Jab tak aap 'resume/chalu karo' nahi bolenge, koi bhi upload start nahi hoga!"
                        )
                    await event.reply(reply_msg)
                    return

                # ====================================================
                # ⚡ FAST-PATH 2: RESUME / UNPAUSE INTENT
                # ====================================================
                is_resume_word = any(w in lower for w in [
                    "resume", "chalu karo", "start karo", "unpause", "fir se shuru", "upload chalu"
                ]) and not any(w in lower for w in ["stop", "ruko", "band"])
                if is_resume_word:
                    matched_ch = match_channel(lower)
                    is_all = any(w in lower for w in ["sab", "sabhi", "all", "saare"])
                    if matched_ch and not is_all:
                        res = resume_uploads(matched_ch["channelName"])
                        await event.reply(f"▶️ **Suraj sir, {matched_ch['channelName']} ki uploading resume kar di hai!** Ab ispe upload kiya ja sakta hai.")
                    else:
                        res = resume_uploads("all")
                        await event.reply("▶️ **Suraj sir, sabhi channels par uploading resume kar di hai!** Global STOP flag hata diya gaya hai.")
                    return

                # ====================================================
                # 🚀 FAST-PATH 3: ACTION ORDERS (UPLOAD NOW)
                # Evaluated before general inquiry so explicit orders trigger real tools!
                # ====================================================
                is_question = any(q in lower for q in ["kitne", "kitna", "kaise", "kya chal", "status", "report", "check", "batao"])
                is_upload_order = (
                    ("upload" in lower and any(w in lower for w in ["karo", "kar do", "start", "shuru", "dalo", "chalu"])) or
                    ("dalo" in lower and any(w in lower for w in ["video", "clip", "short", "drive", "channel", "quota"])) or
                    ("quota pura karo" in lower) or
                    ("video dalo" in lower)
                ) and not is_question

                if is_upload_order:
                    # Scope check
                    matched_ch = match_channel(lower)
                    is_all = any(w in lower for w in ["sab", "sabhi", "all", "saare", "baki", "open"])

                    # Parse count if specified
                    count = 2
                    num_match = re.search(r'(\d+)\s*(?:video|clip|shorts)?', lower)
                    if num_match:
                        try:
                            n = int(num_match.group(1))
                            if 1 <= n <= 10:
                                count = n
                        except Exception:
                            pass

                    # Rule 8: If scope unclear (neither specific channel nor 'all' mentioned) -> Ask!
                    if not matched_ch and not is_all:
                        await event.reply("Suraj sir, kaun sa channel, ya sabhi channels pe upload karun?")
                        return

                    target_scope = matched_ch["channelName"] if matched_ch and not is_all else "all"
                    tool_res = upload_now(channel=target_scope, count=count)

                    # Generate dynamic, intelligent Hinglish explanation of action taken
                    context_note = f"Action: upload_now(channel='{target_scope}', count={count}) | Result: {tool_res}"
                    reply_text = query_executive_llm(text, tool_result_context=context_note)
                    await event.reply(reply_text)
                    return

                # ====================================================
                # 🧠 GENERAL ROUTE: EMPOWERED EXECUTIVE LLM (ZERO CANNED REPLIES)
                # All status queries, data requests, strategy, and casual discussions
                # ====================================================
                reply_text = query_executive_llm(text)
                await event.reply(reply_text)

            print("[Executive Userbot] Ready and listening for Suraj sir!")
            await client.run_until_disconnected()

        except Exception as err:
            print(f"[Executive Userbot Error / Disconnected]: {err}")
            traceback.print_exc()
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(run_client())
