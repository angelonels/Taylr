# Foundation decisions

## 2026-10-21: Hide, first

The first release is a browser instrument: select an element, hide it, remember it on later visits, and reverse the action. The Arc research chat informed the interaction; the entire Boosts feature set is outside this milestone. Related-element selection and visual restyling are deferred.

TypeScript + Vite + Manifest V3 fit a small DOM tool without a UI runtime. A framework can be introduced when interface complexity warrants one. No server, account, telemetry, or remote data store is needed.

Rules belong to an exact origin (scheme, hostname, port), across its paths. Persistent site permission is requested only when Hide is invoked. Dynamic content scripts restore rules on later visits. Storage stays local. The background worker is the single writer to avoid lost updates across tabs.

Hiding uses a stylesheet rather than removing nodes or rewriting inline styles. This preserves the site's DOM ownership, naturally handles newly inserted matching elements, and lets Restore reveal the site's own styling. It cannot prevent network loading and is not an ad blocker or privacy boundary.

Selectors favor unique IDs and semantic attributes, then an exact structural path. A rule targets one element at creation. Structural paths can drift after a redesign or reordered list; they cannot promise to identify the same conceptual item forever. Broad matching is deferred rather than silently hiding related content. Closed shadow roots and iframe interiors are outside this first milestone. A unique iframe element itself can be hidden from its parent page.

The interface is quiet: a sage action color, system typography, persistent side panel, and a floating tool strip isolated in Shadow DOM. Hover selection and keyboard actions are instantaneous. Button presses use 120 ms transform feedback; reduced motion uses opacity feedback. The tool strip arrives with a 180 ms, 6 px ease-out; reduced motion uses a short fade. No disappear animation delays page reflow.

Incognito uses Chrome split mode with a separate `private-site:` namespace in session storage. Private rules survive reloads and new private tabs, but are memory-only and clear on browser restart or extension reload. Regular rules remain in local storage. Separate keys prevent the two workers from overwriting each other. Content scripts receive origin-scoped profile messages from the worker; session storage is not exposed to untrusted content contexts.

Undo records the exact ID returned by its own add request. Side-panel actions capture their origin and initialization revision so a delayed completion cannot repaint a newly selected site. Public-site tests refuse nonempty private profiles before taking ownership and cleaning up. Do not edit a test origin concurrently in private windows during a test run.
