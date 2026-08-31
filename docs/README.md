# Documentation Index

A map of all project documentation so you can jump straight to the right file
instead of scanning the tree. The authoritative conventions live in
[`../.github/copilot-instructions.md`](../.github/copilot-instructions.md); the
lean per-session orientation for Claude Code lives in
[`../CLAUDE.md`](../CLAUDE.md). Those two are kept in lock-step — the rulebook is
the full version, `CLAUDE.md` is a subset with pointers.

## Planning & process

| Doc | Purpose |
|-----|---------|
| [`../master_plan.md`](../master_plan.md) | Single source of truth for in-flight work. Update for any non-trivial change. |
| [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md) | Conventions, branching, build/CI, coding standards, security rules. |
| [`../CLAUDE.md`](../CLAUDE.md) | Lean session orientation for AI agents (subset of the above). |
| [`../README.md`](../README.md) | Project overview, setup, and — for content editors — how to change BFDP dates, events, and the training schedule without touching code. |

## Architecture & integration

| Doc | Purpose |
|-----|---------|
| [`API_INTEGRATION.md`](API_INTEGRATION.md) | The proxy layer end to end: every endpoint, the Logic Apps fire feeds, the Azure OpenAI request contract (Social Studio), and the Microsoft Clarity export integration (Analytics). |
| [`../api/README.md`](../api/README.md) | Function-by-function reference + the full env-var table. |
| [`../infra/README.md`](../infra/README.md) | What `infra/main.bicep` provisions — and what is portal-managed instead. |
| [`CSS_OPTIMIZATION.md`](CSS_OPTIMIZATION.md) | CSS architecture, design tokens, and the record of the dead-code sweeps on `main.css`. |
| [`TESTING.md`](TESTING.md) | Jest + Testing-Library patterns, including how to test the shared `api/shared/` handlers. |

## UI / UX — the "Command Centre" redesign (programme closed Aug 2026)

The redesign shipped and its tracking issues (#56–#63) are closed. These are the
**as-built** reference, not a work order.

| Doc | Purpose |
|-----|---------|
| [`current_state/ui-redesign.md`](current_state/ui-redesign.md) | The as-built composition and per-area intent for the home page. |
| [`current_state/ui-baseline.md`](current_state/ui-baseline.md) | The pre-redesign baseline it was measured against, plus §5 — the canonical DOM-ID contract for JS reading/writing the live status strip (still current; the rest is a historical snapshot). |
| [`current_state/wireframe/index.html`](current_state/wireframe/index.html) | Self-contained interactive wireframe (open directly in a browser). |

The numeric verification (Lighthouse, axe-core, the last of the CSS target) was
never run — see `master_plan.md` for what was consciously deferred.

## Security

| Doc | Purpose |
|-----|---------|
| [`../SECURITY_FIXES.md`](../SECURITY_FIXES.md) | Remediation log. The early-2026 entries (Logic Apps proxy, XSS, mapbox origin validation) are historical; an August 2026 members'-area review is appended at the top. Still added to as reviews happen. |
