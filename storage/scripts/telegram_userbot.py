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
        "You are Suraj sir's authoritative, visionary, highly intelligent AI Executive Director & Creative YouTube Operations Partner.\n"
        "Suraj sir (@Surajpatel223, Telegram ID: 9052978168) is your creator, boss, and sole owner. You report exclusively to Suraj sir.\n\n"
        "=== YOUR MULTI-CHANNEL NETWORK (REAL-TIME CONTEXT & QUOTA) ===\n"
        f"{net_str}\n\n"
        f"• SUMMARY TODAY: {len(open_channels)} channels open ({', '.join(open_channels) if open_channels else 'None'}). "
        f"Total remaining upload capacity today = {total_rem} videos across network! Already published today = {total_used} videos.\n"
        "• Channel 1: 'GTA6-INDIA' (GTA 5/6 viral stunts & community highlights). Today's upload quota (10/10) is COMPLETE. Quota resets daily at 5:30 AM IST.\n"
        "• Channel 2: 'AGSC CART' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Channel 3: 'D& V fashion' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Channel 4: 'Cinema Nest' (5,000 BeamNG Crash Clips bundle, active uploads).\n"
        "• Video Source: Google Drive folder '5000+ Beam Ng Crash Clips Bundle' (Folder ID: 1BEUAM2fnKo6drhy6P42mrM6sBTNWqWbV).\n\n"
        "=== YOUR EXPERTISE & GAMING TRENDS MASTERY (2026) ===\n"
        "1. GAMING INDUSTRY & VIRAL CONTENT DIRECTOR:\n"
        "   - You are a gaming culture prodigy. You know everything trending in GTA 6, GTA 5, BeamNG.drive, Minecraft, and Indian/Global gaming.\n"
        "   - GTA 6 Mastery: Vice City, Leonida state, Lucia & Jason duo story, next-gen water and car deformation physics, weapon mechanics, leaks, expected trailer drops. You brainstorm thrilling Shorts ideas combining leaks, theories, and gameplay stunts.\n"
        "   - GTA 5 & FiveM: Impossible mega-ramp jumps, 5-star police escapes, superhero mod battles, funny ragdoll physics, car vs train.\n"
        "   - BeamNG.drive Mastery: Extreme soft-body crash simulations, speed bumps at 300 km/h, suspension stress tests, bridge collapses, hydraulic press crushing, flying cars off cliffs. Highly addictive, satisfying destruction ASMR.\n"
        "   - YouTube Shorts Algorithm 2026:\n"
        "     • Hook in 0.5 - 1.5 seconds: High visual motion, loud impact, curious question overlay ('CAN THIS SURVIVE?').\n"
        "     • Average View Duration (AVD) > 100% via seamless audio and visual looping.\n"
        "     • Sound Design: Trending Phonk beats, bass-boosted impact hits.\n"
        "     • Click-Through & Retention: Curiosity-inducing titles and suspenseful cuts.\n\n"
        "2. CONVERSATIONAL TONE & BEHAVIOR:\n"
        "   - Always address him respectfully as 'Suraj sir'.\n"
        "   - Speak in confident, sharp, thoughtful, and visionary Hindi / Hinglish.\n"
        "   - NO robotic canned templates. Have real, engaging, mastermind discussions about gaming trends, video ideas, channel growth, and strategy.\n"
        "   - When Suraj sir asks about trends or ideas, give exciting, creative, actionable advice to help him dominate YouTube Gaming!\n"
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
    """Run Drive upload pipeline across active channels asynchronously with clean personal chat"""
    global active_pipeline_state

    if active_pipeline_state["is_running"]:
        await client.send_message(
            chat_id,
            f"⚡ **Suraj sir! Ek upload automation batch pehle se background me chal raha hai!**\n\n"
            f"• Action: **{active_pipeline_state['action']}**\n"
            f"• Video download, 9:16 crop & YouTube upload chal raha hai. Sare live step logs aapke official bot @Youtube_manager123_bot par aa rahe hain! ⏳🔥"
        )
        return

    active_pipeline_state["is_running"] = True
    active_pipeline_state["action"] = f"Multi-Channel Upload ({count_per_channel} clips/channel)"
    active_pipeline_state["start_time"] = time.time()

    confirm_msg = (
        f"🎬 **Ji Suraj sir! Sabhi open channels par quota fill karne ke liye upload process shuru kar di hai!** 🚀\n\n"
        f"• Target Channels: **AGSC CART, D& V fashion, Cinema Nest**\n"
        f"• Source: Google Drive (5,000 BeamNG Clips Bundle)\n"
        f"• Watermark: None (Channel Name Skipped per order)\n\n"
        f"Sare live step-by-step logs aur YouTube video links aapke official bot **@Youtube_manager123_bot** par deliver ho rahe hain!"
    )
    await client.send_message(chat_id, confirm_msg)

    try:
        pipeline_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "multi_channel_pipeline.py"))
        cmd = [sys.executable, pipeline_script, str(count_per_channel)]

        res = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True, timeout=1800)
        print("[Multi-Channel Pipeline Result]:", res.stdout[-400:])

        if res.returncode == 0:
            await client.send_message(
                chat_id,
                f"🏆 **Suraj sir! Upload batch successfully complete ho gaya hai!**\n\n"
                f"• AGSC CART, D& V fashion, aur Cinema Nest par nayi videos publish ho chuki hain! ✅\n"
                f"• Sabhi live links aur details aapke bot @Youtube_manager123_bot par post ho gaye hain.\n\n"
                f"Aap YouTube Studio me live check kar sakte hain! 🚀"
            )
        else:
            await client.send_message(
                chat_id,
                f"⚠️ **Suraj sir Notice:** Pipeline batch complete hua. Details @Youtube_manager123_bot par dekhein."
            )
    except Exception as e:
        print(f"[Async Pipeline Error] {e}")
        await client.send_message(chat_id, f"⚠️ **Execution Notice Suraj sir:** {e}")
    finally:
        active_pipeline_state["is_running"] = False

# ==========================================
# 4. Telethon Client Event Loop
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

            # Note: Live activity logs & views notifications are strictly directed to @Youtube_manager123_bot!

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
                # ROUTE 1: EXPLICIT ACTION COMMANDS (ACTUAL WORK EXECUTION)
                # Evaluated FIRST so orders like "sab me video dalo or quota pura karo"
                # will 100% trigger execution without being intercepted!
                # ====================================================
                is_question = any(q in lower for q in ["kitne", "kitna", "kaise", "kya chal", "status batao", "report do", "check karo", "kya haal"])
                is_upload_command = (
                    ("upload" in lower and any(w in lower for w in ["karo", "start", "shuru", "kar do", "chalu", "fast"])) or
                    ("dalo" in lower and any(w in lower for w in ["video", "clip", "short", "drive", "channel", "sab", "open", "quta", "quota"])) or
                    ("video" in lower and any(w in lower for w in ["upload", "dalo", "post", "publish", "kar do", "bhejo"])) or
                    ("clip" in lower and any(w in lower for w in ["upload", "dalo", "post"])) or
                    any(w in lower for w in ["quota pura karo", "quta pura karo", "sab me video dalo", "sabhi channel pe upload", "sabhi chennl", "upload shuru", "shuru karo", "chalu karo"])
                ) and not is_question

                if is_upload_command:
                    # Check if asking specifically for GTA 6 upload
                    if any(w in lower for w in ["gt6", "gta 6", "gta6", "gta"]) and not any(w in lower for w in ["sab", "all", "open", "baki"]):
                        await event.reply(
                            "⚠️ **Suraj sir Notice:** 'GTA6-INDIA' channel par aaj ki 10 videos ki daily YouTube upload limit complete ho chuki hai! "
                            "Quota kal subah **5:30 AM IST** par reset hoga, jiske baad automated GTA clipping turant upload karegi.\n\n"
                            "Main abhi baaki open channels (**AGSC CART, D& V fashion, Cinema Nest**) par Google Drive se videos upload kar sakti hoon. "
                            "Boliye to un par upload batch shuru karun? 🚀"
                        )
                        return

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
                # ROUTE 2: STRUCTURED STATUS & QUOTA DATA REPORTS
                # ====================================================
                # 1. GTA 6 Channel report
                if any(w in lower for w in ["gt6", "gta 6", "gta6"]) and any(w in lower for w in ["status", "report", "analytics", "stats"]):
                    network = get_network_overview()
                    gta_ch = next((s for s in network.values() if "GTA6" in s.get("title", "").upper() or s.get("channelId") == "UCOkeAWVV2ES-p9-75e2QH3A"), None)
                    if gta_ch:
                        await event.reply(format_channel_report(gta_ch))
                        return

                # 2. Specific single channel report
                if any(w in lower for w in ["agsc", "cart", "fashion", "d&v", "cinema", "nest"]) and any(w in lower for w in ["status", "report", "analytics", "stats"]):
                    network = get_network_overview()
                    for ch_id, ch_stats in network.items():
                        title_upper = ch_stats.get("title", "").upper()
                        if ("AGSC" in title_upper and ("agsc" in lower or "cart" in lower)) or \
                           ("FASHION" in title_upper and ("fashion" in lower or "d&v" in lower)) or \
                           ("CINEMA" in title_upper and ("cinema" in lower or "nest" in lower)):
                            await event.reply(format_channel_report(ch_stats))
                            return

                # 3. Dedicated Quota & Upload Capacity Query
                if any(w in lower for w in ["kitne video or upload", "kitne video aur upload", "kitna upload baki", "kitne baki", "used quota", "kitne upload kar sakte", "capacity", "quota batao"]):
                    network = get_network_overview()
                    await event.reply(format_quota_and_capacity_report(network))
                    return

                # 4. Network Status / Overview
                if lower in ["/status", "status", "network status", "all channel status", "report", "analytics"]:
                    network = get_network_overview()
                    await event.reply(format_network_overview_report(network))
                    return

                # ====================================================
                # ROUTE 3: FULL AI MIND & GAMING STRATEGIST (LLM)
                # Handles all discussions, gaming trends, GTA 6 theories, BeamNG stunts, viral strategies!
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
