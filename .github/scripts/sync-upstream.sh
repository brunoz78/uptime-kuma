#!/usr/bin/env bash
# Merges the newest stable upstream release of the same major version into the current branch.
# Leaves the merge committed locally; the workflow tests and pushes it.
#
# Environment:
#   SYNC_VERSION      upstream tag to merge instead of the newest one (e.g. to move to a new major version)
#   SYNC_REF          upstream ref to merge, for testing the merge logic (e.g. refs/heads/master)
#   SKIP_IMAGE_CHECK  set to 1 to skip the check for the official image of that version
set -euo pipefail

UPSTREAM="https://github.com/louislam/uptime-kuma.git"
KEEP_WORKFLOWS="tagesansicht-image.yml tagesansicht-sync.yml"

out() {
    echo "$1" >> "${GITHUB_OUTPUT:-/dev/null}"
}
note() {
    echo "$1"
    echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

current="$(node -p "require('./package.json').version")"
major="${current%%.*}"

stable_tags="$(git ls-remote --tags --refs "$UPSTREAM" | sed 's#.*refs/tags/##' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V)"
newest_same_major="$(echo "$stable_tags" | grep -E "^${major}\." | tail -n 1)"
newest_overall="$(echo "$stable_tags" | tail -n 1)"

target="${SYNC_VERSION:-$newest_same_major}"
ref="${SYNC_REF:-refs/tags/$target}"

note "Current version: $current, newest upstream $major.x release: ${newest_same_major:-none}"
if [ "$newest_overall" != "$newest_same_major" ]; then
    note "Upstream also has $newest_overall. A new major version is not merged automatically; run this workflow with that version to move to it."
fi

if [ -z "${SYNC_REF:-}" ]; then
    if [ -z "$target" ]; then
        note "No upstream release found."
        out "updated=false"
        exit 0
    fi
    if ! echo "$stable_tags" | grep -qx "$target"; then
        note "Upstream has no release $target."
        exit 1
    fi
    if [ "$(printf '%s\n%s\n' "$current" "$target" | sort -V | tail -n 1)" = "$current" ]; then
        note "Already up to date."
        out "updated=false"
        exit 0
    fi
    if [ "${SKIP_IMAGE_CHECK:-0}" != "1" ] && ! docker manifest inspect "louislam/uptime-kuma:$target" > /dev/null 2>&1; then
        note "The official image louislam/uptime-kuma:$target is not published yet. Trying again on the next run."
        out "updated=false"
        exit 0
    fi
fi

git fetch --no-tags "$UPSTREAM" "$ref"
git merge --no-ff --no-commit FETCH_HEAD || true

# This fork has its own workflows: drop everything upstream brings into .github/workflows, and dependabot
for file in $(git ls-files .github/workflows | sort -u) .github/dependabot.yml; do
    name="$(basename "$file")"
    case " $KEEP_WORKFLOWS " in
        *" $name "*) continue ;;
    esac
    git rm -rf --quiet --ignore-unmatch -- "$file"
    rm -f -- "$file"
done

conflicts="$(git diff --name-only --diff-filter=U)"
if [ -n "$conflicts" ]; then
    note "Merging upstream ${target:-$ref} needs manual work, these files conflict:"
    note "$conflicts"
    git merge --abort
    exit 1
fi

git commit --quiet -m "Merge upstream ${SYNC_REF:-$target}"

merged="$(node -p "require('./package.json').version")"
note "Merged upstream ${SYNC_REF:-$target}, version is now $merged."
out "updated=true"
out "version=$merged"
