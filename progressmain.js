import { generateAIPrompt } from './promptGenerator.js';
import { CONFIG } from './config.js';
import { getChordNotes, getPlayableNotes } from './theory.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, setTrackVolume } from './synth.js';
import { auditionChord, playProgression, stopAllAudio } from './sequencer.js';
import { initDragAndDrop } from './dragdrop.js';
import { exportToMidi } from './midi.js';
import { exportToWav } from './wavExport.js';
import { calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder } from './stateUtils.js';
import { initPatternSet } from './patternUtils.js';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor, highlightDrumHit } from './rhythmEditor.js';
import { KEY_NAMES, highlightChordInUI, updateKeyAndModeDisplay, renderProgression as renderProgressionUI } from './ui.js';
import { state, getActiveProgression, applyLoopBounds, saveHistoryState, undoState, persistAppState, loadAndApplyInitialState } from './store.js';

        let isPlaying = false;
        let currentPlaybackStopFunction = null; // Stores the stop function returned by audio.playProgression

        function undo() {
            if (undoState()) {
                renderProgression();
            }
        }

        function addChord(numeral, targetKey = state.baseKey) {
            saveHistoryState();
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.push({ symbol: numeral, key: targetKey, ...initPatternSet(), duration: 2 });
            
            if (isAtEnd) state.loopEnd = state.currentProgression.length;
            
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        function removeChord(index) {
            saveHistoryState();
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.temporarySwaps = calculateSwapsOnRemove(state.temporarySwaps, index);
            
            if (state.selectedChordIndex > index) {
                state.selectedChordIndex--;
            }
            
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
            state.selectedChordIndex = null;
            if (currentPlaybackStopFunction) currentPlaybackStopFunction(); // Stop current playback
            isPlaying = false;
            if (document.getElementById('btn-play-toggle')) document.getElementById('btn-play-toggle').textContent = '▶';
            state.currentProgression = [];
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        const uiCallbacks = {
            onAuditionChord: (symbol, key) => {
                if (!isPlaying) auditionChord(symbol, key);
            },
            onAddChord: (symbol, key) => addChord(symbol, key),
            onRemoveChord: (index) => removeChord(index),
            onSwapChord: (index, altSymbol, originalChord) => {
                saveHistoryState();
                if (altSymbol === originalChord.symbol) {
                    delete state.temporarySwaps[index];
                } else {
                    // Create a swap object that only contains the changed property.
                    // getActiveProgression will merge it with the original.
                    state.temporarySwaps[index] = { symbol: altSymbol };
                }
                persistAppState(); // Persist before getting active progression for audition
                
                const chordToAudition = getActiveProgression()[index];
                if (!isPlaying) {
                    let notesToPlay = null;
                    if (state.useVoiceLeading) {
                        notesToPlay = getPlayableNotes(getActiveProgression(), state)[index];
                    }
                    auditionChord(chordToAudition.symbol, chordToAudition.key, notesToPlay);
                }
                
                renderProgression();
            },
            onStepInversion: (index, direction) => {
                saveHistoryState();
                const chordToModify = getActiveProgression()[index];
                const currentOffset = chordToModify.inversionOffset ?? 0;
                const newOffset = currentOffset + direction;

                if (state.temporarySwaps[index]) {
                    state.temporarySwaps[index] = { ...state.temporarySwaps[index], inversionOffset: newOffset };
                } else {
                    state.currentProgression[index].inversionOffset = newOffset;
                }
                persistAppState();
                const newlyActiveProg = getActiveProgression();
                const notesToPlay = getPlayableNotes(newlyActiveProg, state)[index];
                auditionChord(newlyActiveProg[index].symbol, newlyActiveProg[index].key, notesToPlay);
                renderProgression();
            },
            onChangeVoicing: (index, voicingObj) => {
                saveHistoryState();
                state.currentProgression[index].voicing = voicingObj;
                if (state.temporarySwaps[index]) state.temporarySwaps[index] = { ...state.temporarySwaps[index], voicing: voicingObj };
                persistAppState();
                renderProgression();
            },
            onChangeVoicingType: (index, type) => {
                saveHistoryState();
                state.currentProgression[index].voicingType = type;
                if (state.temporarySwaps[index]) state.temporarySwaps[index].voicingType = type;
                persistAppState();

                const newlyActiveProg = getActiveProgression();
                const notesToPlay = getPlayableNotes(newlyActiveProg, state)[index];
                auditionChord(newlyActiveProg[index].symbol, newlyActiveProg[index].key, notesToPlay);
                renderProgression();
            },
            onChangeChordKey: (index, newKey) => {
                saveHistoryState();
                state.currentProgression[index].key = newKey;
                if (state.temporarySwaps[index]) {
                    state.temporarySwaps[index].key = newKey;
                }
                persistAppState();
                renderProgression();
            },
            onTransposeChord: (index) => {
                saveHistoryState();
                state.currentProgression[index].key = state.baseKey;
                if (state.temporarySwaps[index]) state.temporarySwaps[index].key = state.baseKey;
                persistAppState();
                renderProgression();
            },
            onChangeDuration: (index, dur) => {
                saveHistoryState();
                state.currentProgression[index].duration = dur;
                if (state.temporarySwaps[index]) state.temporarySwaps[index].duration = dur;
                persistAppState();
                renderProgression();
            },
            onAddTurnaround: (index, altSymbol, key) => {
                saveHistoryState();
                const insertIndex = index + 1;
                state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex);
                state.currentProgression.splice(insertIndex, 0, { symbol: altSymbol, key: key, ...initPatternSet(), duration: 2 });
                if (insertIndex <= state.loopEnd) state.loopEnd++;
                state.selectedChordIndex = insertIndex;
                auditionChord(altSymbol, key);
                applyLoopBounds();
                persistAppState();
                renderProgression();
            }
        };

        function renderProgression() {
            // Enforce invariant: Always have a chord selected if the array is not empty
            if (state.currentProgression.length === 0) {
                state.selectedChordIndex = null;
            } else {
                if (state.selectedChordIndex === null) state.selectedChordIndex = 0;
                else if (state.selectedChordIndex >= state.currentProgression.length) state.selectedChordIndex = state.currentProgression.length - 1;
            }

            renderProgressionUI(state, state.selectedChordIndex, uiCallbacks);
            
            // Keep Rhythm Editor synced with active selection
            if (state.selectedChordIndex === null) {
                closeRhythmEditor();
            } else if (state.currentProgression[state.selectedChordIndex]) {
                openRhythmEditor(state.selectedChordIndex);
            } else {
                state.selectedChordIndex = null;
                closeRhythmEditor();
                renderProgressionUI(state, state.selectedChordIndex, uiCallbacks);
            }
        }

// --- Initialization Helpers ---
function _loadAndApplyInitialState() {
    loadAndApplyInitialState();
    
    // Sync UI to State
    document.getElementById('key-selector').value = state.baseKey;
    updateKeyAndModeDisplay(state);
    document.getElementById('bpm-slider').value = state.bpm;
    
    const globalVoicingEl = document.getElementById('global-voicing');
    if (globalVoicingEl) {
        globalVoicingEl.value = state.globalVoicing;
        globalVoicingEl.addEventListener('change', (e) => { state.globalVoicing = e.target.value; persistAppState(); renderProgression(); });
    }
    
    ['chords', 'bass', 'drums'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.value = state.volumes[track];
            setTrackVolume(track, state.volumes[track]);
        }
    });
    
    const multipassInput = document.getElementById('multipass-input');
    if (multipassInput) multipassInput.value = state.exportPasses || 1;
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
        const promptText = generateAIPrompt(activeProgression, state.bpm, KEY_NAMES[state.baseKey], state.mode);
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

function _setupKeyAndModeSelectors() {
    document.getElementById('key-selector').addEventListener('change', (e) => {
        const newKey = parseInt(e.target.value, 10);
        state.baseKey = newKey;
        updateKeyAndModeDisplay(state);
        persistAppState();
        renderProgression();
    });

    const modeSelector = document.getElementById('mode-selector');
    if (modeSelector) {
        modeSelector.addEventListener('change', (e) => {
            state.mode = e.target.value;
            updateKeyAndModeDisplay(state);
            persistAppState();
            // Intentionally NOT modifying state.currentProgression 
            // so existing tray chords remain untouched.
            renderProgression(); 
        });
    }
}

function _setupProgressionDisplayEvents(display) {
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

        // Clicked the chord badge itself
        const displayChord = state.temporarySwaps[index] || originalChord;
        if (!isPlaying) {
            let notesToPlay = null;
            if (state.useVoiceLeading) {
                notesToPlay = getPlayableNotes(getActiveProgression(), state)[index];
            }
            auditionChord(displayChord.symbol, displayChord.key, notesToPlay);
        }

        // Always select the clicked chord (no toggling off)
        state.selectedChordIndex = index;
        persistAppState();
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
                },
                highlightDrumHit
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
    
    ['chords', 'bass', 'drums'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state.volumes[track] = val;
                setTrackVolume(track, val);
                persistAppState();
            });
        }
    });

    document.getElementById('voice-leading').addEventListener('change', (e) => {
        state.useVoiceLeading = e.target.checked;
        persistAppState();
    });

    const multipassInput = document.getElementById('multipass-input');
    if (multipassInput) {
        multipassInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                state.exportPasses = Math.max(1, Math.min(32, val));
                persistAppState();
            }
        });
    }
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
                
                if (state.selectedChordIndex === oldIndex) {
                    state.selectedChordIndex = newIndex;
                } else if (state.selectedChordIndex > oldIndex && state.selectedChordIndex <= newIndex) {
                    state.selectedChordIndex--;
                } else if (state.selectedChordIndex < oldIndex && state.selectedChordIndex >= newIndex) {
                    state.selectedChordIndex++;
                }
                
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
            state.selectedChordIndex = insertIndex;
            state.currentProgression.splice(insertIndex, 0, { symbol: sourceChord, key: sourceKey, ...initPatternSet(), duration: 2 });
            
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

function _setupFoldawayPanels() {
    document.querySelectorAll('.foldaway-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Prevent toggling if clicking the close button inside the header
            if (e.target.closest('.remove-btn')) return;
            
            const panel = header.closest('.foldaway-panel');
            panel.classList.toggle('collapsed');
        });
    });
}

function _setupGlobalDoubleTap() {
    let lastTapTime = 0;
    
    document.addEventListener('pointerdown', (e) => {
        // Ignore taps on all interactive elements, timelines, panels, and controls
        const ignoredSelectors = 'button, input, select, textarea, .progression-item, .chord-btn, .rhythm-instance, .drum-hit, .bracket-element, .controls, .foldaway-header, .pattern-tab, .swap-menu, .rhythm-timeline-container, .modal-content, .drum-row-label';
        if (e.target.closest(ignoredSelectors)) {
            lastTapTime = 0;
            return;
        }
        
        const now = Date.now();
        if (now - lastTapTime < 300) {
            e.preventDefault(); // Attempt to prevent double-tap zoom on mobile
            const playToggleBtn = document.getElementById('btn-play-toggle');
            if (playToggleBtn) playToggleBtn.click();
            lastTapTime = 0;
        } else {
            lastTapTime = now;
        }
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
        renderProgression
    });
    _setupKeyAndModeSelectors();
    _setupControlButtons();
    _setupChordButtons();
    _setupProgressionDisplayEvents(display);
    _setupDragAndDrop(display);
    _setupFoldawayPanels();
    _setupGlobalDoubleTap();
    renderProgression();

    // Reveal the UI smoothly now that everything is styled and loaded
    document.documentElement.classList.add('loaded');
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}