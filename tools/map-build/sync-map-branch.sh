#!/usr/bin/env bash
# 將 public/map/ 同步到獨立的無歷史分支(預設 map-data),每次 push 整個覆蓋,避免大型地圖檔塞爆 main 分支歷史。
# 版本綁定(decisions/0057):每次 push 另外存一個不會被覆蓋的版本 ref(refs/map-versions/<id>),
# 並把 id 與 commit 寫進 main 的 map-data.lock;pull 預設照 lock 拉那一版並核對 commit。
# 用法:
#   bash tools/map-build/sync-map-branch.sh push [--remote <url_or_name>] [--branch <name>] [--dir <map_dir>] [--lock <file>]
#   bash tools/map-build/sync-map-branch.sh pull [--remote ...] [--branch ...] [--dir ...] [--lock <file>] [--latest]
#   bash tools/map-build/sync-map-branch.sh lock [--remote ...] [--branch ...] [--lock <file>]   # 把分支目前那版存成版本並寫 lock(不重新上傳)
set -euo pipefail

ACTION="${1:-}"
if [[ "$ACTION" != "push" && "$ACTION" != "pull" && "$ACTION" != "lock" ]]; then
  echo "用法: $0 <push|pull|lock> [--remote origin] [--branch map-data] [--dir public/map] [--lock map-data.lock] [--latest]" >&2
  exit 1
fi
shift

REMOTE="origin"
BRANCH="map-data"
MAP_DIR="public/map"
LOCK=""
LATEST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) REMOTE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dir)    MAP_DIR="$2"; shift 2 ;;
    --lock)   LOCK="$2"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    *) echo "未知參數: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(pwd)"
if [[ "$MAP_DIR" != /* ]]; then
  MAP_DIR="$ROOT/$MAP_DIR"
fi
LOCK="${LOCK:-$ROOT/map-data.lock}"
if [[ "$LOCK" != /* ]]; then
  LOCK="$ROOT/$LOCK"
fi

# 推到 Nailai-AI-DLL 的 repo 時暫時切換 gh 帳號,結束後切回
ORIG_GH_USER=""
switch_gh_account() {
  if [[ "$REMOTE_URL" == *"Nailai-AI-DLL/"* ]] && command -v gh >/dev/null 2>&1; then
    ORIG_GH_USER="$(gh auth status --active 2>/dev/null | sed -n 's/.*account \([^ ]*\).*/\1/p' | head -n 1 || true)"
    if [[ -n "$ORIG_GH_USER" && "$ORIG_GH_USER" != "Nailai-AI-DLL" ]]; then
      gh auth switch -h github.com -u Nailai-AI-DLL >/dev/null 2>&1 || true
    fi
  fi
}
restore_gh_account() {
  if [[ -n "$ORIG_GH_USER" && "$ORIG_GH_USER" != "Nailai-AI-DLL" ]]; then
    gh auth switch -h github.com -u "$ORIG_GH_USER" >/dev/null 2>&1 || true
  fi
}

# 讀 lock 的欄位(key=value)
lock_get() {
  sed -n "s/^$1=//p" "$LOCK" | head -n 1
}

write_lock() {
  local id="$1" commit="$2"
  cat > "$LOCK" <<LOCKEOF
# 程式對應的地圖資料版本(由 tools/map-build/sync-map-branch.sh 產生,請勿手改)
# npm run map:pull 會拉 refs/map-versions/<id> 並核對 commit;要更新請重新 npm run map:push
id=$id
commit=$commit
LOCKEOF
  echo "已寫入 $LOCK(id=$id commit=${commit:0:12})"
}

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
  switch_gh_account
  TMP_DIR="$(mktemp -d)"
  VERSION_ID="$(date -u +%Y%m%d-%H%M%S)"
  cleanup() {
    rm -rf "$TMP_DIR"
    restore_gh_account
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
    # 版本 ref 不用 --force:同一個 id 已存在就失敗,舊版永遠留著
    SHA="$(git rev-parse HEAD)"
    git push -q "$REMOTE_URL" "HEAD:refs/map-versions/$VERSION_ID-${SHA:0:7}"
    echo "$VERSION_ID-${SHA:0:7} $SHA" > "$TMP_DIR/.pushed"
  )
  read -r VERSION_ID PUSHED_SHA < "$TMP_DIR/.pushed"
  write_lock "$VERSION_ID" "$PUSHED_SHA"
  echo "已將 $MAP_DIR 覆蓋推送至 $BRANCH 分支(單一無歷史 commit),版本 $VERSION_ID;記得把 map-data.lock 一起 commit 到 main"
elif [[ "$ACTION" == "lock" ]]; then
  switch_gh_account
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"; restore_gh_account' EXIT
  VERSION_ID="$(date -u +%Y%m%d-%H%M%S)"
  # 用子 shell 而不是 $( ):bash 3.2 的 $( ) 不繼承 set -e,推送失敗時會照樣寫出 lock
  (
    cd "$TMP_DIR"
    git init -q
    git fetch -q "$REMOTE_URL" "refs/heads/$BRANCH"
    SHA="$(git rev-parse FETCH_HEAD)"
    git push -q "$REMOTE_URL" "$SHA:refs/map-versions/$VERSION_ID-${SHA:0:7}"
    echo "$SHA" > "$TMP_DIR/.locked"
  )
  COMMIT="$(cat "$TMP_DIR/.locked")"
  write_lock "$VERSION_ID-${COMMIT:0:7}" "$COMMIT"
elif [[ "$ACTION" == "pull" ]]; then
  mkdir -p "$MAP_DIR"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  REF="refs/heads/$BRANCH"
  WANT=""
  if [[ "$LATEST" == 0 && -f "$LOCK" ]]; then
    REF="refs/map-versions/$(lock_get id)"
    WANT="$(lock_get commit)"
  elif [[ "$LATEST" == 0 ]]; then
    echo "警告: 找不到 $LOCK,改拉 $BRANCH 分支最新版" >&2
  fi
  (
    cd "$TMP_DIR"
    git init -q
    if ! git fetch -q --depth=1 "$REMOTE_URL" "$REF"; then
      echo "錯誤: 遠端沒有 $REF(map-data.lock 指到的版本不存在)" >&2
      exit 1
    fi
    GOT="$(git rev-parse FETCH_HEAD)"
    if [[ -n "$WANT" && "$GOT" != "$WANT" ]]; then
      echo "錯誤: $REF 的 commit $GOT 與 map-data.lock 記錄的 $WANT 不同" >&2
      exit 1
    fi
    git archive FETCH_HEAD | tar -x -C "$MAP_DIR"
  )
  echo "已從 $REF 拉取地圖至 $MAP_DIR"
fi
