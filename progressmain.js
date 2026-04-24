import { saveState, loadState } from './storage.js?v=3';
import { applyVoiceLeading, getAlternatives, getHarmonicProfile, getChordNotes, getTransitionSuggestions, getTurnaroundSuggestions, generateAIPrompt } from './theory.js?v=3';
import { CONFIG } from './config.js?v=3';
import { auditionChord, playProgression, stopAllAudio } from './audio.js?v=3';
import { initDragAndDrop } from './dragdrop.js?v=3';
import { exportToMidi } from './midi.js?v=3';
import { exportToWav } from './wavExport.js?v=3';
import { calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder, calculateLoopBounds } from './stateUtils.js?v=3';
import { initChordPattern } from './patternUtils.js?v=3';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor } from './rhythmEditor.js?v=3';

        // --- Single Source of Truth ---
        const state = {
            currentProgression: [],
            temporarySwaps: {}, // Map of index -> temporary chord string (e.g. { 1: 'vi' })
            history: [], // Stores progression snapshots for Undo
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
        let selectedChordIndex = null; // Tracks which chord is actively open in the Rhythm Editor

        const KEY_NAMES = {
            60: 'C Major', 61: 'C♯/D♭ Major', 62: 'D Major', 63: 'D♯/E♭ Major', 64: 'E Major', 65: 'F Major',
            66: 'F♯/G♭ Major', 67: 'G Major', 68: 'G♯/A♭ Major', 69: 'A Major', 70: 'A♯/B♭ Major', 71: 'B Major'
        };

        // Resolves the progression with any active temporary swaps applied
        function getActiveProgression() {
            return state.currentProgression.map((chord, index) => {
                if (state.temporarySwaps[index] !== undefined) {
                    // Safely merge the underlying rhythm pattern onto the temporary swapped chord
                    return { ...state.temporarySwaps[index], pattern: chord.pattern };
                }
                return chord;
            });
        }

        function applyLoopBounds() {
            const bounds = calculateLoopBounds(state.currentProgression.length, state.loopStart, state.loopEnd);
            state.loopStart = bounds.start;
            state.loopEnd = bounds.end;
        }

        // --- History & Undo ---
        function saveHistoryState() {
            state.history.push({
                currentProgression: JSON.parse(JSON.stringify(state.currentProgression)),
                temporarySwaps: JSON.parse(JSON.stringify(state.temporarySwaps)),
                loopStart: state.loopStart,
                loopEnd: state.loopEnd
            });
            if (state.history.length > 50) state.history.shift(); // Max 50 undos
        }

        function undo() {
            if (state.history.length === 0) return;
            const previousState = state.history.pop();
            state.currentProgression = previousState.currentProgression;
            state.temporarySwaps = previousState.temporarySwaps;
            state.loopStart = previousState.loopStart;
            state.loopEnd = previousState.loopEnd;
            activeMenuIndex = null;
            selectedChordIndex = null;
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function addChord(numeral, targetKey = state.baseKey) {
            saveHistoryState();
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.push({ symbol: numeral, key: targetKey, pattern: initChordPattern() });
            
            if (isAtEnd) state.loopEnd = state.currentProgression.length;
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function removeChord(index) {
            saveHistoryState();
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.temporarySwaps = calculateSwapsOnRemove(state.temporarySwaps, index);
            activeMenuIndex = null;
            selectedChordIndex = null;
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
            if (state.currentProgression.length === 0) return;
            saveHistoryState();
            state.temporarySwaps = {};
            activeMenuIndex = null;
            selectedChordIndex = null;
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
            br.className = 'bracket-element';
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

                    // --- Create Tension Graph elements ---
                    const graphSegment = document.createElement('div');
                    graphSegment.className = 'tension-graph-segment';
                    
                    const area = document.createElement('div');
                    area.className = 'tension-area';
                    
                    graphSegment.appendChild(area);
                    el.appendChild(graphSegment);
                    // --- End Tension Graph elements ---

                    display.appendChild(el);
                }

                // Reconcile specific UI features
                const isTemp = state.temporarySwaps[index] !== undefined;
                const displayChord = isTemp ? state.temporarySwaps[index] : chord;

                const labelSpan = el.querySelector('.chord-label');
                if (labelSpan) labelSpan.textContent = `${displayChord.symbol} `;

                // The action button is always a remove button.
                el.querySelector('.remove-btn').title = 'Remove Chord';
                el.querySelector('.remove-btn').textContent = '×';

                // Handle temporary swap styling
                if (isTemp) {
                    el.classList.add('temporary');
                } else {
                    el.classList.remove('temporary');
                }

                // Apply Synesthetic Color Mapping
                const profile = getHarmonicProfile(displayChord.symbol);
                
                // 1. Absolute Key Coloring (Circle of Fifths mapped to Hue)
                const chordNotes = getChordNotes(displayChord.symbol, displayChord.key);
                let absoluteHue = 240; 
                if (chordNotes) {
                    const rootMidi = chordNotes[0];
                    const pitchClass = rootMidi % 12;
                    const circlePos = (pitchClass * 7) % 12; // Maps pitch class to [0..11] Circle of Fifths index
                    absoluteHue = (240 + (circlePos * 30)) % 360;
                }

                // 2. Contextual Dynamic Coloring (Bi-directional Tension Ripple)
                let backwardTensionDelta = 0;
                let forwardTensionDelta = 0;
                
                if (index > 0) {
                    const prevChord = state.temporarySwaps[index - 1] || state.currentProgression[index - 1];
                    const prevProfile = getHarmonicProfile(prevChord.symbol);
                    backwardTensionDelta = profile.tension - prevProfile.tension;
                }
                
                if (index < state.currentProgression.length - 1) {
                    const nextChord = state.temporarySwaps[index + 1] || state.currentProgression[index + 1];
                    const nextProfile = getHarmonicProfile(nextChord.symbol);
                    forwardTensionDelta = nextProfile.tension - profile.tension;
                }

                // Saturation: Base + Heat from previous jump + Anticipation heat for next jump
                let satValue = profile.isBorrowed ? 85 : 50 + Math.max(0, backwardTensionDelta * 15) + Math.max(0, forwardTensionDelta * 10);
                
                // Luminosity: Base function + impact of arriving + anticipation of leaving
                const lumOffset = (profile.tension * 8) + (backwardTensionDelta * 4) + (forwardTensionDelta * 2);

                el.style.setProperty('--dyn-hue', absoluteHue);
                el.style.setProperty('--dyn-sat', `${Math.min(100, satValue)}%`);
                el.style.setProperty('--dyn-lum-offset', `${lumOffset}%`);

                // --- Tension Graph Data ---
                const graphSegment = el.querySelector('.tension-graph-segment');
                if (graphSegment) {
                    // Normalize tension to a Y percentage (0% at top, 100% at bottom)
                    // Tension is -1.0 (rest) to 1.0 (high). We want high tension to be high on the graph (low Y value).
                    const yStart = (1 - (profile.tension + 1) / 2) * 100;
                    graphSegment.style.setProperty('--tension-y-start', `${yStart}%`);

                    // Calculate end point if there's a next chord
                    if (index < state.currentProgression.length - 1) {
                        const nextChord = state.temporarySwaps[index + 1] || state.currentProgression[index + 1];
                        const nextProfile = getHarmonicProfile(nextChord.symbol);
                        const yEnd = (1 - (nextProfile.tension + 1) / 2) * 100;
                        graphSegment.style.setProperty('--tension-y-end', `${yEnd}%`);
                    } else {
                        // For the last chord, make the connector a flat line to its own point
                        // This prevents a visual artifact on the last item before it's hidden by CSS.
                        graphSegment.style.setProperty('--tension-y-end', `${yStart}%`);
                    }
                }

                // Handle swap menu rendering
                if (activeMenuIndex === index) {
                    el.style.position = 'relative';
                    el.style.zIndex = '100'; // Elevate to render over chords on the next row

                    let swapMenu = el.querySelector('.swap-menu');
                    if (!swapMenu) {
                        swapMenu = document.createElement('div');
                        swapMenu.className = 'swap-menu';
                        
                        // --- Alternatives Section ---
                        const altsLabel = document.createElement('div');
                        altsLabel.className = 'swap-menu-label';
                        altsLabel.textContent = 'Swap Chord';
                        swapMenu.appendChild(altsLabel);
                        
                        const altsRow = document.createElement('div');
                        altsRow.className = 'swap-menu-row';

                        const alts = getAlternatives(displayChord.symbol);
                        if (isTemp) {
                            alts.unshift(chord.symbol); // Add original chord as first option
                        }
                        if (alts.length === 0) {
                            const noAlts = document.createElement('span');
                            noAlts.textContent = 'No close matches';
                            noAlts.style.opacity = '0.5';
                            noAlts.style.fontSize = '12px';
                            altsRow.appendChild(noAlts);
                        } else {
                            alts.forEach((alt, i) => {
                                const btn = document.createElement('button');
                                btn.className = 'chord-btn swap-menu-btn';
                                btn.textContent = alt;
                                btn.dataset.alt = alt; // Handled by Event Delegation
                                btn.dataset.altKey = chord.key; // Lock the alternative to the chord's original key!
                                if (isTemp && i === 0) {
                                    btn.classList.add('original-swap-option');
                                }
                                altsRow.appendChild(btn);
                            });
                        }
                        swapMenu.appendChild(altsRow);

                        // --- Modulate Section ---
                        const modLabel = document.createElement('div');
                        modLabel.className = 'swap-menu-label';
                        modLabel.textContent = 'Modulate Key';
                        swapMenu.appendChild(modLabel);

                        const modSelect = document.createElement('select');
                        modSelect.className = 'modulate-select';
                        
                        Object.entries(KEY_NAMES).forEach(([val, name]) => {
                            const opt = document.createElement('option');
                            opt.value = val;
                            opt.textContent = name;
                            if (parseInt(val, 10) === state.baseKey) {
                                opt.selected = true;
                            }
                            modSelect.appendChild(opt);
                        });

                        modSelect.addEventListener('change', (e) => {
                            const newKey = parseInt(e.target.value, 10);
                            state.baseKey = newKey;
                            document.getElementById('key-display').textContent = KEY_NAMES[newKey] || 'C Major';
                            document.getElementById('key-selector').value = newKey;
                            persistAppState();
                            renderProgression();
                        });

                        // --- Turnaround Section (Only on Last Chord in Context) ---
                        const firstChordIndex = state.isLooping ? state.loopStart : 0;
                        const lastChordIndex = state.isLooping ? Math.max(0, state.loopEnd - 1) : Math.max(0, state.currentProgression.length - 1);
                        
                        if (index === lastChordIndex && state.currentProgression.length > 0) {
                            const firstChord = state.temporarySwaps[firstChordIndex] || state.currentProgression[firstChordIndex];
                            if (firstChord) {
                                const turnLabel = document.createElement('div');
                                turnLabel.className = 'swap-menu-label';
                                turnLabel.textContent = `Turnaround to ${firstChord.symbol}`;
                                turnLabel.style.marginTop = '8px';
                                swapMenu.appendChild(turnLabel);

                                const turnRow = document.createElement('div');
                                turnRow.className = 'swap-menu-row';
                                
                                const turnarounds = getTurnaroundSuggestions(firstChord.symbol);
                                turnarounds.forEach(alt => {
                                    const btn = document.createElement('button');
                                    btn.className = 'chord-btn swap-menu-btn insert-turnaround-btn';
                                    btn.textContent = `+ ${alt}`;
                                    btn.dataset.symbol = alt;
                                    btn.dataset.key = firstChord.key;
                                    btn.dataset.insertAfter = index;
                                    turnRow.appendChild(btn);
                                });
                                swapMenu.appendChild(turnRow);
                            }
                        }

                        swapMenu.appendChild(modSelect);
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

            // --- Modulation Suggestions Logic ---
            const lastChord = state.currentProgression[state.currentProgression.length - 1];
            const modPanel = document.getElementById('modulation-panel');
            if (lastChord && lastChord.key !== state.baseKey) {
                modPanel.style.display = 'block';
                document.getElementById('mod-from-key').textContent = KEY_NAMES[lastChord.key];
                document.getElementById('mod-to-key').textContent = KEY_NAMES[state.baseKey];
                
                const btnContainer = document.getElementById('mod-buttons');
                btnContainer.innerHTML = '';
                
                const suggestions = getTransitionSuggestions(lastChord.key, state.baseKey);
                suggestions.forEach(sug => {
                    const btn = document.createElement('button');
                    btn.className = `chord-btn ${sug.type.includes('dominant') ? 'borrowed' : ''}`;
                    btn.textContent = sug.symbol;
                    btn.title = sug.description;
                    
                    // Add attributes for drag-and-drop support
                    btn.dataset.chord = sug.symbol;
                    btn.dataset.key = sug.key;
                    btn.draggable = true;
                    
                    // Allow audition on click, add on double-click
                    btn.addEventListener('click', () => auditionChord(sug.symbol, sug.key));
                    btn.addEventListener('dblclick', () => addChord(sug.symbol, sug.key));
                    
                    btnContainer.appendChild(btn);
                });
            } else {
                if (modPanel) modPanel.style.display = 'none';
            }

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

            // --- Post-render check for Tension Graph line wraps ---
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

            // Update Undo button disabled state
            const undoBtn = document.getElementById('btn-undo');
            if (undoBtn) undoBtn.disabled = state.history.length === 0;

            // Keep Rhythm Editor synced with active selection
            if (selectedChordIndex === null) {
                closeRhythmEditor();
            } else if (state.currentProgression[selectedChordIndex]) {
                openRhythmEditor(selectedChordIndex);
            } else {
                selectedChordIndex = null;
                closeRhythmEditor();
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

// --- Initialization Helpers ---
function _loadAndApplyInitialState() {
    const savedState = loadState();
    if (savedState) {
        if (savedState.baseKey !== undefined) state.baseKey = savedState.baseKey;
        if (savedState.currentProgression) {
            // Gracefully upgrade legacy string arrays to objects and attach default patterns
            state.currentProgression = savedState.currentProgression.map(item => {
                const chordObj = typeof item === 'string' ? { symbol: item, key: state.baseKey } : item;
                if (!chordObj.pattern) {
                    chordObj.pattern = initChordPattern();
                }
                return chordObj;
            });
        }
        if (savedState.bpm) state.bpm = savedState.bpm;
        // Handle transition from old schema names
        if (savedState.isLooping !== undefined || savedState.loop !== undefined) state.isLooping = savedState.isLooping ?? savedState.loop;
        if (savedState.useVoiceLeading !== undefined || savedState.voiceLeading !== undefined) state.useVoiceLeading = savedState.useVoiceLeading ?? savedState.voiceLeading;
        if (savedState.loopStart !== undefined) state.loopStart = savedState.loopStart;
        if (savedState.loopEnd !== undefined) state.loopEnd = savedState.loopEnd;
        if (savedState.temporarySwaps) state.temporarySwaps = savedState.temporarySwaps;
        if (savedState.theme !== undefined) state.theme = savedState.theme;
    }
    applyLoopBounds();
    
    // Sync UI to State
    document.getElementById('key-selector').value = state.baseKey;
    document.getElementById('key-display').textContent = KEY_NAMES[state.baseKey] || 'C Major';
    document.getElementById('bpm-slider').value = state.bpm;
    updateLoopButtonUI();
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
}

function _setupThemeToggle() {
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
    
    document.getElementById('btn-export-wav').addEventListener('click', (e) => {
        // Get active swaps applied for the exact audio the user hears
        const exportState = { ...state, currentProgression: getActiveProgression() };
        exportToWav(exportState, e.target);
    });

    document.getElementById('btn-ai-prompt').addEventListener('click', () => {
        const activeProgression = getActiveProgression();
        if (activeProgression.length === 0) {
            alert("Please build a progression first.");
            return;
        }
        const promptText = generateAIPrompt(activeProgression, state.bpm, KEY_NAMES[state.baseKey]);
        const modal = document.getElementById('ai-prompt-modal');
        const textArea = document.getElementById('ai-prompt-text');
        textArea.value = promptText;
        
        modal.style.display = 'flex';
        // Trigger reflow for transition
        modal.offsetHeight;
        modal.classList.add('visible');
    });

    document.getElementById('btn-close-prompt').addEventListener('click', () => {
        const modal = document.getElementById('ai-prompt-modal');
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 200);
    });

    document.getElementById('btn-copy-prompt').addEventListener('click', (e) => {
        const textArea = document.getElementById('ai-prompt-text');
        textArea.select();
        const copyBtn = e.target;
        const originalText = copyBtn.textContent;
        
        navigator.clipboard.writeText(textArea.value).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = originalText, 2000);
        }).catch(() => {
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = originalText, 2000);
        });
    });
    document.body.appendChild(themeToggleBtn);
}

function _setupKeySelector() {
    document.getElementById('key-selector').addEventListener('change', (e) => {
        const newKey = parseInt(e.target.value, 10);
        state.baseKey = newKey;
        document.getElementById('key-display').textContent = KEY_NAMES[newKey] || 'C Major';
        persistAppState();
        renderProgression();
    });
}

function _setupProgressionDisplayEvents(display) {
    document.addEventListener('click', (e) => {
        // Ignore clicks on elements that have been detached from the DOM during the event phase
        if (!document.body.contains(e.target)) return;

        const clickedItem = e.target.closest('.progression-item');
        const clickedEditor = e.target.closest('#rhythm-editor-panel');
        
        if (!clickedItem && !clickedEditor) {
            if (activeMenuIndex !== null || selectedChordIndex !== null) {
                activeMenuIndex = null;
                selectedChordIndex = null;
                renderProgression();
            }
        }
    });

    // Dismiss the swap menu when hovering or interacting with the rhythm editor without losing selection
    const rhythmPanel = document.getElementById('rhythm-editor-panel');
    if (rhythmPanel) {
        const dismissMenu = () => {
            if (activeMenuIndex !== null) {
                activeMenuIndex = null;
                const openMenu = document.querySelector('.swap-menu');
                if (openMenu) openMenu.remove();
            }
        };
        rhythmPanel.addEventListener('pointerenter', dismissMenu);
        rhythmPanel.addEventListener('pointerdown', dismissMenu);
    }

    // Handle long-press (mobile) or right-click (desktop) for deletion
    display.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.progression-item');
        if (item) {
            e.preventDefault(); // Prevent default browser context menu
            const index = parseInt(item.dataset.index, 10);
            if (confirm('Delete this chord?')) {
                removeChord(index);
            }
        }
    });

    display.addEventListener('click', (e) => {
        const item = e.target.closest('.progression-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.index, 10);
        const originalChord = state.currentProgression[index];
        
        if (e.target.classList.contains('remove-btn')) {
            removeChord(index);
            return;
        }

        // Handle Turnaround Insert BEFORE regular swap menu buttons to avoid conflict
        if (e.target.classList.contains('insert-turnaround-btn')) {
            saveHistoryState();
            const symbol = e.target.dataset.symbol;
            const key = parseInt(e.target.dataset.key, 10);
            const insertIndex = parseInt(e.target.dataset.insertAfter, 10) + 1;
            
            state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex);
            state.currentProgression.splice(insertIndex, 0, { symbol, key, pattern: initChordPattern() });
            
            // Expand loop to seamlessly include the new turnaround chord
            if (insertIndex <= state.loopEnd) {
                state.loopEnd++;
            }
            
            activeMenuIndex = null;
            selectedChordIndex = insertIndex; // Select the new turnaround chord
            auditionChord(symbol, key);
            applyLoopBounds();
            persistAppState();
            renderProgression();
            return;
        }

        if (e.target.classList.contains('swap-menu-btn')) {
            saveHistoryState();
            const selectedAltSymbol = e.target.dataset.alt;

            // If the selected alternative is the original chord, revert the swap.
            if (selectedAltSymbol === originalChord.symbol) {
                delete state.temporarySwaps[index];
            } else {
                // Otherwise, set the new temporary swap.
                state.temporarySwaps[index] = { symbol: selectedAltSymbol, key: parseInt(e.target.dataset.altKey, 10) };
            }
            activeMenuIndex = null;
            // selectedChordIndex remains the same, editor will auto-update
            const chordToAudition = state.temporarySwaps[index] || originalChord;
            if (!isPlaying || item.classList.contains('playing')) {
                auditionChord(chordToAudition.symbol, chordToAudition.key);
            }
            persistAppState();
            renderProgression();
            return;
        }
            
            if (e.target.closest('.swap-menu')) {
                return; // Prevent closing the menu when interacting with internal elements like the select dropdown
            }

        // Clicked the chord badge itself
        const displayChord = state.temporarySwaps[index] || originalChord;
        if (!isPlaying) {
            auditionChord(displayChord.symbol, displayChord.key);
        }

        // Toggle Context Menu
        if (activeMenuIndex === index) {
            activeMenuIndex = null;
            selectedChordIndex = null;
        } else {
            activeMenuIndex = index;
            selectedChordIndex = index;
        }
        renderProgression();
    });
}

function _setupChordButtons() {
    const chordBtns = document.querySelectorAll('.chord-btn');
    chordBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            auditionChord(btn.dataset.chord, state.baseKey);
        });
        btn.addEventListener('dblclick', () => {
            addChord(btn.dataset.chord);
        });
    });
}

function _setupControlButtons() {
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

    document.getElementById('btn-undo').addEventListener('click', undo);
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
}

function _setupDragAndDrop(display) {
    initDragAndDrop({
        display,
        sourceButtons: document.querySelectorAll('.chord-btn'),
        onReorder: (oldIndex, newIndex, newLoopStart, newLoopEnd) => {
            if (oldIndex === null || newIndex === null) {
                renderProgression(); 
                return;
            }
            
            if (oldIndex !== newIndex) {
                saveHistoryState();
                state.temporarySwaps = calculateSwapsOnReorder(state.temporarySwaps, state.currentProgression.length, oldIndex, newIndex);
                activeMenuIndex = null;
                selectedChordIndex = null;
                const itemToMove = state.currentProgression.splice(oldIndex, 1)[0];
                state.currentProgression.splice(newIndex, 0, itemToMove);
            } 
            
            if (newLoopStart !== null && newLoopEnd !== null) {
                if (state.loopStart !== newLoopStart || state.loopEnd !== newLoopEnd) saveHistoryState();
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            }
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        },
        onAddFromSource: (sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd) => {
            saveHistoryState();
            if (insertIndex === null) insertIndex = state.currentProgression.length;
            
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex);
            activeMenuIndex = null;
            selectedChordIndex = insertIndex;
            state.currentProgression.splice(insertIndex, 0, { symbol: sourceChord, key: sourceKey, pattern: initChordPattern() });
            
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
        onBracketDrop: (bracketId, insertIndex, newLoopStart, newLoopEnd) => {
            saveHistoryState();
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
        onDragCancel: () => renderProgression(),
        getProgressionItemText: (index) => state.currentProgression[index].symbol,
        getBaseKey: () => state.baseKey
    });
}

// --- Main Entry Point ---
function initApp() {
    const display = document.getElementById('progression-display');
    _loadAndApplyInitialState();
    _setupThemeToggle();
    initRhythmEditor({ 
        state, 
        saveHistoryState, 
        persistAppState, 
        renderProgression,
        onClose: () => {
            activeMenuIndex = null;
            selectedChordIndex = null;
            renderProgression(); // Refreshes UI and triggers closeRhythmEditor safely
        }
    });
    _setupKeySelector();
    _setupControlButtons();
    _setupChordButtons();
    _setupProgressionDisplayEvents(display);
    _setupDragAndDrop(display);
    renderProgression();
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}