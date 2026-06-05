<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Quality strategy as a rules-file (lesson focus)** | |
| `/10x-test-plan` | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status` | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time. |
| `/10x-test-plan --refresh` | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place. |

### Rollout chain — what happens after the guide is written

The guide's §3 *Phased Rollout* table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk | Next handoff | Status transitions to |
| --- | --- | --- |
| change folder missing | `/10x-new <change-id>` | `change opened` |
| `change.md` only | `/10x-research` (with a risks-to-verify brief) | `researched` |
| `+ research.md` | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned` |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` fully `[x]` | Mark §3 row `complete`; loop to next pending row | — |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites *evidence that raised the risk*, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

---

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt | Use it when |
| --- | --- |
| `/10x-research` | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real). |
| `/10x-plan` | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches. |
| `/10x-implement` | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code. |
| `/10x-tdd` | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point. |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: *Can you name the first red test in one sentence?*

Good conditions for `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer | When to use | When NOT to use |
| --- | --- | --- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client) | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails). | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades. |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code *should* do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern | How it looks | What to do instead |
| --- | --- | --- |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only | Tests only pass valid inputs; edge cases absent. | Add at least one edge case per risk: `null`, empty, dependency error, invalid input. |
| Redundant copies | Six nearly identical tests checking the same absence of a sentinel. | One parameterised test (`it.each`) per property; each test catches a different regression. |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:
1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `the AI tool's configuration directory/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

---

## 10xDevs AI Toolkit - Module 3, Lesson 3

Lesson 3 is about **hooks** — turning the quality gates from Lesson 1 and the tests from Lesson 2 into automatic, deterministic checks that fire while the agent works. A hook runs outside the model, so it survives context compression, instruction changes, and the model "forgetting". The payoff for agentic hooks specifically: a `PostToolUse` check can feed its result back into the agent's context, so the agent fixes trivial errors (formatting, a missing import, a wrong type) on its own in the next iteration instead of you discovering them minutes later.

```
context/foundation/test-plan.md  (§4 Quality Gates: which check, required when)
        │
        ▼  (assign each gate to the cheapest layer that still gives signal)
   per-edit (agent hooks)  →  pre-commit (git hooks)  →  pre-push  →  CI
        │ lint, format, scoped tests          │ staged       │ heavier    │ integration
        ▼
   exit code + stdout  →  additionalContext  →  agent reacts next turn
```

### Task Router — Which layer for this check

| You want to | Do this |
| --- | --- |
| React the instant the agent edits a file | A per-edit hook (`PostToolUse` matcher `Write\|Edit` in your AI coding assistant). Right for fast checks: lint/format, and scoped tests on risk-area files. This is the **only** layer that can hand feedback to the agent mid-session. |
| Run only the tests that depend on the edited file | Parse the path from the hook's stdin (`jq -r .tool_input.file_path`) and run your runner's related-tests mode (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Gate it on whether the file is a risk area in `test-plan.md`; don't run tests on every helper or config edit. |
| Catch changes that bypassed the agent (manual edits, a teammate's commit) | A pre-commit git hook (Lefthook or Husky+lint-staged) over staged files: lint + typecheck, and tests on staged risk files. |
| Run heavier checks before code leaves the machine | Pre-push: full typecheck or a broader test set. Anything too slow for per-edit moves here. |
| Decide where a given gate belongs | Ask: is it fast enough (a few seconds) for per-edit, or should it wait for commit/push/CI? Slow checks block the agent loop on every edit — push them up a layer. |
| Use the same hook across tools | The trigger → matcher → handler → signal pattern is the same in Cursor, Codex, Windsurf, and Copilot; only the config file and event names change. See the cross-tool table below. |

### Hook lifecycle — the universal pattern

Every tool's hooks follow four steps:

1. **Trigger** — an event in the tool (e.g. the agent just saved a file: `PostToolUse`).
2. **Matcher** — a filter deciding whether this hook runs (tool name like `Write`/`Edit`, file type, or a name pattern).
3. **Handler** — the action that runs, usually a shell command.
4. **Signal** — the result returns to the tool. The exit code says pass/fail; stdout can flow into the agent's context as feedback.

### Exit codes and the feedback loop

- **0** — success; the hook passed, continue.
- **2** — blocking error; the agent sees the feedback and should react.
- **anything else** — non-blocking error; logged, but does not interrupt work.

On a blocking failure, stdout flows into the agent's context (in your AI coding assistant via `additionalContext`, capped at 10,000 characters; other tools have similar mechanisms with their own limits). That is why the agent can self-correct: it sees the concrete message — missing type, unimported module, badly formatted line — not just "something failed".

The boundary: the agent reliably fixes **trivial** corrections on its own. When a test fails because of wrong business logic, the hook surfaces it but the agent may not diagnose the real cause — it says "something is off" and tries a trivial fix. If that does not resolve in one or two tries, the signal comes back to you, and the problem may deserve its own change-id with the full `/10x-new → /10x-research → /10x-plan → /10x-implement` workflow.

### Three local layers (plus CI)

| Layer | Catches | Timing |
| --- | --- | --- |
| Per-edit (agent hooks) | Formatting, simple type errors, failing unit tests on risk files. Only layer that feeds the agent mid-work. | ms–s |
| Pre-commit (git hooks) | What slipped past per-edit: manual edits, files changed outside the hook, checks too slow for per-edit. Operates on staged files. | s |
| Pre-push | Heavier checks before pushing to remote (full typecheck, broader test set). | s–min |
| CI | Integration problems, cross-module dependencies, checks needing infra unavailable locally. | min |

Local layers do **not** replace CI — CI stays the key verification for shared repo state and environments you don't control. But each local layer that catches an error is one fewer CI round-trip. You don't need all layers from day one: start with one per-edit hook (lint) and one commit gate, add layers as you see what escapes. The quality gates in `test-plan.md §4` decide which checks are worth automating and at which layer; a plan may legitimately defer per-edit hooks if the cost/signal ratio isn't there yet.

### Key rules

- Keep per-edit hooks fast. If a check takes more than a few seconds, move it to commit, push, or CI — a slow per-edit hook blocks the agent loop on every edit. Lint/format are ideal per-edit; full typecheck is often a commit gate in larger projects.
- Run scoped tests, not the whole suite, per edit — only tests related to the edited file, and only when that file is a risk area in `test-plan.md`.
- `related` is a subcommand, not a flag (`vitest related`, not `--related`). Use `--run` so the hook terminates instead of entering watch mode.
- `PostToolUse` fires once per tool use; three edits in one turn fire it three times independently — there is no built-in aggregation.
- The git hook tool (Lefthook vs Husky+lint-staged) is an implementation detail; the rule is the same — run checks on staged files before commit. If Husky already works, don't migrate.
- **Context injection is not universal.** Your AI coding assistant, Cursor, Codex, and Copilot (in VS Code) can pass a hook's result to the agent; Windsurf cannot — it can block (exit 2) but can't tell the agent what went wrong.

### The same pattern in every tool

| Tool | Events | Handlers | Context injection | Config |
| --- | --- | --- | --- | --- |
| Your AI coding assistant | ~30 | command, http, mcp_tool, prompt, agent | yes | `the AI tool's configuration directory/settings.json` |
| Cursor | ~18 | command, prompt | yes | `.cursor/hooks.json` |
| Codex | 10 | command | yes | `.codex/hooks.json` |
| Windsurf | 12 | command | **no** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | yes (VS Code) | `.github/hooks/*.json` |

### Lesson boundaries

- This lesson configures hooks and local quality layers only. The hook JSON, `lefthook.yml`, and the per-edit/commit/push layering are the scope.
- Do not write E2E tests, configure Playwright/MCP, or run browser scenarios. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test debugging workflow. That is Lesson 5.
- Do not change the risk strategy or quality-gate definitions. That is Lesson 1 (`/10x-test-plan`); read current state with `/10x-test-plan --status`.
- Do not write unit/integration test code from scratch here. That is Lesson 2 — hooks only *run* the tests those lessons produced.
- Do not author CI/CD pipelines. That is Module 1 Lesson 5 / Module 2 Lesson 5; hooks are the local layers in front of CI.

### Paths used by this lesson

- `the AI tool's configuration directory/settings.json` — hook configuration (`~/.claude/settings.json` global, `the AI tool's configuration directory/settings.json` project, `the AI tool's configuration directory/settings.local.json` local overrides). Other tools use their own config file (see the table).
- `lefthook.yml` — pre-commit git hook config (lint + typecheck + tests on `{staged_files}`).
- `context/foundation/test-plan.md` — §4 quality gates decide which checks to automate and at which layer; risk areas decide which edits warrant scoped tests.

---

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
