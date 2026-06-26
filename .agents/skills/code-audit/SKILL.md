---
name: code-audit
description: Generalized audit skill for any codebase. Produces a structured, verifiable audit report with bug/design-choice classification, inline author notes for preference injection, and prioritized findings. Invoke with scope narrowed by your prompt text.
---

# SKILL: Code Audit (Generalized)

**Load before auditing any codebase for quality, correctness, or consistency issues.**
**Trigger:** Review of code quality, bugs, design inconsistencies, cross-module behavior differences, or architectural concerns.

**Scope is determined by your prompt text.** This skill provides the methodology; your prompt provides the domain context.

---

## GOAL

Produce a **high-confidence, token-efficient audit report** that:

1. Identifies real bugs vs intentional design choices
2. For design choices, states the intended benefit and what breaks it
3. Allows the author to inject conflicting preferences **without requiring the next LLM to redo the analysis**
4. Uses targeted verification to minimize false positives and context bloat

---

## PHASE 1: TARGETED DISCOVERY (VERIFICATION FIRST)

Do NOT audit from memory. Verify every claim with minimal, targeted tool calls.

### 1.1 Locate Relevant Files

Use `Glob` to find files matching patterns from your prompt. Typical patterns depend on domain:

```
# Web app: router*.js, controller*.js, store*.js, reducer*.js
# Audio/synth: synth*.js, engine*.js, oscillator*.js, envelope*.js
# Data layer: model*.js, repository*.js, db*.js, query*.js
# UI: component*.js, view*.js, render*.js, template*.js
# Build/config: webpack*.js, rollup*.js, config*.js, task*.js
```

Use `Read` on each to confirm file exists and get line counts.

### 1.2 Verify Specific Claims With Targeted Reads

For each potential issue, read **only the relevant lines** (use `offset` + `limit`). Do NOT read entire files unless necessary.

**Verification checklist per claim (adapt to your domain):**

| Claim Type | What to Verify | Tool |
|---|---|---|
| State mutation | Where state is read/written, mutation patterns | Read with offset/limit |
| API calls | Request/response handling, error paths | Read with offset/limit |
| Data flow | How data moves between modules, transformation points | Read with offset/limit |
| Cross-module diff | How different modules handle the same concept | Read with offset/limit |
| Error handling | Try/catch, error propagation, fallback paths | Read with offset/limit |
| Configuration | How config is loaded, merged, validated | Read with offset/limit |

**Rule:** If a code path is disabled (e.g., feature flag, commented-out code, disabled module), note it as **DISABLED** — do not report as an active issue.

### 1.3 Minimal Shell Commands (Only When Needed)

Use shell commands ONLY for facts that cannot be determined from code reading:

```bash
# Count total lines in a file (confirms scope)
wc -l <file>

# Find all calls to a function across the codebase
grep -rn "functionName(" --include="*.js" .

# Find all references to a state property or config key
grep -rn "state\.propertyName\|config\.key" --include="*.js" .

# Check if a feature is conditionally disabled
grep -rn "disabled\|DISABLED\|TODO\|FIXME\|skip\|skip\|bypass" --include="*.js" .

# Find all imports of a module
grep -rn "import.*from.*module" --include="*.js" .
```

**Rule:** Each shell command must answer ONE specific question. Do not run broad searches.

---

## PHASE 2: CLASSIFY — BUG vs DESIGN CHOICE

Every finding MUST be classified:

| Category | Definition |
|---|---|
| **BUG** | Code behaves contrary to its own documented intent, crashes, produces clearly wrong output, or has no plausible justification |
| **DESIGN CHOICE** | Code behaves intentionally, produces defensible output, and has a plausible reason for the behavior — even if it creates side effects |
| **DESIGN FLAW** | Intentional design, but the side effects undermine the intended benefit |

### For DESIGN CHOICE findings, answer:

1. **What benefit does this design provide?** (e.g., "clamping values prevents overflow")
2. **What undermines that benefit?** (e.g., "clamping is too aggressive, making controls useless")
3. **Is there a middle ground?** (e.g., "allow partial range, clamp only at extremes")

### For DESIGN FLAW findings, answer:

1. **What was the intent?**
2. **Why does it fail in practice?** (specific code path, edge case, or interaction)
3. **What is the minimal fix that preserves the intent?**

---

## PHASE 3: STRUCTURE THE REPORT

Produce a markdown report with this exact structure:

```markdown
# [App/Project Name] Audit Report

## Executive Summary
[2-3 sentences: overall quality, what works, what doesn't, why one module/mode may behave differently]

## 1. [CATEGORY] — [BRIEF TOPIC]

### Issue N.N: [Descriptive Title]
**Category:** BUG / DESIGN CHOICE / DESIGN FLAW
**Location:** `file.js:lines`
**Verified:** [Yes/No — what was read/checked]

**Current behavior:** [What the code actually does, with code references]

**If BUG:**
**Impact:** [What the user sees or what breaks]
**Fix:** [Specific, minimal change]

**If DESIGN CHOICE:**
**Intended benefit:** [Why this exists]
**What undermines it:** [Side effects, edge cases, or interactions that cause problems]
**Suggested middle ground:** [How to preserve benefit while reducing side effects]

**If DESIGN FLAW:**
**Intent:** [What the code was trying to do]
**Why it fails:** [Specific code path]
**Minimal fix:** [Preserves intent, fixes the break]
```

### Inline Comment Format for Author Override

When the author wants to inject conflicting preferences, use this format **within the existing issue block** — do NOT create separate sections:

```markdown
<!-- AUTHOR NOTE: [your comment here] -->
```

Place the `<!-- AUTHOR NOTE: ... -->` immediately after the **Impact** or **Intended benefit** section of the relevant issue. This allows the next LLM to:

- See the original analysis intact
- See the author's conflicting preference clearly marked
- Reconcile both without redoing the analysis

**Example:**
```markdown
### Issue 1.1: [Title]
**Category:** DESIGN CHOICE
**Location:** `module.js:10-50`
**Verified:** Yes — read module.js lines 1-50

**Intended benefit:** Prevents overflow by clamping values to [0, 100].

<!-- AUTHOR NOTE: I think this is by design, but the clamp is too aggressive. Allow values up to 150 with visual warning. -->

**What undermines it:** Values above 100 are silently dropped, causing data loss in edge cases.
```

---

## PHASE 4: SUMMARY & PRIORITIZATION

End the report with:

### Summary of Root Causes
[Bullet list of 3-7 root causes, grouped by category: e.g., state management, API handling, error paths, architecture]

### Priority Matrix
| Priority | Issue | Category | File | Lines | Impact |
|---|---|---|---|---|---|
| P0/P1/P2/P3 | [Brief description] | BUG/DESIGN CHOICE/DESIGN FLAW | `file.js` | lines | User-visible impact |

### Why [X] Module/Mode Behaves Differently
[If applicable: explain which module avoids which problematic code paths, or why one configuration produces different results]

---

## TOKEN-EFFICIENCY RULES

1. **Read only what you need.** Use `offset` + `limit` on `Read`. Never read a file you haven't confirmed exists.
2. **One shell command per question.** No broad `grep` without a specific target.
3. **No code dumps.** Reference file:line, don't paste code into the report.
4. **Classify every finding.** If you can't classify it, mark it `UNCERTAIN` and note what additional verification is needed.
5. **Keep the executive summary to 2-3 sentences.** If it's longer, you're describing, not summarizing.
6. **Use the AUTHOR NOTE format** for author feedback — it's designed to be parsed by the next LLM without rewriting the analysis.

---

## HOW TO USE THIS SKILL

Load this skill, then provide your scope in the prompt. Your prompt should specify:

1. **What to audit** — the feature, module, or behavior (e.g., "audit the authentication flow", "audit error handling in the payment module")
2. **Key files** — file paths or glob patterns to focus on (e.g., "start with auth.js, paymentHandler.js, and the middleware folder")
3. **Specific concerns** — what you've observed or suspect (e.g., "tokens expire silently", "errors are swallowed", "state is mutated in unexpected places")
4. **Context** — any relevant constraints, architecture notes, or known trade-offs

**Example invocations:**

```
# Example 1: Web app audit
Load skill: code-audit
Prompt: Audit the authentication flow in this web app. Key files: auth.js, sessionManager.js, apiClient.js. Concerns: tokens expire silently without notification, session state is mutated in multiple places without a single source of truth.

# Example 2: Backend service audit
Load skill: code-audit
Prompt: Audit the payment processing module. Key files: paymentHandler.js, stripeAdapter.js, webhookProcessor.js. Concerns: failed payments are retried without backoff, webhook signatures are not validated in all paths.

# Example 3: Frontend component audit
Load skill: code-audit
Prompt: Audit the data table component and its hooks. Key files: DataTable.js, useTableData.js, useSorting.js. Concerns: sorting state is lost on filter changes, pagination doesn't reset after sort.
```

---

## EXAMPLE OUTPUT (Abbreviated)

```markdown
# MyApp Audit Report

## Executive Summary
The authentication system handles happy paths well but silently drops expired tokens without user notification. Session state is mutated in three separate modules without a single source of truth, leading to inconsistent session status across the app. The API client's error handling swallows 401 responses instead of triggering re-authentication.

## 1. AUTHENTICATION FLOW

### Issue 1.1: Expired Tokens Drop Without Notification
**Category:** BUG
**Location:** `auth.js:45-62`
**Verified:** Yes — read auth.js lines 40-65

**Current behavior:** When `token.expired` is true, the function returns `null` without dispatching an event or updating UI state.

**Impact:** User sees a blank page with no explanation. No re-authentication is triggered.

**Fix:** Dispatch a `SESSION_EXPIRED` event and redirect to login with a `?expired=true` query param.

### Issue 1.2: Session State Mutated in Three Modules
**Category:** DESIGN FLAW
**Location:** `auth.js:120`, `sessionManager.js:34`, `apiClient.js:89`

**Intent:** Each module maintains its own session snapshot for quick access without cross-module dependencies.

**Why it fails:** When `auth.js` updates `session.user`, `sessionManager.js` and `apiClient.js` still hold stale references. The three copies diverge, causing inconsistent behavior (e.g., apiClient thinks user is logged in while sessionManager thinks they are not).

**Minimal fix:** Create a single `SessionStore` module that all three import. Use a publish-subscribe pattern so mutations in one module notify the others.

## Summary of Root Causes
1. Expired tokens are silently dropped — no event, no notification, no re-auth
2. Session state is duplicated across three modules with no synchronization
3. API client swallows 401 responses instead of triggering re-auth

## Priority Matrix
| Priority | Issue | Category | File | Lines |
|---|---|---|---|---|
| P0 | Expired tokens silent drop | BUG | auth.js | 45-62 |
| P0 | Session state duplicated | DESIGN FLAW | auth.js, sessionManager.js, apiClient.js | varies |
| P1 | 401 responses swallowed | BUG | apiClient.js | 89-102 |
```
