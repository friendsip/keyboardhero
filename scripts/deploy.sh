#!/usr/bin/env bash
# Deploy the production build to a webserver subdirectory (docs/14, Option A).
#
# Usage:
#   ./scripts/deploy.sh user@server:/var/www/yoursite/typing/
# or set a default once:
#   export DEPLOY_DEST=user@server:/var/www/yoursite/typing/
#   ./scripts/deploy.sh
set -euo pipefail

DEST="${1:-${DEPLOY_DEST:-}}"
if [[ -z "$DEST" ]]; then
  echo "usage: $0 user@server:/path/to/site/typing/   (or set DEPLOY_DEST)" >&2
  exit 1
fi

npm run build
rsync -av --delete dist/ "$DEST"
echo "Deployed to $DEST"
