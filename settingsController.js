import { state, persistAppState, getActiveProgression } from './store.js';
import { setTrackVolume, setSynthParam, clearCustomDrumSamples, hasCustomDrumSamples, setBassDrive, setBassHarmonicDrive, decodeCustomBassSample, clearCustomBassSample, decodeCustomMelodySample, clearCustomMelodySample, decodeCustomCountermelodySample, clearCustomCountermelodySample } from './synth.js';
import { exportScalaFile, exportTunFile } from './midi.js';
import { exitSongMode } from './songController.js';
import { auditionChord } from './sequencer.js';
import { isPlaybackActive } from './transportController.js';
import { DEFAULT_DRUM_PARAMS } from './rhythmConfig.js';

let synthAuditionTimeout = null;

export function updateSynthEditorVisibility(track, synthType) {
    const gearBtn = document.getElementById(`btn-edit-${track}-synth`);
    const editorPanel = document.getElementById(`synth-editor-${track}`);
    
    if (track === 'chords') {
        const hasEditor = synthType === 'fm' || synthType === 'plucked-square' || synthType === 'sample-chords';
        if (gearBtn) gearBtn.style.display = hasEditor ? 'inline-block' : 'none';
        if (editorPanel && !hasEditor) {
            editorPanel.style.display = 'none';
        } else if (editorPanel && hasEditor) {
            const fmSection = document.getElementById('fm-params-section');
            const pluckSection = document.getElementById('pluck-params-section');
            const chordSampleSection = document.getElementById('chord-sample-params-section');
            if (fmSection) fmSection.style.display = synthType === 'fm' ? 'block' : 'none';
            if (pluckSection) pluckSection.style.display = synthType === 'plucked-square' ? 'block' : 'none';
            if (chordSampleSection) chordSampleSection.style.display = synthType === 'sample-chords' ? 'flex' : 'none';
        }
    } else if (track === 'bass') {
        const hasEditor = synthType === 'sample-bass' || synthType === 'karplus-strong';
        if (gearBtn) gearBtn.style.display = hasEditor ? 'inline-block' : 'none';
        if (editorPanel && !hasEditor) {
            editorPanel.style.display = 'none';
        } else if (editorPanel && hasEditor) {
            const sampleControls = document.getElementById('bass-sample-controls') || document.getElementById('synth-editor-bass'); // fallback/direct wrapper
            // Note: in our revised layout we have different param sections inside the editor panel
            const sampleParams = document.getElementById('bass-sample-params-section');
            const ksParams = document.getElementById('bass-ks-controls');
            if (sampleParams) sampleParams.style.display = synthType === 'sample-bass' ? 'flex' : 'none';
            if (ksParams) ksParams.style.display = synthType === 'karplus-strong' ? 'flex' : 'none';
        }
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
    
    ['master', 'chords', 'bass', 'bassHarmonic', 'drums', 'melody', 'countermelody'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.value = state.volumes[track];
            setTrackVolume(track, state.volumes[track]);
        }
    });
    
    const elChords = document.getElementById('inst-chords');
    if (elChords) {
        elChords.value = state.instruments.chords || 'sawtooth';
        updateSynthEditorVisibility('chords', state.instruments.chords || 'sawtooth');
    }
    const elBassSec = document.getElementById('inst-bass-secondary');
    if (elBassSec) {
        elBassSec.value = state.instruments.bassSecondary || 'sawtooth';
        updateSynthEditorVisibility('bass', state.instruments.bassSecondary || 'sawtooth');
    }

    const elMelody = document.getElementById('inst-melody');
    if (elMelody) {
        elMelody.value = state.instruments.melody || 'sine';
    }
    const elCountermelody = document.getElementById('inst-countermelody');
    if (elCountermelody) {
        elCountermelody.value = state.instruments.countermelody || 'sine';
    }

    // Update Melody & Countermelody Gear visibility
    const updateMelodyGearVisibility = () => {
        const isSample = (document.getElementById('inst-melody')?.value === 'sample-melody');
        const gear = document.getElementById('btn-edit-melody-synth');
        if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
        if (!isSample) {
            const panel = document.getElementById('synth-editor-melody');
            if (panel) panel.style.display = 'none';
        }
    };
    const updateCountermelodyGearVisibility = () => {
        const isSample = (document.getElementById('inst-countermelody')?.value === 'sample-countermelody');
        const gear = document.getElementById('btn-edit-countermelody-synth');
        if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
        if (!isSample) {
            const panel = document.getElementById('synth-editor-countermelody');
            if (panel) panel.style.display = 'none';
        }
    };
    updateMelodyGearVisibility();
    updateCountermelodyGearVisibility();

    // Sync Melody ADSR & Pitch
    if (!state.melodyAdsr) {
        state.melodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
    }
    ['attack', 'decay', 'sustain', 'release', 'pitch'].forEach(param => {
        const el = document.getElementById(`melody-${param}`);
        if (el) el.value = state.melodyAdsr[param];
    });
    const melodyPitchVal = document.getElementById('melody-pitch-val');
    if (melodyPitchVal) {
        const p = state.melodyAdsr.pitch || 0;
        melodyPitchVal.textContent = p >= 0 ? `+${p}st` : `${p}st`;
    }

    // Sync Countermelody ADSR & Pitch
    if (!state.countermelodyAdsr) {
        state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
    }
    ['attack', 'decay', 'sustain', 'release', 'pitch'].forEach(param => {
        const el = document.getElementById(`countermelody-${param}`);
        if (el) el.value = state.countermelodyAdsr[param];
    });
    const countermelodyPitchVal = document.getElementById('countermelody-pitch-val');
    if (countermelodyPitchVal) {
        const p = state.countermelodyAdsr.pitch || 0;
        countermelodyPitchVal.textContent = p >= 0 ? `+${p}st` : `${p}st`;
    }

    // Sync Melody Generator Controls
    if (state.melodySettings) {
        const enabledEl = document.getElementById('melody-enabled');
        if (enabledEl) enabledEl.checked = !!state.melodySettings.enabled;

        const optionsContainer = document.getElementById('melody-options-container');
        if (optionsContainer) {
            optionsContainer.style.display = state.melodySettings.enabled ? 'flex' : 'none';
        }

        const genreEl = document.getElementById('melody-genre');
        if (genreEl) genreEl.value = state.melodySettings.genre || 'none';

        const densityEl = document.getElementById('melody-density');
        if (densityEl) densityEl.value = state.melodySettings.density || 0.5;

        const motifEl = document.getElementById('melody-motif-recurrence');
        if (motifEl) motifEl.value = state.melodySettings.motifRecurrence || 0.5;

        const variationEl = document.getElementById('melody-variation-depth');
        if (variationEl) variationEl.value = state.melodySettings.variationDepth || 0.5;

        const restsEl = document.getElementById('melody-rests');
        if (restsEl) restsEl.value = state.melodySettings.restProbability || 0.3;

        const ornamentsEl = document.getElementById('melody-ornaments');
        if (ornamentsEl) ornamentsEl.value = state.melodySettings.ornamentIntensity || 0.5;

        const curveEl = document.getElementById('melody-tension-curve');
        if (curveEl) curveEl.value = state.melodySettings.tensionCurve || 'arch';

        const countermelodyToggleEl = document.getElementById('melody-countermelody-toggle');
        if (countermelodyToggleEl) countermelodyToggleEl.checked = !!state.melodySettings.countermelodyEnabled;

        const countermelodyModeEl = document.getElementById('melody-countermelody-mode');
        if (countermelodyModeEl) countermelodyModeEl.value = state.melodySettings.countermelodyMode || 'contrary';
    }

    if (state.bassDrive === undefined) state.bassDrive = 1.0;
    if (state.bassHarmonicDrive === undefined) state.bassHarmonicDrive = 1.0;
    
    const driveBassEl = document.getElementById('drive-bass');
    if (driveBassEl) {
        driveBassEl.value = state.bassDrive;
        const mappedVal = Math.pow(state.bassDrive / 10, 2) * 10;
        setBassDrive(mappedVal);
    }
    const driveBassHarmonicEl = document.getElementById('drive-bassHarmonic');
    if (driveBassHarmonicEl) {
        driveBassHarmonicEl.value = state.bassHarmonicDrive;
        const mappedVal = Math.pow(state.bassHarmonicDrive / 10, 2) * 10;
        setBassHarmonicDrive(mappedVal);
    }
    
    if (!state.bassAdsr) {
        state.bassAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0, octaveDrop: false };
    } else {
        if (state.bassAdsr.pitch === undefined) state.bassAdsr.pitch = 0;
        if (state.bassAdsr.octaveDrop === undefined) state.bassAdsr.octaveDrop = false;
    }
    const bassPitchSlider = document.getElementById('bass-pitch');
    if (bassPitchSlider) {
        if (state.bassAdsr.octaveDrop) {
            bassPitchSlider.max = "0";
            if (state.bassAdsr.pitch > 0) state.bassAdsr.pitch = 0;
        } else {
            bassPitchSlider.max = "24";
        }
        bassPitchSlider.value = state.bassAdsr.pitch;
    }
    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`bass-${param}`);
        if (el) el.value = state.bassAdsr[param];
    });
    const bassPitchVal = document.getElementById('bass-pitch-val');
    if (bassPitchVal) {
        const p = state.bassAdsr.pitch || 0;
        bassPitchVal.textContent = p >= 0 ? `+${p}st` : `${p}st`;
    }
    const btnBassOctaveDrop = document.getElementById('btn-bass-octave-drop');
    if (btnBassOctaveDrop) {
        const drop = !!state.bassAdsr.octaveDrop;
        btnBassOctaveDrop.textContent = drop ? 'ON' : 'OFF';
        if (drop) {
            btnBassOctaveDrop.classList.add('active');
            btnBassOctaveDrop.classList.remove('secondary');
            btnBassOctaveDrop.classList.add('primary');
        } else {
            btnBassOctaveDrop.classList.remove('active');
            btnBassOctaveDrop.classList.remove('primary');
            btnBassOctaveDrop.classList.add('secondary');
        }
    }

    const sampleControls = document.getElementById('bass-sample-controls');
    if (sampleControls) {
        sampleControls.style.display = (state.instruments.bassSecondary === 'sample-bass') ? 'flex' : 'none';
    }

    if (!state.chordAdsr) {
        state.chordAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
    } else if (state.chordAdsr.pitch === undefined) {
        state.chordAdsr.pitch = 0;
    }
    ['attack', 'decay', 'sustain', 'release', 'pitch'].forEach(param => {
        const el = document.getElementById(`chord-${param}`);
        if (el) el.value = state.chordAdsr[param];
    });
    const chordPitchVal = document.getElementById('chord-pitch-val');
    if (chordPitchVal) {
        const p = state.chordAdsr.pitch || 0;
        chordPitchVal.textContent = p >= 0 ? `+${p}st` : `${p}st`;
    }

    if (state.bassKsDamping === undefined) state.bassKsDamping = 400;
    if (state.bassKsDecay === undefined) state.bassKsDecay = 0.95;

    const ksDampingEl = document.getElementById('bass-ks-damping');
    if (ksDampingEl) ksDampingEl.value = state.bassKsDamping;

    const ksDecayEl = document.getElementById('bass-ks-decay');
    if (ksDecayEl) ksDecayEl.value = state.bassKsDecay;

    const ksControls = document.getElementById('bass-ks-controls');
    if (ksControls) {
        ksControls.style.display = (state.instruments.bassSecondary === 'karplus-strong') ? 'flex' : 'none';
    }
    
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
    
    if (!state.drumParams) {
        state.drumParams = structuredClone(DEFAULT_DRUM_PARAMS);
    }
    
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
    
    const auditionInput = document.getElementById('settings-audition-toggle');
    if (auditionInput) auditionInput.checked = state.editorState.isAuditionEnabled !== false;
    
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
            persistAppState();
            if (!state.isAdvancedMode) exitSongMode();
        });
    }
    
    document.getElementById('bpm-slider').addEventListener('input', (e) => {
        state.bpm = parseInt(e.target.value, 10);
        persistAppState();
    });
    
    ['master', 'chords', 'bass', 'bassHarmonic', 'drums', 'melody', 'countermelody'].forEach(track => {
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
    
    const elChords = document.getElementById('inst-chords');
    if (elChords) {
        elChords.addEventListener('change', (e) => {
            state.instruments.chords = e.target.value;
            updateSynthEditorVisibility('chords', e.target.value);
            persistAppState();
        });
    }
    
    const elBassSec = document.getElementById('inst-bass-secondary');
    if (elBassSec) {
        elBassSec.addEventListener('change', (e) => {
            state.instruments.bassSecondary = e.target.value;
            updateSynthEditorVisibility('bass', e.target.value);
            const sampleControls = document.getElementById('bass-sample-controls');
            if (sampleControls) {
                sampleControls.style.display = (e.target.value === 'sample-bass') ? 'flex' : 'none';
            }
            const ksControls = document.getElementById('bass-ks-controls');
            if (ksControls) {
                ksControls.style.display = (e.target.value === 'karplus-strong') ? 'flex' : 'none';
            }
            persistAppState();
        });
    }

    const elMelody = document.getElementById('inst-melody');
    if (elMelody) {
        elMelody.addEventListener('change', (e) => {
            state.instruments.melody = e.target.value;
            const isSample = (e.target.value === 'sample-melody');
            const gear = document.getElementById('btn-edit-melody-synth');
            if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
            if (!isSample) {
                const panel = document.getElementById('synth-editor-melody');
                if (panel) panel.style.display = 'none';
            }
            persistAppState();
        });
    }

    const elCountermelody = document.getElementById('inst-countermelody');
    if (elCountermelody) {
        elCountermelody.addEventListener('change', (e) => {
            state.instruments.countermelody = e.target.value;
            const isSample = (e.target.value === 'sample-countermelody');
            const gear = document.getElementById('btn-edit-countermelody-synth');
            if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
            if (!isSample) {
                const panel = document.getElementById('synth-editor-countermelody');
                if (panel) panel.style.display = 'none';
            }
            persistAppState();
        });
    }

    // Melody settings event listeners
    const melodyEnabledEl = document.getElementById('melody-enabled');
    if (melodyEnabledEl) {
        melodyEnabledEl.addEventListener('change', (e) => {
            state.melodySettings.enabled = e.target.checked;
            const container = document.getElementById('melody-options-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
            persistAppState();
        });
    }

    const melodyGenreEl = document.getElementById('melody-genre');
    if (melodyGenreEl) {
        melodyGenreEl.addEventListener('change', (e) => {
            state.melodySettings.genre = e.target.value;
            persistAppState();
        });
    }

    const melodyDensityEl = document.getElementById('melody-density');
    if (melodyDensityEl) {
        melodyDensityEl.addEventListener('input', (e) => {
            state.melodySettings.density = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const melodyMotifEl = document.getElementById('melody-motif-recurrence');
    if (melodyMotifEl) {
        melodyMotifEl.addEventListener('input', (e) => {
            state.melodySettings.motifRecurrence = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const melodyVariationEl = document.getElementById('melody-variation-depth');
    if (melodyVariationEl) {
        melodyVariationEl.addEventListener('input', (e) => {
            state.melodySettings.variationDepth = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const melodyRestsEl = document.getElementById('melody-rests');
    if (melodyRestsEl) {
        melodyRestsEl.addEventListener('input', (e) => {
            state.melodySettings.restProbability = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const melodyOrnamentsEl = document.getElementById('melody-ornaments');
    if (melodyOrnamentsEl) {
        melodyOrnamentsEl.addEventListener('input', (e) => {
            state.melodySettings.ornamentIntensity = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const melodyCurveEl = document.getElementById('melody-tension-curve');
    if (melodyCurveEl) {
        melodyCurveEl.addEventListener('change', (e) => {
            state.melodySettings.tensionCurve = e.target.value;
            persistAppState();
        });
    }

    const melodyCountermelodyEl = document.getElementById('melody-countermelody-toggle');
    if (melodyCountermelodyEl) {
        melodyCountermelodyEl.addEventListener('change', (e) => {
            state.melodySettings.countermelodyEnabled = e.target.checked;
            persistAppState();
        });
    }

    const melodyCountermelodyModeEl = document.getElementById('melody-countermelody-mode');
    if (melodyCountermelodyModeEl) {
        melodyCountermelodyModeEl.addEventListener('change', (e) => {
            state.melodySettings.countermelodyMode = e.target.value;
            persistAppState();
        });
    }

    const ksDampingEl = document.getElementById('bass-ks-damping');
    if (ksDampingEl) {
        ksDampingEl.addEventListener('input', (e) => {
            state.bassKsDamping = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const ksDecayEl = document.getElementById('bass-ks-decay');
    if (ksDecayEl) {
        ksDecayEl.addEventListener('input', (e) => {
            state.bassKsDecay = parseFloat(e.target.value);
            persistAppState();
        });
    }

    const driveBassEl = document.getElementById('drive-bass');
    if (driveBassEl) {
        driveBassEl.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            state.bassDrive = val;
            const mappedVal = Math.pow(val / 10, 2) * 10;
            setBassDrive(mappedVal);
            persistAppState();
        });
    }

    const driveBassHarmonicEl = document.getElementById('drive-bassHarmonic');
    if (driveBassHarmonicEl) {
        driveBassHarmonicEl.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            state.bassHarmonicDrive = val;
            const mappedVal = Math.pow(val / 10, 2) * 10;
            setBassHarmonicDrive(mappedVal);
            persistAppState();
        });
    }

    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`bass-${param}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state.bassAdsr[param] = val;
                persistAppState();
            });
        }
    });

    const fileBassSample = document.getElementById('file-bass-sample');
    const btnLoadBass = document.getElementById('btn-load-bass');
    const btnClearBass = document.getElementById('btn-clear-bass');

    if (btnLoadBass && fileBassSample) {
        btnLoadBass.addEventListener('click', (e) => {
            e.stopPropagation();
            fileBassSample.click();
        });
    }

    if (fileBassSample) {
        fileBassSample.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const arrayBuffer = ev.target.result;
                await decodeCustomBassSample(arrayBuffer);
                persistAppState();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnClearBass) {
        btnClearBass.addEventListener('click', async (e) => {
            e.stopPropagation();
            await clearCustomBassSample();
            persistAppState();
        });
    }
    
    const btnEditChordsSynth = document.getElementById('btn-edit-chords-synth');
    const synthEditorChords = document.getElementById('synth-editor-chords');
    if (btnEditChordsSynth && synthEditorChords) {
        btnEditChordsSynth.addEventListener('click', () => {
            synthEditorChords.style.display = synthEditorChords.style.display === 'none' ? 'block' : 'none';
        });
    }

    const btnEditBassSynth = document.getElementById('btn-edit-bass-synth');
    const synthEditorBass = document.getElementById('synth-editor-bass');
    if (btnEditBassSynth && synthEditorBass) {
        btnEditBassSynth.addEventListener('click', () => {
            synthEditorBass.style.display = synthEditorBass.style.display === 'none' ? 'block' : 'none';
        });
    }

    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`chord-${param}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!state.chordAdsr) state.chordAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 };
                state.chordAdsr[param] = val;
                persistAppState();
            });
        }
    });

    const fileChordSample = document.getElementById('file-chord-sample');
    const btnLoadChord = document.getElementById('btn-load-chord-sample');
    const btnClearChord = document.getElementById('btn-clear-chord-sample');

    if (btnLoadChord && fileChordSample) {
        btnLoadChord.addEventListener('click', (e) => {
            e.stopPropagation();
            fileChordSample.click();
        });
    }

    if (fileChordSample) {
        fileChordSample.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const arrayBuffer = ev.target.result;
                const { decodeCustomChordSample } = await import('./synth.js');
                await decodeCustomChordSample(arrayBuffer);
                persistAppState();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnClearChord) {
        btnClearChord.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { clearCustomChordSample } = await import('./synth.js');
            await clearCustomChordSample();
            persistAppState();
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

    document.getElementById('settings-audition-toggle')?.addEventListener('change', (e) => {
        state.editorState.isAuditionEnabled = e.target.checked;
        persistAppState();
        const insAuditionToggle = document.getElementById('inspector-audition-toggle');
        if (insAuditionToggle) insAuditionToggle.checked = e.target.checked;
    });

    const chordPitchSlider = document.getElementById('chord-pitch');
    if (chordPitchSlider) {
        chordPitchSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.chordAdsr) state.chordAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.chordAdsr.pitch = val;
            const label = document.getElementById('chord-pitch-val');
            if (label) label.textContent = val >= 0 ? `+${val}st` : `${val}st`;
        });
        
        chordPitchSlider.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.chordAdsr) state.chordAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.chordAdsr.pitch = val;
            persistAppState();
            triggerDualAudition('chords');
        });
    }

    const bassPitchSlider = document.getElementById('bass-pitch');
    if (bassPitchSlider) {
        bassPitchSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.bassAdsr) state.bassAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0, octaveDrop: false };
            state.bassAdsr.pitch = val;
            const label = document.getElementById('bass-pitch-val');
            if (label) label.textContent = val >= 0 ? `+${val}st` : `${val}st`;
        });
        
        bassPitchSlider.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.bassAdsr) state.bassAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0, octaveDrop: false };
            state.bassAdsr.pitch = val;
            persistAppState();
            triggerDualAudition('bass');
        });
    }

    const btnBassOctaveDrop = document.getElementById('btn-bass-octave-drop');
    if (btnBassOctaveDrop) {
        btnBassOctaveDrop.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.bassAdsr) state.bassAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0, octaveDrop: false };
            state.bassAdsr.octaveDrop = !state.bassAdsr.octaveDrop;
            
            const drop = state.bassAdsr.octaveDrop;
            btnBassOctaveDrop.textContent = drop ? 'ON' : 'OFF';
            
            const slider = document.getElementById('bass-pitch');
            if (slider) {
                if (drop) {
                    slider.max = "0";
                    if (state.bassAdsr.pitch > 0) {
                        state.bassAdsr.pitch = 0;
                        slider.value = 0;
                        const label = document.getElementById('bass-pitch-val');
                        if (label) label.textContent = "0st";
                    }
                } else {
                    slider.max = "24";
                }
            }

            if (drop) {
                btnBassOctaveDrop.classList.add('active');
                btnBassOctaveDrop.classList.remove('secondary');
                btnBassOctaveDrop.classList.add('primary');
            } else {
                btnBassOctaveDrop.classList.remove('active');
                btnBassOctaveDrop.classList.remove('primary');
                btnBassOctaveDrop.classList.add('secondary');
            }
            
            persistAppState();
            triggerDualAudition('bass');
        });
    }

    // Tab switching listener
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            document.querySelectorAll('.settings-tab-content').forEach(content => {
                content.style.display = (content.id === `settings-tab-content-${targetTab}`) ? 'flex' : 'none';
            });
        });
    });

    // Toggle custom sample panels gear clicks
    const btnEditMelody = document.getElementById('btn-edit-melody-synth');
    const panelMelody = document.getElementById('synth-editor-melody');
    if (btnEditMelody && panelMelody) {
        btnEditMelody.addEventListener('click', () => {
            panelMelody.style.display = panelMelody.style.display === 'none' ? 'flex' : 'none';
        });
    }

    const btnEditCountermelody = document.getElementById('btn-edit-countermelody-synth');
    const panelCountermelody = document.getElementById('synth-editor-countermelody');
    if (btnEditCountermelody && panelCountermelody) {
        btnEditCountermelody.addEventListener('click', () => {
            panelCountermelody.style.display = panelCountermelody.style.display === 'none' ? 'flex' : 'none';
        });
    }

    // Melody sample upload/clear
    const fileMelodySample = document.getElementById('file-melody-sample');
    const btnLoadMelody = document.getElementById('btn-load-melody');
    const btnClearMelody = document.getElementById('btn-clear-melody');

    if (btnLoadMelody && fileMelodySample) {
        btnLoadMelody.addEventListener('click', (e) => {
            e.stopPropagation();
            fileMelodySample.click();
        });
    }

    if (fileMelodySample) {
        fileMelodySample.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const arrayBuffer = ev.target.result;
                await decodeCustomMelodySample(arrayBuffer);
                persistAppState();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnClearMelody) {
        btnClearMelody.addEventListener('click', async (e) => {
            e.stopPropagation();
            await clearCustomMelodySample();
            persistAppState();
        });
    }

    // Countermelody sample upload/clear
    const fileCountermelodySample = document.getElementById('file-countermelody-sample');
    const btnLoadCountermelody = document.getElementById('btn-load-countermelody');
    const btnClearCountermelody = document.getElementById('btn-clear-countermelody');

    if (btnLoadCountermelody && fileCountermelodySample) {
        btnLoadCountermelody.addEventListener('click', (e) => {
            e.stopPropagation();
            fileCountermelodySample.click();
        });
    }

    if (fileCountermelodySample) {
        fileCountermelodySample.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const arrayBuffer = ev.target.result;
                await decodeCustomCountermelodySample(arrayBuffer);
                persistAppState();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    if (btnClearCountermelody) {
        btnClearCountermelody.addEventListener('click', async (e) => {
            e.stopPropagation();
            await clearCustomCountermelodySample();
            persistAppState();
        });
    }

    // Melody & Countermelody ADSR range sliders
    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`melody-${param}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!state.melodyAdsr) state.melodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
                state.melodyAdsr[param] = val;
                persistAppState();
            });
        }
    });

    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`countermelody-${param}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!state.countermelodyAdsr) state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
                state.countermelodyAdsr[param] = val;
                persistAppState();
            });
        }
    });

    // Melody & Countermelody Pitch sliders
    const melodyPitchSlider = document.getElementById('melody-pitch');
    if (melodyPitchSlider) {
        melodyPitchSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.melodyAdsr) state.melodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.melodyAdsr.pitch = val;
            const label = document.getElementById('melody-pitch-val');
            if (label) label.textContent = val >= 0 ? `+${val}st` : `${val}st`;
        });
        melodyPitchSlider.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.melodyAdsr) state.melodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.melodyAdsr.pitch = val;
            persistAppState();
            triggerDualAudition('melody');
        });
    }

    const countermelodyPitchSlider = document.getElementById('countermelody-pitch');
    if (countermelodyPitchSlider) {
        countermelodyPitchSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.countermelodyAdsr) state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.countermelodyAdsr.pitch = val;
            const label = document.getElementById('countermelody-pitch-val');
            if (label) label.textContent = val >= 0 ? `+${val}st` : `${val}st`;
        });
        countermelodyPitchSlider.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!state.countermelodyAdsr) state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
            state.countermelodyAdsr.pitch = val;
            persistAppState();
            triggerDualAudition('countermelody');
        });
    }
}

async function triggerDualAudition(target) {
    const { playTone, initAudio, getAudioCurrentTime } = await import('./synth.js');
    const { midiToFreq } = await import('./theory.js');
    
    initAudio();
    const now = getAudioCurrentTime();
    
    if (target === 'chords') {
        const notes = [60, 64, 67]; // C4, E4, G4
        notes.forEach(note => {
            playTone(midiToFreq(note), now, 0.7, 'sawtooth', 'chords', 0, 0.6);
        });
        notes.forEach(note => {
            playTone(midiToFreq(note), now + 0.9, 0.7, 'sample-chords', 'chords', 0, 0.6);
        });
    } else if (target === 'bass') {
        const note = 48; // C3
        playTone(midiToFreq(note), now, 0.7, 'sine', 'bass', 0, 0.8);
        playTone(midiToFreq(note), now + 0.9, 0.7, 'sample-bass', 'bass', 0, 0.8);
    } else if (target === 'melody') {
        const note = 72; // C5
        playTone(midiToFreq(note), now, 0.7, 'sine', 'melody', 0, 0.8);
        playTone(midiToFreq(note), now + 0.9, 0.7, 'sample-melody', 'melody', 0, 0.8);
    } else if (target === 'countermelody') {
        const note = 67; // G4
        playTone(midiToFreq(note), now, 0.7, 'sine', 'countermelody', 0, 0.8);
        playTone(midiToFreq(note), now + 0.9, 0.7, 'sample-countermelody', 'countermelody', 0, 0.8);
    }
}