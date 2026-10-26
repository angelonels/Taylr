# Product constraints

## Scope and architecture

Taylr selects, edits, hides and restores individual page elements. Bulk matching is deferred. Rules belong to an exact origin across its paths. Stylesheets change appearance without modifying site-owned inline styles; hiding does not prevent network loading.

The Manifest V3 worker serializes profile writes. Ordered broadcasts are authoritative; mutation replies cannot overwrite newer state. Each controller belongs to its document and origin. Hide Undo owns session-created IDs; Edit Undo checks the saved revision before restoring its prior rule, preserving newer changes from other tabs. A revision conflict discards only that rule’s stale session history, so earlier unrelated Undo entries remain reachable; transient failures retain their entries.

Stylesheet replacement keeps both old and desired sheets in memory after an API failure, since a failed reply can follow a successful insertion or removal. Retrying an uncertain string first removes its possible copy, preventing duplicate USER sheets; the next successful render removes obsolete sheets and clears its error. Cancel must not leave a failed draft behind, and Resume must restore Hide after an uncertain Pause.

Edit drafts remain transient until Save. Only changed properties are merged into the latest saved rule, retaining entered units and unrelated declarations. The shared property/value allowlist prevents CSS rule escape; browser validation rejects unsupported values. Reset discards one property draft. Leaf text retains existing text nodes and site-owned nested controls; repeated site contention stops text reapplication. Edits restores saved changes. See [implementation research](research/element-editing.md).

Everyday editing uses percentage sliders, numeric steppers and labeled choices. Advanced is opt-in for size and spacing; gaps appear only for existing rows/grids. Display and layout-mode controls are absent from the UI; existing saved declarations stay compatible.

The React/TypeScript/Tailwind panel loads on demand in a Shadow DOM manual popover. The panel and picker overlay follow the active native modal or fullscreen subtree, preserving input access through top-layer transitions and dialog removal. Selection and restoration remain framework-free. The movable vertical panel overlays the page without reserving width. Its translucent charcoal tint, frosted backdrop and glass controls let website colors and shapes remain visible beneath the panel. Neutral glass controls and a single blue accent establish the hierarchy. Blue consistently marks selection, focus and changed fields; green indicates success and red indicates errors. Section headings use plain text. Opening offers Edit as the primary action and Hide as a separate choice; neither tool starts automatically. Picking, editing and saved states expose the next action. Cancel restores focus to the initiating control, and paused sites offer Resume directly. Backdrop dimming preserves text contrast without an opaque shell. Tools occupy a separate scrollable group so future actions can grow without replacing the header or detail region. Position, input modality and disclosures remain transient; no UI preferences are persisted.

Pointer presses give immediate feedback; disclosure transitions use transform/opacity. Keyboard actions are immediate. Drag tracks the pointer and release uses bounded, interruptible springs. Reduced motion removes travel; reduced transparency and increased contrast use solid surfaces. The UIArc Select uses a native non-modal popover with arrow keys, typeahead and focus restoration; opening it never locks or hides the website. Accordion retains Radix semantics inside the extension shadow root. ColorPicker keeps hue precision separately from 8-bit output and uses a native top-layer popover. Escape dismisses an active control before leaving the editor. Labels, visible focus, cancellation, Undo and Restore remain available.

## Access and privacy

Installation requests HTTP/HTTPS host access. Toolbar opening checks the grant without requesting per-site permission. Chrome restrictions and website access challenges are separate conditions. Pause restores native styles, text and visibility across the origin’s open tabs while retaining rules; Resume reapplies them. Chrome’s settings control browser access.

Startup pins injection to the observed document and retries a transient same-origin context race once. Cross-origin navigation requires a fresh action. Recovery preserves the action’s desired state and never reloads a page automatically.

Regular profiles stay in local storage. Incognito uses split mode and a separate session-storage namespace. Private rules, previews and pause settings follow [Chrome’s session-storage lifetime](https://developer.chrome.com/docs/extensions/reference/api/storage#session): browser restart or extension reload clears them. Content scripts receive origin-scoped messages; session storage stays inaccessible to untrusted contexts. No server, account, telemetry or remote screenshots are used.

## Selection and identity

Trusted native input is required for selection and dock mutations. Button glyphs target their control by default; explicit Child refinement can select the graphic. Parent traversal remembers the selected child. Native Tab follows focus; explicit hierarchy refinement survives website focus changes. Cancel abandons a pending preview before storage mutation; a mutation already sent remains reversible through Edits.

A non-hit-testable pointer capture target shields picking from earlier page click routers without covering the page or intercepting nested scrolling. Lost capture cancels the gesture; Escape preserves its click shield until release. Earlier imperative pointerdown side effects cannot be reversed. Replaced editor targets clear with a prompt to pick again; temporarily hidden, connected drafts remain available.

Selectors prefer unique semantic attributes, stable IDs and unique content links before exact structural paths. Image selectors retain non-empty alternative text through card anchors; repeated sibling images use [filtered sibling positions](https://www.w3.org/TR/selectors/#the-nth-child-pseudo) so differently described placeholders do not shift their identity. Generated identifiers cannot anchor persistence. A new rule matches exactly one node. Structural paths may drift after a website redesign. Shadow-root and iframe interiors remain unsupported; an iframe host can itself be hidden.

Link-based containers retain the actual child chain to their content link, distinguishing nested recommendations that repeat the same URL. Moving an intact card between sections preserves identity; changing that internal chain can invalidate its selector.

Link identity preserves content query parameters and fragments. Narrow attribution exceptions cover known tracking tokens, YouTube watch `pp` when a video ID exists, and Flipkart impression/session tokens when product path and SKU identify the item. These exceptions must retain distinct variants and unrelated-origin negative controls. [Flipkart identity reference](https://affiliate.flipkart.com/api-docs/af_prod_ref.html)

## Previews

Previews show actual native browser pixels. The full screenshot is transient; only a bounded visible component crop may be persisted. Active tab, document, URL, geometry, viewport and scroll must stay valid throughout capture. Capture queues respect Chrome’s rate limit and have bounded deadlines. Preview failure or quota pressure falls back to text without blocking Hide. Preview eviction and the saved action commit together; a failed quota recovery leaves unrelated profiles intact.

Images retain source detail within 1024 × 768 pixels and approximately 256KiB. A canvas displays decoded pixels under restrictive site image CSP. Private previews follow private-rule storage. Expanded previews support keyboard inspection. See [capture rationale](research/component-previews.md).

## Verification

E2E runs own disposable Chromium, temporary profiles and browser-owned fixtures. Evidence fingerprints distinguish build, harness, contract and environment. Public-site coverage requires the exact declared component and all six checkpoints; blocks remain unverified. See [testing](testing.md) and [the matrix](site-test-matrix.md).
