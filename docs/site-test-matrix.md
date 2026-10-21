# Public-site regression matrix

This matrix grows with Taylr. A site earns its place by exercising a different DOM, rendering model, interaction, or content layout. Twenty sites are registered in `tests/sites.json`; each has six shared acceptance scenarios. Candidate selectors are contracts to validate, not evidence of compatibility.

## Shared scenarios for every site

| ID  | Scenario    | Required evidence                                                                                                                                                                           |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 | Baseline    | Exactly one visible target and visible content to retain; before screenshot. Missing or ambiguous selectors fail explicitly.                                                                |
| H02 | Hide        | Activate twice without duplicate controls; hide the selected component; retain page content and URL; hidden screenshot. Use parent-selection keys when a container has no exposed hit area. |
| H03 | Undo        | Restore the same component within the picker session; page stays usable.                                                                                                                    |
| H04 | Persistence | Hide again, finish, reload, then open another Incognito tab. The component stays hidden in both.                                                                                            |
| H05 | Restore     | Restore from the side panel. Both tabs recover; reloading does not hide the component again.                                                                                                |
| H06 | Exit        | Escape removes the picker without hiding more content. Save the panel screenshot and trace.                                                                                                 |

The live runner records completed checkpoints and a trace per site under `output/playwright/sites/<id>/`. The persistent session writes a timestamped pass/fail result under `output/playwright/session-results/`. An interrupted, challenged, or unrun site never counts as passed. There are 120 planned checkpoints, not 120 independently verified tests.

## Site portfolio

| Site                                                                      | Coverage reason                                  | Initial status | Site-specific probes to add as features grow                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [YouTube](https://www.youtube.com/)                                       | Video streaming · web components / SPA           | H01–H06 passed | SPA route changes; virtualized recommendation replacement; hide a web-component host without entering its shadow root. |
| [Wikipedia](https://en.wikipedia.org/wiki/Main_Page)                      | Encyclopedia · server-rendered content           | H01–H06 passed | Preserve article columns and navigation; test appearance changes and long article pages.                               |
| [GitHub](https://github.com/microsoft/vscode)                             | Code hosting · progressive navigation            | planned        | Repository tab navigation and progressive document replacement; keep code and issue content usable.                    |
| [Stack Overflow](https://stackoverflow.com/questions)                     | Technical Q&A · dense navigation                 | planned        | Dense sidebar / question-column reflow; preserve voting and answer controls without activating them.                   |
| [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Document) | API reference · documentation shell              | planned        | Sticky documentation navigation, article anchors, and nested section selection.                                        |
| [Google Search](https://www.google.com/search?q=web+standards)            | Search · dynamic result composition              | planned        | Dynamically rendered result groups, consent variants, and query navigation.                                            |
| [BBC News](https://www.bbc.com/news)                                      | News publication · responsive editorial layout   | planned        | Responsive masthead and editorial grids; preserve article text and image captions.                                     |
| [Hacker News](https://news.ycombinator.com/)                              | Social news · legacy table layout                | planned        | Table-row targeting, compact hit areas, and preservation of adjacent story rows.                                       |
| [Reddit](https://www.reddit.com/r/programming/)                           | Community feed · custom elements                 | planned        | Custom-element host selection, lazy feed replacement, and open versus closed shadow boundaries.                        |
| [Amazon India](https://www.amazon.in/s?k=notebook)                        | Retail storefront · personalized catalog shell   | planned        | Repeated result cards, sticky navigation, regional variants, and keeping unrelated results visible.                    |
| [eBay](https://www.ebay.com/sch/i.html?_nkw=notebook)                     | Marketplace · filtered search listings           | planned        | Result filters, catalog pagination, and repeated item layouts.                                                         |
| [Etsy](https://www.etsy.com/search?q=notebook)                            | Craft marketplace · image-heavy commerce         | planned        | Image-heavy masonry layouts, responsive navigation, and lazy listings.                                                 |
| [OpenStreetMap](https://www.openstreetmap.org/)                           | Interactive map · persistent canvas              | planned        | Retain map canvas, pan and zoom; restore overlays without changing map data.                                           |
| [Discourse Meta](https://meta.discourse.org/)                             | Forum · client-rendered application              | planned        | Client navigation, sticky headers, and newly rendered topic lists.                                                     |
| [Twitch](https://www.twitch.tv/directory)                                 | Live streaming · React application               | planned        | Dynamic directory tiles, persistent navigation, and live layout changes without playing streams.                       |
| [IMDb](https://www.imdb.com/chart/top/)                                   | Entertainment database · ranked catalog          | planned        | Ranked-list rows, responsive navigation, and entertainment metadata.                                                   |
| [npm](https://www.npmjs.com/package/typescript)                           | Package registry · technical catalog             | planned        | Long README content, sticky package metadata, and package-version navigation.                                          |
| [Can I use](https://caniuse.com/css-grid)                                 | Compatibility data · interactive matrix          | planned        | Compatibility tables, filters, and preservation of readable comparison data.                                           |
| [Internet Archive](https://archive.org/details/texts)                     | Digital archive · mixed custom-element interface | planned        | Custom-element navigation hosts, mixed legacy / modern DOM, and collection pagination.                                 |
| [Project Gutenberg](https://www.gutenberg.org/)                           | Ebook library · static semantic pages            | planned        | Static semantic HTML, book listings, and long text reflow.                                                             |

## Growth policy

Before adding a site, state which failure mode it adds that the current set does not cover. Use public read-only pages and explicit target contracts. Record a baseline screenshot before declaring a selector stable. Never loosen a selector until the test passes: an ambiguous target is a test-contract failure that needs inspection.

New features get new scenario IDs in this document, an executable scenario, and a list of applicable site IDs. Keep unsupported capabilities explicit. Closed shadow roots, iframe interiors, and site redesign resilience have not been claimed for Hide v0.1.

Do not bypass CAPTCHAs, login walls, paywalls, or security interstitials. Record these as blocked with the visible reason. Distinguish access blocks, selector-contract drift, extension defects, and browser-connection failures in the run notes. Do not add retries to conceal a failing assertion.

Baseline policies are deliberately strict. Some candidate sites may require revised selectors after their first observed DOM review; until then they stay planned. YouTube and Wikipedia passed H01–H06 on 2026-10-21 in the approved Chrome profile’s Incognito context. Evidence for each: `output/playwright/sites/<id>/{before.png,hidden.png,panel.png,trace.zip,checks.json}` and `output/playwright/session-results/<id>.json`. Other sites remain planned until an observed run establishes their baseline and results.
