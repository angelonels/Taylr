# Public-site regression matrix

The catalog defines **66 sites and 256 component contracts** in [tests/sites.json](../tests/sites.json). Fifty-eight sites have four distinct components; five have three because access walls prevented confirming an additional target, and the National Weather Service, Hacker News and Project Gutenberg have three. The 2026-11-03 expansion adds 17 sites and 67 contracts while preserving the earlier 183 definitions. Catalog size describes planned coverage; it does not establish feature passes.

## Current qualification

The 17 added sites are **planned** coverage. All 67 of their contracts passed one sandbox run on 2026-11-03, but that browser (Chromium 153) does not match the pinned Playwright build, so the report correctly classifies the evidence as stale rather than verified. They need a qualifying audit.

The [current audit](../output/playwright/qualifications/2026-10-26T08-11-11-386894Z/aggregate/catalog-report.html) attempted **all 183 contracts** on the same frozen production build and harness: **153 passed, 30 externally blocked, and zero product, contract, environment or harness failures**. None of those 183 contracts were unrun or stale in that audit. **37 of the 47 audited sites are fully verified**; the other ten contain access-blocked components. Blocked coverage remains unverified.

The [complete controlled acceptance suite](../output/playwright/runs/2026-10-26T07-00-11-734Z-0f5e8c/headless/report/index.html) recorded **224 passed, two opt-in diagnostics skipped, and zero failures**. It includes real native presses across animated Save-label replacement, saved/draft target replacement, a replaced-node handoff after Save, and native page-load readiness. A separate Chromium check confirms the saved button’s accessible name is exactly “Saved.”

The audit preserves original failed attempts and their traces. After a recorded clamshell sleep and network interruption, only the 60 unresolved contracts were rerun; the final report combines matching build, harness, contract and environment fingerprints. Production build **6407d5a07340** contains no test bridge or driver. Catalog status fields reflect this dated audit. Earlier audits remain historical.

## Catalog

Exact component names, selectors, identities and application invariants belong to the JSON catalog. The groups below account for all 256 cases without duplicating those definitions.

| Behavior                           | Sites                                                                   | Contracts |
| ---------------------------------- | ----------------------------------------------------------------------- | --------: |
| Media and discovery                | YouTube, Instagram, Pinterest, Twitch, Spotify, Apple Music             |        24 |
| Editorial feeds and scores         | Google News, Medium, Substack, BBC News, CNN, ESPN, IMDb                |        26 |
| Storefronts                        | Steam, Amazon India, Flipkart, IKEA                                     |        16 |
| Travel search                      | Airbnb, Booking.com, Tripadvisor, Google Flights                        |        15 |
| Search, maps and translation       | Google Search, Google Maps, Apple Maps, Google Translate, OpenStreetMap |        19 |
| Code and model tools               | GitHub, GitLab, Hugging Face, CodeMirror                                |        16 |
| Language and framework docs        | Python, Rust std, React, Svelte, Tailwind CSS, Vue, Go                  |        28 |
| Registries, data and research      | crates.io, Can I use, arXiv                                             |        12 |
| News and community feeds           | The Guardian, NPR, Lobsters, DEV Community                              |        16 |
| Browser code editors and services  | TypeScript Playground, p5.js Web Editor, National Weather Service       |        11 |
| Creative workspaces and launchers  | Excalidraw, tldraw, Scratch, Notion, Canva, Photopea launcher           |        23 |
| Interactive tools                  | Lichess, Desmos, GeoGebra, TradingView, Monkeytype                      |        20 |
| Reference and component interfaces | MDN, Wikipedia, W3C, Radix Primitives, Observable Plot, Stack Overflow  |        24 |
| Reading and reference (dark mode)  | Hacker News, Project Gutenberg                                          |         6 |
| **Total**                          | **66 sites**                                                            |   **256** |

## Dark-mode acceptance

These results are **historical**: they come from the dark-mode branch's own build (2026-10-22) before it merged with the editor, glass panel and matrix work. No dark-mode audit has run on the merged build yet, so none of these rows qualify it. Wikipedia, MDN and arXiv rows used that branch's own pages (Computer article, CSS reference, a different abstract); the merged catalog keeps the main entries for those sites, so their dark lifecycle needs a new run. Hacker News and Project Gutenberg joined the catalog from that branch with three Hide contracts each.

The added five sites and the updated YouTube Videos-filter entry point passed **18/18 Hide contracts** (**108 checkpoints**), with no blocks or failures, in **1.7 minutes**. Evidence: `output/playwright/runs/2026-10-22T19-35-08-984Z-8dbe47/headless/catalog-report.html`. The other **108 Hide contracts were not selected** in this feature rerun.

Public-site results below are recorded separately from historical Hide acceptance. A theme pass requires all three component baselines, bounded text-contrast regression checks where measurable, unchanged media filters, visible components, color restoration and saved application after reload. It does not establish all Hide checkpoints or certify accessibility. See [testing.md](testing.md#dark-mode-acceptance) for the sampling limits.

The final dark-mode audit attempted **all 42 sites** in one coherent run in **9.1 minutes** with three disposable workers: **37 passed**, **5 externally blocked**, **0 product/contract/environment/harness failures**, **0 unrun**. Tripadvisor, Google Search, Canva, Medium and IMDb remain blocked and unverified. Full evidence: `output/playwright/runs/2026-10-22T19-25-23-787Z-08f3d2/headless/dark-results.json` and its `report/index.html`. Each site retains screenshots and a trace in that run's `dark-sites/<id>/` folder. This public-site snapshot predates the later missing-response guidance change; the engine and public-site contracts are unchanged, and the recovery change has fresh local coverage above.

Review fixes preceded this run: first-use theme initialization in already-open tabs, rejection of CSS redirects before any hop, actual resource-body completion plus quiet/observation windows, explicit measurement-loss failures, per-sample settling for live quotes, changed-color restoration coverage and engine-style cleanup.

The earlier audit at `2026-10-22T19-03-40-532Z-61cc73` recorded 36 passes, five blocks and a TradingView all-colors-settling timeout; its unchanged TradingView rerun at `2026-10-22T19-12-45-669Z-609c48` passed. Those attempts remain historical. They do not substitute for the stricter final run above, which passes TradingView while allowing live quotes to keep changing and still checks every supported text pair.

| Site              | Dark lifecycle                                                                      | Measurable contrast samples | Restored samples |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| YouTube           | Passed                                                                              | 29                          | 29               |
| Lichess           | Passed                                                                              | 1                           | 10               |
| Steam             | Passed                                                                              | 16                          | 40               |
| Instagram         | Passed                                                                              | 15                          | 15               |
| Excalidraw        | Passed                                                                              | 1                           | 4                |
| Pinterest         | Passed                                                                              | 8                           | 11               |
| Twitch            | Passed                                                                              | 38                          | 40               |
| Spotify           | Passed                                                                              | 34                          | 36               |
| Amazon India      | Passed                                                                              | 39                          | 40               |
| Flipkart          | Passed                                                                              | 23                          | 37               |
| IKEA              | Passed                                                                              | 40                          | 40               |
| Apple Music       | Passed                                                                              | 2                           | 40               |
| Airbnb            | Passed                                                                              | 39                          | 40               |
| Booking.com       | Passed                                                                              | 34                          | 37               |
| Tripadvisor       | Blocked · tripadvisor.com                                                           | —                           | —                |
| Google Search     | Blocked · https://www.google.com/search?q=web+standards&sei=NmTaaqz0AtO2hvcPvIXiqAI | —                           | —                |
| Google Maps       | Passed                                                                              | 19                          | 20               |
| Google News       | Passed                                                                              | 32                          | 34               |
| GitHub            | Passed                                                                              | 36                          | 40               |
| GitLab            | Passed                                                                              | 40                          | 40               |
| Notion            | Passed                                                                              | 1                           | 30               |
| Desmos            | Passed                                                                              | 3                           | 4                |
| Canva             | Blocked · Just a moment...                                                          | —                           | —                |
| Medium            | Blocked · Security challenge                                                        | —                           | —                |
| Substack          | Passed                                                                              | 13                          | 40               |
| BBC News          | Passed                                                                              | 38                          | 38               |
| CNN               | Passed                                                                              | 24                          | 28               |
| Google Translate  | Passed                                                                              | 15                          | 8                |
| ESPN              | Passed                                                                              | 38                          | 40               |
| IMDb              | Blocked · 403                                                                       | —                           | —                |
| tldraw            | Passed                                                                              | 1                           | 2                |
| TradingView       | Passed                                                                              | 16                          | 16               |
| Google Flights    | Passed                                                                              | 19                          | 21               |
| Hugging Face      | Passed                                                                              | 8                           | 40               |
| Apple Maps        | Passed                                                                              | 0                           | 4                |
| Scratch           | Passed                                                                              | 7                           | 8                |
| GeoGebra          | Passed                                                                              | 2                           | 3                |
| Wikipedia         | Passed                                                                              | 40                          | 40               |
| MDN               | Passed                                                                              | 40                          | 40               |
| Hacker News       | Passed                                                                              | 10                          | 40               |
| arXiv             | Passed                                                                              | 40                          | 40               |
| Project Gutenberg | Passed                                                                              | 22                          | 23               |

Sample counts describe bounded observations, not a site-wide accessibility score. A zero contrast count means the baseline surfaces could not support the solid-background measurement; other lifecycle checks still ran. A previously measurable surviving sample becoming unmeasurable cannot pass.

## What each component must prove

Every declared component runs the shared Edit and Hide journey, with independently retained content and application state:

| Checkpoint        | Required behavior                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 Baseline      | The declared target is unique and visible; retained content is visible and independent.                                                                                                                           |
| H02 Edit and Hide | Applicable controls, eligible text, invalid input, Reset/Cancel, hierarchy, color/listbox keyboard behavior and repeated Save/Undo work; Hide affects the selected component without activating it or navigating. |
| H03 Undo          | Hide Undo restores the same component with saved edits intact.                                                                                                                                                    |
| H04 Persistence   | Reload and a new tab retain Edit and Hide on the declared component identity.                                                                                                                                     |
| H05 Restore       | Pause/Resume and Restore synchronize styles, text and visibility across tabs; reloading confirms cleanup.                                                                                                         |
| H06 Exit          | Escape exits the picker without changing the page.                                                                                                                                                                |

Editor evidence records all 21 common/advanced properties, plus gaps where the component's existing layout supports them. It distinguishes saved overrides, verified unchanged baseline values and text applicability. A constrained CSS declaration may have a limited visual effect; the report must retain that distinction. Six checkpoint labels alone do not establish a pass: complete editor evidence and rendered Hide evidence are required.

## Known boundaries

- Google Search, Canva, Medium, Tripadvisor and IMDb retain three contracts. Their fourth-component expansion is deferred behind observed access walls; those gaps are not passes.
- Photopea covers its public launcher, including the script-driven launch command. It does not claim editor-canvas coverage.
- Stack Overflow exposed genuine question-page DOM despite an HTTP403 response. Acceptance remains subject to access classification.
- Airbnb's map was covered by a price notice during discovery. The declared “Got it” dismissal must expose the target before acceptance. Apple Maps waits for its observed canonical-center initialization before enforcing the no-navigation invariant.
- Monkeytype rejects optional cookies before target validation. Observable's redirected canonical origin is declared explicitly. No login, challenge, paywall or browser protection is bypassed.
- The Guardian masthead is excluded: its only link identity is a support URL whose every query value is per-visit attribution, so its selector cannot survive a revisit. NPR's live player was absent on one visit and its sponsor slot re-renders during editing; both were replaced. Svelte's search input restyles itself on focus, so the contract targets its form. The p5.js toolbar intercepts pointer input for its buttons, so the toolbar is the component. Bing was excluded because it served a different layout on each sandbox visit.
- Internet Archive's shadow-only candidates, npm's interstitial and Mermaid's incomplete application shell were excluded. Discovery observations and traces are documented in [the expansion rationale](research/site-coverage-expansion.md).

Reports distinguish passed, blocked, product-failed, contract-failed, environment-error, harness-error, unrun and stale. A site is fully verified only when **every current component** has qualifying acceptance. Disposable Playwright contexts keep test data separate from personal browser profiles. Commands, evidence requirements and compatible targeted-run aggregation are in [testing](testing.md).
