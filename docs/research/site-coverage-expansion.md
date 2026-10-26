# Public-site coverage expansion

## Expansion on 23 October 2026

The prepared catalog grows from **37 sites /111 contracts** to **47 sites /183 contracts**:32 additional contracts on existing sites and ten new sites with four contracts each. All111 original component definitions are preserved. These are planned acceptance cases, not new feature passes. Existing status notes are historical.

| New site          | Distinct component contracts                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| MDN               | Documentation header, reference sidebar, table of contents, article heading                |
| Wikipedia         | Search input, contents pane, namespace navigation, article heading                         |
| OpenStreetMap     | Map viewport, query input, zoom command, global navigation                                 |
| Stack Overflow    | Search input, primary navigation, sidebar, tag heading                                     |
| W3C               | Global navigation, responsive hero, repeated news card, footer                             |
| Photopea launcher | Navigation, heading, script-driven launch command, responsive feature block                |
| CodeMirror        | Live editor, narrow line-number gutter, navigation, feature heading                        |
| Observable Plot   | Search trigger, internal getting-started link, GitHub link, external examples-gallery link |
| Monkeytype        | Test mode toolbar, word stream, header, restart control                                    |
| Radix Primitives  | Search trigger, example tabs, copy command, expand-code command                            |

Photopea covers its public launcher, not the editor canvas. Stack Overflow rendered its real question-page DOM despite an HTTP403 response; its extension acceptance remains planned and can still be blocked. Apple Maps independently normalized its URL in clean-browser visits; the catalog waits for the observed canonical center before enforcing the existing no-navigation invariant.

Google Search, Canva, Medium, Tripadvisor and IMDb retain their original three contracts. An additional target could not be confirmed behind observed access walls. Their fourth-contract expansion is deferred rather than guessed.

Internet Archive's apparent targets required shadow-piercing locators and were rejected because the current public-site contract deliberately uses light-DOM selectors. npm showed an interstitial; Mermaid showed an incomplete application shell. A later bounded confirmation established four independent exposed controls on Observable and Monkeytype. Observable uses its pointer-confirmed Examples gallery link rather than an unsampled transformed chart thumbnail; its redirected canonical origin is explicitly allowed. Monkeytype rejects optional cookies before validating its controls.

Airbnb’s new map contract was present beneath its price notice during discovery. The existing declared “Got it” dismissal runs before acceptance validates the map; discovery alone does not establish exposure.

Discovery observations, confirmation scripts and traces are retained under `output/research/site-coverage-expansion-2026-10-23/`. Only observed, accessible components compatible with the picker were selected. Full extension journeys are run by the main acceptance suite after this catalog freezes.

## Contract policy

Keep a site's existing contracts stable when adding coverage. A new contract must exercise a distinct component: a canvas, repeated item, form field, command, nested leaf or independently positioned surface. Four nested wrappers of the same control do not constitute four contracts. Each target needs a visible retained element outside its subtree, an explicit purpose and an observed selector. Repeated items need an index or stable identity; a broad fallback that silently changes the target is not acceptable.

Write failure conditions before accepting a candidate:

- Picking a nested link or command activates navigation, playback, a drawing gesture or another site action.
- Hide changes an adjacent repeated item, an unrelated control or the whole application.
- Edit loses the target after hydration, changes the wrong item, breaks site-owned text nodes or captures page keyboard shortcuts.
- Cancel, Reset, Undo or Restore leaves a declaration, hidden element or partial history behind.
- Reload or a new tab loses the saved component identity, or a private rule crosses the storage boundary.
- A bot wall, missing target, unfinished hydration or a harness failure appears as a feature pass.

Every catalog contract runs the shared Edit and Hide journey, including the applicable editing controls, persistence and reversibility. Additional component contracts expand the DOM and interaction situations covered; they do not substitute for exercising the new features on each target. Conditional controls, such as gaps on flex/grid containers and text on eligible leaves, must be reported as applicable rather than counted as universal passes.

## Discovery and verification

Discovery uses disposable Playwright Chromium, a fresh context and read-only public-page inspection. Keep the final URL, HTTP/access observation, exact locator counts, visible bounds, target/retained-node relationship and trace. DOM discovery establishes that a contract is credible; it does **not** verify Taylr. Only the later extension acceptance run can establish a feature pass.

New contracts stay planned until that run. Historical acceptance for the original contracts remains historical. An observed access wall is a blocked visit; no login, CAPTCHA, cookie-consent acceptance or profile attachment is used to turn it into coverage.

## Keeping the suite practical

Serialize local browser discovery and acceptance batches through the shared queue, with at most two acceptance workers. Freeze the build and scenario harness before the full catalog run so that all results have a comparable fingerprint. Preserve per-component results, checkpoints and traces; retries or access failures must not erase the first diagnosis. Run narrow discovery while selectors are uncertain, then the complete feature journey after contracts freeze.

Parallelism and sharding are execution tools, not permission to reduce assertions. [Playwright's parallelism guidance](https://playwright.dev/docs/test-parallel) describes worker isolation and machine-level sharding. [Its trace viewer](https://playwright.dev/docs/trace-viewer) preserves action timelines, snapshots and network evidence. [Chrome's extension E2E guidance](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing) supports testing observable extension behavior through browser automation.
