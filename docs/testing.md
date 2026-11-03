# Testing

## Commands

```sh
npm run check
npm run format:check
npm run test:e2e -- --workers=2  # controlled acceptance
npm run test:canary -- --workers=2
npm run test:live -- --workers=2
npm run test:compare -- --workers=1
```

The wrapper builds once and checks the bundled browser. Local runs fulfill their fixture bytes inside each disposable browser, including query variants; public-site runs do not depend on a development server. Tests launch disposable Playwright Chromium with temporary profiles; they never attach to personal browser sessions or reload an installed extension. Keep browser concurrency bounded by measured throughput and memory pressure; more browsers can make the suite slower. Test extension copies dereference build symlinks before applying fixture-only patches, so generated production files stay unchanged.

Use local acceptance for ordinary edits, canaries for cross-page changes, and the full catalog for compatibility audits. `TAYLR_HEADED=1` enables visible disposable browsers. `TAYLR_SITES`, `TAYLR_COMPONENTS` and `TAYLR_CASES` filter live checks; `TAYLR_TRACE=full` retains successful live traces.

| Exit | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | Every selected contract passed                                          |
| 2    | External access blocks left coverage incomplete                         |
| 1    | Product, contract, environment or harness error; missing/stale evidence |

These exit meanings apply to catalog contracts. Controlled acceptance reports its two opt-in diagnostics as skipped when disabled.

Failures and incomplete evidence take precedence over external blocks when determining the exit code.

## Acceptance contracts

Controlled fixtures cover precise selection, parent/child traversal, synthetic-input rejection, disabled native controls, modal and fullscreen transitions, cancellation and focus, Undo ownership, cross-tab races, dynamic replacement, selector identity, startup recovery, denied access and reversible Pause/Resume. Panel cases cover drag, edge switching, unchanged page width, long rules and labels, six viewport widths, native 200% zoom, short windows, immediate keyboard feedback, dark glass and accessibility preferences.

Journey acceptance covers the initial choice and focus, picking without mutation, Save/Done feedback, saved edits and direct Resume. Editor acceptance covers UIArc select keyboard/focus/typeahead/contrast, color hue precision and popover dismissal, disclosure drafts, and every exposed CSS control and leaf text, per-field Reset, Cancel, failed Save/retry, concurrent property merges, revision-safe Undo, site replacement, retained nested controls, text-node identity, text applied while the parser is still inside its element, and bounded observer contention. The narrow editor keeps Save and the panel’s Close button reachable while properties scroll; collapsed invalid fields offer a direct, focused recovery action. Public contracts exercise all 21 common/advanced properties on each actual component, plus row/column gaps where its existing layout supports them. They also cover eligible text, attempted Save with invalid CSS, Reset/Cancel, hierarchy, color/listbox keyboard behavior, repeat Save/Undo, integrated Hide and cross-tab Pause/Restore. Per-component editor evidence records property and text applicability, saved overrides and verified unchanged baseline values; CSS layout constraints may limit a declaration’s visible effect.

Matrix acceptance (`tests/e2e/matrix-*.spec.ts`) shares one disposable browser per worker for speed. Each case owns a fresh routed `*.taylr.test` origin, so no case can observe another's profile, registration or tabs, and attaches its own trace chunk to the report. Earlier origins' registrations stay behind but are unreachable. Parser cases need a real streaming server; a reused local port is safe because each case restores its profile before it ends. These origins are plain HTTP, a non-secure context that ordinary fixtures on `127.0.0.1` cannot represent. The matrices cover every allowlisted property, every listed option and sampled free-form values against the browser's own inline rendering, reload and Restore; containment of hostile selectors and values, both newly requested and already stored by older builds; worker request validation, including injections per property, prototype keys, malformed origins and types, paused sites and Undo history; text edits across 17 DOM shapes and six lifecycles, plus ineligible elements; parser cut points for each rule kind; convergence of one to three tabs across ten operations; and picker identity for 15 DOM shapes after reload, an inserted banner and regenerated volatile values.

Preview acceptance checks actual pixels, native detail, clipping, geometry invalidation, hostile image CSP, inactive documents, delayed/failed captures, cancellation, storage pressure and paused animation frames. Image presence alone is insufficient.

Each live component proves H01 baseline and uniqueness, H02 Edit/Save and precise Hide without navigation, H03 Hide Undo with edits intact, H04 persistence after reload/new-tab, H05 cross-tab Restore, and H06 Escape. Retained content and application state must survive.

Each visit has one 60-second navigation/readiness deadline; component and editor actions retain 15-second gates. Readiness markers must identify an initialized application. Pages whose hydration listeners block native events declare `readyState: "load"`; visible HTML alone is insufficient. Load uses the same deadline.

Verify a committed Save through exact storage and rendered CSS, then start the next editor journey with Escape and a fresh selection of that proven component. Reacquire only the declared target after a proved pointer miss or disconnection. Unsaved input may be entered once more only after disconnection, cleared selection and unchanged stored rules. Save is never replayed.

Native focus and layout can change while using the panel. Reset/Cancel must remove draft declarations; retained content must stay visible and match no injected rule. Saved values remain strict. Restore compares all properties with each document’s paused state, accepting changed native inline geometry only when its new absolute pixel declaration independently determines the expected value. Negative controls reject leaked selectors and retained overrides.

The production-permission fixture retains HTTP/HTTPS grants and rejects runtime permission requests. The test action bridge invokes the real handler but does not establish Chrome’s native activeTab gesture. Native permission-dialog automation remains an opt-in unresolved diagnostic; LeetCode access smoke is also opt-in and does not prove challenge-protected component coverage.

## Evidence

Each invocation writes `output/playwright/runs/<id>/<headless|headed>/`. `output/playwright/latest-run.json` points to the latest invocation. Open `report/index.html` for local results or `catalog-report.html` / `catalog-results.json` for live contracts. Controlled tests retain traces/screenshots; live cases retain checkpoints and rendered evidence, with failure traces by default.

Build, harness, component and environment fingerprints qualify evidence. Old results are historical after relevant changes. A canary does not verify the remaining catalog. A selected identity missing or duplicated after revisiting remains an unverified contract failure; a present target with lost styles or visibility remains a product failure. Reports distinguish passed, externally blocked, product-failed, contract-failed, environment-error, harness-error, unrun and stale. Modal authentication walls (including those appearing after readiness), challenges, paywalls and browser protections are never bypassed.

Use explicit `TAYLR_CASES` lists for disjoint batches. After an interruption, resume unfinished contracts; preserve completed failures and external blocks. Keep the build and harness frozen throughout those batches. Compatible targeted reruns can supplement an audit, but changed fingerprints make earlier evidence historical. Aggregate the roots and require every contract to be current and attempted:

```sh
node scripts/report-sites.mjs --roots output/playwright/runs/<full>/headless output/playwright/runs/<targeted>/headless --output output/playwright/reports/<combined>
```

Aggregation retains original artifacts and rejected history. The newest attempt with current fingerprints wins, including failures and blocks. Mixed environments/display modes, malformed records and incomplete checkpoint passes fail explicitly. A pass also requires its complete editor artifact, matching final checkpoint outcome and rendered Hide evidence. Automatic Playwright retries are rejected; a rerun creates a separate recorded attempt. Phase times overlap across workers; they are not wall time.

Harness regressions cover occupied-server ownership, missing-browser preflight, failure classification, cleanup/attachment failures, screenshot coordinates after scrolling, unfinished fonts, app hydration, contaminated pointer input and report provenance. Details of the strategy are in [the rationale](research/testing-strategy.md); public contracts and coverage are in [the matrix](site-test-matrix.md).
