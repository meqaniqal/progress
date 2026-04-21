import { saveState, loadState } from './storage.js';
import { applyVoiceLeading, getAlternatives } from './theory.js';
import { CONFIG } from './config.js';
import { auditionChord, playProgression, stopAllAudio } from './audio.js';
import { setupDragZone, setupDraggableSource } from './dragdrop.js';
import { exportToMidi } from './midi.js';
import { calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder, calculateLoopBounds } from './stateUtils.js';

        // --- Single Source of Truth ---
        const state = {
            currentProgression: [],
            temporarySwaps: {}, // Map of index -> temporary chord string (e.g. { 1: 'vi' })
            baseKey: 60, // C4
            bpm: 90,
            isLooping: true,
            useVoiceLeading: true,
            loopStart: 0,
            loopEnd: 0,
            theme: 'light'
        };
        let isPlaying = false;
        let currentPlaybackStopFunction = null; // Stores the stop function returned by audio.playProgression
        let activeMenuIndex = null;

        const KEY_NAMES = {
            60: 'C Major', 61: 'C♯/D♭ Major', 62: 'D Major', 63: 'D♯/E♭ Major', 64: 'E Major', 65: 'F Major',
            66: 'F♯/G♭ Major', 67: 'G Major', 68: 'G♯/A♭ Major', 69: 'A Major', 70: 'A♯/B♭ Major', 71: 'B Major'
        };

        // Resolves the progression with any active temporary swaps applied
        function getActiveProgression() {
            return state.currentProgression.map((chord, index) => 
                state.temporarySwaps[index] !== undefined ? state.temporarySwaps[index] : chord
            );
        }

        function applyLoopBounds() {
            const bounds = calculateLoopBounds(state.currentProgression.length, state.loopStart, state.loopEnd);
            state.loopStart = bounds.start;
            state.loopEnd = bounds.end;
        }

        function addChord(numeral) {
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.push({ symbol: numeral, key: state.baseKey });
            
            if (isAtEnd) state.loopEnd = state.currentProgression.length;
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function removeChord(index) {
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.temporarySwaps = calculateSwapsOnRemove(state.temporarySwaps, index);
            activeMenuIndex = null;
            state.currentProgression.splice(index, 1);
            
            if (isAtEnd) {
                state.loopEnd = state.currentProgression.length;
            } else if (index < state.loopEnd) {
                state.loopEnd--;
            }
            
            if (index < state.loopStart) {
                state.loopStart--;
            }
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function clearProgression() {
            state.temporarySwaps = {};
            activeMenuIndex = null;
            if (currentPlaybackStopFunction) currentPlaybackStopFunction(); // Stop current playback
            isPlaying = false;
            if (document.getElementById('btn-play-toggle')) document.getElementById('btn-play-toggle').textContent = '▶';
            state.currentProgression = [];
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function persistAppState() {
            saveState(state);
        }

        function createBracketElement(id, text) {
            const br = document.createElement('div');
            br.id = id;
            br.textContent = text;
            br.draggable = true;
            Object.assign(br.style, {
                display: 'inline-block',
                fontSize: '36px',
                fontWeight: '200',
                color: 'var(--bracket-color)',
                margin: '0 4px',
                cursor: 'ew-resize',
                userSelect: 'none',
                verticalAlign: 'top',
                lineHeight: '40px',
                fontFamily: 'monospace'
            });
            return br;
        }

        // --- UI Rendering ---
        function renderProgression() {
            const display = document.getElementById('progression-display');
            const existingItems = display.querySelectorAll('.progression-item');

            state.currentProgression.forEach((chord, index) => {
                let el = existingItems[index];
                
                if (!el) {
                    // Create new element if we have more state items than DOM nodes
                    el = document.createElement('div');
                    el.className = 'progression-item';

                    const textNode = document.createTextNode('');
                    el.appendChild(textNode);

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-btn';
                    removeBtn.title = 'Remove Chord';
                    removeBtn.textContent = '×';
                    el.appendChild(removeBtn);
                    
                    el.draggable = true;
                    display.appendChild(el);
                }

                // Reconcile specific UI features
                const isTemp = state.temporarySwaps[index] !== undefined;
                const displayChord = isTemp ? state.temporarySwaps[index] : chord;

                el.childNodes[0].textContent = `${displayChord.symbol} `;

                // The action button is always a remove button.
                el.querySelector('.remove-btn').title = 'Remove Chord';
                el.querySelector('.remove-btn').textContent = '×';

                // Handle temporary swap styling
                if (isTemp) {
                    el.classList.add('temporary');
                } else {
                    el.classList.remove('temporary');
                }
                const finalizeBtn = el.querySelector('.finalize-btn');
                if (finalizeBtn) finalizeBtn.remove();

                // Handle swap menu rendering
                if (activeMenuIndex === index) {
                    el.style.position = 'relative';
                    el.style.zIndex = '100'; // Elevate to render over chords on the next row

                    let swapMenu = el.querySelector('.swap-menu');
                    if (!swapMenu) {
                        swapMenu = document.createElement('div');
                        swapMenu.className = 'swap-menu';
                        const alts = getAlternatives(displayChord.symbol);
                        if (isTemp) {
                            alts.unshift(chord.symbol); // Add original chord as first option
                        }
                        alts.forEach((alt, i) => {
                            const btn = document.createElement('button');
                            btn.className = 'chord-btn swap-menu-btn';
                            btn.textContent = alt;
                            btn.dataset.alt = alt; // Handled by Event Delegation
                            btn.dataset.altKey = chord.key; // Lock the alternative to the chord's original key!
                            if (isTemp && i === 0) {
                                btn.classList.add('original-swap-option');
                            }
                            swapMenu.appendChild(btn);
                        });
                        el.appendChild(swapMenu);
                    }
                } else {
                    el.style.zIndex = ''; // Reset z-index
                    const swapMenu = el.querySelector('.swap-menu');
                    if (swapMenu) swapMenu.remove();
                }

                // Dataset index updated so Event Delegation can route the click correctly
                el.dataset.index = index;

                // Highlight items within the loop visually
                const isInsideLoop = state.isLooping && index >= state.loopStart && index < state.loopEnd;
                if (isInsideLoop) {
                    el.classList.add('in-loop');
                } else {
                    el.classList.remove('in-loop');
                }
            });

            // Remove excess DOM elements if the progression shrank
            for (let i = state.currentProgression.length; i < existingItems.length; i++) {
                display.removeChild(existingItems[i]);
            }

            // Ensure brackets are rendered natively into the flex flow if looping is enabled
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
                // Hide brackets if looping is disabled or progression is empty
                const startBr = document.getElementById('bracket-start');
                const endBr = document.getElementById('bracket-end');
                if (startBr && startBr.parentNode) startBr.parentNode.removeChild(startBr);
                if (endBr && endBr.parentNode) endBr.parentNode.removeChild(endBr);
            }
        }

        function highlightChordInUI(index) {
            const items = document.querySelectorAll('.progression-item');
            items.forEach(el => el.classList.remove('playing'));
            if (items[index]) {
                items[index].classList.add('playing');
            }
        }

        function updateLoopButtonUI() {
            const loopToggleBtn = document.getElementById('btn-loop-toggle');
            if (state.isLooping) {
                loopToggleBtn.className = 'control-btn primary';
            } else {
                loopToggleBtn.className = 'control-btn secondary';
            }
        }

// --- Initialization & Event Listeners ---
function initApp() {
    const display = document.getElementById('progression-display');
    
    setupDragZone(
        display,
        (oldIndex, newIndex, newLoopStart, newLoopEnd) => { // onReorder Event
            if (oldIndex === null || newIndex === null) {
                renderProgression(); // Clean up visually
                return;
            }
            
            if (oldIndex !== newIndex) {
                state.temporarySwaps = calculateSwapsOnReorder(state.temporarySwaps, state.currentProgression.length, oldIndex, newIndex);
                activeMenuIndex = null;
                const itemToMove = state.currentProgression.splice(oldIndex, 1)[0];
                state.currentProgression.splice(newIndex, 0, itemToMove);
            } // If no move, still need to update loop bounds from bracket drag
            
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            }
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        },
        (sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd) => { // onAddFromSource Event
            if (insertIndex === null) insertIndex = state.currentProgression.length;
            
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex);
            activeMenuIndex = null;
            state.currentProgression.splice(insertIndex, 0, { symbol: sourceChord, key: sourceKey });
            
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            } else {
                if (isAtEnd) state.loopEnd = state.currentProgression.length;
                else if (insertIndex < state.loopEnd) state.loopEnd++;
                
                if (insertIndex <= state.loopStart) state.loopStart++;
            }
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        },
        (bracketId, insertIndex, newLoopStart, newLoopEnd) => { // onBracketDrop Event
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            } else {
                if (insertIndex === null) insertIndex = state.currentProgression.length;
                if (bracketId === 'bracket-start') state.loopStart = insertIndex;
                else if (bracketId === 'bracket-end') state.loopEnd = insertIndex;
            }
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        },
        () => renderProgression(), // onDragCancel Event
        (index) => state.currentProgression[index].symbol // State lookup
    );

    // Close context menu if clicked outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.progression-item')) {
            if (activeMenuIndex !== null) {
                activeMenuIndex = null;
                renderProgression();
            }
        }
    });

    // --- Event Delegation ---
    display.addEventListener('click', (e) => {
        const item = e.target.closest('.progression-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.index, 10);
        const originalChord = state.currentProgression[index];
        
        if (e.target.classList.contains('remove-btn')) {
            removeChord(index);
            return;
        }

        if (e.target.classList.contains('finalize-btn')) {
            return;
        }

        if (e.target.classList.contains('swap-menu-btn')) {
            const selectedAltSymbol = e.target.dataset.alt;

            // If the selected alternative is the original chord, revert the swap.
            if (selectedAltSymbol === originalChord.symbol) {
                delete state.temporarySwaps[index];
            } else {
                // Otherwise, set the new temporary swap.
                state.temporarySwaps[index] = { symbol: selectedAltSymbol, key: parseInt(e.target.dataset.altKey, 10) };
            }
            activeMenuIndex = null;
            if (!isPlaying) {
                const chordToAudition = state.temporarySwaps[index] || originalChord;
                auditionChord(chordToAudition.symbol, chordToAudition.key);
            }
            persistAppState();
            renderProgression();
            return;
        }

        // Clicked the chord badge itself
        const displayChord = state.temporarySwaps[index] || originalChord;
        if (!isPlaying) {
            auditionChord(displayChord.symbol, displayChord.key);
        }

        // Toggle Context Menu
        activeMenuIndex = activeMenuIndex === index ? null : index;
        renderProgression();
    });
    
    const chordBtns = document.querySelectorAll('.chord-btn');
    chordBtns.forEach(btn => {
        setupDraggableSource(btn, () => state.baseKey);
        btn.addEventListener('click', () => {
            auditionChord(btn.dataset.chord, state.baseKey);
        });
        btn.addEventListener('dblclick', () => {
            addChord(btn.dataset.chord);
        });
    });

    const playToggleBtn = document.getElementById('btn-play-toggle');
    playToggleBtn.addEventListener('click', () => {
        if (isPlaying) {
            if (currentPlaybackStopFunction) currentPlaybackStopFunction();
            playToggleBtn.textContent = '▶';
            isPlaying = false;
            currentPlaybackStopFunction = null;
        } else {
            currentPlaybackStopFunction = playProgression(
                () => ({ ...state, currentProgression: getActiveProgression() }), // Injects active swaps
                highlightChordInUI,
                () => { // onComplete
                    playToggleBtn.textContent = '▶';
                    isPlaying = false;
                    currentPlaybackStopFunction = null;
                }
            );
            playToggleBtn.textContent = '■';
            isPlaying = true;
        }
    });

    // Spacebar to play/stop
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
            e.preventDefault(); // Prevent page scroll and default button clicks
            playToggleBtn.click();
        }
    });

    document.getElementById('btn-clear').addEventListener('click', clearProgression);
    document.getElementById('btn-export').addEventListener('click', () => {
        const exportState = { ...state, currentProgression: getActiveProgression() };
        exportToMidi(exportState);
    });
    
    document.getElementById('bpm-slider').addEventListener('input', (e) => {
        state.bpm = parseInt(e.target.value, 10);
        persistAppState();
    });
    document.getElementById('btn-loop-toggle').addEventListener('click', () => {
        state.isLooping = !state.isLooping;
        updateLoopButtonUI();
        applyLoopBounds();
        persistAppState();
        renderProgression();
    });
    document.getElementById('voice-leading').addEventListener('change', (e) => {
        state.useVoiceLeading = e.target.checked;
        persistAppState();
    });

    document.getElementById('key-selector').addEventListener('change', (e) => {
        const newKey = parseInt(e.target.value, 10);
        state.baseKey = newKey;
        document.getElementById('key-display').textContent = KEY_NAMES[newKey] || 'C Major';
        persistAppState();
    });

    const savedState = loadState();
    if (savedState) {
        if (savedState.baseKey !== undefined) state.baseKey = savedState.baseKey;
        if (savedState.currentProgression) {
            // Gracefully upgrade legacy string arrays to objects
            state.currentProgression = savedState.currentProgression.map(item => 
                typeof item === 'string' ? { symbol: item, key: state.baseKey } : item
            );
        }
        if (savedState.bpm) state.bpm = savedState.bpm;
        // Handle transition from old schema names (loop -> isLooping, voiceLeading -> useVoiceLeading)
        if (savedState.isLooping !== undefined || savedState.loop !== undefined) state.isLooping = savedState.isLooping ?? savedState.loop;
        if (savedState.useVoiceLeading !== undefined || savedState.voiceLeading !== undefined) state.useVoiceLeading = savedState.useVoiceLeading ?? savedState.voiceLeading;
        if (savedState.loopStart !== undefined) state.loopStart = savedState.loopStart;
        if (savedState.loopEnd !== undefined) state.loopEnd = savedState.loopEnd;
        if (savedState.temporarySwaps) state.temporarySwaps = savedState.temporarySwaps;
        if (savedState.theme !== undefined) state.theme = savedState.theme;
    }
    applyLoopBounds();
    
    // --- Theme Management ---
    document.documentElement.setAttribute('data-theme', state.theme);
    
    const themeToggleBtn = document.createElement('button');
    themeToggleBtn.id = 'theme-toggle';
    themeToggleBtn.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    themeToggleBtn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
        themeToggleBtn.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        persistAppState();
    });
    document.body.appendChild(themeToggleBtn);

    // Sync UI to State
    document.getElementById('key-selector').value = state.baseKey;
    document.getElementById('key-display').textContent = KEY_NAMES[state.baseKey] || 'C Major';
    document.getElementById('bpm-slider').value = state.bpm;
    updateLoopButtonUI();
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
    
    renderProgression();
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}