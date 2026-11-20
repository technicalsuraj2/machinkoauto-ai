import os
import sys
import asyncio
import json
import shutil
from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

API_ID = int(os.getenv("TELEGRAM_API_ID", "38595785"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "061fb3e46d0d9a3076eada93d91c4d81")
DEFAULT_PHONE = os.getenv("TELEGRAM_CREATOR_PHONE", "7990369253")

SESSION_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_ai_user"))
STATE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_auth_state.json"))

def format_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+91" + phone.lstrip("0")
    return phone

async def send_code(phone_number: str = None):
    from telethon import TelegramClient

    target_phone = format_phone(phone_number or DEFAULT_PHONE)
    
    # Clean previous temp session if any
    for ext in ["", ".session", ".session-journal"]:
        p = f"{SESSION_PATH}_temp{ext}"
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    temp_session = f"{SESSION_PATH}_temp"
    client = TelegramClient(temp_session, API_ID, API_HASH)
    await client.connect()

    result = await client.send_code_request(target_phone)
    with open(STATE_FILE, "w") as f:
        json.dump({
            "phone_code_hash": result.phone_code_hash,
            "phone": target_phone,
            "session": temp_session
        }, f)

    print(json.dumps({
        "status": "code_sent",
        "phone": target_phone,
        "phone_code_hash": result.phone_code_hash,
        "message": f"Telegram login code sent to {target_phone} on Telegram app!"
    }))
    await client.disconnect()

async def verify_code(code: str, password: str = None):
    from telethon import TelegramClient
    from telethon.errors import SessionPasswordNeededError

    if not os.path.exists(STATE_FILE):
        print(json.dumps({"status": "error", "message": "No active code request found. Send code first."}))
        return

    with open(STATE_FILE, "r") as f:
        state = json.load(f)

    session_to_use = state.get("session", SESSION_PATH)
    client = TelegramClient(session_to_use, API_ID, API_HASH)
    await client.connect()

    try:
        await client.sign_in(
            phone=state["phone"],
            code=code.strip(),
            phone_code_hash=state["phone_code_hash"]
        )
    except SessionPasswordNeededError:
        if password:
            await client.sign_in(password=password)
        else:
            print(json.dumps({"status": "2fa_needed", "message": "Two-factor authentication (2FA) password required."}))
            await client.disconnect()
            return
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        await client.disconnect()
        return

    me = await client.get_me()
    await client.disconnect()

    # Move temp session to final session if needed
    if session_to_use != SESSION_PATH:
        for ext in [".session", ".session-journal"]:
            src = f"{session_to_use}{ext}"
            dst = f"{SESSION_PATH}{ext}"
            if os.path.exists(src):
                shutil.copy2(src, dst)

    print(json.dumps({
        "status": "success",
        "name": me.first_name,
        "username": me.username,
        "phone": me.phone,
        "message": f"Successfully authorized user {me.first_name}! Session saved."
    }))

    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "verify":
        code = sys.argv[2] if len(sys.argv) > 2 else ""
        pwd = sys.argv[3] if len(sys.argv) > 3 else None
        asyncio.run(verify_code(code, pwd))
    elif len(sys.argv) > 1 and sys.argv[1] == "send":
        target = sys.argv[2] if len(sys.argv) > 2 else None
        asyncio.run(send_code(target))
    else:
        asyncio.run(send_code())
