import { exportToWav } from './wavExport.js';
import { state, getExportState } from './store.js';
import { isSongTrayOpen } from './songController.js';

export function initExportUI() {
    const exportWavSwitch = document.getElementById('btn-export-wav-switch');
    const exportWavContainer = document.getElementById('export-wav-container');
    if (!exportWavSwitch || !exportWavContainer) return;

    let isPointerDown = false;
    let hasDragged = false;
    let exportStartX = 0;
    let exportMode = 'wav'; // 'wav' or 'stems'

    const performStemsExport = (baseExportState) => {
        const tracks = ['chords', 'bass', 'bassHarmonic', 'drums'];
        let delay = 0;

        tracks.forEach((track) => {
            if (baseExportState.volumes[track] > 0.01) {
                const exportState = JSON.parse(JSON.stringify(baseExportState));
                
                // Solo the current track by muting everything else
                tracks.forEach(t => {
                    if (t !== track) {
                        exportState.volumes[t] = 0;
                    }
                });

                setTimeout(() => {
                    // Use a dummy element so the internal export engine doesn't mess with our button's label
                    const dummyBtn = document.createElement('button');
                    exportToWav(exportState, dummyBtn);
                }, delay);
                
                delay += 1000; // Stagger downloads by 1s to prevent browser blockage
            }
        });

        return new Promise(resolve => setTimeout(resolve, delay + 500));
    };

    exportWavSwitch.addEventListener('pointerdown', (e) => {
        isPointerDown = true;
        hasDragged = false;
        exportStartX = e.clientX;
        exportWavSwitch.dataset.dragStartMode = exportMode; // Store initial mode
        exportWavSwitch.setPointerCapture(e.pointerId);
        exportWavSwitch.style.transform = 'scale(0.95)';
        exportWavSwitch.style.transition = 'margin-left 0.1s cubic-bezier(0.4, 0.0, 0.2, 1), background-color 0.2s ease, transform 0.1s ease';
        exportWavContainer.classList.remove('button-mode');
    });

    exportWavSwitch.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        const deltaX = e.clientX - exportStartX;
        
        if (Math.abs(deltaX) > 10) {
            hasDragged = true;
        }
        
        const startMode = exportWavSwitch.dataset.dragStartMode || 'wav';
        let targetMode = startMode;

        // Only act if the threshold is strictly crossed, creating a hard physical snap
        if (startMode === 'wav' && deltaX > 25) {
            targetMode = 'stems';
        } else if (startMode === 'stems' && deltaX < -25) {
            targetMode = 'wav';
        }

        if (exportMode !== targetMode) {
            exportMode = targetMode;
            if (exportMode === 'stems') {
                exportWavSwitch.textContent = '💾 Stems';
                exportWavSwitch.style.backgroundColor = 'var(--ctrl-primary-hover)';
                exportWavSwitch.style.marginLeft = '34px';
            } else {
                exportWavSwitch.textContent = '💾 WAV';
                exportWavSwitch.style.backgroundColor = '';
                exportWavSwitch.style.marginLeft = '0px';
            }
        }
    });

    exportWavSwitch.addEventListener('pointerup', (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        exportWavSwitch.releasePointerCapture(e.pointerId);
        exportWavSwitch.style.transform = '';
        exportWavContainer.classList.add('button-mode');
        
        if (hasDragged) {
            return; // User was just changing modes, abort export
        }
        
        const exportState = getExportState(isSongTrayOpen);
        const totalBeats = exportState.currentProgression.slice(exportState.loopStart, exportState.loopEnd).reduce((sum, chord) => sum + (Number(chord.duration) || 4), 0);
        const loopDurationMin = (totalBeats / exportState.bpm);
        const totalExportMin = loopDurationMin * exportState.exportPasses;
        
        if (totalExportMin > 3.0) {
            const recommendedPasses = Math.max(1, Math.floor(3.0 / loopDurationMin));
            const confirmMsg = `This export will generate ${totalExportMin.toFixed(1)} minutes of audio.\n\nTo prevent massive file sizes and long rendering times, we recommend capping this to ${recommendedPasses} pass(es) (${(loopDurationMin * recommendedPasses).toFixed(1)} mins).\n\nClick OK to proceed with ${recommendedPasses} pass(es), or Cancel to abort.`;
            if (confirm(confirmMsg)) {
                exportState.exportPasses = recommendedPasses;
            } else {
                return; // Abort export
            }
        }

        const finalMode = exportMode;
        const originalText = exportWavSwitch.textContent;
        const originalBg = exportWavSwitch.style.backgroundColor;
        const originalMargin = exportWavSwitch.style.marginLeft;

        exportWavSwitch.textContent = finalMode === 'wav' ? '⏳ WAV...' : '⏳ Stems...';
        exportWavSwitch.disabled = true;
        
        // Give UI time to update before blocking main thread
        setTimeout(async () => {
            try {
                if (finalMode === 'wav') {
                    const dummyBtn = document.createElement('button');
                    await exportToWav(exportState, dummyBtn);
                } else {
                    await performStemsExport(exportState);
                }
            } catch (err) {
                console.error("Export failed:", err);
            } finally {
                exportWavSwitch.textContent = originalText;
                exportWavSwitch.style.backgroundColor = originalBg;
                exportWavSwitch.style.marginLeft = originalMargin;
                exportWavSwitch.disabled = false;
            }
        }, 50);
    });

    exportWavSwitch.addEventListener('pointercancel', (e) => {
        isPointerDown = false;
        exportWavSwitch.releasePointerCapture(e.pointerId);
        exportWavSwitch.style.transform = '';
        exportWavContainer.classList.add('button-mode');
    });

    // Restore switch look when interacting elsewhere
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('#export-wav-container')) {
            exportWavContainer.classList.remove('button-mode');
        }
    });
}