import { getHarmonicProfile, getChordNotes, getTransitionSuggestions, getDiatonicChords, SCALE_PREFIXES, deduceSourceMode, getEffectiveTuning, getChordSignature, getDynamicProgSuggestions, getModulationLabel, getProceduralCategory, getCategoryIndex, HAND_CURATED_CATEGORIES } from './theory.js';
import { getMicrotonalDiatonicChords } from './microtonalDictionary.js';
import { renderChordInspector } from './inspectorController.js';
import { CONFIG } from './config.js';

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
        hue = (circlePos * CONFIG.SYNESTHETIC_HUE_STEP) % 360;
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
    
    const isExotic = !!SCALE_PREFIXES[state.mode] || !!getMicrotonalDiatonicChords(state.mode);
    
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
    
    const seventhsContainer = document.getElementById('palette-7ths');
    if (seventhsContainer) seventhsContainer.style.display = isExotic ? 'none' : 'block';
    
    const extendedContainer = document.getElementById('palette-extended');
    if (extendedContainer) extendedContainer.style.display = isExotic ? 'none' : 'block';

    // Emotional suggestions section
    const emotionPageInput = document.getElementById('emotion-category-page-input');
    const emotionSelector = document.getElementById('emotion-selector');
    
    let catPage = state.editorState.chordChooserCategoryPage ?? 0;
    catPage = Math.max(0, Math.min(99, catPage));
    state.editorState.chordChooserCategoryPage = catPage;
    
    if (emotionPageInput) {
        emotionPageInput.value = catPage + 1;
    }
    
    const pageCategories = [];
    for (let j = 0; j < 6; j++) {
        const catIndex = (catPage * 6) + j;
        pageCategories.push(getProceduralCategory(catIndex, state.mode));
    }
    
    // Check if current active emotion is on this page, otherwise default to first
    const hasActiveEmotionOnPage = pageCategories.some(cat => cat.id === state.activeEmotion);
    if (!hasActiveEmotionOnPage && pageCategories.length > 0) {
        state.activeEmotion = pageCategories[0].id;
    }
    
    if (emotionSelector) {
        emotionSelector.innerHTML = '';
        pageCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.label;
            opt.title = cat.description;
            emotionSelector.appendChild(opt);
        });
        emotionSelector.value = state.activeEmotion;
    }

    const btnEmotionPrev = document.getElementById('btn-emotion-prev');
    const btnEmotionNext = document.getElementById('btn-emotion-next');
    if (btnEmotionPrev) btnEmotionPrev.disabled = catPage === 0;
    if (btnEmotionNext) btnEmotionNext.disabled = catPage === 99;
    
    const emotionalChordsContainer = document.getElementById('emotional-chords-container');
    if (emotionalChordsContainer) {
        emotionalChordsContainer.innerHTML = '';
        
        const selectedIndex = state.selectedChordIndex;
        const currentChord = (selectedIndex !== null && state.currentProgression[selectedIndex]) 
            ? (state.temporarySwaps[selectedIndex] ? { ...state.currentProgression[selectedIndex], ...state.temporarySwaps[selectedIndex] } : state.currentProgression[selectedIndex])
            : null;
            
        const suggestions = getDynamicProgSuggestions(currentChord, state.activeEmotion, state.mode, state.baseKey);
        
        const pageSize = 6;
        const totalPages = Math.max(1, Math.ceil(suggestions.length / pageSize));
        
        let currentPage = state.editorState.emotionPage || 0;
        if (currentPage >= totalPages) currentPage = totalPages - 1;
        if (currentPage < 0) currentPage = 0;
        state.editorState.emotionPage = currentPage;
        
        const pageIndicator = document.getElementById('sug-page-indicator');
        if (pageIndicator) {
            pageIndicator.textContent = `${currentPage + 1}/${totalPages}`;
        }
        
        const prevBtn = document.getElementById('btn-sug-prev');
        const nextBtn = document.getElementById('btn-sug-next');
        if (prevBtn) prevBtn.disabled = currentPage === 0;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
        
        const pageSuggestions = suggestions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
        
        const activeCat = getProceduralCategory(getCategoryIndex(state.activeEmotion), state.mode);
        const activeColor = activeCat.color || '#6366f1';
        
        pageSuggestions.forEach(sug => {
            const btn = document.createElement('button');
            btn.className = 'chord-btn';
            btn.dataset.chord = sug.symbol;
            btn.dataset.key = sug.key;
            btn.textContent = sug.symbol.replace(/b/g, '♭').replace(/#/g, '♯');
            btn.title = sug.description;
            btn.draggable = true;
            btn.style.boxShadow = `0 0 0 1px ${activeColor}`;
            btn.style.borderColor = activeColor;
            emotionalChordsContainer.appendChild(btn);
        });
    }

    // Color-code and label key transposition selector option tags
    const keySelector = document.getElementById('key-selector');
    if (keySelector) {
        Array.from(keySelector.options).forEach(opt => {
            const keyVal = parseInt(opt.value, 10);
            const diff = (keyVal - state.baseKey + 12) % 12;
            let label = KEY_NAMES[keyVal];
            
            const modLabel = getModulationLabel(state.baseKey, keyVal);
            if (modLabel) {
                label += ` ${modLabel}`;
            }
            opt.textContent = label;
            
            if (diff === 0) {
                opt.style.color = '#10b981';
            } else if (diff === 7) {
                opt.style.color = '#fbbf24';
            } else if (diff === 5) {
                opt.style.color = '#3b82f6';
            } else if (diff === 4) {
                opt.style.color = '#ef4444';
            } else if (diff === 3) {
                opt.style.color = '#8b5cf6';
            } else if (diff === 1) {
                opt.style.color = '#ec4899';
            } else if (diff === 11) {
                opt.style.color = '#6366f1';
            } else if (diff === 6) {
                opt.style.color = '#06b6d4';
            } else {
                opt.style.color = 'var(--text-main)';
            }
        });
    }
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

    // Calculate and update the total beats counter
    const totalBeats = state.currentProgression.reduce((sum, chord) => sum + (Number(chord.duration) || 2), 0);
    const beatsCounter = document.getElementById('total-beats-counter');
    if (beatsCounter) {
        beatsCounter.textContent = `(${totalBeats} beats)`;
    }

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
            
            btnContainer.appendChild(btn);
        });
    } else {
        if (modPanel) modPanel.style.display = 'none';
    }

    // --- Enharmonic Context Dimming ---
    // Calculate signatures for all chords currently in the active progression
    const activeSignatures = new Set();
    state.currentProgression.forEach((chord, i) => {
        const isTemp = state.temporarySwaps[i] !== undefined;
        const displayC = isTemp ? { ...chord, ...state.temporarySwaps[i] } : chord;
        const tuning = getEffectiveTuning(displayC.symbol, displayC.divisions || state.divisions || 12);
        const notes = getChordNotes(displayC.symbol, displayC.key, tuning.divisions);
        if (notes) activeSignatures.add(getChordSignature(notes, tuning.periodSize));
    });

    // Dim palette and modulation buttons that are already in the progression
    document.querySelectorAll('.chord-palette .chord-btn[data-chord], #mod-buttons .chord-btn[data-chord]').forEach(btn => {
        const btnSymbol = btn.dataset.chord;
        if (!btnSymbol) return; // Skip invisible placeholder buttons
        const btnKey = btn.hasAttribute('data-key') ? parseInt(btn.dataset.key, 10) : state.baseKey;
        const tuning = getEffectiveTuning(btnSymbol, state.divisions || 12);
        const notes = getChordNotes(btnSymbol, btnKey, tuning.divisions);
        if (notes && activeSignatures.has(getChordSignature(notes, tuning.periodSize))) {
            btn.classList.add('dimmed-chord');
            if (!btn.title) btn.title = "Already in progression";
        } else {
            btn.classList.remove('dimmed-chord');
            if (btn.title === "Already in progression") btn.title = "";
        }
    });
    
    const btnDragLoop = document.getElementById('btn-drag-loop');
    if (btnDragLoop) {
        if (state.currentProgression.length === 0 || state.loopStart >= state.loopEnd) {
            btnDragLoop.style.opacity = '0.3';
            btnDragLoop.style.pointerEvents = 'none';
        } else {
            btnDragLoop.style.opacity = '1';
            btnDragLoop.style.pointerEvents = 'auto';
        }
    }

    for (let i = state.currentProgression.length; i < existingItems.length; i++) {
        display.removeChild(existingItems[i]);
    }

    // Self-healing: Destroy any orphaned drag placeholders if a drag session was interrupted
    if (!document.querySelector('.dragging')) {
        display.querySelectorAll('.bracket-placeholder, .progression-placeholder').forEach(el => el.remove());
    }

    if (state.currentProgression.length > 0 && state.isLooping) {
        let startBr = document.getElementById('bracket-start') || createBracketElement('bracket-start', '[');
        let endBr = document.getElementById('bracket-end') || createBracketElement('bracket-end', ']');
        
        startBr.style.display = 'inline-block';
        endBr.style.display = 'inline-block';

        const updatedItems = display.querySelectorAll('.progression-item');
        
        if (!startBr.classList.contains('dragging')) {
            if (updatedItems[state.loopStart]) display.insertBefore(startBr, updatedItems[state.loopStart]);
            else display.appendChild(startBr);
        }
        if (!endBr.classList.contains('dragging')) {
            if (updatedItems[state.loopEnd]) display.insertBefore(endBr, updatedItems[state.loopEnd]);
            else display.appendChild(endBr);
        }
    } else {
        const startBr = document.getElementById('bracket-start');
        const endBr = document.getElementById('bracket-end');
        if (startBr && startBr.parentNode) startBr.parentNode.removeChild(startBr);
        if (endBr && endBr.parentNode) endBr.parentNode.removeChild(endBr);
    }

    const allItems = display.querySelectorAll('.progression-item');
    if (allItems.length > 1) {
        // Pass 1: Batch layout reads to prevent Forced Synchronous Layouts
        const offsets = Array.from(allItems).map(item => item.offsetTop);
        
        // Pass 2: Batch DOM writes
        for (let i = 0; i < allItems.length - 1; i++) {
            const currentItem = allItems[i];
            if (offsets[i + 1] > offsets[i]) {
                currentItem.classList.add('is-line-end');
            } else {
                currentItem.classList.remove('is-line-end');
            }
        }
        allItems[allItems.length - 1].classList.remove('is-line-end');
    } else if (allItems.length === 1) {
        allItems[0].classList.remove('is-line-end');
    }

    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = state.history.length === 0;

    const jumpBtn = document.getElementById('btn-jump-source');
    if (jumpBtn) {
        if (selectedChordIndex !== null && state.currentProgression[selectedChordIndex]) {
            const index = selectedChordIndex;
            const originalChord = state.currentProgression[index];
            const isTemp = state.temporarySwaps[index] !== undefined;
            const displayChord = isTemp ? { ...originalChord, ...state.temporarySwaps[index] } : originalChord;
            
            const sourceMode = deduceSourceMode(displayChord.symbol, state.mode);
            const targetKey = displayChord.key;
            
            if (sourceMode && (sourceMode.toLowerCase() !== state.mode.toLowerCase() || targetKey !== state.baseKey)) {
                const modeStr = sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1).replace(/([A-Z])/g, ' $1').trim();
                const keyName = KEY_NAMES[Math.round(targetKey)] || targetKey;
                jumpBtn.textContent = `Jump to ${keyName} ${modeStr}`;
                jumpBtn.style.display = 'flex';
                jumpBtn.onclick = () => callbacks.onSetGlobalKeyAndMode(targetKey, sourceMode);
            } else {
                jumpBtn.style.display = 'none';
            }
        } else {
            jumpBtn.style.display = 'none';
        }
    }

    renderChordInspector(state, selectedChordIndex, callbacks);
}