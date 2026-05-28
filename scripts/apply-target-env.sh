#!/usr/bin/env bash
set -euo pipefail

echo "apply-target-env.sh jest przestarzały." >&2
echo "Użyj: ./scripts/build.sh" >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build.sh"
