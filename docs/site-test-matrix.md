# Public-site regression matrix

The catalog defines **64 sites and 250 component contracts** in [tests/sites.json](../tests/sites.json). Fifty-eight sites have four distinct components; five have three because access walls prevented confirming an additional target, and the National Weather Service has three. The 2026-11-03 expansion adds 17 sites and 67 contracts while preserving the earlier 183 definitions. Catalog size describes planned coverage; it does not establish feature passes.

## Current qualification

The 17 added sites are **planned** coverage. All 67 of their contracts passed one sandbox run on 2026-11-03, but that browser (Chromium 153) does not match the pinned Playwright build, so the report correctly classifies the evidence as stale rather than verified. They need a qualifying audit.

The [current audit](../output/playwright/qualifications/2026-10-26T08-11-11-386894Z/aggregate/catalog-report.html) attempted **all 183 contracts** on the same frozen production build and harness: **153 passed, 30 externally blocked, and zero product, contract, environment or harness failures**. No contracts are unrun or stale. **37 of 47 sites are fully verified**; the other ten contain access-blocked components. Blocked coverage remains unverified.

The [complete controlled acceptance suite](../output/playwright/runs/2026-10-26T07-00-11-734Z-0f5e8c/headless/report/index.html) recorded **224 passed, two opt-in diagnostics skipped, and zero failures**. It includes real native presses across animated Save-label replacement, saved/draft target replacement, a replaced-node handoff after Save, and native page-load readiness. A separate Chromium check confirms the saved button’s accessible name is exactly “Saved.”

The audit preserves original failed attempts and their traces. After a recorded clamshell sleep and network interruption, only the 60 unresolved contracts were rerun; the final report combines matching build, harness, contract and environment fingerprints. Production build **6407d5a07340** contains no test bridge or driver. Catalog status fields reflect this dated audit. Earlier audits remain historical.

## Catalog

Exact component names, selectors, identities and application invariants belong to the JSON catalog. The groups below account for all 250 cases without duplicating those definitions.

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
| **Total**                          | **64 sites**                                                            |   **250** |

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
