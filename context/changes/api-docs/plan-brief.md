# Add Interactive API Documentation with Scalar — Plan Brief

> Full plan: `context/changes/api-docs/plan.md`

## What & Why

Add an interactive API documentation page using Scalar so developers can browse, understand, and test all 10xCards endpoints directly from the app. Currently there is no API documentation at all.

## Starting Point

The project has 20+ working API endpoints with Zod validation, but no discoverable documentation or interactive client.

## Desired End State

A `/docs/api` page renders a full Scalar API reference with all endpoints, schemas, and auth requirements. The OpenAPI spec lives as a TypeScript object in the codebase, staying in sync with implementation changes.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Doc tool | Scalar (`@scalar/astro`) | Modern UI, official Astro integration, interactive client | Plan |
| Spec format | Inline TypeScript object (`as const`) | No extra build step, easy to edit, type-safe | Plan |
| Spec source | Manual spec file | Zod-to-OpenAPI runtime generation is too complex for MVP | Plan |
| Auth in docs | Documented but not testable from Scalar UI | Cookie auth can't be passed from the docs UI directly | Plan |

## Scope

**In scope:** OpenAPI 3.1.0 spec for all existing endpoints, Scalar docs page, build/lint verification.

**Out of scope:** Auto-generation from Zod schemas, Scalar auth flow, protecting the docs route.

## Architecture / Approach

Single `openApiSpec` object in `src/lib/openapi/openapi-spec.ts` → imported by `src/pages/docs/api.astro` → rendered by `@scalar/astro`'s `ScalarComponent`. No build step for the spec — it's just TypeScript.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Add Scalar API Docs | Spec + page + dependency | Scalar import semantics (named vs default) |

**Estimated effort:** ~1 session, 1 phase