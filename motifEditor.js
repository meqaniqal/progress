/**
 * motifEditor.js
 * Visual canvas controllers for Relative Motif Editor grid and MIDI Phrase Cropper preview.
 */

import { parseMidiNotes, extractMotifNotes } from './midiPhraseSelector.js';

let appState = null;
let saveCallback = null;

// MIDI Cropper State
let cropperCanvas = null;
let cropperCtx = null;
let midiNotes = []; // Raw parsed midi notes: { pitch, time, duration, velocity }
let cropStart = 0; // in beats
let cropDuration = 4; // in beats
let isDraggingCropper = false;
let dragStartX = 0;
let dragStartCrop = 0;
let isResizingRight = false;

// Motif Editor Grid State
let editorCanvas = null;
let editorCtx = null;
const GRID_STEPS = 16; // 16 steps (16th notes in a 4-beat bar)
const MIN_SEMITONE = -12;
const MAX_SEMITONE = 12;
const NUM_ROWS = MAX_SEMITONE - MIN_SEMITONE + 1; // 25 rows

export function initMotifEditors(state, onStateChange) {
    appState = state;
    saveCallback = onStateChange;

    cropperCanvas = document.getElementById('midi-cropper-canvas');
    if (cropperCanvas) {
        cropperCtx = cropperCanvas.getContext('2d');
        setupCropperEvents();
    }

    editorCanvas = document.getElementById('motif-editor-canvas');
    if (editorCanvas) {
        editorCtx = editorCanvas.getContext('2d');
        setupEditorEvents();
    }
}

// ----------------------------------------------------
// 1. MIDI Phrase Cropper
// ----------------------------------------------------

export function setMidiNotesForCropper(rawNotes) {
    midiNotes = rawNotes;
    cropStart = 0;
    // Set default crop duration to 4 beats, or the length of the MIDI file if shorter
    const maxBeat = Math.max(4.0, ...midiNotes.map(n => n.time + n.duration));
    cropDuration = Math.min(4.0, maxBeat);
    drawMidiCropper();
    updateCropperDisplay();
}

export function getCroppedMotifNotes(extractionMode) {
    if (midiNotes.length === 0) return [];
    
    // Filter notes within crop range
    const inRange = midiNotes.filter(n => n.time >= cropStart && n.time < (cropStart + cropDuration));
    
    // Normalize times to start at 0
    const normalized = inRange.map(n => ({
        pitch: n.pitch,
        time: n.time - cropStart,
        duration: Math.min(n.duration, cropStart + cropDuration - n.time),
        velocity: n.velocity
    }));

    // Extract based on selection mode
    const extracted = extractMotifNotes(normalized, extractionMode);

    // Map pitches to relative pitch offsets from keyRoot
    const keyRoot = Number(appState.baseKey) || 60;
    return extracted.map(n => {
        // Calculate semitone offset relative to baseKey C4
        // Wrap/keep within +/- 2 octaves if needed, but direct offset is fine
        const pitchOffset = n.pitch - keyRoot;
        return {
            time: Math.round(n.time * 100) / 100,
            duration: Math.round(n.duration * 100) / 100,
            pitchOffset: pitchOffset,
            voiceIndex: n.voiceIndex || 0
        };
    });
}

function setupCropperEvents() {
    if (!cropperCanvas) return;

    const getMouseX = (e) => {
        const rect = cropperCanvas.getBoundingClientRect();
        return e.clientX - rect.left;
    };

    cropperCanvas.addEventListener('mousedown', (e) => {
        if (midiNotes.length === 0) return;
        const x = getMouseX(e);
        const maxTime = Math.max(4.0, ...midiNotes.map(n => n.time + n.duration));
        
        // Map canvas coordinates to beats
        const beatPerPx = maxTime / cropperCanvas.width;
        const currentPx = x;
        const cropStartPx = cropStart / beatPerPx;
        const cropEndPx = (cropStart + cropDuration) / beatPerPx;

        // Check if user clicked near the right edge of the crop window (resize handle)
        if (Math.abs(currentPx - cropEndPx) < 10) {
            isResizingRight = true;
        } else if (currentPx >= cropStartPx && currentPx <= cropEndPx) {
            isDraggingCropper = true;
            dragStartX = x;
            dragStartCrop = cropStart;
        } else {
            // Click outside shifts the window center
            const clickedBeat = x * beatPerPx;
            cropStart = Math.max(0, Math.min(maxTime - cropDuration, clickedBeat - cropDuration / 2));
            drawMidiCropper();
            updateCropperDisplay();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!cropperCanvas || midiNotes.length === 0) return;
        const rect = cropperCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const maxTime = Math.max(4.0, ...midiNotes.map(n => n.time + n.duration));
        const beatPerPx = maxTime / cropperCanvas.width;

        if (isResizingRight) {
            const currentBeat = x * beatPerPx;
            cropDuration = Math.max(0.5, Math.min(maxTime - cropStart, currentBeat - cropStart));
            drawMidiCropper();
            updateCropperDisplay();
        } else if (isDraggingCropper) {
            const diffBeats = (x - dragStartX) * beatPerPx;
            cropStart = Math.max(0, Math.min(maxTime - cropDuration, dragStartCrop + diffBeats));
            drawMidiCropper();
            updateCropperDisplay();
        }
    });

    const stopDrag = () => {
        isDraggingCropper = false;
        isResizingRight = false;
    };
    window.addEventListener('mouseup', stopDrag);
}

function updateCropperDisplay() {
    const el = document.getElementById('midi-cropper-bounds');
    if (el) {
        el.textContent = `${cropStart.toFixed(1)} - ${(cropStart + cropDuration).toFixed(1)} beats`;
    }
}

export function drawMidiCropper() {
    if (!cropperCanvas || !cropperCtx) return;
    const w = cropperCanvas.width;
    const h = cropperCanvas.height;

    // Clear
    cropperCtx.fillStyle = '#0a0a0c';
    cropperCtx.fillRect(0, 0, w, h);

    if (midiNotes.length === 0) {
        cropperCtx.fillStyle = '#666';
        cropperCtx.font = '11px sans-serif';
        cropperCtx.textAlign = 'center';
        cropperCtx.fillText('No MIDI loaded.', w / 2, h / 2);
        return;
    }

    // Determine scale bounds
    const maxTime = Math.max(4.0, ...midiNotes.map(n => n.time + n.duration));
    const pitches = midiNotes.map(n => n.pitch);
    const minPitch = Math.min(...pitches) - 1;
    const maxPitch = Math.max(...pitches) + 1;
    const pitchRange = maxPitch - minPitch || 12;

    const beatToPx = w / maxTime;

    // Draw grid beats
    cropperCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    cropperCtx.lineWidth = 1;
    for (let b = 0; b < maxTime; b++) {
        const x = b * beatToPx;
        cropperCtx.beginPath();
        cropperCtx.moveTo(x, 0);
        cropperCtx.lineTo(x, h);
        cropperCtx.stroke();
    }

    // Draw MIDI notes
    cropperCtx.fillStyle = '#818cf8'; // Neon indigo
    midiNotes.forEach(n => {
        const x = n.time * beatToPx;
        const noteW = Math.max(2, n.duration * beatToPx);
        // Invert y so higher pitches are at top
        const y = h - ((n.pitch - minPitch) / pitchRange) * h;
        const noteH = Math.max(2, h / pitchRange);

        cropperCtx.fillRect(x, y - noteH, noteW, noteH);
    });

    // Draw crop window overlay
    const cropX = cropStart * beatToPx;
    const cropW = cropDuration * beatToPx;

    cropperCtx.fillStyle = 'rgba(129, 140, 248, 0.2)';
    cropperCtx.fillRect(cropX, 0, cropW, h);

    cropperCtx.strokeStyle = '#818cf8';
    cropperCtx.lineWidth = 2;
    cropperCtx.strokeRect(cropX, 0, cropW, h);

    // Draw resize handle
    cropperCtx.fillStyle = '#818cf8';
    cropperCtx.fillRect(cropX + cropW - 4, 0, 4, h);
}

// ----------------------------------------------------
// 2. Motif Editor Grid
// ----------------------------------------------------

export function loadActiveMotifInEditor() {
    drawMotifEditor();
}

function setupEditorEvents() {
    if (!editorCanvas) return;

    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const cellW = editorCanvas.width / GRID_STEPS;
        const cellH = editorCanvas.height / NUM_ROWS;

        const step = Math.floor(x / cellW);
        const row = Math.floor(y / cellH);
        // Map row back to semitone offset
        const semitoneOffset = MAX_SEMITONE - row;

        const activeMotif = appState.userMotifs.find(m => m.id === appState.melodySettings.activeMotifId) || appState.userMotifs[0];
        if (!activeMotif) return;

        // Toggle note at step:
        // We quantize time to steps (step * 0.25 beats)
        const noteTime = step * 0.25;
        const existingIdx = activeMotif.notes.findIndex(n => Math.abs(n.time - noteTime) < 0.05 && n.pitchOffset === semitoneOffset);

        if (existingIdx !== -1) {
            // Delete note
            activeMotif.notes.splice(existingIdx, 1);
        } else {
            // Add note (default duration 0.5 beats = 8th note)
            activeMotif.notes.push({
                time: noteTime,
                duration: 0.5,
                pitchOffset: semitoneOffset,
                voiceIndex: 0
            });
        }

        drawMotifEditor();
        if (saveCallback) saveCallback();
    });
}

export function drawMotifEditor() {
    if (!editorCanvas || !editorCtx) return;
    const w = editorCanvas.width;
    const h = editorCanvas.height;

    // Clear
    editorCtx.fillStyle = '#111115';
    editorCtx.fillRect(0, 0, w, h);

    const cellW = w / GRID_STEPS;
    const cellH = h / NUM_ROWS;

    // Draw horizontal row guides
    for (let r = 0; r < NUM_ROWS; r++) {
        const y = r * cellH;
        const semitone = MAX_SEMITONE - r;

        // Highlight root pitch row (0 offset)
        if (semitone === 0) {
            editorCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            editorCtx.fillRect(0, y, w, cellH);
        }

        editorCtx.strokeStyle = semitone === 0 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)';
        editorCtx.lineWidth = 1;
        editorCtx.beginPath();
        editorCtx.moveTo(0, y);
        editorCtx.lineTo(w, y);
        editorCtx.stroke();
    }

    // Draw vertical step grid lines
    for (let s = 0; s <= GRID_STEPS; s++) {
        const x = s * cellW;
        // Highlight beat boundaries (every 4 steps)
        const isBeat = s % 4 === 0;
        editorCtx.strokeStyle = isBeat ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)';
        editorCtx.lineWidth = isBeat ? 1.5 : 1;
        editorCtx.beginPath();
        editorCtx.moveTo(x, 0);
        editorCtx.lineTo(x, h);
        editorCtx.stroke();
    }

    // Fetch active motif
    const activeMotif = appState.userMotifs.find(m => m.id === appState.melodySettings.activeMotifId) || appState.userMotifs[0];
    if (!activeMotif || !activeMotif.notes) return;

    // Draw notes
    activeMotif.notes.forEach(note => {
        // Map time (in beats) to step index
        const stepX = (note.time / 0.25) * cellW;
        const noteW = (note.duration / 0.25) * cellW;
        // Map pitchOffset to row
        const row = MAX_SEMITONE - note.pitchOffset;
        const y = row * cellH;

        // Draw note rectangle with neon glow style
        editorCtx.fillStyle = '#10b981'; // Emerald/Green glow
        editorCtx.fillRect(stepX + 1.5, y + 1.5, noteW - 3, cellH - 3);

        editorCtx.strokeStyle = '#34d399';
        editorCtx.lineWidth = 1;
        editorCtx.strokeRect(stepX + 1.5, y + 1.5, noteW - 3, cellH - 3);
    });
}
