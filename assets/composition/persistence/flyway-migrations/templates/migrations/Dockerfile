# The migrations deployment unit: a self-contained Flyway runner
# holding the SQL scripts. Build and run it against the target
# database before (or as a gated step of) deploying the service —
# never from inside the service. Configuration comes from the
# environment (FLYWAY_URL, FLYWAY_USER, FLYWAY_PASSWORD), 12-factor
# style; Flyway logs its plan and outcome to stdout.
FROM flyway/flyway:13-alpine
COPY sql /flyway/sql
CMD ["migrate"]
