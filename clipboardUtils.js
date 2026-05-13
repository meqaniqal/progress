import { generateId } from './patternUtils.js';
import { editorState, app, getCurrentPattern, setCurrentPattern, getDurationBeats, renderRhythmTimeline } from './rhythmEditor.js';

export function copyPattern(btnCopy, btnPaste) {
    const pattern = getCurrentPattern();
    if (!pattern) return;
    
    // Deep copy the pattern to the clipboard
    const sourceBeats = getDurationBeats();
    const patternToCopy = JSON.parse(JSON.stringify(pattern));
    patternToCopy.sourceBeats = sourceBeats;
    editorState.clipboardPattern = patternToCopy;
    
    if (btnPaste) btnPaste.disabled = false;
    
    // UX Feedback
    if (btnCopy) {
        const originalText = btnCopy.innerHTML;
        btnCopy.innerHTML = '✓ Copied!';
        setTimeout(() => btnCopy.innerHTML = originalText, 1500);
    }
}

export function pastePattern() {
    if (!editorState.clipboardPattern) return;
    const pattern = getCurrentPattern();
    if (!pattern) return;
    
    const isClipboardDrums = Array.isArray(editorState.clipboardPattern.hits);
    const isTargetDrums = editorState.activeTab === 'drumPattern';
    
    if (isClipboardDrums !== isTargetDrums) {
        alert("Cannot paste patterns between instrument slices and drum grids.");
        return;
    }

    app.saveHistoryState();
    
    // Deep copy from clipboard and regenerate IDs to prevent cross-chord collisions
    const pastedPattern = JSON.parse(JSON.stringify(editorState.clipboardPattern));
    const targetBeats = getDurationBeats();
    const sourceBeats = pastedPattern.sourceBeats || targetBeats;
    
    let initialPattern = { ...pastedPattern };
    let finalPattern = { ...pastedPattern };
    
    // Shield against copying chord slices into drum hits
    if (pastedPattern.instances) {
        const initialInstances = [];
        const finalInstances = [];
        
        pastedPattern.instances.forEach(inst => {
            const newId = generateId();
            
            // Initial state: Scaled to fit exactly as it looked in the source
            initialInstances.push({
                ...inst,
                id: newId,
                arpSettings: editorState.activeTab !== 'chordPattern' ? null : inst.arpSettings,
                isAnimating: true
            });

            const absStart = inst.startTime * sourceBeats;
            const absDuration = inst.duration * sourceBeats;

            if (absStart >= targetBeats) return; // Drop instances completely outside the new chord

            const newStartTime = absStart / targetBeats;
            const newDuration = Math.min(absDuration, targetBeats - absStart) / targetBeats;

            if (newDuration > 0.001) { // Avoid creating zero-width instances
                // Final state: Absolute time, truncated
                finalInstances.push({
                    ...inst,
                    id: newId,
                    arpSettings: editorState.activeTab !== 'chordPattern' ? null : inst.arpSettings,
                    startTime: newStartTime,
                    duration: newDuration,
                    isAnimating: true
                });
            }
        });
        initialPattern.instances = initialInstances;
        finalPattern.instances = finalInstances;
    }
    
    if (pastedPattern.hits) {
        const initialHits = [];
        const finalHits = [];
        
        pastedPattern.hits.forEach(hit => {
            const newId = generateId();
            
            // Initial state
            initialHits.push({
                ...hit,
                id: newId
            });

            const absBeat = hit.time * sourceBeats;
            if (absBeat < targetBeats) {
                // Final state: Absolute time
                finalHits.push({
                    ...hit,
                    id: newId,
                    time: absBeat / targetBeats
                });
            }
        });
        initialPattern.hits = initialHits;
        finalPattern.hits = finalHits;
    }
    delete initialPattern.sourceBeats;
    delete finalPattern.sourceBeats;
    
    // 1. Render the superimposed (original layout) immediately
    setCurrentPattern(initialPattern, true);
    renderRhythmTimeline();
    
    // 2. Animate to the final absolute/truncated positions
    setTimeout(() => {
        setCurrentPattern(finalPattern, true);
        app.persistAppState();
        renderRhythmTimeline();
    }, 50); // slight delay ensures DOM registers the initial state for CSS transition
}