import { initChordPattern, initDrumPattern, sliceInstance, toggleSelection, exclusiveSelect, applyArpSettings, moveInstance, fillGapInstance, expandInstance, resizeInstance, drawPatternBlock, generateId, resolvePattern, addDrumHit, removeDrumHit, updateDrumHit, updateInstance } from './patternUtils.js';
import { playDrum, getAudioCurrentTime, playTone, initAudio, midiToFreq } from './synth.js';
import { getChordNotes } from './theory.js';
import { CONFIG } from './config.js';

const editorState = {
    activeIndex: null,
    activeOverlayId: null,
    isDragging: false,
    isResizing: null,
    isDrawModeEnabled: false,
    isDrawing: false,
    isPitchModeEnabled: false,
    drawStartRatio: null,
    drawModeAction: null,
    drawStartPattern: null,
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

function auditionSlicePitch(pitchOffset = 0) {
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

        const isExperimental = app.state.enableExperimentalDrawMode;
        const isChordOrBass = editorState.activeTab === 'chordPattern' || editorState.activeTab === 'bassPattern';

        // Handle Pencil Draw Interaction
        if (isExperimental && isChordOrBass && editorState.isDrawModeEnabled) {
            if (!hasValidContext()) return;
            const rect = getTimelineRect();
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

        if (editorState.isDrawing && editorState.drawStartPattern) {
            const rect = getTimelineRect();
            const currentRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            applyDrawMath(editorState.drawStartRatio, currentRatio);
            return;
        }

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
            const rect = getTimelineRect();
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
        const prefixMap = {
            chordPattern: 'Chord Pattern',
            bassPattern: 'Bass Pattern',
            drumPattern: 'Drum Pattern'
        };
        const prefix = prefixMap[editorState.activeTab];
        
        if (editorState.isGlobal) {
            titleEl.textContent = `${prefix} (global)`;
        } else {
            const chord = app.state.currentProgression[editorState.activeIndex];
            const swap = app.state.temporarySwaps ? app.state.temporarySwaps[editorState.activeIndex] : null;
            const activeChord = swap ? { ...chord, ...swap } : chord;
            titleEl.textContent = activeChord ? `${prefix}: ${activeChord.symbol}` : prefix;
        }
    }
    
    // --- Mode Controls Display Logic ---
    const legacyToggle = document.getElementById('legacy-mode-toggle');
    const experimentalPushPull = document.getElementById('experimental-push-pull');
    const btnLegacyReset = document.getElementById('btn-rhythm-reset');

    const isExperimental = app.state.enableExperimentalDrawMode;
    const isChordOrBass = editorState.activeTab === 'chordPattern' || editorState.activeTab === 'bassPattern';

    if (isExperimental && isChordOrBass) {
        editorState.isGlobal = false; // Force edit-in-place local behavior
        if (legacyToggle) legacyToggle.style.display = 'none';
        if (experimentalPushPull) {
            const chord = app.state.currentProgression[editorState.activeIndex];
            const isOverride = chord && chord[editorState.activeTab] && chord[editorState.activeTab].isLocalOverride;
            experimentalPushPull.style.display = isOverride ? 'flex' : 'none';
        }
        if (btnLegacyReset) btnLegacyReset.style.display = 'none'; // Hide legacy reset button in toolbar
    } else {
        if (legacyToggle) legacyToggle.style.display = 'flex';
        if (experimentalPushPull) experimentalPushPull.style.display = 'none';
        
        // Restore legacy reset button visibility
        if (btnLegacyReset) {
            btnLegacyReset.style.display = editorState.isGlobal ? 'none' : 'inline-block';
            if (!editorState.isGlobal) {
                const chord = app.state.currentProgression[editorState.activeIndex];
                const isOverride = chord && chord[editorState.activeTab] && chord[editorState.activeTab].isLocalOverride;
                btnLegacyReset.style.opacity = isOverride ? '1' : '0.5';
                btnLegacyReset.disabled = !isOverride;
            }
        }
    }
    
    const isBassTab = editorState.activeTab === 'bassPattern';
    const btnPitchToggle = document.getElementById('btn-pitch-toggle');
    const btnDrawToggle = document.getElementById('btn-draw-toggle');
    
    if (btnPitchToggle) {
        btnPitchToggle.style.display = isBassTab ? 'inline-block' : 'none';
        btnPitchToggle.classList.toggle('active', editorState.isPitchModeEnabled);
    }

    if (isBassTab && editorState.isPitchModeEnabled) {
        editorState.isDrawModeEnabled = false; // Disable draw mode when pitching
        if (btnDrawToggle) btnDrawToggle.style.display = 'none';
        container.style.cursor = 'ns-resize';
    } else {
        if (btnDrawToggle) {
            btnDrawToggle.style.display = (isExperimental && isChordOrBass) ? 'inline-block' : 'none';
            btnDrawToggle.classList.toggle('active', editorState.isDrawModeEnabled);
        }
        container.style.cursor = (isExperimental && isChordOrBass && editorState.isDrawModeEnabled) ? 'crosshair' : 'default';
    }

    // Sync the legacy toggle's visual state
    if (legacyToggle && !isExperimental) {
        const toggles = legacyToggle.querySelectorAll('.toggle-btn');
        toggles.forEach(b => {
            if ((b.dataset.mode === 'global' && editorState.isGlobal) || 
                (b.dataset.mode === 'local' && !editorState.isGlobal)) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
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
    const pitchWrapper = document.getElementById('prop-pitch-wrapper');
    const pitchDisplay = document.getElementById('prop-pitch-display');
    const PITCH_LABELS = {
        '-12': '-8ve', '-11': '-M7', '-10': '-m7', '-9': '-M6', '-8': '-m6', '-7': '-P5', '-6': '-TT', '-5': '-P4', '-4': '-M3', '-3': '-m3', '-2': '-M2', '-1': '-m2',
        '0': 'Root',
        '1': 'm2', '2': 'M2', '3': 'm3', '4': 'M3', '5': 'P4', '6': 'TT', '7': 'P5', '8': 'm6', '9': 'M6', '10': 'm7', '11': 'M7', '12': '+8ve'
    };

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
                
                if (editorState.activeTab === 'bassPattern' && editorState.isPitchModeEnabled) {
                    if (pitchWrapper) pitchWrapper.style.display = 'flex';
                    const pOff = selectedInsts[0].pitchOffset || 0;
                    if (pitchDisplay) pitchDisplay.textContent = PITCH_LABELS[pOff] || pOff;
                } else if (pitchWrapper) {
                    pitchWrapper.style.display = 'none';
                }
            } else if (pitchWrapper) {
                pitchWrapper.style.display = 'none';
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
    
    const isPitchMode = editorState.activeTab === 'bassPattern' && editorState.isPitchModeEnabled;

    // Draw Piano Roll Root Line
    let prGrid = container.querySelector('.piano-roll-grid');
    if (isPitchMode) {
        if (!prGrid) {
            prGrid = document.createElement('div');
            prGrid.className = 'piano-roll-grid';
            prGrid.style.position = 'absolute';
            prGrid.style.top = '0';
            prGrid.style.left = '0';
            prGrid.style.right = '0';
            prGrid.style.bottom = '0';
            prGrid.style.pointerEvents = 'none';
            for (let i = -12; i <= 12; i++) {
                const line = document.createElement('div');
                line.style.position = 'absolute';
                line.style.left = '0';
                line.style.right = '0';
                line.style.top = `${50 - (i * 3)}%`;
                line.style.height = i === 0 ? '2px' : '1px';
                line.style.background = i === 0 ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.15)';
                prGrid.appendChild(line);
            }
            container.insertBefore(prGrid, container.firstChild);
        }
    } else if (prGrid) {
        prGrid.remove();
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
        if (inst.arpSettings && isChordTab) el.classList.add('arp-active');
        if (editorState.isDragging && inst.id === editorState.draggedInstanceId) el.classList.add('grabbing');
        if (editorState.activeOverlayId === inst.id) el.classList.add('has-overlay');
        
        if (inst.isAnimating) {
            el.classList.add('animate-paste');
            setTimeout(() => el.classList.remove('animate-paste'), 450);
            delete inst.isAnimating; // Clean up state so it doesn't trigger again
        }
        
        el.style.left = `${inst.startTime * 100}%`;
        el.style.width = `${inst.duration * 100}%`;

        if (isPitchMode) {
            const pOffset = inst.pitchOffset || 0;
            const blockHeight = 16;
            const topPercent = 50 - (pOffset * 3) - (blockHeight / 2);
            el.style.top = `${topPercent}%`;
            el.style.height = `${blockHeight}%`;
        } else {
            el.style.top = '10%';
            el.style.height = '80%';
        }

        let overlay = el.querySelector('.slice-overlay');

        if (editorState.activeOverlayId === inst.id && !isPitchMode) {
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