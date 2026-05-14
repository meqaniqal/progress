import { renderDrumGrid } from './drumRenderer.js';
import { 
    editorState, 
    app, 
    getCurrentPattern, 
    setCurrentPattern, 
    getDurationBeats 
} from './rhythmEditor.js';
import { generateArpNotes } from './arp.js';
import { getChordNotes } from './theory.js';

const PITCH_LABELS = {
    '-12': '-8ve', '-11': '-M7', '-10': '-m7', '-9': '-M6', '-8': '-m6', '-7': '-P5', '-6': '-TT', '-5': '-P4', '-4': '-M3', '-3': '-m3', '-2': '-M2', '-1': '-m2',
    '0': 'Root',
    '1': 'm2', '2': 'M2', '3': 'm3', '4': 'M3', '5': 'P4', '6': 'TT', '7': 'P5', '8': 'm6', '9': 'M6', '10': 'm7', '11': 'M7', '12': '+8ve'
};

export function renderRhythmTimeline() {
    const container = document.getElementById('rhythm-timeline');
    if (!editorState.isGlobal && editorState.activeIndex === null) {
        container.innerHTML = '';
        return;
    }
    
    const pattern = getCurrentPattern() || { instances: [] };

    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.dataset.activeTab = editorState.activeTab;

    document.querySelectorAll('.pattern-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === editorState.activeTab);
    });
    
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
            const localPat = chord && chord[editorState.activeTab];
            const isOverride = localPat && localPat.isLocalOverride;
            
            experimentalPushPull.classList.add('active');
            
            let btnContainer = document.getElementById('push-pull-btn-container');
            if (!btnContainer) {
                btnContainer = document.createElement('div');
                btnContainer.id = 'push-pull-btn-container';
                btnContainer.className = 'push-pull-btn-container';
                while (experimentalPushPull.firstChild) {
                    btnContainer.appendChild(experimentalPushPull.firstChild);
                }
                experimentalPushPull.appendChild(btnContainer);
            }
            
            let globalModeContainer = document.getElementById('global-mode-container');
            if (!globalModeContainer) {
                globalModeContainer = document.createElement('div');
                globalModeContainer.id = 'global-mode-container';
                globalModeContainer.className = 'global-mode-container';
                globalModeContainer.innerHTML = `
                    <label>Inherit Mode:</label>
                    <select id="global-mode-select" class="rhythm-select">
                        <option value="loop">Loop Pattern</option>
                        <option value="empty">Leave Empty</option>
                        <option value="stretch">Stretch to Fit</option>
                    </select>
                    <button id="btn-apply-inherit-all" class="control-btn secondary" title="Apply this inherit mode to all other chords that are using the Global Pattern">Apply to All</button>
                `;
                btnContainer.parentNode.insertBefore(globalModeContainer, btnContainer);
                
                const selectEl = globalModeContainer.querySelector('#global-mode-select');
                selectEl.addEventListener('change', (e) => {
                    const chordToUpdate = app.state.currentProgression[editorState.activeIndex];
                    if (chordToUpdate) {
                        app.saveHistoryState();
                        if (!chordToUpdate[editorState.activeTab]) {
                            chordToUpdate[editorState.activeTab] = { isLocalOverride: false };
                        }
                        chordToUpdate[editorState.activeTab].inheritMode = e.target.value;
                        app.persistAppState();
                        renderRhythmTimeline();
                    }
                });

                const applyAllBtn = globalModeContainer.querySelector('#btn-apply-inherit-all');
                applyAllBtn.addEventListener('click', (e) => {
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
            
            const btnPush = btnContainer.querySelector('#btn-push-global');
            const btnPull = btnContainer.querySelector('#btn-pull-global');

            if (isOverride) {
                globalModeContainer.style.display = 'none';
                if (btnPush) btnPush.style.display = 'inline-block';
                if (btnPull) btnPull.style.display = 'inline-block';
            } else {
                globalModeContainer.style.display = 'flex';
                if (btnPush) btnPush.style.display = 'none';
                if (btnPull) btnPull.style.display = 'none';
                
                const selectEl = globalModeContainer.querySelector('#global-mode-select');
                const globalPat = app.state.globalPatterns[editorState.activeTab];
                selectEl.value = (localPat && localPat.inheritMode) ? localPat.inheritMode : (globalPat && globalPat.globalMode ? globalPat.globalMode : 'loop');
            }
        }
        if (btnLegacyReset) btnLegacyReset.style.display = 'none'; // Hide legacy reset button in toolbar
    } else {
        if (legacyToggle) legacyToggle.style.display = 'flex';
        if (experimentalPushPull) experimentalPushPull.classList.remove('active');
        
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
    const bassGenGroup = document.getElementById('bass-gen-group');
    
    const patternFxGroup = document.getElementById('pattern-fx-group');
    if (patternFxGroup) {
        patternFxGroup.style.display = isChordOrBass ? 'flex' : 'none';
        const akCheck = document.getElementById('pattern-avoid-kick');
        if (akCheck && pattern) akCheck.checked = !!pattern.avoidKick;
    }

    if (bassGenGroup) {
        bassGenGroup.style.display = isBassTab ? 'flex' : 'none';
    }

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
    const zoomSlider = document.getElementById('zoom-slider');
    if (zoomGroup) zoomGroup.style.display = isGlobalDrums ? 'flex' : 'none';
    if (zoomSlider && isGlobalDrums) {
        zoomSlider.value = editorState.zoomLevel || 1.0;
    }

    const drumLengthSelect = document.getElementById('drum-length-select');
    const drumCropBtn = document.getElementById('btn-drum-crop');
    const drumPresetSelect = document.getElementById('drum-preset-select');
    if (drumLengthSelect) {
        drumLengthSelect.style.display = isGlobalDrums ? 'inline-block' : 'none';
        if (drumCropBtn) drumCropBtn.style.display = isGlobalDrums ? 'inline-block' : 'none';
        if (drumPresetSelect) drumPresetSelect.style.display = isGlobalDrums ? 'inline-block' : 'none';
        if (isGlobalDrums) {
            drumLengthSelect.value = pattern.lengthBeats || 4;
        }
    }

    const propsGroup = document.getElementById('item-properties-group');
    const pitchWrapper = document.getElementById('prop-pitch-wrapper');
    const pitchDisplay = document.getElementById('prop-pitch-display');

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
        renderDrumGrid(container, pattern);
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
        
    let chordNotes = [60, 64, 67, 71]; // Default dummy sequence for the Global Editor
    if (!editorState.isGlobal && editorState.activeIndex !== null) {
        const chord = app.state.currentProgression[editorState.activeIndex];
        if (chord) {
            const notes = getChordNotes(chord.symbol, chord.key);
            if (notes) chordNotes = notes;
        }
    }
    const bpm = app.state.bpm || 120;
    const totalDurationSec = (60 / bpm) * getDurationBeats();

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
        
        // --- Arpeggiator Visualization Engine ---
        if (inst.arpSettings && isChordTab) {
            let arpVisContainer = el.querySelector('.arp-vis-container');
            if (!arpVisContainer) {
                arpVisContainer = document.createElement('div');
                arpVisContainer.className = 'arp-vis-container';
                arpVisContainer.style.position = 'absolute';
                arpVisContainer.style.top = '0';
                arpVisContainer.style.left = '0';
                arpVisContainer.style.width = '100%';
                arpVisContainer.style.height = '100%';
                arpVisContainer.style.pointerEvents = 'none'; // Ensure user can still drag the block underneath
                arpVisContainer.style.overflow = 'hidden';
                arpVisContainer.style.borderRadius = '3px';
                el.appendChild(arpVisContainer);
            }
            
            const instanceDurationSec = inst.duration * totalDurationSec;
            const arpEvents = generateArpNotes({ notesToPlay: chordNotes, arpSettings: inst.arpSettings, instanceDuration: instanceDurationSec, bpm });
            
            const uniqueNotes = [...new Set(chordNotes)].sort((a, b) => a - b);
            const noteRange = uniqueNotes.length || 1;
            const heightPct = 100 / noteRange;
            
            let visHtml = '';
            arpEvents.forEach(event => {
                const leftPct = (event.startTime / instanceDurationSec) * 100;
                const widthPct = (event.duration / instanceDurationSec) * 100;
                const noteIndex = uniqueNotes.indexOf(event.note);
                const topPct = 100 - ((noteIndex + 1) * heightPct); // Render highest pitches at the top
                visHtml += `<div style="position: absolute; left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%; background: rgba(255, 255, 255, 0.85); box-sizing: border-box; border: 1px solid rgba(0,0,0,0.2); border-radius: 1px;"></div>`;
            });
            arpVisContainer.innerHTML = visHtml;
            el.style.background = 'rgba(74, 222, 128, 0.2)'; // Dim the green background so the white notes pop
        } else {
            const arpVisContainer = el.querySelector('.arp-vis-container');
            if (arpVisContainer) arpVisContainer.remove();
            el.style.background = ''; // Restore default background
        }

        if (isPitchMode) {
            const pOffset = inst.pitchOffset || 0;
            const blockHeight = 16;
            const topPercent = 50 - (pOffset * 3) - (blockHeight / 2);
            el.style.top = `${topPercent}%`;
            el.style.height = `${blockHeight}%`;

            // Auto-updating pitch indicator directly on the block
            let pitchLabel = el.querySelector('.pitch-label');
            if (!pitchLabel) {
                pitchLabel = document.createElement('span');
                pitchLabel.className = 'pitch-label';
                pitchLabel.style.position = 'absolute';
                pitchLabel.style.left = '50%';
                pitchLabel.style.top = '50%';
                pitchLabel.style.transform = 'translate(-50%, -50%)';
                pitchLabel.style.fontSize = '10px';
                pitchLabel.style.fontWeight = 'bold';
                pitchLabel.style.color = '#fff';
                pitchLabel.style.pointerEvents = 'none';
                pitchLabel.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
                el.appendChild(pitchLabel);
            }
            pitchLabel.textContent = PITCH_LABELS[pOffset] || pOffset;
        } else {
            el.style.top = '10%';
            el.style.height = '80%';
            const pitchLabel = el.querySelector('.pitch-label');
            if (pitchLabel) pitchLabel.remove();
        }

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
            
            // If in pitch mode, dynamically expand the overlay bounds over the shrunken block
            if (isPitchMode) {
                overlay.style.height = '500%';
                overlay.style.top = '-200%';
            } else {
                overlay.style.height = '100%';
                overlay.style.top = '0';
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