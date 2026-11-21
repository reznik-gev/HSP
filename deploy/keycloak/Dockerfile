# Musical Chairs Keycloak image: the official image, optimized for our options (docs/0097).
#   docker build -t musical-chairs-keycloak deploy/keycloak
# Build-time options are fixed here; runtime ones (database URL, hostname, credentials) come from
# the environment. Start with: start --optimized --import-realm

FROM quay.io/keycloak/keycloak:26.8 AS build
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_HTTP_RELATIVE_PATH=/auth
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8
ARG MUSICAL_CHAIRS_VERSION=0.0.0-dev
ARG MUSICAL_CHAIRS_REVISION=unknown
ARG MUSICAL_CHAIRS_CREATED=unknown
LABEL org.opencontainers.image.title="musical-chairs-keycloak" \
      org.opencontainers.image.description="Keycloak for Musical Chairs, with the musical_chairs realm template" \
      org.opencontainers.image.source="https://github.com/reznik-gev/MusicalChairs" \
      org.opencontainers.image.version="${MUSICAL_CHAIRS_VERSION}" \
      org.opencontainers.image.revision="${MUSICAL_CHAIRS_REVISION}" \
      org.opencontainers.image.created="${MUSICAL_CHAIRS_CREATED}"
COPY --from=build /opt/keycloak/ /opt/keycloak/
# Imported on first start only (an existing realm is left alone). ${MUSICAL_CHAIRS_*} placeholders in it are
# filled from the environment.
COPY --chown=keycloak:keycloak musical_chairs-realm.json /opt/keycloak/data/import/musical_chairs-realm.json
# Reads *_FILE variables (secret files) into the environment, then runs kc.sh.
COPY --chmod=755 entrypoint.sh /opt/keycloak/bin/musical-chairs-entrypoint.sh
ENTRYPOINT ["/opt/keycloak/bin/musical-chairs-entrypoint.sh"]
CMD ["start", "--optimized", "--import-realm"]
