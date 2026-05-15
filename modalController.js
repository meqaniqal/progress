import { state, getActiveProgression, persistAppState, resetSession } from './store.js';
import { generateAIPrompt } from './promptGenerator.js';
import { KEY_NAMES, updateKeyAndModeDisplay } from './ui.js';
import { setTrackVolume } from './synth.js';

export function initModals({ onResetPlayback, onRenderProgression }) {
    _initSettingsModal(onResetPlayback, onRenderProgression);
    _initAIPromptModal();
    _initManualModal();
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
            const activeProgression = getActiveProgression();
            if (activeProgression.length === 0) {
                alert("Please build a progression first.");
                return;
            }
            const promptText = generateAIPrompt(activeProgression, state.bpm, KEY_NAMES[state.baseKey], state.mode);
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