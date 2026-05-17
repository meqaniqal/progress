import { state, getActiveProgression } from './store.js';
import { resolvePattern } from './patternResolver.js';

export function getExportState(isMacro) {
    const exportState = JSON.parse(JSON.stringify(state)); // Deep copy
    
    if (isMacro && exportState.songSequence.length > 0) {
        let flattenedProgression = [];
        let macStart = exportState.macroLoopStart ?? 0;
        let macEnd = exportState.macroLoopEnd > 0 ? exportState.macroLoopEnd : exportState.songSequence.length;
        if (macEnd > exportState.songSequence.length) macEnd = exportState.songSequence.length;
        

        for (let i = macStart; i < macEnd; i++) {
            const sectionId = exportState.songSequence[i];
            const section = exportState.sections[sectionId];
            if (!section) continue;
            
            let secStart = (sectionId === state.activeSectionId) ? state.loopStart : (section.loopStart ?? 0);
            let secEnd = (sectionId === state.activeSectionId) ? state.loopEnd : (section.loopEnd ?? section.progression.length);
            
            const slicedProg = section.progression.slice(secStart, secEnd);
            
            let absBeatStart = 0;

            const bakedProg = slicedProg.map((chord, sliceIdx) => {
                const originalIdx = secStart + sliceIdx;
                let swap = section.temporarySwaps?.[originalIdx];
                if (sectionId === state.activeSectionId && state.temporarySwaps?.[originalIdx]) {
                    swap = state.temporarySwaps[originalIdx];
                }
                const mergedChord = swap ? { ...chord, ...swap } : { ...chord };
                if (sliceIdx === 0) mergedChord._isSectionStart = true;
                
                const beats = Number(mergedChord.duration) || 2;
                
                let isGlobalDrum = false;
                let drumPatForDucking = mergedChord.drumPattern;
                if (drumPatForDucking && !drumPatForDucking.isLocalOverride && section.globalPatterns && section.globalPatterns.drumPattern) {
                    drumPatForDucking = section.globalPatterns.drumPattern;
                    isGlobalDrum = true;
                }
                
                // Bake Chords and Bass (Relative 0.0 to 1.0)
                if (mergedChord.chordPattern && !mergedChord.chordPattern.isLocalOverride) {
                    mergedChord.chordPattern = resolvePattern(
                        section.globalPatterns.chordPattern,
                        true,
                        beats,
                        null,
                        drumPatForDucking,
                        isGlobalDrum,
                        absBeatStart
                    );
                    mergedChord.chordPattern.isLocalOverride = true;
                }
                if (mergedChord.bassPattern && !mergedChord.bassPattern.isLocalOverride) {
                    mergedChord.bassPattern = resolvePattern(
                        section.globalPatterns.bassPattern,
                        true,
                        beats,
                        null,
                        drumPatForDucking,
                        isGlobalDrum,
                        absBeatStart
                    );
                    mergedChord.bassPattern.isLocalOverride = true;
                }

                // Bake Drums (Absolute continuous timeline converted to localized chord bounds)
                if (mergedChord.drumPattern && !mergedChord.drumPattern.isLocalOverride) {
                    const globalDrumPat = section.globalPatterns.drumPattern;
                    const gLength = globalDrumPat.lengthBeats || 4;
                    const localHits = [];
                    
                    if (globalDrumPat.hits) {
                        for (const hit of globalDrumPat.hits) {
                            if (hit.time >= 1.0) continue;
                            const hitBeatOffset = hit.time * gLength;
                            let loopStartBeat = Math.floor(absBeatStart / gLength) * gLength;
                            
                            let absoluteHitBeat = Math.round((loopStartBeat + hitBeatOffset) * 10000) / 10000;
                            let absBeatStartRounded = Math.round(absBeatStart * 10000) / 10000;
                            let chordEndBeatRounded = Math.round((absBeatStart + beats) * 10000) / 10000;
                            
                            if (absoluteHitBeat < absBeatStartRounded) absoluteHitBeat += gLength;
                            
                            while (absoluteHitBeat < chordEndBeatRounded) {
                                const beatWithinChord = absoluteHitBeat - absBeatStartRounded;
                                localHits.push({ ...hit, time: beatWithinChord / beats });
                                absoluteHitBeat += gLength;
                                absoluteHitBeat = Math.round(absoluteHitBeat * 10000) / 10000;
                            }
                        }
                    }
                    mergedChord.drumPattern = { isLocalOverride: true, hits: localHits };
                }
                
                absBeatStart += beats;
                return mergedChord;
            });
            
            flattenedProgression.push(...bakedProg);
        }
        
        exportState.currentProgression = flattenedProgression;
        exportState.loopStart = 0;
        exportState.loopEnd = flattenedProgression.length;
        exportState.temporarySwaps = {}; // Clear this so local swaps don't falsely overwrite global macro indices!
    } else {
        exportState.currentProgression = getActiveProgression();
    }
    
    return exportState;
}