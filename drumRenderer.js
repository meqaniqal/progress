import { GRID_STEPS, DRUM_ROWS, DRUM_ROW_BG_COLORS, DRUM_LABELS } from './rhythmConfig.js';
import { generateId } from './patternUtils.js';
import { editorState, app, setCurrentPattern, getDurationBeats, renderRhythmTimeline } from './rhythmEditor.js';

export function renderDrumGrid(container, pattern) {
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