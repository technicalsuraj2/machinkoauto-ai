import os
import subprocess
import time
import sys

def main():
    print("==================================================")
    print("   MachinkoAuto 24/7 Cloud Telegram Daemon Loop   ")
    print("==================================================")
    
    # 1. Startup grace period to ensure no overlapping MTProto user sessions
    time.sleep(10)
    
    # 2. Start Userbot and Manager Bot in background processes
    p1 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_userbot.py"])
    p2 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_manager_bot.py"])
    print(f"[Started] Userbot PID: {p1.pid}, Manager Bot PID: {p2.pid}")

    # 3. Watcher loop: run for 3.5 hours (12600 seconds), monitoring both processes
    run_duration = 3.5 * 3600 # 12600 seconds
    start_time = time.time()
    
    while time.time() - start_time < run_duration:
        # Check if any process died unexpectedly, and revive it
        if p1.poll() is not None:
            print("[Watchdog] Userbot stopped! Reviving...")
            p1 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_userbot.py"])
        if p2.poll() is not None:
            print("[Watchdog] Manager bot stopped! Reviving...")
            p2 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_manager_bot.py"])
        
        time.sleep(15)

    # 4. Clean shutdown of current session BEFORE triggering successor
    print("[Handoff] 3.5 hours reached. Disconnecting userbot session...")
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

    print("[Handoff] Spawning successor cloud worker...")
    try:
        res = subprocess.run(["gh", "workflow", "run", "telegram_cloud_worker.yml"], capture_output=True, text=True)
        print(f"[Handoff Result] returncode={res.returncode}, out={res.stdout}, err={res.stderr}")
    except Exception as e:
        print(f"[Handoff Notice] {e}")

    print("[Handoff] Gracefully exiting. Successor has been launched!")

if __name__ == "__main__":
    main()
