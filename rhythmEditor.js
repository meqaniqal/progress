import { initChordPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, generateId } from './patternUtils.js?v=3';

let activeRhythmIndex = null;
let activeOverlayId = null;
let isDragging = false;
let isResizing = null;
let draggedInstanceId = null;
let clipboardPattern = null;

// App state references
let appState = null;
let dispatchSaveHistory = null;
let dispatchPersist = null;
let dispatchRender = null;
let dispatchOnClose = null;

const GRID_STEPS = [
    { label: 'Off', value: 0 },
    { label: '1/4', value: 0.25 },
    { label: '1/4T', value: 0.25 * (2/3) },
    { label: '1/8', value: 0.125 },
    { label: '1/8T', value: 0.125 * (2/3) },
    { label: '1/16', value: 0.0625 }
];

export function initRhythmEditor({ state, saveHistoryState, persistAppState, renderProgression, onClose }) {
    appState = state;
    dispatchSaveHistory = saveHistoryState;
    dispatchPersist = persistAppState;
    dispatchRender = renderProgression;
    dispatchOnClose = onClose;

    document.getElementById('btn-close-rhythm').addEventListener('click', () => {
        if (dispatchOnClose) dispatchOnClose();
    });

    // --- Grid Slider Setup ---
    const gridSlider = document.getElementById('rhythm-grid-slider');
    const gridDisplay = document.getElementById('grid-display-value');
    gridSlider.addEventListener('input', (e) => {
        gridDisplay.textContent = GRID_STEPS[parseInt(e.target.value, 10)].label;
    });

    // --- Apply Arp Button ---
    document.getElementById('btn-apply-arp').addEventListener('click', () => {
        if (activeRhythmIndex === null) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;

        const selectedInsts = chord.pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) {
            alert("Please select at least one instance using the Select tool.");
            return;
        }

        // Toggle logic: If the first selected block has an arp, remove it. Otherwise, add a default arp.
        const hasArp = selectedInsts[0].arpSettings !== null;
        const newSettings = hasArp ? null : { style: 'up', rate: 0.25, gate: 0.8 };

        dispatchSaveHistory();
        chord.pattern = applyArpSettings(chord.pattern, selectedInsts.map(i => i.id), newSettings);
        dispatchPersist();
        renderRhythmTimeline();
    });

    // --- Copy & Paste Buttons ---
    const btnCopy = document.getElementById('btn-rhythm-copy');
    const btnPaste = document.getElementById('btn-rhythm-paste');

    btnCopy.addEventListener('click', () => {
        if (activeRhythmIndex === null) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;
        
        // Deep copy the pattern to the clipboard
        clipboardPattern = JSON.parse(JSON.stringify(chord.pattern));
        btnPaste.disabled = false;
        
        // UX Feedback
        const originalText = btnCopy.innerHTML;
        btnCopy.innerHTML = '✓ Copied!';
        setTimeout(() => btnCopy.innerHTML = originalText, 1500);
    });

    btnPaste.addEventListener('click', () => {
        if (activeRhythmIndex === null || !clipboardPattern) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord) return;
        
        dispatchSaveHistory();
        
        // Deep copy from clipboard and regenerate IDs to prevent cross-chord collisions
        const pastedPattern = JSON.parse(JSON.stringify(clipboardPattern));
        pastedPattern.instances.forEach(inst => inst.id = generateId());
        
        chord.pattern = pastedPattern;
        dispatchPersist();
        renderRhythmTimeline();
    });

    // --- Reset & Delete Buttons ---
    document.getElementById('btn-rhythm-reset').addEventListener('click', () => {
        if (activeRhythmIndex === null) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord) return;
        dispatchSaveHistory();
        chord.pattern = initChordPattern();
        activeOverlayId = null;
        dispatchPersist();
        renderRhythmTimeline();
    });

    document.getElementById('btn-rhythm-delete').addEventListener('click', () => {
        if (activeRhythmIndex === null) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;
        dispatchSaveHistory();
        chord.pattern = { ...chord.pattern, instances: chord.pattern.instances.filter(i => !i.isSelected) };
        activeOverlayId = null;
        dispatchPersist();
        renderRhythmTimeline();
    });

    // --- Timeline Interactions (Pointer Events for Mobile + Desktop) ---
    const timeline = document.getElementById('rhythm-timeline');
    let dragStartX = 0;
    let dragStartY = 0;
    let originalStartTime = 0;
    let originalDuration = 0;
    let longPressTimer = null;
    let lastTapTime = 0;
    let lastTapId = null;

    timeline.addEventListener('pointerdown', (e) => {
        // Ignore interactions if we click inside the active overlay
        if (e.target.closest('.slice-overlay')) {
            e.stopPropagation();
            return;
        }
        if (activeOverlayId) {
            activeOverlayId = null;
            renderRhythmTimeline(); // Close the overlay if clicking elsewhere
        }

        const resizeHandle = e.target.closest('.resize-handle');
        if (resizeHandle) {
            e.stopPropagation();
            if (activeRhythmIndex === null) return;
            
            const instanceEl = resizeHandle.closest('.rhythm-instance');
            const instId = instanceEl.dataset.id;
            
            isResizing = resizeHandle.classList.contains('left') ? 'left' : 'right';
            draggedInstanceId = instId;
            
            timeline.setPointerCapture(e.pointerId);
            dispatchSaveHistory();
            
            const chord = appState.currentProgression[activeRhythmIndex];
            if (chord && chord.pattern) {
                const currentInst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    chord.pattern = exclusiveSelect(chord.pattern, draggedInstanceId);
                }
            }
            return;
        }

        const instanceEl = e.target.closest('.rhythm-instance');
        const now = Date.now();

        if (!instanceEl) {
            if (activeRhythmIndex === null) return;
            // Manual double-tap detection for empty timeline areas
            if (now - lastTapTime < 300 && lastTapId === 'empty') {
                const chord = appState.currentProgression[activeRhythmIndex];
                if (!chord || !chord.pattern) return;

                const rect = timeline.getBoundingClientRect();
                const clickRatio = (e.clientX - rect.left) / rect.width;

                dispatchSaveHistory();
                chord.pattern = fillGapInstance(chord.pattern, clickRatio);
                dispatchPersist();
                renderRhythmTimeline();
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;
            lastTapId = 'empty';
            return;
        }

        if (activeRhythmIndex === null) return;
        
        const instId = instanceEl.dataset.id;

        // Manual double-tap detection for slice instances
        if (now - lastTapTime < 300 && lastTapId === instId) {
            e.stopPropagation();
            activeOverlayId = instId;
            renderRhythmTimeline();
            lastTapTime = 0;
            return;
        }
        
        lastTapTime = now;
        lastTapId = instId;

        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        draggedInstanceId = instId;
        isDragging = false;
        
        timeline.setPointerCapture(e.pointerId);
        
        const inst = chord.pattern.instances.find(i => i.id === instId);
        originalStartTime = inst ? inst.startTime : 0;
        originalDuration = inst ? inst.duration : 0;
        
        longPressTimer = setTimeout(() => {
            isDragging = true;
            dispatchSaveHistory();
            
            // Auto-select on long press
            const currentChord = appState.currentProgression[activeRhythmIndex];
            const currentInst = currentChord.pattern.instances.find(i => i.id === draggedInstanceId);
            if (currentInst && !currentInst.isSelected) {
                currentChord.pattern = exclusiveSelect(currentChord.pattern, draggedInstanceId);
            }

            renderRhythmTimeline(); // Apply grabbing visuals via state
        }, 250);
    });

    timeline.addEventListener('pointermove', (e) => {
        if (isResizing && draggedInstanceId) {
            const rect = timeline.getBoundingClientRect();
            let newTime = (e.clientX - rect.left) / rect.width;

            const chord = appState.currentProgression[activeRhythmIndex];

            // Grid Snapping Math
            const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
            const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));
            if (actualGridValue > 0 && !e.shiftKey) {
                newTime = Math.round(newTime / actualGridValue) * actualGridValue;
            }

            const inst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
            
            const newPattern = resizeInstance(chord.pattern, draggedInstanceId, isResizing, newTime);
            const updatedInst = newPattern.instances.find(i => i.id === draggedInstanceId);
            
            // Pure state diff check: Only re-render if the math ACTUALLY changed the instance bounds
            if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
                chord.pattern = newPattern;
                renderRhythmTimeline();
            }
            return;
        }

        if (draggedInstanceId && !isDragging) {
            if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) {
                // User moved past the threshold, initiate drag immediately!
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                isDragging = true;
                dispatchSaveHistory();

                // Auto-select on drag start
                const chord = appState.currentProgression[activeRhythmIndex];
                if (chord && chord.pattern) {
                    const inst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
                    if (inst && !inst.isSelected) {
                        chord.pattern = exclusiveSelect(chord.pattern, draggedInstanceId);
                    }
                }
                renderRhythmTimeline();
            }
        }

        if (!isDragging || !draggedInstanceId) return;
        
        const deltaX = e.clientX - dragStartX;
        const rect = timeline.getBoundingClientRect();
        const deltaRatio = deltaX / rect.width;
        
        let newStartTime = originalStartTime + deltaRatio;

        const chord = appState.currentProgression[activeRhythmIndex];

        // Grid Snapping Math
        const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
        const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));
        if (actualGridValue > 0 && !e.shiftKey) {
            newStartTime = Math.round(newStartTime / actualGridValue) * actualGridValue;
        }

        const inst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
        
        const newPattern = moveInstance(chord.pattern, draggedInstanceId, newStartTime, originalDuration);
        const updatedInst = newPattern.instances.find(i => i.id === draggedInstanceId);
        
        // Pure state diff check: Only re-render if the math ACTUALLY changed the instance bounds
        if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
            chord.pattern = newPattern;
            renderRhythmTimeline();
        }
    });

    timeline.addEventListener('pointerup', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (isResizing) {
            isResizing = null;
            timeline.releasePointerCapture(e.pointerId);
            dispatchPersist();
            renderRhythmTimeline();
            draggedInstanceId = null;
            return;
        }

        if (isDragging) {
            isDragging = false;
            timeline.releasePointerCapture(e.pointerId);
            dispatchPersist();
            renderRhythmTimeline();
            draggedInstanceId = null;
        } else if (draggedInstanceId) {
            timeline.releasePointerCapture(e.pointerId);
            const chord = appState.currentProgression[activeRhythmIndex];
            const inst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
            if (inst) {
                dispatchSaveHistory();
                chord.pattern = exclusiveSelect(chord.pattern, draggedInstanceId);
                dispatchPersist();
                renderRhythmTimeline();
            }
            draggedInstanceId = null;
        }
    });

    timeline.addEventListener('pointercancel', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        if (isResizing) {
            isResizing = null;
            timeline.releasePointerCapture(e.pointerId);
            draggedInstanceId = null;
            renderRhythmTimeline();
            return;
        }
        
        if (draggedInstanceId) {
            timeline.releasePointerCapture(e.pointerId);
        }
        isDragging = false;
        draggedInstanceId = null;
        renderRhythmTimeline();
    });

    // --- Slider & Overlay Delegation ---
    timeline.addEventListener('input', (e) => {
        if (e.target.classList.contains('slice-range')) {
            const instId = e.target.dataset.id;
            const chord = appState.currentProgression[activeRhythmIndex];
            const inst = chord.pattern.instances.find(i => i.id === instId);
            const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
            const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));

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
            
            const chord = appState.currentProgression[activeRhythmIndex];
            const inst = chord.pattern.instances.find(i => i.id === instId);
            
            if (splitGlobal === undefined) {
                splitGlobal = inst.startTime + (inst.duration / 2);
                const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
                const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));
                if (actualGridValue > 0) {
                    splitGlobal = Math.round(splitGlobal / actualGridValue) * actualGridValue;
                }
            } else {
                splitGlobal = parseFloat(splitGlobal);
            }

            const splitRatio = (splitGlobal - inst.startTime) / inst.duration;
            if (splitRatio >= 0.05 && splitRatio <= 0.95) {
                dispatchSaveHistory();
                chord.pattern = sliceInstance(chord.pattern, instId, splitRatio);
                chord.pattern.instances = chord.pattern.instances.map(i => ({ ...i, isSelected: false }));
                activeOverlayId = null;
                dispatchPersist();
                renderRhythmTimeline();
            }
        } else if (e.target.classList.contains('btn-do-fill')) {
            e.stopPropagation();
            const instId = e.target.dataset.id;
            const chord = appState.currentProgression[activeRhythmIndex];
            dispatchSaveHistory();
            chord.pattern = expandInstance(chord.pattern, instId);
            activeOverlayId = null;
            dispatchPersist();
            renderRhythmTimeline();
        }
    });
}

export function openRhythmEditor(index) {
    activeRhythmIndex = index;
    
    const chord = appState.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    document.getElementById('rhythm-editor-title').textContent = `Rhythm Editor: ${chord.symbol}`;
    
    renderRhythmTimeline();
    
    const panel = document.getElementById('rhythm-editor-panel');
    panel.style.display = 'block';
}

export function closeRhythmEditor() {
    activeRhythmIndex = null;
    activeOverlayId = null;
    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.style.display = 'none';

        const builderPanel = document.getElementById('builder-panel');
        if (builderPanel) builderPanel.style.display = 'block';
        const undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.style.display = '';
}

function renderRhythmTimeline() {
    const container = document.getElementById('rhythm-timeline');
    container.innerHTML = '';
    if (activeRhythmIndex === null) return;
    
    const chord = appState.currentProgression[activeRhythmIndex];
    const pattern = chord.pattern || { instances: [] };
    
    pattern.instances.forEach(inst => {
        const el = document.createElement('div');
        el.className = 'rhythm-instance';
        el.dataset.id = inst.id;
        if (inst.isSelected) el.classList.add('selected');
        if (inst.arpSettings) el.classList.add('arp-active');
        if (isDragging && inst.id === draggedInstanceId) el.classList.add('grabbing');
        
        // The timeline is normalized 0.0 to 1.0, so we convert directly to percentages
        el.style.left = `${inst.startTime * 100}%`;
        el.style.width = `${inst.duration * 100}%`;
        
        const leftHandle = document.createElement('div');
        leftHandle.className = 'resize-handle left';
        el.appendChild(leftHandle);
        
        const rightHandle = document.createElement('div');
        rightHandle.className = 'resize-handle right';
        el.appendChild(rightHandle);
        
        if (activeOverlayId === inst.id) {
            const others = pattern.instances.filter(i => i.id !== inst.id);
            let leftBound = 0.0;
            let rightBound = 1.0;
            const targetCenter = inst.startTime + (inst.duration / 2);
            
            for (const other of others) {
                const otherStart = other.startTime;
                const otherEnd = other.startTime + other.duration;
                const otherCenter = otherStart + (other.duration / 2);
                if (otherCenter < targetCenter) {
                    if (otherEnd > leftBound) leftBound = otherEnd;
                } else {
                    if (otherStart < rightBound) rightBound = otherStart;
                }
            }
            
            const canFill = (inst.startTime > leftBound + 0.01) || ((inst.startTime + inst.duration) < rightBound - 0.01);

            const overlay = document.createElement('div');
            overlay.className = 'slice-overlay';
            
            if (inst.duration > 0.05) {
                overlay.innerHTML = `
                    <input type="range" class="slice-range" min="5" max="95" value="50" data-id="${inst.id}">
                `;
            }

            const actions = document.createElement('div');
            actions.className = 'slice-actions';
            
            if (inst.duration > 0.05) {
                actions.innerHTML += `<button class="slice-overlay-btn btn-do-slice" data-id="${inst.id}">✂ Split</button>`;
            }
            if (canFill) {
                actions.innerHTML += `<button class="slice-overlay-btn btn-do-fill" data-id="${inst.id}">↔ Fill</button>`;
            }
            
            if (actions.innerHTML !== '') {
                overlay.appendChild(actions);
            }
            el.appendChild(overlay);
        }

        container.appendChild(el);
    });
}