# HSP Keycloak image: the official image, optimized for our options (docs/0097).
#   docker build -t hsp-keycloak deploy/keycloak
# Build-time options are fixed here; runtime ones (database URL, hostname, credentials) come from
# the environment. Start with: start --optimized --import-realm

FROM quay.io/keycloak/keycloak:26.8 AS build
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_HTTP_RELATIVE_PATH=/auth
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8
ARG HSP_VERSION=0.0.0-dev
ARG HSP_REVISION=unknown
ARG HSP_CREATED=unknown
LABEL org.opencontainers.image.title="hsp-keycloak" \
      org.opencontainers.image.description="Keycloak for HSP, with the hsp realm template" \
      org.opencontainers.image.source="https://github.com/reznik-gev/HSP" \
      org.opencontainers.image.version="${HSP_VERSION}" \
      org.opencontainers.image.revision="${HSP_REVISION}" \
      org.opencontainers.image.created="${HSP_CREATED}"
COPY --from=build /opt/keycloak/ /opt/keycloak/
# Imported on first start only (an existing realm is left alone). ${HSP_*} placeholders in it are
# filled from the environment.
COPY --chown=keycloak:keycloak hsp-realm.json /opt/keycloak/data/import/hsp-realm.json
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
