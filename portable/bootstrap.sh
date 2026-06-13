#!/usr/bin/env bash
set -Eeuo pipefail

REPO_SLUG="${POSTSNAIL_GITHUB_REPO:-elmirok/PostSnail}"
RELEASE_ASSET="${POSTSNAIL_PORTABLE_RELEASE_ASSET:-postsnail-portable.zip}"
SOURCE_BRANCH="${POSTSNAIL_PORTABLE_SOURCE_BRANCH:-main}"
TARGET_DIR="${POSTSNAIL_PORTABLE_DIR:-}"
AUTO_INSTALL=0
AUTO_LAUNCH=1
VERBOSE=1

usage() {
  cat <<'EOF'
PostSnail Portable bootstrapper

Usage:
  curl -fsSL https://raw.githubusercontent.com/elmirok/PostSnail/main/portable/bootstrap.sh | bash

Optional flags:
  --dir <path>         Install the portable bundle into this directory
  --repo <owner/repo>  Override the GitHub repository slug
  --asset <name>       Override the GitHub release asset name
  --branch <name>      Override the GitHub source archive branch
  --yes                Install missing tools without prompting
  --download-only      Download and unpack without launching the admin
  --quiet              Reduce banner output
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir|--target-dir)
      TARGET_DIR="${2:-}"
      shift 2
      ;;
    --repo)
      REPO_SLUG="${2:-}"
      shift 2
      ;;
    --asset)
      RELEASE_ASSET="${2:-}"
      shift 2
      ;;
    --branch)
      SOURCE_BRANCH="${2:-}"
      shift 2
      ;;
    --yes|-y)
      AUTO_INSTALL=1
      shift
      ;;
    --download-only)
      AUTO_LAUNCH=0
      shift
      ;;
    --quiet)
      VERBOSE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

NODE_BIN=""
PACKAGE_MANAGER=""
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/postsnail-bootstrap.XXXXXX")"
ZIP_PATH="$TMP_DIR/$RELEASE_ASSET"
DEFAULT_DIR="${PWD%/}/postsnail-portable"
INSTALL_DIR="${TARGET_DIR:-$DEFAULT_DIR}"
RELEASE_URL="https://github.com/${REPO_SLUG}/releases/latest/download/${RELEASE_ASSET}"
SOURCE_ARCHIVE_URL="https://github.com/${REPO_SLUG}/archive/refs/heads/${SOURCE_BRANCH}.zip"
REQUIRED_TOOLS=(curl unzip)
RECOMMENDED_TOOLS=(git python3)
MISSING_REQUIRED=()
MISSING_RECOMMENDED=()
DOWNLOAD_KIND="release"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '%s\n' "$*"
}

vlog() {
  if [ "$VERBOSE" -eq 1 ]; then
    printf '%s\n' "$*"
  fi
}

step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

tool_path() {
  command -v "$1" 2>/dev/null
}

node_command() {
  if [ -n "$NODE_BIN" ]; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi
  if NODE_BIN="$(tool_path node)"; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi
  if NODE_BIN="$(tool_path nodejs)"; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi
  return 1
}

check_tool() {
  local name="$1"
  local path=""
  case "$name" in
    node)
      if path="$(node_command)"; then
        vlog "  [ok] $name -> $path"
        return 0
      fi
      MISSING_REQUIRED+=("$name")
      vlog "  [missing] $name"
      return 1
      ;;
    python3)
      if path="$(tool_path python3)"; then
        vlog "  [ok] $name -> $path"
        return 0
      fi
      MISSING_RECOMMENDED+=("$name")
      vlog "  [missing] $name"
      return 1
      ;;
    *)
      if path="$(tool_path "$name")"; then
        vlog "  [ok] $name -> $path"
        return 0
      fi
      MISSING_REQUIRED+=("$name")
      vlog "  [missing] $name"
      return 1
      ;;
  esac
}

detect_package_manager() {
  if tool_path brew >/dev/null 2>&1; then
    PACKAGE_MANAGER="brew"
    return 0
  fi
  if tool_path apt-get >/dev/null 2>&1; then
    PACKAGE_MANAGER="apt-get"
    return 0
  fi
  if tool_path dnf >/dev/null 2>&1; then
    PACKAGE_MANAGER="dnf"
    return 0
  fi
  if tool_path pacman >/dev/null 2>&1; then
    PACKAGE_MANAGER="pacman"
    return 0
  fi
  if tool_path zypper >/dev/null 2>&1; then
    PACKAGE_MANAGER="zypper"
    return 0
  fi
  if tool_path apk >/dev/null 2>&1; then
    PACKAGE_MANAGER="apk"
    return 0
  fi
  PACKAGE_MANAGER=""
  return 1
}

package_names_for_tool() {
  case "$1" in
    node) if [ "$(uname -s)" = "Darwin" ]; then printf '%s\n' node; else printf '%s\n' nodejs; fi ;;
    python3) if [ "$PACKAGE_MANAGER" = "brew" ]; then printf '%s\n' python; else printf '%s\n' python3; fi ;;
    git) printf '%s\n' git ;;
    curl) printf '%s\n' curl ;;
    unzip) printf '%s\n' unzip ;;
    *) printf '%s\n' "$1" ;;
  esac
}

join_packages() {
  local tool
  local packages=()
  for tool in "$@"; do
    packages+=("$(package_names_for_tool "$tool")")
  done
  (IFS=' '; printf '%s' "${packages[*]}")
}

install_missing_tools() {
  local -a requested=("$@")
  local packages
  local manager_name="$PACKAGE_MANAGER"

  if [ "${#requested[@]}" -eq 0 ]; then
    return 0
  fi

  if [ -z "$manager_name" ]; then
    log "No supported package manager was detected."
    log "Install the missing tools manually, then run this bootstrapper again."
    return 1
  fi

  packages="$(join_packages "${requested[@]}")"
  case "$manager_name" in
    brew)
      log "Installing with Homebrew: $packages"
      brew install $packages
      ;;
    apt-get)
      log "Installing with apt-get: $packages"
      sudo apt-get update
      sudo apt-get install -y $packages
      ;;
    dnf)
      log "Installing with dnf: $packages"
      sudo dnf install -y $packages
      ;;
    pacman)
      log "Installing with pacman: $packages"
      sudo pacman -Sy --noconfirm $packages
      ;;
    zypper)
      log "Installing with zypper: $packages"
      sudo zypper --non-interactive install $packages
      ;;
    apk)
      log "Installing with apk: $packages"
      sudo apk add $packages
      ;;
    *)
      log "Unsupported package manager: $manager_name"
      return 1
      ;;
  esac
}

prompt_yes_no() {
  local prompt="${1:-Continue?}"
  local reply=""
  if [ "$AUTO_INSTALL" -eq 1 ]; then
    return 0
  fi
  if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
    return 1
  fi
  printf '%s [Y/n] ' "$prompt" >/dev/tty
  read -r reply </dev/tty || true
  case "${reply:-y}" in
    n|N|no|NO|No) return 1 ;;
    *) return 0 ;;
  esac
}

ensure_target_dir() {
  if [ -e "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]; then
    if ! prompt_yes_no "The target directory already has files. Replace them with the latest GitHub release?"; then
      log "Aborted by user."
      exit 1
    fi
    rm -rf "$INSTALL_DIR"
  fi
  mkdir -p "$INSTALL_DIR"
}

download_release() {
  step "1/4" "Downloading the latest portable release from GitHub"
  log "Repository: $REPO_SLUG"
  log "Asset: $RELEASE_ASSET"
  log "Release URL: $RELEASE_URL"
  if curl -fsSL --retry 2 --retry-delay 1 -o "$ZIP_PATH" "$RELEASE_URL"; then
    DOWNLOAD_KIND="release"
    return 0
  fi
  log "Release asset unavailable, falling back to the GitHub source archive."
  log "Source archive URL: $SOURCE_ARCHIVE_URL"
  curl -fsSL --retry 2 --retry-delay 1 -o "$ZIP_PATH" "$SOURCE_ARCHIVE_URL"
  DOWNLOAD_KIND="source"
}

extract_release() {
  step "2/4" "Unpacking the bundle"
  unzip -oq "$ZIP_PATH" -d "$INSTALL_DIR"
}

launch_bundle() {
  step "3/4" "Launching PostSnail Portable"
  NODE_BIN="$(node_command)"
  if [ -z "$NODE_BIN" ]; then
    log "Node.js is still missing, so PostSnail Portable cannot launch."
    exit 1
  fi
  local launch_root="$INSTALL_DIR"
  if [ "$DOWNLOAD_KIND" = "source" ]; then
    launch_root="$(find_source_root "$INSTALL_DIR")"
  fi
  (
    cd "$launch_root"
    exec "$NODE_BIN" bin/postsnail-portable.js
  )
}

main() {
  step "0/4" "Checking local requirements"
  check_tool curl
  check_tool unzip
  check_tool node
  check_tool git
  check_tool python3

  if [ "${#MISSING_REQUIRED[@]}" -gt 0 ] || [ "${#MISSING_RECOMMENDED[@]}" -gt 0 ]; then
    if [ "$VERBOSE" -eq 1 ]; then
      log "Missing required tools: ${MISSING_REQUIRED[*]:-none}"
      log "Missing recommended tools: ${MISSING_RECOMMENDED[*]:-none}"
    fi
    if detect_package_manager; then
      log "Detected package manager: $PACKAGE_MANAGER"
      if [ "${#MISSING_REQUIRED[@]}" -gt 0 ]; then
        if prompt_yes_no "Install the required tools now using $PACKAGE_MANAGER?"; then
          install_missing_tools "${MISSING_REQUIRED[@]}"
          MISSING_REQUIRED=()
        else
          log "Required tools are missing. Please install them and run this bootstrapper again."
          exit 1
        fi
      fi
      if [ "${#MISSING_RECOMMENDED[@]}" -gt 0 ] && prompt_yes_no "Install the recommended tools too?"; then
        install_missing_tools "${MISSING_RECOMMENDED[@]}" || true
        MISSING_RECOMMENDED=()
      fi
      step "0/4" "Re-checking requirements"
      MISSING_REQUIRED=()
      MISSING_RECOMMENDED=()
      check_tool curl
      check_tool unzip
      check_tool node
      check_tool git
      check_tool python3
      if [ "${#MISSING_REQUIRED[@]}" -gt 0 ]; then
        log "Some required tools are still missing. Please install them manually."
        exit 1
      fi
    else
      log "No supported package manager found."
      log "Install the missing tools manually, then rerun this bootstrapper."
      exit 1
    fi
  fi

  ensure_target_dir
  download_release
  extract_release

  if [ "$AUTO_LAUNCH" -eq 1 ] && prompt_yes_no "Launch PostSnail Portable now?"; then
    launch_bundle
  fi

  log "PostSnail Portable has been unpacked to: $INSTALL_DIR"
  log "Run: cd \"$INSTALL_DIR\" && node bin/postsnail-portable.js"
}

find_source_root() {
  local root="$1"
  if [ -f "$root/bin/postsnail-portable.js" ]; then
    printf '%s\n' "$root"
    return 0
  fi
  local candidate=""
  candidate="$(find "$root" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
  if [ -n "$candidate" ] && [ -f "$candidate/bin/postsnail-portable.js" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  printf '%s\n' "$root"
}

main "$@"
