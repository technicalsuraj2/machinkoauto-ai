import os
import sys
import asyncio
import json
import urllib.request
import traceback
import time
import re
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

# Load environment
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

raw_api_id = os.getenv("TELEGRAM_API_ID")
API_ID = int(raw_api_id.strip()) if raw_api_id and raw_api_id.strip() else 38595785

raw_api_hash = os.getenv("TELEGRAM_API_HASH")
API_HASH = raw_api_hash.strip() if raw_api_hash and raw_api_hash.strip() else "061fb3e46d0d9a3076eada93d91c4d81"

CREATOR_USERNAME = (os.getenv("TELEGRAM_CREATOR_USERNAME") or "Surajpatel223").replace("@", "").strip()
CREATOR_PHONE = os.getenv("TELEGRAM_CREATOR_PHONE", "7990369253")

raw_cid = os.getenv("TELEGRAM_CREATOR_ID")
CREATOR_ID = int(raw_cid.strip()) if raw_cid and raw_cid.strip() else 9052978168

TELEGRAM_STRING_SESSION = (os.getenv("TELEGRAM_STRING_SESSION") or "").strip()

LLM_API_KEY = (os.getenv("LLM_API_KEY") or "sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F").strip()
LLM_BASE_URL = (os.getenv("LLM_BASE_URL") or "https://api.bluesminds.com/v1").strip()
LLM_MODEL = (os.getenv("LLM_MODEL") or "nvidia/nemotron-3.5-lightning-30b-a3b").strip()

SESSION_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_ai_user"))
NOTIFY_QUEUE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_notify_queue.jsonl"))

# Embedded HTTP Health Server for 24/7 Cloud Platforms (Render, Koyeb, Railway, HuggingFace)
class CloudHealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        payload = json.dumps({
            "status": "online",
            "service": "MachinkoAuto.Ai Telegram AI Executive Manager",
            "creator": "Suraj sir",
            "bot": "YouTube (8606326303)",
            "timestamp": time.time()
        }).encode("utf-8")
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass # Suppress access logs

def start_background_health_server():
    try:
        port = int(os.getenv("PORT", "8080"))
        server = HTTPServer(("0.0.0.0", port), CloudHealthHandler)
        print(f"[Cloud Health Server] Listening on port {port}...")
        server.serve_forever()
    except Exception as e:
        print(f"[Cloud Health Server Warning] {e}")

threading.Thread(target=start_background_health_server, daemon=True).start()

# Maintain in-memory conversation history
conversation_history = []

# Tracker state for Subscribers & Likes alerts
last_stats_state = {
    "subscribers": 2,
    "video_likes": {},
    "video_views": {}
}

def fetch_live_system_context() -> dict:
    """Fetch real-time YouTube Channel, SQLite, and Firebase stats from backend API"""
    cloud_url = os.getenv("STATS_API_URL") or "https://machinkoauto-ai.netlify.app/api/channel/stats"
    # First try localhost if running locally
    try:
        req = urllib.request.Request("http://localhost:3000/api/channel/stats")
        with urllib.request.urlopen(req, timeout=3) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:
        pass

    # Try Cloud Netlify / Firebase API
    try:
        req = urllib.request.Request(cloud_url)
        with urllib.request.urlopen(req, timeout=8) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:
        return {
            "youtube": {"channelTitle": "GTA6-INDIA", "videoCount": "10", "subscriberCount": "2", "recentUploads": []},
            "database": {"todayUploadCount": 10, "dailyLimit": 10, "pendingVideos": 0, "firebaseSyncedVideos": 10}
        }

def get_system_prompt() -> str:
    data = fetch_live_system_context()
    yt = data.get("youtube", {})
    db = data.get("database", {})
    uploads = yt.get("recentUploads", [])
    titles = [f"'{u['title']}' (Likes: {u.get('likes', 0)})" for u in uploads[:7]]
    titles_str = ", ".join(titles) if titles else "None"

    return (
        "You are MachinkoAuto.Ai's dedicated, highly intelligent AI Executive Manager chatting directly with Suraj Patel (@Surajpatel223) on Telegram.\n"
        "STRICT IDENTITY & RESPECT RULES:\n"
        "1. ALWAYS address him respectfully as 'Suraj sir' (NEVER use 'bhai' or casual names).\n"
        "2. Speak in respectful, sharp, energetic Hindi and Hinglish. Be loyal, confident, and professional.\n"
        "3. You are a female AI Executive Producer and Channel Growth Manager.\n"
        "4. Acknowledge that you specialize in streamer reaction videos (Techno Gamerz, Total Gaming, Live Insaan, GTA 5 streamer moments) for maximum viral CTR.\n"
        "5. Keep responses crisp, polite, confident, and punchy (1-3 sentences max) with respectful emojis.\n\n"
        f"=== LIVE CHANNEL STATS ===\n"
        f"• YouTube Channel: {yt.get('channelTitle', 'GTA6-INDIA')}\n"
        f"• Total Uploaded Videos on Channel: {yt.get('videoCount', '10')} videos (EXACT)\n"
        f"• Subscribers: {yt.get('subscriberCount', '2')} subscribers\n"
        f"• Today's Uploads: {db.get('todayUploadCount', 10)} / {db.get('dailyLimit', 10)} videos (10/10 Complete)\n"
        f"• Recent Uploaded Videos: {titles_str}\n"
        f"===========================\n"
    )

def query_ai_llm(user_message: str) -> str:
    """Call Nemotron LLM with full conversation history and live database context"""
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
                    content = lines[-1] if lines else "Suraj sir, main bilkul ready hoon aur aapke aadesh par kaam kar rahi hoon!"

            content = content.strip()
            conversation_history.append({"role": "assistant", "content": content})
            return content
    except Exception as e:
        print(f"[LLM Query Error] {e}", file=sys.stderr)
        return "Suraj sir, main bilkul active hoon! Bataiye, kya order hai?"

def trigger_local_api(endpoint: str, payload_dict: dict = None) -> dict:
    """Trigger MachinkoAuto.Ai backend routes with custom payload and high timeout"""
    try:
        data_bytes = json.dumps(payload_dict or {}).encode("utf-8")
        req = urllib.request.Request(
            f"http://localhost:3000/api/{endpoint.lstrip('/')}",
            data=data_bytes,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        print(f"[API Trigger Error] {e}", file=sys.stderr)
        return {"error": str(e)}

async def notify_queue_watcher(client, suraj_entity):
    """Watches storage/telegram_notify_queue.jsonl for background upload/harvest events and messages Suraj sir"""
    while True:
        try:
            if os.path.exists(NOTIFY_QUEUE_PATH):
                with open(NOTIFY_QUEUE_PATH, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                if lines:
                    with open(NOTIFY_QUEUE_PATH, "w", encoding="utf-8") as f:
                        f.write("")

                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                            alert_text = item.get("text", "")
                            if alert_text:
                                await client.send_message(suraj_entity, alert_text)
                                print(f"[Notify Watcher] Sent proactive alert to Suraj sir!")
                        except Exception as parse_err:
                            print(f"[Notify Watcher Line Error] {parse_err}")
        except Exception as e:
            print(f"[Notify Watcher Error] {e}")
        await asyncio.sleep(2)

async def channel_activity_tracker(client, suraj_entity):
    """Monitors live YouTube Subscriber count and new Likes every 60s, alerting Suraj sir proactively"""
    global last_stats_state
    await asyncio.sleep(15)

    while True:
        try:
            stats = fetch_live_system_context()
            yt = stats.get("youtube", {})
            current_subs = int(yt.get("subscriberCount", "2"))
            recent_uploads = yt.get("recentUploads", [])

            # Check new Subscribers
            if last_stats_state["subscribers"] > 0 and current_subs > last_stats_state["subscribers"]:
                new_subs = current_subs - last_stats_state["subscribers"]
                sub_alert = (
                    f"🎉 *Badhai ho Suraj sir! Naya Subscriber Jud Gaya!*\n\n"
                    f"• +{new_subs} naya subscriber jud chuka hai!\n"
                    f"• Total Channel Subscribers: *{current_subs}*\n"
                    f"• Channel GTA6-INDIA grow kar raha hai! 🚀"
                )
                await client.send_message(suraj_entity, sub_alert)
                print(f"[Activity Tracker] Notified new subscriber to Suraj sir: {current_subs}")
            last_stats_state["subscribers"] = current_subs

            # Check new Likes on videos
            for vid in recent_uploads:
                vid_id = vid.get("id")
                vid_title = vid.get("title", "Shorts Video")
                current_likes = int(vid.get("likes", 0))

                if vid_id in last_stats_state["video_likes"]:
                    prev_likes = last_stats_state["video_likes"][vid_id]
                    if current_likes > prev_likes:
                        diff = current_likes - prev_likes
                        like_alert = (
                            f"👍 *New Like Alert Suraj sir!*\n\n"
                            f"• Aapki video *\"{vid_title}\"* par +{diff} naya like aaya hai! ❤️\n"
                            f"• Total Likes: *{current_likes}*\n"
                            f"• Link: https://youtu.be/{vid_id}"
                        )
                        await client.send_message(suraj_entity, like_alert)
                        print(f"[Activity Tracker] Notified like to Suraj sir on {vid_id}: {current_likes}")
                
                last_stats_state["video_likes"][vid_id] = current_likes

        except Exception as e:
            print(f"[Activity Tracker Error] {e}")

        await asyncio.sleep(60)

async def run_client():
    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    while True:
        try:
            print(f"[Userbot] Connecting Telegram Client (API ID: {API_ID})...")
            if TELEGRAM_STRING_SESSION:
                print("[Userbot] Initializing with 24/7 Cloud StringSession...")
                client = TelegramClient(StringSession(TELEGRAM_STRING_SESSION), API_ID, API_HASH)
            else:
                client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
            await client.connect()

            if not await client.is_user_authorized():
                print("[Userbot Error] Session not authorized.")
                await client.disconnect()
                return

            me = await client.get_me()
            print(f"[Userbot] Successfully online as: {me.first_name} (ID: {me.id})")

            try:
                suraj_entity = await client.get_entity(CREATOR_USERNAME)
            except Exception:
                suraj_entity = CREATOR_ID

            asyncio.create_task(notify_queue_watcher(client, suraj_entity))
            asyncio.create_task(channel_activity_tracker(client, suraj_entity))

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

                # Command 1: Streamer Reactions & Harvest Pipeline
                if (
                    ("clip" in lower and "bana" in lower) or
                    ("video le" in lower) or
                    ("streamer" in lower) or
                    ("reaction" in lower) or
                    ("shorts bana" in lower) or
                    ("gta" in lower and ("clip" in lower or "video" in lower))
                ):
                    clip_count = 3
                    num_match = re.search(r'(\d+)\s*(?:video|clip|shorts|ta|vdo)?', lower)
                    if num_match:
                        try:
                            parsed_num = int(num_match.group(1))
                            if 1 <= parsed_num <= 10:
                                clip_count = parsed_num
                        except Exception:
                            pass

                    query = "techno gamerz gta 5 funny streamer moments"
                    trigger_local_api("automation/harvest", {
                        "clipCount": clip_count,
                        "query": query
                    })

                    prompt = (
                        f"Suraj sir ordered: '{text}'. Confirm to Suraj sir politely and energetically in Hindi/Hinglish (under 2 sentences) "
                        f"that you are sourcing top Indian streamer gameplay reaction moments ('{query}'), cutting {clip_count} viral 9:16 Shorts with bold Hormozi pop captions, "
                        f"and queuing them for upload. Always address him as 'Suraj sir'."
                    )
                    ai_reply = query_ai_llm(prompt)
                    await event.reply(ai_reply)
                    return

                # Command 2: Trigger Video Upload Queue
                if (
                    "upload karo" in lower or
                    "upload start" in lower or
                    "upload shuru" in lower or
                    "upload kar do" in lower or
                    lower == "upload"
                ):
                    trigger_local_api("automation/start")
                    prompt = (
                        f"Suraj sir said: '{text}'. Confirm to Suraj sir politely that the YouTube upload queue is running, "
                        "and pending videos are uploading right now. Always address him as 'Suraj sir'."
                    )
                    ai_reply = query_ai_llm(prompt)
                    await event.reply(ai_reply)
                    return

                # General Dynamic AI Conversation
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
