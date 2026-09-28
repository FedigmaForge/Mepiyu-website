# Mepiyu Wander Travels — Trip Planning Website

A trip-planning website with a public site (destinations, packages, a quick trip
planner that hands off to WhatsApp) and a password-protected admin dashboard for
editing everything without touching code.

## What's inside

- **Public site** (`/public`) — plain HTML/CSS/JS, no build step.
- **Admin dashboard** (`/admin`) — login screen + editor for site settings,
  destinations, packages and gallery photos.
- **Backend** (`/server`) — a single Node.js server (no external npm packages)
  with a real SQLite database (`server/mepia.db`, created automatically).

## Running it

Requires **Node.js 22+** (uses the built-in `node:sqlite` module).

```
node server/server.js
```

Then open:
- Public site: http://localhost:3000
- Admin panel: http://localhost:3000/admin

**Default admin login** (created automatically on first run):
- Username: `admin`
- Password: `mepia@admin1`

⚠️ **Change this password immediately** — log in, go to *Account* in the sidebar,
and set a new one. Anyone with this password can edit the whole site.

## Before you go live — 3 things to update

1. **WhatsApp number.** In the admin panel → *Site settings* → "WhatsApp number",
   enter your business number in international format, digits only, no `+` or
   spaces (e.g. `919876543210`). This is currently set to a placeholder
   (`919999999999`) and every "Chat on WhatsApp" button on the site uses it —
   nothing will actually reach you until this is changed.
2. **Admin password** (see above).
3. **Contact details** — phone, email, address — also under *Site settings*.

Everything else (destinations, tour packages, prices, itineraries, photos) is
already filled in from the package details and photos shared in your WhatsApp
group, and can be edited or added to from the admin dashboard.

## Hosting

This needs a host that can run a persistent Node.js process (not a pure static
host like GitHub Pages) — e.g. Render, Railway, a small VPS, or similar. Point
its start command at `node server/server.js` and make sure the working
directory is writable (the SQLite file and uploaded photos are stored on disk
under `server/mepia.db` and `public/uploads/`).

If you'd rather not manage a server at all, the alternative is a git-based CMS
approach on a free static host — let me know and I can switch the setup over.

## Environment variables / secrets

Secrets are **never** committed. Copy `.env.example` to `.env` on the server
(it is git-ignored) or set the same keys in your AWS console. `npm start`
loads `.env` automatically.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` on AWS |
| `PORT` / `HOST` | Listen port/host (default `3000` / `0.0.0.0`) |
| `SITE_URL` | Public URL, e.g. `https://www.example.com` (canonical, sitemap, OG tags) |
| `ADMIN_ENABLED` | `true` to turn on `/admin` |
| `ADMIN_PASSWORD` | Sets/rotates the `admin` password on startup |
| `DB_PATH` / `UPLOADS_DIR` | Optional persistent locations for the database and uploaded photos |

In production the admin panel refuses to start while the account still uses
the default password — set `ADMIN_PASSWORD`.

## Deploying on AWS

Works on EC2, Lightsail, Elastic Beanstalk (Node.js 22 platform) or App Runner.
Requires **Node.js 22.13+**. Start command: `npm start`. Health check path: `/healthz`.

- Put it behind HTTPS (ALB / CloudFront / Nginx + Let's Encrypt). Session
  cookies get the `Secure` flag automatically when `X-Forwarded-Proto: https`.
- Run a **single instance** — sessions and the SQLite file are local to the machine.
- On Elastic Beanstalk / App Runner the disk is replaced on each deploy, so
  admin edits and uploads are lost unless `DB_PATH` and `UPLOADS_DIR` point to a
  persistent volume (EBS/EFS). On a plain EC2/Lightsail box this is not an issue.
- On first boot with a new `DB_PATH`, the bundled `server/mepia.db` content is
  copied there automatically.

## Project structure

```
mepia-website/
├── server/
│   ├── server.js      # HTTP server + REST API + auth
│   ├── db.js           # SQLite schema + initial content
│   └── mepia.db         # created on first run
├── public/              # public website
│   ├── index.html
│   ├── css/style.css
│   ├── js/main.js
│   └── uploads/          # gallery photos uploaded via admin
└── admin/                # admin dashboard
    ├── index.html
    ├── css/admin.css
    └── js/admin.js
```
