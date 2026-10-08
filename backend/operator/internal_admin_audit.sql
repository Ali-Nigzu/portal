-- READ ONLY. Run as an operator against camos_prod using psql.
-- This file displays schema/privileges and GENERATES missing GRANT statements.
-- It never executes GRANT, REVOKE, schema changes or row mutations.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity,identity_generation
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
 ('alarms','devices','gateways','memberships','organisation_snapshots','organisations','site_snapshots','sites','user_lifecycle_challenges','users')
ORDER BY table_name,ordinal_position;
SELECT c.relname,p.conname,pg_get_constraintdef(p.oid)
FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('alarms','devices','gateways','memberships','organisation_snapshots','organisations','site_snapshots','sites','user_lifecycle_challenges','users')
ORDER BY c.relname,p.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN
 ('alarms','devices','gateways','memberships','organisation_snapshots','organisations','site_snapshots','sites','user_lifecycle_challenges','users')
ORDER BY tablename,indexname;
WITH tables(name) AS (VALUES
 ('alarms'),('devices'),('gateways'),('memberships'),('organisation_snapshots'),('organisations'),('site_snapshots'),('sites'),('user_lifecycle_challenges'),('users'))
SELECT name,
 has_table_privilege('portal-reader@camosbase.iam','public.'||name,'SELECT') AS can_select,
 has_table_privilege('portal-reader@camosbase.iam','public.'||name,'INSERT') AS can_insert,
 has_table_privilege('portal-reader@camosbase.iam','public.'||name,'UPDATE') AS can_update,
 has_table_privilege('portal-reader@camosbase.iam','public.'||name,'DELETE') AS can_delete
FROM tables;
-- Review these generated statements; applying them requires operator approval.
WITH tables(name) AS (VALUES
 ('alarms'),('devices'),('gateways'),('memberships'),('organisation_snapshots'),('organisations'),('site_snapshots'),('sites'),('user_lifecycle_challenges'),('users')),
missing AS (
 SELECT name,privilege FROM tables CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE')) p(privilege)
 WHERE NOT has_table_privilege('portal-reader@camosbase.iam','public.'||name,privilege)
)
SELECT format('GRANT %s ON TABLE public.%I TO %I;',string_agg(privilege,', ' ORDER BY privilege),name,'portal-reader@camosbase.iam') AS outstanding_table_grant
FROM missing GROUP BY name ORDER BY name;
WITH identities(name) AS (VALUES('users'),('organisations'),('sites'),('devices'),('alarms')),
sequences AS (SELECT name,pg_get_serial_sequence('public.'||name,'id') AS sequence_name FROM identities)
SELECT name,sequence_name,
 CASE WHEN sequence_name IS NULL THEN 'BLOCKER: identity sequence missing; inspect schema'
 WHEN NOT has_sequence_privilege('portal-reader@camosbase.iam',sequence_name,'USAGE')
 THEN format('GRANT USAGE ON SEQUENCE %s TO %I;',sequence_name,'portal-reader@camosbase.iam')
 ELSE 'USAGE already effective' END AS sequence_action
FROM sequences;
SELECT has_database_privilege('portal-reader@camosbase.iam',current_database(),'CONNECT') AS can_connect,
 has_schema_privilege('portal-reader@camosbase.iam','public','USAGE') AS schema_usage;
COMMIT;
