# Taylr working agreements

- The user explicitly authorizes clicking Allow on Chrome remote-debugging prompts during development in the approved profile. Do not ask them repeatedly. Reuse one persistent connection; do not silently weaken browser protections.
- Maintain tests/sites.json and docs/site-test-matrix.md as a growing public-site regression matrix. Keep planned, blocked, and verified coverage distinct.
- Prefer terminal, APIs, CDP, and equivalent developer interfaces. Use computer interaction only when the action cannot be completed through an available programmatic surface.
- Browser access is limited to the built-in Codex browser or Chrome profile angelonelson.dev@gmail.com. Never inspect or open other Chrome profiles without the user's confirmation. Use an Incognito window of the approved profile for browser development and testing.
- Keep the codebase small and clean. Document decisions, intent, and constraints that cannot be inferred from the implementation; avoid duplicate code walkthroughs.
- Use literal feature names for now. Actions use crisp verbs (prefer one syllable); artifacts use concrete nouns; CSS properties retain their standard names. Primary tools have one word, at most two. Each name owns a distinct capability. Keep UI labels separate from technical types and storage namespaces. Before naming: classify action/artifact/property, check clarity in a sentence, and verify the parent-child hierarchy. Current terms: **Hide**, **Rule**, **Site profile**. Taylr is the brand; tailoring metaphors are reserved for a later explicit decision.
- Use apple-design, design, and animate for interface work. Prioritize immediate response, clear feedback, restraint, reversible actions, keyboard access, and reduced motion.
- Prefer E2E as the sole test mechanism. Write failure scenarios before implementation. Never add unit tests after writing code. If isolated testing is essential, list failure modes first, then implement. Every E2E run must produce repeatable evidence such as a trace and report.
- Keep generated builds, test reports, and browser/profile data out of Git. Work on a focused branch; review changes before committing. Never commit secrets or unrelated user changes.

Private rules are isolated in session storage; regular rules stay local. Test runs never reload the extension. An explicit development reload clears private rules; finish private customization work first.
