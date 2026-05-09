import { GRID_STEPS, DRUM_ROWS, DRUM_ROW_BG_COLORS, DRUM_LABELS } from './rhythmConfig.js';
import { generateId } from './patternUtils.js';
import { 
    editorState, 
    app, 
    getCurrentPattern, 
    setCurrentPattern, 
    getDurationBeats 
} from './rhythmEditor.js';

export function renderRhythmTimeline() {
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
    // Remove leftover slice timeline elements when switching to Drums
    container.querySelectorAll('.rhythm-instance').forEach(el => el.remove());
    const leftoverPianoGrid = container.querySelector('.piano-roll-grid');
    if (leftoverPianoGrid) leftoverPianoGrid.remove();

    let gridEl = container.querySelector('.drum-grid');
    if (!gridEl) {
        gridEl = document.createElement('div');
        gridEl.className = 'drum-grid';
        container.appendChild(gridEl);
    }
    
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

    let gridLinesInner = gridEl.querySelector('.drum-grid-lines');
    if (!gridLinesInner) {
        gridLinesInner = document.createElement('div');
        gridLinesInner.className = 'drum-grid-lines';
        gridLinesInner.style.position = 'absolute';
        gridLinesInner.style.left = '48px';
        gridLinesInner.style.right = '16px';
        gridLinesInner.style.top = '0';
        gridLinesInner.style.bottom = '0';
        gridLinesInner.style.pointerEvents = 'none';
        gridLinesInner.style.zIndex = '1';
        gridEl.appendChild(gridLinesInner);
    }

    const normalizedGridStep = editorState.isGridEnabled ? (GRID_STEPS[editorState.gridStepIndex].value * (4 / beats)) : 0;

    const requiredLines = [];
    if (normalizedGridStep > 0) {
        for (let i = 0; i < 1.0; i += normalizedGridStep) {
            requiredLines.push(i);
        }
    }

    const existingLines = Array.from(gridLinesInner.querySelectorAll('.drum-grid-line:not(.smart-dup-line)'));
    const lineCount = Math.max(requiredLines.length, existingLines.length);
    for (let i = 0; i < lineCount; i++) {
        if (i < requiredLines.length) {
            let line = existingLines[i];
            if (!line) {
                line = document.createElement('div');
                line.className = 'drum-grid-line';
                gridLinesInner.appendChild(line);
            }
            const pos = requiredLines[i];
            line.style.left = `${pos * 100}%`;
            const beatPos = pos * beats / 4;
            
            line.style.opacity = '0.15';
            line.style.width = '';
            line.style.backgroundColor = '';
            line.style.transform = '';
            
            if (pos === 0) {
                line.style.opacity = '0.15';
            } else if (Math.abs(beatPos - Math.round(beatPos)) < 0.001) {
                line.style.opacity = '0.8';
                line.style.width = '2px';
                line.style.backgroundColor = 'var(--text-main)';
                line.style.transform = 'translateX(-1px)';
            } else if (Math.abs((beatPos * 2) - Math.round(beatPos * 2)) < 0.001) {
                line.style.opacity = '0.4';
            }
        } else {
            existingLines[i].remove();
        }
    }

    // 2. Render Rows and Hits
    const rowElements = {};
    DRUM_ROWS.forEach(rowType => {
        let rowEl = gridEl.querySelector(`.drum-row[data-row-type="${rowType}"]`);
        if (!rowEl) {
            rowEl = document.createElement('div');
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
        }
        rowElements[rowType] = rowEl.querySelector('.drum-row-inner');
    });

    const hitIds = new Set();
    if (pattern && pattern.hits) {
        pattern.hits.forEach(hit => {
            hitIds.add(hit.id);
            const parentRow = rowElements[hit.row];
            if (!parentRow) return;

            let hitEl = gridEl.querySelector(`.drum-hit[data-id="${hit.id}"]`);
            if (hitEl && hitEl.parentElement !== parentRow) {
                parentRow.appendChild(hitEl);
            }

            if (!hitEl) {
                hitEl = document.createElement('div');
                hitEl.dataset.id = hit.id;
                parentRow.appendChild(hitEl);
            }

            hitEl.className = `drum-hit ${hit.row}-hit`;
            hitEl.style.left = `${hit.time * 100}%`;
            
            if (hit.id === editorState.draggedHitId) {
                hitEl.classList.add('grabbing');
            } else {
                hitEl.classList.remove('grabbing');
            }
            
            if (hit.id === editorState.selectedHitId) {
                hitEl.classList.add('selected');
            } else {
                hitEl.classList.remove('selected');
            }
            
            if (hit.time >= 1.0) {
                hitEl.style.opacity = hit.time > 1.25 ? '0' : '0.2';
                hitEl.style.pointerEvents = 'none'; // Prevent interaction with truncated data
            } else {
                hitEl.style.opacity = 0.3 + (hit.velocity !== undefined ? hit.velocity : 1.0) * 0.7;
                hitEl.style.pointerEvents = '';
            }
        });
    }

    gridEl.querySelectorAll('.drum-hit').forEach(hitEl => {
        if (!hitIds.has(hitEl.dataset.id)) {
            hitEl.remove();
        }
    });

    // --- Smart Duplication Button ---
    let dupLine = gridLinesInner.querySelector('.smart-dup-line');
    let duplicateBtn = gridLinesInner.querySelector('.smart-dup-btn');

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