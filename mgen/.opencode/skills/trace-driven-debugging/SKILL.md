---
name: trace-driven-debugging
description: Protocol for debugging bugs in the Progress app: classify bug by layer, map data flow chain, log boundary exits/entrances with directional prefixes, and fix in separate commits.
---

# SKILL: Trace-Driven Debugging

**Load this file before investigating any bug in the Progress app.**
**Trigger:** Any session involving a bug report, unexpected behavior, or regression investigation.

---

## STEP 0 — CLASSIFY BEFORE TOUCHING CODE

Before writing a single log or fix, classify the bug by layer:

| Layer | Boundary | Typical Symptom |
|---|---|---|
| **UI → State** | User action doesn't update `AppState` | UI interaction appears to do nothing |
| **State → Audio** | State is correct but sound is wrong | Wrong pitch, timing, or silence |
| **State → MIDI** | Export produces wrong notes | MIDI file doesn't match expected chords |
| **Audio → Master Bus** | Clipping or distortion | Digital artifacts at output |
| **Persistence** | State doesn't survive reload | Lost progression, wrong defaults on load |
| **Drag & Drop** | Mobile reorder fails silently | Cards don't swap, drop fires with null payload |

Pick the most likely layer. Start logging there — not everywhere.

---

## STEP 1 — MAP THE CHAIN FIRST

Write out the full data flow for the broken feature before adding any logs:

```
UI Click → dispatchIntent() → AppState mutation → [Module A out] → [Module B in] → render()
```

Example for a chord not playing:
```
ChordCard click → playChord(index) → AppState.currentChord → audioEngine.trigger(chord)
  → buildChordVoicing(pitches) → Web Audio API → Master Bus → output
```

Do not skip steps. An assumption here causes a misplaced log later.

---

## STEP 2 — LOG EXITS AND ENTRANCES AT EACH BOUNDARY

Place logs at **both sides** of every module boundary identified in Step 1.
Never log only one side — this is the most common cause of misdiagnosed bugs.

```js
// Exit log (end of Module A)
console.log('[ModA→out]', { payload });

// Entrance log (start of Module B)
console.log('[ModB←in]', { payload });
```

**Rules:**
- Use bracketed, directional prefixes: `[ModA→out]`, `[ModB←in]`
- Log the full payload object, not a partial summary
- Do not read state from the DOM to construct log values — read from `AppState` directly
- Add logs to a **dedicated commit** before writing any fix

---

## STEP 3 — FIX IN A SEPARATE COMMIT

```
commit 1: "debug: add boundary logs for [feature] investigation"
commit 2: "fix: [root cause description]"
commit 3: "cleanup: remove debug logs for [feature]" ← only after user confirms resolution
```

**NEVER combine fix and log removal in the same commit.**
**NEVER remove logs until the user explicitly confirms the bug is resolved.**


## STEP 4 — CHECK FRAMEWORK-SPECIFIC TRANSPORT LAYERS

After exhausting module boundaries, verify the transport layer carrying data between system boundaries:

| Layer | What to Verify | Log Strategy |
|---|---|---|
| **REST / fetch** | Request payload shape, response status, JSON parse errors | Log request body at call site; log parsed response before passing downstream |
| **WebSocket** | Connection state, message framing, event ordering | Log `onopen`, `onmessage` raw data, and `onerror` |
| **Service Worker** | Cache hit vs. network, stale response serving | Log fetch events in SW scope; check Cache Storage in DevTools |
| **Web Worker** | `postMessage` payload integrity, transferable object ownership | Log at `postMessage` call and inside `onmessage` handler |
| **Native Bridge** | Serialization limits, async callback timing | Log before bridge call and in callback; watch for silent failures |
| **IndexedDB / localStorage** | Schema version, parse/stringify round-trip, storage quota errors | Log raw stored value before any parsing |

Only one of these will be relevant per project. If none apply, skip this step.

---


## PROJECT NOTES
*Edit this section per project. Everything above is generic and should not be changed.*

## DRAG & DROP BUGS (MOBILE-SPECIFIC PROTOCOL)

If the bug involves drag-and-drop reordering, check this first:

- ❌ Do NOT read `e.dataTransfer.getData()` — this is unreliable on mobile polyfills
- ✅ Always read payload from module-scoped variables (`draggedSourceChord`, `draggedIndex`)
- Log the module-scoped variable at `dragstart` and again at `drop` to confirm it survived

```js
// dragstart handler
draggedIndex = sourceIndex;
console.log('[DnD→dragstart]', { draggedIndex });

// drop handler
console.log('[DnD←drop]', { draggedIndex, targetIndex });
```

---

## AUDIO / CLIPPING BUGS

If the bug is audio distortion or unexpected silence:

- Confirm signal passes through Master Bus/Compressor — all audio nodes must connect to it, not directly to `AudioContext.destination`
- Log node connection graph: source → gain → compressor → destination
- Check that `AudioContext` is not in suspended state (browser autoplay policy)
- Never write fix code before confirming which node in the chain is the break point

---

## PERSISTENCE BUGS

If state doesn't survive a reload:

- Inspect `storePersistence.js` exclusively — do not scatter persistence logic elsewhere
- Check version migration path: does the saved schema match the current `AppState` shape?
- Log raw `localStorage.getItem()` value before any parsing to confirm what was actually saved
- Sanitization must happen inside `storePersistence.js`, not in the calling module

