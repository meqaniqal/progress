import { saveState, loadState, clearState } from './storage.js';
import { calculateLoopBounds, calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder } from './stateUtils.js';
import { initChordPattern, initDrumPattern, initPatternSet } from './patternUtils.js';

export const state = {
    sections: {}, // Map of sectionId -> { id, name, progression, globalPatterns }
    songSequence: [], // Array of sectionIds
    activeSectionId: null,
    currentProgression: [],
    temporarySwaps: {}, // Map of index -> temporary chord string (e.g. { 1: 'vi' })
    history: [], // Stores progression snapshots for Undo
    baseKey: 60, // C4
    bpm: 120,
    isLooping: true, // Hardcoded to always loop
    useVoiceLeading: true,
    autoPanLeading: true,
    midiExportRouting: 'mpe',
    globalVoicing: 'auto', // 'auto', 'close', 'spread', 'quartal'
    divisions: 12, // Standard Equal Temperament
    loopStart: 0,
    loopEnd: 0,
    macroLoopStart: 0,
    macroLoopEnd: 0,
    theme: 'dark',
    mode: 'major',
    exportPasses: 1,
    volumes: { chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8 }, // 0.8 provides headroom for mixing
    instruments: { chords: 'sawtooth', bass: 'sine' },
    selectedChordIndex: null,
    globalPatterns: initPatternSet(),
    showManualOnStartup: true,
    isAdvancedMode: true,
    editorState: {
        activeIndex: null,
        activeOverlayId: null,
        isDragging: false,
        isResizing: null,
        isDrawModeEnabled: false,
        isDrawing: false,
        isPitchModeEnabled: false,
        isTransitionsModeEnabled: false,
        drawStartRatio: null,
        drawModeAction: null,
        drawStartPattern: null,
        draggedInstanceId: null,
        focusedSliceId: null,
        draggedHitId: null,
        draggedTransitionId: null,
        selectedHitId: null,
        clipboardPattern: null,
        gridStepIndex: 4,
        isGridEnabled: true,
        zoomLevel: 1.0,
        isPanning: false,
        activeTab: 'chordPattern',
        isGlobal: false,
        justPushedToGlobalIndex: null
    }
};

// Initialize default section pointers to prevent circular dependency on load
const initialSectionId = 'sec-' + Math.random().toString(36).substring(2, 10);
const initialPatterns = initPatternSet();
state.sections[initialSectionId] = {
    id: initialSectionId,
    name: 'Section 1',
    progression: [],
    globalPatterns: initialPatterns,
    loopStart: 0,
    loopEnd: 0,
    temporarySwaps: {}
};
state.songSequence = [initialSectionId];
state.activeSectionId = initialSectionId;
state.currentProgression = state.sections[initialSectionId].progression;
state.globalPatterns = state.sections[initialSectionId].globalPatterns;

// Resolves the progression with any active temporary swaps applied
export function getActiveProgression() {
    return state.currentProgression.map((chord, index) => {
        // Always return a deep copy to prevent downstream mutations from leaking back into the master state.
        const deepClonedChord = structuredClone(chord);

        if (state.temporarySwaps[index]) {
            // The swap object is an overlay. Let it override properties on the deep-cloned chord.
            const swap = state.temporarySwaps[index];
            return {
                ...deepClonedChord,
                ...swap
            };
        }
        return deepClonedChord;
    });
}

export function updateEditorState(updates) {
    state.editorState = { ...state.editorState, ...updates };
}

export function updatePattern(tab, pattern, activeIndex, isGlobal, markAsOverride = true) {
    if (isGlobal) {
        state.globalPatterns[tab] = pattern;
        
        if (tab === 'chordPattern') {
            const oldBassPattern = state.globalPatterns['bassPattern'];
            if (!oldBassPattern || !oldBassPattern.isLocalOverride) {
                const bassCopy = structuredClone(pattern);
                bassCopy.instances.forEach(inst => {
                    inst.id = Math.random().toString(36).substring(2, 10);
                    if (oldBassPattern && Array.isArray(oldBassPattern.instances)) {
                        const center = inst.startTime + (inst.duration / 2);
                        const oldInst = oldBassPattern.instances.find(o => center >= o.startTime && center <= o.startTime + o.duration);
                        if (oldInst && oldInst.pitchOffset) {
                            inst.pitchOffset = oldInst.pitchOffset;
                        }
                    }
                });
                state.globalPatterns['bassPattern'] = bassCopy;
            }
        }
    } else {
        if (activeIndex === null) return;
        const chord = state.currentProgression[activeIndex];
        if (chord) {
            if (markAsOverride) pattern.isLocalOverride = true;
            chord[tab] = pattern;
            
            if (tab === 'chordPattern') {
                const oldBassPattern = chord['bassPattern'];
                if (!oldBassPattern || !oldBassPattern.isLocalOverride) {
                    const bassCopy = structuredClone(pattern);
                    bassCopy.instances.forEach(inst => {
                        inst.id = Math.random().toString(36).substring(2, 10);
                        if (oldBassPattern && Array.isArray(oldBassPattern.instances)) {
                            const center = inst.startTime + (inst.duration / 2);
                            const oldInst = oldBassPattern.instances.find(o => center >= o.startTime && center <= o.startTime + o.duration);
                            if (oldInst && oldInst.pitchOffset) {
                                inst.pitchOffset = oldInst.pitchOffset;
                            }
                        }
                    });
                    chord['bassPattern'] = bassCopy;
                }
            }
        }
    }
}

export function pushPatternToGlobal(tab, pattern, activeIndex) {
    const globalCopy = structuredClone(pattern);
    globalCopy.isLocalOverride = false;
    
    const chord = state.currentProgression[activeIndex];
    globalCopy.lengthBeats = chord ? (Number(chord.duration) || 2) : 2;
    
    if (!globalCopy.globalMode) {
        globalCopy.globalMode = 'loop';
    }
    
    state.globalPatterns[tab] = globalCopy;
    state.editorState.justPushedToGlobalIndex = activeIndex;
    resetPatternToGlobal(tab, activeIndex);
    
    if (tab === 'chordPattern') {
        const oldGlobalBass = state.globalPatterns['bassPattern'];
        if (!oldGlobalBass || !oldGlobalBass.isLocalOverride) {
            const bassCopy = structuredClone(globalCopy);
            bassCopy.instances.forEach(inst => {
                inst.id = Math.random().toString(36).substring(2, 10);
                if (oldGlobalBass && Array.isArray(oldGlobalBass.instances)) {
                    const center = inst.startTime + (inst.duration / 2);
                    const oldInst = oldGlobalBass.instances.find(o => center >= o.startTime && center <= o.startTime + o.duration);
                    if (oldInst && oldInst.pitchOffset) {
                        inst.pitchOffset = oldInst.pitchOffset;
                    }
                }
            });
            state.globalPatterns['bassPattern'] = bassCopy;
            if (!chord || !chord['bassPattern'] || !chord['bassPattern'].isLocalOverride) {
                resetPatternToGlobal('bassPattern', activeIndex);
            }
        }
    }
}

export function resetPatternToGlobal(tab, activeIndex) {
    if (activeIndex !== null) {
        const chord = state.currentProgression[activeIndex];
        if (chord && chord[tab]) {
            chord[tab].isLocalOverride = false;
        }
    }
}

export function applyLoopBounds() {
    const bounds = calculateLoopBounds(state.currentProgression.length, state.loopStart, state.loopEnd);
    state.loopStart = bounds.start;
    state.loopEnd = bounds.end;
}

export function applyMacroLoopBounds() {
    const bounds = calculateLoopBounds(state.songSequence.length, state.macroLoopStart, state.macroLoopEnd);
    state.macroLoopStart = bounds.start;
    state.macroLoopEnd = bounds.end;
}

// --- Phase 2: SSOT Action Enforcers ---

export function addChord(numeral, targetKey = state.baseKey) {
    saveHistoryState();
    const isAtEnd = state.loopEnd === state.currentProgression.length;
    state.currentProgression.push({ symbol: numeral, key: targetKey, ...initPatternSet(), duration: 2 });
    
    if (isAtEnd) state.loopEnd = state.currentProgression.length;
    
    applyLoopBounds();
    persistAppState();
}

export function removeChord(index) {
    saveHistoryState();
    const isAtEnd = state.loopEnd === state.currentProgression.length;
    state.temporarySwaps = calculateSwapsOnRemove(state.temporarySwaps, index);
    
    if (state.selectedChordIndex > index) {
        state.selectedChordIndex--;
    } else if (state.selectedChordIndex === index) {
        state.selectedChordIndex = null; 
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
}

export function clearProgression() {
    if (state.currentProgression.length === 0) return;
    saveHistoryState();
    state.temporarySwaps = {};
    state.selectedChordIndex = null;
    state.currentProgression = [];
    applyLoopBounds();
    persistAppState();
}

export function swapChord(index, altSymbol, originalSymbol) {
    saveHistoryState();
    if (altSymbol === originalSymbol) {
        delete state.temporarySwaps[index];
    } else {
        state.temporarySwaps[index] = { symbol: altSymbol };
    }
    persistAppState();
}

export function stepInversion(index, direction) {
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
}

export function changeVoicing(index, voicingObj) {
    saveHistoryState();
    state.currentProgression[index].voicing = voicingObj;
    if (state.temporarySwaps[index]) state.temporarySwaps[index] = { ...state.temporarySwaps[index], voicing: voicingObj };
    persistAppState();
}

export function changeVoicingType(index, type) {
    saveHistoryState();
    state.currentProgression[index].voicingType = type;
    if (state.temporarySwaps[index]) state.temporarySwaps[index].voicingType = type;
    persistAppState();
}

export function setGlobalVoicing(type) {
    saveHistoryState();
    state.globalVoicing = type;
    persistAppState();
}

export function setGlobalMode(mode) {
    saveHistoryState();
    state.mode = mode;
    persistAppState();
}

export function setGlobalKeyAndMode(key, mode) {
    saveHistoryState();
    state.baseKey = key;
    state.mode = mode;
    persistAppState();
}

export function changeChordKey(index, newKey) {
    saveHistoryState();
    state.currentProgression[index].key = newKey;
    if (state.temporarySwaps[index]) {
        state.temporarySwaps[index].key = newKey;
    }
    persistAppState();
}

export function transposeChord(index) {
    saveHistoryState();
    state.currentProgression[index].key = state.baseKey;
    if (state.temporarySwaps[index]) state.temporarySwaps[index].key = state.baseKey;
    persistAppState();
}

export function changeDuration(index, dur) {
    saveHistoryState();
    state.currentProgression[index].duration = dur;
    if (state.temporarySwaps[index]) state.temporarySwaps[index].duration = dur;
    persistAppState();
}

export function addTurnaround(index, altSymbol, key) {
    saveHistoryState();
    const insertIndex = index + 1;
    state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex);
    state.currentProgression.splice(insertIndex, 0, { symbol: altSymbol, key: key, ...initPatternSet(), duration: 2 });
    if (insertIndex <= state.loopEnd) state.loopEnd++;
    state.selectedChordIndex = insertIndex;
    applyLoopBounds();
    persistAppState();
}

export function reorderProgression(oldIndex, newIndex, newLoopStart, newLoopEnd) {
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
        if (state.loopStart !== newLoopStart || state.loopEnd !== newLoopEnd) {
            if (oldIndex === newIndex) saveHistoryState();
        }
        state.loopStart = newLoopStart;
        state.loopEnd = newLoopEnd;
    }
    
    applyLoopBounds();
    persistAppState();
}

export function addChordFromSource(sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd) {
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
}

export function insertLoopedSequence(insertIndex, newLoopStart, newLoopEnd) {
    if (state.currentProgression.length === 0) return;
    
    let start = state.loopStart;
    let end = state.loopEnd;
    if (start >= end) return;

    saveHistoryState();

    const activeProgression = getActiveProgression();
    const loopSlice = activeProgression.slice(start, end).map(chord => {
        const newChord = structuredClone(chord);
        if (newChord.chordPattern && newChord.chordPattern.instances) newChord.chordPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (newChord.bassPattern && newChord.bassPattern.instances) newChord.bassPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (newChord.drumPattern && newChord.drumPattern.hits) newChord.drumPattern.hits.forEach(h => h.id = Math.random().toString(36).substring(2, 10));
        return newChord;
    });

    if (insertIndex === null) insertIndex = state.currentProgression.length;
    
    const shiftAmt = loopSlice.length;
    state.temporarySwaps = calculateSwapsOnInsert(state.temporarySwaps, insertIndex, shiftAmt);

    state.currentProgression.splice(insertIndex, 0, ...loopSlice);
    state.selectedChordIndex = insertIndex + shiftAmt - 1;

    if (newLoopStart !== null && newLoopEnd !== null) {
        state.loopStart = newLoopStart;
        state.loopEnd = newLoopEnd;
    } else {
        if (insertIndex < state.loopEnd) state.loopEnd += shiftAmt;
        if (insertIndex <= state.loopStart) state.loopStart += shiftAmt;
    }

    applyLoopBounds();
    persistAppState();
}

export function setProgressionBrackets(bracketId, insertIndex, newLoopStart, newLoopEnd) {
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
}

// --- History & Undo ---
export function saveHistoryState() {
    // Force a sync of active primitive pointers into the section before capturing history
    if (state.activeSectionId && state.sections[state.activeSectionId]) {
        state.sections[state.activeSectionId].loopStart = state.loopStart;
        state.sections[state.activeSectionId].loopEnd = state.loopEnd;
        state.sections[state.activeSectionId].temporarySwaps = structuredClone(state.temporarySwaps);
    }

    state.history.push({
        sections: structuredClone(state.sections),
        songSequence: structuredClone(state.songSequence),
        activeSectionId: state.activeSectionId,
        temporarySwaps: structuredClone(state.temporarySwaps),
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
        macroLoopStart: state.macroLoopStart,
        macroLoopEnd: state.macroLoopEnd
    });
    if (state.history.length > 50) state.history.shift(); // Max 50 undos
}

export function undoState() {
    if (state.history.length === 0) return false;
    const previousState = state.history.pop();
    
    if (previousState.sections) {
        state.sections = previousState.sections;
        state.songSequence = previousState.songSequence;
        state.activeSectionId = previousState.activeSectionId;
        if (state.sections[state.activeSectionId]) {
            const activeSec = state.sections[state.activeSectionId];
            state.currentProgression = activeSec.progression;
            state.globalPatterns = activeSec.globalPatterns;
            state.loopStart = activeSec.loopStart ?? previousState.loopStart;
            state.loopEnd = activeSec.loopEnd ?? previousState.loopEnd;
            state.temporarySwaps = activeSec.temporarySwaps ?? previousState.temporarySwaps;
        }
        state.macroLoopStart = previousState.macroLoopStart ?? 0;
        state.macroLoopEnd = previousState.macroLoopEnd ?? state.songSequence.length;
    } else {
        state.temporarySwaps = previousState.temporarySwaps;
        state.loopStart = previousState.loopStart;
        state.loopEnd = previousState.loopEnd;
    }

    applyLoopBounds();
    applyMacroLoopBounds();
    persistAppState();
    return true;
}

export function persistAppState() {
    // Ensure the active section is perfectly updated before saving
    if (state.activeSectionId && state.sections[state.activeSectionId]) {
        state.sections[state.activeSectionId].loopStart = state.loopStart;
        state.sections[state.activeSectionId].loopEnd = state.loopEnd;
        state.sections[state.activeSectionId].temporarySwaps = state.temporarySwaps;
    }
    saveState(state);
}

export function resetSession() {
    clearState();
    
    const defaultId = 'sec-' + Math.random().toString(36).substring(2, 10);
    state.sections = {
        [defaultId]: {
            id: defaultId,
            name: 'Section 1',
            progression: [],
            globalPatterns: initPatternSet(),
            loopStart: 0,
            loopEnd: 0,
            temporarySwaps: {}
        }
    };
    state.songSequence = [defaultId];
    state.activeSectionId = defaultId;
    state.currentProgression = state.sections[defaultId].progression;
    state.globalPatterns = state.sections[defaultId].globalPatterns;
    
    state.temporarySwaps = {};
    state.history = [];
    state.baseKey = 60;
    state.bpm = 120;
    state.isLooping = true;
    state.useVoiceLeading = true;
    state.autoPanLeading = true;
    state.midiExportRouting = 'mpe';
    state.globalVoicing = 'auto';
    state.divisions = 12;
    state.loopStart = 0;
    state.loopEnd = 0;
    state.macroLoopStart = 0;
    state.macroLoopEnd = 0;
    state.theme = 'dark';
    state.mode = 'major';
    state.exportPasses = 1;
    state.volumes = { chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8 };
    state.instruments = { chords: 'sawtooth', bass: 'sine' };
    state.selectedChordIndex = null;
    state.showManualOnStartup = true;
    state.isAdvancedMode = true;
    state.editorState = {
        activeIndex: null,
        activeOverlayId: null,
        isDragging: false,
        isResizing: null,
        isDrawModeEnabled: false,
        isDrawing: false,
        isPitchModeEnabled: false,
        isTransitionsModeEnabled: false,
        drawStartRatio: null,
        drawModeAction: null,
        drawStartPattern: null,
        draggedInstanceId: null,
        focusedSliceId: null,
        draggedHitId: null,
        draggedTransitionId: null,
        selectedHitId: null,
        clipboardPattern: null,
        gridStepIndex: 4,
        isGridEnabled: true,
        zoomLevel: 1.0,
        isPanning: false,
        activeTab: 'chordPattern',
        isGlobal: false,
        justPushedToGlobalIndex: null
    };
}

export function loadAndApplyInitialState(explicitState = null) {
    const savedState = explicitState || loadState();
    if (savedState) {
        // 1. Sanitize Primitives
        if (typeof savedState.baseKey === 'number') state.baseKey = Math.max(0, Math.min(127, savedState.baseKey));
        
        if (savedState.bpm !== undefined) {
            const parsedBpm = parseInt(savedState.bpm, 10);
            if (!isNaN(parsedBpm)) state.bpm = Math.max(40, Math.min(300, parsedBpm));
        }
        
        state.isLooping = true; // Hardcoded to always loop
        state.useVoiceLeading = Boolean(savedState.useVoiceLeading ?? savedState.voiceLeading ?? state.useVoiceLeading);
        state.autoPanLeading = savedState.autoPanLeading !== undefined ? Boolean(savedState.autoPanLeading) : true;
        state.midiExportRouting = savedState.midiExportRouting || 'mpe';
        state.globalVoicing = savedState.globalVoicing || 'auto';
        state.divisions = savedState.divisions !== undefined ? parseInt(savedState.divisions, 10) : 12;
        state.theme = savedState.theme === 'light' ? 'light' : 'dark';
        state.mode = savedState.mode === 'minor' ? 'minor' : 'major';
        
        if (typeof savedState.loopStart === 'number') state.loopStart = Math.max(0, savedState.loopStart);
        if (typeof savedState.loopEnd === 'number') state.loopEnd = Math.max(0, savedState.loopEnd);
        if (typeof savedState.macroLoopStart === 'number') state.macroLoopStart = Math.max(0, savedState.macroLoopStart);
        if (typeof savedState.macroLoopEnd === 'number') state.macroLoopEnd = Math.max(0, savedState.macroLoopEnd);

        if (savedState.exportPasses !== undefined) {
            const parsedPasses = parseInt(savedState.exportPasses, 10);
            if (!isNaN(parsedPasses)) state.exportPasses = Math.max(1, Math.min(32, parsedPasses));
        }
        
        if (savedState.instruments) {
            state.instruments = { ...state.instruments, ...savedState.instruments };
        }
        
        state.showManualOnStartup = savedState.showManualOnStartup !== undefined ? Boolean(savedState.showManualOnStartup) : true;
        state.isAdvancedMode = savedState.isAdvancedMode !== undefined ? Boolean(savedState.isAdvancedMode) : true;
        
        if (savedState.volumes) {
            state.volumes = {
                chords: typeof savedState.volumes.chords === 'number' ? savedState.volumes.chords : 0.8,
                bass: typeof savedState.volumes.bass === 'number' ? savedState.volumes.bass : 0.8,
                bassHarmonic: typeof savedState.volumes.bassHarmonic === 'number' ? savedState.volumes.bassHarmonic : 0.0,
                drums: typeof savedState.volumes.drums === 'number' ? savedState.volumes.drums : 0.8
            };
        }
        
        if (savedState.selectedChordIndex !== undefined && savedState.selectedChordIndex !== null) {
            const parsedIndex = parseInt(savedState.selectedChordIndex, 10);
            if (!isNaN(parsedIndex)) state.selectedChordIndex = Math.max(0, parsedIndex);
        }

        // Helper for sanitizing any rhythm pattern
        const sanitizePat = (pat, isDrum = false) => {
            if (!pat) return null;
            if (isDrum) {
                if (!Array.isArray(pat.hits)) return null;
                return {
                    ...pat,
                    isLocalOverride: pat.isLocalOverride !== undefined ? Boolean(pat.isLocalOverride) : true,
                    lengthBeats: typeof pat.lengthBeats === 'number' ? pat.lengthBeats : 4,
                    hits: pat.hits.map(hit => ({
                        ...hit,
                        id: typeof hit.id === 'string' ? hit.id.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 10),
                        time: typeof hit.time !== 'undefined' ? Number(hit.time) : 0,
                        row: typeof hit.row === 'string' ? hit.row : 'kick',
                        velocity: typeof hit.velocity !== 'undefined' ? Number(hit.velocity) : 1.0,
                        probability: typeof hit.probability !== 'undefined' ? Number(hit.probability) : 1.0
                    }))
                };
            } else {
                if (!Array.isArray(pat.instances)) return null;
                return {
                    ...pat,
                    // If a legacy pattern is migrating, preserve it by defaulting to a local override
                    isLocalOverride: pat.isLocalOverride !== undefined ? Boolean(pat.isLocalOverride) : true,
                    transitions: Array.isArray(pat.transitions) ? pat.transitions : [],
                    instances: pat.instances.map(inst => ({
                        ...inst,
                        id: typeof inst.id === 'string' ? inst.id.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 10),
                        startTime: typeof inst.startTime !== 'undefined' ? Number(inst.startTime) : 0,
                        duration: typeof inst.duration !== 'undefined' ? Number(inst.duration) : 1,
                        pitchOffset: typeof inst.pitchOffset !== 'undefined' ? Number(inst.pitchOffset) : 0,
                        isSelected: Boolean(inst.isSelected),
                        probability: typeof inst.probability !== 'undefined' ? Number(inst.probability) : 1.0
                    }))
                };
            }
        };

        // NEW Phase 6 Helper: Sanitize Progression Array
        const sanitizeProgression = (progArr) => {
            if (!Array.isArray(progArr)) return [];
            return progArr.map(item => {
                const chordObj = typeof item === 'string' ? { symbol: item, key: state.baseKey } : { ...item };
                
                // Escape HTML/quotes in symbol to prevent DOM injection
                chordObj.symbol = typeof chordObj.symbol === 'string' ? chordObj.symbol.replace(/[<>"]/g, '').substring(0, 20) : 'I';
                if (chordObj.symbol.startsWith('Oct')) {
                    chordObj.symbol = chordObj.symbol.replace('Oct', 'Dim');
                }

                chordObj.key = typeof chordObj.key === 'number' ? Math.max(0, Math.min(127, chordObj.key)) : state.baseKey;
                chordObj.duration = typeof chordObj.duration !== 'undefined' ? Math.max(1, Math.round(Number(chordObj.duration)) || 2) : 2;
                chordObj.voicingType = typeof item.voicingType === 'string' ? item.voicingType : 'global';
                chordObj.voicing = item.voicing ? { ...item.voicing } : null;

                // Migrate legacy pattern if it exists
                if (chordObj.pattern) {
                    chordObj.chordPattern = chordObj.pattern;
                    delete chordObj.pattern;
                }
                if (typeof item.divisions === 'number') chordObj.divisions = item.divisions;

                chordObj.chordPattern = sanitizePat(chordObj.chordPattern, false) || initChordPattern();
                
                if (!chordObj.bassPattern) {
                    chordObj.bassPattern = JSON.parse(JSON.stringify(chordObj.chordPattern));
                    chordObj.bassPattern.instances.forEach(inst => inst.id = Math.random().toString(36).substring(2, 10));
                } else {
                    chordObj.bassPattern = sanitizePat(chordObj.bassPattern, false) || initChordPattern();
                }

                chordObj.drumPattern = sanitizePat(chordObj.drumPattern, true) || initDrumPattern();

                return chordObj;
            });
        };
        
        // NEW Phase 6 Helper: Sanitize Swaps Maps
        const sanitizeSwaps = (swapsObj) => {
            if (!swapsObj || typeof swapsObj !== 'object') return {};
            const cleanSwaps = {};
            Object.entries(swapsObj).forEach(([k, v]) => {
                const idx = parseInt(k, 10);
                if (!isNaN(idx) && v && typeof v.symbol === 'string') {
                    const swapObj = { ...v };
                    swapObj.symbol = typeof swapObj.symbol === 'string' ? swapObj.symbol.replace(/[<>"]/g, '').substring(0, 20) : 'I';
                    if (swapObj.symbol.startsWith('Oct')) swapObj.symbol = swapObj.symbol.replace('Oct', 'Dim');
                    if (typeof swapObj.key !== 'number') delete swapObj.key;
                    if (typeof swapObj.duration !== 'undefined' && isNaN(Number(swapObj.duration))) delete swapObj.duration;
                    if (typeof swapObj.inversionOffset !== 'number') delete swapObj.inversionOffset;
                    if (typeof swapObj.voicingType !== 'string') delete swapObj.voicingType;
                    if (typeof swapObj.voicing !== 'object') delete swapObj.voicing;
                if (typeof swapObj.divisions === 'number') cleanSwaps[idx].divisions = swapObj.divisions;
                    cleanSwaps[idx] = swapObj;
                }
            });
            return cleanSwaps;
        };

        // 2. Phase 6 Architecture Loading
        if (savedState.sections && typeof savedState.sections === 'object' && Array.isArray(savedState.songSequence)) {
            state.sections = {};
            Object.entries(savedState.sections).forEach(([id, sec]) => {
                state.sections[id] = {
                    id: sec.id || id,
                    name: sec.name || 'Section',
                    progression: sanitizeProgression(sec.progression),
                    globalPatterns: {
                        chordPattern: sanitizePat(sec.globalPatterns?.chordPattern, false) || initChordPattern(),
                        bassPattern: sanitizePat(sec.globalPatterns?.bassPattern, false) || initChordPattern(),
                        drumPattern: sanitizePat(sec.globalPatterns?.drumPattern, true) || initDrumPattern()
                    },
                    loopStart: typeof sec.loopStart === 'number' ? sec.loopStart : 0,
                    loopEnd: typeof sec.loopEnd === 'number' ? sec.loopEnd : (sec.progression ? sec.progression.length : 0),
                    temporarySwaps: sanitizeSwaps(sec.temporarySwaps)
                };
            });
            state.songSequence = savedState.songSequence;
            state.activeSectionId = savedState.activeSectionId && state.sections[savedState.activeSectionId] ? savedState.activeSectionId : state.songSequence[0];
        } else if (Array.isArray(savedState.currentProgression)) {
            // Legacy Migration: Wrap old progression in a new Section
            const legacyProg = sanitizeProgression(savedState.currentProgression);
            const legacyGP = savedState.globalPatterns ? {
                chordPattern: sanitizePat(savedState.globalPatterns.chordPattern, false) || initChordPattern(),
                bassPattern: sanitizePat(savedState.globalPatterns.bassPattern, false) || initChordPattern(),
                drumPattern: sanitizePat(savedState.globalPatterns.drumPattern, true) || initDrumPattern()
            } : initPatternSet();
            
            const legacySwaps = sanitizeSwaps(savedState.temporarySwaps);
            const defaultId = 'sec-' + Math.random().toString(36).substring(2, 10);
            state.sections = {
                [defaultId]: { 
                    id: defaultId, 
                    name: 'Section 1', 
                    progression: legacyProg, 
                    globalPatterns: legacyGP,
                    loopStart: typeof savedState.loopStart === 'number' ? savedState.loopStart : 0,
                    loopEnd: typeof savedState.loopEnd === 'number' ? savedState.loopEnd : legacyProg.length,
                    temporarySwaps: legacySwaps
                }
            };
            state.songSequence = [defaultId];
            state.activeSectionId = defaultId;
        }

        // Establish active pointers
        if (state.sections[state.activeSectionId]) {
            const activeSec = state.sections[state.activeSectionId];
            state.currentProgression = activeSec.progression;
            state.globalPatterns = activeSec.globalPatterns;
            state.loopStart = activeSec.loopStart ?? 0;
            state.loopEnd = activeSec.loopEnd ?? activeSec.progression.length;
            state.temporarySwaps = activeSec.temporarySwaps ?? {};
        }
        
        if (savedState.editorState && savedState.editorState.activeTab) {
            state.editorState.activeTab = savedState.editorState.activeTab;
        }
    }
    applyLoopBounds();
    applyMacroLoopBounds();
}

export function switchActiveSection(sectionId) {
    if (!state.sections[sectionId]) return false;
    
    // Sync outgoing section before swapping
    if (state.activeSectionId && state.sections[state.activeSectionId]) {
        state.sections[state.activeSectionId].loopStart = state.loopStart;
        state.sections[state.activeSectionId].loopEnd = state.loopEnd;
        state.sections[state.activeSectionId].temporarySwaps = state.temporarySwaps;
    }
    
    saveHistoryState();
    state.activeSectionId = sectionId;
    const sec = state.sections[sectionId];
    
    state.currentProgression = sec.progression;
    state.globalPatterns = sec.globalPatterns;
    state.loopStart = sec.loopStart ?? 0;
    state.loopEnd = sec.loopEnd ?? sec.progression.length;
    state.temporarySwaps = sec.temporarySwaps ? structuredClone(sec.temporarySwaps) : {};
    
    state.selectedChordIndex = null;
    
    applyLoopBounds();
    persistAppState();
    return true;
}

// --- Phase 6: Macro-Arrangement Intent Functions ---

export function createAndAppendSection(name) {
    // Sync outgoing section
    if (state.activeSectionId && state.sections[state.activeSectionId]) {
        state.sections[state.activeSectionId].loopStart = state.loopStart;
        state.sections[state.activeSectionId].loopEnd = state.loopEnd;
        state.sections[state.activeSectionId].temporarySwaps = state.temporarySwaps;
    }

    saveHistoryState();
    const currentSec = state.sections[state.activeSectionId];
    const inheritedPatterns = currentSec ? structuredClone(currentSec.globalPatterns) : initPatternSet();
    
    const newId = 'sec-' + Math.random().toString(36).substring(2, 10);
    state.sections[newId] = {
        id: newId,
        name: name,
        progression: [],
        globalPatterns: inheritedPatterns,
        loopStart: 0,
        loopEnd: 0,
        temporarySwaps: {}
    };
    
    state.songSequence.push(newId);
    
    // Inline switch logic to avoid double history saves
    state.activeSectionId = newId;
    state.currentProgression = state.sections[newId].progression;
    state.globalPatterns = state.sections[newId].globalPatterns;
    state.loopStart = 0;
    state.loopEnd = 0;
    state.temporarySwaps = {};
    state.selectedChordIndex = null;
    
    applyLoopBounds();
    applyMacroLoopBounds();
    persistAppState();
    return newId;
}

export function renameSection(sectionId, newName) {
    if (!state.sections[sectionId]) return;
    saveHistoryState();
    state.sections[sectionId].name = newName;
    persistAppState();
}

export function removeSectionFromSequence(index) {
    saveHistoryState();
    state.songSequence.splice(index, 1);
    applyMacroLoopBounds();
    persistAppState();
}

export function appendExistingSection(sectionId, insertIndex = null) {
    saveHistoryState();
    if (insertIndex === null) insertIndex = state.songSequence.length;
    state.songSequence.splice(insertIndex, 0, sectionId);
    applyMacroLoopBounds();
    persistAppState();
}

export function reorderSequence(oldIndex, newIndex) {
    saveHistoryState();
    const item = state.songSequence.splice(oldIndex, 1)[0];
    state.songSequence.splice(newIndex, 0, item);
    applyMacroLoopBounds();
    persistAppState();
}

export function inheritSectionData(targetId, sourceId) {
    if (!state.sections[targetId] || !state.sections[sourceId]) return;
    saveHistoryState();
    
    const sourceSec = state.sections[sourceId];
    
    // Deep copy progression and generate fresh IDs to detach rhythm slices
    state.sections[targetId].progression = structuredClone(sourceSec.progression);
    state.sections[targetId].progression.forEach(chord => {
        if (chord.chordPattern && chord.chordPattern.instances) chord.chordPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (chord.bassPattern && chord.bassPattern.instances) chord.bassPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (chord.drumPattern && chord.drumPattern.hits) chord.drumPattern.hits.forEach(h => h.id = Math.random().toString(36).substring(2, 10));
    });
    
    // Copy global patterns
    state.sections[targetId].globalPatterns = structuredClone(sourceSec.globalPatterns);
    
    // Inherit bounds and swaps!
    state.sections[targetId].loopStart = sourceSec.loopStart ?? 0;
    state.sections[targetId].loopEnd = sourceSec.loopEnd ?? state.sections[targetId].progression.length;
    state.sections[targetId].temporarySwaps = sourceSec.temporarySwaps ? structuredClone(sourceSec.temporarySwaps) : {};
    
    // Sync pointers if we are inheriting into the active section
    if (state.activeSectionId === targetId) {
        state.currentProgression = state.sections[targetId].progression;
        state.globalPatterns = state.sections[targetId].globalPatterns;
        state.loopStart = state.sections[targetId].loopStart;
        state.loopEnd = state.sections[targetId].loopEnd;
        state.temporarySwaps = state.sections[targetId].temporarySwaps;
    }
    
    applyLoopBounds();
    persistAppState();
}