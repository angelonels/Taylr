# Taylr working agreements

- Automated tests must launch disposable Playwright Chromium with temporary data. Never connect tests to personal Chrome profiles or running personal browser sessions. No CDP broker or personal-profile permission prompts.
- Maintain tests/sites.json and docs/site-test-matrix.md as a growing public-site regression matrix. Keep planned, blocked, and verified coverage distinct.
- Prefer terminal, APIs, CDP, and equivalent developer interfaces. Use computer interaction only when the action cannot be completed through an available programmatic surface.
- For manual browser access, use the built-in Codex browser or an Incognito window of Chrome profile angelonelson.dev@gmail.com only. Never inspect other personal profiles. The user explicitly authorized disposable Playwright browser instances for automated testing; they must not use existing profile data.
- If manual remote debugging is necessary, the user authorizes clicking Allow. Reuse one connection, preserve browser protections, and never introduce remote-debugging prompts into automated tests.
- Keep the codebase small and clean. Document decisions, intent, and constraints that cannot be inferred from the implementation; avoid duplicate code walkthroughs.
- Use literal feature names for now. Actions use crisp verbs (prefer one syllable); artifacts use concrete nouns; CSS properties retain their standard names. Primary tools have one word, at most two. Each name owns a distinct capability. Keep UI labels separate from technical types and storage namespaces. Before naming: classify action/artifact/property, check clarity in a sentence, and verify the parent-child hierarchy. Current terms: **Hide**, **Rule**, **Site profile**. Taylr is the brand; tailoring metaphors are reserved for a later explicit decision.
- Use apple-design, design, and animate for interface work. Prioritize immediate response, clear feedback, restraint, reversible actions, keyboard access, and reduced motion.
- Prefer E2E as the sole test mechanism. Write failure scenarios before implementation. Never add unit tests after writing code. If isolated testing is essential, list failure modes first, then implement. Every E2E run must produce repeatable evidence such as a trace and report.
- Keep generated builds, test reports, and browser/profile data out of Git. Work on a focused branch; review changes before committing. Never commit secrets or unrelated user changes.

Private rules are isolated in session storage; regular rules stay local. Test runs never reload the extension. An explicit development reload clears private rules; finish private customization work first.

The movable floating in-page toolbar is purely operational, using smoked obsidian glass with iris actions and coral selection feedback. It must never reserve page width. Marketing copy, taglines, and use cases belong to the future landing page. Maintain at least 30 deliberately selected modern, challenging sites, with multiple distinct component contracts per site. Website count alone is not coverage.

Use React with TypeScript and Tailwind CSS for the floating dock. Keep the injected picker light and isolated. Save subagent review for the end of implementation/testing, then fix and rereview until no actionable findings remain.

Rule previews capture actual component pixels, stay on-device, and are temporary in private mode. Preview failure must never block Hide. Only cropped previews may be persisted.
