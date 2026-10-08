-- Runs once, on first start of the dev database volume.
-- hsm       : application database (created by POSTGRES_DB)
-- hsm_test  : database for DB integration tests (docs/0061)
-- keycloak  : Keycloak's own schema

CREATE DATABASE hsm_test OWNER hsm;
CREATE DATABASE keycloak OWNER hsm;
