#!/bin/bash
# Runs once, when the postgres container starts on an empty data directory (docs/0099).
# Creates HSP's and Keycloak's own login roles and databases, and the extensions HSP's schema
# needs, which only a superuser may create. The postgres superuser is for this and maintenance.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v hsp_password="$(cat /run/secrets/hsp_database_password)" \
  -v keycloak_password="$(cat /run/secrets/keycloak_db_password)" <<'SQL'
CREATE ROLE hsp LOGIN PASSWORD :'hsp_password';
CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_password';
CREATE DATABASE hsp OWNER hsp;
CREATE DATABASE keycloak OWNER keycloak;
\connect hsp
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SQL
