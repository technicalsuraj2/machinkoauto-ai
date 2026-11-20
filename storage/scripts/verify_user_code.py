import os
import sys
import asyncio
import json
import subprocess
from dotenv import load_dotenv

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(env_path)

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError

API_ID = int(os.getenv("TELEGRAM_API_ID", "38595785"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "061fb3e46d0d9a3076eada93d91c4d81")
STATE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "telegram_auth_state.json"))

async def verify(code: str, password: str = None):
    if not os.path.exists(STATE_FILE):
        print(json.dumps({"status": "error", "message": "State file not found. Code request was not sent."}))
        return False

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    session_name = state.get("session", "storage/temp_auth_test")
    phone = state["phone"]
    phone_code_hash = state["phone_code_hash"]

    client = TelegramClient(session_name, API_ID, API_HASH)
    await client.connect()

    try:
        await client.sign_in(phone=phone, code=code.strip(), phone_code_hash=phone_code_hash)
    except SessionPasswordNeededError:
        if password:
            await client.sign_in(password=password)
        else:
            print(json.dumps({"status": "2fa_needed", "message": "Two-factor authentication (2FA) password required."}))
            await client.disconnect()
            return False
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        await client.disconnect()
        return False

    me = await client.get_me()
    print(f"[SUCCESS] Authorized as: {me.first_name} ({me.phone}) - ID: {me.id}")

    # Export to StringSession
    string_session = StringSession.save(client.session)
    await client.disconnect()

    # Save to string_session.txt
    str_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "string_session.txt"))
    with open(str_file, "w", encoding="utf-8") as f:
        f.write(string_session)

    # Update .env
    with open(env_path, "r", encoding="utf-8") as f:
        env_content = f.read()

    if "TELEGRAM_STRING_SESSION=" in env_content:
        import re
        env_content = re.sub(r'TELEGRAM_STRING_SESSION=.*', f'TELEGRAM_STRING_SESSION="{string_session}"', env_content)
    else:
        env_content += f'\nTELEGRAM_STRING_SESSION="{string_session}"\n'

    with open(env_path, "w", encoding="utf-8") as f:
        f.write(env_content)

    # Update GitHub Secret
    try:
        cmd = f'gh secret set TELEGRAM_STRING_SESSION -b "{string_session}" -R technicalsuraj2/machinkoauto-ai'
        subprocess.run(cmd, shell=True, check=True)
        print("[GitHub Secrets] Successfully synced TELEGRAM_STRING_SESSION to cloud!")
    except Exception as gh_err:
        print(f"[GitHub Secret Warning] {gh_err}")

    print(json.dumps({"status": "success", "user": me.first_name, "id": me.id}))
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python verify_user_code.py <code> [password]")
        sys.exit(1)
    c = sys.argv[1]
    p = sys.argv[2] if len(sys.argv) > 2 else None
    asyncio.run(verify(c, p))
