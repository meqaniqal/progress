import { GRID_STEPS, DRUM_ROWS, DRUM_ROW_BG_COLORS, DRUM_LABELS, DEFAULT_DRUM_PARAMS } from './rhythmConfig.js';
import { generateId } from './patternUtils.js';
import { editorState, app, setCurrentPattern, getDurationBeats, renderRhythmTimeline } from './rhythmEditor.js';
import { getCustomDrumPeaks, decodeCustomDrumSample, clearCustomDrumSample, playDrum, customDrumBuffers, getAudioCurrentTime } from './synth.js';
import { state, persistAppState } from './store.js';

function showDrumLabelMenu(rowType, rowEl) {
    document.querySelectorAll('.drum-label-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'drum-label-menu';
    menu.style.position = 'fixed';
    menu.style.backgroundColor = 'var(--bg-panel)';
    menu.style.border = '1px solid var(--border-main)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '12px';
    menu.style.zIndex = '2000';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '10px';
    menu.style.width = '240px';

    // Prevent the timeline from capturing the pointer and blocking interaction
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());

    const isSampleLoaded = !!customDrumBuffers[rowType];

    // Header container with title & preview button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid var(--border-main)';
    header.style.paddingBottom = '6px';
    header.style.marginBottom = '4px';

    const title = document.createElement('div');
    title.textContent = isSampleLoaded ? `Sample: ${DRUM_LABELS[rowType]}` : `Synth: ${DRUM_LABELS[rowType]}`;
    title.style.fontSize = '13px';
    title.style.fontWeight = 'bold';
    title.style.color = 'var(--text-main)';
    header.appendChild(title);

    const auditionBtn = document.createElement('button');
    auditionBtn.innerHTML = '🔊';
    auditionBtn.title = 'Audition Sound';
    auditionBtn.style.background = 'none';
    auditionBtn.style.border = 'none';
    auditionBtn.style.cursor = 'pointer';
    auditionBtn.style.fontSize = '16px';
    auditionBtn.style.padding = '0 4px';
    auditionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playDrum(rowType, getAudioCurrentTime());
    });
    header.appendChild(auditionBtn);
    menu.appendChild(header);

    // Initialize state.drumParams[rowType] if not already present
    if (!state.drumParams) {
        state.drumParams = {};
    }
    if (!state.drumParams[rowType]) {
        state.drumParams[rowType] = structuredClone(DEFAULT_DRUM_PARAMS[rowType]);
    }
    const params = state.drumParams[rowType];
    if (isSampleLoaded && (params.pitch === undefined || params.pitch > 3.0)) {
        params.pitch = 1.0;
    }

    // Build controls list
    const controls = [];
    if (isSampleLoaded) {
        controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 5.0, step: 0.05, unit: 's' });
        controls.push({ key: 'pitch', label: 'Pitch (Speed)', min: 0.2, max: 3.0, step: 0.05, unit: 'x' });
        controls.push({ key: 'cutoff', label: 'Cutoff', min: 200, max: 20000, step: 100, unit: 'Hz' });
        controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
        controls.push({ key: 'volume', label: 'Volume', min: 0, max: 1.0, step: 0.05, unit: '%' });
    } else {
        if (rowType === 'kick') {
            controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 2.0, step: 0.05, unit: 's' });
            controls.push({ key: 'pitch', label: 'Pitch', min: 30, max: 150, step: 1, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
            controls.push({ key: 'volume', label: 'Volume', min: 0, max: 1.0, step: 0.05, unit: '%' });
        } else if (rowType === 'snare') {
            controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 2.0, step: 0.05, unit: 's' });
            controls.push({ key: 'pitch', label: 'Pitch', min: 50, max: 300, step: 1, unit: 'Hz' });
            controls.push({ key: 'cutoff', label: 'Cutoff', min: 200, max: 8000, step: 50, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
            controls.push({ key: 'volume', label: 'Volume', min: 0, max: 1.0, step: 0.05, unit: '%' });
            controls.push({ key: 'noiseType', label: 'Noise Type', type: 'select', options: ['white', 'pink', 'metallic'] });
        } else if (rowType === 'chh' || rowType === 'ohh') {
            const maxDecay = rowType === 'chh' ? 0.5 : 2.0;
            controls.push({ key: 'decay', label: 'Decay', min: 0.01, max: maxDecay, step: 0.01, unit: 's' });
            controls.push({ key: 'cutoff', label: 'Cutoff', min: 1000, max: 15000, step: 100, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
            controls.push({ key: 'volume', label: 'Volume', min: 0, max: 1.0, step: 0.05, unit: '%' });
            controls.push({ key: 'noiseType', label: 'Noise Type', type: 'select', options: ['white', 'pink', 'metallic'] });
        }
    }

    // Render controls
    controls.forEach(ctrl => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '3px';

        const labelContainer = document.createElement('div');
        labelContainer.style.display = 'flex';
        labelContainer.style.justifyContent = 'space-between';
        labelContainer.style.fontSize = '11px';
        labelContainer.style.color = 'var(--text-muted, #aaa)';

        const labelText = document.createElement('span');
        labelText.textContent = ctrl.label;
        labelContainer.appendChild(labelText);

        const currentVal = params[ctrl.key] !== undefined ? params[ctrl.key] : (ctrl.type === 'select' ? ctrl.options[0] : (ctrl.key === 'volume' ? 1.0 : 0));

        if (ctrl.type === 'select') {
            row.appendChild(labelContainer);

            const select = document.createElement('select');
            select.className = 'rhythm-select';
            select.style.fontSize = '12px';
            select.style.padding = '4px';
            select.style.background = 'var(--bg-body)';
            select.style.color = 'var(--text-main)';
            select.style.border = '1px solid var(--border-main)';
            select.style.borderRadius = '4px';
            select.style.cursor = 'pointer';
            select.style.width = '100%';

            ctrl.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
                if (opt === currentVal) option.selected = true;
                select.appendChild(option);
            });

            select.addEventListener('change', (e) => {
                params[ctrl.key] = e.target.value;
                playDrum(rowType, getAudioCurrentTime());
                persistAppState();
            });

            row.appendChild(select);
        } else {
            const valSpan = document.createElement('span');
            valSpan.style.fontFamily = 'monospace';
            valSpan.textContent = ctrl.unit === '%' ? `${Math.round(currentVal * 100)}%` : `${currentVal}${ctrl.unit}`;
            labelContainer.appendChild(valSpan);
            row.appendChild(labelContainer);

            const input = document.createElement('input');
            input.type = 'range';
            input.min = ctrl.min;
            input.max = ctrl.max;
            input.step = ctrl.step;
            input.value = currentVal;
            input.style.width = '100%';
            input.style.cursor = 'pointer';

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                params[ctrl.key] = val;
                valSpan.textContent = ctrl.unit === '%' ? `${Math.round(val * 100)}%` : `${val}${ctrl.unit}`;
            });

            input.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                params[ctrl.key] = val;
                playDrum(rowType, getAudioCurrentTime());
                persistAppState();
            });

            row.appendChild(input);
        }

        menu.appendChild(row);
    });

    // Spacer / Separator
    const sep = document.createElement('div');
    sep.style.borderBottom = '1px solid var(--border-main)';
    sep.style.margin = '4px 0';
    menu.appendChild(sep);

    // Sample controls (File load / Use synth)
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const arrayBuffer = ev.target.result;
            await decodeCustomDrumSample(rowType, arrayBuffer);
            if (state.drumParams && state.drumParams[rowType]) {
                state.drumParams[rowType].pitch = 1.0;
            }
            if (app.updateCustomDrumsUI) app.updateCustomDrumsUI();
            menu.remove();
            renderRhythmTimeline(); 
        };
        reader.readAsArrayBuffer(file);
    });

    const loadBtn = document.createElement('button');
    loadBtn.className = 'control-btn primary';
    loadBtn.innerHTML = '📂 Load Sample';
    loadBtn.style.fontSize = '11px';
    loadBtn.style.padding = '4px 8px';
    loadBtn.style.flex = '1';
    loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'control-btn secondary';
    clearBtn.innerHTML = '↺ Synth';
    clearBtn.style.fontSize = '11px';
    clearBtn.style.padding = '4px 8px';
    clearBtn.style.flex = '1';
    clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await clearCustomDrumSample(rowType);
        if (state.drumParams && state.drumParams[rowType]) {
            state.drumParams[rowType] = structuredClone(DEFAULT_DRUM_PARAMS[rowType]);
        }
        if (app.updateCustomDrumsUI) app.updateCustomDrumsUI();
        menu.remove();
        renderRhythmTimeline(); 
    });

    buttonRow.appendChild(fileInput);
    buttonRow.appendChild(loadBtn);
    buttonRow.appendChild(clearBtn);
    menu.appendChild(buttonRow);

    // Positioning
    document.body.appendChild(menu);
    const rect = rowEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;

    if (left + menuRect.width > window.innerWidth) {
        left = rect.left - menuRect.width - 8;
    }
    if (top + menuRect.height > window.innerHeight) {
        top = window.innerHeight - menuRect.height - 8;
    }
    if (top < 8) top = 8;
    if (left < 8) left = 8;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const closeHandler = (e) => {
        if (!menu.contains(e.target) && !rowEl.contains(e.target)) {
            menu.remove();
            document.removeEventListener('pointerdown', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('pointerdown', closeHandler), 10);
}

export function renderDrumGrid(container, pattern) {
    // Remove leftover slice timeline elements when switching to Drums
    container.querySelectorAll('.rhythm-instance').forEach(el => el.remove());
    const leftoverPianoGrid = container.querySelector('.piano-roll-grid');
    if (leftoverPianoGrid) leftoverPianoGrid.remove();
    const leftoverSliceInner = container.querySelector('.slice-timeline-inner');
    if (leftoverSliceInner) leftoverSliceInner.remove();

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
    const finalWidth = editorState.isGlobal ? baseWidth * (editorState.zoomLevel || 1.0) : baseWidth;
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
            
            line.style.opacity = '0.3';
            line.style.width = '';
            line.style.backgroundColor = '';
            line.style.transform = '';
            
            if (pos === 0) {
                line.style.opacity = '0.3';
            } else if (Math.abs(beatPos - Math.round(beatPos)) < 0.001) {
                line.style.opacity = '1.0';
                line.style.width = '2px';
                line.style.backgroundColor = 'var(--text-main)';
                line.style.transform = 'translateX(-1px)';
            } else if (Math.abs((beatPos * 2) - Math.round(beatPos * 2)) < 0.001) {
                line.style.opacity = '0.6';
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
            label.style.cursor = 'pointer';
            label.title = 'Click to change sound';
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                showDrumLabelMenu(rowType, rowEl);
            });
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
            
            // --- Waveform Rendering Engine ---
            const peaks = getCustomDrumPeaks(hit.row);

            if (peaks && peaks.length > 0) {
                hitEl.classList.add('has-waveform');
                hitEl.style.background = 'transparent';
                hitEl.style.border = 'none';
                hitEl.style.width = '45px'; // Expand hit area slightly to make room for waveform
                
                let svg = hitEl.querySelector('svg.waveform');
                if (!svg) {
                    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('class', 'waveform');
                    svg.setAttribute('viewBox', '0 0 100 100');
                    svg.setAttribute('preserveAspectRatio', 'none');
                    svg.style.width = '100%';
                    svg.style.height = '100%';
                    svg.style.position = 'absolute';
                    svg.style.top = '0';
                    svg.style.left = '0';
                    svg.style.pointerEvents = 'none';
                    
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const solidColor = (DRUM_ROW_BG_COLORS[hit.row] || 'var(--text-main)').replace('0.05', '0.9');
                    path.setAttribute('fill', solidColor);
                    svg.appendChild(path);
                    hitEl.appendChild(svg);
                }
                
                // Re-draw the path using mirrored top and bottom coordinates to create a balanced wave
                const path = svg.querySelector('path');
                let pathDataTop = '';
                let pathDataBottom = '';
                const step = 100 / (peaks.length - 1 || 1);
                for (let i = 0; i < peaks.length; i++) {
                    const x = i * step;
                    const yOffset = peaks[i] * 50; 
                    pathDataTop += `${i===0?'M':'L'} ${x} ${50 - yOffset} `;
                    pathDataBottom = `L ${x} ${50 + yOffset} ` + pathDataBottom; // Prepend to reverse drawing order
                }
                path.setAttribute('d', pathDataTop + pathDataBottom + 'Z');
            } else {
                hitEl.classList.remove('has-waveform');
                const svg = hitEl.querySelector('svg.waveform');
                if (svg) svg.remove();
                hitEl.style.background = '';
                hitEl.style.border = '';
                hitEl.style.width = '';
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