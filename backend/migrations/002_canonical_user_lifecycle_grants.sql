-- Administrator only. Pass the actual existing IAM database principal:
-- psql -v ON_ERROR_STOP=1 -v portal_db_user='actual-principal' -f this-file.sql
-- No runtime DDL, status changes, user deletion or document-owner mutation.
BEGIN;
GRANT SELECT ON public.users TO :"portal_db_user";
GRANT INSERT (email, username, phone_number, password_hash, status, document_owner_key)
    ON public.users TO :"portal_db_user";
GRANT UPDATE (username, phone_number, password_hash, session_version, account_version)
    ON public.users TO :"portal_db_user";
SELECT format('GRANT USAGE ON SEQUENCE %s TO %I',
    pg_get_serial_sequence('public.users','id'), :'portal_db_user') \gexec
GRANT SELECT, INSERT, UPDATE ON public.user_lifecycle_challenges,
    public.user_lifecycle_limits TO :"portal_db_user";
COMMIT;
