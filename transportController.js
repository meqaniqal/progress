import { state, getActiveProgression, persistAppState, switchActiveSection } from './store.js';
import { playProgression, stopAllAudio } from './sequencer.js';
import { highlightChordInUI } from './ui.js';
import { highlightDrumHit } from './rhythmEditor.js';
import { setTrackVolume } from './synth.js';
import { updateSongUI, setActiveSequenceIndex } from './songController.js';

let isPlaying = false;
let currentPlaybackStopFunction = null;
let _onRenderProgression = null;

export function isPlaybackActive() {
    return isPlaying;
}

export function resetTransport() {
    if (currentPlaybackStopFunction) currentPlaybackStopFunction();
    stopAllAudio();
    isPlaying = false;
    const playToggleBtn = document.getElementById('btn-play-toggle');
    if (playToggleBtn) playToggleBtn.textContent = '▶';
    currentPlaybackStopFunction = null;
}

export function initTransport(callbacks) {
    if (callbacks) _onRenderProgression = callbacks.onRenderProgression;

    const playToggleBtn = document.getElementById('btn-play-toggle');
    const volPopup = document.getElementById('super-volume-popup');
    const volFill = document.getElementById('super-volume-fill');
    
    let playDragStartY = 0;
    let isPlayDragging = false;
    let playDragStartedAsClick = false;
    let initialVol = 1.0;
    let wasDragging = false;

    playToggleBtn.addEventListener('pointerdown', (e) => {
        playDragStartY = e.clientY;
        isPlayDragging = false;
        wasDragging = false;
        playDragStartedAsClick = true;
        initialVol = state.volumes.master || 1.0;
        
        if (volFill) {
            volFill.style.height = `${(initialVol / 4.0) * 100}%`;
            if (initialVol > 1.0) {
                volFill.style.backgroundColor = '#ef4444';
                volFill.style.boxShadow = '0 0 10px #ef4444';
            } else {
                volFill.style.backgroundColor = 'var(--ctrl-primary-bg)';
                volFill.style.boxShadow = 'none';
            }
        }
        playToggleBtn.setPointerCapture(e.pointerId);
    });

    playToggleBtn.addEventListener('pointermove', (e) => {
        if (!playDragStartedAsClick) return;
        const deltaY = playDragStartY - e.clientY; 
        
        if (!isPlayDragging && Math.abs(deltaY) > 10) {
            isPlayDragging = true;
            wasDragging = true;
            if (volPopup) volPopup.style.display = 'flex';
        }
        
        if (isPlayDragging) {
            let newVol = initialVol + (deltaY / 40);
            newVol = Math.max(0.0, Math.min(4.0, newVol));
            
            state.volumes.master = newVol;
            try { setTrackVolume('master', newVol); } catch (err) {}
            
            if (volFill) {
                volFill.style.height = `${(newVol / 4.0) * 100}%`;
                if (newVol > 1.0) {
                    volFill.style.backgroundColor = '#ef4444';
                    volFill.style.boxShadow = '0 0 10px #ef4444';
                } else {
                    volFill.style.backgroundColor = 'var(--ctrl-primary-bg)';
                    volFill.style.boxShadow = 'none';
                }
            }
        }
    });

    const handlePlayPointerUp = (e) => {
        if (!playDragStartedAsClick) return;
        playDragStartedAsClick = false;
        playToggleBtn.releasePointerCapture(e.pointerId);
        
        if (volPopup) volPopup.style.display = 'none';

        if (isPlayDragging) {
            persistAppState();
            const masterSlider = document.getElementById('vol-master');
            if (masterSlider) masterSlider.value = state.volumes.master;
        }
        isPlayDragging = false;
    };

    playToggleBtn.addEventListener('pointerup', handlePlayPointerUp);
    playToggleBtn.addEventListener('pointercancel', handlePlayPointerUp);

    playToggleBtn.addEventListener('click', (e) => {
        if (wasDragging) {
            wasDragging = false;
            return;
        }
        if (isPlaying) {
            resetTransport();
        } else {
            currentPlaybackStopFunction = playProgression(
                () => state, // Pass raw state, the new macro engine handles active swaps dynamically
                (index, sectionId, macroIndex) => {
                    if (macroIndex !== undefined) setActiveSequenceIndex(macroIndex);
                    if (sectionId && sectionId !== state.activeSectionId) {
                        switchActiveSection(sectionId);
                        updateSongUI();
                        if (_onRenderProgression) _onRenderProgression();
                    } else if (macroIndex !== undefined) {
                        updateSongUI(); // Update macro sequencer tray highlights
                    }
                    highlightChordInUI(index);
                },
                () => {
                    playToggleBtn.textContent = '▶';
                    isPlaying = false;
                    currentPlaybackStopFunction = null;
                },
                highlightDrumHit
            );
            playToggleBtn.textContent = '■';
            isPlaying = true;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault(); 
            playToggleBtn.click();
        }
    });
}