-- Administrator-only, one-time migration. Run with psql -v ON_ERROR_STOP=1.
-- No historical transition timestamps are fabricated; no runtime grants change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
    status_attribute smallint;
    old_constraint record;
    constraint_count integer;
    definition text;
BEGIN
    SELECT attnum INTO STRICT status_attribute FROM pg_attribute
      WHERE attrelid = 'public.memberships'::regclass AND attname = 'status' AND NOT attisdropped;
    SELECT count(*) INTO constraint_count FROM pg_constraint
      WHERE conrelid = 'public.memberships'::regclass AND contype = 'c'
        AND conkey = ARRAY[status_attribute];
    IF constraint_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one status-only CHECK; inspect schema before migrating';
    END IF;
    SELECT conname, pg_get_constraintdef(oid) AS expression INTO STRICT old_constraint
      FROM pg_constraint WHERE conrelid = 'public.memberships'::regclass AND contype = 'c'
        AND conkey = ARRAY[status_attribute];
    definition := regexp_replace(old_constraint.expression, '\s|\(|\)|::smallint|::integer', '', 'g');
    IF definition <> 'CHECKstatus=ANYARRAY[0,1]' THEN
        RAISE EXCEPTION 'Unexpected status CHECK: %. Migration is not applicable', old_constraint.expression;
    END IF;
    EXECUTE format('ALTER TABLE public.memberships DROP CONSTRAINT %I', old_constraint.conname);
END
$migration$;

ALTER TABLE public.memberships ADD CONSTRAINT memberships_status_check CHECK (status IN (0, 1, 2, 3));
ALTER TABLE public.memberships ADD COLUMN status_changed_at timestamptz;
-- Setting the default separately keeps existing rows NULL.
ALTER TABLE public.memberships ALTER COLUMN status_changed_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pending_timestamp_check
    CHECK (status IN (0, 1) OR status_changed_at IS NOT NULL);
COMMIT;
