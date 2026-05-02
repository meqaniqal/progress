import { getHarmonicProfile, getChordNotes, getTransitionSuggestions, getAlternatives, getTurnaroundSuggestions, getDiatonicChords, SCALE_PREFIXES, getSynestheticColorProfile } from './theory.js';

export const KEY_NAMES = {
    60: 'C', 61: 'C♯/D♭', 62: 'D', 63: 'D♯/E♭', 64: 'E', 65: 'F',
    66: 'F♯/G♭', 67: 'G', 68: 'G♯/A♭', 69: 'A', 70: 'A♯/B♭', 71: 'B'
};

export function highlightChordInUI(index) {
    const items = document.querySelectorAll('.progression-item');
    items.forEach(el => el.classList.remove('playing'));
    if (items[index]) {
        items[index].classList.add('playing');
    }
}

export function updateKeyAndModeDisplay(state) {
    const modeStr = state.mode.charAt(0).toUpperCase() + state.mode.slice(1).replace(/([A-Z])/g, ' $1').trim();
    const keyName = KEY_NAMES[state.baseKey] || 'C'; // This is now just the root note name
    document.getElementById('key-display').textContent = `${keyName} ${modeStr}`;
    document.getElementById('key-selector').value = state.baseKey;
    
    const modeSelector = document.getElementById('mode-selector');
    if (modeSelector) modeSelector.value = state.mode;
    
    const isExotic = !!SCALE_PREFIXES[state.mode];
    
    const diatonicContainer = document.getElementById('palette-diatonic');
    if (diatonicContainer) {
        const label = diatonicContainer.querySelector('strong');
        if (label) label.textContent = isExotic ? 'Scale Chords:' : 'Diatonic:';

        const btns = diatonicContainer.querySelectorAll('.chord-btn');
        const diatonicSymbols = getDiatonicChords(state.mode);
        btns.forEach((btn, index) => {
            if (diatonicSymbols[index]) {
                btn.dataset.chord = diatonicSymbols[index];
                btn.textContent = diatonicSymbols[index].replace(/b/g, '♭').replace(/#/g, '♯');
                btn.style.display = 'inline-block';
            } else {
                btn.style.display = 'none'; // Hide leftover buttons (e.g., 7th button in 6-note scales)
            }
        });
    }

    // Hide traditional functional chord palettes when using symmetric/exotic scales
    const borrowedContainer = document.getElementById('palette-borrowed');
    if (borrowedContainer) borrowedContainer.style.display = isExotic ? 'none' : 'block';
    
    const extendedContainer = document.getElementById('palette-extended');
    if (extendedContainer) extendedContainer.style.display = isExotic ? 'none' : 'block';
}

function createBracketElement(id, text) {
    const br = document.createElement('div');
    br.id = id;
    br.textContent = text;
    br.draggable = true;
    br.className = 'bracket-element';
    return br;
}

export function renderProgression(state, selectedChordIndex, callbacks) {
    const display = document.getElementById('progression-display');

    const existingItems = display.querySelectorAll('.progression-item');

    state.currentProgression.forEach((chord, index) => {
        let el = existingItems[index];
        
        if (!el) {
            el = document.createElement('div');
            el.className = 'progression-item';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'chord-label';
            labelSpan.style.position = 'relative';
            labelSpan.style.zIndex = '1';
            el.appendChild(labelSpan);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.title = 'Remove Chord';
            removeBtn.textContent = '×';
            el.appendChild(removeBtn);
            
            el.draggable = true;

            const graphSegment = document.createElement('div');
            graphSegment.className = 'tension-graph-segment';
            const area = document.createElement('div');
            area.className = 'tension-area';
            graphSegment.appendChild(area);
            el.appendChild(graphSegment);

            display.appendChild(el);
        }

        const isTemp = state.temporarySwaps[index] !== undefined;
        const displayChord = isTemp ? state.temporarySwaps[index] : chord;

        const labelSpan = el.querySelector('.chord-label');
        if (labelSpan) labelSpan.textContent = `${displayChord.symbol} `;

        el.querySelector('.remove-btn').title = 'Remove Chord';
        el.querySelector('.remove-btn').textContent = '×';

        if (isTemp) el.classList.add('temporary');
        else el.classList.remove('temporary');

        const prevChord = index > 0 ? (state.temporarySwaps[index - 1] || state.currentProgression[index - 1]) : null;
        const nextChord = index < state.currentProgression.length - 1 ? (state.temporarySwaps[index + 1] || state.currentProgression[index + 1]) : null;
        
        const colors = getSynestheticColorProfile(displayChord, prevChord, nextChord, state.mode);

        el.style.setProperty('--dyn-hue', colors.hue);
        el.style.setProperty('--dyn-sat', `${colors.saturation}%`);
        el.style.setProperty('--dyn-lum-offset', `${colors.luminosityOffset}%`);

        const graphSegment = el.querySelector('.tension-graph-segment');
        if (graphSegment) {
            const yStart = (1 - (colors.tension + 1) / 2) * 100;
            graphSegment.style.setProperty('--tension-y-start', `${yStart}%`);
            const yEnd = (1 - (colors.nextTension + 1) / 2) * 100;
            graphSegment.style.setProperty('--tension-y-end', `${yEnd}%`);
        }

        const isSelected = selectedChordIndex !== null && Number(selectedChordIndex) === index;
        if (isSelected) {
            el.classList.add('selected-chord', 'selected', 'active');
            // Ensure robust visual highlight via inline styles to bypass any missing CSS
            el.style.boxShadow = '0 0 0 3px var(--original-chord-highlight, #4ade80)';
            el.style.transform = 'translateY(-2px)';
            el.style.zIndex = '2';
        } else {
            el.classList.remove('selected-chord', 'selected', 'active');
            el.style.boxShadow = 'none';
            el.style.transform = 'none';
            el.style.zIndex = '1';
        }

        el.dataset.index = index;

        const isInsideLoop = state.isLooping && index >= state.loopStart && index < state.loopEnd;
        if (isInsideLoop) el.classList.add('in-loop');
        else el.classList.remove('in-loop');
    });

    const lastChord = state.currentProgression[state.currentProgression.length - 1];
    const modPanel = document.getElementById('modulation-panel');
    if (lastChord && lastChord.key !== state.baseKey) {
        modPanel.style.display = 'block';
        const modeStr = state.mode.charAt(0).toUpperCase() + state.mode.slice(1).replace(/([A-Z])/g, ' $1').trim();
        document.getElementById('mod-from-key').textContent = `${KEY_NAMES[lastChord.key]} ${modeStr}`;
        document.getElementById('mod-to-key').textContent = `${KEY_NAMES[state.baseKey]} ${modeStr}`;
        
        const btnContainer = document.getElementById('mod-buttons');
        btnContainer.innerHTML = '';
        
        const suggestions = getTransitionSuggestions(lastChord.key, state.baseKey, state.mode);
        suggestions.forEach(sug => {
            const btn = document.createElement('button');
            btn.className = `chord-btn ${sug.type.includes('dominant') ? 'borrowed' : ''}`;
            btn.textContent = sug.symbol;
            btn.title = sug.description;
            btn.dataset.chord = sug.symbol;
            btn.dataset.key = sug.key;
            btn.draggable = true;
            
            btn.addEventListener('click', () => callbacks.onAuditionChord(sug.symbol, sug.key));
            btn.addEventListener('dblclick', () => callbacks.onAddChord(sug.symbol, sug.key));
            
            btnContainer.appendChild(btn);
        });
    } else {
        if (modPanel) modPanel.style.display = 'none';
    }

    for (let i = state.currentProgression.length; i < existingItems.length; i++) {
        display.removeChild(existingItems[i]);
    }

    if (state.currentProgression.length > 0 && state.isLooping) {
        let startBr = document.getElementById('bracket-start') || createBracketElement('bracket-start', '[');
        let endBr = document.getElementById('bracket-end') || createBracketElement('bracket-end', ']');
        
        startBr.style.display = 'inline-block';
        endBr.style.display = 'inline-block';

        const updatedItems = display.querySelectorAll('.progression-item');
        if (updatedItems[state.loopStart]) display.insertBefore(startBr, updatedItems[state.loopStart]);
        else display.appendChild(startBr);

        if (updatedItems[state.loopEnd]) display.insertBefore(endBr, updatedItems[state.loopEnd]);
        else display.appendChild(endBr);
    } else {
        const startBr = document.getElementById('bracket-start');
        const endBr = document.getElementById('bracket-end');
        if (startBr && startBr.parentNode) startBr.parentNode.removeChild(startBr);
        if (endBr && endBr.parentNode) endBr.parentNode.removeChild(endBr);
    }

    const allItems = display.querySelectorAll('.progression-item');
    if (allItems.length > 1) {
        for (let i = 0; i < allItems.length - 1; i++) {
            const currentItem = allItems[i];
            const nextItem = allItems[i+1];
            currentItem.classList.remove('is-line-end');
            if (nextItem.offsetTop > currentItem.offsetTop) {
                currentItem.classList.add('is-line-end');
            }
        }
    }

    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = state.history.length === 0;

    renderChordInspector(state, selectedChordIndex, callbacks);
}

let isInspectorDelegated = false;
let currentUIState = null;
let currentUICallbacks = null;

function handleInspectorClick(e) {
    if (!currentUICallbacks || !currentUIState) return;
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.action) return;

    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index, 10);

    switch(action) {
        case 'swap':
            const orig = currentUIState.currentProgression[index];
            currentUICallbacks.onSwapChord(index, btn.dataset.alt, orig);
            break;
        case 'transpose':
            currentUICallbacks.onTransposeChord(index);
            break;
        case 'duration':
            currentUICallbacks.onChangeDuration(index, Number(btn.dataset.duration));
            break;
        case 'delete':
            currentUICallbacks.onRemoveChord(index);
            break;
        case 'turnaround':
            currentUICallbacks.onAddTurnaround(index, btn.dataset.alt, parseInt(btn.dataset.key, 10));
            break;
        case 'step-inversion':
            const direction = parseInt(btn.dataset.direction, 10);
            currentUICallbacks.onStepInversion(index, direction);
            break;
    }
}

function handleInspectorChange(e) {
    if (!currentUICallbacks) return;
    const select = e.target;
    if (select.tagName === 'SELECT' && select.dataset.action === 'changeChordKey') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeChordKey(index, parseInt(select.value, 10));
    } else if (select.tagName === 'SELECT' && select.dataset.action === 'changeVoicingType') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeVoicingType(index, select.value);
    }
}

function renderChordInspector(state, selectedChordIndex, callbacks) {
    const panel = document.getElementById('inspector-section');
    if (!panel) return;
    
    if (selectedChordIndex === null || !state.currentProgression[selectedChordIndex]) {
        panel.style.display = 'none';
        return;
    }

    currentUIState = state;
    currentUICallbacks = callbacks;

    panel.style.display = 'block';
    const content = document.getElementById('inspector-content');

    if (!isInspectorDelegated) {
        isInspectorDelegated = true;
        content.addEventListener('click', handleInspectorClick);
        content.addEventListener('change', handleInspectorChange);
    }
    content.innerHTML = '';

    const index = selectedChordIndex;
    const originalChord = state.currentProgression[index];
    const isTemp = state.temporarySwaps[index] !== undefined;
    const displayChord = isTemp ? state.temporarySwaps[index] : originalChord;

    document.getElementById('inspector-title').textContent = `Selected Chord: ${displayChord.symbol}`;

    const altsRow = document.createElement('div');
    altsRow.className = 'inspector-row';
    altsRow.innerHTML = `<strong class="inspector-label">Swap Chord:</strong>`;
    const altsBtnContainer = document.createElement('div');
    altsBtnContainer.className = 'inspector-btn-group';
    
    const alts = getAlternatives(displayChord.symbol, displayChord.key, state.mode);
    if (isTemp) alts.unshift(originalChord.symbol);
    
    if (alts.length === 0) {
        altsBtnContainer.innerHTML = `<span style="opacity: 0.5; font-size: 13px;">No close matches</span>`;
    } else {
        alts.forEach((alt, i) => {
            const btn = document.createElement('button');
            btn.className = 'chord-btn';
            btn.textContent = alt;
            if (isTemp && i === 0) btn.classList.add('original-swap-option');
            
            btn.dataset.action = 'swap';
            btn.dataset.index = index;
            btn.dataset.alt = alt;

            altsBtnContainer.appendChild(btn);
        });
    }
    altsRow.appendChild(altsBtnContainer);
    content.appendChild(altsRow);

    // --- Unified Tools Row (Transpose, Duration, Delete) ---
    const toolsRow = document.createElement('div');
    toolsRow.className = 'inspector-row';
    toolsRow.style.display = 'flex';
    toolsRow.style.flexWrap = 'wrap';
    toolsRow.style.gap = '20px';
    toolsRow.style.alignItems = 'center';
    toolsRow.style.marginTop = '4px';

    // 1. Transpose
    const modBlock = document.createElement('div');
    modBlock.style.display = 'flex';
    modBlock.style.alignItems = 'center';
    modBlock.style.gap = '8px';
    modBlock.innerHTML = `<strong class="inspector-label">Transpose:</strong>`;
    const modSelect = document.createElement('select');
    modSelect.className = 'rhythm-select';
    modSelect.style.padding = '4px 8px';
    Object.entries(KEY_NAMES).forEach(([val, name]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = name;
        if (parseInt(val, 10) === displayChord.key) opt.selected = true;
        modSelect.appendChild(opt);
    });
    modSelect.dataset.action = 'changeChordKey';
    modSelect.dataset.index = index;
    modBlock.appendChild(modSelect);
    toolsRow.appendChild(modBlock);

    // --- Voicing Type ---
    const voicingBlock = document.createElement('div');
    voicingBlock.style.display = 'flex';
    voicingBlock.style.alignItems = 'center';
    voicingBlock.style.gap = '8px';
    voicingBlock.innerHTML = `<strong class="inspector-label">Voicing:</strong>`;
    const voicingSelect = document.createElement('select');
    voicingSelect.className = 'rhythm-select';
    voicingSelect.style.padding = '4px 8px';
    
    const types = [
        { val: 'global', label: 'Global' },
        { val: 'auto', label: 'Auto' },
        { val: 'close', label: 'Close' },
        { val: 'quartal', label: 'Quartal' },
        { val: 'spread', label: 'Spread' }
    ];
    const currentType = displayChord.voicingType || 'global';
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.val;
        opt.textContent = t.label;
        if (t.val === currentType) opt.selected = true;
        voicingSelect.appendChild(opt);
    });
    voicingSelect.dataset.action = 'changeVoicingType';
    voicingSelect.dataset.index = index;
    voicingBlock.appendChild(voicingSelect);
    toolsRow.appendChild(voicingBlock);

    // --- Inversion Stepper ---
    const invBlock = document.createElement('div');
    invBlock.style.display = 'flex';
    invBlock.style.alignItems = 'center';
    invBlock.style.gap = '8px';
    invBlock.innerHTML = `<strong class="inspector-label">Inversion:</strong>`;

    const invOffset = displayChord.inversionOffset ?? 0;

    const stepperContainer = document.createElement('div');
    stepperContainer.style.display = 'flex';
    stepperContainer.style.alignItems = 'center';
    stepperContainer.style.gap = '4px';

    const displaySpan = document.createElement('span');
    displaySpan.style.minWidth = '30px';
    displaySpan.style.textAlign = 'center';
    displaySpan.style.fontWeight = '600';
    displaySpan.style.fontSize = '16px';
    displaySpan.textContent = invOffset > 0 ? `+${invOffset}` : invOffset;
    if (invOffset === 0) {
        displaySpan.style.opacity = '0.7';
        displaySpan.title = 'Auto';
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '2px';

    const upBtn = document.createElement('button');
    upBtn.className = 'chord-btn';
    upBtn.textContent = '▲';
    upBtn.dataset.action = 'step-inversion';
    upBtn.dataset.index = index;
    upBtn.dataset.direction = '1';
    upBtn.style.cssText = 'padding: 0px 6px; line-height: 1; font-size: 10px; margin: 0;';

    const downBtn = document.createElement('button');
    downBtn.className = 'chord-btn';
    downBtn.textContent = '▼';
    downBtn.dataset.action = 'step-inversion';
    downBtn.dataset.index = index;
    downBtn.dataset.direction = '-1';
    downBtn.style.cssText = 'padding: 0px 6px; line-height: 1; font-size: 10px; margin: 0;';

    buttonContainer.appendChild(upBtn);
    buttonContainer.appendChild(downBtn);

    stepperContainer.appendChild(displaySpan);
    stepperContainer.appendChild(buttonContainer);
    invBlock.appendChild(stepperContainer);

    toolsRow.appendChild(invBlock);

    // 2. Duration
    const durBlock = document.createElement('div');
    durBlock.style.display = 'flex';
    durBlock.style.alignItems = 'center';
    durBlock.style.gap = '8px';
    durBlock.innerHTML = `<strong class="inspector-label">Beats:</strong>`;
    const durBtnContainer = document.createElement('div');
    durBtnContainer.className = 'inspector-btn-group';
    const durations = [1, 2, 4, 8];
    const currentDuration = Number(displayChord.duration) || 2;
    durations.forEach(dur => {
        const btn = document.createElement('button');
        btn.className = 'chord-btn';
        btn.textContent = dur;
        if (dur === currentDuration) {
            btn.style.backgroundColor = 'var(--ctrl-primary-bg)';
            btn.style.color = '#ffffff';
            btn.style.borderColor = 'var(--ctrl-primary-bg)';
        } else btn.style.opacity = '0.6';
        btn.dataset.action = 'duration';
        btn.dataset.index = index;
        btn.dataset.duration = dur;
        btn.style.padding = '4px 10px';
        btn.style.margin = '0 2px';
        durBtnContainer.appendChild(btn);
    });
    durBlock.appendChild(durBtnContainer);
    toolsRow.appendChild(durBlock);

    // 3. Delete
    const delBtn = document.createElement('button');
    delBtn.className = 'chord-btn';
    delBtn.style.color = '#ef4444';
    delBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    delBtn.style.marginLeft = 'auto';
    delBtn.style.padding = '4px 12px';
    delBtn.innerHTML = '🗑 Delete';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.index = index;
    toolsRow.appendChild(delBtn);

    content.appendChild(toolsRow);

    // --- Conditional Rows (Out of Key & Turnaround) ---
    if (displayChord.key !== state.baseKey) {
        const transRow = document.createElement('div');
        transRow.className = 'inspector-row';
        transRow.style.marginTop = '4px';
        transRow.innerHTML = `<strong class="inspector-label" style="margin-right: 8px;">Out of Key:</strong>`;
        const transBtn = document.createElement('button');
        transBtn.className = 'chord-btn';
        transBtn.style.padding = '4px 10px';
        const modeStr = state.mode.charAt(0).toUpperCase() + state.mode.slice(1).replace(/([A-Z])/g, ' $1').trim();
        transBtn.textContent = `Transpose to ${KEY_NAMES[state.baseKey]} ${modeStr}`;
        transBtn.dataset.action = 'transpose';
        transBtn.dataset.index = index;
        transRow.appendChild(transBtn);
        content.appendChild(transRow);
    }

    const firstChordIndex = state.isLooping ? state.loopStart : 0;
    const lastChordIndex = state.isLooping ? Math.max(0, state.loopEnd - 1) : Math.max(0, state.currentProgression.length - 1);
    
    if (index === lastChordIndex && state.currentProgression.length > 0) {
        const firstChord = state.temporarySwaps[firstChordIndex] || state.currentProgression[firstChordIndex];
        if (firstChord) {
            const turnRow = document.createElement('div');
            turnRow.className = 'inspector-row';
            turnRow.style.display = 'flex';
            turnRow.style.flexWrap = 'wrap';
            turnRow.style.gap = '8px';
            turnRow.style.alignItems = 'center';
            turnRow.style.marginTop = '4px';

            const turnLabel = document.createElement('span');
            turnLabel.className = 'inspector-label';
            turnLabel.style.color = 'var(--ctrl-primary-bg)';
            turnLabel.style.fontWeight = 'bold';
            turnLabel.textContent = `Turnaround to ${firstChord.symbol}:`;
            turnRow.appendChild(turnLabel);

            const turnarounds = getTurnaroundSuggestions(firstChord.symbol, state.mode, state.baseKey);
            turnarounds.forEach(alt => {
                const btn = document.createElement('button');
                btn.className = 'chord-btn';
                btn.style.padding = '4px 10px';
                btn.textContent = `+ ${alt}`;
                btn.dataset.action = 'turnaround';
                btn.dataset.index = index;
                btn.dataset.alt = alt;
                btn.dataset.key = firstChord.key;
                turnRow.appendChild(btn);
            });
            content.appendChild(turnRow);
        }
    }
}