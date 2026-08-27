# Surakanti Web Project Memory

## Production Deployment

Production is served by Cloudflare from the GitHub repository:

- Local repo: `/Users/srinivas/surakanti_web`
- Git remote: `git@github.com:bekind9/surakanti.git`
- Branch: `main`
- Production site: `https://surakanti.net`
- Main domain purpose: business/initiative landing page that links to the Surakanti subdomains.

Deploy process:

1. Edit locally.
2. Test locally.
3. Commit changes.
4. Push to GitHub:
   `git push origin main`
5. Cloudflare deploys from GitHub.

Do not use Hostinger FTP for production while the Cloudflare route is active. `surakanti.net` is currently served by Cloudflare from GitHub, not directly from Hostinger public_html.

## Routing

Cloudflare serves clean routes for static pages:

- Home: `https://surakanti.net/` is the Surakanti business/initiative hub.
- Blog: `https://surakanti.net/blog`
- Forms: `https://surakanti.net/forms` redirects to `/forms/`
- Ventures: `ventures/` is deployed as a separate Cloudflare Pages project named `surakanti-ventures`.
- Agri: `agri/` is deployed as a separate Cloudflare Pages project for the former farming homepage.

Do not link to `blog.html` in production navigation. Use `/blog`.

Forms routing has both:

- `forms/index.html` for `/forms/`
- `forms.html` as a fallback because production routing behaves similarly to `/blog` from `blog.html`

Navigation should link to `/forms`.

## Subdomains

- `agri.surakanti.net` is the agriculture/farming site copied from the former main homepage. It is attached to the `surakanti-agri` Cloudflare Pages project, but DNS verification was pending because the `agri.surakanti.net` CNAME record was not set.
- Required DNS record for Agri: `agri.surakanti.net` CNAME to `surakanti-agri.pages.dev`.
- `finance.surakanti.net` is attached to the existing `finances-app` Cloudflare Pages project.
- `ventures.surakanti.net` was added to the `surakanti-ventures` Cloudflare Pages project on 2026-08-27, but DNS verification was pending because the `ventures.surakanti.net` CNAME record was not set.
- Required DNS record for Ventures: `ventures.surakanti.net` CNAME to `surakanti-ventures.pages.dev`.

## Security Notes

- Removed the obsolete `deploy.sh` file because it contained plaintext FTP credentials and was misleading for the current Cloudflare/GitHub production path.
- User chat text must be escaped before rendering.
- AI/markdown output must be sanitized before rendering.

## Current Status - 2026-08-08

Latest production push completed through GitHub -> Cloudflare.

Recent commits:

- `ea8bd9e` - Updated homepage for Telangana farmers, added blog directory route, added forms page.
- `3d754b6` - Added `forms.html` fallback route and switched links to `/forms`.

Live verification after push:

- `https://surakanti.net/` returned `200 OK`
- `https://surakanti.net/blog` returned `200 OK`
- `https://surakanti.net/forms` returned `307` to `/forms/`, then `200 OK`

Current homepage direction:

- Keep homepage focused and not too large.
- Current nav: Services, Forms, Blog, Contact.
- Removed Crop Guides from homepage.
- Removed Schemes section/nav because the site is not a government site.
- Forms are separate page, not a large homepage section.
- Homepage has only a compact Forms callout.

Current Forms page:

- `/forms` / `/forms/`
- Placeholder cards only:
  - Farmer Record Forms
  - Crop & Field Records
  - Reference Checklists
- Do not add fake/broken download links. Add real PDFs or verified URLs only.
- Keep clear disclaimer that Surakanti AI Hub is not a government website.

Security posture from latest review:

- Blog post metadata is escaped before insertion.
- Blog markdown is sanitized before rendering.
- User chat text is escaped before rendering.
- AI markdown output is sanitized before rendering.
- External WhatsApp link uses `rel="noopener noreferrer"`.
- No secrets were added in latest changes.
