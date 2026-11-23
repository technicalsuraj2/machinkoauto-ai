import os
import subprocess
import time
import sys

import os
import subprocess
import time
import sys
import datetime

def trigger_pipeline(workflow_name: str):
    """Trigger a GitHub Actions upload pipeline from the 24/7 cloud daemon"""
    try:
        print(f"[Scheduler] Triggering {workflow_name} on cloud...")
        res = subprocess.run(["gh", "workflow", "run", workflow_name], capture_output=True, text=True)
        print(f"[Scheduler Trigger Result] {workflow_name}: returncode={res.returncode}, stdout={res.stdout.strip()}")
    except Exception as e:
        print(f"[Scheduler Trigger Error] {workflow_name}: {e}")

def main():
    print("==================================================")
    print("   MachinkoAuto 24/7 Cloud Telegram Daemon Loop   ")
    print("==================================================")
    
    # 1. Startup grace period to ensure no overlapping MTProto user sessions
    time.sleep(15)
    
    # 2. Start Userbot and Manager Bot in background processes
    p1 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_userbot.py"])
    p2 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_manager_bot.py"])
    print(f"[Started] Userbot PID: {p1.pid}, Manager Bot PID: {p2.pid}")

    # 3. Watcher & Automation Scheduler Loop: run for 5 hours (18000 seconds)
    run_duration = 5 * 3600 # 18000 seconds (Safe under GitHub 6-hour limit)
    start_time = time.time()
    last_triggers = {}
    
    while time.time() - start_time < run_duration:
        # A. Check process health and revive if crashed
        if p1.poll() is not None:
            print("[Watchdog] Userbot stopped! Reviving...")
            p1 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_userbot.py"])
        if p2.poll() is not None:
            print("[Watchdog] Manager bot stopped! Reviving...")
            p2 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_manager_bot.py"])
        
        # B. Automated Upload Scheduler (Runs without relying on delayed GitHub crons)
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        today_date = now_utc.strftime("%Y-%m-%d")
        utc_hour = now_utc.hour
        utc_minute = now_utc.minute

        # Slot 1: 00:00 UTC (5:30 AM IST) -> Daily GTA6-INDIA Autonomous Clipping
        if utc_hour == 0 and 0 <= utc_minute <= 15:
            key = f"gta_{today_date}_slot1"
            if key not in last_triggers:
                last_triggers[key] = True
                trigger_pipeline("daily_youtube_pipeline.yml")

        # Slot 2: 00:30 UTC (6:00 AM IST) -> Daily Drive 5k Clips for Drive Channels
        if utc_hour == 0 and 30 <= utc_minute <= 45:
            key = f"drive_{today_date}_slot1"
            if key not in last_triggers:
                last_triggers[key] = True
                trigger_pipeline("daily_multi_channel_drive.yml")

        # Slot 3: 13:00 UTC (6:30 PM IST) -> Evening 24-hr Rolling Reset Batch (Unlock Time)
        if (utc_hour == 13 and 0 <= utc_minute <= 20) or (utc_hour == 13 and 35 <= utc_minute <= 50):
            key = f"drive_{today_date}_slot_{utc_hour}_{1 if utc_minute < 30 else 2}"
            if key not in last_triggers:
                last_triggers[key] = True
                trigger_pipeline("daily_multi_channel_drive.yml")

        # Slot 4: 21:30 UTC (3:00 AM IST) -> IShowSpeed Stream Clipper & Stager (Before 5:30 AM reset)
        if utc_hour == 21 and 30 <= utc_minute <= 45:
            key = f"speed_{today_date}_slot1"
            if key not in last_triggers:
                last_triggers[key] = True
                trigger_pipeline("speed_stream_pipeline.yml")

        time.sleep(20)

    # 4. Clean shutdown of current session BEFORE triggering successor
    print("[Handoff] 5 hours reached. Disconnecting userbot session...")
    try:
        p1.terminate()
        p1.wait(timeout=10)
    except Exception:
        pass

    try:
        p2.terminate()
        p2.wait(timeout=10)
    except Exception:
        pass

    # Wait 45 seconds for all MTProto TCP sockets to fully close on Telegram servers
    print("[Handoff] Waiting 45s to prevent AuthKeyDuplicatedError across runners...")
    time.sleep(45)

    print("[Handoff] Spawning successor cloud worker...")
    try:
        res = subprocess.run(["gh", "workflow", "run", "telegram_cloud_worker.yml"], capture_output=True, text=True)
        print(f"[Handoff Result] returncode={res.returncode}, out={res.stdout}, err={res.stderr}")
    except Exception as e:
        print(f"[Handoff Notice] {e}")

    print("[Handoff] Gracefully exiting. Successor has been launched!")

if __name__ == "__main__":
    main()

if __name__ == "__main__":
    main()
