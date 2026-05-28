#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ENV_FILE="$ROOT_DIR/.env"
SOURCE_AT="$ROOT_DIR/assets/at.js.template"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Brak pliku .env w: $ENV_FILE" >&2
  echo "Skopiuj .env.example do .env i uzupełnij wartości." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_AT" ]]; then
  echo "Brak szablonu at.js: $SOURCE_AT" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${at_property:?Brak at_property w .env}"
: "${metarouter_write_key:?Brak metarouter_write_key w .env}"
: "${metarouter_host:?Brak metarouter_host w .env}"
: "${metarouter_client_name:?Brak metarouter_client_name w .env}"
: "${metarouter_container_id:?Brak metarouter_container_id w .env}"
: "${metarouter_gcs_base:?Brak metarouter_gcs_base w .env}"
: "${onetrust_domain_id:?Brak onetrust_domain_id w .env}"
: "${onetrust_target_category_id:?Brak onetrust_target_category_id w .env}"

target_script_url="${target_script_url:-./at.js}"
metarouter_gcs_base="${metarouter_gcs_base%/}"
metarouter_analytics_url="${metarouter_gcs_base}/${metarouter_container_id}/ajs/analytics.js"
metarouter_tagging_url="${metarouter_gcs_base}/${metarouter_container_id}/dev/tagging.js"

echo "Czyszczenie katalogu dist/..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/scripts"

echo "Kopiowanie plików statycznych..."
cp "$ROOT_DIR/index.html" \
   "$ROOT_DIR/target-demo.html" \
   "$ROOT_DIR/analytics-workspace-guide.html" \
   "$ROOT_DIR/styles.css" \
   "$DIST_DIR/"

cp "$ROOT_DIR"/scripts/*.js "$DIST_DIR/scripts/"

echo "Generowanie at.js..."
cp "$SOURCE_AT" "$DIST_DIR/at.js"
perl -0pi -e 's/TOKEN_PROPERTY/$ENV{at_property}/g; s/HASHED_AT_PROPERTY_TOKEN_PLACEHOLDER/$ENV{at_property}/g' "$DIST_DIR/at.js"
perl -0pi -e 's/\A\s*targetPageParams\s*=\s*function\s*\(\)\s*\{.*?\};\s*(?=\/\*\*)//s' "$DIST_DIR/at.js"

echo "Generowanie target-config.js..."
cat > "$DIST_DIR/target-config.js" <<CONFIG
window.TargetProjectConfig = {
  atProperty: "${at_property}",
  oneTrustDomainId: "${onetrust_domain_id}",
  targetCategoryId: "${onetrust_target_category_id}",
  targetScriptUrl: "${target_script_url}"
};

window.MetaRouterTestConfig = {
  host: "${metarouter_host}",
  writeKey: "${metarouter_write_key}",
  clientName: "${metarouter_client_name}",
  containerId: "${metarouter_container_id}",
  analyticsUrl: "${metarouter_analytics_url}",
  taggingUrl: "${metarouter_tagging_url}"
};
CONFIG

echo ""
echo "Build gotowy: $DIST_DIR"
echo "Wrzuć całą zawartość dist/ na serwer WWW i otwórz target-demo.html pod docelową domeną."
