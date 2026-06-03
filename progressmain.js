import { CONFIG } from './config.js';
import { getChordNotes, getPlayableNotes, getPitchEditorTuning, snapToGrid } from './theory.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, loadPersistedDrumSamples } from './synth.js';
import { auditionChord, playProgression, stopAllAudio } from './sequencer.js';
import { initDragAndDrop } from './dragdrop.js';
import { exportToMidi } from './midi.js';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor, highlightDrumHit } from './rhythmEditor.js';
import { KEY_NAMES, highlightChordInUI, updateKeyAndModeDisplay, renderProgression as renderProgressionUI } from './ui.js';
import { state, getActiveProgression, saveHistoryState, undoState, persistAppState, loadAndApplyInitialState, updateEditorState, updatePattern, pushPatternToGlobal, resetPatternToGlobal, addChord, removeChord, clearProgression, swapChord, stepInversion, changeVoicing, changeVoicingType, setGlobalVoicing, changeChordKey, transposeChord, changeDuration, addTurnaround, reorderProgression, addChordFromSource, setProgressionBrackets, setGlobalMode, setGlobalKeyAndMode, insertLoopedSequence } from './store.js';
import { getExportState } from './exportStateBuilder.js';
import { initExportUI } from './exportController.js';
import { initModals } from './modalController.js';
import { initTransport, resetTransport, isPlaybackActive, restartTransport } from './transportController.js';
import { initSongController, updateSongUI, exitSongMode, isSongTrayOpen } from './songController.js';
import { initSettingsUI, syncSettingsUI, updateCustomDrumsUI } from './settingsController.js';

        function getAuditionNotes(progression, index, appState) {
            let notesToPlay = getPlayableNotes(progression, appState)[index];
            if (!notesToPlay) return null;
            
            const chord = progression[index];
            let pattern = chord.chordPattern;
            if (pattern && !pattern.isLocalOverride && appState.globalPatterns && appState.globalPatterns.chordPattern) {
                pattern = appState.globalPatterns.chordPattern;
            }
            
            if (pattern && pattern.instances && pattern.instances.length > 0) {
                const instances = [...pattern.instances].sort((a, b) => a.startTime - b.startTime);
                const firstInstance = instances[0];
                if (firstInstance && firstInstance.pitchOffsets) {
                    const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || appState.divisions || 12);
                    notesToPlay = notesToPlay.map((n, i) => n + snapToGrid(60 + (firstInstance.pitchOffsets[i] || 0), editorTuning) - 60);
                }
            }
            return notesToPlay;
        }

        function undo() {
            if (undoState()) {
                renderProgression();
            }
        }

        const uiCallbacks = {
            onAuditionChord: (symbol, key) => {
                if (!isPlaybackActive()) auditionChord(symbol, key);
            },
            onAddChord: (symbol, key) => {
                addChord(symbol, key);
                renderProgression();
            },
            onRemoveChord: (index) => {
                removeChord(index);
                renderProgression();
            },
            onSwapChord: (index, altSymbol, originalChord) => {
                swapChord(index, altSymbol, originalChord.symbol);
                
                const chordToAudition = getActiveProgression()[index];
                if (!isPlaybackActive()) {
                    const notesToPlay = getAuditionNotes(getActiveProgression(), index, state);
                    auditionChord(chordToAudition.symbol, chordToAudition.key, notesToPlay, chordToAudition.divisions);
                }
                
                renderProgression();
            },
            onStepInversion: (index, direction) => {
                stepInversion(index, direction);
                const newlyActiveProg = getActiveProgression();
                const notesToPlay = getAuditionNotes(newlyActiveProg, index, state);
                auditionChord(newlyActiveProg[index].symbol, newlyActiveProg[index].key, notesToPlay, newlyActiveProg[index].divisions);
                renderProgression();
            },
            onChangeVoicing: (index, voicingObj) => {
                changeVoicing(index, voicingObj);
                renderProgression();
            },
            onChangeVoicingType: (index, type) => {
                changeVoicingType(index, type);
                const newlyActiveProg = getActiveProgression();
                const notesToPlay = getAuditionNotes(newlyActiveProg, index, state);
                auditionChord(newlyActiveProg[index].symbol, newlyActiveProg[index].key, notesToPlay, newlyActiveProg[index].divisions);
                renderProgression();
            },
            onSetGlobalVoicing: (type) => {
                setGlobalVoicing(type);
                renderProgression();
            },
            onChangeChordKey: (index, newKey) => {
                changeChordKey(index, newKey);
                renderProgression();
            },
            onTransposeChord: (index) => {
                transposeChord(index);
                renderProgression();
            },
            onChangeDuration: (index, dur) => {
                changeDuration(index, dur);
                renderProgression();
            },
            onAddTurnaround: (index, altSymbol, key) => {
                addTurnaround(index, altSymbol, key);
                auditionChord(altSymbol, key);
                renderProgression();
            },
            onSetGlobalMode: (mode) => {
                setGlobalMode(mode);
                updateKeyAndModeDisplay(state);
                renderProgression();
            },
            onSetGlobalKeyAndMode: (key, mode) => {
                setGlobalKeyAndMode(key, mode);
                updateKeyAndModeDisplay(state);
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
export function syncUIToState(explicitState = null) {
    if (explicitState) {
        loadAndApplyInitialState(explicitState);
    } else {
        loadAndApplyInitialState();
    }
    
    document.body.classList.toggle('show-helpers', state.showManualOnStartup);

    // Sync UI to State
    document.getElementById('key-selector').value = state.baseKey;
    updateKeyAndModeDisplay(state);

    syncSettingsUI();

    document.body.classList.toggle('beginner-mode', !state.isAdvancedMode);
    const btnModeToggle = document.getElementById('btn-mode-toggle');
    if (btnModeToggle) {
        btnModeToggle.textContent = state.isAdvancedMode ? '🎓 Advanced' : '🌱 Beginner';
    }
}

function _setupTopBarEvents() {
    document.documentElement.setAttribute('data-theme', state.theme);
    
    initSettingsUI({ onRenderProgression: renderProgression });
    

    initModals({
        onResetPlayback: resetTransport,
        onRenderProgression: renderProgression
    });

    initExportUI();
}

function _setupKeyAndModeSelectors() {
    const keySelector = document.getElementById('key-selector');
    
    const updateGlobalKey = (delta) => {
        let currentVal = parseInt(keySelector.value, 10);
        let newVal = currentVal + delta;
        // Wrap around the 12 available keys (60 = C, 71 = B)
        if (newVal < 60) newVal = 71; 
        if (newVal > 71) newVal = 60; 
        
        state.baseKey = newVal;
        keySelector.value = newVal;
        updateKeyAndModeDisplay(state);
        persistAppState();
        renderProgression();
    };

    document.getElementById('btn-global-key-down')?.addEventListener('click', () => updateGlobalKey(-1));
    document.getElementById('btn-global-key-up')?.addEventListener('click', () => updateGlobalKey(1));

    keySelector.addEventListener('change', (e) => {
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

    const emotionSelector = document.getElementById('emotion-selector');
    if (emotionSelector) {
        emotionSelector.addEventListener('change', (e) => {
            state.activeEmotion = e.target.value;
            if (state.editorState) {
                state.editorState.emotionPage = 0;
            }
            updateKeyAndModeDisplay(state);
            persistAppState();
            renderProgression();
        });
    }

    const btnPrev = document.getElementById('btn-emotion-prev');
    const btnNext = document.getElementById('btn-emotion-next');
    if (btnPrev && btnNext) {
        btnPrev.addEventListener('click', () => {
            if (state.editorState && state.editorState.emotionPage > 0) {
                state.editorState.emotionPage--;
                updateKeyAndModeDisplay(state);
            }
        });
        btnNext.addEventListener('click', () => {
            if (state.editorState) {
                state.editorState.emotionPage = (state.editorState.emotionPage || 0) + 1;
                updateKeyAndModeDisplay(state);
            }
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
                renderProgression();
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
            renderProgression();
            return;
        }

        // Clicked the chord badge itself
        const displayChord = getActiveProgression()[index];
        if (!isPlaybackActive()) {
            const notesToPlay = getAuditionNotes(getActiveProgression(), index, state);
            auditionChord(displayChord.symbol, displayChord.key, notesToPlay, displayChord.divisions);
        }

        // Always select the clicked chord (no toggling off)
        state.selectedChordIndex = index;
        if (state.editorState) {
            state.editorState.swapPage = 0;
            state.editorState.emotionPage = 0;
        }
        persistAppState();
        renderProgression();
    });
}

function _setupChordButtons() {
    let lastTapTime = 0;
    let lastTapId = null;

    // Ensure statically defined palette buttons have draggable set
    document.querySelectorAll('.chord-btn[data-chord]').forEach(btn => {
        btn.draggable = true;
    });

    // Universal Double-Tap (Pointerdown) for all chord buttons (Palette & Modulation)
    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('.chord-btn');
        if (btn && btn.hasAttribute('data-chord') && !btn.closest('.swap-menu')) {
            const now = Date.now();
            if (now - lastTapTime < CONFIG.DOUBLE_TAP_DELAY_MS && lastTapId === btn.dataset.chord) {
                e.preventDefault();
                if (btn.dataset.chord === 'LOOP_BLOCK') {
                    insertLoopedSequence(null, null, null);
                } else {
                    const targetKey = btn.hasAttribute('data-key') ? parseInt(btn.dataset.key, 10) : state.baseKey;
                    addChord(btn.dataset.chord, targetKey);
                }
                renderProgression();
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                lastTapId = btn.dataset.chord;
            }
        }
    });

    // Universal Click (Audition)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.chord-btn');
        if (btn && btn.hasAttribute('data-chord') && !btn.closest('.swap-menu')) {
            const targetKey = btn.hasAttribute('data-key') ? parseInt(btn.dataset.key, 10) : state.baseKey;
            if (!isPlaybackActive()) auditionChord(btn.dataset.chord, targetKey);
        }
    });
}

function _setupControlButtons() {
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (state.currentProgression.length === 0) return;
        resetTransport();
        clearProgression();
        renderProgression();
    });
    
    const btnExport = document.getElementById('btn-export');
    btnExport.addEventListener('click', () => {
        if (btnExport.disabled) return;
        btnExport.disabled = true;
        setTimeout(() => btnExport.disabled = false, 1000);
        
        const exportState = getExportState(isSongTrayOpen);
        
        const totalBeats = exportState.currentProgression.slice(exportState.loopStart, exportState.loopEnd).reduce((sum, chord) => sum + (Number(chord.duration) || 4), 0);
        const loopDurationMin = (totalBeats / exportState.bpm);
        const totalExportMin = loopDurationMin * exportState.exportPasses;
        
        if (totalExportMin > CONFIG.EXPORT_MINUTE_LIMIT) {
            const recommendedPasses = Math.max(1, Math.floor(CONFIG.EXPORT_MINUTE_LIMIT / loopDurationMin));
            const confirmMsg = `This export will generate ${totalExportMin.toFixed(1)} minutes of audio/MIDI.\n\nTo prevent massive file sizes and long rendering times, we recommend capping this to ${recommendedPasses} pass(es) (${(loopDurationMin * recommendedPasses).toFixed(1)} mins).\n\nClick OK to proceed with ${recommendedPasses} pass(es), or Cancel to abort.`;
            if (confirm(confirmMsg)) {
                exportState.exportPasses = recommendedPasses;
                exportToMidi(exportState);
            }
        } else {
            exportToMidi(exportState);
        }
    });

    const btnLoopInfo = document.getElementById('btn-loop-info');
    if (btnLoopInfo) {
        btnLoopInfo.addEventListener('click', (e) => {
            e.preventDefault();
            alert("Loop Block:\n\nDrag this button into your progression tray or double-tap it to instantly insert a copy of all the chords currently within your [ loop brackets ].");
        });
    }

    const btnMidiExportInfo = document.getElementById('btn-midi-export-info');
    if (btnMidiExportInfo) {
        btnMidiExportInfo.addEventListener('click', (e) => {
            e.preventDefault();
            alert("Midi Export Options:\n\n- Pitch Bends (MPE Standard): Exports microtonal pitch bends per note on channels 2-15.\n- Pitch Bends (Multi-Track): Exports each chord note to a separate MIDI track.\n- Clean MIDI: Ignores microtonal pitch bends and exports standard 12-TET notes (useful when applying .scl/.tun files inside your DAW).");
        });
    }

    // Generic fallback for any native tooltips so they work as alerts on mobile touch
    document.querySelectorAll('.settings-label.info').forEach(label => {
        label.addEventListener('click', (e) => {
            e.preventDefault();
            const parent = label.closest('[title]');
            if (parent) alert(parent.title);
        });
    });
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
            
            reorderProgression(oldIndex, newIndex, newLoopStart, newLoopEnd);
            renderProgression();
        },
        onAddFromSource: (sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd) => {
            if (sourceChord === 'LOOP_BLOCK') {
                insertLoopedSequence(insertIndex, newLoopStart, newLoopEnd);
            } else {
                addChordFromSource(sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd);
            }
            renderProgression();
        },
        onBracketDrop: (bracketId, insertIndex, newLoopStart, newLoopEnd) => {
            setProgressionBrackets(bracketId, insertIndex, newLoopStart, newLoopEnd);
            renderProgression();

            // Instantly sync audio engine to new loop boundaries by restarting playback
            restartTransport();
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
        // CORRECT_PATTERN: Text nodes don't have .closest, so we must guard this call.
        if (e.target.closest && e.target.closest(ignoredSelectors)) {
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

function _preWarmAudio() {
    const warmUp = () => {
        try { initAudio(); } catch (e) {}
        document.removeEventListener('pointerdown', warmUp);
        document.removeEventListener('keydown', warmUp);
    };
    document.addEventListener('pointerdown', warmUp, { passive: true });
    document.addEventListener('keydown', warmUp, { passive: true });
}

// --- Main Entry Point ---
function initApp() {
    if (window.__progressAppInitialized) return;
    window.__progressAppInitialized = true;
    
    const display = document.getElementById('progression-display');
    syncUIToState();
    _setupTopBarEvents();
    initRhythmEditor({ 
        state, 
        saveHistoryState, 
        persistAppState, 
        renderProgression,
        updateEditorState,
        updatePattern,
        pushPatternToGlobal,
        resetPatternToGlobal,
        updateCustomDrumsUI,
        isPlaybackActive,
        restartTransport
    });
    _setupKeyAndModeSelectors();
    initSongController({ onRenderProgression: renderProgression });
    _setupControlButtons();
    _setupChordButtons();
    initTransport({ onRenderProgression: renderProgression });
    _setupProgressionDisplayEvents(display);
    _setupDragAndDrop(display);
    _setupSmartDragCollapse();
    _setupGlobalDoubleTap();
    _preWarmAudio();
    renderProgression();
    loadPersistedDrumSamples().then(() => {
        updateCustomDrumsUI();
        renderProgression();
    }); // Fetch user's custom drum kit from IndexedDB and update UI

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