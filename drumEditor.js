import { editorState, app, getCurrentPattern, setCurrentPattern, hasValidContext, getTimelineRect, getActiveGridValue, renderRhythmTimeline } from './rhythmEditor.js';
import { initDrumPattern, addDrumHit, removeDrumHit, updateDrumHit } from './patternUtils.js';
import { playDrum, getAudioCurrentTime } from './synth.js';
import { DRUM_ROWS } from './rhythmConfig.js';

export function highlightDrumHit(hitId) {
    if (editorState.activeTab !== 'drumPattern') return;
    const hitEl = document.querySelector(`.drum-hit[data-id="${hitId}"]`);
    if (hitEl) {
        hitEl.classList.add('playing');
        setTimeout(() => {
            if (hitEl) hitEl.classList.remove('playing');
        }, 150);

        if (editorState.isGlobal && !editorState.draggedHitId && !editorState.isPanning) {
            const container = document.getElementById('rhythm-timeline');
            if (!container) return;
            const hitRect = hitEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Check if hit is outside the visible timeline window (with a 30px buffer)
            if (hitRect.left < containerRect.left + 48 || hitRect.right > containerRect.right - 30) {
                const offset = hitRect.left - containerRect.left;
                // Scroll to position the hit on the left side, leaving room for the label
                container.scrollTo({ left: container.scrollLeft + offset - 60, behavior: 'auto' });
            }
        }
    }
}

export function initDrumInteractions(timeline) {
    let lastTapTime = 0;
    let lastTapCoords = { x: 0, y: 0 };
    let panStartX = 0;
    let panStartScrollLeft = 0;
    let cachedTimelineRect = null;

    timeline.addEventListener('wheel', (e) => {
        if (editorState.activeTab === 'drumPattern' && editorState.isGlobal && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? -0.2 : 0.2;
            const currentZoom = editorState.zoomLevel || 1.0;
            editorState.zoomLevel = Math.max(0.8, Math.min(4.0, currentZoom + zoomDelta));
            renderRhythmTimeline();
        }
    }, { passive: false });

    timeline.addEventListener('pointerdown', (e) => {
        if (editorState.activeTab !== 'drumPattern') return;
        e.stopPropagation();
        if (!hasValidContext()) return;
        const labelElement = e.target.closest('.drum-row-label');
        if (labelElement) return; // Prevent adding hits when clicking labels
        timeline.setPointerCapture(e.pointerId);

        cachedTimelineRect = getTimelineRect();
        const rect = cachedTimelineRect;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const timeRatio = Math.max(0, Math.min(1, x / rect.width));
        const rowIndex = Math.floor(y / (rect.height / DRUM_ROWS.length));
        const rowType = DRUM_ROWS[rowIndex];

        const hitElement = e.target.closest('.drum-hit');
        const now = Date.now();

        // Check for double tap
        const dist = Math.hypot(x - lastTapCoords.x, y - lastTapCoords.y);
        if (now - lastTapTime < 300 && dist < 20) {
            lastTapTime = 0; 
            
            app.saveHistoryState();
            let pattern = getCurrentPattern();
            
            if (!pattern || !Array.isArray(pattern.hits)) {
                pattern = initDrumPattern(pattern ? pattern.isLocalOverride : false);
            }

            if (hitElement) {
                if (hitElement.dataset.id === editorState.selectedHitId) editorState.selectedHitId = null;
                pattern = removeDrumHit(pattern, hitElement.dataset.id);
            } else {
                const actualGridValue = getActiveGridValue();
                let newTime = timeRatio;
                if (actualGridValue > 0) newTime = Math.round(newTime / actualGridValue) * actualGridValue;
                
                pattern = addDrumHit(pattern, { time: newTime, row: rowType, velocity: 1.0 });
                playDrum(rowType, getAudioCurrentTime());
            }
            
            setCurrentPattern(pattern);
            app.persistAppState();
            renderRhythmTimeline();
            return;
        }

        lastTapTime = now;
        lastTapCoords = { x, y };

        if (hitElement) {
            editorState.draggedHitId = hitElement.dataset.id;
            editorState.selectedHitId = hitElement.dataset.id;
            app.saveHistoryState();
        } else {
            editorState.selectedHitId = null;
            editorState.isPanning = true;
            panStartX = e.clientX;
            panStartScrollLeft = timeline.scrollLeft;
        }
    });

    timeline.addEventListener('pointermove', (e) => {
        if (editorState.activeTab !== 'drumPattern') return;
        if (editorState.isPanning) {
            const deltaX = e.clientX - panStartX;
            timeline.scrollLeft = panStartScrollLeft - deltaX;
            if (Math.abs(deltaX) > 5) lastTapTime = 0; 
            return;
        }
        if (!editorState.draggedHitId) return;

        const rect = cachedTimelineRect || getTimelineRect();
        const y = e.clientY - rect.top;
        const newRowIndex = Math.max(0, Math.min(DRUM_ROWS.length - 1, Math.floor(y / (rect.height / DRUM_ROWS.length))));
        const newRowType = DRUM_ROWS[newRowIndex];

        let x = e.clientX - rect.left;
        let newTime = Math.max(0, x / rect.width);
        
        const actualGridValue = getActiveGridValue();
        if (actualGridValue > 0 && !e.shiftKey) newTime = Math.round(newTime / actualGridValue) * actualGridValue;

        const pattern = getCurrentPattern();
        if (!pattern || !Array.isArray(pattern.hits)) return;

        const hit = pattern.hits.find(h => h.id === editorState.draggedHitId);
        if (hit && (hit.row !== newRowType || Math.abs(hit.time - newTime) > 0.001)) {
            const newPattern = updateDrumHit(pattern, editorState.draggedHitId, { row: newRowType, time: newTime });
            setCurrentPattern(newPattern);
            if (hit.row !== newRowType) playDrum(newRowType, getAudioCurrentTime()); 
            renderRhythmTimeline(); 
        }
    });

    timeline.addEventListener('pointerup', (e) => {
        cachedTimelineRect = null;
        if (editorState.activeTab !== 'drumPattern') return;

        if (editorState.isPanning) {
            editorState.isPanning = false;
            timeline.releasePointerCapture(e.pointerId);
        }
        if (editorState.draggedHitId) {
            timeline.releasePointerCapture(e.pointerId);
            editorState.draggedHitId = null;
            app.persistAppState();
            renderRhythmTimeline();
        }
    });

    timeline.addEventListener('pointercancel', (e) => {
        cachedTimelineRect = null;
        if (editorState.activeTab !== 'drumPattern') return;

        if (editorState.isPanning) {
            editorState.isPanning = false;
            timeline.releasePointerCapture(e.pointerId);
        }
        if (editorState.draggedHitId) {
            timeline.releasePointerCapture(e.pointerId);
            editorState.draggedHitId = null;
            renderRhythmTimeline();
        }
    });
}