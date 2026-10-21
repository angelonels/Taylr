# Browser acceptance contract

E2E is the test mechanism. Failure scenarios precede implementation; no mirrored unit tests.

## Isolation

Automated tests launch Playwright’s bundled Chromium in headless mode, with a new temporary data directory and extension copy per test. They never attach to any personal browser, profile, cookies, or credentials. The temporary extension manifest grants only the fixture and selected site’s exact origin; the shipped manifest retains optional per-site permissions. Temporary files and browsers close in teardown. Run one Playwright command at a time: separate commands share the report/artifact directory; workers inside one command have isolated browsers and artifacts. Named host locks serialize cases for the same hostname while unrelated sites can run in parallel. `TAYLR_HEADED=1` shows this disposable browser for debugging.

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:e2e
npm run test:live -- --workers=2
TAYLR_SITES=youtube,amazon TAYLR_COMPONENTS=primary npm run test:live
npm run test:report
```

The default deterministic suite runs without live-site access. A test-only action bridge invokes the real registered toolbar handler; it cannot create Chrome’s native activeTab gesture. Only the preview tests grant `<all_urls>` in their disposable extension copy so the actual captureVisibleTab API can be exercised. Production retains optional per-origin access and activeTab. This test grant never touches a personal profile. Native permission-dialog presentation is outside this programmatic harness.

The deterministic fixture runs without live-site access. The opt-in catalog currently has 37 modern sites and three deliberately different component contracts per site (111 cases). The shared six checkpoints are baseline/uniqueness, Hide without navigation, Undo, attached-but-hidden reload/new-tab persistence, Restore across tabs, and Escape. Repeating these invariants is necessary, but website count alone is not coverage: component geometry, rendering model, sibling retention, nested controls, sticky positioning and replacement behavior explain why each case exists.

## Failure scenarios

- A selection follows a link or activates a page control.
- A button glyph or label is hidden instead of its control, or default grouping prevents explicit Child selection.
- Hiding one repeated card hides a sibling, or a broad selector hides the page.
- A container’s nested child is hidden instead of the selected parent, moving onto another child loses explicit refinement, or Down loses the child selected before moving Up.
- Synthetic site clicks, key events or open-shadow toolbar clicks create rules; modified Enter hides accidentally; or Undo leaves page selection unusable.
- Cancel/Escape fails, focus is lost when a control disappears, reopening the dock duplicates roots, or the outline stops following layout shifts.
- The floating toolbar blocks a target and cannot be moved out of the way.
- A repeated card changes position and a new neighbor inherits its saved rule. Live assertions must follow a declared stable identity when server results reorder, rather than assuming the first position still describes the same card.
- Generated DOM identifiers or URL tracking parameters survive only one render and break persistence. Stable query parameters that distinguish content must remain part of the rule.
- A semantic landmark receives a positional selector; inserting a same-tag sibling reveals it and hides the wrong wrapper.
- A product link regenerates search attribution and reveals the hidden card despite a stable product identifier.
- Reload, a new tab, or dynamically replaced content loses a saved rule.
- Undo removes a different tab’s rule, concurrent writers lose an update, or a delayed mutation response overwrites a newer broadcast/storage state.
- A delayed Save/Restore reply overwrites a newer broadcast, or closing during Save fails.
- Restricted URLs or denied permissions provide no recovery path; concurrent first-use action invocations race dynamic registration into a false error.
- Saved rules show generic container tags when recognizable text is available.
- Child traversal selects a `visibility: hidden` element.
- Dock bounds, edge expansion, readable controls, focus or reflow breaks at narrow widths or native 200% Chrome zoom.
- Paused animation frames leave Hide waiting for its preview; preview capture failure blocks Hide, another tab’s pixels leak into a rule, img-src CSP blocks the preview, or preview quota pressure prevents saving.
- Reflow, scrolling or removal during native capture saves pixels from the component’s former position. Keyboard grip activation travels through a spring or a held keyboard press shrinks its control.

The fixture covers concurrency, inline important styles, keyboard/pointer interception, DOM replacement, selector identity and hierarchy. Separate E2E scenarios cover dock open/close, layout preservation, drag and keyboard movement, edge expansion, the six widths 320/375/768/1024/1440/2560, native 200% browser zoom, reduced motion, denied access, concurrent action invocation and delayed replies. Preview tests use native Chrome capture/cropping, persistence and individual Restore, CSP-safe rendering, inactive-tab refusal, paused-frame deadlines and quota fallback. WebP/PNG artifacts expose the actual visual result; traces preserve the interaction and DOM snapshots.

A separate opt-in LeetCode access smoke verifies the action can mount the dock on ordinary HTTPS without a false “protected” state. It records website challenge status separately. Passing that smoke does not verify LeetCode problem rows or filters behind Cloudflare.

## Evidence and interpretation

Each component run owns `output/playwright/sites/<site>/<component>/`: baseline HTML, before/hidden/restored-state evidence, completed checkpoints, failure details when applicable, and a trace. Only that case’s generated directory is replaced on rerun. Timestamped results identify disposable Playwright Chromium and fingerprint the extension build plus component contract. Changed contracts/builds are stale until rerun; old personal-profile results do not establish current coverage. The HTML test report is under `output/playwright/report/`; `test:report` aggregates the latest component results into `catalog-results.json` and `catalog-report.html`.

The picker must be visible before the runner sends keyboard input. A resolved click is not proof that asynchronous permission/register/start steps have completed. Pointer selection samples exposed points of the declared component, never substitutes a broader target. It follows actual inspector selection through the internal state query and verifies the saved rule resolves to the exact declared DOM element; merely hiding an ancestor does not qualify. Canvas contracts use a stable viewport host or stage relationship; mutable pixel dimensions are not an identity. Retained content must remain independent of the hidden surface. The original unselected listing is tracked through Hide/Undo; later server responses may replace that neighbor, so revisits require a current independent result. The selected listing must still resolve to exactly one attached, hidden node. Declared initial app values wait for hydration before state comparisons. Airbnb’s search/filter contracts require enabled native controls so server-rendered placeholders cannot qualify as a ready baseline. Candidate selectors are validated against observed DOM; contract changes must retain the stated component and reason. Failure capture follows the actual failing tab, including new-tab access restrictions. Interactive-app contracts also retain meaningful state where available, such as board zoom, search text, or an unopened sort control.

The live command is intentionally strict: access blocks still produce a nonzero test exit, while the catalog report distinguishes them from product failures. They are never silently converted to passing tests.

No CAPTCHA, login wall, paywall, or security interstitial is bypassed. An access block remains a block, never a feature pass. Partial checkpoints, selector failures and extension failures remain distinct from completed cases. Generated evidence and browser data stay out of Git.
