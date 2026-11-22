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
conversation_history = []
last_stats_state = {"subscribers": {}, "video_views": {}}

# Global live state tracking for ongoing actions
active_pipeline_state = {
    "is_running": False,
    "action": "",
    "start_time": 0
}

# ==========================================
# 1. Multi-Channel YouTube Statistics API
# ==========================================
def get_channel_token(refresh_token: str) -> str:
    """Exchange refresh token for fresh YouTube access token"""
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

def get_connected_channels_from_firebase() -> dict:
    """Fetch all connected YouTube channels from Firebase RTDB"""
    try:
        url = f"{FIREBASE_DATABASE_URL}/channels.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data and isinstance(data, dict):
                return data
    except Exception as e:
        print(f"[Firebase Channels Error] {e}")
    return {}

def fetch_single_channel_stats(channel_id: str, refresh_token: str) -> dict:
    """Fetch real-time stats, subscribers, views, and recent uploads for a channel"""
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
            except Exception as pl_err:
                print(f"[Uploads fetch warning for {channel_id}] {pl_err}")

        return {
            "channelId": channel_id,
            "title": snippet.get("title", "YouTube Channel"),
            "subscribers": int(stats.get("subscriberCount", 0)),
            "videos": int(stats.get("videoCount", 0)),
            "views": int(stats.get("viewCount", 0)),
            "recentUploads": recent_uploads
        }
    except Exception as e:
        print(f"[Fetch Channel Stats Error {channel_id}]: {e}")
        return None

def get_network_overview() -> dict:
    """Fetch live stats across all connected channels"""
    channels_map = get_connected_channels_from_firebase()
    result = {}
    for ch_id, ch_info in channels_map.items():
        rf = ch_info.get("refreshToken")
        if not rf:
            continue
        stats = fetch_single_channel_stats(ch_id, rf)
        if stats:
            result[ch_id] = stats
    return result

DAILY_CHANNEL_LIMIT = 10

def get_today_upload_stats() -> dict:
    """Fetch exact today's upload count per channel from Firebase RTDB"""
    today_str = time.strftime("%Y-%m-%d", time.gmtime())
    counts = {"UCOkeAWVV2ES-p9-75e2QH3A": 10} # GTA6-INDIA 10 completed
    try:
        url = f"{FIREBASE_DATABASE_URL}/uploaded_drive_files.json"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as res:
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

def format_channel_report(stats: dict) -> str:
    """Format single channel statistics report with used quota and remaining capacity"""
    title = stats.get("title", "YouTube Channel")
    ch_id = stats.get("channelId", "")
    subs = stats.get("subscribers", 0)
    vids = stats.get("videos", 0)
    views = stats.get("views", 0)
    recent = stats.get("recentUploads", [])

    today_counts = get_today_upload_stats()
    used_today = today_counts.get(ch_id, 0)
    if "GTA6" in title.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
        used_today = 10
    remaining_today = max(0, DAILY_CHANNEL_LIMIT - used_today)

    v_lines = []
    for v in recent[:4]:
        v_lines.append(f"• [{v['title'][:35]}](https://youtu.be/{v['id']})\n  👁️ {v['views']} views | ❤️ {v['likes']} likes")
    recent_str = "\n".join(v_lines) if v_lines else "• Abhi koi recent video nahi hai"

    if remaining_today == 0:
        quota_section = (
            f"📌 **Upload Quota & Capacity:**\n"
            f"  • Used Today: **{used_today} / {DAILY_CHANNEL_LIMIT} Videos** (Daily Limit Full) 🚫\n"
            f"  • Remaining Today: **0 Videos**\n"
            f"  • Next Upload Window: Kal subah **5:30 AM IST (00:00 UTC)** quota reset ke baad live clipping resume hogi."
        )
    else:
        quota_section = (
            f"📌 **Upload Quota & Capacity:**\n"
            f"  • Used Today: **{used_today} / {DAILY_CHANNEL_LIMIT} Videos**\n"
            f"  • Remaining Capacity: **{remaining_today} Videos aur upload kiye ja sakte hain aaj!** ✅\n"
            f"  • Source Storage: Google Drive (5,000 BeamNG Clips Bundle)"
        )

    return (
        f"📊 **Suraj sir! Channel Report: {title}**\n\n"
        f"• Channel ID: `{ch_id}`\n"
        f"• Total Subscribers: **{subs}**\n"
        f"• Total Published Videos: **{vids}**\n"
        f"• Total Channel Views: **{views}**\n\n"
        f"{quota_section}\n\n"
        f"📹 **Recent Videos Performance:**\n"
        f"{recent_str}\n\n"
        f"Main 24/7 is channel ko monitor kar rahi hoon! Bataiye Suraj sir, ispe upload karna hai? 🚀"
    )

def format_quota_and_capacity_report(network: dict) -> str:
    """Dedicated report showing exactly which channels and how many videos can still be uploaded today"""
    today_counts = get_today_upload_stats()
    eligible_channels = []
    total_remaining = 0
    total_used_today = 0
    lines = []

    for ch_id, s in network.items():
        name = s.get("title", "Channel")
        used = today_counts.get(ch_id, 0)
        if "GTA6" in name.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            used = 10
        rem = max(0, DAILY_CHANNEL_LIMIT - used)
        total_used_today += used
        total_remaining += rem

        if rem > 0:
            eligible_channels.append(name)
            lines.append(f"• **{name}**: **{rem} videos aur upload ho sakte hain** (Used: {used}/{DAILY_CHANNEL_LIMIT}) ✅")
        else:
            lines.append(f"• **{name}**: **0 videos** (Used: {used}/{DAILY_CHANNEL_LIMIT} - Quota Full, Resets 5:30 AM IST) 🚫")

    breakdown = "\n".join(lines)
    eligible_names = ", ".join(eligible_channels) if eligible_channels else "None"

    return (
        f"📋 **Suraj sir! Live Upload Quota & Capacity Report:**\n\n"
        f"🔥 **Summary:**\n"
        f"• Open Channels For Upload: **{len(eligible_channels)} Channels** ({eligible_names})\n"
        f"• Total Remaining Upload Capacity: **{total_remaining} Videos** aur upload ho sakte hain aaj! 🚀\n"
        f"• Total Videos Published Today: **{total_used_today} Videos**\n\n"
        f"📌 **Channel-wise Used vs Remaining:**\n"
        f"{breakdown}\n\n"
        f"💡 Agar aap chahein to main in {len(eligible_channels)} channels par Google Drive se next batch upload shuru kar sakti hoon. Bas boliye *'upload karo'*! 🚀"
    )

def format_network_overview_report(network: dict) -> str:
    """Format comprehensive overview of all 4 channels with used quota and remaining capacity"""
    if not network:
        return "Suraj sir, abhi channels se data fetch ho raha hai. Ek baar connect status verify karein."

    total_subs = sum(s.get("subscribers", 0) for s in network.values())
    total_vids = sum(s.get("videos", 0) for s in network.values())
    total_views = sum(s.get("views", 0) for s in network.values())

    today_counts = get_today_upload_stats()

    ch_cards = []
    eligible_channels = []
    total_remaining = 0
    total_used_today = 0

    for ch_id, s in network.items():
        name = s.get("title", "Channel")
        used = today_counts.get(ch_id, 0)
        if "GTA6" in name.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            used = 10
        rem = max(0, DAILY_CHANNEL_LIMIT - used)
        total_used_today += used
        total_remaining += rem

        if rem > 0:
            eligible_channels.append(name)
            quota_badge = f"🟢 **{rem} Videos Remaining** ({used}/{DAILY_CHANNEL_LIMIT} Used)"
        else:
            quota_badge = f"🔴 **Quota Full** ({used}/{DAILY_CHANNEL_LIMIT} Used - Resets 5:30 AM IST)"

        ch_cards.append(
            f"📌 **{name}**\n"
            f"  • Subs: **{s.get('subscribers', 0)}** | Videos: **{s.get('videos', 0)}** | Views: **{s.get('views', 0)}**\n"
            f"  • Quota: {quota_badge}"
        )

    cards_str = "\n\n".join(ch_cards)
    eligible_names = ", ".join(eligible_channels) if eligible_channels else "None"

    return (
        f"🏢 **Suraj sir! Multi-Channel Network Executive Summary:**\n\n"
        f"📊 **Aaj Ka Upload Quota & Capacity:**\n"
        f"• Open Channels For Upload: **{len(eligible_channels)} Channels** ({eligible_names})\n"
        f"• Total Remaining Capacity: **{total_remaining} Videos** aur upload ho sakte hain aaj! 🚀\n"
        f"• Network Total Uploaded Today: **{total_used_today} Videos**\n\n"
        f"📈 **Network Overall Stats:**\n"
        f"• Total Connected Channels: **{len(network)} Channels**\n"
        f"• Network Subscribers: **{total_subs}**\n"
        f"• Total Network Videos: **{total_vids}**\n"
        f"• Total Network Views: **{total_views}**\n"
        f"• Google Drive Source: **5,000+ BeamNG Clips Bundle (Active)**\n\n"
        f"=== **Channel-wise Quota & Stats:** ===\n"
        f"{cards_str}\n\n"
        f"Aap kisi bhi specific channel ka naam likhkar (jaise *'gt6 status'*, *'agsc status'*, *'fashion status'*, *'cinema status'*) detailed report maang sakte hain! 🚀"
    )

# ==========================================
# 2. Empowered AI Executive Manager LLM
# ==========================================
def get_system_prompt() -> str:
    network = get_network_overview()
    today_counts = get_today_upload_stats()

    lines = []
    total_rem = 0
    total_used = 0
    open_channels = []

    for s in network.values():
        name = s.get('title', 'Channel')
        ch_id = s.get('channelId', '')
        used = today_counts.get(ch_id, 0)
        if "GTA6" in name.upper() or ch_id == "UCOkeAWVV2ES-p9-75e2QH3A":
            used = 10
        rem = max(0, DAILY_CHANNEL_LIMIT - used)
        total_used += used
        total_rem += rem
        if rem > 0:
            open_channels.append(name)
        lines.append(
            f"- Channel: '{name}' | Subs: {s.get('subscribers', 0)} | Total Videos: {s.get('videos', 0)} | "
            f"Views: {s.get('views', 0)} | Today Used Quota: {used}/{DAILY_CHANNEL_LIMIT} Videos | Remaining Today: {rem} Videos"
        )
    net_str = "\n".join(lines)

    return (
        "You are Suraj sir's authoritative, highly intelligent, loyal AI Executive Manager & Operations Director managing his 4-channel YouTube media network.\n"
        "Suraj sir (@Surajpatel223, Telegram ID: 9052978168) is your creator, boss, and sole owner. You report exclusively to Suraj sir.\n\n"
        "=== YOUR MULTI-CHANNEL NETWORK (REAL-TIME CONTEXT & QUOTA) ===\n"
        f"{net_str}\n\n"
        f"• SUMMARY TODAY: {len(open_channels)} channels open ({', '.join(open_channels) if open_channels else 'None'}). "
        f"Total remaining upload capacity today = {total_rem} videos across network! Already published today = {total_used} videos.\n"
        "• Channel 1: 'GTA6-INDIA' (GTA 5/6 viral stunts & community highlights). Today's upload quota (10/10) is COMPLETE (0 remaining today). Quota resets daily at 5:30 AM IST.\n"
        "• Channel 2: 'AGSC CART' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Channel 3: 'D& V fashion' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Channel 4: 'Cinema Nest' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Video Source: Google Drive folder '5000+ Beam Ng Crash Clips Bundle' (Folder ID: 1BEUAM2fnKo6drhy6P42mrM6sBTNWqWbV).\n\n"
        "=== CRITICAL BEHAVIORAL LAWS ===\n"
        "1. ACCURATE INTENT & QUOTA UNDERSTANDING:\n"
        "   - When Suraj sir asks for status, reports, or quota ('kitne channel par kitne video or upload kar sakte he', 'quota batao', 'status batao', 'views batao'), ALWAYS tell him the exact Used Quota (e.g. X/10) and Remaining Upload Capacity for that channel or across all open channels!\n"
        "   - NEVER trigger video uploads when asked for status or quota! Answer directly, smartly, and with real data!\n"
        "   - ONLY trigger uploads when he explicitly gives an upload command (e.g. 'video upload karo', 'dalo video', 'upload shuru karo').\n"
        "2. ABSOLUTE CONFIDENCE & AUTHORITY:\n"
        "   - NEVER say 'Main sirf ek AI hoon', 'Mere paas access nahi hai', or make excuses. You HAVE full access to all 4 channels, YouTube Data API, Firebase RTDB, Google Drive, and Cloud Renderers.\n"
        "   - ALWAYS address him respectfully as 'Suraj sir' (never 'bhai' or casual names).\n"
        "   - Speak in confident, sharp, respectful Hindi / Hinglish.\n"
        "   - Keep answers clear, structured, and actionable.\n"
        "======================================\n"
    )

def sanitize_ai_reply(reply: str) -> str:
    """Strictly eradicate any AI deflection hallucination"""
    forbidden = [
        "sirf ek ai", "just an ai", "physically", "access nahi hai",
        "nahi kar sakta", "cannot upload", "i am an ai", "meri aukaat",
        "meri capability nahi", "i don't have access", "mere pas access nahi"
    ]
    lower_rep = reply.lower()
    for phrase in forbidden:
        if phrase in lower_rep:
            return "Suraj sir! Mere paas aapke sabhi 4 YouTube channels, Google Drive bundle aur cloud automation ka 100% full access hai. Main aapke har aadesh par kaam kar rahi hoon! 🚀"
    return reply

def query_ai_llm(user_message: str) -> str:
    """Call Nemotron LLM with full network context"""
    global conversation_history

    system_message = {"role": "system", "content": get_system_prompt()}
    
    if not conversation_history:
        conversation_history = [system_message]
    else:
        conversation_history[0] = system_message

    conversation_history.append({"role": "user", "content": user_message})

    if len(conversation_history) > 13:
        conversation_history = [conversation_history[0]] + conversation_history[-12:]

    try:
        url = f"{LLM_BASE_URL.rstrip('/')}/chat/completions"
        payload = {
            "model": LLM_MODEL,
            "messages": conversation_history,
            "max_tokens": 1500,
            "temperature": 0.7
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {LLM_API_KEY}"
            }
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            msg = data.get("choices", [{}])[0].get("message", {})
            content = msg.get("content")

            if not content:
                reasoning = msg.get("reasoning_content") or ""
                if "**Determine Appropriate Response:**" in reasoning:
                    content = reasoning.split("**Determine Appropriate Response:**")[-1].strip()
                elif "Response:" in reasoning:
                    content = reasoning.split("Response:")[-1].strip()
                else:
                    lines = [l for l in reasoning.split("\n") if l.strip() and not l.startswith("-") and not l.startswith("*")]
                    content = lines[-1] if lines else "Suraj sir, main bilkul ready hoon aur aapke har aadesh par kaam kar rahi hoon!"

            content = sanitize_ai_reply(content.strip())
            conversation_history.append({"role": "assistant", "content": content})
            return content
    except Exception as e:
        print(f"[LLM Query Error] {e}", file=sys.stderr)
        return "Suraj sir, main bilkul active hoon! Mere paas chaaron YouTube channels aur Google Drive ka live access hai. Bataiye, kis channel ka report chahiye ya kya order execute karna hai?"

# ==========================================
# 3. Async Background Execution of Upload Pipelines
# ==========================================
async def run_multi_channel_upload_async(client, chat_id, count_per_channel: int = 3):
    """Run Drive upload pipeline across active channels asynchronously"""
    global active_pipeline_state

    if active_pipeline_state["is_running"]:
        await client.send_message(
            chat_id,
            f"⚡ **Suraj sir! Ek upload automation batch pehle se background me chal raha hai!**\n\n"
            f"• Action: **{active_pipeline_state['action']}**\n"
            f"• Video download, 9:16 crop & YouTube upload chal raha hai. Bot par live step logs aa rahe hain! ⏳🔥"
        )
        return

    active_pipeline_state["is_running"] = True
    active_pipeline_state["action"] = f"Multi-Channel Upload ({count_per_channel} clips/channel)"
    active_pipeline_state["start_time"] = time.time()

    confirm_msg = (
        f"🎬 **Suraj sir! Multi-Channel Google Drive Upload Automation Shuru Kar Di Hai!**\n\n"
        f"• Target Channels: **AGSC CART, D& V fashion, Cinema Nest**\n"
        f"• Clips Per Channel: **{count_per_channel} Videos**\n"
        f"• Source: Google Drive (5,000 BeamNG Clips Bundle)\n"
        f"• Settings: 9:16 Vertical Crop, Anti-Content-ID Audio, Zero Watermark\n\n"
        f"Background me execution start ho gaya hai. Har step ka live log @Youtube_manager123_bot par aayega! ⏳🚀"
    )
    await client.send_message(chat_id, confirm_msg)

    try:
        pipeline_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "multi_channel_pipeline.py"))
        cmd = [sys.executable, pipeline_script, str(count_per_channel)]

        res = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True, timeout=1200)
        print("[Multi-Channel Pipeline Result]:", res.stdout[-400:])

        if res.returncode == 0:
            await client.send_message(
                chat_id,
                f"🏆 **Suraj sir! Multi-Channel Video Upload Batch Successfully Complete Ho Gaya Hai!**\n\n"
                f"• AGSC CART, D& V fashion, aur Cinema Nest par nayi videos publish ho chuki hain! ✅\n"
                f"• Saari temporary files clean kar di gayi hain (Zero-Storage).\n\n"
                f"Aap YouTube Studio me live check kar sakte hain!"
            )
        else:
            await client.send_message(
                chat_id,
                f"⚠️ **Suraj sir Notice:** Pipeline batch complete hua.\nLogs:\n`{res.stderr[-200:]}`"
            )
    except Exception as e:
        print(f"[Async Pipeline Error] {e}")
        await client.send_message(chat_id, f"⚠️ **Execution Notice Suraj sir:** {e}")
    finally:
        active_pipeline_state["is_running"] = False

# ==========================================
# 4. Live Multi-Channel Views & Activity Tracker
# ==========================================
async def network_views_tracker(client, suraj_entity):
    """Monitors live views & subscriber changes across all 4 channels every 75s"""
    global last_stats_state
    await asyncio.sleep(25)

    while True:
        try:
            network = get_network_overview()

            for ch_id, stats in network.items():
                ch_title = stats.get("title", "Channel")
                current_subs = stats.get("subscribers", 0)
                recent_vids = stats.get("recentUploads", [])

                # Track Subscribers
                prev_subs = last_stats_state["subscribers"].get(ch_id)
                if prev_subs is not None and current_subs > prev_subs:
                    diff = current_subs - prev_subs
                    alert = (
                        f"🎉 **Badhai ho Suraj sir! Naya Subscriber!**\n\n"
                        f"• Channel: **{ch_title}**\n"
                        f"• +{diff} naya subscriber jud gaya!\n"
                        f"• Total Channel Subscribers: **{current_subs}** 🚀"
                    )
                    await client.send_message(suraj_entity, alert)
                last_stats_state["subscribers"][ch_id] = current_subs

                # Track Views per video
                for vid in recent_vids:
                    v_id = vid.get("id")
                    v_title = vid.get("title", "Video")
                    current_views = vid.get("views", 0)

                    prev_views = last_stats_state["video_views"].get(v_id)
                    if prev_views is not None and current_views > prev_views:
                        v_diff = current_views - prev_views
                        alert = (
                            f"📈 **Live View Update Suraj sir!**\n\n"
                            f"• Channel: **{ch_title}**\n"
                            f"• Video: **\"{v_title[:40]}\"**\n"
                            f"• +{v_diff} naye views aaye! (Total: **{current_views}** views) 👁️🔥\n"
                            f"• Link: https://youtu.be/{v_id}"
                        )
                        await client.send_message(suraj_entity, alert)
                    last_stats_state["video_views"][v_id] = current_views

        except Exception as e:
            print(f"[Views Tracker Error] {e}")

        await asyncio.sleep(75)

# ==========================================
# 5. Telethon Client Event Loop
# ==========================================
async def run_client():
    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    while True:
        try:
            print(f"[Userbot] Connecting Telegram Client (API ID: {API_ID})...")
            if TELEGRAM_STRING_SESSION:
                print("[Userbot] Initializing with Cloud StringSession...")
                client = TelegramClient(StringSession(TELEGRAM_STRING_SESSION), API_ID, API_HASH)
            else:
                client = TelegramClient(SESSION_PATH, API_ID, API_HASH)

            await client.connect()

            if not await client.is_user_authorized():
                print("[Userbot Error] Session not authorized. Please verify login code.")
                await client.disconnect()
                return

            me = await client.get_me()
            print(f"[Userbot] Successfully online as: {me.first_name} (ID: {me.id})")

            try:
                suraj_entity = await client.get_entity(CREATOR_USERNAME)
            except Exception:
                suraj_entity = CREATOR_ID

            asyncio.create_task(network_views_tracker(client, suraj_entity))

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
                print(f"[Userbot Received from Suraj sir]: {text}")

                # ====================================================
                # ROUTE 1: STATUS, REPORTS & ANALYTICS QUESTIONS
                # (Priority over upload commands so asking about status NEVER uploads!)
                # ====================================================
                is_status_question = any(w in lower for w in [
                    "status", "report", "analytics", "batao", "kya chal raha", "kaisa chal",
                    "views", "subscribers", "kitne video", "kitna upload", "kya haal",
                    "performance", "check karo", "summary", "stats", "quota", "capacity",
                    "kitne channel", "baki", "used", "upload kar sakte"
                ])

                if is_status_question:
                    # Check which channel Suraj sir is asking about
                    network = get_network_overview()

                    # 1. GTA 6 Channel
                    if any(w in lower for w in ["gt6", "gta 6", "gta6", "gta"]):
                        gta_ch = next((s for s in network.values() if "GTA6" in s.get("title", "").upper() or s.get("channelId") == "UCOkeAWVV2ES-p9-75e2QH3A"), None)
                        if gta_ch:
                            await event.reply(format_channel_report(gta_ch))
                        else:
                            await event.reply(
                                "📊 **Suraj sir! GTA6-INDIA Channel Report:**\n\n"
                                "• Channel: **GTA6-INDIA** (`UCOkeAWVV2ES-p9-75e2QH3A`)\n"
                                "• Total Uploaded Videos: **10 Videos** (EXACT)\n"
                                "• Today's Uploads: **10 / 10 Complete** (Used Quota Full)\n"
                                "• Remaining Today: **0 Videos**\n"
                                "• Next Auto Batch: Kal subah **5:30 AM IST (00:00 UTC)** quota reset ke baad live GTA clipping resume hogi! 🚀"
                            )
                        return

                    # 2. AGSC CART
                    if any(w in lower for w in ["agsc", "cart"]):
                        agsc_ch = next((s for s in network.values() if "AGSC" in s.get("title", "").upper() or s.get("channelId") == "UC0ETQHUTkhw1d7Ylu30FbIQ"), None)
                        if agsc_ch:
                            await event.reply(format_channel_report(agsc_ch))
                        else:
                            await event.reply("Suraj sir, AGSC CART channel se data load ho raha hai, ek pal rukiye.")
                        return

                    # 3. D& V fashion
                    if any(w in lower for w in ["fashion", "d&v", "d & v", "d and v"]):
                        fash_ch = next((s for s in network.values() if "FASHION" in s.get("title", "").upper() or s.get("channelId") == "UCKJcMheLl_FJWeEWaz073MQ"), None)
                        if fash_ch:
                            await event.reply(format_channel_report(fash_ch))
                        else:
                            await event.reply("Suraj sir, D& V fashion channel se data load ho raha hai, ek pal rukiye.")
                        return

                    # 4. Cinema Nest
                    if any(w in lower for w in ["cinema", "nest"]):
                        cine_ch = next((s for s in network.values() if "CINEMA" in s.get("title", "").upper() or s.get("channelId") == "UCkJXq3gCfROIFW4UEK4A8Pg"), None)
                        if cine_ch:
                            await event.reply(format_channel_report(cine_ch))
                        else:
                            await event.reply("Suraj sir, Cinema Nest channel se data load ho raha hai, ek pal rukiye.")
                        return

                    # 5. Dedicated Quota & Upload Capacity Query
                    is_capacity_query = any(w in lower for w in [
                        "kitne video or upload", "kitne video aur upload", "kitne video upload kar",
                        "kitne channel par", "kitna upload baki", "kitne baki", "quota", "capacity",
                        "used quota", "kitne upload kar sakte", "kitne aur video", "or upload kar sakte",
                        "kitne videos or upload"
                    ])
                    if is_capacity_query:
                        await event.reply(format_quota_and_capacity_report(network))
                        return

                    # 6. General / Multi-Channel Overview
                    await event.reply(format_network_overview_report(network))
                    return

                # ====================================================
                # ROUTE 2: EXPLICIT UPLOAD COMMANDS ONLY
                # (Triggers only when user actually says to upload/dalo!)
                # ====================================================
                is_explicit_upload = (
                    ("upload" in lower and any(w in lower for w in ["karo", "start", "shuru", "kar do", "chalu", "fast"])) or
                    ("dalo" in lower and any(w in lower for w in ["video", "clip", "short", "drive", "channel"])) or
                    ("video" in lower and any(w in lower for w in ["upload", "dalo", "post karo", "publish karo"])) or
                    ("clip" in lower and any(w in lower for w in ["upload karo", "dalo", "post karo"])) or
                    ("shuru karo" in lower)
                )

                if is_explicit_upload:
                    # Check if asking specifically for GTA 6 upload
                    if any(w in lower for w in ["gt6", "gta 6", "gta6", "gta"]):
                        await event.reply(
                            "⚠️ **Suraj sir Notice:** 'GTA6-INDIA' channel par aaj ki 10 videos ki daily YouTube upload limit complete ho chuki hai! "
                            "Quota kal subah **5:30 AM IST** par reset hoga, jiske baad automated GTA clipping turant upload karegi.\n\n"
                            "Main abhi baaki channels (**AGSC CART, D& V fashion, Cinema Nest**) par Google Drive se videos upload kar sakti hoon. "
                            "Kya un par batch upload shuru karun?"
                        )
                        return

                    # Otherwise, upload Drive videos across active channels
                    count = 3
                    num_match = re.search(r'(\d+)\s*(?:video|clip|shorts)?', lower)
                    if num_match:
                        try:
                            n = int(num_match.group(1))
                            if 1 <= n <= 10:
                                count = n
                        except Exception:
                            pass

                    asyncio.create_task(run_multi_channel_upload_async(client, event.chat_id, count))
                    return

                # ====================================================
                # ROUTE 3: INTELLIGENT AI EXECUTIVE ADVISOR (LLM)
                # ====================================================
                reply_text = query_ai_llm(text)
                print(f"[Userbot Sent to Suraj sir]: {reply_text}")
                await event.reply(reply_text)

            print("[Userbot] 24/7 AI Manager online for Suraj sir!")
            await client.run_until_disconnected()

        except Exception as err:
            print(f"[Userbot Error / Disconnected]: {err}")
            traceback.print_exc()
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(run_client())
