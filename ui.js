import { getHarmonicProfile, getChordNotes, getTransitionSuggestions, getAlternatives, getTurnaroundSuggestions } from './theory.js?v=3';

export const KEY_NAMES = {
    60: 'C Major', 61: 'C♯/D♭ Major', 62: 'D Major', 63: 'D♯/E♭ Major', 64: 'E Major', 65: 'F Major',
    66: 'F♯/G♭ Major', 67: 'G Major', 68: 'G♯/A♭ Major', 69: 'A Major', 70: 'A♯/B♭ Major', 71: 'B Major'
};

export function highlightChordInUI(index) {
    const items = document.querySelectorAll('.progression-item');
    items.forEach(el => el.classList.remove('playing'));
    if (items[index]) {
        items[index].classList.add('playing');
    }
}

export function updateLoopButtonUI(state) {
    const loopToggleBtn = document.getElementById('btn-loop-toggle');
    if (state.isLooping) {
        loopToggleBtn.className = 'control-btn primary';
    } else {
        loopToggleBtn.className = 'control-btn secondary';
    }
}

export function updateKeyAndModeDisplay(state) {
    const modeStr = state.mode === 'major' ? 'Major' : 'Minor';
    const keyName = KEY_NAMES[state.baseKey] || 'C';
    document.getElementById('key-display').textContent = `${keyName} ${modeStr}`;
    document.getElementById('key-selector').value = state.baseKey;
    
    const modeSelector = document.getElementById('mode-selector');
    if (modeSelector) modeSelector.value = state.mode;
    
    const palMajor = document.getElementById('palette-major');
    const palMinor = document.getElementById('palette-minor');
    if (palMajor) palMajor.style.display = state.mode === 'major' ? 'block' : 'none';
    if (palMinor) palMinor.style.display = state.mode === 'minor' ? 'block' : 'none';
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

        const profile = getHarmonicProfile(displayChord.symbol, state.mode);
        const chordNotes = getChordNotes(displayChord.symbol, displayChord.key);
        let absoluteHue = 240; 
        if (chordNotes) {
            const rootMidi = chordNotes[0];
            const pitchClass = rootMidi % 12;
            const circlePos = (pitchClass * 7) % 12; 
            absoluteHue = (240 + (circlePos * 30)) % 360;
        }

        let backwardTensionDelta = 0;
        let forwardTensionDelta = 0;
        
        if (index > 0) {
            const prevChord = state.temporarySwaps[index - 1] || state.currentProgression[index - 1];
            const prevProfile = getHarmonicProfile(prevChord.symbol, state.mode);
            backwardTensionDelta = profile.tension - prevProfile.tension;
        }
        
        if (index < state.currentProgression.length - 1) {
            const nextChord = state.temporarySwaps[index + 1] || state.currentProgression[index + 1];
            const nextProfile = getHarmonicProfile(nextChord.symbol, state.mode);
            forwardTensionDelta = nextProfile.tension - profile.tension;
        }

        let satValue = profile.isBorrowed ? 85 : 50 + Math.max(0, backwardTensionDelta * 15) + Math.max(0, forwardTensionDelta * 10);
        const lumOffset = (profile.tension * 8) + (backwardTensionDelta * 4) + (forwardTensionDelta * 2);

        el.style.setProperty('--dyn-hue', absoluteHue);
        el.style.setProperty('--dyn-sat', `${Math.min(100, satValue)}%`);
        el.style.setProperty('--dyn-lum-offset', `${lumOffset}%`);

        const graphSegment = el.querySelector('.tension-graph-segment');
        if (graphSegment) {
            const yStart = (1 - (profile.tension + 1) / 2) * 100;
            graphSegment.style.setProperty('--tension-y-start', `${yStart}%`);

            if (index < state.currentProgression.length - 1) {
                const nextChord = state.temporarySwaps[index + 1] || state.currentProgression[index + 1];
                const nextProfile = getHarmonicProfile(nextChord.symbol, state.mode);
                const yEnd = (1 - (nextProfile.tension + 1) / 2) * 100;
                graphSegment.style.setProperty('--tension-y-end', `${yEnd}%`);
            } else {
                graphSegment.style.setProperty('--tension-y-end', `${yStart}%`);
            }
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
        document.getElementById('mod-from-key').textContent = KEY_NAMES[lastChord.key];
        document.getElementById('mod-to-key').textContent = KEY_NAMES[state.baseKey];
        
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
    }
}

function handleInspectorChange(e) {
    if (!currentUICallbacks) return;
    const select = e.target;
    if (select.tagName === 'SELECT' && select.dataset.action === 'modulate') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onModulateKey(index, parseInt(select.value, 10));
    }
}

function renderChordInspector(state, selectedChordIndex, callbacks) {
    const panel = document.getElementById('chord-inspector-panel');
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

    document.getElementById('inspector-title').textContent = `Inspector: ${displayChord.symbol}`;

    const altsRow = document.createElement('div');
    altsRow.className = 'inspector-row';
    altsRow.innerHTML = `<strong class="inspector-label">Swap Chord:</strong>`;
    const altsBtnContainer = document.createElement('div');
    altsBtnContainer.className = 'inspector-btn-group';
    
    const alts = getAlternatives(displayChord.symbol);
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

    const modRow = document.createElement('div');
    modRow.className = 'inspector-row';
    modRow.innerHTML = `<strong class="inspector-label">Modulate Key:</strong>`;
    const modSelect = document.createElement('select');
    modSelect.className = 'rhythm-select';
    Object.entries(KEY_NAMES).forEach(([val, name]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = name;
        if (parseInt(val, 10) === state.baseKey) opt.selected = true;
        modSelect.appendChild(opt);
    });
    modSelect.dataset.action = 'modulate';
    modSelect.dataset.index = index;
    modRow.appendChild(modSelect);
    content.appendChild(modRow);

    if (displayChord.key !== state.baseKey) {
        const transRow = document.createElement('div');
        transRow.className = 'inspector-row';
        transRow.innerHTML = `<strong class="inspector-label">Out of Key:</strong>`;
        const transBtn = document.createElement('button');
        transBtn.className = 'chord-btn';
        transBtn.textContent = `Transpose to ${KEY_NAMES[state.baseKey]}`;
        transBtn.dataset.action = 'transpose';
        transBtn.dataset.index = index;
        transRow.appendChild(transBtn);
        content.appendChild(transRow);
    }

    const durRow = document.createElement('div');
    durRow.className = 'inspector-row';
    durRow.innerHTML = `<strong class="inspector-label">Duration (Beats):</strong>`;
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
        durBtnContainer.appendChild(btn);
    });
    durRow.appendChild(durBtnContainer);
    content.appendChild(durRow);

    const actionRow = document.createElement('div');
    actionRow.className = 'inspector-row';
    actionRow.style.marginTop = '8px';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'chord-btn';
    delBtn.style.color = '#ef4444';
    delBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    delBtn.innerHTML = '🗑 Delete Chord';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.index = index;
    actionRow.appendChild(delBtn);

    const firstChordIndex = state.isLooping ? state.loopStart : 0;
    const lastChordIndex = state.isLooping ? Math.max(0, state.loopEnd - 1) : Math.max(0, state.currentProgression.length - 1);
    
    if (index === lastChordIndex && state.currentProgression.length > 0) {
        const firstChord = state.temporarySwaps[firstChordIndex] || state.currentProgression[firstChordIndex];
        if (firstChord) {
            const turnLabel = document.createElement('span');
            turnLabel.className = 'inspector-label';
            turnLabel.style.marginLeft = 'auto';
            turnLabel.style.minWidth = 'auto';
            turnLabel.style.color = 'var(--ctrl-primary-bg)';
            turnLabel.textContent = `Turnaround to ${firstChord.symbol}:`;
            actionRow.appendChild(turnLabel);

            const turnarounds = getTurnaroundSuggestions(firstChord.symbol, state.mode);
            turnarounds.forEach(alt => {
                const btn = document.createElement('button');
                btn.className = 'chord-btn';
                btn.textContent = `+ ${alt}`;
                btn.dataset.action = 'turnaround';
                btn.dataset.index = index;
                btn.dataset.alt = alt;
                btn.dataset.key = firstChord.key;
                actionRow.appendChild(btn);
            });
        }
    }
    content.appendChild(actionRow);
}