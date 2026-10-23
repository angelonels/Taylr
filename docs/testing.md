# Testing

## Gates

```sh
npm run check
npm run format:check
npm run test:e2e -- --workers=2  # controlled acceptance
npm run test:canary -- --workers=2
npm run test:live -- --workers=2
npm run test:compare -- --workers=1
```

The wrapper builds once, checks the bundled browser and owns its fixture server. Tests launch disposable Playwright Chromium with temporary profiles; they never attach to personal browser sessions or reload an installed extension. Serialize top-level runs because they share port 5173; use workers inside one run.

Use local acceptance for ordinary edits, canaries for cross-page changes, and the full catalog for compatibility audits. `TAYLR_HEADED=1` enables visible disposable browsers. `TAYLR_SITES`, `TAYLR_COMPONENTS` and `TAYLR_CASES` filter live checks; `TAYLR_TRACE=full` retains successful live traces.

| Exit | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | Every selected contract passed                                          |
| 2    | External access blocks left coverage incomplete                         |
| 1    | Product, contract, environment or harness error; missing/stale evidence |

## Acceptance contracts

Controlled fixtures cover precise selection, parent/child traversal, synthetic-input rejection, cancellation and focus, Undo ownership, cross-tab races, dynamic replacement, selector identity, startup recovery, denied access and reversible Pause/Resume. Panel cases cover drag, edge switching, unchanged page width, long rules and labels, six viewport widths, native 200% zoom, short windows, immediate keyboard feedback, dark glass and accessibility preferences.

Preview acceptance checks actual pixels, native detail, clipping, geometry invalidation, hostile image CSP, inactive documents, delayed/failed captures, cancellation, storage pressure and paused animation frames. Image presence alone is insufficient.

Each live component requires H01 baseline/uniqueness, H02 precise Hide without navigation, H03 Undo, H04 an attached-but-hidden target after reload/new-tab, H05 Restore across tabs, and H06 Escape. Independent retained content and application state must survive. Readiness polls observable app state; immediate Hide/Undo checks remain strict. Reacquire only the declared component after a proved pointer miss or disconnected node.

The production-permission fixture retains HTTP/HTTPS grants and rejects runtime permission requests. The test action bridge invokes the real handler but does not establish Chrome’s native activeTab gesture. Native permission-dialog automation remains an opt-in unresolved diagnostic; LeetCode access smoke is also opt-in and does not prove challenge-protected component coverage.

## Evidence

Each invocation writes `output/playwright/runs/<id>/<headless|headed>/`. `output/playwright/latest-run.json` points to the latest invocation. Open `report/index.html` for local results or `catalog-report.html` / `catalog-results.json` for live contracts. Controlled tests retain traces/screenshots; live cases retain checkpoints and rendered evidence, with failure traces by default.

Build, harness, component and environment fingerprints qualify evidence. Old results are historical after relevant changes. A canary does not verify the remaining catalog. Reports distinguish passed, externally blocked, product-failed, contract-failed, environment-error, harness-error, unrun and stale. Authentication, challenges, paywalls and browser protections are never bypassed.

Compatible targeted reruns can supplement a full audit:

```sh
node scripts/report-sites.mjs --roots output/playwright/runs/<full>/headless output/playwright/runs/<targeted>/headless --output output/playwright/reports/<combined>
```

Aggregation retains original artifacts and rejected history. The newest qualifying attempt wins, including failures and blocks. Mixed environments/display modes, malformed records and incomplete checkpoint passes fail explicitly. Phase times overlap across workers; they are not wall time.

Harness regressions cover occupied-server ownership, missing-browser preflight, failure classification, cleanup/attachment failures, screenshot coordinates after scrolling, unfinished fonts, app hydration, contaminated pointer input and report provenance. Details of the strategy are in [the rationale](research/testing-strategy.md); public contracts and coverage are in [the matrix](site-test-matrix.md).
