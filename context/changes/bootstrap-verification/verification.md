---
bootstrapped_at: 2026-05-27T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo developer building a flashcard MVP over 5 after-hours weeks. 10xCards needs auth (FR-001), AI-driven flashcard generation (FR-002), a database for user sets and spaced-repetition history, and responsive web delivery. The recommended default for `(web-app, js)` is `10x-astro-starter`: Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages. Supabase handles auth and PostgreSQL out of the box, removing two must-have integrations from the scaffolding list. All four agent-friendly gates pass (typed, convention-based, popular in training data, well-documented), making the stack smooth for AI-assisted development. Bootstrapper confidence is first-class. CI runs on GitHub Actions with auto-deploy-on-merge — the simplest path to shipping the first iteration quickly.

---

## Pre-scaffold verification

| Signal      | Value                                      | Severity | Notes                                           |
| ----------- | ------------------------------------------ | -------- | ----------------------------------------------- |
| npm package | not run                                    | —        | cmd_template uses `git clone`; npm check skipped |
| GitHub repo | not run                                    | —        | `gh` not installed; recency check unavailable   |

---

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: append-merged (cwd `.claude/*` preserved; starter entries appended under `# from 10x-astro-starter` separator)
**.bootstrap-scaffold cleanup**: deleted

---

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — range 5.6.3–5.8.0 — GHSA-77vg-94rm-hx3p — "Svelte devalue: DoS via sparse array deserialization" — CVSS 7.5 — fix available (update devalue)

#### MODERATE findings

Direct:
- **@astrojs/check** ≥0.9.3 — via @astrojs/language-server — fix: downgrade to 0.9.2 (semver-major break)
- **wrangler** 3.108.0–4.93.0 — via miniflare → ws — fix available

Transitive:
- **@astrojs/language-server** ≥2.14.0 — via volar-service-yaml
- **@cloudflare/vite-plugin** ≤0.0.0-fff677e35 || 0.0.7–1.37.2 — via miniflare, wrangler, ws
- **miniflare** — via ws
- **volar-service-yaml** ≤0.0.70 — via yaml-language-server
- **ws** 8.0.0–8.20.0 — GHSA-58qx-3vcg-4xpx — "Uninitialized memory disclosure" — CVSS 4.4
- **yaml** 2.0.0–2.8.2 — GHSA-48c2-rrv3-qjmp — "Stack Overflow via deeply nested YAML" — CVSS 4.3
- **yaml-language-server** — via yaml

#### LOW / INFO findings

None.

---

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | true               |
| has_background_jobs     | false              |

These fields were read from the hand-off and preserved in this log. No automated action was taken on them in bootstrapper v1. CI/CD scaffolding, CLAUDE.md/AGENTS.md generation, and feature-flag-aware scaffold modifications are deferred to a future skill.

---

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the starter ships its own agent rules file; merge the relevant parts into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- Copy `.env.example` to `.env` (Node dev) or `.dev.vars` (Cloudflare local dev) and fill in `SUPABASE_URL` and `SUPABASE_KEY`.
- Run `npx supabase start` (requires Docker) to start a local Supabase instance.
