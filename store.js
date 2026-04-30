import { saveState, loadState } from './storage.js';
import { calculateLoopBounds } from './stateUtils.js';
import { initChordPattern, initDrumPattern, initPatternSet } from './patternUtils.js';

export const state = {
    currentProgression: [],
    temporarySwaps: {}, // Map of index -> temporary chord string (e.g. { 1: 'vi' })
    history: [], // Stores progression snapshots for Undo
    baseKey: 60, // C4
    bpm: 120,
    isLooping: true,
    useVoiceLeading: true,
    globalVoicing: 'auto', // 'auto', 'close', 'spread', 'quartal'
    loopStart: 0,
    loopEnd: 0,
    theme: 'light',
    mode: 'major',
    exportPasses: 1,
    selectedChordIndex: null,
    globalPatterns: initPatternSet()
};

// Resolves the progression with any active temporary swaps applied
export function getActiveProgression() {
    return state.currentProgression.map((chord, index) => {
        if (state.temporarySwaps[index] !== undefined) {
            // The swap object is an overlay. Start with the original chord's full properties
            // (like pattern, voicing) and let the swap object override what it needs to (symbol, key, etc.).
            const swap = state.temporarySwaps[index];
            return {
                ...chord,
                ...swap
            };
        }
        return chord;
    });
}

export function applyLoopBounds() {
    const bounds = calculateLoopBounds(state.currentProgression.length, state.loopStart, state.loopEnd);
    state.loopStart = bounds.start;
    state.loopEnd = bounds.end;
}

// --- History & Undo ---
export function saveHistoryState() {
    state.history.push({
        currentProgression: JSON.parse(JSON.stringify(state.currentProgression)),
        temporarySwaps: JSON.parse(JSON.stringify(state.temporarySwaps)),
        globalPatterns: JSON.parse(JSON.stringify(state.globalPatterns)),
        loopStart: state.loopStart,
        loopEnd: state.loopEnd
    });
    if (state.history.length > 50) state.history.shift(); // Max 50 undos
}

export function undoState() {
    if (state.history.length === 0) return false;
    const previousState = state.history.pop();
    state.currentProgression = previousState.currentProgression;
    state.temporarySwaps = previousState.temporarySwaps;
    if (previousState.globalPatterns) state.globalPatterns = previousState.globalPatterns;
    state.loopStart = previousState.loopStart;
    state.loopEnd = previousState.loopEnd;
    applyLoopBounds();
    persistAppState();
    return true;
}

export function persistAppState() {
    saveState(state);
}

export function loadAndApplyInitialState() {
    const savedState = loadState();
    if (savedState) {
        // 1. Sanitize Primitives
        if (typeof savedState.baseKey === 'number') state.baseKey = Math.max(0, Math.min(127, savedState.baseKey));
        
        if (savedState.bpm !== undefined) {
            const parsedBpm = parseInt(savedState.bpm, 10);
            if (!isNaN(parsedBpm)) state.bpm = Math.max(40, Math.min(300, parsedBpm));
        }
        
        state.isLooping = Boolean(savedState.isLooping ?? savedState.loop ?? state.isLooping);
        state.useVoiceLeading = Boolean(savedState.useVoiceLeading ?? savedState.voiceLeading ?? state.useVoiceLeading);
        state.globalVoicing = savedState.globalVoicing || 'auto';
        state.theme = savedState.theme === 'dark' ? 'dark' : 'light';
        state.mode = savedState.mode === 'minor' ? 'minor' : 'major';
        
        if (typeof savedState.loopStart === 'number') state.loopStart = Math.max(0, savedState.loopStart);
        if (typeof savedState.loopEnd === 'number') state.loopEnd = Math.max(0, savedState.loopEnd);

        if (savedState.exportPasses !== undefined) {
            const parsedPasses = parseInt(savedState.exportPasses, 10);
            if (!isNaN(parsedPasses)) state.exportPasses = Math.max(1, Math.min(32, parsedPasses));
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
                        velocity: typeof hit.velocity !== 'undefined' ? Number(hit.velocity) : 1.0
                    }))
                };
            } else {
                if (!Array.isArray(pat.instances)) return null;
                return {
                    ...pat,
                    // If a legacy pattern is migrating, preserve it by defaulting to a local override
                    isLocalOverride: pat.isLocalOverride !== undefined ? Boolean(pat.isLocalOverride) : true,
                    instances: pat.instances.map(inst => ({
                        ...inst,
                        id: typeof inst.id === 'string' ? inst.id.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 16) : Math.random().toString(36).substring(2, 10),
                        startTime: typeof inst.startTime !== 'undefined' ? Number(inst.startTime) : 0,
                        duration: typeof inst.duration !== 'undefined' ? Number(inst.duration) : 1,
                        isSelected: Boolean(inst.isSelected)
                    }))
                };
            }
        };

        // 2. Sanitize Progression Array (Prevent XSS and malformed structures)
        if (Array.isArray(savedState.currentProgression)) {
            state.currentProgression = savedState.currentProgression.map(item => {
                const chordObj = typeof item === 'string' ? { symbol: item, key: state.baseKey } : { ...item };
                
                // Escape HTML/quotes in symbol to prevent DOM injection
                chordObj.symbol = typeof chordObj.symbol === 'string' ? chordObj.symbol.replace(/[<>"]/g, '').substring(0, 20) : 'I';
                if (chordObj.symbol.startsWith('Oct')) {
                    chordObj.symbol = chordObj.symbol.replace('Oct', 'Dim');
                }

                chordObj.key = typeof chordObj.key === 'number' ? Math.max(0, Math.min(127, chordObj.key)) : state.baseKey;
                chordObj.duration = typeof chordObj.duration !== 'undefined' ? Math.max(0.25, Number(chordObj.duration) || 2) : 2;
                chordObj.voicingType = typeof item.voicingType === 'string' ? item.voicingType : 'global';
                chordObj.voicing = item.voicing ? { ...item.voicing } : null;

                // Migrate legacy pattern if it exists
                if (chordObj.pattern) {
                    chordObj.chordPattern = chordObj.pattern;
                    delete chordObj.pattern;
                }

                chordObj.chordPattern = sanitizePat(chordObj.chordPattern, false) || initChordPattern();
                
                if (!chordObj.bassPattern) {
                    chordObj.bassPattern = JSON.parse(JSON.stringify(chordObj.chordPattern));
                    chordObj.bassPattern.instances.forEach(inst => inst.id = Math.random().toString(36).substring(2, 10));
                } else {
                    chordObj.bassPattern = sanitizePat(chordObj.bassPattern, false) || initChordPattern();
                }

                chordObj.drumPattern = sanitizePat(chordObj.drumPattern, true) || initChordPattern();

                return chordObj;
            });
        }

        // 3. Sanitize Temporary Swaps
        if (savedState.temporarySwaps && typeof savedState.temporarySwaps === 'object') {
            state.temporarySwaps = {};
            Object.entries(savedState.temporarySwaps).forEach(([k, v]) => {
                const idx = parseInt(k, 10);
                if (!isNaN(idx) && v && typeof v.symbol === 'string') {
                    const swapObj = { ...v };
                    swapObj.symbol = swapObj.symbol.replace(/[<>"]/g, '').substring(0, 20);
                    if (swapObj.symbol.startsWith('Oct')) {
                        swapObj.symbol = swapObj.symbol.replace('Oct', 'Dim');
                    }
                    // Only keep valid properties in the swap object
                    if (typeof swapObj.key !== 'number') delete swapObj.key;
                    if (typeof swapObj.duration !== 'undefined' && isNaN(Number(swapObj.duration))) delete swapObj.duration;
                    if (typeof swapObj.inversionOffset !== 'number') delete swapObj.inversionOffset;
                    if (typeof swapObj.voicingType !== 'string') delete swapObj.voicingType;
                    if (typeof swapObj.voicing !== 'object') delete swapObj.voicing;

                    state.temporarySwaps[idx] = swapObj;
                }
            });
        }

        // 4. Sanitize Global Patterns Array
        if (savedState.globalPatterns) {
            state.globalPatterns = {
                chordPattern: sanitizePat(savedState.globalPatterns.chordPattern, false) || initChordPattern(),
                bassPattern: sanitizePat(savedState.globalPatterns.bassPattern, false) || initChordPattern(),
                drumPattern: sanitizePat(savedState.globalPatterns.drumPattern, true) || initDrumPattern()
            };
        }
    }
    applyLoopBounds();
}