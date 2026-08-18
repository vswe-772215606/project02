# Chayxana Master — update feed runbook

**Written:** 2026-08-18, branch `feat/auto-update`.
**Scope:** the master app only. The order app and mobile are not auto-updated and are not
covered here.
**Audience:** whoever ships a version of Chayxana Master to the customer's till.

The master app checks an HTTPS feed for new versions, downloads them in the background, and
asks the operator in Uzbek before restarting. This file is the server half: how the feed is
built, how a release reaches it, how to undo one, and how to test it without touching the
server.

**Nothing here runs automatically.** CI builds and publishes to a GitHub Release; a person
downloads that Release and pushes it to the feed with `deploy/publish-update.sh`. The
electron-updater `generic` provider is download-only — electron-builder physically cannot
publish to it — so "nothing deploys itself" is enforced by the provider, not by discipline.

---

## 1. What the feed is

```
https://updates.mutallib.uz/chayxana/master/production/
├── latest.yml                                the manifest the app polls
├── latest-0.1.4.yml                          rollback copy, deliberately 404 over HTTP
├── ChayxanaMaster-Setup-0.1.4.exe            the installer
└── ChayxanaMaster-Setup-0.1.4.exe.blockmap   makes the next update differential
```

Static files on avtobron under `/srv/updates`, served by the existing `click-avto-nginx-1`
container. There is no application, no database and no upload path. Publishing is rsync over
ssh.

| | |
|---|---|
| Feed URL | `https://updates.mutallib.uz/chayxana/master/production/` |
| Server directory | `avtobron:/srv/updates/chayxana/master/production` |
| Served by | `click-avto-nginx-1` (nginx:1.27-alpine), compose project `click-avto` |
| nginx config | `deploy/nginx/updates.mutallib.uz.conf` in this repo → `/root/click_avto/deploy/nginx/updates.conf` on the server |
| TLS | Let's Encrypt via the existing `click-avto-certbot-1` webroot loop |
| Release source | GitHub Release `v<version>` on `vswe-772215606/project02` |
| Publish command | `deploy/publish-update.sh <version>` |

The URL is baked into the build in exactly three places. Changing the hostname means editing
all three, and only before the first release is published — after that, an installed till
looks for the old host forever.

1. `apps/master/package.json` → `build.publish[0].url`
2. `apps/master/src/main/app-identity.ts` → `IDENTITIES.production.updateFeedUrl`
3. this file

**The `next` variant has no feed and must never get one.** `electron-builder.next.js` sets
`publish: null` and `app-identity.ts` sets `updateFeedUrl: null`; the nginx config pins the
servable path to `.../production/...` so a `next` installer copied into the wrong directory is
served as 404. All three exist because `updaterCacheDirName` is derived from the package
`name`, which is identical for both variants and cannot be changed — it is the database path.
A change that gives `next` a feed without first separating `name` puts a production update on
the trial's database.

---

## 2. One-time server setup

Do this once, in this order. Only step 5 disrupts anything.

Everything below is run by a person on avtobron. Steps 1 and 4 are typed on the Mac.

### 2.1 Before you start

`updates.mutallib.uz` did not resolve as of 2026-08-18. `mutallib.uz` is on Cloudflare
nameservers (`vivienne.ns.cloudflare.com`, `hal.ns.cloudflare.com`) and `epa.mutallib.uz`
already points at this box, so the zone is yours to edit. If it is not, stop: the hostname is
wrong and the three places in §1 must be changed first.

### 2.2 Step 1 — DNS

Add one record in Cloudflare:

```
A   updates   62.171.181.52   DNS only (grey cloud)
```

Grey cloud, to match `carmap.uz`. The origin IP is already public through `carmap.uz`, so
proxying hides nothing, and it keeps 150 MB installer downloads off Cloudflare's proxy. Orange
cloud also works if you prefer it — Cloudflare does not cache `.yml`, so `latest.yml` stays
fresh either way — but then the installer is cached by extension and the cache must be purged
if a filename is ever reused. It never is: the version is in the filename.

Wait for it to resolve before step 2:

```bash
dig +short updates.mutallib.uz     # expect 62.171.181.52
```

### 2.3 Step 2 — TLS certificate

No config change is needed first. `carmap.conf` is mounted as `default.conf`, so its `:80`
server is nginx's implicit default for port 80 and already serves
`/.well-known/acme-challenge/` for any hostname. The certificate can therefore be issued
before the feed's own vhost exists, which is what keeps this whole setup to a single container
recreate.

```bash
ssh avtobron
cd /root/click_avto
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.yml \
  run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot -d updates.mutallib.uz
```

`--entrypoint certbot` is required: the `certbot` service's entrypoint is overridden to a renew
loop, and without this the arguments are appended to that loop instead of running certonly.

Verify:

```bash
docker exec click-avto-nginx-1 ls /etc/letsencrypt/live
# expect: README  carmap.uz  epa.mutallib.uz  updates.mutallib.uz
```

The running certbot container renews everything in that directory on its 12-hour loop; the new
name needs no extra wiring.

### 2.4 Step 3 — the feed directory

```bash
ssh avtobron
mkdir -p /srv/updates/chayxana/master/production
chmod 755 /srv /srv/updates /srv/updates/chayxana /srv/updates/chayxana/master \
          /srv/updates/chayxana/master/production
```

`/srv` already exists and holds `click-avto-backups`. It is on `/dev/sda1`: 387 G, 341 G free
as of 2026-08-18, against about 150 MB per retained version.

### 2.5 Step 4 — the nginx config

Copy this repo's copy of record onto the server, unchanged:

```bash
# from the repo root, on the Mac
ssh avtobron 'cat > /root/click_avto/deploy/nginx/updates.conf' \
  < deploy/nginx/updates.mutallib.uz.conf
```

Then prove it parses **before** going anywhere near the running container. A broken config
does not fail gracefully here: the nginx that fronts `carmap.uz` would refuse to start and
that site stays down until someone notices.

```bash
ssh avtobron
docker run --rm \
  -v /root/click_avto/deploy/nginx/updates.conf:/etc/nginx/conf.d/updates.conf:ro \
  -v click-avto_certbot_etc:/etc/letsencrypt:ro \
  nginx:1.27-alpine nginx -t
# expect: syntax is ok / test is successful
```

This also proves the certificate paths resolve, which is the other way the container fails to
come back.

### 2.6 Step 5 — mount it (the disruptive step)

Add two lines to the `nginx` service in `/root/click_avto/deploy/docker-compose.yml`:

```yaml
  nginx:
    volumes:
      - ./nginx/carmap.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/epa.conf:/etc/nginx/conf.d/epa.conf:ro
      - ./nginx/updates.conf:/etc/nginx/conf.d/updates.conf:ro     # add
      - ../platform/apps/web/dist:/usr/share/nginx/html:ro
      - /srv/updates:/usr/share/nginx/updates:ro                   # add
      - certbot_etc:/etc/letsencrypt:ro
      - certbot_www:/var/www/certbot:ro
```

New bind mounts cannot be added to a running container, so this one command recreates
`click-avto-nginx-1`:

```bash
cd /root/click_avto
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.yml up -d nginx
```

**That container fronts `carmap.uz`, a different client's production site.** It refuses
connections for one to three seconds while it recreates. Do this outside business hours, once.
Every later change to the feed's config is `cat >` into the same file plus
`docker exec click-avto-nginx-1 nginx -s reload`, with no downtime at all, and every later
*publish* touches nginx not at all.

Verify all three sites immediately afterwards:

```bash
curl -sS -o /dev/null -w 'carmap  %{http_code}\n'  https://carmap.uz/
curl -sS -o /dev/null -w 'epa     %{http_code}\n'  https://epa.mutallib.uz/
curl -sS -o /dev/null -w 'updates %{http_code}\n'  https://updates.mutallib.uz/chayxana/master/production/latest.yml
```

`carmap` and `epa` must be 200. `updates` is 404 until the first publish — that is correct,
and it confirms TLS and routing are working.

### 2.7 Step 6 — check the till is an administrator account

Do this before shipping the first auto-updating build, on the till itself:

```
net localgroup Administrators
```

The account the operator logs in as must be listed. The installer is `perMachine`, so it
compiles `RequestExecutionLevel admin`: on an administrator account Windows asks for consent
and the operator clicks Yes; on a **standard** account it asks for an administrator's password,
which the operator does not have, and every update attempt ends with the app closed and not
reopened. If the account is standard, this feature must not ship as designed — a per-user
install is the fallback and changes the install directory, which needs its own review.

Record the answer here when you have it:

> Administrator check: **not yet performed.**

---

## 3. Cutting a release

### 3.1 The first one is special

The build the customer runs today is `0.1.3` and has no updater in it. **The first
updater-capable build must be installed by hand, once**, from the Release `.exe`. Only the
release after that can arrive on its own.

### 3.2 Every release

1. **Bump the version.** On a branch, edit `version` in `apps/master/package.json`, commit,
   merge. This is the single fact everything else is checked against: `app.getVersion()` reads
   the packaged `package.json`, so a tag that ships an unbumped binary makes every till compare
   `0.1.3` against `0.1.3`, decide it is current, and sit on the old build with no error
   anywhere. CI fails the tag build rather than let that happen.

2. **Tag and push.**

   ```bash
   git tag v0.1.4
   git push origin v0.1.4
   ```

3. **Watch the build.** `.github/workflows/build-windows.yml` builds on `windows-latest`,
   checks the version against the tag, checks that `latest.yml`, the `.exe` and the
   `.exe.blockmap` exist and agree, and attaches all three to the Release.

   ```bash
   gh run watch
   gh release view v0.1.4 --repo vswe-772215606/project02
   ```

   Three assets must be listed. If `latest.yml` is missing, `build.publish` has been removed
   from `apps/master/package.json` — without it electron-updater can check for updates but
   throws `ENOENT` when it tries to download one.

4. **Publish to the feed.**

   ```bash
   deploy/publish-update.sh 0.1.4            # asks before uploading
   deploy/publish-update.sh 0.1.4 --dry-run  # download and verify only
   ```

   The script downloads the three assets, checks the `.exe` against the sha512 in `latest.yml`,
   refuses anything that looks like a `next` installer, uploads the installer and blockmap,
   confirms over HTTPS that the installer is really being served at the right byte count, and
   only then uploads `latest.yml`. That order matters: `latest.yml` is the trigger, and a till
   that polls between the manifest landing and the installer landing gets a manifest pointing
   at a 404.

5. **Confirm on the till.** It checks 90 seconds after starting and every 6 hours after that.
   To force it: Sozlamalar → Dastur yangilanishi → Tekshirish. The operator gets a prompt in
   Uzbek showing how many orders are open, and chooses.

---

## 4. Rolling back

Rolling back means pointing `latest.yml` at the previous version. The publish script leaves a
copy of every manifest it uploads, so this is one command and needs no re-download:

```bash
ssh avtobron 'cd /srv/updates/chayxana/master/production && \
  cp latest-0.1.4.yml latest.yml && head -2 latest.yml'
```

Then confirm the feed:

```bash
curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml | head -2
```

Three things to be honest about:

- **This stops the spread; it does not undo an install.** `allowDowngrade` is false, so a till
  that already took the bad version will not walk back to the good one. To fix that machine,
  run the older installer on it by hand.
- **Do not delete the bad `.exe` or its blockmap.** A till may be mid-download, and the
  blockmap of whatever version is installed is what makes the *next* update differential.
- **Fix forward as soon as you can.** A rolled-back feed is a feed whose newest published
  version is older than a binary in the wild; the next release must have a higher version
  number than the bad one, not than the good one.

---

## 5. Testing without touching the server

### 5.1 The nginx config

Exactly what §2.5 does, and it works on any machine with Docker — no server access at all:

```bash
# from the repo root
mkdir -p /tmp/feedtest/live/updates.mutallib.uz
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=updates.mutallib.uz \
  -keyout /tmp/feedtest/live/updates.mutallib.uz/privkey.pem \
  -out   /tmp/feedtest/live/updates.mutallib.uz/fullchain.pem
docker run --rm \
  -v "$PWD/deploy/nginx/updates.mutallib.uz.conf:/etc/nginx/conf.d/updates.conf:ro" \
  -v /tmp/feedtest/live:/etc/letsencrypt/live:ro \
  nginx:1.27-alpine nginx -t
```

Swap `nginx -t` for `-d -p 8443:443` plus a `-v .../usr/share/nginx/updates:ro` content mount
to check routing: `latest.yml` must return 200 with `Cache-Control: no-store`, the `.exe` 200
with an immutable cache header and 206 on a `Range` request, and everything else 404 —
including a `latest-<version>.yml` and anything under a `next/` directory.

### 5.2 The app against a staging feed

This is the only way to exercise `electron-updater` end to end, and it needs a **packaged**
install: the updater is inert unless `app.isPackaged`, and there is deliberately no
`dev-app-update.yml` in this repo, because adding one would point a dev run at the real feed.

1. Build and install a packaged production build on a Windows machine.
2. Put `latest.yml`, the `.exe` and the `.exe.blockmap` for a *higher* version in a directory
   and serve it: `python3 -m http.server 8099`.
3. Launch the app with `CHAYXANA_UPDATE_FEED_URL=http://127.0.0.1:8099/`.
4. Watch `%APPDATA%\@chayxana\master\logs\updater.log`.

The override is accepted only on the `production` variant, and only for `https:` or for
`http:` on `localhost` / `127.0.0.1` / `::1`. Anything else is logged and ignored, and the
baked-in URL is used. The resolved feed is logged at init:
`[updater] feed=<url> source=env|identity variant=production`.

### 5.3 The publish script

`deploy/publish-update.sh 0.1.4 --dry-run` downloads the Release, runs every check, and
uploads nothing.

---

## 6. Retention and disk

Keep the **last five versions**. Never automate deletion.

A blockmap makes an update differential only if the *installed* version's `.exe` and
`.exe.blockmap` are still on the feed; delete them and the next update is a full ~150 MB
download over the chayxana's connection. Prune by hand, and only when you know what is
installed on the till.

```bash
ssh avtobron 'ls -lh /srv/updates/chayxana/master/production'
ssh avtobron 'df -h /srv'
```

---

## 7. When it does not work

| Symptom | Cause | What to do |
|---|---|---|
| Till never offers an update | `latest.yml` version equals the running version | Check `apps/master/package.json` was bumped for that tag. CI fails tag builds where it was not, so an old build usually means the publish step was never run. |
| `updater.log` shows `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` | `latest.yml` is not on the feed | Run the publish script. Confirm with `curl https://updates.mutallib.uz/chayxana/master/production/latest.yml`. |
| Download starts, then fails | `latest.yml` names an `.exe` that is not beside it | The publish script's ordering prevents this. If it happened, re-run it — it re-uploads the installer before the manifest. |
| Download throws `ENOENT` on a cache directory | `build.publish` was removed from `apps/master/package.json` | Restore it. `setFeedURL` replaces only the runtime client; the on-disk `app-update.yml` is what supplies `updaterCacheDirName`, and it is only written when `publish` is configured. |
| TLS error in `updater.log`, nothing in the UI | Certificate expired in nginx's memory | The certbot loop renews the file but does not reload nginx. `docker exec click-avto-nginx-1 nginx -s reload`. This affects `carmap.uz` and `epa.mutallib.uz` equally and is a pre-existing gap on that box. |
| Operator clicked Yes, app never came back | The Windows permission dialog was declined, or the account is not an administrator | Double-click the "Chayxana Master" desktop shortcut. Then do §2.7. |
| Update UI does not appear at all | Unpackaged run, `next` variant, browser preview or gallery | All correct. The updater reports `disabled` and the UI renders nothing. |

`updater.log` is its own file, at `%APPDATA%\@chayxana\master\logs\updater.log`, so the
sequence is readable without startup noise around it. Errors never reach the operator as a
banner — a dead feed must not put a red bar in front of somebody taking orders — so this file
and the Sozlamalar screen are the only places a failure shows up.

---

## 8. Verified on the box, 2026-08-18

Read-only checks against avtobron (`vmi3311735`, 62.171.181.52). Nothing was created or
changed.

- The public edge is the **Docker** nginx, `click-avto-nginx-1`, image `nginx:1.27-alpine`,
  compose project `click-avto` from `/root/click_avto/deploy/docker-compose.yml`. It owns
  `:80` and `:443`.
- The host also has nginx 1.24.0 installed, but the unit is `disabled` and `inactive (dead)`.
  Do not edit `/etc/nginx` on the host; it serves nothing.
- vhosts are single-file bind mounts: `deploy/nginx/carmap.conf` → `default.conf` and
  `deploy/nginx/epa.conf` → `epa.conf`. `default.conf` sorts first, so the `carmap.uz` `:80`
  server is the implicit default for port 80.
- Certificates present: `carmap.uz`, `epa.mutallib.uz`. Not `updates.mutallib.uz`.
- `certbot_etc` is mounted read-only into nginx and read-write into certbot; renewal is a
  12-hour loop in `click-avto-certbot-1`.
- Disk: `/dev/sda1`, 387 G, 341 G free.
- `/srv` exists and holds `click-avto-backups`. `/srv/updates` does not exist.
- DNS: `mutallib.uz` on Cloudflare nameservers; `epa.mutallib.uz` resolves to Cloudflare proxy
  addresses; `carmap.uz` resolves straight to 62.171.181.52; `updates.mutallib.uz` does not
  resolve.

Still open:

- §2.7, the administrator check on the till. Blocking for the first auto-updating release.
- The certbot renew loop does not reload nginx. Pre-existing, affects all three sites.
