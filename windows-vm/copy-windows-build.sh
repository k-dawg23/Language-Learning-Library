#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_ROOT="${REPO_ROOT}/src-tauri/target"
DEST_DIR="${SCRIPT_DIR}/storage/transfer"

mkdir -p "${DEST_DIR}"

copy_file() {
  local src="$1"
  local base dest
  base="$(basename "${src}")"
  dest="${DEST_DIR}/${base}"

  if [[ -e "${dest}" ]]; then
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    dest="${DEST_DIR}/${stamp}-${base}"
  fi

  cp -f "${src}" "${dest}"
  echo "Copied: ${src}"
  echo "   ->  ${dest}"
}

if [[ $# -gt 0 ]]; then
  for path in "$@"; do
    if [[ ! -f "${path}" ]]; then
      echo "File not found: ${path}" >&2
      exit 1
    fi
    copy_file "${path}"
  done
else
  if [[ ! -d "${TARGET_ROOT}" ]]; then
    echo "No target directory found at ${TARGET_ROOT}" >&2
    echo "Build Windows artifacts first, or pass installer file paths explicitly." >&2
    exit 1
  fi

  mapfile -t installers < <(
    find "${TARGET_ROOT}" -type f \( -iname "*.msi" -o -iname "*.exe" \) | sort
  )

  if [[ ${#installers[@]} -eq 0 ]]; then
    echo "No Windows installer artifacts found under ${TARGET_ROOT}" >&2
    echo "Expected .msi/.exe files from a Windows build." >&2
    echo "You can also pass file paths directly:" >&2
    echo "  ./copy-windows-build.sh /path/to/installer.msi" >&2
    exit 1
  fi

  for installer in "${installers[@]}"; do
    copy_file "${installer}"
  done
fi

echo
echo "Transfer complete."
echo "Host path: ${DEST_DIR}"
echo "Container path: /storage/transfer"
