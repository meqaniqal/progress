import { resolvePattern } from './patternResolver.js';
import { getAudioCurrentTime, playTone, initAudio, midiToFreq } from './synth.js';
import { getChordNotes } from './theory.js';
import { CONFIG } from './config.js';
import { GRID_STEPS } from './rhythmConfig.js';
import { initRhythmControls } from './rhythmControls.js';
import { renderRhythmTimeline } from './rhythmRenderer.js';
import { initTimelineInteractions } from './timelineEditor.js';
import { initDrumInteractions, highlightDrumHit } from './drumEditor.js';

export { renderRhythmTimeline, highlightDrumHit };

export let app = {}; // Stores references to global state and injected callbacks

export const editorState = new Proxy({}, {
    get(target, prop) {
        return app.state?.editorState ? app.state.editorState[prop] : undefined;
    },
    set(target, prop, value) {
        if (app.updateEditorState) app.updateEditorState({ [prop]: value });
        return true;
    }
});

export function hasValidContext() {
    if (editorState.isGlobal) return true;
    return editorState.activeIndex !== null && app.state.currentProgression[editorState.activeIndex] != null;
}

export function getCurrentPattern() {
    if (editorState.isGlobal) return app.state.globalPatterns[editorState.activeTab];
    if (editorState.activeIndex === null) return null;
    const chord = app.state.currentProgression[editorState.activeIndex];
    if (!chord) return null;
    
    const localPat = chord[editorState.activeTab];
    if (localPat && !localPat.isLocalOverride) {
        const globalPat = app.state.globalPatterns[editorState.activeTab];
        const beats = Number(chord.duration) || 4;
        return resolvePattern(globalPat, true, beats, localPat.inheritMode);
    }
    return localPat;
}

export function auditionSlicePitch(pitchOffset = 0) {
    if (!hasValidContext()) return;
    initAudio();
    
    // Merge active temporary swaps so auditioning matches the true playback root
    const baseChord = app.state.currentProgression[editorState.activeIndex];
    const swap = app.state.temporarySwaps ? app.state.temporarySwaps[editorState.activeIndex] : null;
    const chord = swap ? { ...baseChord, ...swap } : baseChord;
    
    if (!chord) return;
    const notes = getChordNotes(chord.symbol, chord.key);
    if (!notes) return;
    
    const now = getAudioCurrentTime();
    const duration = 0.4; // Short, punchy audition
    
    // Play chord pad and bass note together
    notes.forEach(n => playTone(midiToFreq(n - 12), now, duration, 'sawtooth'));
    const finalBassNote = notes[0] + CONFIG.BASS_OCTAVE_DROP + pitchOffset;
    playTone(midiToFreq(finalBassNote), now, duration, 'sine');
    playTone(midiToFreq(finalBassNote), now, duration, 'sawtooth-bass');
}

export function setCurrentPattern(newPattern, markAsOverride = true) {
    if (app.updatePattern) {
        app.updatePattern(editorState.activeTab, newPattern, editorState.activeIndex, editorState.isGlobal, markAsOverride);
    }
}

export function getTimelineRect() {
    const timeline = document.getElementById('rhythm-timeline');
    const drumLines = timeline.querySelector('.drum-grid-lines');
    return drumLines ? drumLines.getBoundingClientRect() : timeline.getBoundingClientRect();
}

export function getActiveGridValue() {
    if (!editorState.isGridEnabled) return 0;
    const baseValue = GRID_STEPS[editorState.gridStepIndex].value;
    return baseValue * (4 / getDurationBeats());
}

export function getDurationBeats() {
    if (editorState.isGlobal) {
        if (editorState.activeTab === 'drumPattern') {
            const pat = app.state.globalPatterns.drumPattern;
            return pat ? (pat.lengthBeats || 4) : 4;
        }
        const pat = app.state.globalPatterns[editorState.activeTab];
        return pat && pat.lengthBeats ? pat.lengthBeats : 2;
    }
    if (editorState.activeIndex === null) return 2;
    const chord = app.state.currentProgression[editorState.activeIndex];
    return chord ? (Number(chord.duration) || 2) : 2;
}

export function initRhythmEditor(config) {
    app = config;

    initRhythmControls();
    const timeline = document.getElementById('rhythm-timeline');
    if (timeline) {
        initTimelineInteractions(timeline);
        initDrumInteractions(timeline);
    }
}

export function openRhythmEditor(index) {
    if (editorState.activeIndex !== index) {
        editorState.justPushedToGlobalIndex = null;
    }
    editorState.activeIndex = index;
    
    const chord = app.state.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    if (editorState.activeTab === 'drumPattern' && (!chord.drumPattern || !chord.drumPattern.isLocalOverride)) {
        editorState.isGlobal = true;
    }

    renderRhythmTimeline();
    
    const panel = document.getElementById('rhythm-editor-panel');
    panel.style.display = 'block';
}

export function closeRhythmEditor() {
    editorState.activeIndex = null;
    editorState.activeOverlayId = null;
    editorState.justPushedToGlobalIndex = null;
    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.style.display = 'none';

        const builderPanel = document.getElementById('builder-panel');
        if (builderPanel) builderPanel.style.display = 'block';
        const undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.style.display = '';
}