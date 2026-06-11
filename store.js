import { saveState, loadState, clearState } from './storage.js';
import { calculateLoopBounds, calculateSwapsOnRemove, calculateSwapsOnInsert, calculateSwapsOnReorder } from './stateUtils.js';
import { initChordPattern, initDrumPattern, initPatternSet } from './patternUtils.js';
import { getChordNotes, getEffectiveTuning } from './theory.js';
import { identifyChord } from './chordAnalyzer.js';
import { DEFAULT_DRUM_PARAMS } from './rhythmConfig.js';

export let analyseChordsOnLoad = true;

export const state = {
    sections: {}, // Map of sectionId -> { id, name, progression, globalPatterns }
    songSequence: [], // Array of sectionIds
    activeSectionId: null,
    currentProgression: [],
    customChords: [], // Up to 3 user-designed custom chords
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
    customTuning: null, // Custom loaded .scl/.tun file mapping/parameters
    importedTunings: [], // List of imported custom tuning objects
    previousTuning: '12', // Remembers previous tuning choice to restore on prune
    tuningImportSource: 'server', // 'local' or 'server'
    swing: 0.0, // Swing amount (0 to 1)
    groovePreset: 'none', // 'none', 'swing', 'shuffle', 'latin', 'african', 'custom'
    grooveTemplate: null, // Array of { step, offset, velocityScale } for custom groove
    loopStart: 0,
    loopEnd: 0,
    macroLoopStart: 0,
    macroLoopEnd: 0,
    theme: 'dark',
    mode: 'major',
    activeEmotion: 'mournful',
    generatorPersona: 'normal',
    syncTransitionsToDrums: true,
    snapTransitionsToScale: true,
    exportPasses: 1,
    volumes: { chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8, melody: 0.8, countermelody: 0.0 }, // 0.8 provides headroom for mixing
    instruments: { chords: 'sawtooth', bass: 'sine', bassSecondary: 'sawtooth', melody: 'sine', countermelody: 'sine' },
    melodySettings: {
        enabled: false,
        genre: 'none',
        motifRecurrence: 0.5,
        variationDepth: 0.5,
        density: 0.5,
        restProbability: 0.3,
        ornamentIntensity: 0.5,
        countermelodyEnabled: false,
        countermelodyMode: 'contrary',
        behaviorDuringArp: 'simplify',
        behaviorDuringTransitions: 'simplify',
        tensionCurve: 'arch',
        seedSource: 'procedural',
        activeMotifId: 'preset-rise',
        midiExtractionMode: 'highest'
    },
    userMotifs: [
        {
            id: 'preset-rise',
            name: 'Arpeggiated Rise',
            notes: [
                { time: 0.0, duration: 0.5, pitchOffset: 0, voiceIndex: 0 },
                { time: 0.5, duration: 0.5, pitchOffset: 2, voiceIndex: 0 },
                { time: 1.0, duration: 0.5, pitchOffset: 4, voiceIndex: 0 },
                { time: 1.5, duration: 0.5, pitchOffset: 7, voiceIndex: 0 }
            ]
        },
        {
            id: 'preset-dip',
            name: 'Passing Tone Dip',
            notes: [
                { time: 0.0, duration: 0.5, pitchOffset: 4, voiceIndex: 0 },
                { time: 0.5, duration: 0.5, pitchOffset: 3, voiceIndex: 0 },
                { time: 1.0, duration: 0.5, pitchOffset: 2, voiceIndex: 0 },
                { time: 1.5, duration: 0.5, pitchOffset: 0, voiceIndex: 0 }
            ]
        }
    ],
    bassDrive: 1.0,
    bassHarmonicDrive: 1.0,
    bassAdsr: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0, octaveDrop: false },
    chordAdsr: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 },
    melodyAdsr: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 },
    countermelodyAdsr: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 },
    bassKsDamping: 400,
    bassKsDecay: 0.95,
    drumParams: structuredClone(DEFAULT_DRUM_PARAMS),
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
        emotionPage: 0,
        swapPage: 0,
        chordChooserCategoryPage: 0,
        inspectorCategoryPage: 0,
        inspectorActiveEmotion: 'substitutes',
        isAuditionEnabled: true,
        activeBuilderTab: 'standard'
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
    
    const customChord = state.customChords.find(c => c.symbol === numeral);
    if (customChord) {
        state.currentProgression.push({
            symbol: customChord.symbol,
            key: targetKey,
            customNotes: [...customChord.customNotes],
            ...initPatternSet(),
            duration: 2
        });
    } else {
        state.currentProgression.push({ symbol: numeral, key: targetKey, ...initPatternSet(), duration: 2 });
    }
    
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

export function swapChord(index, altSymbol, originalSymbol, targetKey) {
    saveHistoryState();
    if (altSymbol === originalSymbol) {
        delete state.temporarySwaps[index];
    } else {
        const swapData = { symbol: altSymbol };
        if (targetKey !== undefined) {
            swapData.key = targetKey;
        }
        const customChord = state.customChords.find(c => c.symbol === altSymbol);
        if (customChord) {
            swapData.customNotes = [...customChord.customNotes];
        }
        state.temporarySwaps[index] = swapData;
    }
    persistAppState();
}

export function stepInversion(index, direction) {
    saveHistoryState();
    const chordToModify = getActiveProgression()[index];
    const currentOffset = chordToModify.inversionOffset ?? 0;
    const newOffset = currentOffset + direction;

    let symbol = chordToModify.symbol;
    const tuning = getEffectiveTuning(symbol, chordToModify.divisions || state.divisions);
    
    if (tuning.periodSize > 14) {
        const notes = getChordNotes(symbol, chordToModify.key, chordToModify.divisions || state.divisions);
        const numNotes = notes ? notes.length : 3;
        const baseSymbol = symbol.replace(/[+-]+$/, '');
        if (newOffset % numNotes === 0) {
            symbol = baseSymbol;
        } else {
            symbol = baseSymbol + (newOffset > 0 ? '+' : '-');
        }
    }

    if (state.temporarySwaps[index]) {
        state.temporarySwaps[index] = { ...state.temporarySwaps[index], inversionOffset: newOffset, symbol };
    } else {
        state.currentProgression[index].inversionOffset = newOffset;
        state.currentProgression[index].symbol = symbol;
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
    
    const customChord = state.customChords.find(c => c.symbol === sourceChord);
    if (customChord) {
        state.currentProgression.splice(insertIndex, 0, {
            symbol: customChord.symbol,
            key: sourceKey,
            customNotes: [...customChord.customNotes],
            ...initPatternSet(),
            duration: 2
        });
    } else {
        state.currentProgression.splice(insertIndex, 0, { symbol: sourceChord, key: sourceKey, ...initPatternSet(), duration: 2 });
    }
    
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

    const originalLoopEnd = state.loopEnd;

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

    if (insertIndex === originalLoopEnd) {
        state.loopEnd = originalLoopEnd + shiftAmt;
    } else if (newLoopStart !== null && newLoopEnd !== null) {
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
    if (typeof window !== 'undefined') {
        window.__customChords = state.customChords;
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
    state.customChords = [];
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
    state.activeEmotion = 'mournful';
    state.generatorPersona = 'normal';
    state.syncTransitionsToDrums = true;
    state.snapTransitionsToScale = true;
    state.exportPasses = 1;
    state.tuningImportSource = 'server';
    state.swing = 0.0;
    state.groovePreset = 'none';
    state.grooveTemplate = null;
    state.volumes = { chords: 0.8, bass: 0.8, bassHarmonic: 0.0, drums: 0.8, melody: 0.8, countermelody: 0.0 };
    state.instruments = { chords: 'sawtooth', bass: 'sine', bassSecondary: 'sawtooth', melody: 'sine', countermelody: 'sine' };
    state.melodySettings = {
        enabled: false,
        genre: 'none',
        motifRecurrence: 0.5,
        variationDepth: 0.5,
        density: 0.5,
        restProbability: 0.3,
        ornamentIntensity: 0.5,
        countermelodyEnabled: false,
        countermelodyMode: 'contrary',
        behaviorDuringArp: 'simplify',
        behaviorDuringTransitions: 'simplify',
        tensionCurve: 'arch',
        seedSource: 'procedural',
        activeMotifId: 'preset-rise',
        midiExtractionMode: 'highest'
    };
    state.userMotifs = [
        {
            id: 'preset-rise',
            name: 'Arpeggiated Rise',
            notes: [
                { time: 0.0, duration: 0.5, pitchOffset: 0, voiceIndex: 0 },
                { time: 0.5, duration: 0.5, pitchOffset: 2, voiceIndex: 0 },
                { time: 1.0, duration: 0.5, pitchOffset: 4, voiceIndex: 0 },
                { time: 1.5, duration: 0.5, pitchOffset: 7, voiceIndex: 0 }
            ]
        },
        {
            id: 'preset-dip',
            name: 'Passing Tone Dip',
            notes: [
                { time: 0.0, duration: 0.5, pitchOffset: 4, voiceIndex: 0 },
                { time: 0.5, duration: 0.5, pitchOffset: 3, voiceIndex: 0 },
                { time: 1.0, duration: 0.5, pitchOffset: 2, voiceIndex: 0 },
                { time: 1.5, duration: 0.5, pitchOffset: 0, voiceIndex: 0 }
            ]
        }
    ];
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
        justPushedToGlobalIndex: null,
        emotionPage: 0,
        swapPage: 0,
        chordChooserCategoryPage: 0,
        inspectorCategoryPage: 0,
        inspectorActiveEmotion: 'substitutes',
        isAuditionEnabled: false
    };
}

export { loadAndApplyInitialState } from './storePersistence.js';

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
    
    // Smart Inheritance Heuristic: Inherit global patterns only if they are uniform across all existing sections.
    let inheritedPatterns = initPatternSet();
    if (currentSec) {
        const sectionsArr = Object.values(state.sections);
        let uniformChords = true;
        let uniformBass = true;
        let uniformDrums = true;
        
        if (sectionsArr.length > 1) {
            const stripPat = (p) => {
                if (!p) return null;
                const clone = structuredClone(p);
                if (clone.instances) clone.instances.forEach(i => delete i.id);
                if (clone.hits) clone.hits.forEach(h => delete h.id);
                return clone;
            };
            
            const baseChords = JSON.stringify(stripPat(sectionsArr[0].globalPatterns.chordPattern));
            const baseBass = JSON.stringify(stripPat(sectionsArr[0].globalPatterns.bassPattern));
            const baseDrums = JSON.stringify(stripPat(sectionsArr[0].globalPatterns.drumPattern));
            
            for (let i = 1; i < sectionsArr.length; i++) {
                const p = sectionsArr[i].globalPatterns;
                if (uniformChords && JSON.stringify(stripPat(p.chordPattern)) !== baseChords) uniformChords = false;
                if (uniformBass && JSON.stringify(stripPat(p.bassPattern)) !== baseBass) uniformBass = false;
                if (uniformDrums && JSON.stringify(stripPat(p.drumPattern)) !== baseDrums) uniformDrums = false;
            }
        }
        
        const freshPatterns = initPatternSet();
        inheritedPatterns = {
            chordPattern: uniformChords ? structuredClone(currentSec.globalPatterns.chordPattern) : freshPatterns.chordPattern,
            bassPattern: uniformBass ? structuredClone(currentSec.globalPatterns.bassPattern) : freshPatterns.bassPattern,
            drumPattern: uniformDrums ? structuredClone(currentSec.globalPatterns.drumPattern) : { ...freshPatterns.drumPattern, lengthBeats: currentSec.globalPatterns.drumPattern.lengthBeats || 4 }
        };
        
        // Ensure newly inherited instances have unique IDs to prevent reference bugs
        if (inheritedPatterns.chordPattern.instances) inheritedPatterns.chordPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (inheritedPatterns.bassPattern.instances) inheritedPatterns.bassPattern.instances.forEach(i => i.id = Math.random().toString(36).substring(2, 10));
        if (inheritedPatterns.drumPattern.hits) inheritedPatterns.drumPattern.hits.forEach(h => h.id = Math.random().toString(36).substring(2, 10));
    }
    
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