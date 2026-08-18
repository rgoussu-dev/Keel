# The migrations deployment unit: a self-contained Liquibase runner
# holding the YAML changelog and the plain SQL it wraps. Build and
# run it against the target database before (or as a gated step of)
# deploying the service — never from inside the service.
# Configuration comes from the environment (LIQUIBASE_COMMAND_URL,
# LIQUIBASE_COMMAND_USERNAME, LIQUIBASE_COMMAND_PASSWORD), 12-factor
# style; Liquibase logs its plan and outcome to stdout.
FROM liquibase/liquibase:5.0-alpine
COPY changelog.yaml /liquibase/changelog/changelog.yaml
COPY sql /liquibase/changelog/sql
ENV LIQUIBASE_SEARCH_PATH=/liquibase/changelog
ENV LIQUIBASE_COMMAND_CHANGELOG_FILE=changelog.yaml
CMD ["update"]
