#!/bin/bash
# Runs once, when the postgres container starts on an empty data directory (docs/0099). Creates
# Musical Chairs' and Keycloak's own login roles and databases, and the extensions Musical Chairs'
# schema needs, which only a superuser may create. The postgres superuser is for this and
# maintenance.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v musical_chairs_password="$(cat /run/secrets/musical_chairs_database_password)" \
  -v keycloak_password="$(cat /run/secrets/keycloak_db_password)" <<'SQL'
CREATE ROLE musical_chairs LOGIN PASSWORD :'musical_chairs_password';
CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_password';
CREATE DATABASE musical_chairs OWNER musical_chairs;
CREATE DATABASE keycloak OWNER keycloak;
\connect musical_chairs
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SQL
