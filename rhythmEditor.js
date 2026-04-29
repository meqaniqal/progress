import { initChordPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, generateId } from './patternUtils.js?v=3';

const editorState = {
    activeIndex: null,
    activeOverlayId: null,
    isDragging: false,
    isResizing: null,
    draggedInstanceId: null,
    clipboardPattern: null
};

let app = {}; // Stores references to global state and injected callbacks

const GRID_STEPS = [
    { label: 'Off', value: 0 },
    { label: '1/4', value: 0.25 },
    { label: '1/4T', value: 0.25 * (2/3) },
    { label: '1/8', value: 0.125 },
    { label: '1/8T', value: 0.125 * (2/3) },
    { label: '1/16', value: 0.0625 }
];

export function initRhythmEditor(config) {
    app = config;

    const closeBtn = document.getElementById('btn-close-rhythm');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (app.onClose) app.onClose();
        });
    }

    // --- Grid Slider Setup ---
    const gridSlider = document.getElementById('rhythm-grid-slider');
    const gridDisplay = document.getElementById('grid-display-value');
    gridSlider.addEventListener('input', (e) => {
        gridDisplay.textContent = GRID_STEPS[parseInt(e.target.value, 10)].label;
    });

    // --- Arp Controls Setup ---
    const applyArpBtn = document.getElementById('btn-apply-arp');
    
    let styleSelect = document.getElementById('arp-style-select');
    if (!styleSelect) {
        styleSelect = document.createElement('select');
        styleSelect.id = 'arp-style-select';
        styleSelect.className = 'rhythm-select';
        styleSelect.title = 'Arpeggiator Style';
        styleSelect.innerHTML = `
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="upDown">Up/Down</option>
            <option value="downUp">Down/Up</option>
            <option value="random">Random</option>
        `;
        applyArpBtn.parentNode.insertBefore(styleSelect, applyArpBtn.nextSibling);
    }

    let rateSelect = document.getElementById('arp-rate-select');
    if (!rateSelect) {
        rateSelect = document.createElement('select');
        rateSelect.id = 'arp-rate-select';
        rateSelect.className = 'rhythm-select';
        rateSelect.title = 'Arpeggiator Rate';
        rateSelect.innerHTML = `
            <option value="segment">Segment</option>
            <option value="1/4">1/4</option>
            <option value="1/8">1/8</option>
            <option value="1/8t">1/8t (Triplet)</option>
            <option value="1/16">1/16</option>
            <option value="1/16t">1/16t (Triplet)</option>
            <option value="1/32">1/32</option>
        `;
        styleSelect.parentNode.insertBefore(rateSelect, styleSelect.nextSibling);
    }

    function handleArpDropdownChange() {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord || !chord.pattern) return;

        const selectedInsts = chord.pattern.instances.filter(i => i.isSelected);
        // Update settings in real-time if an arp is already active on the selection
        if (selectedInsts.length > 0 && selectedInsts[0].arpSettings !== null) {
            const newSettings = {
                style: styleSelect.value,
                rate: rateSelect.value,
                gate: 0.9 
            };
            app.saveHistoryState();
            chord.pattern = applyArpSettings(chord.pattern, selectedInsts.map(i => i.id), newSettings);
            app.persistAppState();
            renderRhythmTimeline();
        }
    }

    styleSelect.addEventListener('change', handleArpDropdownChange);
    rateSelect.addEventListener('change', handleArpDropdownChange);

    // --- Apply / Toggle Arp Button ---
    applyArpBtn.addEventListener('click', () => {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord || !chord.pattern) return;

        const selectedInsts = chord.pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) {
            alert("Please select at least one instance using the Select tool.");
            return;
        }

        // Toggle logic: If the first selected block has an arp, remove it. Otherwise, add a default arp.
        const hasArp = selectedInsts[0].arpSettings !== null;
        const newSettings = hasArp ? null : { style: styleSelect.value, rate: rateSelect.value, gate: 0.9 };

        app.saveHistoryState();
        chord.pattern = applyArpSettings(chord.pattern, selectedInsts.map(i => i.id), newSettings);
        app.persistAppState();
        renderRhythmTimeline();
    });

    // --- Copy & Paste Buttons ---
    const btnCopy = document.getElementById('btn-rhythm-copy');
    const btnPaste = document.getElementById('btn-rhythm-paste');

    btnCopy.addEventListener('click', () => {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord || !chord.pattern) return;
        
        // Deep copy the pattern to the clipboard
        editorState.clipboardPattern = JSON.parse(JSON.stringify(chord.pattern));
        btnPaste.disabled = false;
        
        // UX Feedback
        const originalText = btnCopy.innerHTML;
        btnCopy.innerHTML = '✓ Copied!';
        setTimeout(() => btnCopy.innerHTML = originalText, 1500);
    });

    btnPaste.addEventListener('click', () => {
        if (editorState.activeIndex === null || !editorState.clipboardPattern) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord) return;
        
        app.saveHistoryState();
        
        // Deep copy from clipboard and regenerate IDs to prevent cross-chord collisions
        const pastedPattern = JSON.parse(JSON.stringify(editorState.clipboardPattern));
        pastedPattern.instances.forEach(inst => inst.id = generateId());
        
        chord.pattern = pastedPattern;
        app.persistAppState();
        renderRhythmTimeline();
    });

    // --- Reset & Delete Buttons ---
    document.getElementById('btn-rhythm-reset').addEventListener('click', () => {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord) return;
        app.saveHistoryState();
        chord.pattern = initChordPattern();
        editorState.activeOverlayId = null;
        app.persistAppState();
        renderRhythmTimeline();
    });

    document.getElementById('btn-rhythm-delete').addEventListener('click', () => {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord || !chord.pattern) return;
        app.saveHistoryState();
        chord.pattern = { ...chord.pattern, instances: chord.pattern.instances.filter(i => !i.isSelected) };
        editorState.activeOverlayId = null;
        app.persistAppState();
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
        if (editorState.activeOverlayId) {
            editorState.activeOverlayId = null;
            renderRhythmTimeline(); // Close the overlay if clicking elsewhere
        }

        const resizeHandle = e.target.closest('.resize-handle');
        if (resizeHandle) {
            e.stopPropagation();
            if (editorState.activeIndex === null) return;
            
            const instanceEl = resizeHandle.closest('.rhythm-instance');
            const instId = instanceEl.dataset.id;
            
            editorState.isResizing = resizeHandle.classList.contains('left') ? 'left' : 'right';
            editorState.draggedInstanceId = instId;
            
            timeline.setPointerCapture(e.pointerId);
            app.saveHistoryState();
            
            const chord = app.state.currentProgression[editorState.activeIndex];
            if (chord && chord.pattern) {
                const currentInst = chord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    chord.pattern = exclusiveSelect(chord.pattern, editorState.draggedInstanceId);
                }
            }
            return;
        }

        const instanceEl = e.target.closest('.rhythm-instance');
        const now = Date.now();

        if (!instanceEl) {
            if (editorState.activeIndex === null) return;
            // Manual double-tap detection for empty timeline areas
            if (now - lastTapTime < 300 && lastTapId === 'empty') {
                const chord = app.state.currentProgression[editorState.activeIndex];
                if (!chord || !chord.pattern) return;

                const rect = timeline.getBoundingClientRect();
                const clickRatio = (e.clientX - rect.left) / rect.width;

                app.saveHistoryState();
                chord.pattern = fillGapInstance(chord.pattern, clickRatio);
                app.persistAppState();
                renderRhythmTimeline();
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;
            lastTapId = 'empty';
            return;
        }

        if (editorState.activeIndex === null) return;
        
        const instId = instanceEl.dataset.id;

        // Manual double-tap detection for slice instances
        if (now - lastTapTime < 300 && lastTapId === instId) {
            e.stopPropagation();
            editorState.activeOverlayId = instId;
            renderRhythmTimeline();
            lastTapTime = 0;
            return;
        }
        
        lastTapTime = now;
        lastTapId = instId;

        const chord = app.state.currentProgression[editorState.activeIndex];
        if (!chord || !chord.pattern) return;

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        editorState.draggedInstanceId = instId;
        editorState.isDragging = false;
        
        timeline.setPointerCapture(e.pointerId);
        
        const inst = chord.pattern.instances.find(i => i.id === instId);
        originalStartTime = inst ? inst.startTime : 0;
        originalDuration = inst ? inst.duration : 0;
        
        longPressTimer = setTimeout(() => {
            editorState.isDragging = true;
            app.saveHistoryState();
            
            // Auto-select on long press
            const currentChord = app.state.currentProgression[editorState.activeIndex];
            const currentInst = currentChord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            if (currentInst && !currentInst.isSelected) {
                currentChord.pattern = exclusiveSelect(currentChord.pattern, editorState.draggedInstanceId);
            }

            renderRhythmTimeline(); // Apply grabbing visuals via state
        }, 250);
    });

    timeline.addEventListener('pointermove', (e) => {
        if (editorState.isResizing && editorState.draggedInstanceId) {
            const rect = timeline.getBoundingClientRect();
            let newTime = (e.clientX - rect.left) / rect.width;

            const chord = app.state.currentProgression[editorState.activeIndex];

            // Grid Snapping Math
            const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
            const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));
            if (actualGridValue > 0 && !e.shiftKey) {
                newTime = Math.round(newTime / actualGridValue) * actualGridValue;
            }

            const inst = chord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
            const newPattern = resizeInstance(chord.pattern, editorState.draggedInstanceId, editorState.isResizing, newTime);
            const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
            
            // Pure state diff check: Only re-render if the math ACTUALLY changed the instance bounds
            if (inst && updatedInst && (updatedInst.startTime !== inst.startTime || updatedInst.duration !== inst.duration)) {
                chord.pattern = newPattern;
                renderRhythmTimeline();
            }
            return;
        }

        if (editorState.draggedInstanceId && !editorState.isDragging) {
            if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) {
                // User moved past the threshold, initiate drag immediately!
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                editorState.isDragging = true;
                app.saveHistoryState();

                // Auto-select on drag start
                const chord = app.state.currentProgression[editorState.activeIndex];
                if (chord && chord.pattern) {
                    const inst = chord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
                    if (inst && !inst.isSelected) {
                        chord.pattern = exclusiveSelect(chord.pattern, editorState.draggedInstanceId);
                    }
                }
                renderRhythmTimeline();
            }
        }

        if (!editorState.isDragging || !editorState.draggedInstanceId) return;
        
        const deltaX = e.clientX - dragStartX;
        const rect = timeline.getBoundingClientRect();
        const deltaRatio = deltaX / rect.width;
        
        let newStartTime = originalStartTime + deltaRatio;

        const chord = app.state.currentProgression[editorState.activeIndex];

        // Grid Snapping Math
        const gridValue = GRID_STEPS[parseInt(document.getElementById('rhythm-grid-slider').value, 10)].value;
        const actualGridValue = gridValue * (4 / (Number(chord.duration) || 4));
        if (actualGridValue > 0 && !e.shiftKey) {
            newStartTime = Math.round(newStartTime / actualGridValue) * actualGridValue;
        }

        const inst = chord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
        const newPattern = moveInstance(chord.pattern, editorState.draggedInstanceId, newStartTime, originalDuration);
        const updatedInst = newPattern.instances.find(i => i.id === editorState.draggedInstanceId);
        
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
            const chord = app.state.currentProgression[editorState.activeIndex];
            const inst = chord.pattern.instances.find(i => i.id === editorState.draggedInstanceId);
            if (inst) {
                app.saveHistoryState();
                chord.pattern = exclusiveSelect(chord.pattern, editorState.draggedInstanceId);
                app.persistAppState();
                renderRhythmTimeline();
            }
            editorState.draggedInstanceId = null;
        }
    });

    timeline.addEventListener('pointercancel', (e) => {
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
            const chord = app.state.currentProgression[editorState.activeIndex];
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
            
            const chord = app.state.currentProgression[editorState.activeIndex];
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
                app.saveHistoryState();
                chord.pattern = sliceInstance(chord.pattern, instId, splitRatio);
                chord.pattern.instances = chord.pattern.instances.map(i => ({ ...i, isSelected: false }));
                editorState.activeOverlayId = null;
                app.persistAppState();
                renderRhythmTimeline();
            }
        } else if (e.target.classList.contains('btn-do-fill')) {
            e.stopPropagation();
            const instId = e.target.dataset.id;
            const chord = app.state.currentProgression[editorState.activeIndex];
            app.saveHistoryState();
            chord.pattern = expandInstance(chord.pattern, instId);
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        }
    });
}

export function openRhythmEditor(index) {
    editorState.activeIndex = index;
    
    const chord = app.state.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    document.getElementById('rhythm-editor-title').textContent = `Rhythm Editor: ${chord.symbol}`;
    
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

function renderRhythmTimeline() {
    const container = document.getElementById('rhythm-timeline');
    if (editorState.activeIndex === null) {
        container.innerHTML = '';
        return;
    }
    
    const chord = app.state.currentProgression[editorState.activeIndex];
    const pattern = chord.pattern || { instances: [] };
    
    // Sync Arp Dropdowns with current selection
    const styleSelect = document.getElementById('arp-style-select');
    const rateSelect = document.getElementById('arp-rate-select');
    if (styleSelect && rateSelect) {
        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length > 0 && selectedInsts[0].arpSettings) {
            styleSelect.value = selectedInsts[0].arpSettings.style || 'up';
            rateSelect.value = selectedInsts[0].arpSettings.rate || 'segment';
        }
    }

    // 1. Remove obsolete nodes to prevent memory leaks and ghost elements
    const existingNodes = Array.from(container.querySelectorAll('.rhythm-instance'));
    const newIds = new Set(pattern.instances.map(i => i.id));
    existingNodes.forEach(node => {
        if (!newIds.has(node.dataset.id)) node.remove();
    });

    // 2. Update existing nodes or create new ones
    pattern.instances.forEach(inst => {
        let el = container.querySelector(`.rhythm-instance[data-id="${inst.id}"]`);
        
        if (!el) {
            el = document.createElement('div');
            el.dataset.id = inst.id;
            
            const leftHandle = document.createElement('div');
            leftHandle.className = 'resize-handle left';
            el.appendChild(leftHandle);
            
            const rightHandle = document.createElement('div');
            rightHandle.className = 'resize-handle right';
            el.appendChild(rightHandle);
            
            container.appendChild(el);
        }

        el.className = 'rhythm-instance';
        if (inst.isSelected) el.classList.add('selected');
        if (inst.arpSettings) el.classList.add('arp-active');
        if (editorState.isDragging && inst.id === editorState.draggedInstanceId) el.classList.add('grabbing');
        
        el.style.left = `${inst.startTime * 100}%`;
        el.style.width = `${inst.duration * 100}%`;
        
        let overlay = el.querySelector('.slice-overlay');

        if (editorState.activeOverlayId === inst.id) {
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
            const hasSlider = inst.duration > 0.05;

            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'slice-overlay';
                el.appendChild(overlay);
            }

            // Only update innerHTML if structural conditions changed to preserve native slider drag state
            if (overlay.dataset.canFill !== String(canFill) || overlay.dataset.hasSlider !== String(hasSlider)) {
                let html = '';
                if (hasSlider) html += `<input type="range" class="slice-range" min="5" max="95" value="50" data-id="${inst.id}">`;
                
                let actionsHtml = '';
                if (hasSlider) actionsHtml += `<button class="slice-overlay-btn btn-do-slice" data-id="${inst.id}">✂ Split</button>`;
                if (canFill) actionsHtml += `<button class="slice-overlay-btn btn-do-fill" data-id="${inst.id}">↔ Fill</button>`;
                if (actionsHtml !== '') html += `<div class="slice-actions">${actionsHtml}</div>`;
                
                overlay.innerHTML = html;
                overlay.dataset.canFill = String(canFill);
                overlay.dataset.hasSlider = String(hasSlider);
            }
        } else if (overlay) {
            overlay.remove();
        }
    });
}