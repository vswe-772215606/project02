#!/usr/bin/env bash
#
# Publish one released version of Chayxana Master to the update feed.
#
# Run by hand, by a person, after the tag build has finished. Nothing in CI
# calls this and nothing should: the generic electron-updater provider is
# download-only, and a release that reaches the till is a decision, not a
# side effect of a push.
#
# What it does, in order:
#   1. downloads the three release assets from GitHub
#   2. verifies locally that latest.yml, the .exe and the .blockmap agree
#   3. uploads the .exe and .blockmap
#   4. verifies over HTTPS that the .exe is really there and the right size
#   5. uploads latest.yml LAST, plus a latest-<version>.yml rollback copy
#   6. verifies the feed serves the new manifest
#
# Step 5 is last on purpose. latest.yml is the trigger: a till that polls
# between the manifest landing and the installer landing downloads a manifest
# pointing at a 404, shows the operator an error, and does not update.
#
# Usage:
#   deploy/publish-update.sh 0.1.4            # asks before uploading
#   deploy/publish-update.sh 0.1.4 --yes      # no prompt
#   deploy/publish-update.sh 0.1.4 --dry-run  # download + verify, upload nothing
#
# See docs/UPDATE_FEED_RUNBOOK.md for first-time server setup and for rollback.

set -euo pipefail

REPO="${CHAYXANA_RELEASE_REPO:-vswe-772215606/project02}"
REMOTE="${CHAYXANA_FEED_HOST:-avtobron}"
REMOTE_DIR="${CHAYXANA_FEED_DIR:-/srv/updates/chayxana/master/production}"
FEED_URL="${CHAYXANA_FEED_URL:-https://updates.mutallib.uz/chayxana/master/production}"

die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

# --- arguments -------------------------------------------------------------

VERSION=""
DRY_RUN=0
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)        die "unknown flag: $arg" ;;
    *)
      [ -z "$VERSION" ] || die "give exactly one version"
      VERSION="${arg#v}"
      ;;
  esac
done

[ -n "$VERSION" ] || die "usage: $0 <version> [--dry-run] [--yes]"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "version must look like 0.1.4, got '$VERSION'" ;;
esac

TAG="v$VERSION"

# --- preflight -------------------------------------------------------------

step "preflight"
for tool in gh rsync curl openssl ssh; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed"
done
gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run: gh auth login"

# Read-only probe. The runbook does first-time setup; this script never creates
# server-side state, so an unprepared feed must fail here and not halfway
# through an upload.
ssh -o BatchMode=yes "$REMOTE" "test -d '$REMOTE_DIR'" \
  || die "$REMOTE:$REMOTE_DIR does not exist — do the one-time setup in docs/UPDATE_FEED_RUNBOOK.md §2 first"
printf 'ok: gh authenticated, %s:%s reachable\n' "$REMOTE" "$REMOTE_DIR"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# --- download --------------------------------------------------------------

step "downloading $TAG from $REPO"
gh release download "$TAG" --repo "$REPO" --dir "$STAGING" \
  --pattern 'latest.yml' --pattern '*.exe' --pattern '*.exe.blockmap' \
  || die "could not download $TAG — has the tag build finished and attached its assets?"
ls -la "$STAGING"

# --- verify the downloaded set --------------------------------------------

# Reads a top-level (column 0) scalar out of latest.yml and strips any quoting.
yml_scalar() {
  sed -n "s/^$1: *//p" "$STAGING/latest.yml" \
    | tr -d '\r' \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

step "verifying the release assets"
[ -f "$STAGING/latest.yml" ] || die "latest.yml is not attached to $TAG — the tag build predates the update feed, or the release step failed"

YML_VERSION="$(yml_scalar version)"
[ "$YML_VERSION" = "$VERSION" ] \
  || die "latest.yml says version $YML_VERSION but you asked to publish $VERSION"

EXE="$(yml_scalar path)"
[ -n "$EXE" ] || die "latest.yml has no top-level path:"
[ -f "$STAGING/$EXE" ] || die "latest.yml names $EXE, which is not among the downloaded assets"
[ -f "$STAGING/$EXE.blockmap" ] \
  || die "$EXE.blockmap is missing — without it every update is a full ~150 MB download"

# The `next` variant has its own database and its own port. An installer for it
# reaching the production feed would upgrade the live till onto the wrong
# build. electron-builder.next.js sets publish:null so this should be
# impossible; check anyway, because the cost of being wrong is the customer's
# data.
case "$EXE" in
  *Yangi*|*yangi*|*next*)
    die "$EXE looks like a 'next' variant installer. The production feed must never carry it — see src/main/app-identity.ts"
    ;;
esac

EXPECTED_SHA="$(yml_scalar sha512)"
ACTUAL_SHA="$(openssl dgst -sha512 -binary "$STAGING/$EXE" | openssl base64 -A)"
[ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] \
  || die "sha512 mismatch for $EXE — latest.yml expects $EXPECTED_SHA, the file hashes to $ACTUAL_SHA. Do not publish this."

EXE_BYTES="$(wc -c < "$STAGING/$EXE" | tr -d ' ')"
printf 'ok: %s, %s bytes, sha512 matches latest.yml\n' "$EXE" "$EXE_BYTES"

# --- confirm ---------------------------------------------------------------

cat <<PLAN

Ready to publish
  version      $VERSION
  installer    $EXE ($EXE_BYTES bytes)
  to           $REMOTE:$REMOTE_DIR
  served at    $FEED_URL/

Order: installer and blockmap first, latest.yml last.
The till checks 90 seconds after it starts and every 6 hours after that, then
asks the operator before restarting.
PLAN

if [ "$DRY_RUN" = "1" ]; then
  step "dry run — nothing was uploaded"
  exit 0
fi

if [ "$ASSUME_YES" != "1" ]; then
  printf '\nPublish now? type yes: '
  read -r reply < /dev/tty
  [ "$reply" = "yes" ] || die "aborted"
fi

# --- upload the payload ----------------------------------------------------

step "uploading installer and blockmap"
# --chmod so nginx (which reads the directory through a read-only bind mount)
# can serve them regardless of the local umask.
rsync -av --chmod=F644 --partial --inplace \
  "$STAGING/$EXE" "$STAGING/$EXE.blockmap" \
  "$REMOTE:$REMOTE_DIR/"

step "verifying the installer over HTTPS before the manifest goes up"
SERVED_BYTES="$(curl -fsSI "$FEED_URL/$EXE" | tr -d '\r' | sed -n 's/^[Cc]ontent-[Ll]ength: *//p' | tail -1)"
[ -n "$SERVED_BYTES" ] || die "$FEED_URL/$EXE did not respond with a Content-Length — check nginx and DNS"
[ "$SERVED_BYTES" = "$EXE_BYTES" ] \
  || die "$FEED_URL/$EXE serves $SERVED_BYTES bytes, expected $EXE_BYTES. latest.yml was NOT published, so no till will see this."
curl -fsSI "$FEED_URL/$EXE.blockmap" >/dev/null \
  || die "$FEED_URL/$EXE.blockmap is not being served. latest.yml was NOT published."
printf 'ok: %s serves %s bytes\n' "$FEED_URL/$EXE" "$SERVED_BYTES"

# --- upload the manifest ---------------------------------------------------

step "uploading the rollback copy, then latest.yml"
# latest-<version>.yml is the rollback: nginx 404s it deliberately, so it is on
# disk for the maintainer and invisible to the feed. Rolling back is one ssh
# `cp` — no re-download, no rehashing.
rsync -av --chmod=F644 "$STAGING/latest.yml" "$REMOTE:$REMOTE_DIR/latest-$VERSION.yml"
rsync -av --chmod=F644 "$STAGING/latest.yml" "$REMOTE:$REMOTE_DIR/latest.yml"

step "verifying the feed"
SERVED_VERSION="$(curl -fsS "$FEED_URL/latest.yml" | tr -d '\r' | sed -n 's/^version: *//p')"
[ "$SERVED_VERSION" = "$VERSION" ] \
  || die "$FEED_URL/latest.yml serves version '$SERVED_VERSION', expected $VERSION"
printf 'ok: %s/latest.yml serves version %s\n' "$FEED_URL" "$SERVED_VERSION"

# --- retention -------------------------------------------------------------

step "what is on the feed now"
ssh -o BatchMode=yes "$REMOTE" "ls -lh '$REMOTE_DIR'"

cat <<'DONE'

Published.

Keep the last five versions. Deleting an .exe or a .blockmap that is still the
installed version on the till turns the next update into a full download, so
prune by hand and only when you know what is installed.

The till picks this up within 6 hours, or immediately if the operator opens
Sozlamalar and taps Tekshirish. It will ask before restarting.
DONE
