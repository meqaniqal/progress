import { CONFIG } from './config.js';
import { getChordNotes, getPlayableNotes, getPitchEditorTuning, snapToGrid, HAND_CURATED_CATEGORIES, getEffectiveTuning, getBassNote } from './theory.js';
import { initAudio, getAudioCurrentTime, midiToFreq, playTone, loadPersistedDrumSamples } from './synth.js';
import { auditionChord, playProgression, stopAllAudio, auditionThreeChordSequence } from './sequencer.js';
import { initDragAndDrop } from './dragdrop.js';
import { exportToMidi } from './midi.js';
import { initRhythmEditor, openRhythmEditor, closeRhythmEditor, highlightDrumHit } from './rhythmEditor.js';
import { KEY_NAMES, highlightChordInUI, updateKeyAndModeDisplay, renderProgression as renderProgressionUI, initBuilderTabs } from './ui.js';
import { state, getActiveProgression, saveHistoryState, undoState, persistAppState, loadAndApplyInitialState, updateEditorState, updatePattern, pushPatternToGlobal, resetPatternToGlobal, addChord, removeChord, clearProgression, swapChord, stepInversion, changeVoicing, changeVoicingType, setGlobalVoicing, changeChordKey, transposeChord, changeDuration, addTurnaround, reorderProgression, addChordFromSource, setProgressionBrackets, setGlobalMode, setGlobalKeyAndMode, insertLoopedSequence } from './store.js';
import { applyInstanceOffsets } from './transitionEvaluator.js';
import { getExportState } from './exportStateBuilder.js';
import { initExportUI } from './exportController.js';
import { initModals } from './modalController.js';
import { initTransport, resetTransport, isPlaybackActive, restartTransport } from './transportController.js';
import { initSongController, updateSongUI, exitSongMode, isSongTrayOpen } from './songController.js';
import { initSettingsUI, syncSettingsUI, updateCustomDrumsUI } from './settingsController.js';
import { identifyChord } from './chordAnalyzer.js';

function getAuditionNotes(progression, index, appState) {
    const chord = progression[index];
    if (!chord) return null;

    const voicedNotes = getPlayableNotes(progression, appState)[index];
    if (!voicedNotes) return null;

    const tuning = getEffectiveTuning(chord.symbol, chord.divisions || appState.divisions || 12);

    // Resolve Chord Pattern
    let cPattern = chord.chordPattern;
    if (cPattern && !cPattern.isLocalOverride && appState.globalPatterns && appState.globalPatterns.chordPattern) {
        cPattern = appState.globalPatterns.chordPattern;
    }
    const cInstances = cPattern && cPattern.instances ? cPattern.instances : [{ startTime: 0.0, duration: 1.0 }];

    // Resolve Bass Pattern
    let bPattern = chord.bassPattern;
    if (bPattern && !bPattern.isLocalOverride && appState.globalPatterns && appState.globalPatterns.bassPattern) {
        bPattern = appState.globalPatterns.bassPattern;
    }
    const bInstances = bPattern && bPattern.instances ? bPattern.instances : [{ startTime: 0.0, duration: 1.0 }];

    return {
        chord,
        voicedNotes,
        chordSlices: cInstances.map(inst => ({
            startTime: inst.startTime,
            duration: inst.duration,
            notes: applyInstanceOffsets(voicedNotes, inst, chord, tuning)
        })),
        bassSlices: bInstances.map(inst => {
            const rootChordNotes = getChordNotes(chord, chord.key, tuning.divisions);
            const rootBassNote = rootChordNotes ? getBassNote(rootChordNotes, tuning) : 60 - 24;
            const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || appState.divisions || 12);
            const snappedOffset = snapToGrid(60 + (inst.pitchOffset || 0), editorTuning) - 60;
            return {
                startTime: inst.startTime,
                duration: inst.duration,
                pitch: rootBassNote + snappedOffset
            };
        })
    };
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
    onSwapChord: (index, altSymbol, originalChord, targetKey) => {
        swapChord(index, altSymbol, originalChord.symbol, targetKey);

        const chordToAudition = getActiveProgression()[index];
        if (!isPlaybackActive()) {
            const notesToPlay = getAuditionNotes(getActiveProgression(), index, state);
            auditionChord(chordToAudition.symbol, chordToAudition.key, notesToPlay, chordToAudition.divisions);
        }

        renderProgression();
    },
    onAuditionThreeChordSequence: (index, altSymbol, targetKey) => {
        if (!isPlaybackActive()) {
            auditionThreeChordSequence(index, altSymbol, targetKey, state);
        }
    },
    onStepInversion: (index, direction) => {
        stepInversion(index, direction);
        const newlyActiveProg = getActiveProgression();
        const notesToPlay = getAuditionNotes(newlyActiveProg, index, state);
        console.log(`[DEBUG INVERSION] Clicked inversion direction: ${direction} for index: ${index}`);
        console.log(`[DEBUG INVERSION] Chord: ${newlyActiveProg[index].symbol}, Key: ${newlyActiveProg[index].key}, InversionOffset: ${newlyActiveProg[index].inversionOffset}`);
        console.log(`[DEBUG INVERSION] Final Audition Notes:`, notesToPlay);
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

    // Trigger background regeneration of mgen melody on live edits if playing back
    if (isPlaybackActive() && state.melodySettings && state.melodySettings.enabled && state.melodySettings.engine === 'mgen') {
        import('./mgenEngine.js').then(m => m.pregenerateMgenMelody(state)).catch(err => console.error('Error pregenerating mgen melody:', err));
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
    const label = document.getElementById('mode-toggle-label');
    if (label) {
        label.textContent = state.isAdvancedMode ? 'Advanced' : 'Beginner';
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

    // emotion-selector is replaced by pills in ui.js, which handle state activeEmotion changes directly.

    const btnEmotionPrev = document.getElementById('btn-emotion-prev');
    const btnEmotionNext = document.getElementById('btn-emotion-next');
    const emotionPageInput = document.getElementById('emotion-category-page-input');
    const totalPagesCount = Math.ceil(HAND_CURATED_CATEGORIES.length / 6);

    if (btnEmotionPrev && btnEmotionNext) {
        btnEmotionPrev.addEventListener('click', () => {
            if (state.editorState && state.editorState.chordChooserCategoryPage > 0) {
                state.editorState.chordChooserCategoryPage--;
                state.editorState.emotionPage = 0;
                updateKeyAndModeDisplay(state);
                persistAppState();
            }
        });
        btnEmotionNext.addEventListener('click', () => {
            if (state.editorState && state.editorState.chordChooserCategoryPage < totalPagesCount - 1) {
                state.editorState.chordChooserCategoryPage++;
                state.editorState.emotionPage = 0;
                updateKeyAndModeDisplay(state);
                persistAppState();
            }
        });
    }

    if (emotionPageInput) {
        const handlePageJump = () => {
            let val = parseInt(emotionPageInput.value, 10);
            if (isNaN(val)) val = 1;
            val = Math.max(1, Math.min(totalPagesCount, val)) - 1;
            state.editorState.chordChooserCategoryPage = val;
            state.editorState.emotionPage = 0;
            updateKeyAndModeDisplay(state);
            persistAppState();
        };
        emotionPageInput.addEventListener('change', handlePageJump);
        emotionPageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handlePageJump();
        });
    }

    const btnSugPrev = document.getElementById('btn-sug-prev');
    const btnSugNext = document.getElementById('btn-sug-next');
    if (btnSugPrev && btnSugNext) {
        btnSugPrev.addEventListener('click', () => {
            if (state.editorState && state.editorState.emotionPage > 0) {
                state.editorState.emotionPage--;
                updateKeyAndModeDisplay(state);
            }
        });
        btnSugNext.addEventListener('click', () => {
            if (state.editorState) {
                state.editorState.emotionPage = (state.editorState.emotionPage || 0) + 1;
                updateKeyAndModeDisplay(state);
            }
        });
    }

    const emotionalChordsContainer = document.getElementById('emotional-chords-container');
    if (emotionalChordsContainer) {
        let touchStartX = 0;
        let touchEndX = 0;
        emotionalChordsContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        emotionalChordsContainer.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diffX = touchEndX - touchStartX;
            if (Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    const prevBtn = document.getElementById('btn-sug-prev');
                    if (prevBtn && !prevBtn.disabled) prevBtn.click();
                } else {
                    const nextBtn = document.getElementById('btn-sug-next');
                    if (nextBtn && !nextBtn.disabled) nextBtn.click();
                }
            }
        }, { passive: true });
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
            } else if (btn.id === 'btn-drag-loop') {
                document.body.classList.add('is-dragging-palette');
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
        const ignoredSelectors = 'button, input, select, textarea, label, .progression-item, .chord-btn, .rhythm-instance, .drum-hit, .bracket-element, .controls, .pattern-tab, .swap-menu, .rhythm-timeline-container, .drum-row-label, .piano-cell, .piano-note-block, .piano-key, .piano-row';
        // CORRECT_PATTERN: Text nodes don't have .closest, so we must guard this call.
        if (e.target.closest && (e.target.closest(ignoredSelectors) || e.target.closest('#palette-custom-builder'))) {
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
        try { initAudio(); } catch (e) { }
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
    initBuilderTabs(state, renderProgression);
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
    _setupCustomChordBuilder();
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

let customBuilderNotes = new Set(); // Stores base 12-tet notes (integers from 48 to 84)
let customBuilderOffsets = {};      // Map: baseMidi -> offset (float)
let customBuilderDeletedOffsets = {}; // Map: baseMidi -> offset (to restore on deletion mistake)

let draggedBuilderPitch = null;
let dragStartPointerY = 0;
let dragStartOffset = 0;

let lastBuilderTapTime = 0;
let lastBuilderTapPitch = null;

let lastAuditionedChordKey = '';
function auditionCurrentBuilderChord(force = false) {
    const notes = Array.from(customBuilderNotes).map(n => n + (customBuilderOffsets[n] || 0)).sort((a, b) => a - b);
    if (notes.length === 0) return;
    
    const key = notes.map(n => n.toFixed(4)).join(',');
    if (!force && key === lastAuditionedChordKey) {
        return;
    }
    lastAuditionedChordKey = key;
    
    auditionChord('CustomTemp', state.baseKey, notes, state.divisions);
}

let lastAuditionTime = 0;
let auditionThrottleTimeout = null;
function throttleAuditionCurrentBuilderChord() {
    const now = Date.now();
    const notes = Array.from(customBuilderNotes).map(n => n + (customBuilderOffsets[n] || 0)).sort((a, b) => a - b);
    if (notes.length === 0) return;

    const key = notes.map(n => n.toFixed(4)).join(',');
    if (key === lastAuditionedChordKey) {
        return;
    }

    const timeSinceLast = now - lastAuditionTime;
    const throttleLimit = 150; // 150ms minimum between auditions

    if (auditionThrottleTimeout) {
        clearTimeout(auditionThrottleTimeout);
        auditionThrottleTimeout = null;
    }

    if (timeSinceLast >= throttleLimit) {
        lastAuditionedChordKey = key;
        lastAuditionTime = now;
        auditionChord('CustomTemp', state.baseKey, notes, state.divisions);
    } else {
        const remaining = throttleLimit - timeSinceLast;
        auditionThrottleTimeout = setTimeout(() => {
            const currentNotes = Array.from(customBuilderNotes).map(n => n + (customBuilderOffsets[n] || 0)).sort((a, b) => a - b);
            if (currentNotes.length === 0) return;
            const currentKey = currentNotes.map(n => n.toFixed(4)).join(',');
            if (currentKey !== lastAuditionedChordKey) {
                lastAuditionedChordKey = currentKey;
                lastAuditionTime = Date.now();
                auditionChord('CustomTemp', state.baseKey, currentNotes, state.divisions);
            }
        }, remaining);
    }
}

function _setupCustomChordBuilder() {
    const grid = document.getElementById('piano-roll-grid');
    if (!grid) return;

    window.__renderCustomBuilderGrid = function() {
        grid.innerHTML = '';

        const NOTE_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const pitches = [];
        for (let i = 84; i >= 48; i--) {
            pitches.push(i);
        }

        pitches.forEach(p => {
            const nearestMidi = p;
            const offset = customBuilderOffsets[p] || 0;
            const cents = Math.round(offset * 100);
            const name = NOTE_CLASSES[(nearestMidi % 12 + 12) % 12];
            const octave = Math.floor(nearestMidi / 12) - 1;
            const centsStr = cents === 0 ? '' : (cents > 0 ? ` +${cents}¢` : ` ${cents}¢`);
            const label = `${name}${octave}${centsStr}`;

            const isBlack = [1, 3, 6, 8, 10].includes((nearestMidi % 12 + 12) % 12);

            const row = document.createElement('div');
            row.className = 'piano-row';
            row.style.display = 'flex';
            row.style.height = '24px';
            row.style.borderBottom = '1px solid var(--border-main)';
            row.style.width = '100%';
            row.style.boxSizing = 'border-box';
            row.style.userSelect = 'none';

            // Key element
            const key = document.createElement('div');
            key.className = 'piano-key';
            key.style.width = '70px';
            key.style.background = isBlack ? '#222' : '#fff';
            key.style.color = isBlack ? '#fff' : '#000';
            key.style.borderRight = '1px solid var(--border-main)';
            key.style.padding = '0 6px';
            key.style.fontSize = '9px';
            key.style.display = 'flex';
            key.style.alignItems = 'center';
            key.style.fontWeight = 'bold';
            key.textContent = label;
            key.style.flexShrink = '0';
            row.appendChild(key);

            // Grid cell
            const cell = document.createElement('div');
            cell.className = 'piano-cell';
            cell.style.flexGrow = '1';
            cell.style.position = 'relative';
            cell.style.cursor = 'pointer';
            cell.style.background = 'var(--bg-panel)';
            cell.dataset.pitch = p;

            const isActive = customBuilderNotes.has(p);
            if (isActive) {
                const block = document.createElement('div');
                block.className = 'piano-note-block';
                block.style.position = 'absolute';
                block.style.top = '2px';
                block.style.bottom = '2px';
                block.style.left = '4px';
                block.style.right = '4px';
                block.style.background = '#fbbf24';
                block.style.borderRadius = '4px';
                block.style.boxShadow = '0 0 6px rgba(251,191,36,0.8)';
                block.style.cursor = 'ns-resize';
                block.style.touchAction = 'none';
                cell.appendChild(block);
            }

            row.appendChild(cell);
            grid.appendChild(row);
        });
    };

    grid.addEventListener('pointerdown', (e) => {
        const cell = e.target.closest('.piano-cell');
        if (!cell) return;
        const pitch = parseInt(cell.dataset.pitch, 10);
        const isBlock = e.target.classList.contains('piano-note-block');
        
        if (isBlock) {
            draggedBuilderPitch = pitch;
            dragStartPointerY = e.clientY;
            dragStartOffset = customBuilderOffsets[pitch] || 0;
            cell.setPointerCapture(e.pointerId);
            e.preventDefault();
        } else {
            const now = Date.now();
            const doubleTapDelay = 300;
            
            if (now - lastBuilderTapTime < doubleTapDelay && lastBuilderTapPitch === pitch) {
                // Double Tap!
                if (customBuilderNotes.has(pitch)) {
                    customBuilderNotes.delete(pitch);
                    delete customBuilderOffsets[pitch];
                    delete customBuilderDeletedOffsets[pitch];
                } else {
                    customBuilderNotes.add(pitch);
                    customBuilderOffsets[pitch] = 0;
                    delete customBuilderDeletedOffsets[pitch];
                }
                lastBuilderTapTime = 0;
                lastBuilderTapPitch = null;
                window.__renderCustomBuilderGrid();
                auditionCurrentBuilderChord(true);
            } else {
                lastBuilderTapTime = now;
                lastBuilderTapPitch = pitch;
                
                setTimeout(() => {
                    if (lastBuilderTapPitch === pitch && lastBuilderTapTime === now && draggedBuilderPitch === null) {
                        // Single Tap!
                        if (customBuilderNotes.has(pitch)) {
                            customBuilderDeletedOffsets[pitch] = customBuilderOffsets[pitch] || 0;
                            customBuilderNotes.delete(pitch);
                            delete customBuilderOffsets[pitch];
                        } else {
                            customBuilderNotes.add(pitch);
                            customBuilderOffsets[pitch] = customBuilderDeletedOffsets[pitch] !== undefined ? customBuilderDeletedOffsets[pitch] : 0;
                            delete customBuilderDeletedOffsets[pitch];
                        }
                        window.__renderCustomBuilderGrid();
                        auditionCurrentBuilderChord(true);
                    }
                }, 250);
            }
        }
    });

    grid.addEventListener('pointermove', (e) => {
        if (draggedBuilderPitch === null) return;
        
        const deltaY = e.clientY - dragStartPointerY;
        const tuning = getPitchEditorTuning(null, state.divisions || 12);
        
        const floatPitchChange = -deltaY / 24;
        const targetAbsolutePitch = draggedBuilderPitch + dragStartOffset + floatPitchChange;
        const snappedAbsolutePitch = snapToGrid(targetAbsolutePitch, tuning);
        
        let newBaseNote = Math.round(snappedAbsolutePitch);
        newBaseNote = Math.max(48, Math.min(84, newBaseNote));
        
        const newOffset = snappedAbsolutePitch - newBaseNote;
        
        if (newBaseNote !== draggedBuilderPitch) {
            customBuilderNotes.delete(draggedBuilderPitch);
            delete customBuilderOffsets[draggedBuilderPitch];
            
            customBuilderNotes.add(newBaseNote);
            draggedBuilderPitch = newBaseNote;
            
            dragStartPointerY = e.clientY;
            dragStartOffset = newOffset;
        }
        
        customBuilderOffsets[newBaseNote] = newOffset;
        window.__renderCustomBuilderGrid();
        throttleAuditionCurrentBuilderChord();
    });

    grid.addEventListener('pointerup', (e) => {
        if (draggedBuilderPitch !== null) {
            const cell = e.target.closest('.piano-cell') || grid.querySelector(`.piano-cell[data-pitch="${draggedBuilderPitch}"]`);
            if (cell) {
                try { cell.releasePointerCapture(e.pointerId); } catch(err) {}
            }
            draggedBuilderPitch = null;
            if (auditionThrottleTimeout) {
                clearTimeout(auditionThrottleTimeout);
                auditionThrottleTimeout = null;
            }
            auditionCurrentBuilderChord();
        }
    });

    // Clear Button
    const clearBtn = document.getElementById('btn-piano-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            customBuilderNotes.clear();
            customBuilderOffsets = {};
            customBuilderDeletedOffsets = {};
            window.__renderCustomBuilderGrid();
        });
    }

    // Save Button
    const saveBtn = document.getElementById('btn-piano-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const notes = Array.from(customBuilderNotes).map(n => n + (customBuilderOffsets[n] || 0)).sort((a, b) => a - b);
            if (notes.length === 0) return;

            const numeral = identifyChord(notes, state.baseKey, true);
            const expectedNotes = getChordNotes(numeral, state.baseKey, state.divisions);
            const customNotes = notes.map((pitch, i) => {
                const expected = expectedNotes && expectedNotes[i] !== undefined ? expectedNotes[i] : pitch;
                const deviates = Math.abs(pitch - expected) > 0.01;
                return { pitch, isMicrotonal: deviates };
            });
            const newCustomChord = {
                symbol: numeral,
                customNotes: customNotes,
                key: state.baseKey,
                divisions: state.divisions
            };

            state.customChords = state.customChords.filter(c => c.symbol !== numeral);
            state.customChords.push(newCustomChord);
            if (state.customChords.length > 3) {
                state.customChords.shift();
            }

            window.__customChords = state.customChords;
            persistAppState();

            state.editorState.activeBuilderTab = 'standard';
            persistAppState();
            updateKeyAndModeDisplay(state);
            renderProgression();
        });
    }

    // Scroll lock container support to prevent whole app scroll
    const scrollContainer = document.getElementById('piano-roll-scroll-container');
    if (scrollContainer) {
        scrollContainer.style.overscrollBehavior = 'contain';
        scrollContainer.style.touchAction = 'pan-y';
        scrollContainer.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        scrollContainer.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    }

    // Disable browser native drag outlines
    grid.addEventListener('dragstart', (e) => e.preventDefault());

    // Audition Button (Speaker Icon)
    const auditionBtn = document.getElementById('btn-builder-audition');
    if (auditionBtn) {
        auditionBtn.addEventListener('click', () => {
            auditionCurrentBuilderChord(true);
        });
    }

    // Prevent longpress context menu on mobile inside the custom chord builder container
    const customBuilderContainer = document.getElementById('palette-custom-builder');
    if (customBuilderContainer) {
        customBuilderContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    // Centrally prevent context menus on range sliders to improve mobile dragging UX
    document.addEventListener('contextmenu', (e) => {
        if (e.target.matches('input[type="range"]')) {
            e.preventDefault();
        }
    });
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}