import { state, persistAppState, resetSession } from './store.js';
import { saveProjectToDB, getSavedProjectsFromDB, loadProjectFromDB, deleteProjectFromDB, clearAllProjectsFromDB } from './db.js';
import { getExportState } from './exportStateBuilder.js';
import { generateAIPrompt } from './promptGenerator.js';
import { KEY_NAMES, updateKeyAndModeDisplay } from './ui.js';
import { setTrackVolume } from './synth.js';
import { isSongTrayOpen } from './songController.js';
import { updateMicrotonalSettingsUI, syncUIToState } from './progressmain.js';

export function initModals({ onResetPlayback, onRenderProgression }) {
    _initSettingsModal(onResetPlayback, onRenderProgression);
    _initAIPromptModal();
    _initManualModal();
    _initProjectHubModal(onRenderProgression);
}

function _initSettingsModal(onResetPlayback, onRenderProgression) {
    const settingsBtn = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const resetSessionBtn = document.getElementById('btn-reset-session');
    
    if (!settingsBtn || !settingsModal || !closeSettingsBtn) return;

    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
        settingsModal.offsetHeight; // trigger reflow
        settingsModal.classList.add('visible');
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('visible');
        setTimeout(() => settingsModal.style.display = 'none', 200);
    });
    
    if (resetSessionBtn) {
        resetSessionBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to factory reset the app? All progress and settings will be permanently lost.")) {
                onResetPlayback();
                
                resetSession();
                
                // Sync UI with fresh state
                document.body.classList.toggle('show-helpers', state.showManualOnStartup);
                document.getElementById('key-selector').value = state.baseKey;
                updateKeyAndModeDisplay(state);
                document.getElementById('bpm-slider').value = state.bpm;
                
                ['master', 'chords', 'bass', 'bassHarmonic', 'drums'].forEach(track => {
                    const el = document.getElementById(`vol-${track}`);
                    if (el) {
                        el.value = state.volumes[track];
                        try { setTrackVolume(track, state.volumes[track]); } catch (err) {}
                    }
                });
                
                const multipassInput = document.getElementById('multipass-input');
                if (multipassInput) multipassInput.value = state.exportPasses;
                document.getElementById('voice-leading').checked = state.useVoiceLeading;
                const muteExtremeInput = document.getElementById('mute-extreme-notes');
                if (muteExtremeInput) muteExtremeInput.checked = state.muteExtremeNotes;
                
                const autoPanInput = document.getElementById('auto-pan-leading');
                if (autoPanInput) autoPanInput.checked = state.autoPanLeading;
                
                const midiExportSelector = document.getElementById('midi-export-routing');
                if (midiExportSelector) midiExportSelector.value = state.midiExportRouting || 'mpe';

                const tuningSelector = document.getElementById('tuning-selector');
                if (tuningSelector) tuningSelector.value = state.divisions || 12;
                
                updateMicrotonalSettingsUI();

                const expDrawInput = document.getElementById('experimental-draw-mode');
                if (expDrawInput) expDrawInput.checked = state.enableExperimentalDrawMode;
                
                const themeSelector = document.getElementById('theme-selector');
                if (themeSelector) themeSelector.value = state.theme;
                document.documentElement.setAttribute('data-theme', state.theme);
                
                onRenderProgression();
                
                settingsModal.classList.remove('visible');
                setTimeout(() => settingsModal.style.display = 'none', 200);
            }
        });
    }
}

function _initAIPromptModal() {
    const btnAiPrompt = document.getElementById('btn-ai-prompt');
    const btnClosePrompt = document.getElementById('btn-close-prompt');
    const btnCopyPrompt = document.getElementById('btn-copy-prompt');
    
    if (btnAiPrompt) {
        btnAiPrompt.addEventListener('click', () => {
            const exportState = getExportState(isSongTrayOpen);
            const macroProgression = exportState.currentProgression.slice(exportState.loopStart, exportState.loopEnd);
            if (macroProgression.length === 0) {
                alert("Please build a progression first.");
                return;
            }
            const promptText = generateAIPrompt(macroProgression, state.bpm, KEY_NAMES[state.baseKey], state.mode);
            const modal = document.getElementById('ai-prompt-modal');
            const textArea = document.getElementById('ai-prompt-text');
            textArea.value = promptText;
            
            modal.style.display = 'flex';
            modal.offsetHeight;
            modal.classList.add('visible');
        });
    }

    if (btnClosePrompt) {
        btnClosePrompt.addEventListener('click', () => {
            const modal = document.getElementById('ai-prompt-modal');
            modal.classList.remove('visible');
            setTimeout(() => modal.style.display = 'none', 200);
        });
    }

    if (btnCopyPrompt) {
        btnCopyPrompt.addEventListener('click', (e) => {
            const textArea = document.getElementById('ai-prompt-text');
            textArea.select();
            const copyBtn = e.target;
            const originalText = copyBtn.textContent;
            
            navigator.clipboard.writeText(textArea.value).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = originalText, 2000);
            }).catch(() => {
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = originalText, 2000);
            });
        });
    }
}

function _initProjectHubModal(onRenderProgression) {
    const btnHub = document.getElementById('btn-project-hub');
    const hubModal = document.getElementById('project-hub-modal');
    const closeHubBtn = document.getElementById('btn-close-project-hub');
    const btnSave = document.getElementById('btn-save-project');
    const inputName = document.getElementById('project-name-input');
    const listEl = document.getElementById('saved-projects-list');
    const btnDownload = document.getElementById('btn-download-project');
    const btnUpload = document.getElementById('btn-upload-project');
    const fileInput = document.getElementById('project-file-input');
    const btnClearAll = document.getElementById('btn-clear-all-projects');

    const renderProjectList = async () => {
        if (!listEl) return;
        const projects = await getSavedProjectsFromDB();
        const names = Object.keys(projects).sort((a, b) => (projects[b]._savedAt || 0) - (projects[a]._savedAt || 0));
        
        if (names.length === 0) {
            listEl.innerHTML = '<div style="opacity: 0.5; font-size: 13px; text-align: center; padding: 10px;">No saved projects.</div>';
            return;
        }
        
        listEl.innerHTML = names.map(name => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px;">
                <strong style="font-size: 14px; color: var(--text-main);">${name}</strong>
                <div style="display: flex; gap: 6px;">
                    <button class="control-btn primary btn-sm btn-load-project" data-name="${name}">Load</button>
                    <button class="control-btn secondary btn-sm btn-delete-project" data-name="${name}" style="color: #ef4444; border-color: rgba(239,68,68,0.5); padding: 4px 8px;">🗑</button>
                </div>
            </div>
        `).join('');
        
        listEl.querySelectorAll('.btn-load-project').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const name = e.target.dataset.name;
                const projData = await loadProjectFromDB(name);
                if (projData) {
                    if (confirm(`Load project "${name}"? Unsaved changes will be lost.`)) {
                        resetSession();
                        syncUIToState(projData);
                        onRenderProgression();
                        hubModal.classList.remove('visible');
                        setTimeout(() => hubModal.style.display = 'none', 200);
                    }
                }
            });
        });

        listEl.querySelectorAll('.btn-delete-project').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const name = e.target.dataset.name;
                if (confirm(`Delete project "${name}" forever?`)) {
                    await deleteProjectFromDB(name);
                    await renderProjectList();
                }
            });
        });
    };

    if (btnSave && inputName) {
        btnSave.addEventListener('click', async () => {
            const name = inputName.value.trim();
            if (!name) { alert("Please enter a project name."); return; }
            await saveProjectToDB(name, state);
            inputName.value = '';
            await renderProjectList();
        });
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            const { history, ...stateToSave } = state;
            const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const name = inputName.value.trim() || 'progress_project';
            a.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const projData = JSON.parse(ev.target.result);
                    if (confirm(`Load project from file? Unsaved changes will be lost.`)) {
                        resetSession();
                        syncUIToState(projData);
                        onRenderProgression();
                        hubModal.classList.remove('visible');
                        setTimeout(() => hubModal.style.display = 'none', 200);
                    }
                } catch (err) {
                    alert("Invalid project file.");
                }
            };
            reader.readAsText(file);
            fileInput.value = ''; // Reset input so the same file can be chosen again
        });
    }

    if (btnClearAll) {
        btnClearAll.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete all saved projects from the browser database?')) {
                await clearAllProjectsFromDB();
                await renderProjectList();
            }
        });
    }

    if (btnHub && hubModal && closeHubBtn) {
        btnHub.addEventListener('click', async () => {
            await renderProjectList();
            hubModal.style.display = 'flex';
            hubModal.offsetHeight; // trigger reflow
            hubModal.classList.add('visible');
        });

        closeHubBtn.addEventListener('click', () => {
            hubModal.classList.remove('visible');
            setTimeout(() => hubModal.style.display = 'none', 200);
        });
    }
}

function _initManualModal() {
    const settingsBtn = document.getElementById('btn-settings');
    if (!document.getElementById('btn-manual') && settingsBtn) {
        const manualBtn = document.createElement('button');
        manualBtn.id = 'btn-manual';
        manualBtn.className = settingsBtn.className;
        manualBtn.title = 'App Manual';
        manualBtn.innerHTML = '📖';
        settingsBtn.parentNode.insertBefore(manualBtn, settingsBtn.nextSibling);
    }

    if (!document.getElementById('manual-modal')) {
        const modal = document.createElement('div');
        modal.id = 'manual-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Progress Basics</h2>
                <p style="margin-bottom: 20px; line-height: 1.6;">
                    There are 3 main vertical sections: the chord selector, the chord tray where the chord progression lives, and the chord swap section. You can add chords from the chord selector to the chord tray via drag/drop, or double tap to add to the end of the progression. Chords can be dragged around in the tray to reorder them. Tapping a chord to select it gives it a green border and the chord swap panel below lets you click to swap out that chord for other candidates. There is a play button to start/stop playback...you can also doubletap on empty parts of the app to start/stop playback. There are loop brackets embedded in the chord tray that can be dragged to select the area of the chord progression you want to loop. Thats the basics. I will make a youtube walkthrough pretty soon and have a link in the app to it.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="cb-show-manual"> Show this on startup
                    </label>
                    <button id="btn-close-manual" class="control-btn primary">Got it</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const manualBtn = document.getElementById('btn-manual');
    const manualModal = document.getElementById('manual-modal');
    const closeBtn = document.getElementById('btn-close-manual');
    const cbShowManual = document.getElementById('cb-show-manual');

    if (manualBtn && manualModal && closeBtn && cbShowManual) {
        cbShowManual.checked = state.showManualOnStartup;
        
        cbShowManual.addEventListener('change', (e) => {
            state.showManualOnStartup = e.target.checked;
            document.body.classList.toggle('show-helpers', state.showManualOnStartup);
            persistAppState();
        });

        manualBtn.addEventListener('click', () => {
            cbShowManual.checked = state.showManualOnStartup;
            manualModal.style.display = 'flex';
            manualModal.offsetHeight;
            manualModal.classList.add('visible');
        });

        closeBtn.addEventListener('click', () => {
            manualModal.classList.remove('visible');
            setTimeout(() => manualModal.style.display = 'none', 200);
        });

        if (state.showManualOnStartup) {
            setTimeout(() => {
                manualModal.style.display = 'flex';
                manualModal.offsetHeight;
                manualModal.classList.add('visible');
            }, 500);
        }
    }
}