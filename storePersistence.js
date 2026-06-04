import { loadState } from './storage.js';
import { initChordPattern, initDrumPattern, initPatternSet } from './patternUtils.js';
import { getChordNotes } from './theory.js';
import { identifyChord } from './chordAnalyzer.js';
import { state, applyLoopBounds, applyMacroLoopBounds, analyseChordsOnLoad } from './store.js';

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
        state.activeEmotion = savedState.activeEmotion || 'mournful';
        state.generatorPersona = savedState.generatorPersona || 'normal';
        state.syncTransitionsToDrums = savedState.syncTransitionsToDrums !== undefined ? Boolean(savedState.syncTransitionsToDrums) : true;
        state.snapTransitionsToScale = savedState.snapTransitionsToScale !== undefined ? Boolean(savedState.snapTransitionsToScale) : true;
        
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
                    isLocalOverride: pat.isLocalOverride !== undefined ? Boolean(pat.isLocalOverride) : false,
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
    
    // One-time load-time chord symbol re-analysis
    if (analyseChordsOnLoad && state.divisions === 12) {
        Object.values(state.sections).forEach(sec => {
            if (sec.progression) {
                sec.progression.forEach((chord, index) => {
                    const activeChord = sec.temporarySwaps && sec.temporarySwaps[index] 
                        ? { ...chord, ...sec.temporarySwaps[index] } 
                        : chord;
                    const baseKey = activeChord.key !== undefined ? activeChord.key : (state.baseKey !== undefined ? state.baseKey : 60);
                    const divisions = activeChord.divisions || state.divisions || 12;
                    const originalNotes = getChordNotes(activeChord.symbol, baseKey, divisions);
                    if (originalNotes) {
                        const pat = activeChord.chordPattern;
                        if (pat && pat.instances && pat.instances.length > 0) {
                            const firstInst = pat.instances[0];
                            const modifiedNotes = originalNotes.map((n, i) => n + (firstInst.pitchOffsets?.[i] || firstInst.pitchOffset || 0));
                            const newSymbol = identifyChord(modifiedNotes, state.baseKey);
                            
                            if (newSymbol && newSymbol !== activeChord.symbol) {
                                if (sec.temporarySwaps && sec.temporarySwaps[index]) {
                                    sec.temporarySwaps[index].symbol = newSymbol;
                                } else {
                                    sec.temporarySwaps = sec.temporarySwaps || {};
                                    sec.temporarySwaps[index] = { symbol: newSymbol };
                                }
                                
                                const newNotes = getChordNotes(newSymbol, baseKey, divisions);
                                const newOffsets = newNotes ? newNotes.map(() => 0) : [];
                                pat.instances.forEach(inst => {
                                    inst.pitchOffsets = newOffsets;
                                    inst.pitchOffset = 0;
                                });
                            }
                        }
                    }
                });
            }
        });
        // Sync the active section pointers again after potential swaps
        if (state.sections[state.activeSectionId]) {
            const activeSec = state.sections[state.activeSectionId];
            state.currentProgression = activeSec.progression;
            state.temporarySwaps = activeSec.temporarySwaps ?? {};
        }
    }
    
    if (savedState.editorState) {
        if (typeof savedState.editorState.chordChooserCategoryPage === 'number') {
            state.editorState.chordChooserCategoryPage = savedState.editorState.chordChooserCategoryPage;
        }
        if (typeof savedState.editorState.inspectorCategoryPage === 'number') {
            state.editorState.inspectorCategoryPage = savedState.editorState.inspectorCategoryPage;
        }
        if (savedState.editorState.inspectorActiveEmotion !== undefined) {
            state.editorState.inspectorActiveEmotion = savedState.editorState.inspectorActiveEmotion;
        }
        if (savedState.editorState.isAuditionEnabled !== undefined) {
            state.editorState.isAuditionEnabled = Boolean(savedState.editorState.isAuditionEnabled);
        }
        if (savedState.editorState.activeBuilderTab !== undefined) {
            state.editorState.activeBuilderTab = savedState.editorState.activeBuilderTab;
        }
    }

    applyLoopBounds();
    applyMacroLoopBounds();
}
