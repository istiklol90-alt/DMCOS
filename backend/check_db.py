import sqlite3

db = sqlite3.connect("dmc.db")
cursor = db.cursor()

print("Tables:")
print(cursor.execute(
    "SELECT name FROM sqlite_master WHERE type='table';"
).fetchall())

print()

print("Users columns:")
print(cursor.execute(
    "PRAGMA table_info(users);"
).fetchall())

db.close()