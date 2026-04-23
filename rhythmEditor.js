import { sliceInstance, toggleSelection, applyArpSettings, moveInstance, fillGapInstance } from './patternUtils.js?v=3';

let activeRhythmIndex = null;
let activeRhythmTool = 'move'; // 'move', 'slice', 'select'

// App state references
let appState = null;
let dispatchSaveHistory = null;
let dispatchPersist = null;
let dispatchRender = null;
let dispatchOnClose = null;

export function initRhythmEditor({ state, saveHistoryState, persistAppState, renderProgression, onClose }) {
    appState = state;
    dispatchSaveHistory = saveHistoryState;
    dispatchPersist = persistAppState;
    dispatchRender = renderProgression;
    dispatchOnClose = onClose;

    document.getElementById('btn-close-rhythm').addEventListener('click', () => {
        if (dispatchOnClose) dispatchOnClose();
    });

    // --- Tool Selection ---
    const toolBtns = document.querySelectorAll('.rhythm-toolbar .tool-btn');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toolBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeRhythmTool = e.currentTarget.dataset.tool;
        });
    });

    // --- Apply Arp Button ---
    document.getElementById('btn-apply-arp').addEventListener('click', () => {
        if (activeRhythmIndex === null) return;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;

        const selectedInsts = chord.pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) {
            alert("Please select at least one instance using the Select tool.");
            return;
        }

        // Toggle logic: If the first selected block has an arp, remove it. Otherwise, add a default arp.
        const hasArp = selectedInsts[0].arpSettings !== null;
        const newSettings = hasArp ? null : { style: 'up', rate: 0.25, gate: 0.8 };

        dispatchSaveHistory();
        chord.pattern = applyArpSettings(chord.pattern, selectedInsts.map(i => i.id), newSettings);
        dispatchPersist();
        renderRhythmTimeline();
    });

    // --- Timeline Interactions (Pointer Events for Mobile + Desktop) ---
    const timeline = document.getElementById('rhythm-timeline');
    let isDragging = false;
    let draggedInstanceId = null;
    let dragStartX = 0;
    let originalStartTime = 0;

    timeline.addEventListener('pointerdown', (e) => {
        const instanceEl = e.target.closest('.rhythm-instance');
        if (!instanceEl || activeRhythmIndex === null) return;
        
        const instId = instanceEl.dataset.id;
        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;

        if (activeRhythmTool === 'slice') {
            const rect = instanceEl.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const splitRatio = clickX / rect.width;
            
            // Prevent slicing too close to the extreme edges (e.g., < 5% or > 95%)
            if (splitRatio > 0.05 && splitRatio < 0.95) {
                dispatchSaveHistory();
                chord.pattern = sliceInstance(chord.pattern, instId, splitRatio);
                dispatchPersist();
                renderRhythmTimeline();
            }
        } 
        else if (activeRhythmTool === 'select') {
            dispatchSaveHistory();
            const inst = chord.pattern.instances.find(i => i.id === instId);
            if (inst) {
                chord.pattern = toggleSelection(chord.pattern, [instId], !inst.isSelected);
                dispatchPersist();
                renderRhythmTimeline();
            }
        }
        else if (activeRhythmTool === 'move') {
            dispatchSaveHistory(); // Save state before the drag begins for Undo support
            isDragging = true;
            draggedInstanceId = instId;
            dragStartX = e.clientX;
            const inst = chord.pattern.instances.find(i => i.id === instId);
            originalStartTime = inst ? inst.startTime : 0;
            
            // Capture the pointer so if they drag outside the timeline box, we don't lose tracking
            timeline.setPointerCapture(e.pointerId);
        }
    });

    timeline.addEventListener('pointermove', (e) => {
        if (!isDragging || !draggedInstanceId || activeRhythmTool !== 'move') return;
        
        const deltaX = e.clientX - dragStartX;
        const rect = timeline.getBoundingClientRect();
        const deltaRatio = deltaX / rect.width;
        
        let newStartTime = originalStartTime + deltaRatio;

        // Grid Snapping Math
        const gridValue = parseFloat(document.getElementById('rhythm-grid-select').value);
        if (gridValue > 0 && !e.shiftKey) {
            newStartTime = Math.round(newStartTime / gridValue) * gridValue;
        }

        const chord = appState.currentProgression[activeRhythmIndex];
        const inst = chord.pattern.instances.find(i => i.id === draggedInstanceId);
        
        // Clamp within the bounds of the chord slot (0.0 to 1.0)
        newStartTime = Math.max(0, Math.min(newStartTime, 1.0 - inst.duration));

        if (inst.startTime !== newStartTime) {
            chord.pattern = moveInstance(chord.pattern, draggedInstanceId, newStartTime);
            renderRhythmTimeline(); // Visually update immediately
        }
    });

    timeline.addEventListener('pointerup', (e) => {
        if (isDragging) {
            isDragging = false;
            draggedInstanceId = null;
            timeline.releasePointerCapture(e.pointerId);
            dispatchPersist(); // Save the final dragged position to local storage
        }
    });

    timeline.addEventListener('pointercancel', (e) => {
        isDragging = false;
        draggedInstanceId = null;
    });

    // --- Add Slice on Empty Area Double-Click ---
    timeline.addEventListener('dblclick', (e) => {
        // Ignore double clicks that hit an existing instance directly
        if (e.target.closest('.rhythm-instance')) return;
        if (activeRhythmIndex === null) return;

        const chord = appState.currentProgression[activeRhythmIndex];
        if (!chord || !chord.pattern) return;

        const rect = timeline.getBoundingClientRect();
        const clickRatio = (e.clientX - rect.left) / rect.width;

        dispatchSaveHistory();
        chord.pattern = fillGapInstance(chord.pattern, clickRatio);
        dispatchPersist();
        renderRhythmTimeline();
    });
}

export function openRhythmEditor(index) {
    activeRhythmIndex = index;
    
    const chord = appState.currentProgression[index];
    if (!chord) { closeRhythmEditor(); return; }

    document.getElementById('rhythm-editor-title').textContent = `Rhythm Editor: ${chord.symbol}`;
    
    renderRhythmTimeline();
    
    const panel = document.getElementById('rhythm-editor-panel');
    panel.style.display = 'block';
}

export function closeRhythmEditor() {
    activeRhythmIndex = null;
    const panel = document.getElementById('rhythm-editor-panel');
    if (panel) panel.style.display = 'none';
}

function renderRhythmTimeline() {
    const container = document.getElementById('rhythm-timeline');
    container.innerHTML = '';
    if (activeRhythmIndex === null) return;
    
    const chord = appState.currentProgression[activeRhythmIndex];
    const pattern = chord.pattern || { instances: [] };
    
    pattern.instances.forEach(inst => {
        const el = document.createElement('div');
        el.className = 'rhythm-instance';
        el.dataset.id = inst.id;
        if (inst.isSelected) el.classList.add('selected');
        if (inst.arpSettings) el.classList.add('arp-active');
        
        // The timeline is normalized 0.0 to 1.0, so we convert directly to percentages
        el.style.left = `${inst.startTime * 100}%`;
        el.style.width = `${inst.duration * 100}%`;
        
        container.appendChild(el);
    });
}