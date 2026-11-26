#!/bin/sh
# E10 hosted, local test only (D-705): the user's Postgres on this computer = the Supabase shim (roles, auth.users) and
# every migration in name order, as `pnpm local` does (D-292). Never for a real Supabase database (it has its own).
set -eu
psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /mandat/supabase/shim/supabase-shim.sql
for f in $(ls /mandat/supabase/migrations/*.sql | sort); do
  psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done
