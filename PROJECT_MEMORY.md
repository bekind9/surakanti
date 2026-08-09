# Surakanti Web Project Memory

## Production Deployment

Production is served by Cloudflare from the GitHub repository:

- Local repo: `/Users/srinivas/surakanti_web`
- Git remote: `git@github.com:bekind9/surakanti.git`
- Branch: `main`
- Production site: `https://surakanti.net`

Deploy process:

1. Edit locally.
2. Test locally.
3. Commit changes.
4. Push to GitHub:
   `git push origin main`
5. Cloudflare deploys from GitHub.

Do not use `deploy.sh` for production while the Cloudflare route is active. It uploads to Hostinger FTP, but `surakanti.net` is currently served by Cloudflare, not directly from Hostinger public_html.

## Routing

Cloudflare serves clean routes for static pages:

- Home: `https://surakanti.net/`
- Blog: `https://surakanti.net/blog`

Do not link to `blog.html` in production navigation. Use `/blog`.

## Security Notes

- `deploy.sh` contains plaintext FTP credentials and is misleading for the current production path. Remove it or move credentials to a private local-only mechanism later.
- User chat text must be escaped before rendering.
- AI/markdown output must be sanitized before rendering.
