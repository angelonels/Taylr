# Product constraints

## Scope and architecture

Taylr selects, hides and restores individual page elements. Bulk matching and visual restyling are deferred. Rules belong to an exact origin across its paths. A stylesheet hides nodes without taking ownership of the website’s DOM or inline styles; hiding does not prevent network loading.

The Manifest V3 worker serializes profile writes. Ordered broadcasts are authoritative; mutation replies cannot overwrite newer state. Each controller belongs to its document and origin. Undo owns the exact rule IDs created by its selection session.

The React/TypeScript/Tailwind panel loads on demand in a Shadow DOM manual popover. Selection and restoration remain framework-free. The movable vertical panel overlays the page without reserving width. Its smoked dark glass, raised controls and coral selection state provide hierarchy over arbitrary website content. Tools occupy a separate scrollable group so future actions can grow without replacing the header or detail region. Position, input modality and disclosures remain transient; no UI preferences are persisted.

Pointer presses give immediate feedback; disclosure transitions use transform/opacity. Keyboard actions are immediate. Drag tracks the pointer and release uses bounded, interruptible springs. Reduced motion removes travel; reduced transparency and increased contrast use solid surfaces. Labels, visible focus, cancellation, Undo and Restore remain available.

## Access and privacy

Installation requests HTTP/HTTPS host access. Toolbar opening checks the grant without requesting per-site permission. Chrome restrictions and website access challenges are separate conditions. Pause reveals elements across the origin’s open tabs while retaining rules; Resume reapplies them. Chrome’s settings control browser access.

Startup pins injection to the observed document and retries a transient same-origin context race once. Cross-origin navigation requires a fresh action. Recovery preserves the action’s desired state and never reloads a page automatically.

Regular profiles stay in local storage. Incognito uses split mode and a separate session-storage namespace. Private rules, previews and pause settings clear on browser restart or extension reload. Content scripts receive origin-scoped messages; session storage stays inaccessible to untrusted contexts. No server, account, telemetry or remote screenshots are used.

## Selection and identity

Trusted native input is required for selection and dock mutations. Button glyphs target their control by default; explicit Child refinement can select the graphic. Parent traversal remembers the selected child. Native Tab follows focus; explicit hierarchy refinement survives website focus changes. Cancel abandons a pending preview before storage mutation; a mutation already sent remains reversible through Rules.

Selectors prefer unique semantic attributes, stable IDs and unique content links before exact structural paths. Generated identifiers cannot anchor persistence. A new rule matches exactly one node. Structural paths may drift after a website redesign. Shadow-root and iframe interiors remain unsupported; an iframe host can itself be hidden.

Link identity preserves content query parameters and fragments. Narrow attribution exceptions cover known tracking tokens, YouTube watch `pp` when a video ID exists, and Flipkart impression/session tokens when product path and SKU identify the item. These exceptions must retain distinct variants and unrelated-origin negative controls. [Flipkart identity reference](https://affiliate.flipkart.com/api-docs/af_prod_ref.html)

## Previews

Previews show actual native browser pixels. The full screenshot is transient; only a bounded visible component crop may be persisted. Active tab, document, URL, geometry, viewport and scroll must stay valid throughout capture. Capture queues respect Chrome’s rate limit and have bounded deadlines. Preview failure or quota pressure falls back to text without blocking Hide.

Images retain source detail within 1024 × 768 pixels and approximately 256KiB. A canvas displays decoded pixels under restrictive site image CSP. Private previews follow private-rule storage. Expanded previews support keyboard inspection. See [capture rationale](research/component-previews.md).

## Verification

E2E runs own disposable Chromium, temporary profiles and their fixture server. Evidence fingerprints distinguish build, harness, contract and environment. Public-site coverage requires the exact declared component and all six checkpoints; blocks remain unverified. See [testing](testing.md) and [the matrix](site-test-matrix.md).
