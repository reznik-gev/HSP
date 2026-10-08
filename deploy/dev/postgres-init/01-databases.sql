-- Runs once, on first start of the dev database volume.
-- hsp       : application database (created by POSTGRES_DB)
-- hsp_test  : database for DB integration tests (docs/0061)
-- keycloak  : Keycloak's own schema

CREATE DATABASE hsp_test OWNER hsp;
CREATE DATABASE keycloak OWNER hsp;
