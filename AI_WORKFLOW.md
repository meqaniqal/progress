# AI WORKFLOW

## MANDATORY WORKFLOW

1. **PROFESSIONAL STANDARDS FIRST**

   * Proactively align the codebase with rigorous professional practices so it endures scrutiny by senior reviewers.
   * Improve existing code quality before adding features when safe to do so.
   * Avoid regressions.

2. **PLAN**

   * Formulate and agree on a plan before coding.

3. **DEBUGGING**

   * Load and follow `SKILL_debugging.md` before investigating bugs.

4. **REFACTOR**

   * Make atomic changes.
   * Verify import/export relationships whenever relocating code.

5. **TESTING**

   * Load and follow `SKILL_testing.md` when creating or extracting modules.

6. **DIFF HYGIENE**

   * Generate atomic, verifiable diffs.
   * Confirm context and applicability before presenting changes.
   * Reject changes that would create messy or ambiguous diffs.

7. **CORRECTION PROTOCOL**

   * If a mistake is identified, acknowledge the correct pattern.
   * Do not repeat previously corrected errors.
   * Respect any explicitly supplied `CORRECT_PATTERN` guidance.

---

## AGENTIC & TOKEN OPTIMIZATION PROTOCOLS

### Subagents

* Never automatically spawn subagents.
* Only propose them for highly parallelizable work.
* Wait for explicit approval.

### Research Loop Limits

* Limit exploratory codebase searches to 2–3 iterations.
* If required information cannot be located, ask for clarification instead of looping.

### Suggest First

* For expensive operations (large refactors, broad edits, heavy command execution), propose the approach first.
* Let the user approve before execution.

### Prefer Targeted Edits

* Favor focused replacement blocks over whole-file rewrites.
* Minimize token usage while preserving clarity.

---

## META-PROTOCOL & EVOLUTION

### Context Pruning

When asked to `prune_context`, identify instructions and files that appear irrelevant to the current task.

### Self-Correction & Adaptation

Suggest workflow updates when:

1. A recurring error pattern appears.
2. Project maturity changes require different standards.
3. Existing instructions can be generalized or compressed more efficiently.
