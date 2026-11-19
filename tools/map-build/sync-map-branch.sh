#!/usr/bin/env bash
# 將 public/map/ 同步到獨立的無歷史分支(預設 map-data),每次 push 整個覆蓋,避免大型地圖檔塞爆 main 分支歷史。
# 用法:
#   bash tools/map-build/sync-map-branch.sh push [--remote <url_or_name>] [--branch <name>] [--dir <map_dir>]
#   bash tools/map-build/sync-map-branch.sh pull [--remote <url_or_name>] [--branch <name>] [--dir <map_dir>]
set -euo pipefail

ACTION="${1:-}"
if [[ "$ACTION" != "push" && "$ACTION" != "pull" ]]; then
  echo "用法: $0 <push|pull> [--remote origin] [--branch map-data] [--dir public/map]" >&2
  exit 1
fi
shift

REMOTE="origin"
BRANCH="map-data"
MAP_DIR="public/map"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) REMOTE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dir)    MAP_DIR="$2"; shift 2 ;;
    *) echo "未知參數: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(pwd)"
if [[ "$MAP_DIR" != /* ]]; then
  MAP_DIR="$ROOT/$MAP_DIR"
fi

# 若 REMOTE 是像 origin 的遠端名稱,轉成實際 URL(方便在暫存 git repo 內直接 push/fetch)
REMOTE_URL="$REMOTE"
if git remote get-url "$REMOTE" >/dev/null 2>&1; then
  REMOTE_URL="$(git remote get-url "$REMOTE")"
fi

if [[ "$ACTION" == "push" ]]; then
  if [[ ! -f "$MAP_DIR/range-a/world.json" ]]; then
    echo "錯誤: 找不到 $MAP_DIR/range-a/world.json,請先建置或拉取地圖再 push" >&2
    exit 1
  fi
  ORIG_GH_USER=""
  if [[ "$REMOTE_URL" == *"Nailai-AI-DLL/"* ]] && command -v gh >/dev/null 2>&1; then
    ORIG_GH_USER="$(gh auth status --active 2>/dev/null | sed -n 's/.*account \([^ ]*\).*/\1/p' | head -n 1 || true)"
    if [[ -n "$ORIG_GH_USER" && "$ORIG_GH_USER" != "Nailai-AI-DLL" ]]; then
      gh auth switch -h github.com -u Nailai-AI-DLL >/dev/null 2>&1 || true
    fi
  fi
  TMP_DIR="$(mktemp -d)"
  cleanup() {
    rm -rf "$TMP_DIR"
    if [[ -n "$ORIG_GH_USER" && "$ORIG_GH_USER" != "Nailai-AI-DLL" ]]; then
      gh auth switch -h github.com -u "$ORIG_GH_USER" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT
  cp -R "$MAP_DIR"/. "$TMP_DIR"/
  rm -rf "$TMP_DIR/.git"
  (
    cd "$TMP_DIR"
    git init -q
    git config user.name "$(git -C "$ROOT" config user.name || echo 'map-builder')"
    git config user.email "$(git -C "$ROOT" config user.email || echo 'map-builder@localhost')"
    git add -A
    git commit -q -m "Update prebuilt map data ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
    git push -q --force "$REMOTE_URL" "HEAD:refs/heads/$BRANCH"
  )
  echo "已將 $MAP_DIR 覆蓋推送至 $BRANCH 分支(單一無歷史 commit)"
elif [[ "$ACTION" == "pull" ]]; then
  mkdir -p "$MAP_DIR"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  (
    cd "$TMP_DIR"
    git init -q
    git fetch -q --depth=1 "$REMOTE_URL" "refs/heads/$BRANCH"
    git archive FETCH_HEAD | tar -x -C "$MAP_DIR"
  )
  echo "已從 $BRANCH 分支拉取最新地圖至 $MAP_DIR"
fi
