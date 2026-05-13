import { editorState, app, getCurrentPattern, setCurrentPattern, getDurationBeats, renderRhythmTimeline } from './rhythmEditor.js';
import { generateIntelligentBassline } from './bassGenerator.js';

export function initBassControls() {
    let patternFxGroup = document.getElementById('pattern-fx-group');
    if (!patternFxGroup) {
        patternFxGroup = document.createElement('div');
        patternFxGroup.id = 'pattern-fx-group';
        patternFxGroup.className = 'toolbar-group-panel';
        patternFxGroup.innerHTML = `
            <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;" title="Dynamically shifts slices off the kick drum during playback.">
                <input type="checkbox" id="pattern-avoid-kick"> Avoid Kick
            </label>
        `;
        const toolbar = document.querySelector('.rhythm-toolbar');
        if (toolbar) toolbar.appendChild(patternFxGroup);
        
        document.getElementById('pattern-avoid-kick').addEventListener('change', (e) => {
            const pattern = getCurrentPattern();
            if (pattern) {
                app.saveHistoryState();
                setCurrentPattern({ ...pattern, avoidKick: e.target.checked });
                app.persistAppState();
            }
        });
    }

    let bassGenGroup = document.getElementById('bass-gen-group');
    
    if (!bassGenGroup) {
        bassGenGroup = document.createElement('div');
        bassGenGroup.id = 'bass-gen-group';
        bassGenGroup.className = 'tool-group';
        bassGenGroup.innerHTML = `
            <select id="bass-style-select" class="rhythm-select" title="Bassline Pitch Pattern">
                <option value="root">Root Driving</option>
                <option value="octaves">Octave Bounce</option>
                <option value="fifths">Root-Fifth</option>
            </select>
            <button id="btn-generate-bass" class="control-btn primary" style="padding: 4px 10px; font-size: 12px;">🪄 Generate</button>
        `;
        const toolbar = document.querySelector('.rhythm-toolbar');
        if (toolbar) toolbar.appendChild(bassGenGroup);
    }

    const btnGen = document.getElementById('btn-generate-bass');
    if (btnGen) {
        btnGen.addEventListener('click', () => {
            if (editorState.activeTab !== 'bassPattern') return;
            
            const drumPat = editorState.isGlobal ? app.state.globalPatterns.drumPattern : (app.state.currentProgression[editorState.activeIndex]?.drumPattern || app.state.globalPatterns.drumPattern);
            const chordTabPat = editorState.isGlobal ? app.state.globalPatterns.chordPattern : (app.state.currentProgression[editorState.activeIndex]?.chordPattern || app.state.globalPatterns.chordPattern);
            const style = document.getElementById('bass-style-select').value;
            const avoidKick = document.getElementById('pattern-avoid-kick').checked;

            app.saveHistoryState();
            const newBass = generateIntelligentBassline(drumPat, chordTabPat, { avoidKick, pitchStyle: style, lengthBeats: getDurationBeats() });
            setCurrentPattern(newBass, !editorState.isGlobal);
            app.persistAppState();
            renderRhythmTimeline();
        });
    }
}