---
name: melody-audit
description: Audits melody generation systems for correctness, consistency, and cross-engine behavior. Produces a structured, verifiable audit report optimized for token-efficient handoff to another LLM, with explicit design-choice vs bug classification and inline comment format for author override.
---

# SKILL: Melody Generator Audit

**Load this before auditing any melody/pitch/timing generation code.**
**Trigger:** Review of melody generator quality, timing anomalies, envelope inconsistency, cross-engine behavior differences, or any other concern the author wants investigated.

**Scope is determined by your prompt text.** This skill provides the methodology and domain context (melody generators, synthesis, audio engines); your prompt provides the specific concerns to investigate.

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

Use `Glob` to find melody/pitch/timing/envelope/synthesis modules. Typical patterns:

```
melody*.js, professional*.js, mgen*.js, synth*.js, synthEngines*.js
bassGenerator*.js, countermelody*.js, tuning*.js, rhythm*.js
```

Use `Read` on each to confirm file exists and get line counts.

### 1.2 Verify Specific Claims With Targeted Reads

For each potential issue, read **only the relevant lines** (use `offset` + `limit`). Do NOT read entire files unless necessary.

**Verification checklist per claim (adapt to the concern your prompt specifies):**

| Claim Type | What to Verify | Tool |
|---|---|---|
| Envelope / ADSR | `getEnvelopeTimes()` or equivalent, clamping logic, parameter passing | Read with offset/limit |
| Pitch selection | `findClosest()`, `validPitches` construction, chord/scale mapping | Read with offset/limit |
| Timing / rhythm | Cluster creation, rubato warps, duration scaling, quantization | Read with offset/limit |
| Cross-engine diff | How each engine (legacy, pro, mgen) calls shared synthesis | Read with offset/limit |
| Parameter passing | Whether ADSR / gapAfter / clusterRole / genre settings are passed or ignored | Read with offset/limit |
| State management | How state is initialized, cleared, shared, or leaked between engines | Read with offset/limit |
| Error handling | Fallback paths, empty-pool handling, missing-data branches | Read with offset/limit |
| Disabled features | Feature flags, commented-out code, disabled oscillators | Read with offset/limit |

**Rule:** If a code path is disabled (e.g., feature flag, commented-out code, disabled oscillator), note it as **DISABLED** — do not report as an active issue.

### 1.3 Minimal Shell Commands (Only When Needed)

Use shell commands ONLY for facts that cannot be determined from code reading:

```bash
# Count total lines in a file (confirms scope)
wc -l <file>

# Find all calls to a function across the codebase
grep -rn "functionName(" --include="*.js" .

# Find all references to a state property or context key
grep -rn "state\.propertyName\|context\.key" --include="*.js" .

# Check if a feature is conditionally disabled
grep -rn "disabled\|DISABLED\|TODO\|FIXME\|skip\|bypass" --include="*.js" .

# Find all imports of a module
grep -rn "import.*from.*module" --include="*.js" .

# Search for a specific pattern (e.g., missing post-processing in one engine)
grep -rn "pattern" --include="*.js" .
```

**Rule:** Each shell command must answer ONE specific question. Do not run broad searches.

---

## PHASE 2: CLASSIFY — BUG vs DESIGN CHOICE

Every finding MUST be classified:

| Category | Definition |
|---|---|
| **BUG** | Code behaves contrary to its own documented intent, crashes, produces clearly wrong output, or has no plausible musical justification |
| **DESIGN CHOICE** | Code behaves intentionally, produces musically defensible output, and has a plausible reason for the behavior — even if it creates side effects |
| **DESIGN FLAW** | Intentional design, but the side effects undermine the intended benefit |

### For DESIGN CHOICE findings, answer:

1. **What benefit does this design provide?** (e.g., "clamping envelopes on short notes prevents click artifacts")
2. **What undermines that benefit?** (e.g., "clamping is too aggressive, making sliders useless even when they should work")
3. **Is there a middle ground?** (e.g., "allow partial envelope on notes > 50ms, clamp only on < 50ms")

### For DESIGN FLAW findings, answer:

1. **What was the intent?**
2. **Why does it fail in practice?** (specific code path, edge case, or interaction)
3. **What is the minimal fix that preserves the intent?**

---

## PHASE 3: STRUCTURE THE REPORT

Produce a markdown report with this exact structure:

```markdown
# [App Name] Melody Generator Audit

## Executive Summary
[2-3 sentences: overall quality, what works, what doesn't, why one mode/engine may behave differently]

## 1. [CATEGORY] — [BRIEF TOPIC]

### Issue N.N: [Descriptive Title]
**Category:** BUG / DESIGN CHOICE / DESIGN FLAW
**Location:** `file.js:lines`
**Verified:** [Yes/No — what was read/checked]

**Current behavior:** [What the code actually does, with code references]

**If BUG:**
**Impact:** [What the user hears or what breaks]
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
**Location:** `synthEngines.js:3-45`
**Verified:** Yes — read synthEngines.js lines 1-50

**Intended benefit:** Prevents click artifacts on very short notes by forcing minimal attack/release times.

<!-- AUTHOR NOTE: I think this is by design, but short notes should still have some envelope shape rather than clicking. The sustain phase should be allowed to extend if there's room, with minimal decay between notes. -->

**What undermines it:** Clamping is so aggressive that decay, sustain, and release sliders have no effect even on long notes when gapAfter is small. The timing variations the user hears are about WHEN notes happen, not envelope shape.
```

---

## PHASE 4: SUMMARY & PRIORITIZATION

End the report with:

### Summary of Root Causes
[Bullet list of 3-7 root causes, grouped by category: pitch, timing, envelope, architecture, state management, error handling]

### Priority Matrix
| Priority | Issue | Category | File | Lines | Impact |
|---|---|---|---|---|---|
| P0/P1/P2/P3 | [Brief description] | BUG/DESIGN CHOICE/DESIGN FLAW | `file.js` | lines | User-visible impact |

### Why [X] Mode/Engine Sounds/Behaves Differently
[If applicable: explain which mode/engine avoids which problematic code paths, or why one configuration produces different results]

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

1. **What to audit** — the feature, behavior, or concern (e.g., "audit envelope clamping on short notes", "audit cross-engine parameter consistency", "audit what happens when pitch pools are empty")
2. **Key files** — file paths or glob patterns to focus on (e.g., "start with synthEngines.js and melodyScheduler.js")
3. **Specific concerns** — what you've observed or suspect (e.g., "sliders don't affect fast passages", "mgen sounds different from legacy", "notes sound off-key in certain chord progressions")
4. **Context** — any relevant constraints, architecture notes, or known trade-offs

**Example invocations:**

```
# Example 1: Envelope audit
Load skill: melody-audit
Prompt: Audit the envelope system. Key files: synthEngines.js. Concerns: user ADSR sliders have no effect on fast passages, FM and plucked instruments ignore sliders entirely, release behavior is inconsistent between short and long notes.

# Example 2: Cross-engine consistency audit
Load skill: melody-audit
Prompt: Audit cross-engine consistency. Key files: melodyScheduler.js, mgenEngine.js, professionalMelodyScheduler.js. Concerns: the three engines handle gapAfter differently, MGEN doesn't pass gapAfter to playToneFn, state is not cleared consistently between engines.

# Example 3: Pitch correctness audit
Load skill: melody-audit
Prompt: Audit pitch selection and correctness. Key files: melodyScheduler.js, professionalMelodyScheduler.js, melodyTuning.js, mgen/src/orchestrator.js. Concerns: foreshadow notes land off-key, findClosest has no tolerance, post-processing overwrites notes with next-chord tones.

# Example 4: Timing and rhythm audit
Load skill: melody-audit
Prompt: Audit timing and rhythm generation. Key files: melodyScheduler.js. Concerns: cluster creation throws notes too close together, rubato warps break cluster detection, duration scaling creates inconsistent note lengths.
```

---

## PROJECT NOTES

*The examples below are for the Progress app. Adapt file names and state properties for your project.*

**Typical files to audit:**
- `melodyScheduler.js` — pitch selection, clustering, foreshadowing, timing (legacy engine)
- `professionalMelodyScheduler.js` — professional mode melody generation
- `mgen/src/orchestrator.js` — MGEN multi-pass generation
- `mgenEngine.js` — MGEN engine bridge / scheduler
- `synthEngines.js` — envelope generation (ADSR), synthesis routing per instrument type
- `synth.js` — tone playback, synthesis routing
- `melodyCountermelody.js` — counterpoint generation
- `melodyTuning.js` — pitch snapping, scale mapping, `findClosest()`
- `melodyGenerator.js` — main entry point, `clearMelodyMemory()`, engine dispatch

**Typical state properties to trace:**
- `state.melodyAdsr` — envelope sliders (attack, decay, sustain, release)
- `state.synthParams.*` — per-synth parameters (FM attack/release, etc.)
- `state.instruments.melody` — selected melody instrument type
- `state.bpm`, `state.mode` — global timing and key settings
- `context.proPhraseArch` — professional mode phrase architecture
- `context.proTensionTracker` — professional mode tension state
- `context.proRegisterTracker` — professional mode register state
- `context.proRhythmicCohesion` — professional mode rhythmic state

**Typical engine architecture:**
- **Legacy engine** (`melodyScheduler.js`) — cluster creation, rubato warps, post-processing foreshadowing, passes `gapAfter` to synthesis
- **Professional engine** (`professionalMelodyScheduler.js`) — NCT taxonomy pre-gating, no cluster creation, no rubato warps, no post-processing foreshadowing, stricter isolation handling
- **MGEN engine** (`mgenEngine.js` + `orchestrator.js`) — 5-pass pipeline (structural, cadence, connector, ornament, expectation), feedback loop, safe mode, does NOT pass `gapAfter` to synthesis
