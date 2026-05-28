import { resolvePattern } from './patternResolver.js';
import { getAudioCurrentTime, playTone, initAudio, midiToFreq } from './synth.js';
import { getChordNotes, segmentMicrotonalCluster, snapToGrid, getEffectiveTuning, getBassNote, getPitchEditorTuning, getPlayableNotes } from './theory.js';
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

export function auditionSlicePitch(pitchOffset = 0, pitchOffsets = []) {
    if (!hasValidContext()) return;
    initAudio();
    
    // Merge active temporary swaps so auditioning matches the true playback root
    const mockProg = app.state.currentProgression.map((c, i) => {
        const swap = app.state.temporarySwaps ? app.state.temporarySwaps[i] : null;
        return swap ? { ...c, ...swap } : c;
    });
    
    const chord = mockProg[editorState.activeIndex];
    if (!chord) return;
    const tuning = getEffectiveTuning(chord.symbol, chord.divisions || app.state.divisions || 12);
    
    const allPlayable = getPlayableNotes(mockProg, app.state);
    const notes = allPlayable[editorState.activeIndex];
    if (!notes) return;
    
    const now = getAudioCurrentTime();
    const duration = 0.4; // Short, punchy audition
    
    const panL = app.state.autoPanLeading !== false ? -0.75 : 0;
    const panR = app.state.autoPanLeading !== false ? 0.75 : 0;

    const chordInst = app.state.instruments && app.state.instruments.chords ? app.state.instruments.chords : 'sawtooth';
    const bassInst = app.state.instruments && app.state.instruments.bass ? app.state.instruments.bass : 'sine';
    
    // Play chord pad and bass note together
    let finalChordNotes = [...notes];
    
    if (editorState.activeTab === 'chordPattern') {
        const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || app.state.divisions || 12);
        finalChordNotes = finalChordNotes.map((n, i) => n + snapToGrid(60 + (pitchOffsets[i] || 0), editorTuning) - 60);
    }

    const segmented = segmentMicrotonalCluster(finalChordNotes);
    segmented.core.forEach(n => playTone(midiToFreq(n), now, duration, chordInst, 'chords', 0));
    segmented.frictionLeft.forEach(n => playTone(midiToFreq(n), now, duration, chordInst, 'chords', panL));
    segmented.frictionRight.forEach(n => playTone(midiToFreq(n), now, duration, chordInst, 'chords', panR));

    const rootChordNotes = getChordNotes(chord.symbol, chord.key, tuning.divisions);
    if (rootChordNotes) {
        const rootBassNote = getBassNote(rootChordNotes, tuning);
        let finalBassNote = rootBassNote;
        if (editorState.activeTab === 'bassPattern') {
            const editorTuning = getPitchEditorTuning(chord.symbol, chord.divisions || app.state.divisions || 12);
            const snappedOffset = snapToGrid(60 + pitchOffset, editorTuning) - 60;
            finalBassNote = rootBassNote + snappedOffset;
        }
        playTone(midiToFreq(finalBassNote), now, duration, bassInst, 'bass');
    }
}

export function setCurrentPattern(newPattern, markAsOverride = true) {
    if (app.updatePattern) {
        app.updatePattern(editorState.activeTab, newPattern, editorState.activeIndex, editorState.isGlobal, markAsOverride);
    }
}

function initPitchResetControl() {
    const menuBtn = document.getElementById('btn-pitch-reset-menu');
    const dropdown = document.getElementById('pitch-reset-dropdown');
    const btnSlice = document.getElementById('btn-reset-pitch-slice');
    const btnAll = document.getElementById('btn-reset-pitch-all');

    if (!menuBtn || !dropdown || !btnSlice || !btnAll) return;

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'flex';
        dropdown.style.display = isVisible ? 'none' : 'flex';
    });

    const executeReset = (mode) => {
        dropdown.style.display = 'none';
        const pattern = getCurrentPattern();
        if (!pattern) return;

        let hasChanges = false;
        let newInstances = pattern.instances.map(inst => {
            if (mode === 'all' || inst.isSelected) {
                hasChanges = true;
                return { ...inst, pitchOffset: 0, pitchOffsets: inst.pitchOffsets ? inst.pitchOffsets.map(() => 0) : [] };
            }
            return inst;
        });

        if (hasChanges) {
            app.saveHistoryState();
            setCurrentPattern({ ...pattern, instances: newInstances });
            app.persistAppState();
            renderRhythmTimeline();
        }
    };

    btnSlice.addEventListener('click', (e) => {
        e.stopPropagation();
        executeReset('slice');
    });
    
    btnAll.addEventListener('click', (e) => {
        e.stopPropagation();
        executeReset('all');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#pitch-reset-group')) dropdown.style.display = 'none';
    });
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
    initPitchResetControl();
}

export function openRhythmEditor(index) {
    if (editorState.activeIndex !== index) {
        editorState.justPushedToGlobalIndex = null;
    }
    editorState.activeIndex = index;
    
    const chord = app.state.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    renderRhythmTimeline();
    
    const modeSelect = document.getElementById('global-mode-select');
    const pattern = getCurrentPattern();
    if (modeSelect && pattern) {
        modeSelect.value = pattern.inheritMode || pattern.globalMode || 'loop';
    }
    
    const panel = document.getElementById('rhythm-editor-panel');
    panel.style.display = 'block';
}

export function closeRhythmEditor() {
    editorState.activeIndex = null;
    editorState.activeOverlayId = null;
    editorState.justPushedToGlobalIndex = null;
    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.style.display = 'none';
}