import { initChordPattern, initDrumPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, drawPatternBlock, generateId, resolvePattern, addDrumHit, removeDrumHit, updateDrumHit, updateInstance } from './patternUtils.js';
import { playDrum, getAudioCurrentTime, playTone, initAudio, midiToFreq } from './synth.js';
import { getChordNotes } from './theory.js';
import { CONFIG } from './config.js';
import { GRID_STEPS, DRUM_ROWS } from './rhythmConfig.js';
import { initRhythmControls } from './rhythmControls.js';
import { renderRhythmTimeline } from './rhythmRenderer.js';

export { renderRhythmTimeline };

export let app = {}; // Stores references to global state and injected callbacks

export const editorState = new Proxy({}, {
    get(target, prop) {
        return app.state?.editorState ? app.state.editorState[prop] : undefined;
    },
    set(target, prop, value) {
        if (app.updateEditorState) app.updateEditorState({ [prop]: value });
        return true;
    }
});

function hasValidContext() {
    if (editorState.isGlobal) return true;
    return editorState.activeIndex !== null && app.state.currentProgression[editorState.activeIndex] != null;
}

export function getCurrentPattern() {
    if (editorState.isGlobal) return app.state.globalPatterns[editorState.activeTab];
    if (editorState.activeIndex === null) return null;
    const chord = app.state.currentProgression[editorState.activeIndex];
    if (!chord) return null;
    
    const localPat = chord[editorState.activeTab];
    if (localPat && !localPat.isLocalOverride) {
        const globalPat = app.state.globalPatterns[editorState.activeTab];
        const beats = Number(chord.duration) || 4;
        return resolvePattern(globalPat, true, beats);
    }
    return localPat;
}

export function auditionSlicePitch(pitchOffset = 0) {
    if (!hasValidContext()) return;
    initAudio();
    
    // Merge active temporary swaps so auditioning matches the true playback root
    const baseChord = app.state.currentProgression[editorState.activeIndex];
    const swap = app.state.temporarySwaps ? app.state.temporarySwaps[editorState.activeIndex] : null;
    const chord = swap ? { ...baseChord, ...swap } : baseChord;
    
    if (!chord) return;
    const notes = getChordNotes(chord.symbol, chord.key);
    if (!notes) return;
    
    const now = getAudioCurrentTime();
    const duration = 0.4; // Short, punchy audition
    
    // Play chord pad and bass note together
    notes.forEach(n => playTone(midiToFreq(n - 12), now, duration, 'sawtooth'));
    const finalBassNote = notes[0] + CONFIG.BASS_OCTAVE_DROP + pitchOffset;
    playTone(midiToFreq(finalBassNote), now, duration, 'sine');
}

export function setCurrentPattern(newPattern, markAsOverride = true) {
    if (app.updatePattern) {
        app.updatePattern(editorState.activeTab, newPattern, editorState.activeIndex, editorState.isGlobal, markAsOverride);
    }
}

function getTimelineRect() {
    const timeline = document.getElementById('rhythm-timeline');
    const drumLines = timeline.querySelector('.drum-grid-lines');
    return drumLines ? drumLines.getBoundingClientRect() : timeline.getBoundingClientRect();
}

function getActiveGridValue() {
    if (!editorState.isGridEnabled) return 0;
    const baseValue = GRID_STEPS[editorState.gridStepIndex].value;
    return baseValue * (4 / getDurationBeats());
}

export function getDurationBeats() {
    if (editorState.isGlobal) {
        if (editorState.activeTab === 'drumPattern') {
            const pat = app.state.globalPatterns.drumPattern;
            return pat ? (pat.lengthBeats || 4) : 4;
        }
        return 4;
    }
    if (editorState.activeIndex === null) return 4;
    const chord = app.state.currentProgression[editorState.activeIndex];
    return chord ? (Number(chord.duration) || 4) : 4;
}

/** Applies the boolean carve/draw math during pointer interactions. */
function applyDrawMath(startRatio, endRatio) {
    let start = Math.min(startRatio, endRatio);
    let end = Math.max(startRatio, endRatio);
    let duration = end - start;
    
    // Ensure a minimal duration so single clicks register as a block
    if (duration < 0.01) {
        const step = getActiveGridValue();
        if (step > 0) {
            start = Math.floor(start / step) * step;
            duration = step;
        } else {
            duration = 0.05;
        }
    }

    let newPattern = JSON.parse(JSON.stringify(editorState.drawStartPattern));
    const isEraser = editorState.drawModeAction === 'erase';

    if (editorState.isGridEnabled) {
        const step = getActiveGridValue();
        if (step > 0) {
            const startStep = Math.floor(start / step);
            const endStep = Math.ceil((start + duration) / step);
            for (let i = startStep; i < endStep; i++) {
                const s = i * step;
                newPattern = drawPatternBlock(newPattern, s, step, isEraser);
            }
        } else {
            newPattern = drawPatternBlock(newPattern, start, duration, isEraser);
        }
    } else {
        newPattern = drawPatternBlock(newPattern, start, duration, isEraser);
    }

    setCurrentPattern(newPattern, true);
    renderRhythmTimeline();
}

/** Sets up the complex pointer events for dragging, resizing, and creating instances. */
function _setupTimelinePointerEvents() {
    // --- Timeline Interactions (Pointer Events for Mobile + Desktop) ---
    const timeline = document.getElementById('rhythm-timeline');
    let dragStartX = 0;
    let dragStartY = 0;
    let originalStartTime = 0;
    let originalDuration = 0;
    let longPressTimer = null;
    let lastTapTime = 0;
    let lastTapId = null; // Can be instance ID or 'empty'
    let lastTapCoords = { x: 0, y: 0 }; // For double-tap position check
    let panStartX = 0;
    let panStartScrollLeft = 0;
    let cachedTimelineRect = null;
    
    // Hard block standard right-click context menus inside the timeline
    timeline.addEventListener('contextmenu', e => e.preventDefault());

    // Trackpad Pinch-to-Zoom support strictly for Global Drums
    timeline.addEventListener('wheel', (e) => {
        if (editorState.activeTab === 'drumPattern' && editorState.isGlobal && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? -0.2 : 0.2;
            editorState.zoomLevel = Math.max(0.8, Math.min(4.0, editorState.zoomLevel + zoomDelta));
            renderRhythmTimeline();
        }
    }, { passive: false });

    timeline.addEventListener('pointerdown', (e) => {
        if (editorState.activeTab === 'drumPattern') {
            e.stopPropagation();
            if (!hasValidContext()) return;
            const labelElement = e.target.closest('.drum-row-label');
            if (labelElement) return; // Prevent adding hits when clicking labels
            timeline.setPointerCapture(e.pointerId);

            cachedTimelineRect = getTimelineRect();
            const rect = cachedTimelineRect;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const timeRatio = Math.max(0, Math.min(1, x / rect.width));
            const rowIndex = Math.floor(y / (rect.height / DRUM_ROWS.length));
            const rowType = DRUM_ROWS[rowIndex];

            const hitElement = e.target.closest('.drum-hit');
            const now = Date.now();

            // Check for double tap
            const dist = Math.hypot(x - lastTapCoords.x, y - lastTapCoords.y);
            if (now - lastTapTime < 300 && dist < 20) { // Double tap in same area
                lastTapTime = 0; // Reset timer
                
                app.saveHistoryState();
                let pattern = getCurrentPattern();
                
                // Legacy data safeguard: Convert old chord-cloned drum patterns to the new format
                if (!pattern || !Array.isArray(pattern.hits)) {
                    pattern = initDrumPattern(pattern ? pattern.isLocalOverride : false);
                }

                if (hitElement) { // Double-tapped on a hit, so remove it
                    if (hitElement.dataset.id === editorState.selectedHitId) editorState.selectedHitId = null;
                    pattern = removeDrumHit(pattern, hitElement.dataset.id);
                } else { // Double-tapped on empty space, so add a hit
                    const actualGridValue = getActiveGridValue();
                    let newTime = timeRatio;
                    if (actualGridValue > 0) {
                        newTime = Math.round(newTime / actualGridValue) * actualGridValue;
                    }
                    
                    pattern = addDrumHit(pattern, { time: newTime, row: rowType, velocity: 1.0 });
                    playDrum(rowType, getAudioCurrentTime());
                }
                
                setCurrentPattern(pattern);
                app.persistAppState();
                renderRhythmTimeline();
                return;
            }

            lastTapTime = now;
            lastTapCoords = { x, y };

            if (hitElement) { // Single press on a hit, prepare for drag
                editorState.draggedHitId = hitElement.dataset.id;
                editorState.selectedHitId = hitElement.dataset.id;
                app.saveHistoryState();
            } else {
                editorState.selectedHitId = null;
                editorState.isPanning = true;
                panStartX = e.clientX;
                panStartScrollLeft = timeline.scrollLeft;
            }
            return;
        }
        if (editorState.activeTab === 'drumPattern') return;

        // Ignore interactions if we click inside the active overlay
        if (e.target.closest('.slice-overlay')) {
            e.stopPropagation();
            return;
        }

        const isExperimental = app.state.enableExperimentalDrawMode;
        const isChordOrBass = editorState.activeTab === 'chordPattern' || editorState.activeTab === 'bassPattern';

        // Handle Pencil Draw Interaction
        if (isExperimental && isChordOrBass && editorState.isDrawModeEnabled) {
            if (!hasValidContext()) return;
            cachedTimelineRect = getTimelineRect();
            const rect = cachedTimelineRect;
            const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const pattern = getCurrentPattern();
            const clickedInst = pattern.instances.find(i => clickRatio >= i.startTime && clickRatio <= i.startTime + i.duration);
            
            editorState.drawModeAction = clickedInst ? 'erase' : 'draw';
            editorState.drawStartRatio = clickRatio;
            editorState.drawStartPattern = JSON.parse(JSON.stringify(pattern));
            editorState.isDrawing = true;
            timeline.setPointerCapture(e.pointerId);
            app.saveHistoryState();
            applyDrawMath(clickRatio, clickRatio);
            return;
        }

        if (editorState.activeOverlayId) {
            editorState.activeOverlayId = null;
            renderRhythmTimeline(); // Close the overlay if clicking elsewhere
        }

        const resizeHandle = e.target.closest('.resize-handle');
        if (resizeHandle) {
            e.stopPropagation();
            if (!hasValidContext()) return;
            
            cachedTimelineRect = getTimelineRect();
            const instanceEl = resizeHandle.closest('.rhythm-instance');
            const instId = instanceEl.dataset.id;
            
            editorState.isResizing = resizeHandle.classList.contains('left') ? 'left' : 'right';
            editorState.draggedInstanceId = instId;
            
            timeline.setPointerCapture(e.pointerId);
            app.saveHistoryState();
            
            const pattern = getCurrentPattern();
            if (pattern) {
                const currentInst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    setCurrentPattern(exclusiveSelect(pattern, editorState.draggedInstanceId));
                auditionSlicePitch(currentInst.pitchOffset || 0);
                    renderRhythmTimeline();
                }
            }
            return;
        }

        const instanceEl = e.target.closest('.rhythm-instance');
        const now = Date.now();

        if (!instanceEl) {
            if (!hasValidContext()) return;
            // Manual double-tap detection for empty timeline areas
            if (now - lastTapTime < 300 && lastTapId === 'empty') {
                const pattern = getCurrentPattern();
                if (!pattern) return;

                cachedTimelineRect = getTimelineRect();
                const rect = cachedTimelineRect;
                const clickRatio = (e.clientX - rect.left) / rect.width;

                app.saveHistoryState();
                setCurrentPattern(fillGapInstance(pattern, clickRatio));
                app.persistAppState();
                renderRhythmTimeline();
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;
            lastTapId = 'empty';
            return;
        }

        if (!hasValidContext()) return;
        
        const instId = instanceEl.dataset.id;

        // Manual double-tap detection for slice instances
        if (now - lastTapTime < 300 && lastTapId === instId) {
            if (editorState.activeTab === 'bassPattern' && editorState.isPitchModeEnabled) {
                // Allow rapid taps to pass through as a grab in Pitch Mode
                lastTapTime = 0;
            } else {
                e.stopPropagation();
                editorState.activeOverlayId = instId;
                renderRhythmTimeline();
                lastTapTime = 0;
                return;
            }
        }
        
        lastTapTime = now;
        lastTapId = instId;

        const pattern = getCurrentPattern();
        if (!pattern) return;

        cachedTimelineRect = getTimelineRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        editorState.draggedInstanceId = instId;
        editorState.isDragging = false;
        
        timeline.setPointerCapture(e.pointerId);
        
        const inst = pattern.instances.find(i => i.id === instId);
        if (inst) {
            originalStartTime = inst.startTime;
            originalDuration = inst.duration;
            editorState.dragStartPitchOffset = inst.pitchOffset || 0;
            
            if (editorState.activeTab === 'bassPattern' || editorState.activeTab === 'chordPattern') {
                auditionSlicePitch(inst.pitchOffset || 0);
            }
            
            let requiresRender = false;
            if (!editorState.isGlobal && !pattern.isLocalOverride) {
                // Eagerly materialize the pattern into a Local Override if we interact with it in Local Mode
                app.saveHistoryState();
                setCurrentPattern(exclusiveSelect(pattern, instId), true);
                requiresRender = true;
            } else if (!inst.isSelected) {
                app.saveHistoryState();
                setCurrentPattern(exclusiveSelect(pattern, instId));
                requiresRender = true;
            }

            if (requiresRender) {
                app.persistAppState();
                renderRhythmTimeline();
            }
        } else {
            originalStartTime = 0;
            originalDuration = 0;
            editorState.dragStartPitchOffset = 0;
        }

        longPressTimer = setTimeout(() => {
            editorState.isDragging = true;
            app.saveHistoryState();
            
            // Auto-select on long press
            const pat = getCurrentPattern();
            if (pat) {
                const currentInst = pat.instances.find(i => i.id === editorState.draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    setCurrentPattern(exclusiveSelect(pat, editorState.draggedInstanceId));
                }
            }

            renderRhythmTimeline(); // Apply grabbing visuals via state
        }, 250);
    });

    timeline.addEventListener('pointermove', (e) => {
        if (editorState.activeTab === 'drumPattern') {
            if (editorState.isPanning) {
                const deltaX = e.clientX - panStartX;
                timeline.scrollLeft = panStartScrollLeft - deltaX;
                // Cancel potential double-tap if we've dragged to pan
                if (Math.abs(deltaX) > 5) lastTapTime = 0; 
                return;
            }
            if (!editorState.draggedHitId) return;

            const rect = cachedTimelineRect || getTimelineRect();
            
            // Y-axis (Row)
            const y = e.clientY - rect.top;
            const newRowIndex = Math.max(0, Math.min(DRUM_ROWS.length - 1, Math.floor(y / (rect.height / DRUM_ROWS.length))));
            const newRowType = DRUM_ROWS[newRowIndex];

            // X-axis (Time)
            let x = e.clientX - rect.left;
            let newTime = Math.max(0, x / rect.width);
            
            const actualGridValue = getActiveGridValue();
            if (actualGridValue > 0 && !e.shiftKey) {
                newTime = Math.round(newTime / actualGridValue) * actualGridValue;
            }

            const pattern = getCurrentPattern();
            if (!pattern || !Array.isArray(pattern.hits)) return;

            const hit = pattern.hits.find(h => h.id === editorState.draggedHitId);

            if (hit && (hit.row !== newRowType || Math.abs(hit.time - newTime) > 0.001)) {
                const newPattern = updateDrumHit(pattern, editorState.draggedHitId, { row: newRowType, time: newTime });
                setCurrentPattern(newPattern);
                if (hit.row !== newRowType) playDrum(newRowType, getAudioCurrentTime()); // Audition if sound changed
                renderRhythmTimeline(); 
            }
            return;
        }
        if (editorState.activeTab === 'drumPattern') return;

        if (editorState.isDrawing && editorState.drawStartPattern) {
            const rect = cachedTimelineRect || getTimelineRect();
            const currentRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            applyDrawMath(editorState.drawStartRatio, currentRatio);
            return;
        }

        if (editorState.isResizing && editorState.draggedInstanceId) {
            if (!hasValidContext()) return;
            const rect = cachedTimelineRect || getTimelineRect();
            let newTime = (e.clientX - rect.left) / rect.width;

            // Grid Snapping Math
            const actualGridValue = getActiveGridValue();
            if (actualGridValue > 0 && !e.shiftKey) {
                newTime = Math.round(newTime / actualGridValue) * actualGridValue;
            }

            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
            const newPattern = resizeInstance(pattern, editorState.draggedInstanceId, editorState.isResizing, newTime);
            const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
            // Pure state diff check: Only re-render if the math ACTUALLY changed the instance bounds
            if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
                setCurrentPattern(newPattern);
                renderRhythmTimeline();
            }
            return;
        }

        if (editorState.draggedInstanceId && !editorState.isDragging) {
            const isPitchDrag = editorState.isPitchModeEnabled && editorState.activeTab === 'bassPattern';
            const thresholdY = isPitchDrag ? 3 : 10;
            
            if (Math.abs(e.clientX - dragStartX) > 10 || Math.abs(e.clientY - dragStartY) > thresholdY) {
                // User moved past the threshold, initiate drag immediately!
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                editorState.isDragging = true;
                app.saveHistoryState();

                // Auto-select on drag start
                if (hasValidContext()) {
                    const pat = getCurrentPattern();
                    const inst = pat.instances.find(i => i.id === editorState.draggedInstanceId);
                    if (inst && !inst.isSelected) {
                        setCurrentPattern(exclusiveSelect(pat, editorState.draggedInstanceId));
                    }
                }
                renderRhythmTimeline();
            }
        }

        if (!editorState.isDragging || !editorState.draggedInstanceId) return;
        if (!hasValidContext()) return;
        
        // Handle Pitch Dragging (Lock X-axis)
        if (editorState.isPitchModeEnabled && editorState.activeTab === 'bassPattern') {
            const deltaY = e.clientY - dragStartY;
            const rect = cachedTimelineRect || getTimelineRect();
            // 3% per semitone -> semitone height in pixels = rect.height * 0.03
            const semitonePx = rect.height * 0.03;
            const deltaPitch = -Math.round(deltaY / semitonePx);
            const newPitch = Math.max(-12, Math.min(12, editorState.dragStartPitchOffset + deltaPitch));
            
            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            if (inst && newPitch !== (inst.pitchOffset || 0)) {
                setCurrentPattern(updateInstance(pattern, editorState.draggedInstanceId, { pitchOffset: newPitch }));
                renderRhythmTimeline();
                auditionSlicePitch(newPitch);
            }
            return; 
        }

        const deltaX = e.clientX - dragStartX;
        const rect = cachedTimelineRect || getTimelineRect();
        const deltaRatio = deltaX / rect.width;
        
        let newStartTime = originalStartTime + deltaRatio;

        // Grid Snapping Math
        const actualGridValue = getActiveGridValue();
        if (actualGridValue > 0 && !e.shiftKey) {
            newStartTime = Math.round(newStartTime / actualGridValue) * actualGridValue;
        }

        const pattern = getCurrentPattern();
        const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
        const newPattern = moveInstance(pattern, editorState.draggedInstanceId, newStartTime, originalDuration);
        const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
        // Pure state diff check: Only re-render if the math ACTUALLY changed the instance bounds
        if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
            setCurrentPattern(newPattern);
            renderRhythmTimeline();
        }
    });

    timeline.addEventListener('pointerup', (e) => {
        cachedTimelineRect = null;
        
        if (editorState.activeTab === 'drumPattern') {
            if (editorState.isPanning) {
                editorState.isPanning = false;
                timeline.releasePointerCapture(e.pointerId);
            }
            if (editorState.draggedHitId) {
                timeline.releasePointerCapture(e.pointerId);
                editorState.draggedHitId = null;
                app.persistAppState();
                renderRhythmTimeline();
            }
            return;
        }
        if (editorState.activeTab === 'drumPattern') return;

        if (editorState.isDrawing) {
            editorState.isDrawing = false;
            editorState.drawStartPattern = null;
            timeline.releasePointerCapture(e.pointerId);
            app.persistAppState();
            renderRhythmTimeline();
            return;
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (editorState.isResizing) {
            editorState.isResizing = null;
            timeline.releasePointerCapture(e.pointerId);
            app.persistAppState();
            renderRhythmTimeline();
            editorState.draggedInstanceId = null;
            return;
        }

        if (editorState.isDragging) {
            editorState.isDragging = false;
            timeline.releasePointerCapture(e.pointerId);
            app.persistAppState();
            renderRhythmTimeline();
            editorState.draggedInstanceId = null;
        } else if (editorState.draggedInstanceId) {
            timeline.releasePointerCapture(e.pointerId);
            if (hasValidContext()) {
                const pattern = getCurrentPattern();
                const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
                if (inst) {
                    app.saveHistoryState();
                    setCurrentPattern(exclusiveSelect(pattern, editorState.draggedInstanceId));
                    app.persistAppState();
                    renderRhythmTimeline();
                }
            }
            editorState.draggedInstanceId = null;
        }
    });

    timeline.addEventListener('pointercancel', (e) => {
        cachedTimelineRect = null;
        
        if (editorState.activeTab === 'drumPattern') {
            if (editorState.isPanning) {
                editorState.isPanning = false;
                timeline.releasePointerCapture(e.pointerId);
            }
            if (editorState.draggedHitId) {
                timeline.releasePointerCapture(e.pointerId);
                editorState.draggedHitId = null;
                renderRhythmTimeline();
            }
            return;
        }
        if (editorState.activeTab === 'drumPattern') return;

        if (editorState.isDrawing) {
            editorState.isDrawing = false;
            editorState.drawStartPattern = null;
            timeline.releasePointerCapture(e.pointerId);
            renderRhythmTimeline();
            return;
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        if (editorState.isResizing) {
            editorState.isResizing = null;
            timeline.releasePointerCapture(e.pointerId);
            editorState.draggedInstanceId = null;
            renderRhythmTimeline();
            return;
        }
        
        if (editorState.draggedInstanceId) {
            timeline.releasePointerCapture(e.pointerId);
        }
        editorState.isDragging = false;
        editorState.draggedInstanceId = null;
        renderRhythmTimeline();
    });
}

/** Sets up delegated event listeners for the slice/fill overlay. */
function _setupOverlayEvents() {
    const timeline = document.getElementById('rhythm-timeline');
    // --- Slider & Overlay Delegation ---
    timeline.addEventListener('input', (e) => {
        if (e.target.classList.contains('slice-range')) {
            const instId = e.target.dataset.id;
            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === instId);
            const actualGridValue = getActiveGridValue();

            let rawVal = parseFloat(e.target.value); // Range 5-95
            let splitGlobal = inst.startTime + (rawVal / 100) * inst.duration;

            // Auto-snap to grid while sliding
            if (actualGridValue > 0) {
                splitGlobal = Math.round(splitGlobal / actualGridValue) * actualGridValue;
            }

            // Keep it bounded so we don't slice micro-fractions
            const MIN = 0.02;
            splitGlobal = Math.max(inst.startTime + MIN, Math.min(splitGlobal, inst.startTime + inst.duration - MIN));

            const snappedPercent = ((splitGlobal - inst.startTime) / inst.duration) * 100;
            e.target.value = snappedPercent;
            e.target.dataset.splitGlobal = splitGlobal; 
        }
    });

    timeline.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-do-slice')) {
            e.stopPropagation();
            const instId = e.target.dataset.id;
            const slider = document.querySelector(`.slice-range[data-id="${instId}"]`);
            let splitGlobal = slider.dataset.splitGlobal;
            
            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === instId);
            
            if (splitGlobal === undefined) {
                splitGlobal = inst.startTime + (inst.duration / 2);
                const actualGridValue = getActiveGridValue();
                if (actualGridValue > 0) {
                    splitGlobal = Math.round(splitGlobal / actualGridValue) * actualGridValue;
                }
            } else {
                splitGlobal = parseFloat(splitGlobal);
            }

            const splitRatio = (splitGlobal - inst.startTime) / inst.duration;
            if (splitRatio >= 0.05 && splitRatio <= 0.95) {
                app.saveHistoryState();
                let newPattern = sliceInstance(pattern, instId, splitRatio);
                setCurrentPattern(newPattern);
                editorState.activeOverlayId = null;
                app.persistAppState();
                renderRhythmTimeline();
            }
        } else if (e.target.classList.contains('btn-do-fill')) {
            e.stopPropagation();
            const instId = e.target.dataset.id;
            const pattern = getCurrentPattern();
            app.saveHistoryState();
            setCurrentPattern(expandInstance(pattern, instId));
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        }
    });
}

export function highlightDrumHit(hitId) {
    if (editorState.activeTab !== 'drumPattern') return;
    const hitEl = document.querySelector(`.drum-hit[data-id="${hitId}"]`);
    if (hitEl) {
        hitEl.classList.add('playing');
        setTimeout(() => {
            if (hitEl) hitEl.classList.remove('playing');
        }, 150);

        if (editorState.isGlobal && !editorState.draggedHitId && !editorState.isPanning) {
            const container = document.getElementById('rhythm-timeline');
            if (!container) return;
            const hitRect = hitEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Check if hit is outside the visible timeline window (with a 30px buffer)
            if (hitRect.left < containerRect.left + 48 || hitRect.right > containerRect.right - 30) {
                const offset = hitRect.left - containerRect.left;
                // Scroll to position the hit on the left side, leaving room for the label
                // Use 'auto' (instant) instead of 'smooth' for lightning-fast DAW-style page flips
                container.scrollTo({ left: container.scrollLeft + offset - 60, behavior: 'auto' });
            }
        }
    }
}

export function initRhythmEditor(config) {
    app = config;

    initRhythmControls();
    _setupTimelinePointerEvents();
    _setupOverlayEvents();
}

export function openRhythmEditor(index) {
    editorState.activeIndex = index;
    
    const chord = app.state.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    renderRhythmTimeline();
    
    const panel = document.getElementById('rhythm-editor-panel');
    panel.style.display = 'block';
}

export function closeRhythmEditor() {
    editorState.activeIndex = null;
    editorState.activeOverlayId = null;
    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.style.display = 'none';

        const builderPanel = document.getElementById('builder-panel');
        if (builderPanel) builderPanel.style.display = 'block';
        const undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.style.display = '';
}