import { initChordPattern, initDrumPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, generateId, resolvePattern, addDrumHit, removeDrumHit, updateDrumHit, updateInstance } from './patternUtils.js';
import { playDrum, getAudioCurrentTime } from './synth.js';

const editorState = {
    activeIndex: null,
    activeOverlayId: null,
    isDragging: false,
    isResizing: null,
    draggedInstanceId: null, // For slices
    draggedHitId: null,      // For drum hits
    selectedHitId: null,     // For drum hit velocity editing
    clipboardPattern: null,
    gridStepIndex: 4, // Default to 1/16th note
    isGridEnabled: true,
    zoomLevel: 1.0,
    isPanning: false,
    activeTab: 'chordPattern', // 'chordPattern', 'bassPattern', 'drumPattern'
    isGlobal: false // false = Local Override, true = Global Pattern
};

let app = {}; // Stores references to global state and injected callbacks

const GRID_STEPS = [
    { label: '1/4', value: 0.25 },
    { label: '1/4T', value: 0.25 * (2/3) },
    { label: '1/8', value: 0.125 },
    { label: '1/8T', value: 0.125 * (2/3) },
    { label: '1/16', value: 0.0625 }
];

const DRUM_ROWS = ['ohh', 'chh', 'snare', 'kick'];
const DRUM_ROW_BG_COLORS = {
    'ohh': 'rgba(252, 211, 77, 0.05)',
    'chh': 'rgba(245, 158, 11, 0.05)',
    'snare': 'rgba(59, 130, 246, 0.05)',
    'kick': 'rgba(239, 68, 68, 0.05)'
};
const DRUM_LABELS = {
    'ohh': 'OH',
    'chh': 'CH',
    'snare': 'SN',
    'kick': 'BD'
};

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

function getDurationBeats() {
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
    const btnGridToggle = document.getElementById('btn-grid-toggle');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    
    if (gridSlider) editorState.gridStepIndex = parseInt(gridSlider.value, 10);
    
    if (btnGridToggle) {
        btnGridToggle.addEventListener('click', () => {
            editorState.isGridEnabled = !editorState.isGridEnabled;
            gridSlider.style.display = editorState.isGridEnabled ? 'inline-block' : 'none';
            gridDisplay.textContent = editorState.isGridEnabled ? GRID_STEPS[editorState.gridStepIndex].label : 'Off';
            if (editorState.isGridEnabled) {
                btnGridToggle.classList.add('active');
            } else {
                btnGridToggle.classList.remove('active');
            }
        });
    }

    if (gridSlider) {
        gridSlider.addEventListener('input', (e) => {
            editorState.gridStepIndex = parseInt(e.target.value, 10);
            if (editorState.isGridEnabled) gridDisplay.textContent = GRID_STEPS[editorState.gridStepIndex].label;
        });
    }

    const handleZoom = (delta) => {
        if (editorState.activeTab !== 'drumPattern' || !editorState.isGlobal) return;
        editorState.zoomLevel = Math.max(0.8, Math.min(4.0, editorState.zoomLevel + delta));
        renderRhythmTimeline();
    };

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => handleZoom(0.5));
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => handleZoom(-0.5));
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

/** Sets up the drum specific controls (e.g., Global Length). */
function _setupDrumControls() {
    const btnApplyArp = document.getElementById('btn-apply-arp');
    
    let drumLengthSelect = document.getElementById('drum-length-select');
    if (!drumLengthSelect) {
        drumLengthSelect = document.createElement('select');
        drumLengthSelect.id = 'drum-length-select';
        drumLengthSelect.className = 'rhythm-select';
        drumLengthSelect.title = 'Global Drum Pattern Length';
        drumLengthSelect.innerHTML = `
            <option value="4">4 Beats</option>
            <option value="8">8 Beats</option>
            <option value="16">16 Beats</option>
            <option value="32">32 Beats</option>
        `;
        btnApplyArp.parentNode.insertBefore(drumLengthSelect, btnApplyArp.nextSibling);

        let drumCropBtn = document.createElement('button');
        drumCropBtn.id = 'btn-drum-crop';
        drumCropBtn.className = 'control-btn secondary';
        drumCropBtn.style.padding = '6px 12px';
        drumCropBtn.style.fontSize = '13px';
        drumCropBtn.title = 'Crop hidden out-of-bounds hits';
        drumCropBtn.innerHTML = '✂ Crop';
        drumLengthSelect.parentNode.insertBefore(drumCropBtn, drumLengthSelect.nextSibling);

        drumCropBtn.addEventListener('click', () => {
            const pattern = getCurrentPattern();
            if (!pattern || !pattern.hits) return;
            app.saveHistoryState();
            const croppedHits = pattern.hits.filter(h => h.time < 1.0);
            setCurrentPattern({ ...pattern, hits: croppedHits });
            app.persistAppState();
            renderRhythmTimeline();
        });

        drumLengthSelect.addEventListener('change', (e) => {
            if (editorState.activeTab !== 'drumPattern' || !editorState.isGlobal) return;
            const pattern = getCurrentPattern();
            if (pattern) {
                app.saveHistoryState();
                const newLength = parseInt(e.target.value, 10);
                const oldLength = pattern.lengthBeats || 4;
                
                // Scale the hit times so they stay on their absolute beats
                const scaledHits = (pattern.hits || []).map(h => ({
                    ...h,
                    time: (h.time * oldLength) / newLength
                }));
                
                setCurrentPattern({ ...pattern, lengthBeats: newLength, hits: scaledHits });
                app.persistAppState();
                renderRhythmTimeline();
            }
        });
    }
}

/** Sets up the unified properties controls (Velocity, Probability). */
function _setupPropertiesControls() {
    const velSlider = document.getElementById('prop-velocity-slider');
    const probSlider = document.getElementById('prop-probability-slider');
    
    if (velSlider) {
        velSlider.addEventListener('input', (e) => {
            if (!editorState.selectedHitId || editorState.activeTab !== 'drumPattern') return;
            const pattern = getCurrentPattern();
            if (!pattern) return;
            const newVelocity = parseFloat(e.target.value);
            setCurrentPattern(updateDrumHit(pattern, editorState.selectedHitId, { velocity: newVelocity }), false);
            app.persistAppState();
            renderRhythmTimeline(); // Will re-render and keep the slider at the new value
        });

        velSlider.addEventListener('change', (e) => {
            if (!editorState.selectedHitId || editorState.activeTab !== 'drumPattern') return;
            const pattern = getCurrentPattern();
            if (!pattern) return;
            const hit = pattern.hits.find(h => h.id === editorState.selectedHitId);
            if (hit) playDrum(hit.row, getAudioCurrentTime(), hit.velocity);
            app.saveHistoryState();
        });
    }

    if (probSlider) {
        probSlider.addEventListener('input', (e) => {
            const pattern = getCurrentPattern();
            if (!pattern) return;
            const newProb = parseFloat(e.target.value);
            
            if (editorState.activeTab === 'drumPattern' && editorState.selectedHitId) {
                setCurrentPattern(updateDrumHit(pattern, editorState.selectedHitId, { probability: newProb }), false);
            } else if (editorState.activeTab !== 'drumPattern') {
                const selectedInsts = pattern.instances.filter(i => i.isSelected);
                if (selectedInsts.length > 0) {
                    let newPattern = pattern;
                    selectedInsts.forEach(inst => {
                        newPattern = updateInstance(newPattern, inst.id, { probability: newProb });
                    });
                    setCurrentPattern(newPattern, false);
                }
            }
            app.persistAppState();
            renderRhythmTimeline();
        });

        probSlider.addEventListener('change', (e) => {
            app.saveHistoryState();
        });
    }
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
        const sourceBeats = getDurationBeats();
        editorState.clipboardPattern = JSON.parse(JSON.stringify({ ...pattern, sourceBeats }));
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
        
        // Shield against copying chord slices into drum hits
        if (pastedPattern.instances) {
            const validInstances = [];
            pastedPattern.instances.forEach(inst => {
                inst.id = generateId();
                if (editorState.activeTab !== 'chordPattern') {
                    inst.arpSettings = null; // Strip arps if pasting into Bass
                }
                const absStart = inst.startTime * sourceBeats;
                const absDuration = inst.duration * sourceBeats;
                if (absStart < targetBeats) {
                    inst.startTime = absStart / targetBeats;
                    inst.duration = Math.min(absDuration, targetBeats - absStart) / targetBeats;
                    validInstances.push(inst);
                }
            });
            pastedPattern.instances = validInstances;
        }
        if (pastedPattern.hits) {
            const validHits = [];
            pastedPattern.hits.forEach(hit => {
                hit.id = generateId();
                const absBeat = hit.time * sourceBeats;
                if (absBeat < targetBeats) {
                    hit.time = absBeat / targetBeats;
                    validHits.push(hit);
                }
            });
            pastedPattern.hits = validHits;
        }
        delete pastedPattern.sourceBeats;
        
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
            
            // Initialize correctly based on the active tab
            const newPat = editorState.activeTab === 'drumPattern' ? initDrumPattern(clearedPat.isLocalOverride) : clearedPat;
            setCurrentPattern(newPat, true);
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    document.getElementById('btn-rhythm-delete').addEventListener('click', () => {
        const pattern = getCurrentPattern();
        if (!pattern) return;
        app.saveHistoryState();
        if (pattern.instances) {
            setCurrentPattern({ ...pattern, instances: pattern.instances.filter(i => !i.isSelected) });
        }
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
    let lastTapId = null; // Can be instance ID or 'empty'
    let lastTapCoords = { x: 0, y: 0 }; // For double-tap position check
    let panStartX = 0;
    let panStartScrollLeft = 0;

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

            const rect = getTimelineRect();
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

                const rect = getTimelineRect();
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
        if (editorState.activeTab === 'drumPattern') {
            if (editorState.isPanning) {
                const deltaX = e.clientX - panStartX;
                timeline.scrollLeft = panStartScrollLeft - deltaX;
                // Cancel potential double-tap if we've dragged to pan
                if (Math.abs(deltaX) > 5) lastTapTime = 0; 
                return;
            }
            if (!editorState.draggedHitId) return;

            const rect = getTimelineRect();
            
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

        if (editorState.isResizing && editorState.draggedInstanceId) {
            if (!hasValidContext()) return;
            const rect = getTimelineRect();
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
        const rect = getTimelineRect();
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

    _setupTabsAndToggles();
    _setupGridSlider();
    _setupArpControls();
    _setupDrumControls();
    _setupPropertiesControls();
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
            const swap = app.state.temporarySwaps ? app.state.temporarySwaps[editorState.activeIndex] : null;
            const activeChord = swap ? { ...chord, ...swap } : chord;
            const isOverride = activeChord && activeChord[editorState.activeTab] && activeChord[editorState.activeTab].isLocalOverride;
            titleEl.textContent = activeChord ? `Pattern Editor: ${activeChord.symbol} (${tabNames[editorState.activeTab]})${isOverride ? ' [Override]' : ' [Inherited]'}` : 'Pattern Editor';
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
        const selectedInsts = pattern.instances ? pattern.instances.filter(i => i.isSelected) : [];
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
    
    const btnDelete = document.getElementById('btn-rhythm-delete');
    if (btnDelete) btnDelete.style.display = editorState.activeTab === 'drumPattern' ? 'none' : 'inline-block';

    const btnCopy = document.getElementById('btn-rhythm-copy');
    const btnPaste = document.getElementById('btn-rhythm-paste');
    const isGlobalDrums = editorState.activeTab === 'drumPattern' && editorState.isGlobal;
    
    if (btnCopy) btnCopy.style.display = isGlobalDrums ? 'none' : 'inline-block';
    if (btnPaste) btnPaste.style.display = isGlobalDrums ? 'none' : 'inline-block';

    const zoomGroup = document.getElementById('zoom-controls-group');
    if (zoomGroup) zoomGroup.style.display = isGlobalDrums ? 'flex' : 'none';

    const drumLengthSelect = document.getElementById('drum-length-select');
    const drumCropBtn = document.getElementById('btn-drum-crop');
    if (drumLengthSelect) {
        drumLengthSelect.style.display = isGlobalDrums ? 'inline-block' : 'none';
        if (drumCropBtn) drumCropBtn.style.display = isGlobalDrums ? 'inline-block' : 'none';
        if (isGlobalDrums) {
            drumLengthSelect.value = pattern.lengthBeats || 4;
        }
    }

    const propsGroup = document.getElementById('item-properties-group');
    const velWrapper = document.getElementById('prop-velocity-wrapper');
    const probWrapper = document.getElementById('prop-probability-wrapper');
    const velSlider = document.getElementById('prop-velocity-slider');
    const probSlider = document.getElementById('prop-probability-slider');

    if (propsGroup && velWrapper && probWrapper && velSlider && probSlider) {
        let showProps = false;
        let showVel = false;

        if (editorState.activeTab === 'drumPattern' && editorState.selectedHitId && pattern && pattern.hits) {
            const selectedHit = pattern.hits.find(h => h.id === editorState.selectedHitId);
            if (selectedHit) {
                showProps = true;
                showVel = true;
                velSlider.value = selectedHit.velocity !== undefined ? selectedHit.velocity : 1.0;
                probSlider.value = selectedHit.probability !== undefined ? selectedHit.probability : 1.0;
            }
        } else if (editorState.activeTab !== 'drumPattern' && pattern && pattern.instances) {
            const selectedInsts = pattern.instances.filter(i => i.isSelected);
            if (selectedInsts.length > 0) {
                showProps = true;
                showVel = false;
                // If multiple are selected, mirror the probability of the first selected block
                probSlider.value = selectedInsts[0].probability !== undefined ? selectedInsts[0].probability : 1.0;
            }
        }

        propsGroup.style.display = showProps ? 'flex' : 'none';
        velWrapper.style.display = showVel ? 'flex' : 'none';
    }

    if (editorState.activeTab === 'drumPattern') {
        _renderDrumGrid(container, pattern);
    } else {
        _renderSliceTimeline(container, pattern, isChordTab);
    }
}

function _renderSliceTimeline(container, pattern, isChordTab) {
    // Enforce default timeline container behavior
    container.style.overflowX = 'hidden';
    container.style.touchAction = 'none';

    // Remove the drum grid if it was left over from the Drums tab
    const leftoverDrumGrid = container.querySelector('.drum-grid');
    if (leftoverDrumGrid) leftoverDrumGrid.remove();

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

function _renderDrumGrid(container, pattern) {
    container.innerHTML = ''; // Clear previous state
    
    const gridEl = document.createElement('div');
    gridEl.className = 'drum-grid';
    
    // 1. Render Grid Lines
    const beats = getDurationBeats();
    
    let baseWidth = 100;
    if (editorState.isGlobal) {
        baseWidth = (beats / 4) * 100;
    }
    const finalWidth = editorState.isGlobal ? baseWidth * editorState.zoomLevel : baseWidth;
    gridEl.style.width = `${finalWidth}%`;

    // Always allow scrolling in global mode so out-of-bounds hits are reachable
    container.style.overflowX = editorState.isGlobal ? 'auto' : 'hidden';
    container.style.touchAction = editorState.isGlobal ? 'pan-x pinch-zoom' : 'none';

    const gridLinesInner = document.createElement('div');
    gridLinesInner.className = 'drum-grid-lines';
    gridLinesInner.style.position = 'absolute';
    gridLinesInner.style.left = '48px';
    gridLinesInner.style.right = '16px';
    gridLinesInner.style.top = '0';
    gridLinesInner.style.bottom = '0';
    gridLinesInner.style.pointerEvents = 'none';
    gridLinesInner.style.zIndex = '1';
    gridEl.appendChild(gridLinesInner);

    const normalizedGridStep = editorState.isGridEnabled ? (GRID_STEPS[editorState.gridStepIndex].value * (4 / beats)) : 0;

    if (normalizedGridStep > 0) {
        for (let i = 0; i < 1.0; i += normalizedGridStep) {
            const line = document.createElement('div');
            line.className = 'drum-grid-line';
            line.style.left = `${i * 100}%`;
            // Emphasize quarter notes (0.25, 0.5, 0.75 in a 4-beat context)
            const beatPos = i * beats / 4;
            
            if (i === 0) {
                line.style.opacity = '0.15'; // Make the first line faint so hits don't look like vertical sliders
            } else if (Math.abs(beatPos - Math.round(beatPos)) < 0.001) { // Beat lines
                line.style.opacity = '0.8';
                line.style.width = '2px';
                line.style.backgroundColor = 'var(--text-main)';
                line.style.transform = 'translateX(-1px)'; // Center the 2px line
            } else if (Math.abs((beatPos * 2) - Math.round(beatPos * 2)) < 0.001) { // 8th note lines
                line.style.opacity = '0.4';
            } else { // 16th note lines
                line.style.opacity = '0.15';
            }
            gridLinesInner.appendChild(line);
        }
    }

    // 2. Render Rows and Hits
    const rowElements = {};
    DRUM_ROWS.forEach(rowType => {
        const rowEl = document.createElement('div');
        rowEl.className = 'drum-row';
        rowEl.dataset.rowType = rowType;
        rowEl.style.backgroundColor = DRUM_ROW_BG_COLORS[rowType];

        const label = document.createElement('span');
        label.className = 'drum-row-label';
        label.textContent = DRUM_LABELS[rowType];
        rowEl.appendChild(label);
        
        const rowInner = document.createElement('div');
        rowInner.className = 'drum-row-inner';
        rowInner.style.position = 'absolute';
        rowInner.style.left = '48px';
        rowInner.style.right = '16px';
        rowInner.style.top = '0';
        rowInner.style.bottom = '0';
        rowEl.appendChild(rowInner);
        
        gridEl.appendChild(rowEl);
        rowElements[rowType] = rowInner;
    });

    if (pattern && pattern.hits) {
        pattern.hits.forEach(hit => {
            const parentRow = rowElements[hit.row];
            if (!parentRow) return;

            const hitEl = document.createElement('div');
            hitEl.className = `drum-hit ${hit.row}-hit`;
            hitEl.dataset.id = hit.id;
            hitEl.style.left = `${hit.time * 100}%`;
            
            if (hit.id === editorState.draggedHitId) {
                hitEl.classList.add('grabbing');
            }
            if (hit.id === editorState.selectedHitId) {
                hitEl.classList.add('selected');
            }
            if (hit.time >= 1.0) {
                if (hit.time > 1.25) return; // Hard limit out-of-bounds scrolling to 25% past the boundary
                hitEl.style.opacity = '0.2';
                hitEl.style.pointerEvents = 'none'; // Prevent interaction with truncated data
            } else {
                hitEl.style.opacity = 0.3 + (hit.velocity !== undefined ? hit.velocity : 1.0) * 0.7;
            }
            parentRow.appendChild(hitEl);
        });
    }

    // --- Smart Duplication Button ---
    if (editorState.isGlobal && pattern && pattern.hits && pattern.hits.length > 0) {
        const lengthBeats = pattern.lengthBeats || 4;
        if (lengthBeats > 4) {
            const maxBeat = Math.max(...pattern.hits.map(h => h.time * lengthBeats));
            let populatedBeats = 4;
            
            // Find the smallest power-of-two boundary that contains all current hits
            while (populatedBeats < lengthBeats && maxBeat >= populatedBeats - 0.001) {
                populatedBeats *= 2;
            }

            // If there is empty space at the end of the boundary, offer to duplicate
            if (populatedBeats < lengthBeats) {
                const btnLeftPercent = (populatedBeats / lengthBeats) * 100;
                
                const boundLine = document.createElement('div');
                boundLine.className = 'drum-grid-line';
                boundLine.style.left = `${btnLeftPercent}%`;
                boundLine.style.width = '2px';
                boundLine.style.backgroundColor = 'var(--ctrl-primary-bg)';
                boundLine.style.opacity = '0.5';
                boundLine.style.zIndex = '15';
                gridLinesInner.appendChild(boundLine);

                const duplicateBtn = document.createElement('button');
                duplicateBtn.className = 'control-btn primary';
                duplicateBtn.style.position = 'absolute';
                duplicateBtn.style.left = `calc(${btnLeftPercent}% + 8px)`;
                duplicateBtn.style.top = '8px';
                duplicateBtn.style.padding = '4px 10px';
                duplicateBtn.style.fontSize = '11px';
                duplicateBtn.style.zIndex = '40';
                duplicateBtn.style.pointerEvents = 'auto'; // Re-enable clicks over the pointer-events: none container
                duplicateBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
                duplicateBtn.innerHTML = `↬ Duplicate Loop`;
                duplicateBtn.title = `Duplicate the first ${populatedBeats} beats across the rest of the pattern`;
                
                duplicateBtn.addEventListener('pointerdown', e => e.stopPropagation()); // Prevent drum grid hit interactions
                duplicateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    app.saveHistoryState();
                    
                    const loopsNeeded = (lengthBeats / populatedBeats) - 1;
                    
                    // Overwrite the destination area by strictly using the source hits, wiping ghost data
                    const sourceHits = pattern.hits.filter(h => (h.time * lengthBeats) < populatedBeats - 0.001);
                    const newHits = [...sourceHits];
                    
                    for (let i = 1; i <= loopsNeeded; i++) {
                        const offsetBeats = i * populatedBeats;
                        sourceHits.forEach(hit => {
                            const originalBeat = hit.time * lengthBeats;
                            const newBeat = originalBeat + offsetBeats;
                            newHits.push({
                                ...hit,
                                id: generateId(),
                                time: newBeat / lengthBeats
                            });
                        });
                    }
                    
                    setCurrentPattern({ ...pattern, hits: newHits });
                    app.persistAppState();
                    renderRhythmTimeline();
                });
                
                gridLinesInner.appendChild(duplicateBtn);
            }
        }
    }

    container.appendChild(gridEl);
}