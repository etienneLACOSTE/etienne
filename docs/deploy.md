# Deployment (Render)

The whole site runs as one Node web service on Render, described in `render.yaml`
(a Render "Blueprint"). Render builds it from GitHub on every push to `main`.

## First time
1. Push the repository to GitHub.
2. On https://dashboard.render.com: **New > Blueprint**, pick the repository. Render reads
   `render.yaml` and creates the `etienne` service (free plan, Frankfurt).
3. Render gives the address: the site is at `https://etienne-k19j.onrender.com`
   (`etienne.onrender.com` was taken: it is someone else's site).

## Settings (in `render.yaml`)
- `CLIENT_IP_HEADER=cf-connecting-ip`: the visitor's address, for the per-address limits
  (Cloudflare, in front of Render, writes this header; visitors cannot forge it).
  Checked on the live site on 2026-11-12: a request carrying its own `CF-Connecting-IP`
  is refused by Cloudflare (403, error 1000) before reaching the server, and forged
  `X-Forwarded-For` / `True-Client-IP` are ignored: 10 failed sign-ins with 10 different
  forged addresses, then 429. To check again: send 11 failed sign-ins (made-up
  usernames, header `Origin` set to the site) with a different forged address each.
- Never set `PER_IP_LIMITS=off` there: it is for the end-to-end tests only.
- Node version: `engines` in `package.json`.

## Free plan
- The service sleeps after 15 minutes without visitors; the next visitor waits ~30 s.
- One instance, games in memory: a deploy or a restart ends the online games in progress.
