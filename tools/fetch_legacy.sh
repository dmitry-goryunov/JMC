#!/usr/bin/env bash
# Download every 2004-2010 question and solution GIF into source_legacy/.
# The host throttles a fast run, so this goes one file at a time, skips what is
# already there, and can simply be run again until it reports nothing missing.
set -u
cd "$(dirname "$0")/.." || exit 1

want=0
got=0
missing=0

for year in 2004 2005 2006 2007 2008 2009 2010; do
  dir="source_legacy/$year"
  mkdir -p "$dir"
  page="$dir/page.html"
  if [ ! -s "$page" ]; then
    curl -sSfL -A "jmc-practice-import/1.0" -o "$page" \
      "https://ukmt.org.uk/free-past-papers/junior-mathematical-challenge-$year" || continue
    sleep 1
  fi

  # image URLs in page order, de-duplicated, order preserved
  urls=$(grep -oE "https://ukmt\.org\.uk/wp-content/uploads/individual-problems/jmc/$year/[A-Za-z0-9_-]+\.gif" "$page" | awk '!seen[$0]++')

  for url in $urls; do
    name="${url##*/}"
    want=$((want + 1))
    [ -s "$dir/$name" ] && continue
    if curl -sSfL -A "jmc-practice-import/1.0" --max-time 45 -o "$dir/$name" "$url"; then
      got=$((got + 1))
      sleep 0.6
    else
      rm -f "$dir/$name"
      missing=$((missing + 1))
      sleep 6
    fi
  done
done

echo "wanted $want files, downloaded $got this run, $missing still missing"
[ "$missing" -eq 0 ]
