import { GRID_STEPS, DRUM_PRESETS } from './rhythmConfig.js';
import { updateDrumHit, updateInstance, initChordPattern, initDrumPattern } from './patternUtils.js';
import { copyPattern, pastePattern } from './clipboardUtils.js';
import { initArpControls } from './arpControls.js';
import { initBassControls } from './bassControls.js';
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
import { getEffectiveTuning, getPitchEditorTuning } from './theory.js';
import { updateTransition } from './transitionUtils.js';

/** Sets up the 'Chords' | 'Bass' | 'Drums' tabs and the 'Global' | 'Local' toggle. */
function _setupTabsAndToggles() {
    // --- Tabs & Global/Local Toggle Setup ---
    const tabs = document.querySelectorAll('.pattern-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            editorState.activeTab = e.target.dataset.tab;
            editorState.activeOverlayId = null; // Clear overlay when switching tabs
            editorState.justPushedToGlobalIndex = null;
            
            if (editorState.activeTab === 'drumPattern') {
                const chord = app.state.currentProgression[editorState.activeIndex];
                if (!chord || !chord.drumPattern || !chord.drumPattern.isLocalOverride) {
                    editorState.isGlobal = true;
                }
            } else if (editorState.activeTab === 'chordPattern' || editorState.activeTab === 'bassPattern') {
                editorState.isGlobal = false; // Force edit-in-place local behavior immediately
            }

            app.persistAppState();
            const modeSelect = document.getElementById('global-mode-select');
            const pattern = getCurrentPattern();
            if (modeSelect && pattern) {
                modeSelect.value = pattern.inheritMode || pattern.globalMode || 'loop';
            }
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
    const zoomSlider = document.getElementById('zoom-slider');
    
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

    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            if (editorState.activeTab !== 'drumPattern' || !editorState.isGlobal) return;
            editorState.zoomLevel = parseFloat(e.target.value);
            renderRhythmTimeline();
        });
    }
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

        let drumPresetSelect = document.getElementById('drum-preset-select');
        if (!drumPresetSelect) {
            drumPresetSelect = document.createElement('select');
            drumPresetSelect.id = 'drum-preset-select';
            drumPresetSelect.className = 'rhythm-select';
            drumPresetSelect.title = 'Drum Presets';
            drumPresetSelect.innerHTML = `
                <option value="" disabled selected>Preset...</option>
                <option value="blank">Blank</option>
                <option value="house">House (4-to-the-floor)</option>
                <option value="hiphop">Hip Hop (Boom Bap)</option>
                <option value="breakbeat">Breakbeat</option>
                <option value="dnb">Drum & Bass</option>
                <option value="bossanova">Bossa Nova</option>
                <option value="lofi">Lo-Fi / Chillhop</option>
            `;
            drumLengthSelect.parentNode.insertBefore(drumPresetSelect, drumLengthSelect);

            drumPresetSelect.addEventListener('change', (e) => {
                if (editorState.activeTab !== 'drumPattern') return;
                const pattern = getCurrentPattern();
                if (pattern) {
                    const presetName = e.target.value;
                    const presetHits = DRUM_PRESETS[presetName] || [];
                    app.saveHistoryState();
                    const newHits = presetHits.map(hit => ({
                        ...hit,
                        id: Math.random().toString(36).substring(2, 10),
                        velocity: hit.velocity !== undefined ? hit.velocity : 1.0,
                        probability: 1.0
                    }));
                    setCurrentPattern({ ...pattern, hits: newHits });
                    app.persistAppState();
                    renderRhythmTimeline();
                }
                e.target.value = ""; 
            });
        }
    }
}

/** Sets up the unified properties controls (Velocity, Probability). */
function _setupPropertiesControls() {
    const velSlider = document.getElementById('prop-velocity-slider');
    const probSlider = document.getElementById('prop-probability-slider');
    const rateSlider = document.getElementById('prop-flourish-rate-slider');
    
    if (rateSlider) {
        rateSlider.addEventListener('input', (e) => {
            const pattern = getCurrentPattern();
            if (!pattern) return;
            const newRate = parseInt(e.target.value, 10);
            
            if (editorState.activeTab === 'chordPattern' && editorState.isTransitionsModeEnabled) {
                const selectedTrans = (pattern.transitions || []).filter(t => t.isSelected);
                if (selectedTrans.length > 0) {
                    let newPattern = pattern;
                    selectedTrans.forEach(trans => {
                        newPattern = updateTransition(newPattern, trans.id, { flourishRate: newRate });
                    });
                    setCurrentPattern(newPattern);
                }
            }
            app.persistAppState();
            renderRhythmTimeline();
        });
        rateSlider.addEventListener('change', () => app.saveHistoryState());
    }
    
    // --- Pitch Property Controls ---
    const btnPitchUp = document.getElementById('btn-pitch-up');
    const btnPitchDown = document.getElementById('btn-pitch-down');

    const btnFocusSlice = document.getElementById('btn-focus-slice');
    if (btnFocusSlice) {
        btnFocusSlice.addEventListener('click', (e) => {
            const instId = e.currentTarget.dataset.id;
            if (editorState.focusedSliceId === instId) {
                editorState.focusedSliceId = null;
            } else {
                editorState.focusedSliceId = instId;
            }
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    const adjustPitch = (delta) => {
        if (editorState.activeTab !== 'bassPattern' || !editorState.isPitchModeEnabled) return;
        const pattern = getCurrentPattern();
        if (!pattern) return;
        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) return;
        let newPattern = pattern;
        app.saveHistoryState();
        let lastNewPitch = 0;
        
        const chord = app.state.currentProgression[editorState.activeIndex];
        const tuning = getPitchEditorTuning(chord ? chord.symbol : null, app.state.divisions);
        const stepSize = tuning.periodSize / tuning.divisions;
        const maxPitch = tuning.periodSize; // Span a full octave/period up and down

        selectedInsts.forEach(inst => {
            const currentPitch = inst.pitchOffset || 0;
            const newPitch = Math.max(-maxPitch, Math.min(maxPitch, currentPitch + (delta * stepSize)));
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
            } else if (editorState.activeTab === 'chordPattern' && editorState.isTransitionsModeEnabled) {
                const selectedTrans = (pattern.transitions || []).filter(t => t.isSelected);
                if (selectedTrans.length > 0) {
                    let newPattern = pattern;
                    selectedTrans.forEach(trans => {
                        newPattern = updateTransition(newPattern, trans.id, { probability: newProb });
                    });
                    setCurrentPattern(newPattern);
                }
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

    const akCheck = document.getElementById('pattern-avoid-kick');
    if (akCheck) {
        akCheck.addEventListener('change', (e) => {
            const pattern = getCurrentPattern();
            if (pattern) {
                app.saveHistoryState();
                setCurrentPattern({ ...pattern, avoidKick: e.target.checked });
                app.persistAppState();
                renderRhythmTimeline();
            }
        });
    }
}

/** Sets up the Copy, Paste, Reset, and Delete buttons in the toolbar. */
function _setupToolbarButtons() {
    // --- Global Fit Mode ---
    const modeSelect = document.getElementById('global-mode-select');
    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            const pattern = getCurrentPattern();
            if (pattern) {
                app.saveHistoryState();
                setCurrentPattern({ ...pattern, inheritMode: e.target.value, globalMode: e.target.value });
                app.persistAppState();
                renderRhythmTimeline();
            }
        });
    }

    const btnInfo = document.getElementById('btn-global-fit-info');
    if (btnInfo) {
        btnInfo.addEventListener('click', (e) => {
            e.preventDefault();
            alert("Global Fit Mode:\n\nDetermines how the Global Pattern adapts when applied to a chord with a different duration.\n\n• Repeat to Fill: Loops the pattern to fill the space.\n• Stretch to Fit: Speeds up or slows down the pattern to fit exactly.\n• Play Once: Plays the pattern once and leaves extra space empty.\n\nThe 'Apply Fit' button makes your current choice the default for ALL chords.");
        });
    }

    const applyAllBtn = document.getElementById('btn-apply-inherit-all');
    if (applyAllBtn) {
        applyAllBtn.addEventListener('click', (e) => {
            const selectEl = document.getElementById('global-mode-select');
            if (!selectEl) return;
            const mode = selectEl.value;
            app.saveHistoryState();
            
            const globalPat = app.state.globalPatterns[editorState.activeTab];
            if (globalPat) globalPat.globalMode = mode;

            app.state.currentProgression.forEach(c => {
                const pat = c[editorState.activeTab];
                if (!pat || !pat.isLocalOverride) {
                    if (!c[editorState.activeTab]) c[editorState.activeTab] = { isLocalOverride: false };
                    c[editorState.activeTab].inheritMode = mode;
                }
            });
            
            app.persistAppState();
            renderRhythmTimeline();
            
            const origText = e.target.textContent;
            e.target.textContent = '✓ Applied';
            setTimeout(() => e.target.textContent = origText, 1500);
        });
    }

    // --- Transitions Mode Toggle ---
    const btnTransitionsToggle = document.getElementById('btn-transitions-toggle');
    if (btnTransitionsToggle) {
        btnTransitionsToggle.addEventListener('click', () => {
            editorState.isTransitionsModeEnabled = !editorState.isTransitionsModeEnabled;
            if (editorState.isTransitionsModeEnabled) {
                editorState.isPitchModeEnabled = false;
                editorState.isDrawModeEnabled = false;
            }
            editorState.activeOverlayId = null;
            renderRhythmTimeline();
        });
    }

    // --- Pitch Mode Toggle ---
    const btnPitchToggle = document.getElementById('btn-pitch-toggle');
    if (btnPitchToggle) {
        btnPitchToggle.addEventListener('click', () => {
            editorState.isPitchModeEnabled = !editorState.isPitchModeEnabled;
            if (editorState.isPitchModeEnabled) editorState.isTransitionsModeEnabled = false;
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

    if (btnCopy) btnCopy.addEventListener('click', () => copyPattern(btnCopy, btnPaste));
    if (btnPaste) btnPaste.addEventListener('click', pastePattern);

    // --- Reset & Clear Buttons ---
    const btnReset = document.getElementById('btn-rhythm-reset');
    const btnClear = document.getElementById('btn-rhythm-clear');

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (editorState.isGlobal || editorState.activeIndex === null) return;
            app.saveHistoryState();
            app.resetPatternToGlobal(editorState.activeTab, editorState.activeIndex);
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
        
        let hasChanges = false;
        let newPattern = pattern;

        if (editorState.activeTab === 'drumPattern') {
            if (editorState.selectedHitId && pattern.hits) {
                const newHits = pattern.hits.filter(h => h.id !== editorState.selectedHitId);
                newPattern = { ...pattern, hits: newHits };
                editorState.selectedHitId = null;
                hasChanges = true;
            }
            } else if (editorState.activeTab === 'chordPattern' && editorState.isTransitionsModeEnabled) {
                if (pattern.transitions) {
                    const remaining = pattern.transitions.filter(t => !t.isSelected);
                    newPattern = { ...pattern, transitions: remaining };
                    hasChanges = true;
                }
        } else if (pattern.instances) {
            let remaining = pattern.instances.filter(i => !i.isSelected);
            if (remaining.length > 0 && !remaining.some(i => i.isSelected)) {
                remaining[remaining.length - 1].isSelected = true;
            }
            newPattern = { ...pattern, instances: remaining };
            editorState.activeOverlayId = null;
            hasChanges = true;
        }

        if (hasChanges) {
            app.saveHistoryState();
            setCurrentPattern(newPattern);
            app.persistAppState();
            renderRhythmTimeline();
        }
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
            
            app.pushPatternToGlobal(editorState.activeTab, pattern, editorState.activeIndex);
            
            app.persistAppState();
            renderRhythmTimeline();
        });
    }

    if (btnPullGlobal) {
        btnPullGlobal.addEventListener('click', () => {
            if (editorState.activeIndex === null) return;
            app.saveHistoryState();
            app.resetPatternToGlobal(editorState.activeTab, editorState.activeIndex);
            editorState.activeOverlayId = null;
            app.persistAppState();
            renderRhythmTimeline();
        });
    }
}

/** Sets up global keyboard shortcuts when the Rhythm Editor is active. */
function _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if focus is inside a text input, textarea, or select
        const tag = e.target.tagName;
        if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox'].includes(e.target.type))) {
            return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            const panel = document.getElementById('rhythm-editor-panel');
            if (panel && panel.style.display !== 'none') {
                const pattern = getCurrentPattern();
                if (!pattern) return;

                let hasChanges = false;
                let newPattern = pattern;

                if (editorState.activeTab === 'drumPattern') {
                    if (editorState.selectedHitId && pattern.hits) {
                        const newHits = pattern.hits.filter(h => h.id !== editorState.selectedHitId);
                        newPattern = { ...pattern, hits: newHits };
                        editorState.selectedHitId = null;
                        hasChanges = true;
                    }
                } else if (editorState.activeTab === 'chordPattern' && editorState.isTransitionsModeEnabled) {
                    if (pattern.transitions) {
                        const remaining = pattern.transitions.filter(t => !t.isSelected);
                        newPattern = { ...pattern, transitions: remaining };
                        hasChanges = true;
                    }
                } else if (pattern.instances) {
                    const selected = pattern.instances.filter(i => i.isSelected);
                    if (selected.length > 0) {
                        let remaining = pattern.instances.filter(i => !i.isSelected);
                        if (remaining.length > 0 && !remaining.some(i => i.isSelected)) {
                            remaining[remaining.length - 1].isSelected = true;
                        }
                        newPattern = { ...pattern, instances: remaining };
                        editorState.activeOverlayId = null;
                        hasChanges = true;
                    }
                }

                if (hasChanges) {
                    app.saveHistoryState();
                    setCurrentPattern(newPattern);
                    app.persistAppState();
                    renderRhythmTimeline();
                }
            }
        }
    });
}

export function initRhythmControls() {
    _setupTabsAndToggles();
    _setupGridSlider();
    _setupDrumControls();
    _setupPropertiesControls();
    _setupToolbarButtons();
    _setupKeyboardShortcuts();
    initArpControls();
    initBassControls();
}