#!/usr/bin/env bash
set -euo pipefail

# Objectify Deploy Script
# Usage: ./scripts/deploy.sh [--skip-supabase] [--skip-cloudflare] [--skip-build]
#
# Prerequisites:
#   - supabase CLI installed and linked (supabase link --project-ref <ref>)
#   - wrangler CLI authenticated (npx wrangler login)
#   - CLOUDFLARE_PROJECT_NAME set in .env or environment (default: objectify-cwj)
#   - Environment variables for build: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OPENROUTER_API_KEY

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/packages/web"

# Load .env if present (for CLOUDFLARE_API_TOKEN, CLOUDFLARE_PROJECT_NAME, etc.)
# We selectively export non-VITE_ vars, since VITE_ vars are build-time only
# and VITE_AUTH_BYPASS must never leak into production builds.
if [[ -f "$ROOT_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value#\"}" && value="${value%\"}"  # strip quotes
    if [[ "$key" == "VITE_AUTH_BYPASS" ]]; then
      continue  # never export bypass to production builds
    fi
    export "$key=$value"
  done < "$ROOT_DIR/.env"
fi

# Force VITE_AUTH_BYPASS=false for production builds.
# Vite reads .env via envDir (which may contain VITE_AUTH_BYPASS=true),
# but process env vars take precedence over .env files.
export VITE_AUTH_BYPASS=false

CLOUDFLARE_PROJECT_NAME="${CLOUDFLARE_PROJECT_NAME:-objectify}"

SKIP_SUPABASE=false
SKIP_CLOUDFLARE=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --skip-supabase)   SKIP_SUPABASE=true ;;
    --skip-cloudflare) SKIP_CLOUDFLARE=true ;;
    --skip-build)      SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: ./scripts/deploy.sh [--skip-supabase] [--skip-cloudflare] [--skip-build]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

echo "=== Objectify Deploy ==="
echo ""

# 1. Check for uncommitted changes
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  echo "WARNING: You have uncommitted changes."
  echo ""
  git -C "$ROOT_DIR" status --short
  echo ""
  read -rp "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

echo "Branch: $(git -C "$ROOT_DIR" branch --show-current)"
echo "Commit: $(git -C "$ROOT_DIR" log --oneline -1)"
echo ""

# 2. Supabase migrations
if [[ "$SKIP_SUPABASE" == false ]]; then
  echo "--- Supabase Migrations ---"
  if command -v supabase &>/dev/null; then
    cd "$ROOT_DIR"
    PENDING=$(supabase migration list --linked 2>&1 | grep '|        |' || true)
    if [[ -n "$PENDING" ]]; then
      echo "Pending migrations found. Pushing..."
      supabase db push --linked
      echo "Migrations applied."
    else
      echo "All migrations up to date."
    fi
  else
    echo "ERROR: supabase CLI not found. Install with: brew install supabase/tap/supabase"
    exit 1
  fi
  echo ""
fi

# 3. Build (VITE_AUTH_BYPASS is excluded from env loading above)
if [[ "$SKIP_BUILD" == false ]]; then
  echo "--- Building Web App ---"
  cd "$WEB_DIR"
  npm run build
  echo "Build complete: $WEB_DIR/dist"
  echo ""
fi

# 4. Cloudflare Pages deploy
if [[ "$SKIP_CLOUDFLARE" == false ]]; then
  echo "--- Cloudflare Pages Deploy ---"
  if ! npx wrangler whoami &>/dev/null 2>&1; then
    echo "ERROR: Not authenticated with Cloudflare. Run: npx wrangler login"
    exit 1
  fi
  cd "$ROOT_DIR"
  npx wrangler pages deploy "$WEB_DIR/dist" --project-name="$CLOUDFLARE_PROJECT_NAME" --commit-dirty=true
  echo ""
fi

echo "=== Deploy Complete ==="
