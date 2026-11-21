#!/bin/sh
# Runs the commit-msg hook on each sample message: every file in pass/ must be
# accepted and every file in fail/ rejected (docs/0148). CI runs this in the
# scripts job. Add a sample here whenever the hook changes.
#   sh .githooks/tests/run.sh
cd "$(dirname "$0")" || exit 1
hook=../commit-msg
failed=0
count=0

for f in pass/*.txt; do
    count=$((count + 1))
    if ! sh "$hook" "$f" 2>/dev/null; then
        echo "FAIL: the hook rejected $f, which should pass"
        failed=1
    fi
done

for f in fail/*.txt; do
    count=$((count + 1))
    if sh "$hook" "$f" 2>/dev/null; then
        echo "FAIL: the hook accepted $f, which should fail"
        failed=1
    fi
done

if [ "$failed" -eq 0 ]; then
    echo "All $count sample messages passed or failed as expected."
fi
exit "$failed"
