import { getPlayableNotes } from './theory.js';

export function renderTransitionsTimeline(container, pattern, editorState, app) {
    container.style.overflowX = 'hidden';
    container.style.touchAction = 'none';

    // Clean up nodes belonging to other modules
    const leftoverDrumGrid = container.querySelector('.drum-grid');
    if (leftoverDrumGrid) leftoverDrumGrid.remove();
    const existingNodes = Array.from(container.querySelectorAll('.rhythm-instance'));
    existingNodes.forEach(node => node.remove());
    const prGrid = container.querySelector('.piano-roll-grid');
    if (prGrid) prGrid.remove();
    const sliceInner = container.querySelector('.slice-timeline-inner');
    if (sliceInner) sliceInner.remove();

    let chordNotes = [60, 64, 67, 71]; 
    if (!editorState.isGlobal && editorState.activeIndex !== null) {
        const mockProg = app.state.currentProgression.map((c, i) => {
            const swap = app.state.temporarySwaps ? app.state.temporarySwaps[i] : null;
            return swap ? { ...c, ...swap } : c;
        });
        const playable = getPlayableNotes(mockProg, app.state);
        if (playable[editorState.activeIndex]) {
            chordNotes = playable[editorState.activeIndex];
        }
    }

    const uniqueNotes = [...new Set(chordNotes)].sort((a, b) => b - a); // Top note first
    const laneCount = uniqueNotes.length + 1; // Voices + Master
    const laneHeight = 100 / laneCount;

    let html = `
        <div class="transition-lane master-lane" data-voice="master" style="position: absolute; top: 0; left: 0; width: 100%; height: ${laneHeight}%; border-bottom: 1px solid var(--border-main); background: rgba(255, 255, 255, 0.05); display: flex; align-items: center; padding-left: 10px; box-sizing: border-box;">
            <span style="font-size: 11px; font-weight: bold; color: var(--text-main); opacity: 0.8; pointer-events: none;">All notes</span>
        </div>
    `;

    uniqueNotes.forEach((note, idx) => {
        const topPct = (idx + 1) * laneHeight;
        html += `
            <div class="transition-lane voice-lane" data-voice="${idx}" style="position: absolute; top: ${topPct}%; left: 0; width: 100%; height: ${laneHeight}%; border-bottom: 1px solid var(--border-main); background: transparent; display: flex; align-items: center; padding-left: 10px; box-sizing: border-box; cursor: pointer;">
                <span style="font-size: 11px; font-weight: bold; color: var(--text-main); opacity: 0.6; pointer-events: none;">Note ${idx + 1}</span>
            </div>
        `;
    });

    let laneContainer = container.querySelector('.transitions-container');
    if (!laneContainer) {
        laneContainer = document.createElement('div');
        laneContainer.className = 'transitions-container';
        laneContainer.style.position = 'absolute';
        laneContainer.style.top = '0';
        laneContainer.style.left = '0';
        laneContainer.style.width = '100%';
        laneContainer.style.height = '100%';
        container.appendChild(laneContainer);
    }
    
    laneContainer.innerHTML = html;
}