Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\admin\OneDrive\Desktop\Ai Automation"
WshShell.Run "pythonw storage\scripts\telegram_userbot.py", 0, False
