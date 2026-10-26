# Public-site regression matrix

The catalog defines **47 sites and 183 component contracts** in [tests/sites.json](../tests/sites.json). Forty-two sites have four distinct components; five have three because access walls prevented confirming an additional target. The expansion preserves the original 111 component definitions and adds 72 cases. Catalog size describes planned coverage; it does not establish feature passes.

## Current qualification

**Full qualification of the final harness is incomplete.** The 47-site /183-contract catalog is planned coverage, not a claim that every feature passed on every site. Catalog status notes remain historical until a complete matching-fingerprint audit replaces them.

The last complete controlled acceptance gate recorded **216 passed and two opt-in diagnostics skipped**, with no failures. After the final recovery and test-isolation fixes, the [focused gate](../output/playwright/runs/2026-10-26T05-44-32-008Z-99d43d/headless/report/index.html) passed **12 checks**, including full editor properties, replaced targets, connected wrong targets and private extension-copy isolation. That focused gate does not qualify the public catalog. The final [Flipkart footer check](../output/playwright/runs/2026-10-26T05-46-29-024Z-d10d8e/headless/catalog-report.html) passed the complete live journey with the recovery fix; that targeted run selected one contract and left the other 182 unselected.

The latest public batch was invalidated when a temporary test workspace used a symlinked build and fixture writes reached the shared generated files. Fingerprint reconciliation rejected the batch; a truncated session record also prevented aggregation. The production build was restored exactly, and disposable test copies now dereference build symlinks. A real-browser regression proves the original build remains unchanged. Affected records remain on disk and are not counted as final passes.

The earlier complete public audit recorded **144 passed, 31 externally blocked, six product-classified failures and two contract failures**, with no unrun cases. Its [report](../output/playwright/qualifications/2026-10-25T08-26-33-707132Z/aggregate/catalog-report.html) is historical because the harness changed afterward. Earlier interrupted runs and the 22 October 37-site /111-contract baseline are historical too.

## Catalog

Exact component names, selectors, identities and application invariants belong to the JSON catalog. The groups below account for all 183 cases without duplicating those definitions.

| Behavior                           | Sites                                                                   | Contracts |
| ---------------------------------- | ----------------------------------------------------------------------- | --------: |
| Media and discovery                | YouTube, Instagram, Pinterest, Twitch, Spotify, Apple Music             |        24 |
| Editorial feeds and scores         | Google News, Medium, Substack, BBC News, CNN, ESPN, IMDb                |        26 |
| Storefronts                        | Steam, Amazon India, Flipkart, IKEA                                     |        16 |
| Travel search                      | Airbnb, Booking.com, Tripadvisor, Google Flights                        |        15 |
| Search, maps and translation       | Google Search, Google Maps, Apple Maps, Google Translate, OpenStreetMap |        19 |
| Code and model tools               | GitHub, GitLab, Hugging Face, CodeMirror                                |        16 |
| Creative workspaces and launchers  | Excalidraw, tldraw, Scratch, Notion, Canva, Photopea launcher           |        23 |
| Interactive tools                  | Lichess, Desmos, GeoGebra, TradingView, Monkeytype                      |        20 |
| Reference and component interfaces | MDN, Wikipedia, W3C, Radix Primitives, Observable Plot, Stack Overflow  |        24 |
| **Total**                          | **47 sites**                                                            |   **183** |

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
- Internet Archive's shadow-only candidates, npm's interstitial and Mermaid's incomplete application shell were excluded. Discovery observations and traces are documented in [the expansion rationale](research/site-coverage-expansion.md).

Reports distinguish passed, blocked, product-failed, contract-failed, environment-error, harness-error, unrun and stale. A site is fully verified only when **every current component** has qualifying acceptance. Disposable Playwright contexts keep test data separate from personal browser profiles. Commands, evidence requirements and compatible targeted-run aggregation are in [testing](testing.md).
