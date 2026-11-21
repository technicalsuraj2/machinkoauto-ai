import os
import subprocess
import time
import sys

def main():
    print("==================================================")
    print("   MachinkoAuto 24/7 Cloud Telegram Daemon Loop   ")
    print("==================================================")
    
    # 1. Start Userbot and Manager Bot in background processes
    p1 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_userbot.py"])
    p2 = subprocess.Popen([sys.executable, "-u", "storage/scripts/telegram_manager_bot.py"])
    print(f"[Started] Userbot PID: {p1.pid}, Manager Bot PID: {p2.pid}")

    # 2. Watcher loop: run for 3.5 hours (12600 seconds), monitoring both processes
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

    # 3. Before exiting, trigger successor runner in GitHub Actions
    print("[Handoff] 3.5 hours reached. Spawning successor cloud worker...")
    try:
        res = subprocess.run(["gh", "workflow", "run", "telegram_cloud_worker.yml"], capture_output=True, text=True)
        print(f"[Handoff Result] returncode={res.returncode}, out={res.stdout}, err={res.stderr}")
    except Exception as e:
        print(f"[Handoff Notice] {e}")

    # Give new worker 45 seconds to spin up
    time.sleep(45)

    # Clean termination
    try:
        p1.terminate()
        p2.terminate()
    except Exception:
        pass
    print("[Handoff] Gracefully exiting. Successor is now live!")

if __name__ == "__main__":
    main()
