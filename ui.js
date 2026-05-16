import { getHarmonicProfile, getChordNotes, getTransitionSuggestions, getDiatonicChords, SCALE_PREFIXES } from './theory.js';
import { renderChordInspector } from './inspectorController.js';

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

// --- Synesthetic UI Engine ---
// Evaluates a chord's color profile based on its harmonic relationship to surrounding chords
export function getSynestheticColorProfile(currentChord, prevChord, nextChord, mode = 'major') {
    const profile = getHarmonicProfile(currentChord.symbol, mode, currentChord.key);
    const chordNotes = getChordNotes(currentChord.symbol, currentChord.key);
    
    let hue = 240; 
    if (chordNotes) {
        const rootMidi = chordNotes[0];
        const pitchClass = rootMidi % 12;
        const circlePos = (pitchClass * 7) % 12; 
        // Map the 12 circle positions evenly across the full 360-degree color wheel.
        // The new double-ring selection outline ensures contrast against any color!
        hue = (circlePos * 30) % 360;
    }

    let backwardTensionDelta = 0;
    let forwardTensionDelta = 0;
    
    if (prevChord) {
        const prevProfile = getHarmonicProfile(prevChord.symbol, mode, prevChord.key);
        backwardTensionDelta = profile.tension - prevProfile.tension;
    }
    if (nextChord) {
        const nextProfile = getHarmonicProfile(nextChord.symbol, mode, nextChord.key);
        forwardTensionDelta = nextProfile.tension - profile.tension;
    }

    return {
        hue,
        saturation: Math.min(100, profile.isBorrowed ? 85 : 50 + Math.max(0, backwardTensionDelta * 15) + Math.max(0, forwardTensionDelta * 10)),
        luminosityOffset: (profile.tension * 8) + (backwardTensionDelta * 4) + (forwardTensionDelta * 2),
        tension: profile.tension,
        nextTension: nextChord ? getHarmonicProfile(nextChord.symbol, mode, nextChord.key).tension : profile.tension
    };
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
            // Ensure robust visual highlight using a double-ring to separate the green from the chord color
            el.style.boxShadow = '0 0 0 2px var(--bg-body), 0 0 0 5px var(--original-chord-highlight, #4ade80)';
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
        
        const fromKeyStr = `${KEY_NAMES[lastChord.key]} ${modeStr}`;
        const toKeyStr = `${KEY_NAMES[state.baseKey]} ${modeStr}`;
        
        if (state.isAdvancedMode) {
            modPanel.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <strong style="font-size: 13px; color: var(--placeholder-border);">${fromKeyStr} ➔ ${toKeyStr} pivot chords:</strong>
                    <div id="mod-buttons" style="display: inline-flex; flex-wrap: wrap; gap: 4px;"></div>
                </div>
            `;
        } else {
            modPanel.innerHTML = `
                <strong>🚀 Modulation Detected!</strong>
                <p>Smooth the transition from <strong id="mod-from-key">${fromKeyStr}</strong> to <strong id="mod-to-key">${toKeyStr}</strong> using these suggested Pivot chords:</p>
                <div id="mod-buttons"></div>
            `;
        }

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