import { state, persistAppState, getActiveProgression } from './store.js';
import { setTrackVolume, setSynthParam, clearCustomDrumSamples, hasCustomDrumSamples } from './synth.js';
import { exportScalaFile, exportTunFile } from './midi.js';
import { exitSongMode } from './songController.js';
import { auditionChord } from './sequencer.js';
import { isPlaybackActive } from './transportController.js';

let synthAuditionTimeout = null;

export function updateSynthEditorVisibility(track, synthType) {
    if (track !== 'chords') return; // Can be expanded later when we add Bass synth params
    
    const gearBtn = document.getElementById(`btn-edit-${track}-synth`);
    const editorPanel = document.getElementById(`synth-editor-${track}`);
    
    const hasEditor = synthType === 'fm' || synthType === 'plucked-square';
    
    if (gearBtn) gearBtn.style.display = hasEditor ? 'inline-block' : 'none';
    if (editorPanel && !hasEditor) {
        editorPanel.style.display = 'none';
    } else if (editorPanel && hasEditor) {
        const fmSection = document.getElementById('fm-params-section');
        const pluckSection = document.getElementById('pluck-params-section');
        if (fmSection) fmSection.style.display = synthType === 'fm' ? 'block' : 'none';
        if (pluckSection) pluckSection.style.display = synthType === 'plucked-square' ? 'block' : 'none';
    }
}

export function updatePluckParamsVisibility(waveform) {
    const cutoffRow = document.getElementById('pluck-cutoff-row');
    const resonanceRow = document.getElementById('pluck-resonance-row');
    const isSine = waveform === 'sine';
    if (cutoffRow) cutoffRow.style.display = isSine ? 'none' : '';
    if (resonanceRow) resonanceRow.style.display = isSine ? 'none' : '';
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

export function syncSettingsUI() {
    document.getElementById('bpm-slider').value = state.bpm;
    
    const tuningSelector = document.getElementById('tuning-selector');
    if (tuningSelector) tuningSelector.value = state.divisions || 12;
    
    if (state.volumes.bassHarmonic === undefined) state.volumes.bassHarmonic = 0.0;
    if (state.volumes.master === undefined) state.volumes.master = 1.0;
    
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
        updateSynthEditorVisibility(track, state.instruments[track] || 'sawtooth');
    });
    
    // Sync FM params to UI and Audio Engine
    if (!state.synthParams) state.synthParams = { fm: { ratio: 2, modIndex: 3, attack: 0.1, release: 0.5 }, 'plucked-square': { waveform: 'square', cutoff: 4, resonance: 1.5, decay: 0.4 } };
    if (!state.synthParams['plucked-square']) state.synthParams['plucked-square'] = { waveform: 'square', cutoff: 4, resonance: 1.5, decay: 0.4 };
    if (!state.synthParams['plucked-square'].waveform) state.synthParams['plucked-square'].waveform = 'square';
    
    const fm = state.synthParams.fm;
    const sliderMap = { 'ratio': fm.ratio, 'index': fm.modIndex, 'attack': fm.attack, 'release': fm.release };
    for (const [key, val] of Object.entries(sliderMap)) {
        const slider = document.getElementById(`fm-${key}-slider`);
        if (slider) slider.value = val;
        setSynthParam('fm', key === 'index' ? 'modIndex' : key, val);
    }
    
    const pluck = state.synthParams['plucked-square'];
    const pluckMap = { 'waveform': pluck.waveform, 'cutoff': pluck.cutoff, 'resonance': pluck.resonance, 'decay': pluck.decay };
    for (const [key, val] of Object.entries(pluckMap)) {
        const el = document.getElementById(`pluck-${key}-${key === 'waveform' ? 'select' : 'slider'}`);
        if (el) el.value = val;
        setSynthParam('plucked-square', key, val);
    }
    
    updatePluckParamsVisibility(pluck.waveform);
    
    updateCustomDrumsUI();
    
    const multipassInput = document.getElementById('multipass-input');
    if (multipassInput) multipassInput.value = state.exportPasses || 1;
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
    const autoPanInput = document.getElementById('auto-pan-leading');
    if (autoPanInput) autoPanInput.checked = state.autoPanLeading;
    
    const midiExportSelector = document.getElementById('midi-export-routing');
    if (midiExportSelector) midiExportSelector.value = state.midiExportRouting || 'mpe';
    
    const generatorPersonaSelector = document.getElementById('generator-persona-selector');
    if (generatorPersonaSelector) generatorPersonaSelector.value = state.generatorPersona || 'normal';
    
    const syncTransitionsDrums = document.getElementById('sync-transitions-drums');
    if (syncTransitionsDrums) syncTransitionsDrums.checked = state.syncTransitionsToDrums !== false;
    
    const snapTransitionsScale = document.getElementById('snap-transitions-scale');
    if (snapTransitionsScale) snapTransitionsScale.checked = state.snapTransitionsToScale !== false;
    
    updateMicrotonalSettingsUI();
}

export function initSettingsUI({ onRenderProgression }) {
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
            if (onRenderProgression) onRenderProgression();
        });
    }

    const btnModeToggle = document.getElementById('btn-mode-toggle');
    if (btnModeToggle) {
        btnModeToggle.addEventListener('click', () => {
            state.isAdvancedMode = !state.isAdvancedMode;
            document.body.classList.toggle('beginner-mode', !state.isAdvancedMode);
            btnModeToggle.textContent = state.isAdvancedMode ? '🎓 Advanced' : '🌱 Beginner';
            persistAppState();
            if (!state.isAdvancedMode) exitSongMode();
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
                try { setTrackVolume(track, val); } catch (err) {}
                persistAppState();
            });
        }
    });
    
    ['chords', 'bass'].forEach(track => {
        const el = document.getElementById(`inst-${track}`);
        if (el) {
            el.addEventListener('change', (e) => {
                state.instruments[track] = e.target.value;
                updateSynthEditorVisibility(track, e.target.value);
                persistAppState();
            });
        }
    });
    
    const btnEditChordsSynth = document.getElementById('btn-edit-chords-synth');
    const synthEditorChords = document.getElementById('synth-editor-chords');
    if (btnEditChordsSynth && synthEditorChords) {
        btnEditChordsSynth.addEventListener('click', () => {
            synthEditorChords.style.display = synthEditorChords.style.display === 'none' ? 'block' : 'none';
        });
    }

    ['ratio', 'index', 'attack', 'release'].forEach(param => {
        const slider = document.getElementById(`fm-${param}-slider`);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const stateKey = param === 'index' ? 'modIndex' : param;
                if (!state.synthParams) state.synthParams = { fm: {} };
                state.synthParams.fm[stateKey] = val;
                setSynthParam('fm', stateKey, val);
                persistAppState();

                // Safely audition the changes without flooding the Web Audio engine
                if (!isPlaybackActive()) {
                    if (synthAuditionTimeout) clearTimeout(synthAuditionTimeout);
                    synthAuditionTimeout = setTimeout(() => {
                        let chordToPlay = { symbol: 'I', key: state.baseKey, divisions: state.divisions };
                        if (state.selectedChordIndex !== null && state.currentProgression.length > 0) {
                            const activeProg = getActiveProgression();
                            chordToPlay = activeProg[state.selectedChordIndex] || activeProg[0];
                        }
                        auditionChord(chordToPlay.symbol, chordToPlay.key, null, chordToPlay.divisions);
                    }, 100);
                }
            });
        }
    });

    ['cutoff', 'resonance', 'decay'].forEach(param => {
        const slider = document.getElementById(`pluck-${param}-slider`);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!state.synthParams) state.synthParams = { fm: {}, 'plucked-square': {} };
                if (!state.synthParams['plucked-square']) state.synthParams['plucked-square'] = {};
                
                state.synthParams['plucked-square'][param] = val;
                setSynthParam('plucked-square', param, val);
                persistAppState();

                // Safely audition the changes without flooding the Web Audio engine
                if (!isPlaybackActive()) {
                    if (synthAuditionTimeout) clearTimeout(synthAuditionTimeout);
                    synthAuditionTimeout = setTimeout(() => {
                        let chordToPlay = { symbol: 'I', key: state.baseKey, divisions: state.divisions };
                        if (state.selectedChordIndex !== null && state.currentProgression.length > 0) {
                            const activeProg = getActiveProgression();
                            chordToPlay = activeProg[state.selectedChordIndex] || activeProg[0];
                        }
                        auditionChord(chordToPlay.symbol, chordToPlay.key, null, chordToPlay.divisions);
                    }, 100);
                }
            });
        }
    });

    const pluckWaveformSelect = document.getElementById('pluck-waveform-select');
    if (pluckWaveformSelect) {
        pluckWaveformSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (!state.synthParams) state.synthParams = { fm: {}, 'plucked-square': {} };
            if (!state.synthParams['plucked-square']) state.synthParams['plucked-square'] = {};
            
            state.synthParams['plucked-square']['waveform'] = val;
            setSynthParam('plucked-square', 'waveform', val);
            persistAppState();
            
            updatePluckParamsVisibility(val);

            // Safely audition the changes
            if (!isPlaybackActive()) {
                if (synthAuditionTimeout) clearTimeout(synthAuditionTimeout);
                synthAuditionTimeout = setTimeout(() => {
                    let chordToPlay = { symbol: 'I', key: state.baseKey, divisions: state.divisions };
                    if (state.selectedChordIndex !== null && state.currentProgression.length > 0) {
                        const activeProg = getActiveProgression();
                        chordToPlay = activeProg[state.selectedChordIndex] || activeProg[0];
                    }
                    auditionChord(chordToPlay.symbol, chordToPlay.key, null, chordToPlay.divisions);
                }, 100);
            }
        });
    }
    const btnClearDrums = document.getElementById('btn-clear-custom-drums');
    if (btnClearDrums) {
        btnClearDrums.addEventListener('click', async () => {
            await clearCustomDrumSamples();
            updateCustomDrumsUI();
            if (onRenderProgression) onRenderProgression();
        });
    }

    document.getElementById('voice-leading').addEventListener('change', (e) => { state.useVoiceLeading = e.target.checked; persistAppState(); });
    document.getElementById('auto-pan-leading')?.addEventListener('change', (e) => { state.autoPanLeading = e.target.checked; persistAppState(); });
    document.getElementById('midi-export-routing')?.addEventListener('change', (e) => { state.midiExportRouting = e.target.value; persistAppState(); updateMicrotonalSettingsUI(); });
    
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

    document.getElementById('multipass-input')?.addEventListener('input', (e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) { state.exportPasses = Math.max(1, Math.min(32, val)); persistAppState(); } });
    
    const generatorPersonaSelector = document.getElementById('generator-persona-selector');
    if (generatorPersonaSelector) {
        generatorPersonaSelector.addEventListener('change', (e) => {
            state.generatorPersona = e.target.value;
            persistAppState();
            if (onRenderProgression) onRenderProgression();
        });
    }

    const syncTransitionsDrums = document.getElementById('sync-transitions-drums');
    if (syncTransitionsDrums) {
        syncTransitionsDrums.addEventListener('change', (e) => {
            state.syncTransitionsToDrums = e.target.checked;
            persistAppState();
            if (onRenderProgression) onRenderProgression();
        });
    }

    const snapTransitionsScale = document.getElementById('snap-transitions-scale');
    if (snapTransitionsScale) {
        snapTransitionsScale.addEventListener('change', (e) => {
            state.snapTransitionsToScale = e.target.checked;
            persistAppState();
            if (onRenderProgression) onRenderProgression();
        });
    }
}