import { getPlayableNotes, getHarmonicProfile, getChordNotes, getTransitionSuggestions, getAlternatives, getTurnaroundSuggestions, getDiatonicChords, SCALE_PREFIXES, getSynestheticColorProfile } from './theory.js';

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
        const displayChord = isTemp ? { ...chord, ...state.temporarySwaps[index] } : chord;

        const labelSpan = el.querySelector('.chord-label');
        if (labelSpan) labelSpan.textContent = `${displayChord.symbol} `;

        el.querySelector('.remove-btn').title = 'Remove Chord';
        el.querySelector('.remove-btn').textContent = '×';

        if (isTemp) el.classList.add('temporary');
        else el.classList.remove('temporary');

        const prevChord = index > 0 ? (state.temporarySwaps[index - 1] ? { ...state.currentProgression[index - 1], ...state.temporarySwaps[index - 1] } : state.currentProgression[index - 1]) : null;
        const nextChord = index < state.currentProgression.length - 1 ? (state.temporarySwaps[index + 1] ? { ...state.currentProgression[index + 1], ...state.temporarySwaps[index + 1] } : state.currentProgression[index + 1]) : null;
        
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
        case 'set-global-voicing':
            currentUICallbacks.onSetGlobalVoicing(btn.dataset.val);
            break;
    }
}

function handleInspectorChange(e) {
    if (!currentUICallbacks) return;
    const select = e.target;
    if (select.tagName === 'SELECT' && select.dataset.action === 'changeChordKey') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeChordKey(index, parseInt(select.value, 10));
    } else if (select.tagName === 'INPUT' && select.dataset.action === 'duration-slider') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeDuration(index, parseInt(select.value, 10));
    } else if (select.tagName === 'INPUT' && select.dataset.action === 'voicing-slider') {
        const index = parseInt(select.dataset.index, 10);
        const types = ['global', 'auto', 'close', 'quartal', 'spread'];
        const val = Math.round(parseFloat(select.value));
        currentUICallbacks.onChangeVoicingType(index, types[val]);
    }
}

function handleInspectorInput(e) {
    if (!currentUICallbacks || !currentUIState) return;
    const target = e.target;
    if (target.tagName === 'INPUT' && target.dataset.action === 'duration-slider') {
        const label = document.getElementById('dur-label-' + target.dataset.index);
        if (label) label.innerHTML = `<strong>Beats:</strong> ${target.value}`;
    } else if (target.tagName === 'INPUT' && target.dataset.action === 'voicing-slider') {
        const val = Math.round(parseFloat(target.value));
        const label = document.getElementById('voicing-label-' + target.dataset.index);
        const types = ['Global', 'Auto', 'Close', 'Quartal', 'Spread'];
        const valStrings = ['global', 'auto', 'close', 'quartal', 'spread'];
        if (label) label.innerHTML = `<strong>Voicing:</strong> ${types[val]}`;
        
        const setGlobalBtn = document.querySelector(`.set-global-btn[data-index="${target.dataset.index}"]`);
        if (setGlobalBtn) {
            setGlobalBtn.title = `Set '${types[val]}' as the new master default`;
            setGlobalBtn.dataset.val = valStrings[val];
            setGlobalBtn.style.display = val === 0 ? 'none' : 'inline-block';
        }
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
        content.addEventListener('input', handleInspectorInput);
    }

    const index = selectedChordIndex;
    const originalChord = state.currentProgression[index];
    const isTemp = state.temporarySwaps[index] !== undefined;
    const displayChord = isTemp ? { ...originalChord, ...state.temporarySwaps[index] } : originalChord;
    const currentDuration = displayChord.duration || 2;

    document.getElementById('inspector-title').textContent = `Selected Chord: ${displayChord.symbol}`;

    // --- Swap Chord (Alts) Row ---
    let altsRow = content.querySelector('.inspector-row-alts');
    let altsBtnContainer;
    if (!altsRow) {
        altsRow = document.createElement('div');
        altsRow.className = 'inspector-row inspector-row-alts';
        altsRow.innerHTML = `<strong class="inspector-label">Swap Chord:</strong>`;
        altsBtnContainer = document.createElement('div');
        altsBtnContainer.className = 'inspector-btn-group alts-btn-group';
        altsRow.appendChild(altsBtnContainer);
        content.appendChild(altsRow);
    } else {
        altsBtnContainer = altsRow.querySelector('.alts-btn-group');
    }

    const alts = getAlternatives(displayChord.symbol, displayChord.key, state.mode);
    if (isTemp) alts.unshift(originalChord.symbol);
    
    if (alts.length === 0) {
        altsBtnContainer.innerHTML = `<span style="opacity: 0.5; font-size: 13px;">No close matches</span>`;
    } else {
        const noMatchSpan = altsBtnContainer.querySelector('span');
        if (noMatchSpan) noMatchSpan.remove();

        const existingBtns = altsBtnContainer.querySelectorAll('button');
        alts.forEach((alt, i) => {
            let btn = existingBtns[i];
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'chord-btn inspector-alt-btn';
                altsBtnContainer.appendChild(btn);
            }
            btn.textContent = alt;
            btn.dataset.action = 'swap';
            btn.dataset.index = index;
            btn.dataset.alt = alt;

            if (isTemp && i === 0) btn.classList.add('original-swap-option');
            else btn.classList.remove('original-swap-option');
        });

        for (let i = alts.length; i < existingBtns.length; i++) {
            existingBtns[i].remove();
        }
    }

    // --- Unified Tools Row (Transpose, Duration, Delete) ---
    let toolsRow = content.querySelector('.inspector-row-tools');
    if (!toolsRow) {
        toolsRow = document.createElement('div');
        toolsRow.className = 'inspector-row inspector-row-tools';

        // 1. Transpose
        const modBlock = document.createElement('div');
        modBlock.className = 'mod-block';
        modBlock.innerHTML = `<strong class="inspector-label">Transpose:</strong>`;
        const modSelect = document.createElement('select');
        modSelect.className = 'rhythm-select mod-select';
        modSelect.style.padding = '4px 8px';
        Object.entries(KEY_NAMES).forEach(([val, name]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = name;
            modSelect.appendChild(opt);
        });
        modBlock.appendChild(modSelect);
        toolsRow.appendChild(modBlock);

        // --- Voicing Type Slider ---
        const voicingBlock = document.createElement('div');
        voicingBlock.className = 'voicing-block';

        const vLabel = document.createElement('span');
        vLabel.className = 'inspector-label voicing-label';
        voicingBlock.appendChild(vLabel);

        const vSlider = document.createElement('input');
        vSlider.type = 'range';
        vSlider.className = 'voicing-slider';
        vSlider.min = 0;
        vSlider.max = 4;
        vSlider.step = 0.01;
        vSlider.title = "Equivalent voicings share the same color track";
        voicingBlock.appendChild(vSlider);

        // Buttons: Set as Global
        const vBtnGroup = document.createElement('div');
        vBtnGroup.className = 'v-btn-group';
        
        const setGlobalBtn = document.createElement('button');
        setGlobalBtn.className = 'control-btn secondary set-global-btn';
        setGlobalBtn.textContent = 'Set as Global';
        vBtnGroup.appendChild(setGlobalBtn);
        
        voicingBlock.appendChild(vBtnGroup);
        toolsRow.appendChild(voicingBlock);

        // --- Inversion Stepper ---
        const invBlock = document.createElement('div');
        invBlock.className = 'inv-block';
        invBlock.innerHTML = `<strong class="inspector-label">Inversion:</strong>`;

        const stepperContainer = document.createElement('div');
        stepperContainer.className = 'stepper-container';

        const displaySpan = document.createElement('span');
        displaySpan.className = 'inv-display';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'inv-btn-container';

        const upBtn = document.createElement('button');
        upBtn.className = 'chord-btn inv-up-btn';
        upBtn.textContent = '▲';

        const downBtn = document.createElement('button');
        downBtn.className = 'chord-btn inv-down-btn';
        downBtn.textContent = '▼';

        buttonContainer.appendChild(upBtn);
        buttonContainer.appendChild(downBtn);

        stepperContainer.appendChild(displaySpan);
        stepperContainer.appendChild(buttonContainer);
        invBlock.appendChild(stepperContainer);

        toolsRow.appendChild(invBlock);

        // 2. Duration
        const durBlock = document.createElement('div');
        durBlock.className = 'dur-block';
        
        const durLabel = document.createElement('span');
        durLabel.className = 'inspector-label dur-label';
        
        const durSlider = document.createElement('input');
        durSlider.type = 'range';
        durSlider.className = 'dur-slider';
        durSlider.min = 1;
        durSlider.max = 8;
        durSlider.step = 1;
        durSlider.setAttribute('list', 'beat-snaps');
        
        durBlock.appendChild(durLabel);
        durBlock.appendChild(durSlider);
        toolsRow.appendChild(durBlock);

        // 3. Delete
        const delBtn = document.createElement('button');
        delBtn.className = 'chord-btn del-btn';
        delBtn.innerHTML = '🗑 Delete';
        toolsRow.appendChild(delBtn);

        content.appendChild(toolsRow);
    }

    // --- Update Tools Properties ---
    
    // 1. Transpose Update
    const modSelect = toolsRow.querySelector('.mod-select');
    modSelect.dataset.action = 'changeChordKey';
    modSelect.dataset.index = index;
    modSelect.value = displayChord.key;

    // 2. Voicing Type Slider Update
    const currentType = displayChord.voicingType || 'global';
    const mockProg = state.currentProgression.map((c, i) => {
        const swap = state.temporarySwaps[i];
        return swap ? { ...c, ...swap } : c;
    });
    
    const types = [
        { val: 'global', label: 'Global' },
        { val: 'auto', label: 'Auto' },
        { val: 'close', label: 'Close' },
        { val: 'quartal', label: 'Quartal' },
        { val: 'spread', label: 'Spread' }
    ];
    
    const vLabel = toolsRow.querySelector('.voicing-label');
    vLabel.id = 'voicing-label-' + index;
    const activeLabel = types.find(t => t.val === currentType).label;
    vLabel.innerHTML = `<strong>Voicing:</strong> ${activeLabel}`;

    const resultsMap = {};
    const uniqueResults = [];
    types.forEach(t => {
        mockProg[index] = { ...mockProg[index], voicingType: t.val };
        const notes = getPlayableNotes(mockProg, state)[index];
        const noteStr = notes ? notes.join(',') : 'none';
        resultsMap[t.val] = noteStr;
        if (!uniqueResults.includes(noteStr)) {
            uniqueResults.push(noteStr);
        }
    });

    const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const gradientStops = types.map((t, i) => {
        const resultIndex = uniqueResults.indexOf(resultsMap[t.val]);
        const matchColor = colorPalette[resultIndex % colorPalette.length];
        return `${matchColor} ${i * 20}%, ${matchColor} ${(i + 1) * 20}%`;
    }).join(', ');

    const vSlider = toolsRow.querySelector('.voicing-slider');
    vSlider.value = types.findIndex(t => t.val === currentType);
    vSlider.dataset.action = 'voicing-slider';
    vSlider.dataset.index = index;
    vSlider.style.background = `linear-gradient(to right, ${gradientStops})`;
    
    const setGlobalBtn = toolsRow.querySelector('.set-global-btn');
    setGlobalBtn.title = `Set '${activeLabel}' as the new master default`;
    setGlobalBtn.dataset.action = 'set-global-voicing';
    setGlobalBtn.dataset.index = index;
    setGlobalBtn.dataset.val = currentType;
    setGlobalBtn.style.display = currentType === 'global' ? 'none' : 'inline-block';

    // 3. Inversion Update
    const invOffset = displayChord.inversionOffset ?? 0;
    const invDisplay = toolsRow.querySelector('.inv-display');
    invDisplay.textContent = invOffset > 0 ? `+${invOffset}` : invOffset;
    if (invOffset === 0) {
        invDisplay.style.opacity = '0.7';
        invDisplay.title = 'Auto';
    } else {
        invDisplay.style.opacity = '1';
        invDisplay.title = '';
    }

    const upBtn = toolsRow.querySelector('.inv-up-btn');
    upBtn.dataset.action = 'step-inversion';
    upBtn.dataset.index = index;
    upBtn.dataset.direction = '1';

    const downBtn = toolsRow.querySelector('.inv-down-btn');
    downBtn.dataset.action = 'step-inversion';
    downBtn.dataset.index = index;
    downBtn.dataset.direction = '-1';

    // 4. Duration Update
    const durLabel = toolsRow.querySelector('.dur-label');
    durLabel.id = 'dur-label-' + index;
    durLabel.innerHTML = `<strong>Beats:</strong> ${currentDuration}`;
    
    const durSlider = toolsRow.querySelector('.dur-slider');
    durSlider.value = currentDuration;
    durSlider.dataset.action = 'duration-slider';
    durSlider.dataset.index = index;

    // 5. Delete Update
    const delBtn = toolsRow.querySelector('.del-btn');
    delBtn.dataset.action = 'delete';
    delBtn.dataset.index = index;

    // --- Conditional Rows (Out of Key & Turnaround) ---
    let transRow = content.querySelector('.inspector-row-trans');
    if (displayChord.key !== state.baseKey) {
        if (!transRow) {
            transRow = document.createElement('div');
            transRow.className = 'inspector-row inspector-row-trans';
            transRow.innerHTML = `<strong class="inspector-label" style="margin-right: 8px;">Out of Key:</strong>`;
            const transBtn = document.createElement('button');
            transBtn.className = 'chord-btn trans-btn';
            transRow.appendChild(transBtn);
            
            const turnRow = content.querySelector('.inspector-row-turn');
            if (turnRow) {
                content.insertBefore(transRow, turnRow);
            } else {
                content.appendChild(transRow);
            }
        }
        const transBtn = transRow.querySelector('.trans-btn');
        const modeStr = state.mode.charAt(0).toUpperCase() + state.mode.slice(1).replace(/([A-Z])/g, ' $1').trim();
        transBtn.textContent = `Transpose to ${KEY_NAMES[state.baseKey]} ${modeStr}`;
        transBtn.dataset.action = 'transpose';
        transBtn.dataset.index = index;
    } else if (transRow) {
        transRow.remove();
    }

    const firstChordIndex = state.isLooping ? state.loopStart : 0;
    const lastChordIndex = state.isLooping ? Math.max(0, state.loopEnd - 1) : Math.max(0, state.currentProgression.length - 1);
    
    let turnRow = content.querySelector('.inspector-row-turn');
    if (index === lastChordIndex && state.currentProgression.length > 0) {
        const firstChordOriginal = state.currentProgression[firstChordIndex];
        const firstChord = state.temporarySwaps[firstChordIndex] ? { ...firstChordOriginal, ...state.temporarySwaps[firstChordIndex] } : firstChordOriginal;
        if (firstChord) {
            let turnBtnsContainer;
            if (!turnRow) {
                turnRow = document.createElement('div');
                turnRow.className = 'inspector-row inspector-row-turn';

                const turnLabel = document.createElement('span');
                turnLabel.className = 'inspector-label turn-label';
                turnRow.appendChild(turnLabel);

                turnBtnsContainer = document.createElement('div');
                turnBtnsContainer.className = 'turn-btns-container';
                turnRow.appendChild(turnBtnsContainer);

                content.appendChild(turnRow);
            } else {
                turnBtnsContainer = turnRow.querySelector('.turn-btns-container');
            }

            const turnLabel = turnRow.querySelector('.turn-label');
            turnLabel.textContent = `Turnaround to ${firstChord.symbol}:`;

            const turnarounds = getTurnaroundSuggestions(firstChord.symbol, state.mode, state.baseKey);
            const existingBtns = turnBtnsContainer.querySelectorAll('button');
            
            turnarounds.forEach((alt, i) => {
                let btn = existingBtns[i];
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'chord-btn turn-btn';
                    turnBtnsContainer.appendChild(btn);
                }
                btn.textContent = `+ ${alt}`;
                btn.dataset.action = 'turnaround';
                btn.dataset.index = index;
                btn.dataset.alt = alt;
                btn.dataset.key = firstChord.key;
            });

            for (let i = turnarounds.length; i < existingBtns.length; i++) {
                existingBtns[i].remove();
            }
        } else if (turnRow) {
            turnRow.remove();
        }
    } else if (turnRow) {
        turnRow.remove();
    }
}