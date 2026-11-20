import sqlite3
import os

db_path = "prisma/dev.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", tables)

for t in tables:
    if t.startswith("_"):
        continue
    cur.execute(f'SELECT count(*) FROM "{t}"')
    count = cur.fetchone()[0]
    print(f"Table '{t}': {count} rows")
    if t in ["Video", "video", "User", "AutomationSetting"]:
        cur.execute(f'SELECT * FROM "{t}" LIMIT 5')
        print(f"  Sample rows from {t}:", cur.fetchall())
conn.close()
