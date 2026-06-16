# Add Interactive API Documentation with Scalar — Implementation Plan

## Overview

Add an interactive API documentation page powered by Scalar (`@scalar/astro`) that lets developers browse and test all 10xCards API endpoints. The OpenAPI spec is maintained as a TypeScript object in the codebase, staying in sync with the actual implementation.

## Current State Analysis

The project has 20+ API endpoints across Auth, Sets, Flashcards, AI generation, Sharing, Reviews, Sessions, and User Settings. All endpoints use JSON request/response (except auth signup/signin which use form data). Authentication is cookie-based (Supabase SSR). No API documentation or Swagger exists today.

## Desired End State

A `/docs/api` page renders a full interactive Scalar API reference. The OpenAPI 3.1.0 spec is defined in `src/lib/openapi/openapi-spec.ts` as a plain TypeScript object — editing the spec requires only changing that file. All 20+ endpoints are documented with request/response schemas, auth requirements, and tags.

### Key Discoveries

- `@scalar/astro` exports `ScalarComponent` as a named export (not default)
- The component accepts `configuration` prop with `spec.content` for inline spec
- Scalar renders from CDN in static mode — no SSR complexity
- Existing project uses `@/` path alias mapping to `./src/*`

## What We're NOT Doing

- Auto-generating the OpenAPI spec from Zod schemas at runtime (too complex for MVP)
- Adding authentication flow to the Scalar UI (cookie auth can't be tested from the docs page directly)
- Protecting the `/docs/api` route (it's public documentation, auth-protected endpoints require real cookies)

## Implementation Approach

Single phase: create the OpenAPI spec file, the Astro docs page, and install the dependency.

## Phase 1: Add Scalar API Docs

### Overview

Install `@scalar/astro`, create the OpenAPI spec object covering all endpoints, and create the Astro page.

### Changes Required

#### 1. Dependency

**File**: `package.json`

**Intent**: Add `@scalar/astro` as a dependency so the Scalar component is available.

**Contract**: `@scalar/astro` appears in `dependencies`.

#### 2. OpenAPI Spec

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Define the complete OpenAPI 3.1.0 specification as a typed TypeScript object covering all 20+ endpoints, their request bodies, response schemas, and security requirements.

**Contract**: Exports `openApiSpec` as `as const`. Includes `components.schemas` for `Error`, `ValidationError`, `FlashcardSet`, `Flashcard`, `FlashcardContent`, `SetName`, `Rating`. Includes `components.securitySchemes.cookieAuth`. All paths under `/api/` with correct methods, parameters, and response codes.

#### 3. Docs Page

**File**: `src/pages/docs/api.astro`

**Intent**: Render the Scalar API reference component with the inline spec.

**Contract**: Imports `ScalarComponent` from `@scalar/astro` and `openApiSpec` from `@/lib/openapi/openapi-spec`. Passes `configuration={{ spec: { content: openApiSpec } }}` as props.

### Success Criteria

#### Automated Verification

- `npm run build` succeeds
- `npm run lint` passes for the new files
- TypeScript type-checks pass

#### Manual Verification

- Navigate to `/docs/api` in dev mode and see the Scalar UI with all endpoints listed
- Browse to an endpoint and see request/response schemas
- The page renders without console errors

## Progress

### Phase 1: Add Scalar API Docs

#### Automated

- [x] 1.1 Build passes (`npm run build`) — 46b4d47
- [x] 1.2 Lint passes for new files — 46b4d47
- [x] 1.3 TypeScript type-checks pass (pre-existing errors only, none in new files) — 46b4d47

#### Manual

- [x] 1.4 Scalar UI renders at `/docs/api` with all endpoints