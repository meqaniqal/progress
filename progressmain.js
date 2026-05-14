import { CONFIG } from './config.js';
import { getChordNotes, getPlayableNotes } from './theory.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, setTrackVolume, decodeCustomDrumSample, loadPersistedDrumSamples, clearCustomDrumSamples } from './synth.js';
import { auditionChord, playProgression, stopAllAudio } from './sequencer.js';
import { initDragAndDrop } from './dragdrop.js';
import { exportToMidi } from './midi.js';
import { calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder } from './stateUtils.js';
import { initPatternSet } from './patternUtils.js';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor, highlightDrumHit } from './rhythmEditor.js';
import { KEY_NAMES, highlightChordInUI, updateKeyAndModeDisplay, renderProgression as renderProgressionUI } from './ui.js';
import { state, getActiveProgression, applyLoopBounds, saveHistoryState, undoState, persistAppState, loadAndApplyInitialState, resetSession, updateEditorState, updatePattern, pushPatternToGlobal, resetPatternToGlobal } from './store.js';
import { initExportUI } from './exportController.js';
import { initModals } from './modalController.js';
import { initTransport, resetTransport, isPlaybackActive } from './transportController.js';
import { initSongController, updateSongUI, exitSongMode } from './songController.js';

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
            resetTransport();
            state.currentProgression = [];
            applyLoopBounds();
            persistAppState();
            renderProgression();
        }

        const uiCallbacks = {
            onAuditionChord: (symbol, key) => {
                if (!isPlaybackActive()) auditionChord(symbol, key);
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
                if (!isPlaybackActive()) {
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
            onSetGlobalVoicing: (type) => {
                saveHistoryState();
                state.globalVoicing = type;
                persistAppState();
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
            updateSongUI();
            
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
    
    // Ensure bassHarmonic volume state exists (default 0.0 for silent)
    if (state.volumes.bassHarmonic === undefined) {
        state.volumes.bassHarmonic = 0.0;
    }
    if (state.volumes.master === undefined) {
        state.volumes.master = 1.0;
    }
    
    ['master', 'chords', 'bass', 'bassHarmonic', 'drums'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.value = state.volumes[track];
            setTrackVolume(track, state.volumes[track]);
        }
    });
    
    ['chords', 'bass'].forEach(track => {
        const el = document.getElementById(`inst-${track}`);
        if (el) el.value = state.instruments[track] || 'sawtooth';
    });
    
    const instDrums = document.getElementById('inst-drums');
    const customDrumsPanel = document.getElementById('custom-drums-panel');
    if (instDrums) {
        instDrums.value = state.instruments.drums || 'synth';
        if (customDrumsPanel) customDrumsPanel.style.display = instDrums.value === 'custom' ? 'block' : 'none';
    }
    
    const multipassInput = document.getElementById('multipass-input');
    if (multipassInput) multipassInput.value = state.exportPasses || 1;
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
    
    const expDrawInput = document.getElementById('experimental-draw-mode');
    if (expDrawInput) expDrawInput.checked = state.enableExperimentalDrawMode;
}

function _setupTopBarEvents() {
    document.documentElement.setAttribute('data-theme', state.theme);
    
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        themeSelector.value = state.theme;
        themeSelector.addEventListener('change', (e) => {
            state.theme = e.target.value;
            document.documentElement.setAttribute('data-theme', state.theme);
            persistAppState();
        });
    }
    

    initModals({
        onResetPlayback: resetTransport,
        onRenderProgression: renderProgression
    });

    initExportUI();
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
        exitSongMode(); // Auto-fold the song tray if user clicks down to edit chords locally
        
        const item = e.target.closest('.progression-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.index, 10);
        const originalChord = state.currentProgression[index];
        
        if (e.target.classList.contains('remove-btn')) {
            removeChord(index);
            return;
        }

        // Clicked the chord badge itself
        const displayChord = getActiveProgression()[index];
        if (!isPlaybackActive()) {
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
        btn.draggable = true;
        btn.addEventListener('click', () => {
            auditionChord(btn.dataset.chord, state.baseKey);
        });
        btn.addEventListener('dblclick', () => {
            addChord(btn.dataset.chord);
        });
    });
}

function _setupControlButtons() {
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
    
    ['master', 'chords', 'bass', 'bassHarmonic', 'drums'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state.volumes[track] = val;
                try { setTrackVolume(track, val); } catch (err) {}
                persistAppState();
            });
        }
    });
    
    ['chords', 'bass'].forEach(track => {
        const el = document.getElementById(`inst-${track}`);
        if (el) {
            el.addEventListener('change', (e) => {
                state.instruments[track] = e.target.value;
                persistAppState();
            });
        }
    });
    
    const instDrums = document.getElementById('inst-drums');
    const customDrumsPanel = document.getElementById('custom-drums-panel');
    if (instDrums) {
        instDrums.addEventListener('change', (e) => {
            state.instruments.drums = e.target.value;
            if (customDrumsPanel) customDrumsPanel.style.display = e.target.value === 'custom' ? 'block' : 'none';
            persistAppState();
        });
    }

    ['kick', 'snare', 'chh', 'ohh'].forEach(type => {
        const fileInput = document.getElementById(`upload-${type}`);
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const arrayBuffer = ev.target.result;
                    await decodeCustomDrumSample(type, arrayBuffer);
                };
                reader.readAsArrayBuffer(file);
            });
        }
    });
    
    const btnClearDrums = document.getElementById('btn-clear-custom-drums');
    if (btnClearDrums) {
        btnClearDrums.addEventListener('click', async () => {
            await clearCustomDrumSamples();
            ['kick', 'snare', 'chh', 'ohh'].forEach(type => {
                const fileInput = document.getElementById(`upload-${type}`);
                if (fileInput) fileInput.value = ''; // Reset the file inputs in the UI
            });
            if (instDrums) {
                instDrums.value = 'synth';
                instDrums.dispatchEvent(new Event('change')); // Trigger state update and hide panel
            }
        });
    }

    document.getElementById('voice-leading').addEventListener('change', (e) => {
        state.useVoiceLeading = e.target.checked;
        persistAppState();
    });
    
    const expDrawInput = document.getElementById('experimental-draw-mode');
    if (expDrawInput) {
        expDrawInput.addEventListener('change', (e) => {
            state.enableExperimentalDrawMode = e.target.checked;
            persistAppState();
            renderProgression(); // Sync UI immediately
        });
    }

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
        itemClass: 'progression-item',
        placeholderClass: 'progression-placeholder',
        sourceClass: 'chord-btn',
        sourceDataAttribute: 'chord',
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
        getItemText: (index) => state.currentProgression[index].symbol,
        getBaseKey: () => state.baseKey
    });
}

function _setupSmartDragCollapse() {
    document.addEventListener('dragstart', (e) => {
        const btn = e.target.closest('.chord-btn');
        if (btn) {
            const palette = btn.closest('.chord-palette');
            if (palette) {
                document.body.classList.add('is-dragging-palette');
                palette.classList.add('active-palette');
            }
        }
    }, { passive: true });

    document.addEventListener('dragend', () => {
        document.body.classList.remove('is-dragging-palette');
        document.querySelectorAll('.chord-palette').forEach(p => p.classList.remove('active-palette'));
    });
}

function _setupGlobalDoubleTap() {
    let lastTapTime = 0;
    
    document.addEventListener('pointerdown', (e) => {
        // Ignore taps on all interactive elements, timelines, panels, and controls
        const ignoredSelectors = 'button, input, select, textarea, .progression-item, .chord-btn, .rhythm-instance, .drum-hit, .bracket-element, .controls, .pattern-tab, .swap-menu, .rhythm-timeline-container, .modal-content, .drum-row-label';
        if (e.target.closest(ignoredSelectors)) {
            lastTapTime = 0;
            return;
        }
        
        const now = Date.now();
        if (now - lastTapTime < CONFIG.DOUBLE_TAP_DELAY_MS) {
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
    _setupTopBarEvents();
    initRhythmEditor({ 
        state, 
        saveHistoryState, 
        persistAppState, 
        renderProgression,
        updateEditorState,
        updatePattern,
        pushPatternToGlobal,
        resetPatternToGlobal
    });
    _setupKeyAndModeSelectors();
    initSongController({ onRenderProgression: renderProgression });
    _setupControlButtons();
    _setupChordButtons();
    initTransport();
    _setupProgressionDisplayEvents(display);
    _setupDragAndDrop(display);
    _setupSmartDragCollapse();
    _setupGlobalDoubleTap();
    renderProgression();
    loadPersistedDrumSamples(); // Fetch user's custom drum kit from IndexedDB

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