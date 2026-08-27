#!/usr/bin/env python3
"""Create one hashed invite code in the production Agri D1 database."""

import getpass
import hashlib
import subprocess


code = getpass.getpass("Choose a private Agri pilot invite code: ")
if not code:
    raise SystemExit("Invite code cannot be empty.")

label = input("Invite label [pilot]: ").strip() or "pilot"
code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
sql = (
    "INSERT INTO agri_invites (code_hash, code_label, created_at) "
    f"VALUES ('{code_hash}', '{label.replace(chr(39), chr(39) + chr(39))}', "
    "strftime('%s','now') * 1000);"
)

subprocess.run(
    [
        "npx", "wrangler", "d1", "execute", "surakanti-agri-db",
        "--remote", "--profile", "old-cloudflare", "--command", sql,
    ],
    check=True,
)
print("Invite code added. Keep the code private and share it only with pilot participants.")
