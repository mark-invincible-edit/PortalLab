#!/bin/sh
# Dev tool: syntax-check every ES module under src/ with Node (copies to .mjs temporarily).
fail=0
for f in $(find src tools -name '*.js' -o -name '*.mjs' | sort); do
  t=$(mktemp /tmp/chk.XXXXXX.mjs); cp "$f" "$t"
  if ! node --check "$t" 2>/tmp/chk.err; then echo "SYNTAX ERROR in $f"; cat /tmp/chk.err; fail=1; fi
  rm -f "$t"
done
[ $fail = 0 ] && echo "syntax ok"
exit $fail
