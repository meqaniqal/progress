import { initChordPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, generateId, resolvePattern } from './patternUtils.js';

const editorState = {
    activeIndex: null,
    activeOverlayId: null,
    isDragging: false,
    isResizing: null,
    draggedInstanceId: null,
    clipboardPattern: null,
    gridStepIndex: 5, // Default to 1/16th note
    activeTab: 'chordPattern', // 'chordPattern', 'bassPattern', 'drumPattern'
    isGlobal: false // false = Local Override, true = Global Pattern
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

function hasValidContext() {
    if (editorState.isGlobal) return true;
    return editorState.activeIndex !== null && app.state.currentProgression[editorState.activeIndex] != null;
}

function getCurrentPattern() {
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

function setCurrentPattern(newPattern, markAsOverride = true) {
    if (editorState.isGlobal) {
        app.state.globalPatterns[editorState.activeTab] = newPattern;
    } else {
        if (editorState.activeIndex === null) return;
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (chord) {
            if (markAsOverride) newPattern.isLocalOverride = true;
            chord[editorState.activeTab] = newPattern;
        }
    }
}

function getDurationBeats() {
    if (editorState.isGlobal) return 4;
    if (editorState.activeIndex === null) return 4;
    const chord = app.state.currentProgression[editorState.activeIndex];
    return chord ? (Number(chord.duration) || 4) : 4;
}

/** Sets up the 'Chords' | 'Bass' | 'Drums' tabs and the 'Global' | 'Local' toggle. */
function _setupTabsAndToggles() {
    // --- Tabs & Global/Local Toggle Setup ---
    const tabs = document.querySelectorAll('.pattern-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            editorState.activeTab = e.target.dataset.tab;
            renderRhythmTimeline();
        });
    });

    const toggles = document.querySelectorAll('.toggle-btn');
    toggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent foldaway header collapse
            toggles.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            editorState.isGlobal = e.target.dataset.mode === 'global';
            renderRhythmTimeline();
        });
    });
}

/** Sets up the grid snapping slider. */
function _setupGridSlider() {
    const gridSlider = document.getElementById('rhythm-grid-slider');
    const gridDisplay = document.getElementById('grid-display-value');
    
    if (gridSlider) editorState.gridStepIndex = parseInt(gridSlider.value, 10);
    
    gridSlider.addEventListener('input', (e) => {
        editorState.gridStepIndex = parseInt(e.target.value, 10);
        gridDisplay.textContent = GRID_STEPS[editorState.gridStepIndex].label;
    });
}

/** Sets up the arpeggiator controls and apply button. */
function _setupArpControls() {
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
        if (editorState.activeTab !== 'chordPattern') return;
        const pattern = getCurrentPattern();
        if (!pattern) return;

        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        // Update settings in real-time if an arp is already active on the selection
        if (selectedInsts.length > 0 && selectedInsts[0].arpSettings !== null) {
            const newSettings = {
                style: styleSelect.value,
                rate: rateSelect.value,
                gate: 0.9 
            };
            app.saveHistoryState();
            setCurrentPattern(applyArpSettings(pattern, selectedInsts.map(i => i.id), newSettings));
            app.persistAppState();
            renderRhythmTimeline();
        }
    }

    styleSelect.addEventListener('change', handleArpDropdownChange);
    rateSelect.addEventListener('change', handleArpDropdownChange);

    // --- Apply / Toggle Arp Button ---
    applyArpBtn.addEventListener('click', () => {
        if (editorState.activeTab !== 'chordPattern') return;
        const pattern = getCurrentPattern();
        if (!pattern) return;

        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) {
            alert("Please select at least one instance using the Select tool.");
            return;
        }

        // Toggle logic: If the first selected block has an arp, remove it. Otherwise, add a default arp.
        const hasArp = selectedInsts[0].arpSettings !== null;
        const newSettings = hasArp ? null : { style: styleSelect.value, rate: rateSelect.value, gate: 0.9 };

        app.saveHistoryState();
        setCurrentPattern(applyArpSettings(pattern, selectedInsts.map(i => i.id), newSettings));
        app.persistAppState();
        renderRhythmTimeline();
    });
}

/** Sets up the Copy, Paste, Reset, and Delete buttons in the toolbar. */
function _setupToolbarButtons() {
    // --- Copy & Paste Buttons ---
    const btnCopy = document.getElementById('btn-rhythm-copy');
    const btnPaste = document.getElementById('btn-rhythm-paste');

    btnCopy.addEventListener('click', () => {
        const pattern = getCurrentPattern();
        if (!pattern) return;
        
        // Deep copy the pattern to the clipboard
        editorState.clipboardPattern = JSON.parse(JSON.stringify(pattern));
        btnPaste.disabled = false;
        
        // UX Feedback
        const originalText = btnCopy.innerHTML;
        btnCopy.innerHTML = '✓ Copied!';
        setTimeout(() => btnCopy.innerHTML = originalText, 1500);
    });

    btnPaste.addEventListener('click', () => {
        if (!editorState.clipboardPattern) return;
        const pattern = getCurrentPattern();
        if (!pattern) return;
        
        app.saveHistoryState();
        
        // Deep copy from clipboard and regenerate IDs to prevent cross-chord collisions
        const pastedPattern = JSON.parse(JSON.stringify(editorState.clipboardPattern));
        pastedPattern.instances.forEach(inst => {
            inst.id = generateId();
            if (editorState.activeTab !== 'chordPattern') {
                inst.arpSettings = null; // Strip arps if pasting into Bass or Drums
            }
        });
        
        setCurrentPattern(pastedPattern);
        app.persistAppState();
        renderRhythmTimeline();
    });

    // --- Reset & Clear Buttons ---
    const btnReset = document.getElementById('btn-rhythm-reset');
    const btnClear = document.getElementById('btn-rhythm-clear');

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (editorState.isGlobal || editorState.activeIndex === null) return;
            app.saveHistoryState();
            const chord = app.state.currentProgression[editorState.activeIndex];
            if (chord && chord[editorState.activeTab]) {
                chord[editorState.activeTab].isLocalOverride = false;
            }
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            const pattern = getCurrentPattern();
            if (!pattern) return;
            app.saveHistoryState();
            const clearedPat = initChordPattern();
            if (!editorState.isGlobal) {
                clearedPat.isLocalOverride = true;
            }
            setCurrentPattern(clearedPat, true);
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    document.getElementById('btn-rhythm-delete').addEventListener('click', () => {
        const pattern = getCurrentPattern();
        if (!pattern) return;
        app.saveHistoryState();
        setCurrentPattern({ ...pattern, instances: pattern.instances.filter(i => !i.isSelected) });
        editorState.activeOverlayId = null;
        app.persistAppState();
        renderRhythmTimeline();
    });
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
            if (!hasValidContext()) return;
            
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
                    setCurrentPattern(exclusiveSelect(pattern, editorState.draggedInstanceId), false);
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

                const rect = timeline.getBoundingClientRect();
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

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        editorState.draggedInstanceId = instId;
        editorState.isDragging = false;
        
        timeline.setPointerCapture(e.pointerId);
        
        const inst = pattern.instances.find(i => i.id === instId);
        originalStartTime = inst ? inst.startTime : 0;
        originalDuration = inst ? inst.duration : 0;
        
        longPressTimer = setTimeout(() => {
            editorState.isDragging = true;
            app.saveHistoryState();
            
            // Auto-select on long press
            const pat = getCurrentPattern();
            if (pat) {
                const currentInst = pat.instances.find(i => i.id === editorState.draggedInstanceId);
                if (currentInst && !currentInst.isSelected) {
                    setCurrentPattern(exclusiveSelect(pat, editorState.draggedInstanceId), false);
                }
            }

            renderRhythmTimeline(); // Apply grabbing visuals via state
        }, 250);
    });

    timeline.addEventListener('pointermove', (e) => {
        if (editorState.isResizing && editorState.draggedInstanceId) {
            if (!hasValidContext()) return;
            const rect = timeline.getBoundingClientRect();
            let newTime = (e.clientX - rect.left) / rect.width;

            // Grid Snapping Math
            const gridValue = GRID_STEPS[editorState.gridStepIndex].value;
            const actualGridValue = gridValue * (4 / getDurationBeats());
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
            if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) {
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
                        setCurrentPattern(exclusiveSelect(pat, editorState.draggedInstanceId), false);
                    }
                }
                renderRhythmTimeline();
            }
        }

        if (!editorState.isDragging || !editorState.draggedInstanceId) return;
        if (!hasValidContext()) return;
        
        const deltaX = e.clientX - dragStartX;
        const rect = timeline.getBoundingClientRect();
        const deltaRatio = deltaX / rect.width;
        
        let newStartTime = originalStartTime + deltaRatio;

        // Grid Snapping Math
        const gridValue = GRID_STEPS[editorState.gridStepIndex].value;
        const actualGridValue = gridValue * (4 / getDurationBeats());
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
                    setCurrentPattern(exclusiveSelect(pattern, editorState.draggedInstanceId), false);
                    app.persistAppState();
                    renderRhythmTimeline();
                }
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
            const gridValue = GRID_STEPS[editorState.gridStepIndex].value;
            const actualGridValue = gridValue * (4 / getDurationBeats());

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
                const gridValue = GRID_STEPS[editorState.gridStepIndex].value;
                const actualGridValue = gridValue * (4 / getDurationBeats());
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
                newPattern.instances = newPattern.instances.map(i => ({ ...i, isSelected: false }));
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

export function initRhythmEditor(config) {
    app = config;

    _setupTabsAndToggles();
    _setupGridSlider();
    _setupArpControls();
    _setupToolbarButtons();
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

function renderRhythmTimeline() {
    const container = document.getElementById('rhythm-timeline');
    if (!editorState.isGlobal && editorState.activeIndex === null) {
        container.innerHTML = '';
        return;
    }
    
    const pattern = getCurrentPattern() || { instances: [] };
    
    // Dynamic panel title
    const titleEl = document.getElementById('rhythm-editor-title');
    if (titleEl) {
        const tabNames = { chordPattern: 'Chords', bassPattern: 'Bass', drumPattern: 'Drums' };
        if (editorState.isGlobal) {
            titleEl.textContent = `Global Pattern: ${tabNames[editorState.activeTab]}`;
        } else {
            const chord = app.state.currentProgression[editorState.activeIndex];
            const isOverride = chord && chord[editorState.activeTab] && chord[editorState.activeTab].isLocalOverride;
            titleEl.textContent = chord ? `Pattern Editor: ${chord.symbol} (${tabNames[editorState.activeTab]})${isOverride ? ' [Override]' : ' [Inherited]'}` : 'Pattern Editor';
        }
    }
    
    const btnReset = document.getElementById('btn-rhythm-reset');
    if (btnReset) {
        btnReset.style.display = editorState.isGlobal ? 'none' : 'inline-block';
        if (!editorState.isGlobal) {
            const chord = app.state.currentProgression[editorState.activeIndex];
            const isOverride = chord && chord[editorState.activeTab] && chord[editorState.activeTab].isLocalOverride;
            btnReset.style.opacity = isOverride ? '1' : '0.5';
            btnReset.disabled = !isOverride;
        }
    }

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

    const applyArpBtn = document.getElementById('btn-apply-arp');
    const isChordTab = editorState.activeTab === 'chordPattern';
    if (applyArpBtn) applyArpBtn.style.display = isChordTab ? 'inline-block' : 'none';
    if (styleSelect) styleSelect.style.display = isChordTab ? 'inline-block' : 'none';
    if (rateSelect) rateSelect.style.display = isChordTab ? 'inline-block' : 'none';

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
        if (inst.arpSettings && isChordTab) el.classList.add('arp-active');
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