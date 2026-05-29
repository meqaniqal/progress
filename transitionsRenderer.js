import { getPlayableNotes } from './theory.js';

export const TRANS_COLORS = {
    'auto-smooth': { bg: 'rgba(59, 130, 246, 0.4)', border: 'rgba(59, 130, 246, 0.8)', active: 'var(--ctrl-primary-bg)', text: '〰️ Auto' },
    'passing': { bg: 'rgba(34, 197, 94, 0.4)', border: 'rgba(34, 197, 94, 0.8)', active: '#16a34a', text: '↗️ Pass' },
    'suspend': { bg: 'rgba(234, 179, 8, 0.4)', border: 'rgba(234, 179, 8, 0.8)', active: '#ca8a04', text: '⏸️ Sus' },
    'anticipate': { bg: 'rgba(168, 85, 247, 0.4)', border: 'rgba(168, 85, 247, 0.8)', active: '#9333ea', text: '⏪ Ant' },
    'suspend-all': { bg: 'rgba(234, 179, 8, 0.4)', border: 'rgba(234, 179, 8, 0.8)', active: '#ca8a04', text: '⏸️ Sus All' }
};

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

    if (pattern && pattern.transitions) {
        pattern.transitions.forEach(trans => {
            let topPct = 0;
            if (trans.voiceIndex === 'master') {
                topPct = 0;
            } else {
                const vIdx = parseInt(trans.voiceIndex, 10);
                topPct = (vIdx + 1) * laneHeight;
            }
            
            const typeDef = TRANS_COLORS[trans.type] || TRANS_COLORS['passing'];
            const isSelected = trans.isSelected;
            const bg = isSelected ? typeDef.active : typeDef.bg;
            const border = isSelected ? '1px solid #fff' : `1px solid ${typeDef.border}`;
            const blockHeight = `calc(${laneHeight}% - 4px)`;
            const blockTop = `calc(${topPct}% + 2px)`;
            
            let labelText = typeDef.text;
            if (trans.duration < 0.08) {
                labelText = ''; // Strip text if unreadably small, showing only color
            } else if (trans.duration < 0.15) {
                labelText = typeDef.text.split(' ')[0]; // Show icon only if somewhat narrow
            }
            
            html += `
                <div class="transition-block" data-id="${trans.id}" style="position: absolute; left: ${trans.startTime * 100}%; top: ${blockTop}; width: ${trans.duration * 100}%; height: ${blockHeight}; background: ${bg}; border: ${border}; border-radius: 4px; z-index: 10; cursor: pointer; display: flex; align-items: center;">
                    <span style="font-size: 10px; font-weight: bold; color: #fff; padding-left: 4px; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: clip;">${labelText}</span>
                    <div class="transition-resize-handle right" style="position: absolute; right: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize;"></div>
                </div>
            `;
        });
    }

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