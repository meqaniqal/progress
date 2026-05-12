import { editorState, app, getCurrentPattern, setCurrentPattern, hasValidContext, getTimelineRect, getActiveGridValue, auditionSlicePitch, renderRhythmTimeline } from './rhythmEditor.js';
import { exclusiveSelect, moveInstance, fillGapInstance, expandInstance, resizeInstance, drawPatternBlock, sliceInstance, updateInstance } from './patternUtils.js';

export function initTimelineInteractions(timeline) {
    let dragStartX = 0;
    let dragStartY = 0;
    let originalStartTime = 0;
    let originalDuration = 0;
    let longPressTimer = null;
    let lastTapTime = 0;
    let lastTapId = null; 
    let cachedTimelineRect = null;
    let selectionChangedOnDown = false;
    
    // Prevent context menu (right-click) which interferes with dragging interactions
    timeline.addEventListener('contextmenu', e => e.preventDefault());

    function applyDrawMath(startRatio, endRatio) {
        let start = Math.min(startRatio, endRatio);
        let end = Math.max(startRatio, endRatio);
        let duration = end - start;
        
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

    timeline.addEventListener('pointerdown', (e) => {
        if (editorState.activeTab === 'drumPattern') return;

        // Ignore interactions if we click inside the active overlay
        if (e.target.closest('.slice-overlay')) {
            e.stopPropagation();
            return;
        }

        const isExperimental = app.state.enableExperimentalDrawMode;
        const isChordOrBass = editorState.activeTab === 'chordPattern' || editorState.activeTab === 'bassPattern';

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
            renderRhythmTimeline();
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
        if (now - lastTapTime < 300 && lastTapId === instId) {
            e.stopPropagation();
            editorState.activeOverlayId = instId;
            renderRhythmTimeline();
            lastTapTime = 0;
            return;
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
        selectionChangedOnDown = false;
        
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
                app.saveHistoryState();
                setCurrentPattern(exclusiveSelect(pattern, instId), true);
                requiresRender = true;
                selectionChangedOnDown = true;
            } else if (!inst.isSelected) {
                app.saveHistoryState();
                setCurrentPattern(exclusiveSelect(pattern, instId));
                requiresRender = true;
                selectionChangedOnDown = true;
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
            
            const pat = getCurrentPattern();
            if (pat) {
                const currentInst = pat.instances.find(i => i.id === editorState.draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    setCurrentPattern(exclusiveSelect(pat, editorState.draggedInstanceId));
                }
            }
            renderRhythmTimeline();
        }, 250);
    });

    timeline.addEventListener('pointermove', (e) => {
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

            const actualGridValue = getActiveGridValue();
            if (actualGridValue > 0 && !e.shiftKey) {
                newTime = Math.round(newTime / actualGridValue) * actualGridValue;
            }

            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
            const newPattern = resizeInstance(pattern, editorState.draggedInstanceId, editorState.isResizing, newTime);
            const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
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
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                editorState.isDragging = true;
                app.saveHistoryState();

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
        
        if (editorState.isPitchModeEnabled && editorState.activeTab === 'bassPattern') {
            const deltaY = e.clientY - dragStartY;
            const rect = cachedTimelineRect || getTimelineRect();
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

        const actualGridValue = getActiveGridValue();
        if (actualGridValue > 0 && !e.shiftKey) {
            newStartTime = Math.round(newStartTime / actualGridValue) * actualGridValue;
        }

        const pattern = getCurrentPattern();
        const inst = pattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
        const newPattern = moveInstance(pattern, editorState.draggedInstanceId, newStartTime, originalDuration);
        const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
        if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
            setCurrentPattern(newPattern);
            renderRhythmTimeline();
        }
    });

    timeline.addEventListener('pointerup', (e) => {
        cachedTimelineRect = null;
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
                
                // Only apply an exclusive select if pointerdown didn't already handle it, avoiding double-toggles
                if (inst && !selectionChangedOnDown) {
                    const selectedInstances = pattern.instances.filter(i => i.isSelected);
                    const isOnlySelected = selectedInstances.length === 1 && selectedInstances[0].id === editorState.draggedInstanceId;
                    
                    if (!isOnlySelected) {
                        app.saveHistoryState();
                        setCurrentPattern(exclusiveSelect(pattern, editorState.draggedInstanceId));
                    }
                    app.persistAppState();
                    renderRhythmTimeline();
                } else if (inst && selectionChangedOnDown) {
                    app.persistAppState();
                    renderRhythmTimeline();
                }
            }
            editorState.draggedInstanceId = null;
       }
    });

    timeline.addEventListener('pointercancel', (e) => {
        cachedTimelineRect = null;
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

    // --- Slider & Overlay Delegation ---
    timeline.addEventListener('input', (e) => {
        if (e.target.classList.contains('slice-range')) {
            const instId = e.target.dataset.id;
            const pattern = getCurrentPattern();
            const inst = pattern.instances.find(i => i.id === instId);
            const actualGridValue = getActiveGridValue();

            let rawVal = parseFloat(e.target.value); 
            let splitGlobal = inst.startTime + (rawVal / 100) * inst.duration;

            if (actualGridValue > 0) {
                splitGlobal = Math.round(splitGlobal / actualGridValue) * actualGridValue;
            }

            const MIN = 0.02;
            splitGlobal = Math.max(inst.startTime + MIN, Math.min(splitGlobal, inst.startTime + inst.duration - MIN));

            e.target.value = ((splitGlobal - inst.startTime) / inst.duration) * 100;
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
                setCurrentPattern(sliceInstance(pattern, instId, splitRatio));
                editorState.activeOverlayId = null;
                app.persistAppState();
                renderRhythmTimeline();
            }
        } else if (e.target.classList.contains('btn-do-fill')) {
            e.stopPropagation();
            const instId = e.target.dataset.id;
            app.saveHistoryState();
            setCurrentPattern(expandInstance(getCurrentPattern(), instId));
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        }
    });
}