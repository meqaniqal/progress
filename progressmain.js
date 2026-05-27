import { CONFIG } from './config.js';
import { getChordNotes, getPlayableNotes } from './theory.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, setTrackVolume, loadPersistedDrumSamples, clearCustomDrumSamples, hasCustomDrumSamples } from './synth.js';
import { auditionChord, playProgression, stopAllAudio } from './sequencer.js';
import { initDragAndDrop } from './dragdrop.js';
import { exportToMidi, exportScalaFile, exportTunFile } from './midi.js';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor, highlightDrumHit } from './rhythmEditor.js';
import { KEY_NAMES, highlightChordInUI, updateKeyAndModeDisplay, renderProgression as renderProgressionUI } from './ui.js';
import { state, getActiveProgression, saveHistoryState, undoState, persistAppState, loadAndApplyInitialState, updateEditorState, updatePattern, pushPatternToGlobal, resetPatternToGlobal, addChord, removeChord, clearProgression, swapChord, stepInversion, changeVoicing, changeVoicingType, setGlobalVoicing, changeChordKey, transposeChord, changeDuration, addTurnaround, reorderProgression, addChordFromSource, setProgressionBrackets, setGlobalMode, setGlobalKeyAndMode, insertLoopedSequence } from './store.js';
import { getExportState } from './exportStateBuilder.js';
import { initExportUI } from './exportController.js';
import { initModals } from './modalController.js';
import { initTransport, resetTransport, isPlaybackActive, restartTransport } from './transportController.js';
import { initSongController, updateSongUI, exitSongMode, isSongTrayOpen } from './songController.js';

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
                    let notesToPlay = null;
                    if (state.useVoiceLeading) {
                        notesToPlay = getPlayableNotes(getActiveProgression(), state)[index];
                    }
                    auditionChord(chordToAudition.symbol, chordToAudition.key, notesToPlay, chordToAudition.divisions);
                }
                
                renderProgression();
            },
            onStepInversion: (index, direction) => {
                stepInversion(index, direction);
                const newlyActiveProg = getActiveProgression();
                const notesToPlay = getPlayableNotes(newlyActiveProg, state)[index];
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
                const notesToPlay = getPlayableNotes(newlyActiveProg, state)[index];
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

export function updateMicrotonalSettingsUI() {
    const isMicrotonal = state.divisions !== 12;
    const isCleanRouting = state.midiExportRouting === 'clean';

    const rowAutoPan = document.getElementById('row-auto-pan');
    const rowMidiRouting = document.getElementById('row-midi-routing');
    const hubTuningFilesSection = document.getElementById('hub-tuning-files-section');

    if (rowAutoPan) rowAutoPan.style.display = isMicrotonal ? 'flex' : 'none';
    if (rowMidiRouting) rowMidiRouting.style.display = isMicrotonal ? 'flex' : 'none';
    
    if (hubTuningFilesSection) {
        const btnScala = document.getElementById('btn-hub-export-scala');
        const btnTun = document.getElementById('btn-hub-export-tun');
        const selector = document.getElementById('hub-tuning-selector');
        
        const enabled = isMicrotonal && isCleanRouting;
        if (btnScala) btnScala.disabled = !enabled;
        if (btnTun) btnTun.disabled = !enabled;
        if (selector) selector.disabled = !enabled;
        
        hubTuningFilesSection.style.opacity = enabled ? '1' : '0.5';
    }
}

export function updateCustomDrumsUI() {
    const customDrumsPanel = document.getElementById('custom-drums-panel');
    if (customDrumsPanel) {
        customDrumsPanel.style.display = hasCustomDrumSamples() ? 'block' : 'none';
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
    document.getElementById('bpm-slider').value = state.bpm;
    
    const tuningSelector = document.getElementById('tuning-selector');
    if (tuningSelector) tuningSelector.value = state.divisions || 12;
    
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
    
    updateCustomDrumsUI();
    
    const multipassInput = document.getElementById('multipass-input');
    if (multipassInput) multipassInput.value = state.exportPasses || 1;
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
    const autoPanInput = document.getElementById('auto-pan-leading');
    if (autoPanInput) autoPanInput.checked = state.autoPanLeading;
    
    const midiExportSelector = document.getElementById('midi-export-routing');
    if (midiExportSelector) midiExportSelector.value = state.midiExportRouting || 'mpe';
    
    updateMicrotonalSettingsUI();

    document.body.classList.toggle('beginner-mode', !state.isAdvancedMode);
    const btnModeToggle = document.getElementById('btn-mode-toggle');
    if (btnModeToggle) {
        btnModeToggle.textContent = state.isAdvancedMode ? '🎓 Advanced' : '🌱 Beginner';
    }
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
    
    const tuningSelector = document.getElementById('tuning-selector');
    if (tuningSelector) {
        tuningSelector.addEventListener('change', (e) => {
            state.divisions = parseInt(e.target.value, 10) || 12;
            persistAppState();
            updateMicrotonalSettingsUI();
            renderProgression();
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
            let notesToPlay = null;
            if (state.useVoiceLeading) {
                notesToPlay = getPlayableNotes(getActiveProgression(), state)[index];
            }
        auditionChord(displayChord.symbol, displayChord.key, notesToPlay, displayChord.divisions);
        }

        // Always select the clicked chord (no toggling off)
        state.selectedChordIndex = index;
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

    const btnModeToggle = document.getElementById('btn-mode-toggle');
    if (btnModeToggle) {
        btnModeToggle.addEventListener('click', () => {
            state.isAdvancedMode = !state.isAdvancedMode;
            document.body.classList.toggle('beginner-mode', !state.isAdvancedMode);
            btnModeToggle.textContent = state.isAdvancedMode ? '🎓 Advanced' : '🌱 Beginner';
            persistAppState();
            
            // Ensure Song Mode exits if switching to beginner to clean up the UI
            if (!state.isAdvancedMode) {
                exitSongMode();
            }
        });
    }
    
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
                try { setTrackVolume(track, val); } catch (err) { console.warn(`Failed to set volume for ${track}: Audio engine may not be ready.`, err); }
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
    


    const btnClearDrums = document.getElementById('btn-clear-custom-drums');
    if (btnClearDrums) {
        btnClearDrums.addEventListener('click', async () => {
            await clearCustomDrumSamples();
            updateCustomDrumsUI();
            renderProgression();
        });
    }

    document.getElementById('voice-leading').addEventListener('change', (e) => {
        state.useVoiceLeading = e.target.checked;
        persistAppState();
    });
    
    
    const autoPanInput = document.getElementById('auto-pan-leading');
    if (autoPanInput) {
        autoPanInput.addEventListener('change', (e) => {
            state.autoPanLeading = e.target.checked;
            persistAppState();
        });
    }
    
    const midiExportSelector = document.getElementById('midi-export-routing');
    if (midiExportSelector) {
        midiExportSelector.addEventListener('change', (e) => {
            state.midiExportRouting = e.target.value;
            persistAppState();
            updateMicrotonalSettingsUI();
        });
    }
    
    const btnHubExportScala = document.getElementById('btn-hub-export-scala');
    if (btnHubExportScala) {
        btnHubExportScala.addEventListener('click', () => {
            if (btnHubExportScala.disabled) return;
            btnHubExportScala.disabled = true;
            setTimeout(() => btnHubExportScala.disabled = false, 1000);
            const div = parseInt(document.getElementById('hub-tuning-selector').value, 10) || 12;
            exportScalaFile(div);
        });
    }
    
    const btnHubExportTun = document.getElementById('btn-hub-export-tun');
    if (btnHubExportTun) {
        btnHubExportTun.addEventListener('click', () => {
            if (btnHubExportTun.disabled) return;
            btnHubExportTun.disabled = true;
            setTimeout(() => btnHubExportTun.disabled = false, 1000);
            const div = parseInt(document.getElementById('hub-tuning-selector').value, 10) || 12;
            exportTunFile(div);
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
        updateCustomDrumsUI
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