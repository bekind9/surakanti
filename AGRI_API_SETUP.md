# Surakanti Agri API setup

The Agri Pages project uses the repository-root `functions/` directory and `agri/` as its static Pages output. The API never imports the Telegram bot and never uses `bot.sqlite3`. Access is closed by default: until at least one active invite hash is inserted, nobody can enter the pilot.

## Cloudflare setup

Create the D1 database using the existing Cloudflare account/profile:

```bash
npx wrangler d1 create surakanti-agri-db --profile old-cloudflare
```

Copy the returned database ID into a local `wrangler.toml` based on `wrangler.toml.example`. This local file is ignored by Git.

Apply the schema:

```bash
npx wrangler d1 migrations apply surakanti-agri-db --remote --profile old-cloudflare
```

In Cloudflare Pages project `surakanti-agri`, add a D1 binding:

```text
Variable name: DB
Database: surakanti-agri-db
```

Redeploy after adding the binding.

## Muse secret

Set the encrypted production secret in the Pages project:

```bash
npx wrangler pages secret put MUSE_API_KEY --project-name surakanti-agri --profile old-cloudflare
```

Paste the Muse key only when Wrangler prompts for it. Never put it in HTML, JavaScript, Git, committed `.env` files, or logs.

## Seed an invite code

The database stores only SHA-256 hashes of invite codes. Generate a hash without printing any API key:

```bash
python3 -c 'import hashlib; print(hashlib.sha256(input("Invite code: ").encode()).hexdigest())'
```

Insert the hash remotely:

```bash
npx wrangler d1 execute surakanti-agri-db --remote --profile old-cloudflare --command "INSERT INTO agri_invites (code_hash, code_label, created_at) VALUES ('PASTE_HASH_HERE', 'pilot', strftime('%s','now') * 1000);"
```

Use a strong private code and do not commit it.

## Local development

Use a local D1 binding after creating a local `wrangler.toml` from the example:

```bash
npx wrangler pages dev agri --d1 DB=REPLACE_WITH_D1_DATABASE_ID --port 8788
```

The local health URL is `http://127.0.0.1:8788/api/agri/health`.

## Endpoints

- `GET /api/agri/health`
- `POST /api/agri/access` with `{ "code": "..." }`
- `POST /api/agri/chat` with `{ "message": "..." }`
- `POST /api/agri/voice` reserved for Telugu STT/TTS
- `POST /api/agri/feedback` with `{ "rating": 1-5, "note": "..." }`

Chat requests are limited to 30 per hour per invite code. The same quota is intended for future voice and image requests.
