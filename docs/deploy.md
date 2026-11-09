# Deployment (Render)

The whole site runs as one Node web service on Render, described in `render.yaml`
(a Render "Blueprint"). Render builds it from GitHub on every push to `main`.

## First time
1. Push the repository to GitHub.
2. On https://dashboard.render.com: **New > Blueprint**, pick the repository. Render reads
   `render.yaml` and creates the `etienne` service (free plan, Frankfurt).
3. The site is then at `https://etienne.onrender.com` (or the name Render gives if
   it is taken).

## Settings (in `render.yaml`)
- `CLIENT_IP_HEADER=cf-connecting-ip`: the visitor's address, for the per-address limits
  (Cloudflare, in front of Render, writes this header; visitors cannot forge it).
- Never set `PER_IP_LIMITS=off` there: it is for the end-to-end tests only.
- Node version: `engines` in `package.json`.

## Free plan
- The service sleeps after 15 minutes without visitors; the next visitor waits ~30 s.
- One instance, games in memory: a deploy or a restart ends the online games in progress.
