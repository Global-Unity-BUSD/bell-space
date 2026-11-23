#!/bin/sh
# Nightly backup: the database and the photo folder, into ./backups/.
# Example cron (2:30 every night): 30 2 * * * cd /path/to/bell-space/deploy && ./backup.sh
# Restore the database: createdb, then pg_restore -U bellspace -d <db> --no-owner < backups/db_<stamp>.dump
set -eu
# Git Bash on Windows rewrites paths like /data into Windows paths; keep them as written.
export MSYS_NO_PATHCONV=1
stamp=$(date +%Y-%m-%d_%H%M)
mkdir -p backups

db="backups/db_$stamp.dump"
docker compose exec -T db pg_dump -U bellspace -d bellspace -Fc > "$db"

photos="backups/photos_$stamp.tgz"
docker compose exec -T server sh -c 'mkdir -p /data/photos && tar -czf - -C /data photos' > "$photos"

# A backup that is empty is a failed backup: stop with an error instead of keeping it.
for f in "$db" "$photos"; do
  if [ ! -s "$f" ]; then echo "Backup failed: $f is empty" >&2; rm -f "$f"; exit 1; fi
done

# Keep 30 days.
find backups -type f -mtime +30 -delete
echo "Backup written: $db ($(wc -c < "$db") bytes), $photos ($(wc -c < "$photos") bytes)"
