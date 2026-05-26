---
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
---

## Why this stack

Solo developer building a flashcard MVP over 5 after-hours weeks. 10xCards needs auth (FR-001), AI-driven flashcard generation (FR-002), a database for user sets and spaced-repetition history, and responsive web delivery. The recommended default for `(web-app, js)` is `10x-astro-starter`: Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages. Supabase handles auth and PostgreSQL out of the box, removing two must-have integrations from the scaffolding list. All four agent-friendly gates pass (typed, convention-based, popular in training data, well-documented), making the stack smooth for AI-assisted development. Bootstrapper confidence is first-class. CI runs on GitHub Actions with auto-deploy-on-merge — the simplest path to shipping the first iteration quickly.
