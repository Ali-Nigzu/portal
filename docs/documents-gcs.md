# Private canonical-user Documents in GCS

Base: `c8795a1f3f94026682c6089842f2158e333e6b86`.
Branch: `feat/documents-gcs`, separate from the canonical lifecycle branch.

## Authority and ownership

Production Documents are live objects in `camos-prod-1/<canonical_user_id>/`.
The trailing slash isolates IDs such as 1 and 10. Only flat direct children with
safe names are listed; nested objects and folder markers are ignored. No username,
email, organisation/site, JSON metadata or PostgreSQL ownership is consulted.

The Documents router consumes the existing get_canonical_user dependency. Enabled
users and session_version checks remain unchanged. Client ownership/bucket fields
are never used. Returned accountId is the canonical ID string, solely for existing
response compatibility. Renaming a username does not change document ownership.

GCS is the production catalogue: manually adding/removing a direct child is
reflected by opening/revisiting or refreshing Documents. Missing prefixes return
an empty list, not an error. No folder creation, signup integration, login scan,
startup GCS scan, polling, cache/sync worker or document database is introduced.
SDK list pagination is consumed completely before returning a successful catalogue.
Unavailable/forbidden/missing-bucket failures are sanitized 503 errors, not empty
lists. There is no local fallback.

## HTTP and document representations

Existing paths remain:

- GET /api/documents: {documents: [...]}.
- POST /api/documents/upload: multipart files; {documents: [...], errors: [...]}.
- GET /api/documents/{document_id}/download: private attachment.
- DELETE /api/documents/{document_id}: 204; missing documents return 404.

Document fields remain id, accountId, name, type, mimeType, sizeBytes, createdAt,
updatedAt, status. GCS provides size/timestamps and name. Name strips the canonical
prefix; status is active because only live objects are listed. Type derives from
extension and MIME is a known safe type or application/octet-stream for other
administrative files. Client MIME declarations do not establish an allowed upload.

ID is canonical URL-safe base64 of the validated relative filename. It is a locator,
not a credential: it contains neither bucket nor owner prefix and every access
reconstructs the object name using the current authenticated user. A copied ID
cannot access another user's prefix; identical filenames identify each user's
own object. Malformed/noncanonical/path-bearing IDs return 404. Old local UUID
links no longer identify production Documents.

List/download/error responses use Cache-Control: no-store. Upload/delete reuse
the existing mutation-origin and X-Requested-With: camOS protection; auth and
organisation implementations are not modified. Frontend URLs encode the locator.

## Upload, collision and filename policy

User uploads retain PDF, CSV, XLSX and DOCX, selected by case-insensitive extension,
with a 25 MiB (26,214,400 byte) per-file limit. Extension validation replaces the
old permissive MIME-or-extension rule; it is not malware/content authentication.
Administrative flat files of other types remain visible and download as attachments.

Names preserve spaces/Unicode letters and reject paths, slash/backslash, colon,
absolute/drive paths, dot/dot-dot, empty/whitespace-only names, Unicode control/
format characters and names beyond 255 UTF-8 bytes. Unsafe names are rejected,
not silently converted into basenames. The backend always forms `<id>/<safe_name>`.
No client-provided prefix, bucket or document ownership is accepted.

Each upload reads bounded chunks into a request-scoped spool (1 MiB memory threshold),
stopping at the size limit. One file is processed at a time; synchronous GCS calls
run in the threadpool. The temporary spool is closed and is never durable document
storage. Multipart parsing can spool incoming files before service validation;
the limit is per file, not a new aggregate request quota.

GCS create uses if_generation_match=0, including SDK resumable uploads for larger
files. Two competing writers cannot silently overwrite a live object. Duplicates
produce duplicate_filename errors with rename guidance. Deleted names can be reused
once no live object exists; historical Soft Delete content is not a Portal catalogue.
Batch success is partial, not transactional across files. Errors contain filename,
code, message and zero-based index so escaped multipart filenames and partial
batches map back to the correct staged file. The UI prevents repeated staged names,
retains failures and removes confirmed successes. Catalogue refresh failure never
relabels a confirmed upload as failed.

## Download and delete

Downloads stay behind the authenticated backend; there are no public/signed URLs
or extra signing permissions. The service loads metadata, opens the selected GCS
generation and preflights the first 256 KiB read before responding. Subsequent reads
stream with bounded memory, including administrative files above the upload limit.
Raw downloads preserve stored bytes and the declared Content-Length. A generation
pin prevents mixing concurrent replacement content. Content-Disposition includes
safe ASCII fallback plus UTF-8 filename*, and X-Content-Type-Options is nosniff.
The reader closes on success, read failure or browser disconnect.

A failure before response headers returns a safe application error. A later
stream failure interrupts the download rather than returning JSON inside file bytes.
Generation-pinned ranged reads rely on GCS transport; they do not add a separate
whole-file checksum validation pass.

Delete reads current metadata and uses if_generation_match for the live object.
A replacement during that operation yields 409 with refresh/retry guidance; absence
returns 404. No local tombstone/blob is retained. Normal listing then omits the
object; bucket Soft Delete remains outside Portal functionality.

## Runtime and isolated development

PORTAL_DOCUMENTS_BUCKET defaults to camos-prod-1. It is independent of the old
historical GCS bucket (the unused constant is removed). google-cloud-storage==3.16.0 is installed through
backend/requirements.txt; requirements-dev and Docker inherit that requirement.
The existing google-auth==2.33.0 pin is preserved. ADC uses the existing credential
mount or production service identity in project camosbase. Client creation is lazy;
SDK requests have a 15-second timeout and bounded retry policy, and shutdown closes
the initialized client. Provider exception text/credential paths are never logged.

Only the explicit dev/test factory injects MemoryDocumentsStore from
`backend/tests/support/memory_documents_store.py`, and
that existing mode remains forbidden in production. Tests inject adapters. The old
file-backed store and its config/path patches are removed. No automatic migration,
import, sync or dual write exists. Required legacy files are a separate manual task;
this implementation does not inspect or move deployed legacy data.

No production GCS/IAM/bucket/test-object, PostgreSQL or GCP changes were performed.
Local SDK tests use anonymous credentials and a requests.Session transport entirely
in-process; no emulator, extra service or external GCS connection is required.
The browser runner uses the real API/login/session guard and isolated in-memory
objects; its __test arrangement endpoint exists only in that test runner, which
rejects production execution. The browser's 0test.csv is a local fixture, not the
real production test object.

## UI and scope

The existing grid/modal/actions remain. Successful empty listing shows No documents
yet; Refresh reads current state. Cards show filename/type/size/date; upload/delete
feedback distinguishes committed writes from catalogue failures. Gold modal upload,
44px actions, visible focus and mobile layouts reuse Portal tokens. The upload modal
is portalled to body to avoid mobile ancestor clipping, isolates its background,
traps focus, supports Escape while idle and restores trigger focus.

No canonical lifecycle/session/Postmark/organisation/membership/product-routing
implementation changes are included. Four organisation browser selectors were
updated to the sidebar labels already shipped by the base commit; page action
labels and all organisation behavior remain unchanged. This validation maintenance
was required because the baseline runner still expected duplicated textual pluses.

## Owner-run live acceptance

After deployment, run live mode with the existing portal-reader service identity:

1. Login as canonical user 0; open Documents and see 0test.csv from 0/0test.csv.
2. Download and verify that existing object's contents. Preserve it.
3. Upload a distinctly named PDF/CSV/XLSX/DOCX and verify 0/<filename> in GCS.
4. Repeat the filename: receive duplicate guidance and verify original bytes remain.
5. Refresh/reopen; delete only the new acceptance upload and confirm it disappears.
6. Manually add/remove a separate direct child under 0/ and confirm refresh follows GCS.
7. Login as another canonical user; user 0's catalogue and objects remain inaccessible.
8. Confirm canonical login/My Account and organisation navigation still work.

These live checks are deliberately left to the owner and were not performed here.

## Delivery validation

| Check | Result |
| --- | --- |
| `PORTAL_TEST_POSTGRES_PORT=55432 .venv/bin/python -m pytest -q backend/tests` | 305 passed, 9 existing dependency/startup warnings, 17.42s |
| Documents policy/API + real SDK transport cases | 33 new cases included in full backend suite; no external GCS |
| `.venv/bin/python -m pip check` | No broken requirements found |
| Python 3.11 production requirement resolution | Passed with `pip install --dry-run --ignore-installed --python-version 3.11 --only-binary=:all: --no-cache-dir -r backend/requirements.txt`; not an executed Docker image |
| `npm run typecheck:documents` | Passed |
| `npm run typecheck:account` | Passed |
| `npm run build` | Passed, 3,037 modules, 6.01s |
| `npm run test:documents` | Passed against actual local API/session guard and isolated adapter; desktop plus touch-enabled mobile |
| `npm run test:account-lifecycle` | Passed, real disposable PostgreSQL + local HTTP Postmark stub |
| `npm run test:organisation-access` | Passed after four stale sidebar selectors from base UI polish were corrected |
| `npm run test:authenticated-shell` | Passed |
| `node scripts/authenticated-ui-polish-browser.mjs` | Passed |
| `npm run typecheck` | Existing failure: 62 diagnostics versus 64 on base; only the two Documents upload-modal diagnostics removed; no new file/error-code diagnostics |
| `git diff --check` | Passed |
| Legacy Documents authority source search | No documents.json/document_blobs/store-path dependencies remain in app/tests |

Browser commands use PORTAL_BROWSER_EXECUTABLE=/usr/bin/chromium and real API
runners use PORTAL_TEST_PYTHON=/workspace/portal/.venv/bin/python. PostgreSQL
regressions use local disposable PostgreSQL 17 on port 55432; CI retains version 16.
Browser captures under ignored frontend/test-results/documents include desktop,
mobile, empty states and the corrected mobile modal; these were visually inspected.
Logs are /tmp/portal-documents-*.log. Shell checks printed the existing external
resource tunnel error but all assertions passed. A full Docker image was not run.
No live Cloud SQL/Postmark/GCS acceptance is claimed.

The old brand-logo regression was previously established as a baseline failure
on both prior implementation and its original base; it was not rerun for this
Documents change. Global analytics/layout type errors remain outside scope.
The organisation browser initially failed on duplicated-plus expectations from
the exact base, then passed after test-only selector maintenance. No product
organisation code was changed. No architectural deviation from the approved plan
or locked decisions was required. The per-file error index and body-portal modal
are narrow fixes for partial-batch correctness and the observed mobile clipping.

## Exact implementation manifest

Diff from the requested c8795a1 base. M = modified, A = added; no files deleted.
Generated builds/screenshots/logs are excluded from the commit.

```text
M	.github/workflows/organisation-access.yml
M	backend/ENVIRONMENT.md
M	backend/app/api/documents.py
M	backend/app/app_factory.py
M	backend/app/config.py
M	backend/app/data/documents_store.py
M	backend/app/models_documents.py
M	backend/app/services/documents_service.py
M	backend/requirements.txt
M	backend/tests/run_lifecycle_browser.py
M	backend/tests/test_local_new_account.py
M	frontend/package.json
M	frontend/scripts/organisation-access-browser.mjs
M	frontend/src/features/documents/DocumentsPage.css
M	frontend/src/features/documents/DocumentsPage.tsx
M	frontend/src/features/documents/api/documentsApi.ts
M	frontend/src/features/documents/components/DocumentTile.tsx
M	frontend/src/features/documents/components/DocumentsGrid.tsx
M	frontend/src/features/documents/components/UploadDocumentModal.tsx
M	frontend/src/features/documents/hooks/useDocuments.ts
M	frontend/src/features/documents/types.ts
A	backend/app/data/gcs_documents_store.py
A	backend/tests/run_documents_browser.py
A	backend/tests/test_documents.py
A	backend/tests/test_gcs_documents_store.py
A	docs/documents-gcs.md
A	frontend/scripts/documents-browser.mjs
A	frontend/tsconfig.documents.json
```

The commit SHA is returned in the delivery response because this record is itself
part of that commit. The new PR targets feat/canonical-user-lifecycle while that
remote branch is exactly the requested base; main is still older. This keeps the
Documents PR separate and its diff limited to Documents and validation setup.
