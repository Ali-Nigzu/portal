# Production hardening delivery

The nine authorized C1–C9 changes preserve current user behavior. This branch
starts at exactly `e6846455bf64a4a874824154128cf13d7e668757` and contains only
approved implementation, characterization, measurement and delivery work.
It is separate from the earlier consolidation PR.

Raw measurements, emitted static closures, cold-route requests, package versions,
SQL strings/order, fixture response digests and visual comparison results are in
[production-hardening-measurements.json](production-hardening-measurements.json).
They are measurements from this workspace, not production latency promises.

## Delivery identity and files

1. **Starting SHA:** `e6846455bf64a4a874824154128cf13d7e668757`.
2. **Branch:** `perf/production-hardening`.
3. **Implementation SHA:** `989ceb1`; the final delivery commit adds this report,
   its measurement artifact, an additional cancellation characterization and
   production navigation/PDF coverage. Resolve the final delivery SHA with
   `git rev-parse perf/production-hardening` or the branch's GitHub head.
4. **Reviewable commits:**

   | Commit | Change |
   | --- | --- |
   | `9293170` | Characterize hardening resource, upload and report contracts |
   | `240923d` | Synchronize lazy BigQuery initialization and complete shutdown cleanup |
   | `ba8851c` | Reuse Reports parsing and Admin display work; count slug collisions once |
   | `83a8fde` | Reuse one checkout for the four canonical metadata reads |
   | `6b08e1c` | Upload accepted Documents from the existing request spool |
   | `abf219b` | Use bounded REST rows for BigQuery health and remove DataFrame requirements |
   | `989ceb1` | Keep the Vite preload helper outside the PDF vendor subtree |
   | Final delivery commit | Document performance proof and final contract verification |

5. **Publishing:** the branch is intended for a new PR against `main`. GitHub
   GraphQL and REST calls in this environment return `Forbidden`. If creation
   remains blocked, use the final response's pushed comparison link and manual
   command. No earlier PR is reused.
6. **Modified files (14):**

   ```text
   backend/app/app_factory.py
   backend/app/services/admin_repository.py
   backend/app/services/bigquery_client.py
   backend/app/services/documents_service.py
   backend/app/services/organisation_dashboard.py
   backend/app/services/portal_context.py
   backend/requirements.txt
   backend/tests/test_documents.py
   backend/tests/test_portal.py
   frontend/scripts/reports-engine-tests.mjs
   frontend/src/features/internal-admin/AdminApp.tsx
   frontend/src/features/reports/PortalReports.tsx
   frontend/src/features/reports/engine/ReportsEngine.ts
   frontend/vite.config.ts
   ```

7. **Added files (5):**

   ```text
   backend/tests/test_bigquery_lifecycle.py
   backend/tests/test_request_path_costs.py
   frontend/scripts/production-hardening-browser.mjs
   docs/production-hardening.md
   docs/production-hardening-measurements.json
   ```

8. **Deleted files:** none in this PR. The six root `.7z` archives were already
   absent at the required base and remain absent. The previous consolidation's
   isolation and dead-path removals are retained.
9. **Dependencies removed:** direct `pandas==2.2.3` and `db-dtypes==1.2.0`.
   Image dependency resolution also removes NumPy, PyArrow, pytz and tzdata.
   Source searches find no remaining runtime/test/build imports or DataFrame
   calls requiring these packages. The final image imports the application and
   serves offline ASGI requests with all four analytical modules absent;
   `importlib.util.find_spec` verifies absence. All retained package versions
   match the controlled baseline image.
10. **Dead support removed:** pandas import; db-dtypes import/version probe;
    DataFrame conversion and version-only health logging; Documents' second
    spool import/allocation/write path; the obsolete test-only `Rows.to_dataframe`
    shim. The repeated selected-rollup parsing path is avoided for all valid
    periods. The fallback remains necessary to preserve invalid runtime-period
    failure behavior. No newly dead production file or compatibility route was
    found. No broad typing repair, new cache or request deduplication was added.

## Before and after

11. **Frontend bootstrap:** the only build-rule change places
    `\0vite/preload-helper.js` in its own chunk before package-based manual
    chunk selection. Other package placement and route imports are preserved.

    | Emitted initial static closure | Exact base | Final |
    | --- | ---: | ---: |
    | JS chunks | 14 | 9 |
    | Raw bytes | 672,436 | 283,768 |
    | Gzip bytes | 217,480 | 89,227 |
    | PDF subtree initial through helper ownership | Yes | No |
    | All emitted JS chunks | 80 | 81 |
    | All emitted JS raw bytes | 1,742,017 | 1,739,541 |
    | All emitted JS gzip bytes | 546,478 | 545,731 |

    Gzip is Node zlib level 9 per file, summed under identical conditions. This
    differs slightly from Python gzip totals in the earlier audit. Both cold
    graphs are inspected from emitted HTML/static import declarations, excluding
    dynamic imports, and checked against actual fresh-browser requests. Home,
    Login and Admin Login no longer request jsPDF's subtree. The Portal feature
    retains its existing eager Reports/PDF imports; entering Dashboard can still
    load that legitimate feature dependency. No route restructuring or new
    PDF loading state was introduced. Home → Dashboard → Reports navigation and
    both production PDF downloads pass against both builds.
12. **BigQuery health/dependencies:** keep `SELECT 1 AS ok` and location, count
    ordinary REST results, query timeout 10 seconds, result timeout 30 seconds,
    page/result cap 1. Cancel a created job on result/iteration failure, preserve
    the original error even if cancellation fails, and retain nonfatal startup
    failure. Empty results still count as successful connectivity, as at base.
    The canonical `portal_rows` query configuration, parameters, limits, cache,
    timeout and cancellation behavior are unchanged. Compatibility snapshot
    queries/fallbacks are unchanged.

    | Controlled production images | Exact base | Final |
    | --- | ---: | ---: |
    | Image bytes | 563,238,082 | 242,301,805 |
    | Median fresh application-factory import, seconds | 1.570 | 1.291 |
    | Median import peak RSS, KiB | 196,984 | 109,932 |

    Five fresh Python processes per image; Python 3.11 and matching retained
    dependency versions. These are import measurements, not live startup or
    request latency. No production startup hooks or provider calls are run.
    Local development has existing pandas packages, so dependency absence is
    proven in the new production image rather than inferred from local tests.
13. **Documents:** for an accepted 25 MiB file, two spools become one; 100
    redundant write/copy operations and 26,214,400 copied bytes become zero.
    The bounded validation reads remain, followed by asynchronous rewind and
    the same thread-pool storage call using `UploadFile.file`. Tests cover
    memory/disk spools, zero/exact-max/max+1, sequential ordering, validation
    precedence, partial success, duplicates, original provider exceptions,
    cancellation and close/lifetime. A real AnyIO cancellation-scope check
    confirms the memory-backed Starlette spool stays open until the shielded
    storage worker completes; the same characterization passes on the base.
    No GCS write occurs before size acceptance. Provider preconditions, object
    prefixes, generation checks, preflight and cleanup are untouched.
14. **Reports:** normal report building parses seven rollups instead of eight,
    with every required rollup validated in its existing order. The selected
    parsed result and parsed timestamp are reused. Memoized Date identity is
    keyed only by the existing effective clock string. An unrelated parent
    render changes cumulative report builds from 1 → 2 at base to 1 → 1 at
    final; a changed effective clock or period still adds one build. All seven
    periods, both report types, malformed nonselected rollups, failure order,
    clock boundaries, metrics and labels are covered. Side-by-side exact-base
    comparisons match all 84 report outputs and 28 PDF text/filename pairs.
15. **Admin:** at page size 50, 51 conversions become 50; all 50 occur after
    checkout release. Reads return raw rows before conversion; mutation and
    context transaction serialization stay unchanged. A real QueuePool test
    confirms a missing `get()` returns the same 404 and the next read reuses the
    same healthy driver connection. Lossless datatype/cursor contracts remain
    covered by the existing disposable-Postgres Admin suite. The synthetic
    conversion sample took 151,260 ns at base and 178,743 ns at final; this noisy
    single sample is not a speed claim. The demonstrated benefit is removing
    conversion from checkout occupation and skipping the lookahead sentinel.
    Frontend display strings are prepared once for returned data/table identity,
    then reused for titles and visible cells during unrelated form updates.
    Secret-field text and titles retain existing behavior.
16. **Metadata:** two checkouts become one; four SQL statements remain four,
    byte-for-byte identical and in the same order. The public dashboard context
    method retains its abstraction; a private connection-accepting helper allows
    metadata to reuse its checkout. Autocommit is unchanged, with two separately
    closed cursors and no fused query/transaction/cache. Organisation/Site,
    customer/Demo scopes, failures at statements 1–4 and missing-organisation
    precedence are covered. Normalized context/response digests match the base.
17. **BigQuery concurrent initialization:** two deliberately overlapping first
    callers previously constructed two clients; now they construct one shared
    client. Constructor arguments, retry after failure, lazy close and close
    behavior remain covered. Construction is still lazy.
18. **Shutdown:** keep GCS → PostgreSQL → BigQuery; attempt all three even if an
    earlier close fails, and raise the original first failure. Tests cover
    success, each individual failure and all three failing together.
19. **Slugs:** repeated `bases.count()` is replaced by one `Counter`. Input
    object/list identity and mutation, ordering, Unicode normalization,
    collision hashes and strings are preserved. Seven-sample synthetic medians:

    | Unique Site names | Base milliseconds | Final milliseconds |
    | --- | ---: | ---: |
    | 100 | 0.232 | 0.175 |
    | 1,000 | 10.672 | 1.985 |
    | 5,000 | 247.116 | 10.035 |

    All resulting JSON output digests match. These samples demonstrate scaling,
    not production request latency.

## Verification and preserved contracts

20. **Tests:** exact-base backend suite **395 passed**; final **435 passed**.
    PostgreSQL integration uses only disposable localhost PostgreSQL 17 on port
    55432. Focused checks also passed: metadata/Portal/Dashboard 89; Admin/read
    contracts 69 at that stage; resources/Portal/consolidation 83; final
    Documents/GCS 43. The full final suite includes all added checks.

    Frontend/browser results:

    | Check | Result |
    | --- | --- |
    | Reports engine and PDF tests | PASS |
    | Phase C one-shell architecture | PASS |
    | Phone country data | PASS |
    | New production hardening browser, base and final | PASS; graphs, cold routes, Portal navigation, two PDF downloads each, repeated render and clock/period invalidation |
    | Portal browser | 21 scenarios passed |
    | Organisation Dashboard browser | 37 scenarios passed |
    | Authenticated navigation shell | PASS |
    | Authenticated UI polish | PASS; storage, favourites, Home, Event copy, responsive/touch, hydration and failure |
    | Authenticated zero-data browser | 26 scenarios passed; 112 PDFs verified with pdftotext |
    | Admin browser with disposable PostgreSQL | PASS |
    | Documents browser with isolated memory storage | PASS |
    | Account lifecycle browser with disposable PostgreSQL/Postmark stub | PASS |
    | Organisation access browser with disposable PostgreSQL | PASS; desktop/phone/tablet, two-user workflows, Contact and zero-site modules |
    | Explicit local-new-account fixture browser | PASS |
    | Exact-base report/PDF comparison | 84 outputs and 28 PDF text/filename pairs match |
    | Offline production image ASGI smoke | PASS; frozen OpenAPI, static SPA, protected 401s, existing tombstone/not-found responses, lazy resource close and dependency absence |
    | Legacy topology mock verifier | FAIL on both exact base and final: `[data-topology-mock="true"]` never exists at its target; unchanged and outside this PR |

    This environment lacks Playwright's downloaded Chromium/Edge distribution.
    Tests run with installed `/usr/bin/chromium`; older scripts that hardcode
    their browser use a temporary launch override, without changing repository
    tests. Cookiebot requests may log unrelated network tunnel errors in the
    shell test; application assertions still pass. The older topology script's
    missing-target failure persists even after the browser override on both
    revisions; it is not presented as a passing regression.
21. **Build:** final `npm run build` passes (Vite, 5.71 seconds in the local
    measured run). Exact-base and final production Docker builds also pass,
    using Node 20/Python 3.11 and matching retained package versions. The cloud
    environment's proxy CA is mounted only into temporary build commands;
    TLS validation remains enabled. Repository Dockerfile and infrastructure
    settings are unchanged.
22. **Types:** focused Admin, Documents and Account typechecks pass. Global
    TypeScript checks have the same **60 existing diagnostics** on both exact
    base and final; diagnostic text matches after normalizing line/column shifts.
    No new diagnostic, `any`, suppression or compiler weakening was introduced.
23. **Performance evidence:** see items 11–19 and the raw JSON. No generic cache,
    blind deduplication or fabricated production-latency percentage is used.
24. **Schema:** no migration, schema, index, sequence, constraint or grant change.
25. **GCP/IAM/Cloud Run:** no deployment, resource, configuration or provider-data
    modification. Validation uses offline mocks/fixtures and disposable local
    PostgreSQL only; no production database, GCS, BigQuery or Postmark data.
26. **Public API:** unchanged. OpenAPI digest remains
    `5f00187899f2d88548b9415f14d1b27ef37ed65a11f89f28d90d8eea9415f1c1`
    (69 paths, 73 operations). Auth/session/cookie/permission and compatibility
    contracts remain covered. The complete remaining historical API surface is
    the same nine entries in [compatibility-surface.md](compatibility-surface.md).
    None enters canonical customer/Admin authority. Production still has one
    composition; `PORTAL_BACKEND_MODE` is absent from production application code
    and explicit dev/test fixtures stay outside it.
27. **Visuals:** no CSS, DOM structure, copy, assets, icons or responsive setting
    changed. Both production builds emit the same 26 CSS files, 243,031 bytes,
    with the same content digest set and Portal stylesheet insertion order.
    Screenshot pairs cover eight routes (public Home/Login/Admin Login,
    authenticated Home, organisation/site Reports, Dashboard and Documents)
    at 1440, 1024 and 390 px. 18 of 24 pairs are pixel-identical; remaining pairs
    differ in only 13–57 pixels with maximum RGB-channel difference 7–8, tiny
    rasterization variation. A separate Portal comparison confirms identical
    DOM geometry, computed fonts/colors/borders and stylesheet order. PDF text
    and filenames match; responsive regression suites pass. No intentional or
    material user-visible rendering change was found.
28. **Persistence:** unchanged. Contact journaling/save-before-email is entirely
    untouched. Documents ownership/generation/duplicate semantics, lifecycle
    transaction boundaries, durable attempt writes, membership locks/owner
    protection, Alarm repeatable read, Admin writes, device/gateway updates and
    snapshot persistence stay unchanged. No provider-error remapping is added.
29. **Deliberately separate issues:**

    - **SEPARATE SECURITY FOLLOW-UP RECOMMENDED:** if reserved user 999999 were
      absent and the identity sequence allocated that value, signup could create
      that numeric identity. This conditional behavior is deliberately unchanged;
      no production-state assumptions or live probe are made here.
    - Device historical aggregate availability/count behavior beyond 10,000
      groups is unchanged and requires separate correctness work.
    - The Device/Gateway mutation origin-guard difference is unchanged; no new
      rejection behavior is introduced.
    - Contact concurrency/offloading and shared journal temp-file concerns are
      unchanged and require a separate product decision.
    - Unexpected GCS/provider public failure contracts are unchanged.
    - Existing global TypeScript diagnostics and the stale topology mock script
      are outside this optimization PR.
30. **Current user behavior is preserved.** All nine approved changes reduce
    internal work/resource risk while retaining the same camOS routes, responses,
    statuses, cookies, authorization, timing/freshness values, ordering,
    persistence, external side-effect contracts, loading/error/empty states,
    Demo behavior and PDF/visual content. Natural speed improvements are the
    intended observable benefit. The limitations above are explicit; no failing
    baseline check is represented as a successful check.

## Reproduction

Use the onboarded dependencies, a disposable localhost PostgreSQL server and a
production frontend preview. Examples from the repository:

```sh
PORTAL_TEST_POSTGRES_PORT=55432 .venv/bin/python -m pytest -q backend/tests
cd frontend
npm run build
npm run typecheck:admin
npm run typecheck:documents
npm run typecheck:account
npm run test:reports-engine
npm run test:phase-c
PORTAL_BROWSER_EXECUTABLE=/usr/bin/chromium \
  PORTAL_BROWSER_BASE_URL=http://127.0.0.1:3100 \
  node scripts/production-hardening-browser.mjs
```

Run `vite preview --host 127.0.0.1 --port 3100` before the hardening browser.
For the exact-base graph/render comparison, archive the starting SHA into an
isolated directory, build it with the same dependencies, copy only the new
measurement harness into that directory, run a preview on a separate port and
set `PORTAL_HARDENING_BASELINE=1` with its `PORTAL_BROWSER_BASE_URL`. The harness
writes `test-results/production-hardening/measurements.json`.

Browser suites that spawn a backend use `PORTAL_TEST_PYTHON` and
`PORTAL_TEST_POSTGRES_PORT`; run those sequentially because their fixture servers
share port 8000. The explicit fixture runner is
`python -m backend.dev.run_fixture_portal`, never a production mode selector.
