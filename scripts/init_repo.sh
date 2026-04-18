#!/usr/bin/env bash
# init_repo.sh — One-shot git init + first commit + remote add for fragment-viewer.
#
# Prereqs:
#   - git installed
#   - gh CLI authenticated (or you will manually create the repo in the browser)
#   - You have admin or write access to github.com/Single-Molecule-Sequencing
#
# Usage:
#   cd fragment-viewer
#   bash scripts/init_repo.sh            # creates repo as private + pushes
#   bash scripts/init_repo.sh --public   # creates repo as public + pushes
#   bash scripts/init_repo.sh --no-push  # local init only, no GitHub interaction

set -euo pipefail

ORG="Single-Molecule-Sequencing"
REPO="fragment-viewer"
VISIBILITY="private"
DO_PUSH="yes"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public)  VISIBILITY="public" ;;
    --private) VISIBILITY="private" ;;
    --no-push) DO_PUSH="no" ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

cd "$(dirname "$0")/.."

if [[ -d .git ]]; then
  echo "[init] .git already exists — skipping git init"
else
  git init -b main
  echo "[init] git init done"
fi

cat > .gitignore <<'EOF'
# Build + node
node_modules/
dist/
.cache/

# Python
__pycache__/
*.pyc
.venv/
venv/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Local data that should not be committed
data/*.dat
data/*.fsa
data/*.ab1

# Knowledge base (lives in home dir)
lab_knowledge.db
EOF

# Stage everything
git add -A
git -c user.email="gregfar@umich.edu" -c user.name="Greg Farnum" commit -m "Initial commit: fragment-viewer v0.5.0

- Interactive CE viewer + Cas9 cut-product predictor (5 tabs)
- Automated peak classifier with cluster analysis
- Per-dye mobility offset correction with auto-calibration
- Cross-dye chemistry interpretation
- Editable construct sequence for generalization
- 226 bp V059_gRNA3 construct + 118 bp target region
- 24-candidate gRNA enumeration with cut-site visualization
- Lab gRNA catalog with 11 seeded entries
- Full documentation suite with TUTORIAL.md
- Companion Claude skill
- KB ingestion and CI validation" || echo "[init] No changes to commit"

if [[ "$DO_PUSH" == "no" ]]; then
  echo "[init] Local-only mode; skipping remote add + push"
  exit 0
fi

REMOTE_URL="git@github.com:${ORG}/${REPO}.git"

if git remote get-url origin >/dev/null 2>&1; then
  echo "[init] remote 'origin' already set"
else
  git remote add origin "$REMOTE_URL"
  echo "[init] remote added: $REMOTE_URL"
fi

# Create the GitHub repo if gh CLI is available
if command -v gh >/dev/null 2>&1; then
  if gh repo view "${ORG}/${REPO}" >/dev/null 2>&1; then
    echo "[init] GitHub repo ${ORG}/${REPO} already exists"
  else
    gh repo create "${ORG}/${REPO}" \
      --${VISIBILITY} \
      --description "Interactive CE viewer + Cas9 cut-product predictor for the Athey lab fluorescent-adapter fragment analysis assay" \
      --source=. \
      --remote=origin \
      --push \
      && echo "[init] Created and pushed to ${ORG}/${REPO} (${VISIBILITY})"
    exit 0
  fi
else
  echo "[init] gh CLI not installed — please create ${ORG}/${REPO} manually in browser, then re-run with --no-push stripped"
fi

# Push existing commits
git push -u origin main
echo "[init] Pushed to ${REMOTE_URL}"
