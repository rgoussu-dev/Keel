-- Baseline schema: the greeting log the walking slice writes and
-- reads. Grow the schema with V2__*.sql, V3__*.sql, … — never edit
-- an applied migration.
create table greeting (
    id         bigint generated always as identity primary key,
    name       text not null,
    greeted_at timestamptz not null
);
