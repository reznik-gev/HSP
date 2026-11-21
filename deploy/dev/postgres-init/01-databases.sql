-- Runs once, on first start of the dev database volume.
-- musical_chairs       : application database (created by POSTGRES_DB)
-- musical_chairs_test  : database for DB integration tests (docs/0061)
-- keycloak  : Keycloak's own schema

CREATE DATABASE musical_chairs_test OWNER musical_chairs;
CREATE DATABASE keycloak OWNER musical_chairs;
