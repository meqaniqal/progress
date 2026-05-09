import { GRID_STEPS } from './rhythmConfig.js';
import { applyArpSettings, updateDrumHit, updateInstance, generateId, initChordPattern, initDrumPattern } from './patternUtils.js';
import { playDrum, getAudioCurrentTime } from './synth.js';
import { 
    editorState, 
    app, 
    getCurrentPattern, 
    setCurrentPattern, 
    getDurationBeats, 
    auditionSlicePitch, 
    renderRhythmTimeline 
} from './rhythmEditor.js';

/** Sets up the 'Chords' | 'Bass' | 'Drums' tabs and the 'Global' | 'Local' toggle. */
function _setupTabsAndToggles() {
    // --- Tabs & Global/Local Toggle Setup ---
    const tabs = document.querySelectorAll('.pattern-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            editorState.activeTab = e.target.dataset.tab;
            editorState.activeOverlayId = null; // Clear overlay when switching tabs
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
            editorState.activeOverlayId = null; // Clear overlay when switching modes
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
                btnGridToggle.blur();
                // Force browser to instantly drop sticky :hover state on touch devices
                btnGridToggle.style.pointerEvents = 'none';
                setTimeout(() => btnGridToggle.style.pointerEvents = '', 50);
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
    
    // --- Pitch Property Controls ---
    const btnPitchUp = document.getElementById('btn-pitch-up');
    const btnPitchDown = document.getElementById('btn-pitch-down');

    const adjustPitch = (delta) => {
        if (editorState.activeTab !== 'bassPattern' || !editorState.isPitchModeEnabled) return;
        const pattern = getCurrentPattern();
        if (!pattern) return;
        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) return;
        let newPattern = pattern;
        app.saveHistoryState();
        let lastNewPitch = 0;
        selectedInsts.forEach(inst => {
            const currentPitch = inst.pitchOffset || 0;
            const newPitch = Math.max(-12, Math.min(12, currentPitch + delta));
            newPattern = updateInstance(newPattern, inst.id, { pitchOffset: newPitch });
            lastNewPitch = newPitch;
        });
        setCurrentPattern(newPattern);
        app.persistAppState();
        renderRhythmTimeline();
        auditionSlicePitch(lastNewPitch); // Audition the change when using buttons
    };

    if (btnPitchUp) btnPitchUp.addEventListener('click', () => adjustPitch(1));
    if (btnPitchDown) btnPitchDown.addEventListener('click', () => adjustPitch(-1));

    if (velSlider) {
        velSlider.addEventListener('input', (e) => {
            if (!editorState.selectedHitId || editorState.activeTab !== 'drumPattern') return;
            const pattern = getCurrentPattern();
            if (!pattern) return;
            const newVelocity = parseFloat(e.target.value);
            setCurrentPattern(updateDrumHit(pattern, editorState.selectedHitId, { velocity: newVelocity }));
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
                setCurrentPattern(updateDrumHit(pattern, editorState.selectedHitId, { probability: newProb }));
            } else if (editorState.activeTab !== 'drumPattern') {
                const selectedInsts = pattern.instances.filter(i => i.isSelected);
                if (selectedInsts.length > 0) {
                    let newPattern = pattern;
                    selectedInsts.forEach(inst => {
                        newPattern = updateInstance(newPattern, inst.id, { probability: newProb });
                    });
                    setCurrentPattern(newPattern);
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
    // --- Pitch Mode Toggle ---
    const btnPitchToggle = document.getElementById('btn-pitch-toggle');
    if (btnPitchToggle) {
        btnPitchToggle.addEventListener('click', () => {
            editorState.isPitchModeEnabled = !editorState.isPitchModeEnabled;
            editorState.activeOverlayId = null; // Clear overlay when toggling pitch mode
            btnPitchToggle.blur();
            btnPitchToggle.style.pointerEvents = 'none';
            setTimeout(() => btnPitchToggle.style.pointerEvents = '', 50);
            renderRhythmTimeline();
        });
    }

    // --- Draw Mode Toggle ---
    const btnDrawToggle = document.getElementById('btn-draw-toggle');
    if (btnDrawToggle) {
        btnDrawToggle.addEventListener('click', () => {
            editorState.isDrawModeEnabled = !editorState.isDrawModeEnabled;
                
                btnDrawToggle.blur();
                // Force browser to instantly drop sticky :hover state on touch devices
                btnDrawToggle.style.pointerEvents = 'none';
                setTimeout(() => btnDrawToggle.style.pointerEvents = '', 50);
                
            renderRhythmTimeline(); // Update cursor display and button state
        });
    }

    // --- Copy & Paste Buttons ---
    const btnCopy = document.getElementById('btn-rhythm-copy');
    const btnPaste = document.getElementById('btn-rhythm-paste');

    btnCopy.addEventListener('click', () => {
        const pattern = getCurrentPattern();
        if (!pattern) return;
        
        // Deep copy the pattern to the clipboard
        const sourceBeats = getDurationBeats();
        const patternToCopy = JSON.parse(JSON.stringify(pattern));
        patternToCopy.sourceBeats = sourceBeats;
        editorState.clipboardPattern = patternToCopy;
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
            let remaining = pattern.instances.filter(i => !i.isSelected);
            if (remaining.length > 0 && !remaining.some(i => i.isSelected)) {
                remaining[remaining.length - 1].isSelected = true;
            }
            setCurrentPattern({ ...pattern, instances: remaining });
        }
        editorState.activeOverlayId = null;
        app.persistAppState();
        renderRhythmTimeline();
    });

    // --- Experimental Push/Pull Buttons ---
    const btnPushGlobal = document.getElementById('btn-push-global');
    const btnPullGlobal = document.getElementById('btn-pull-global');

    if (btnPushGlobal) {
        btnPushGlobal.addEventListener('click', () => {
            if (editorState.activeIndex === null) return;
            const pattern = getCurrentPattern();
            if (!pattern) return;
            app.saveHistoryState();
            
            const globalCopy = JSON.parse(JSON.stringify(pattern));
            globalCopy.isLocalOverride = false;
            app.state.globalPatterns[editorState.activeTab] = globalCopy;
            
            const chord = app.state.currentProgression[editorState.activeIndex];
            if (chord && chord[editorState.activeTab]) {
                chord[editorState.activeTab].isLocalOverride = false;
            }
            
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    if (btnPullGlobal) {
        btnPullGlobal.addEventListener('click', () => {
            if (editorState.activeIndex === null) return;
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
}

export function initRhythmControls() {
    _setupTabsAndToggles();
    _setupGridSlider();
    _setupArpControls();
    _setupDrumControls();
    _setupPropertiesControls();
    _setupToolbarButtons();
}