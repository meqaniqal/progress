import { state, persistAppState, getActiveProgression } from './store.js';
import { setTrackVolume, setSynthParam, clearCustomDrumSamples, hasCustomDrumSamples, setBassDrive, setBassHarmonicDrive, decodeCustomBassSample, clearCustomBassSample, decodeCustomMelodySample, clearCustomMelodySample, decodeCustomCountermelodySample, clearCustomCountermelodySample, customDrumBuffers, decodeCustomDrumSample, clearCustomDrumSample, playDrum, getAudioCurrentTime } from './synth.js';
import { exportScalaFile, exportTunFile } from './midi.js';
import { exitSongMode } from './songController.js';
import { auditionChord } from './sequencer.js';
import { isPlaybackActive } from './transportController.js';
import { DEFAULT_DRUM_PARAMS } from './rhythmConfig.js';
import { initMotifEditors, loadActiveMotifInEditor, getCroppedMotifNotes } from './motifEditor.js';
import { parseMidiNotes } from './midiPhraseSelector.js';

let synthAuditionTimeout = null;

// Exponential range mapping utilities using quadratic curves
function volToSlider(vol, maxVal = 1.5) {
    return Math.sqrt(Math.max(0, vol) / maxVal);
}
function sliderToVol(sliderVal, maxVal = 1.5) {
    return maxVal * Math.pow(sliderVal, 2);
}
function envToSlider(envVal, maxVal = 2.0) {
    return Math.sqrt(Math.max(0, envVal) / maxVal);
}
function sliderToEnv(sliderVal, maxVal = 2.0) {
    return maxVal * Math.pow(sliderVal, 2);
}

const trackMaxVolumes = {
    master: 2.0,
    chords: 1.5,
    bass: 1.5,
    bassHarmonic: 1.5,
    drums: 1.5,
    melody: 1.5,
    countermelody: 1.5
};

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

export async function handleTuningImport(name, content, onRenderProgression) {
    const { parseScl, parseTun } = await import('./theory.js');
    let parsed = null;
    if (name.toLowerCase().endsWith('.scl')) {
        parsed = parseScl(content);
    } else if (name.toLowerCase().endsWith('.tun')) {
        parsed = parseTun(content);
    }
    
    if (parsed) {
        const tuningSelector = document.getElementById('tuning-selector');
        // Save standard or previous custom tuning to restore later on prune
        if (tuningSelector && tuningSelector.value !== 'import-action' && tuningSelector.value !== 'prune-action') {
            state.previousTuning = tuningSelector.value;
        }
        
        // Generate unique ID for this imported custom tuning
        parsed.id = 'ct-' + Math.random().toString(36).substring(2, 10);
        parsed.name = name.replace(/\.(scl|tun)$/i, '');
        
        // Add to imported list
        if (!state.importedTunings) state.importedTunings = [];
        state.importedTunings.push(parsed);
        state.customTuning = parsed;
        if (typeof window !== 'undefined') window.__customTuning = parsed;
        state.divisions = parsed.divisions || 12;
        
        persistAppState();
        updateMicrotonalSettingsUI();
        updateCustomTuningUI();
        if (tuningSelector) tuningSelector.value = parsed.id;
        if (onRenderProgression) onRenderProgression();
        return true;
    }
    return false;
}

export function updateCustomTuningUI() {
    const optgroup = document.getElementById('optgroup-imported-custom');
    const selector = document.getElementById('tuning-selector');
    
    if (optgroup) {
        optgroup.innerHTML = '';
        if (state.importedTunings && state.importedTunings.length > 0) {
            optgroup.style.display = '';
            state.importedTunings.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                optgroup.appendChild(opt);
            });
        } else {
            optgroup.style.display = 'none';
        }
    }

    if (selector) {
        // Remove existing prune option if it exists
        const existingPrune = selector.querySelector('option[value="prune-action"]');
        if (existingPrune) {
            existingPrune.remove();
        }

        // If customTuning is active, add '❌ Remove current' right before '📂 Import...' (which should be at the bottom)
        if (state.customTuning) {
            const pruneOpt = document.createElement('option');
            pruneOpt.value = 'prune-action';
            pruneOpt.textContent = '❌ Remove current';
            
            const importOpt = selector.querySelector('option[value="import-action"]');
            if (importOpt) {
                selector.insertBefore(pruneOpt, importOpt);
            } else {
                selector.appendChild(pruneOpt);
            }
        }
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
    if (tuningSelector) {
        updateCustomTuningUI(); // Rebuild optgroup before syncing value
        if (state.customTuning) {
            tuningSelector.value = state.customTuning.id || 'custom';
        } else {
            tuningSelector.value = state.divisions || 12;
        }
    }
    
    if (state.volumes.bassHarmonic === undefined) state.volumes.bassHarmonic = 0.0;
    if (state.volumes.master === undefined) state.volumes.master = 1.0;
    
    ['master', 'chords', 'bass', 'bassHarmonic', 'drums', 'melody', 'countermelody'].forEach(track => {
        const el = document.getElementById(`vol-${track}`);
        const maxVal = trackMaxVolumes[track] || 1.5;
        const currentVol = state.volumes[track] !== undefined ? state.volumes[track] : (track === 'master' ? 1.0 : (track === 'bassHarmonic' || track === 'countermelody' ? 0.0 : 0.8));
        state.volumes[track] = currentVol;
        if (el) {
            el.value = volToSlider(currentVol, maxVal);
        }
        const settingsEl = document.getElementById(`settings-vol-${track}`);
        if (settingsEl) {
            settingsEl.value = volToSlider(currentVol, maxVal);
        }
        setTrackVolume(track, currentVol);
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
    ['attack', 'decay', 'release'].forEach(param => {
        const el = document.getElementById(`melody-${param}`);
        if (el) el.value = envToSlider(state.melodyAdsr[param], 2.0);
    });
    const elMelodySustain = document.getElementById('melody-sustain');
    if (elMelodySustain) elMelodySustain.value = state.melodyAdsr.sustain;
    const elMelodyPitch = document.getElementById('melody-pitch');
    if (elMelodyPitch) elMelodyPitch.value = state.melodyAdsr.pitch;

    const melodyPitchVal = document.getElementById('melody-pitch-val');
    if (melodyPitchVal) {
        const p = state.melodyAdsr.pitch || 0;
        melodyPitchVal.textContent = p >= 0 ? `+${p}st` : `${p}st`;
    }

    // Sync Countermelody ADSR & Pitch
    if (!state.countermelodyAdsr) {
        state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
    }
    ['attack', 'decay', 'release'].forEach(param => {
        const el = document.getElementById(`countermelody-${param}`);
        if (el) el.value = envToSlider(state.countermelodyAdsr[param], 2.0);
    });
    const elCountermelodySustain = document.getElementById('countermelody-sustain');
    if (elCountermelodySustain) elCountermelodySustain.value = state.countermelodyAdsr.sustain;
    const elCountermelodyPitch = document.getElementById('countermelody-pitch');
    if (elCountermelodyPitch) elCountermelodyPitch.value = state.countermelodyAdsr.pitch;

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

        const seedSourceEl = document.getElementById('melody-seed-source');
        if (seedSourceEl) seedSourceEl.value = state.melodySettings.seedSource || 'procedural';

        const motifControls = document.getElementById('melody-motif-controls-container');
        if (motifControls) {
            motifControls.style.display = (state.melodySettings.seedSource === 'motif') ? 'flex' : 'none';
        }

        const activeMotifEl = document.getElementById('melody-active-motif');
        if (activeMotifEl && state.userMotifs) {
            activeMotifEl.innerHTML = '';
            state.userMotifs.forEach(motif => {
                const opt = document.createElement('option');
                opt.value = motif.id;
                opt.textContent = motif.name;
                activeMotifEl.appendChild(opt);
            });
            activeMotifEl.value = state.melodySettings.activeMotifId || 'preset-rise';
        }

        const extractionEl = document.getElementById('melody-midi-extraction');
        if (extractionEl) extractionEl.value = state.melodySettings.midiExtractionMode || 'highest';

        loadActiveMotifInEditor();
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
    ['attack', 'decay', 'release'].forEach(param => {
        const el = document.getElementById(`bass-${param}`);
        if (el) el.value = envToSlider(state.bassAdsr[param], 2.0);
    });
    const elBassSustain = document.getElementById('bass-sustain');
    if (elBassSustain) elBassSustain.value = state.bassAdsr.sustain;
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
    ['attack', 'decay', 'release'].forEach(param => {
        const el = document.getElementById(`chord-${param}`);
        if (el) el.value = envToSlider(state.chordAdsr[param], 2.0);
    });
    const elChordSustain = document.getElementById('chord-sustain');
    if (elChordSustain) elChordSustain.value = state.chordAdsr.sustain;
    const elChordPitch = document.getElementById('chord-pitch');
    if (elChordPitch) elChordPitch.value = state.chordAdsr.pitch;

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
    const sliderMap = { 'ratio': fm.ratio, 'index': fm.modIndex };
    for (const [key, val] of Object.entries(sliderMap)) {
        const slider = document.getElementById(`fm-${key}-slider`);
        if (slider) slider.value = val;
        setSynthParam('fm', key === 'index' ? 'modIndex' : key, val);
    }
    const elFmAttack = document.getElementById('fm-attack-slider');
    if (elFmAttack) elFmAttack.value = envToSlider(fm.attack, 1.0);
    const elFmRelease = document.getElementById('fm-release-slider');
    if (elFmRelease) elFmRelease.value = envToSlider(fm.release, 1.0);
    
    setSynthParam('fm', 'attack', fm.attack);
    setSynthParam('fm', 'release', fm.release);
    
    const pluck = state.synthParams['plucked-square'];
    const pluckMap = { 'waveform': pluck.waveform, 'cutoff': pluck.cutoff, 'resonance': pluck.resonance };
    for (const [key, val] of Object.entries(pluckMap)) {
        const el = document.getElementById(`pluck-${key}-${key === 'waveform' ? 'select' : 'slider'}`);
        if (el) el.value = val;
        setSynthParam('plucked-square', key, val);
    }
    const elPluckDecay = document.getElementById('pluck-decay-slider');
    if (elPluckDecay) elPluckDecay.value = envToSlider(pluck.decay, 1.0);
    setSynthParam('plucked-square', 'decay', pluck.decay);
    
    updatePluckParamsVisibility(pluck.waveform);
    
    if (!state.drumParams) {
        state.drumParams = structuredClone(DEFAULT_DRUM_PARAMS);
    }
    ['kick', 'snare', 'chh', 'ohh'].forEach(drumType => {
        const el = document.getElementById(`drum-vol-${drumType}`);
        if (el && state.drumParams[drumType]) {
            const vol = state.drumParams[drumType].volume !== undefined ? state.drumParams[drumType].volume : 1.0;
            el.value = volToSlider(vol, 2.0);
        }
    });
    
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

    const tuningSourceSelector = document.getElementById('settings-tuning-source');
    if (tuningSourceSelector) {
        tuningSourceSelector.value = state.tuningImportSource || 'server';
    }
    
    updateMicrotonalSettingsUI();
    updateCountermelodyMixerVisibility();
}

export function initSettingsUI({ onRenderProgression }) {
    initMotifEditors(state, () => { persistAppState(); });
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
    const fileCustomTuning = document.getElementById('file-custom-tuning');

    if (tuningSelector) {
        tuningSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            
            if (val === 'import-action') {
                if (state.tuningImportSource === 'server') {
                    openTuningLibrary();
                } else if (fileCustomTuning) {
                    fileCustomTuning.click();
                }
                // Revert visual selection back to the current active tuning state
                if (state.customTuning) {
                    tuningSelector.value = state.customTuning.id || 'custom';
                } else {
                    tuningSelector.value = state.divisions || 12;
                }
                return;
            }
            
            if (val === 'prune-action') {
                let currentId = null;
                if (state.customTuning) {
                    currentId = state.customTuning.id;
                    state.importedTunings = state.importedTunings.filter(t => t.id !== currentId);
                }
                
                const restoreVal = state.previousTuning || '12';
                
                // If the restored tuning is also custom, find and activate it
                if (restoreVal.startsWith('ct-')) {
                    const found = state.importedTunings.find(t => t.id === restoreVal);
                    if (found) {
                        state.customTuning = found;
                        if (typeof window !== 'undefined') window.__customTuning = found;
                        state.divisions = found.divisions || 12;
                    } else {
                        // If that custom tuning was deleted or not found, fall back to standard 12-TET
                        state.customTuning = null;
                        if (typeof window !== 'undefined') window.__customTuning = null;
                        state.divisions = 12;
                        state.previousTuning = '12';
                    }
                } else {
                    state.customTuning = null;
                    if (typeof window !== 'undefined') window.__customTuning = null;
                    state.divisions = isNaN(restoreVal) ? restoreVal : (parseInt(restoreVal, 10) || 12);
                }
                
                persistAppState();
                updateMicrotonalSettingsUI();
                updateCustomTuningUI();
                
                // If the restored value was the pruned tuning itself, fall back to standard 12
                const finalVal = (restoreVal === currentId) ? '12' : restoreVal;
                tuningSelector.value = finalVal;
                
                if (onRenderProgression) onRenderProgression();
                return;
            }
            
            // If they selected a custom tuning from the imported custom group:
            if (val.startsWith('ct-')) {
                const found = state.importedTunings.find(t => t.id === val);
                if (found) {
                    // Save the current selection (even if custom) to previousTuning
                    if (tuningSelector && tuningSelector.value !== 'import-action' && tuningSelector.value !== 'prune-action') {
                        state.previousTuning = tuningSelector.value;
                    }
                    state.customTuning = found;
                    if (typeof window !== 'undefined') window.__customTuning = found;
                    state.divisions = found.divisions || 12;
                    persistAppState();
                    updateMicrotonalSettingsUI();
                    updateCustomTuningUI();
                    syncSettingsUI();
                    if (onRenderProgression) onRenderProgression();
                }
                return;
            }
            
            // Selecting any standard tuning clears custom tuning but remembers previous tuning choice
            state.previousTuning = val;
            state.customTuning = null;
            if (typeof window !== 'undefined') window.__customTuning = null;
            
            state.divisions = isNaN(val) ? val : (parseInt(val, 10) || 12);
            persistAppState();
            updateMicrotonalSettingsUI();
            updateCustomTuningUI();
            if (onRenderProgression) onRenderProgression();
        });
    }

    if (fileCustomTuning) {
        fileCustomTuning.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const content = ev.target.result;
                const { parseScl, parseTun } = await import('./theory.js');
                let parsed = null;
                if (file.name.toLowerCase().endsWith('.scl')) {
                    parsed = parseScl(content);
                } else if (file.name.toLowerCase().endsWith('.tun')) {
                    parsed = parseTun(content);
                }
                
                if (parsed) {
                    // Save standard or previous custom tuning to restore later on prune
                    if (tuningSelector && tuningSelector.value !== 'import-action' && tuningSelector.value !== 'prune-action') {
                        state.previousTuning = tuningSelector.value;
                    }
                    
                    // Generate unique ID for this imported custom tuning
                    parsed.id = 'ct-' + Math.random().toString(36).substring(2, 10);
                    
                    // Add to imported list
                    state.importedTunings.push(parsed);
                    state.customTuning = parsed;
                    if (typeof window !== 'undefined') window.__customTuning = parsed;
                    state.divisions = parsed.divisions || 12;
                    
                    persistAppState();
                    updateMicrotonalSettingsUI();
                    updateCustomTuningUI();
                    if (tuningSelector) tuningSelector.value = parsed.id;
                    if (onRenderProgression) onRenderProgression();
                } else {
                    alert("Failed to parse custom tuning file. Please verify it is a valid Scala (.scl) or AnaMark (.tun) file.");
                }
            };
            reader.readAsText(file);
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
        const maxVal = trackMaxVolumes[track] || 1.5;
        const updateVolVal = (val) => {
            state.volumes[track] = val;
            try { setTrackVolume(track, val); } catch (err) {}
            persistAppState();

            // Sync other volume input elements for the same track
            const el = document.getElementById(`vol-${track}`);
            const settingsEl = document.getElementById(`settings-vol-${track}`);
            const sliderVal = volToSlider(val, maxVal);
            if (el) el.value = sliderVal;
            if (settingsEl) settingsEl.value = sliderVal;
        };

        const el = document.getElementById(`vol-${track}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const sliderVal = parseFloat(e.target.value);
                const val = sliderToVol(sliderVal, maxVal);
                updateVolVal(val);
            });
        }

        const settingsEl = document.getElementById(`settings-vol-${track}`);
        if (settingsEl) {
            settingsEl.addEventListener('input', (e) => {
                const sliderVal = parseFloat(e.target.value);
                const val = sliderToVol(sliderVal, maxVal);
                updateVolVal(val);
            });
        }
    });

    ['kick', 'snare', 'chh', 'ohh'].forEach(drumType => {
        const el = document.getElementById(`drum-vol-${drumType}`);
        if (el) {
            el.addEventListener('input', (e) => {
                const sliderVal = parseFloat(e.target.value);
                const val = sliderToVol(sliderVal, 2.0); // max drum part volume is 2.0
                if (!state.drumParams) state.drumParams = structuredClone(DEFAULT_DRUM_PARAMS);
                if (!state.drumParams[drumType]) state.drumParams[drumType] = structuredClone(DEFAULT_DRUM_PARAMS[drumType]);
                state.drumParams[drumType].volume = val;
                persistAppState();
            });
        }
    });
    
    const elChords = document.getElementById('inst-chords');
    if (elChords) {
        elChords.addEventListener('change', async (e) => {
            state.instruments.chords = e.target.value;
            updateSynthEditorVisibility('chords', e.target.value);
            persistAppState();
            if (e.target.value === 'sample-chords') {
                const { customChordBuffer } = await import('./synth.js');
                if (!customChordBuffer) {
                    const panel = document.getElementById('synth-editor-chords');
                    if (panel) panel.style.display = 'block';
                    document.getElementById('file-chord-sample')?.click();
                }
            }
        });
    }
    
    const elBassSec = document.getElementById('inst-bass-secondary');
    if (elBassSec) {
        elBassSec.addEventListener('change', async (e) => {
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
            if (e.target.value === 'sample-bass') {
                const { customBassBuffer } = await import('./synth.js');
                if (!customBassBuffer) {
                    const panel = document.getElementById('synth-editor-bass');
                    if (panel) panel.style.display = 'block';
                    document.getElementById('file-bass-sample')?.click();
                }
            }
        });
    }

    const elMelody = document.getElementById('inst-melody');
    if (elMelody) {
        elMelody.addEventListener('change', async (e) => {
            state.instruments.melody = e.target.value;
            const isSample = (e.target.value === 'sample-melody');
            const gear = document.getElementById('btn-edit-melody-synth');
            if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
            if (!isSample) {
                const panel = document.getElementById('synth-editor-melody');
                if (panel) panel.style.display = 'none';
            }
            persistAppState();
            if (isSample) {
                const { customMelodyBuffer } = await import('./synth.js');
                if (!customMelodyBuffer) {
                    const panel = document.getElementById('synth-editor-melody');
                    if (panel) panel.style.display = 'flex';
                    const otherPanel = document.getElementById('synth-editor-countermelody');
                    if (otherPanel) otherPanel.style.display = 'none';
                    document.getElementById('file-melody-sample')?.click();
                }
            }
        });
    }

    const elCountermelody = document.getElementById('inst-countermelody');
    if (elCountermelody) {
        elCountermelody.addEventListener('change', async (e) => {
            state.instruments.countermelody = e.target.value;
            const isSample = (e.target.value === 'sample-countermelody');
            const gear = document.getElementById('btn-edit-countermelody-synth');
            if (gear) gear.style.display = isSample ? 'inline-block' : 'none';
            if (!isSample) {
                const panel = document.getElementById('synth-editor-countermelody');
                if (panel) panel.style.display = 'none';
            }
            persistAppState();
            if (isSample) {
                const { customCountermelodyBuffer } = await import('./synth.js');
                if (!customCountermelodyBuffer) {
                    const panel = document.getElementById('synth-editor-countermelody');
                    if (panel) panel.style.display = 'flex';
                    const otherPanel = document.getElementById('synth-editor-melody');
                    if (otherPanel) otherPanel.style.display = 'none';
                    document.getElementById('file-countermelody-sample')?.click();
                }
            }
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
            updateCountermelodyMixerVisibility();
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

    // Melody Seeding & Motif listeners
    const seedSourceEl = document.getElementById('melody-seed-source');
    if (seedSourceEl) {
        seedSourceEl.addEventListener('change', (e) => {
            state.melodySettings.seedSource = e.target.value;
            const container = document.getElementById('melody-motif-controls-container');
            if (container) {
                container.style.display = (e.target.value === 'motif') ? 'flex' : 'none';
            }
            loadActiveMotifInEditor();
            persistAppState();
        });
    }

    const activeMotifEl = document.getElementById('melody-active-motif');
    if (activeMotifEl) {
        activeMotifEl.addEventListener('change', (e) => {
            state.melodySettings.activeMotifId = e.target.value;
            loadActiveMotifInEditor();
            persistAppState();
        });
    }

    const extractionEl = document.getElementById('melody-midi-extraction');
    if (extractionEl) {
        extractionEl.addEventListener('change', (e) => {
            state.melodySettings.midiExtractionMode = e.target.value;
            persistAppState();
        });
    }

    // Load MIDI Motif Button
    const btnLoadMidiMotif = document.getElementById('btn-load-midi-motif');
    const fileMidiMotif = document.getElementById('file-midi-motif');
    if (btnLoadMidiMotif && fileMidiMotif) {
        btnLoadMidiMotif.addEventListener('click', (e) => {
            e.stopPropagation();
            fileMidiMotif.click();
        });
        
        fileMidiMotif.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    const parsedNotes = parseMidiNotes(arrayBuffer);
                    
                    // Show Cropper Panel
                    const cropperContainer = document.getElementById('midi-cropper-container');
                    if (cropperContainer) cropperContainer.style.display = 'flex';
                    
                    // Pass to cropper
                    const { setMidiNotesForCropper } = await import('./motifEditor.js');
                    setMidiNotesForCropper(parsedNotes);
                } catch (err) {
                    console.error('Error parsing MIDI seed file:', err);
                    alert('Failed to parse MIDI file: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // Crop Button
    const btnCropMidiMotif = document.getElementById('btn-crop-midi-motif');
    if (btnCropMidiMotif) {
        btnCropMidiMotif.addEventListener('click', async () => {
            const { getCroppedMotifNotes } = await import('./motifEditor.js');
            const relativeNotes = getCroppedMotifNotes(state.melodySettings.midiExtractionMode);
            
            if (relativeNotes.length === 0) {
                alert('No notes found in the selected range.');
                return;
            }

            // Save as new motif
            const motifId = 'custom-' + Date.now();
            const motifName = 'Imported ' + (state.melodySettings.midiExtractionMode === 'polyphonic' ? 'Poly' : 'Mono') + ' (' + relativeNotes.length + ' notes)';
            
            if (!state.userMotifs) state.userMotifs = [];
            state.userMotifs.push({
                id: motifId,
                name: motifName,
                notes: relativeNotes
            });

            state.melodySettings.activeMotifId = motifId;

            // Re-sync UI
            syncSettingsUI();
            persistAppState();

            // Hide cropper container
            const cropperContainer = document.getElementById('midi-cropper-container');
            if (cropperContainer) cropperContainer.style.display = 'none';

            alert('Successfully imported custom motif: ' + motifName);
        });
    }

    // Clear Motif Notes Button
    const btnClearMotifNotes = document.getElementById('btn-clear-motif-notes');
    if (btnClearMotifNotes) {
        btnClearMotifNotes.addEventListener('click', () => {
            const activeMotif = state.userMotifs.find(m => m.id === state.melodySettings.activeMotifId) || state.userMotifs[0];
            if (activeMotif) {
                activeMotif.notes = [];
                loadActiveMotifInEditor();
                persistAppState();
            }
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'sustain') ? sliderVal : sliderToEnv(sliderVal, 2.0);
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'sustain') ? sliderVal : sliderToEnv(sliderVal, 2.0);
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'attack' || param === 'release') ? sliderToEnv(sliderVal, 1.0) : sliderVal;
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'decay') ? sliderToEnv(sliderVal, 1.0) : sliderVal;
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
        chordPitchSlider.addEventListener('pointerdown', () => {
            triggerDualAudition('chords');
        });
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
        bassPitchSlider.addEventListener('pointerdown', () => {
            triggerDualAudition('bass');
        });
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

    // Wire up octave buttons
    document.querySelectorAll('.octave-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target');
            const dir = btn.getAttribute('data-dir');
            const slider = document.getElementById(targetId);
            if (slider) {
                let val = parseInt(slider.value, 10) || 0;
                const min = parseInt(slider.min, 10) || -24;
                const max = parseInt(slider.max, 10) || 24;
                if (dir === 'up') {
                    val = Math.min(max, val + 12);
                } else {
                    val = Math.max(min, val - 12);
                }
                slider.value = val;
                slider.dispatchEvent(new Event('input', { bubbles: true }));
                slider.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

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
            // When switching tabs, collapse any expanded mixer panels, drum part panels, and general settings panels
            document.querySelectorAll('.mixer-row-group').forEach(group => {
                group.classList.remove('expanded');
                const panel = group.querySelector('.mixer-nested-panel');
                if (panel) panel.style.display = 'none';
            });
            document.querySelectorAll('.drum-part-group').forEach(group => {
                group.classList.remove('expanded');
                const panel = group.querySelector('.drum-nested-panel');
                if (panel) panel.style.display = 'none';
            });
            document.querySelectorAll('.general-row-group').forEach(group => {
                group.classList.remove('expanded');
                const panel = group.querySelector('.general-nested-panel');
                if (panel) panel.style.display = 'none';
            });
        });
    });

    // Progressive Mixer Row Toggles
    const triggers = document.querySelectorAll('.mixer-track-trigger');
    triggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = trigger.closest('.mixer-row-group');
            const panel = group.querySelector('.mixer-nested-panel');
            if (!panel) return;

            const isExpanded = group.classList.contains('expanded');

            // Collapse all panels first
            document.querySelectorAll('.mixer-row-group').forEach(g => {
                g.classList.remove('expanded');
                const p = g.querySelector('.mixer-nested-panel');
                if (p) p.style.display = 'none';
            });
            document.querySelectorAll('.drum-part-group').forEach(g => {
                g.classList.remove('expanded');
                const p = g.querySelector('.drum-nested-panel');
                if (p) p.style.display = 'none';
            });

            // Toggle the clicked one
            if (!isExpanded) {
                group.classList.add('expanded');
                panel.style.display = 'flex';
            }
        });
    });

    // Drum Parts Row Toggles
    const drumTriggers = document.querySelectorAll('.drum-part-trigger');
    drumTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = trigger.closest('.drum-part-group');
            const panel = group.querySelector('.drum-nested-panel');
            if (!panel) return;

            const isExpanded = group.classList.contains('expanded');
            const drumType = group.getAttribute('data-drum-type');

            // Collapse all drum part panels first
            document.querySelectorAll('.drum-part-group').forEach(g => {
                g.classList.remove('expanded');
                const p = g.querySelector('.drum-nested-panel');
                if (p) p.style.display = 'none';
            });

            // Toggle the clicked one
            if (!isExpanded) {
                group.classList.add('expanded');
                panel.style.display = 'flex';
                renderDrumPartNestedPanel(drumType, panel);
            }
        });
    });

    let mixerCollapseTimeout = null;

    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;

    // Clear collapse timeout on subsequent clicks of a double click
    document.addEventListener('pointerdown', (e) => {
        const currentTime = Date.now();
        const isControl = e.target.tagName === 'INPUT' ||
                          e.target.tagName === 'SELECT' ||
                          e.target.tagName === 'BUTTON' ||
                          e.target.tagName === 'TEXTAREA' ||
                          e.target.closest('input') ||
                          e.target.closest('button') ||
                          e.target.closest('select') ||
                          e.target.closest('.mixer-track-trigger') ||
                          e.target.closest('.drum-part-trigger') ||
                          e.target.closest('.octave-btn') ||
                          e.target.closest('.chord-btn');

        // Check for double click context
        const isDoubleClickContext = (e.detail >= 2) || 
                                     ((currentTime - lastClickTime < 450) && 
                                      (Math.abs(e.clientX - lastClickX) < 40) && 
                                      (Math.abs(e.clientY - lastClickY) < 40));

        lastClickTime = currentTime;
        lastClickX = e.clientX;
        lastClickY = e.clientY;

        if (isDoubleClickContext) {
            if (!isControl) {
                const inSettings = e.target.closest('#settings-modal');
                if (inSettings) {
                    if (mixerCollapseTimeout) {
                        clearTimeout(mixerCollapseTimeout);
                        mixerCollapseTimeout = null;
                    }
                    return;
                }
            }
        }

        // Prevent collapsing settings when adjusting volume/envelope sliders
        if (e.target.tagName === 'INPUT' && e.target.type === 'range') {
            return;
        }
        if (e.target.closest('input[type="range"]') || e.target.closest('.volume-slider') || e.target.closest('.mixer-row-slider')) {
            return;
        }

        if (mixerCollapseTimeout) {
            clearTimeout(mixerCollapseTimeout);
        }

        // Delay collapse logic to allow time for double clicks
        mixerCollapseTimeout = setTimeout(() => {
            const expandedGroup = document.querySelector('.mixer-row-group.expanded');
            if (expandedGroup && !expandedGroup.contains(e.target) && !e.target.closest('.mixer-track-trigger')) {
                expandedGroup.classList.remove('expanded');
                const panel = expandedGroup.querySelector('.mixer-nested-panel');
                if (panel) panel.style.display = 'none';
            }

            const expandedDrumGroup = document.querySelector('.drum-part-group.expanded');
            if (expandedDrumGroup && !expandedDrumGroup.contains(e.target) && !e.target.closest('.drum-part-trigger')) {
                expandedDrumGroup.classList.remove('expanded');
                const panel = expandedDrumGroup.querySelector('.drum-nested-panel');
                if (panel) panel.style.display = 'none';
            }
            mixerCollapseTimeout = null;
        }, 400);
    });

    // Handle native double-click to start/stop playback
    document.addEventListener('dblclick', (e) => {
        const isControl = e.target.tagName === 'INPUT' ||
                          e.target.tagName === 'SELECT' ||
                          e.target.tagName === 'BUTTON' ||
                          e.target.tagName === 'TEXTAREA' ||
                          e.target.closest('input') ||
                          e.target.closest('button') ||
                          e.target.closest('select') ||
                          e.target.closest('.mixer-track-trigger') ||
                          e.target.closest('.drum-part-trigger') ||
                          e.target.closest('.octave-btn') ||
                          e.target.closest('.chord-btn');

        if (!isControl) {
            const inSettings = e.target.closest('#settings-modal');
            if (inSettings) {
                const playToggleBtn = document.getElementById('btn-play-toggle');
                if (playToggleBtn) {
                    playToggleBtn.click();
                }
                e.preventDefault();
                e.stopPropagation();
            }
        }
    });

    // Toggle custom sample panels gear clicks (mutually exclusive)
    const btnEditMelody = document.getElementById('btn-edit-melody-synth');
    const panelMelody = document.getElementById('synth-editor-melody');
    const btnEditCountermelody = document.getElementById('btn-edit-countermelody-synth');
    const panelCountermelody = document.getElementById('synth-editor-countermelody');

    if (btnEditMelody && panelMelody) {
        btnEditMelody.addEventListener('click', () => {
            const opening = panelMelody.style.display === 'none';
            panelMelody.style.display = opening ? 'flex' : 'none';
            if (opening && panelCountermelody) {
                panelCountermelody.style.display = 'none';
            }
        });
    }

    if (btnEditCountermelody && panelCountermelody) {
        btnEditCountermelody.addEventListener('click', () => {
            const opening = panelCountermelody.style.display === 'none';
            panelCountermelody.style.display = opening ? 'flex' : 'none';
            if (opening && panelMelody) {
                panelMelody.style.display = 'none';
            }
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'sustain') ? sliderVal : sliderToEnv(sliderVal, 2.0);
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
                const sliderVal = parseFloat(e.target.value);
                const val = (param === 'sustain') ? sliderVal : sliderToEnv(sliderVal, 2.0);
                if (!state.countermelodyAdsr) state.countermelodyAdsr = { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, pitch: 0 };
                state.countermelodyAdsr[param] = val;
                persistAppState();
            });
        }
    });

    // Melody & Countermelody Pitch sliders
    const melodyPitchSlider = document.getElementById('melody-pitch');
    if (melodyPitchSlider) {
        melodyPitchSlider.addEventListener('pointerdown', () => {
            triggerDualAudition('melody');
        });
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
        countermelodyPitchSlider.addEventListener('pointerdown', () => {
            triggerDualAudition('countermelody');
        });
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

    // Tuning Import Source Setting
    const tuningSourceSelector = document.getElementById('settings-tuning-source');
    if (tuningSourceSelector) {
        tuningSourceSelector.addEventListener('change', (e) => {
            state.tuningImportSource = e.target.value;
            persistAppState();
        });
    }

    // General Settings Accordion Row Toggles
    const generalTriggers = document.querySelectorAll('.general-row-header');
    generalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = trigger.closest('.general-row-group');
            const panel = group.querySelector('.general-nested-panel');
            if (!panel) return;

            const isExpanded = group.classList.contains('expanded');

            // Collapse all general panels first
            document.querySelectorAll('.general-row-group').forEach(g => {
                g.classList.remove('expanded');
                const p = g.querySelector('.general-nested-panel');
                if (p) p.style.display = 'none';
            });

            // Toggle the clicked one
            if (!isExpanded) {
                group.classList.add('expanded');
                panel.style.display = 'flex';
            }
        });
    });

    // Tuning Library Modal Setup
    const libModal = document.getElementById('tuning-library-modal');
    const closeLibBtn = document.getElementById('btn-close-library-modal');
    const categorySelector = document.getElementById('library-category-selector');
    const scaleSelector = document.getElementById('library-scale-selector');
    const loadScaleBtn = document.getElementById('btn-load-library-scale');

    let cachedTuningLibrary = null;

    async function openTuningLibrary() {
        if (!libModal) return;
        
        // Show modal
        libModal.style.display = 'flex';
        libModal.offsetHeight; // force reflow
        libModal.classList.add('visible');

        // Fetch index if not cached
        if (!cachedTuningLibrary) {
            try {
                const res = await fetch('tuning_library/index.json');
                if (!res.ok) throw new Error('Network response not ok');
                cachedTuningLibrary = await res.json();
                
                // Populate category list
                if (categorySelector) {
                    categorySelector.innerHTML = '<option value="">-- Select Category --</option>';
                    Object.keys(cachedTuningLibrary).forEach(category => {
                        const opt = document.createElement('option');
                        opt.value = category;
                        opt.textContent = category;
                        categorySelector.appendChild(opt);
                    });
                }
            } catch (err) {
                console.error("Failed to load tuning library index", err);
                alert("Error loading library index from server.");
            }
        }
    }

    if (closeLibBtn && libModal) {
        const closeLib = () => {
            libModal.classList.remove('visible');
            setTimeout(() => {
                libModal.style.display = 'none';
                // Reset selectors
                if (categorySelector) categorySelector.value = '';
                if (scaleSelector) {
                    scaleSelector.innerHTML = '<option value="">-- Select Category First --</option>';
                    scaleSelector.disabled = true;
                }
                if (loadScaleBtn) loadScaleBtn.disabled = true;
            }, 200);
        };
        closeLibBtn.addEventListener('click', closeLib);
        libModal.addEventListener('click', (e) => {
            if (e.target === libModal) closeLib();
        });
    }

    if (categorySelector && scaleSelector) {
        categorySelector.addEventListener('change', (e) => {
            const category = e.target.value;
            if (!category || !cachedTuningLibrary || !cachedTuningLibrary[category]) {
                scaleSelector.innerHTML = '<option value="">-- Select Category First --</option>';
                scaleSelector.disabled = true;
                if (loadScaleBtn) loadScaleBtn.disabled = true;
                return;
            }

            scaleSelector.innerHTML = '<option value="">-- Select Scale --</option>';
            cachedTuningLibrary[category].forEach((scale, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = scale.name;
                scaleSelector.appendChild(opt);
            });
            scaleSelector.disabled = false;
            if (loadScaleBtn) loadScaleBtn.disabled = true;
        });

        scaleSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            if (loadScaleBtn) {
                loadScaleBtn.disabled = (val === "");
            }
        });
    }

    if (loadScaleBtn) {
        loadScaleBtn.addEventListener('click', async () => {
            const category = categorySelector.value;
            const index = scaleSelector.value;
            if (!category || index === "" || !cachedTuningLibrary || !cachedTuningLibrary[category]) return;

            const scale = cachedTuningLibrary[category][index];
            loadScaleBtn.disabled = true;
            const originalText = loadScaleBtn.textContent;
            loadScaleBtn.textContent = "Loading...";

            try {
                const res = await fetch(scale.path);
                if (!res.ok) throw new Error('Failed to fetch scale content');
                const content = await res.text();
                
                const success = await handleTuningImport(scale.filename, content, onRenderProgression);
                if (success) {
                    if (closeLibBtn) closeLibBtn.click();
                } else {
                    alert("Failed to parse custom tuning from server.");
                }
            } catch (err) {
                console.error(err);
                alert("Failed to download scale file from server.");
            } finally {
                loadScaleBtn.textContent = originalText;
                loadScaleBtn.disabled = false;
            }
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

export function updateCountermelodyMixerVisibility() {
    const el = document.querySelector('.mixer-row-group[data-track="countermelody"]');
    if (el) {
        const isEnabled = !!(state.melodySettings && state.melodySettings.countermelodyEnabled);
        el.style.display = isEnabled ? 'flex' : 'none';
        if (!isEnabled) {
            el.classList.remove('expanded');
            const panel = el.querySelector('.mixer-nested-panel');
            if (panel) panel.style.display = 'none';
        }
    }
}

export function renderDrumPartNestedPanel(rowType, container) {
    container.innerHTML = '';
    
    // Prevent timeline capturing
    container.addEventListener('pointerdown', (e) => e.stopPropagation());

    const isSampleLoaded = !!customDrumBuffers[rowType];
    if (!state.drumParams) {
        state.drumParams = {};
    }
    if (!state.drumParams[rowType]) {
        state.drumParams[rowType] = structuredClone(DEFAULT_DRUM_PARAMS[rowType]);
    }
    const params = state.drumParams[rowType];
    if (isSampleLoaded && (params.pitch === undefined || params.pitch > 3.0)) {
        params.pitch = 1.0;
    }

    const controls = [];
    if (isSampleLoaded) {
        controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 5.0, step: 0.05, unit: 's' });
        controls.push({ key: 'pitch', label: 'Pitch (Speed)', min: 0.2, max: 3.0, step: 0.05, unit: 'x' });
        controls.push({ key: 'cutoff', label: 'Cutoff', min: 200, max: 20000, step: 100, unit: 'Hz' });
        controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
    } else {
        if (rowType === 'kick') {
            controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 2.0, step: 0.05, unit: 's' });
            controls.push({ key: 'pitch', label: 'Pitch', min: 30, max: 150, step: 1, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
        } else if (rowType === 'snare') {
            controls.push({ key: 'decay', label: 'Decay', min: 0.05, max: 2.0, step: 0.05, unit: 's' });
            controls.push({ key: 'pitch', label: 'Pitch', min: 50, max: 300, step: 1, unit: 'Hz' });
            controls.push({ key: 'cutoff', label: 'Cutoff', min: 200, max: 8000, step: 50, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
            controls.push({ key: 'noiseType', label: 'Noise Type', type: 'select', options: ['white', 'pink', 'metallic'] });
        } else if (rowType === 'chh' || rowType === 'ohh') {
            const maxDecay = rowType === 'chh' ? 0.5 : 2.0;
            controls.push({ key: 'decay', label: 'Decay', min: 0.01, max: maxDecay, step: 0.01, unit: 's' });
            controls.push({ key: 'cutoff', label: 'Cutoff', min: 1000, max: 15000, step: 100, unit: 'Hz' });
            controls.push({ key: 'drive', label: 'Drive', min: 0, max: 10, step: 0.5, unit: '' });
            controls.push({ key: 'noiseType', label: 'Noise Type', type: 'select', options: ['white', 'pink', 'metallic'] });
        }
    }

    controls.forEach(ctrl => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '3px';
        row.style.marginBottom = '6px';

        const labelContainer = document.createElement('div');
        labelContainer.style.display = 'flex';
        labelContainer.style.justifyContent = 'space-between';
        labelContainer.style.fontSize = '11px';
        labelContainer.style.color = 'var(--text-muted, #aaa)';

        const labelText = document.createElement('span');
        labelText.textContent = ctrl.label;
        labelContainer.appendChild(labelText);

        const currentVal = params[ctrl.key] !== undefined ? params[ctrl.key] : (ctrl.type === 'select' ? ctrl.options[0] : 0);

        if (ctrl.type === 'select') {
            row.appendChild(labelContainer);

            const select = document.createElement('select');
            select.className = 'rhythm-select';
            select.style.fontSize = '12px';
            select.style.padding = '4px';
            select.style.background = 'var(--bg-body)';
            select.style.color = 'var(--text-main)';
            select.style.border = '1px solid var(--border-main)';
            select.style.borderRadius = '4px';
            select.style.cursor = 'pointer';
            select.style.width = '100%';

            ctrl.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
                if (opt === currentVal) option.selected = true;
                select.appendChild(option);
            });

            select.addEventListener('change', (e) => {
                params[ctrl.key] = e.target.value;
                playDrum(rowType, getAudioCurrentTime());
                persistAppState();
            });

            row.appendChild(select);
        } else {
            const valSpan = document.createElement('span');
            valSpan.style.fontFamily = 'monospace';
            valSpan.textContent = `${currentVal}${ctrl.unit}`;
            labelContainer.appendChild(valSpan);
            row.appendChild(labelContainer);

            const input = document.createElement('input');
            input.type = 'range';
            input.min = ctrl.min;
            input.max = ctrl.max;
            input.step = ctrl.step;
            input.value = currentVal;
            input.style.width = '100%';
            input.style.cursor = 'pointer';

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                params[ctrl.key] = val;
                valSpan.textContent = `${val}${ctrl.unit}`;
            });

            input.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                params[ctrl.key] = val;
                playDrum(rowType, getAudioCurrentTime());
                persistAppState();
            });

            row.appendChild(input);
        }

        container.appendChild(row);
    });

    const sep = document.createElement('div');
    sep.style.borderBottom = '1px solid var(--border-main)';
    sep.style.margin = '6px 0';
    container.appendChild(sep);

    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const arrayBuffer = ev.target.result;
            await decodeCustomDrumSample(rowType, arrayBuffer);
            if (state.drumParams && state.drumParams[rowType]) {
                state.drumParams[rowType].pitch = 1.0;
            }
            updateCustomDrumsUI();
            renderDrumPartNestedPanel(rowType, container);
            
            const { renderRhythmTimeline } = await import('./rhythmEditor.js');
            renderRhythmTimeline();
        };
        reader.readAsArrayBuffer(file);
    });

    const loadBtn = document.createElement('button');
    loadBtn.className = 'control-btn primary';
    loadBtn.innerHTML = '📂 Load';
    loadBtn.style.fontSize = '11px';
    loadBtn.style.padding = '4px 8px';
    loadBtn.style.flex = '1';
    loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'control-btn secondary';
    clearBtn.innerHTML = '↺ Synth';
    clearBtn.style.fontSize = '11px';
    clearBtn.style.padding = '4px 8px';
    clearBtn.style.flex = '1';
    clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await clearCustomDrumSample(rowType);
        if (state.drumParams && state.drumParams[rowType]) {
            state.drumParams[rowType] = structuredClone(DEFAULT_DRUM_PARAMS[rowType]);
        }
        updateCustomDrumsUI();
        renderDrumPartNestedPanel(rowType, container);
        
        const { renderRhythmTimeline } = await import('./rhythmEditor.js');
        renderRhythmTimeline();
    });

    buttonRow.appendChild(fileInput);
    buttonRow.appendChild(loadBtn);
    buttonRow.appendChild(clearBtn);
    container.appendChild(buttonRow);
}