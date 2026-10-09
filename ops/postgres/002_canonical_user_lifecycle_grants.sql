-- Administrator-only future-environment source; these privileges are already live.
-- Existing runtime role: portal-reader@camosbase.iam. No runtime DDL is required.
-- psql -v ON_ERROR_STOP=1 -v portal_db_user='portal-reader@camosbase.iam' -f this-file.sql
BEGIN;
GRANT SELECT, INSERT, UPDATE ON public.users TO :"portal_db_user";
GRANT USAGE ON SEQUENCE public.users_id_seq TO :"portal_db_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_lifecycle_challenges TO :"portal_db_user";
COMMIT;
