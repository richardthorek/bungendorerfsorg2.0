# Documentation Index

A map of all project documentation so you can jump straight to the right file instead
of scanning the tree. Authoritative conventions live in
[`../.github/copilot-instructions.md`](../.github/copilot-instructions.md); project
orientation for AI agents lives in [`../CLAUDE.md`](../CLAUDE.md).

## Planning & process

| Doc | Purpose |
|-----|---------|
| [`../master_plan.md`](../master_plan.md) | Single source of truth for in-flight work. Update for any non-trivial change. |
| [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md) | Conventions, branching, build/CI, coding standards, security rules. |
| [`../README.md`](../README.md) | Project overview, setup, and — for content editors — how to change the BFDP dates, events, and training schedule without touching code. |

## Architecture & integration

| Doc | Purpose |
|-----|---------|
| [`API_INTEGRATION.md`](API_INTEGRATION.md) | Azure Functions / Logic Apps proxy layer, endpoints, integration details. |
| [`CSS_OPTIMIZATION.md`](CSS_OPTIMIZATION.md) | CSS architecture and design-token conventions for `public/css/main.css`. |
| [`ASSET_ORGANIZATION.md`](ASSET_ORGANIZATION.md) | Image/icon/favicon organisation. |
| [`TESTING.md`](TESTING.md) | Jest + Testing-Library patterns and guidance. |

## UI / UX — current state

| Doc | Purpose |
|-----|---------|
| [`current_state/ui-baseline.md`](current_state/ui-baseline.md) | Quantified baseline the "Command Centre" redesign (issue [#56](https://github.com/richardthorek/bungendorerfsorg2.0/issues/56)) was measured against, plus the DOM-ID contract for JS reading the live status strip. |
| [`current_state/ui-redesign.md`](current_state/ui-redesign.md) | Target-state spec and per-phase acceptance criteria for the redesign. This is the authoritative UI/UX intent doc — treat it as current, not historical. |
| [`current_state/wireframe/index.html`](current_state/wireframe/index.html) | Self-contained interactive wireframe (open directly in a browser). |

## Historical (audit trail — do not treat as current state)

| Doc | Purpose |
|-----|---------|
| [`../SECURITY_FIXES.md`](../SECURITY_FIXES.md) | Security remediation log for the critical/high findings closed out early 2026. Kept at root for visibility. |
| [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) | Change log for the same remediation pass (error handling, testing, CI/CD, docs). Do not modify — it's a record of what shipped, not a live doc. |

## Security

See [`../SECURITY_FIXES.md`](../SECURITY_FIXES.md) above.
