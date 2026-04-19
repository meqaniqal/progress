import { saveState, loadState } from './storage.js';
import { chordDictionary, applyVoiceLeading } from './theory.js';
import { CONFIG } from './config.js';
import { auditionChord, playProgression, stopProgression } from './audio.js';
import { setupDragZone, setupDraggableSource } from './dragdrop.js';
import { exportToMidi } from './midi.js';

        // --- Single Source of Truth ---
        const state = {
            currentProgression: [],
            bpm: 90,
            isLooping: true,
            useVoiceLeading: true,
            loopStart: 0,
            loopEnd: 0,
            theme: 'light'
        };
        let isPlaying = false;

        function sanitizeLoopBounds() {
            const len = state.currentProgression.length;
            if (typeof state.loopStart !== 'number') state.loopStart = 0;
            if (typeof state.loopEnd !== 'number') state.loopEnd = len;
            
            if (len === 0) {
                state.loopStart = 0;
                state.loopEnd = 0;
                return;
            }
            
            // Ensure bounds are always mathematically valid and surround >= 1 chord
            if (state.loopStart < 0) state.loopStart = 0;
            if (state.loopStart >= len) state.loopStart = len - 1;
            
            if (state.loopEnd <= state.loopStart) state.loopEnd = state.loopStart + 1;
            if (state.loopEnd > len) state.loopEnd = len;
        }

        function addChord(numeral) {
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.push(numeral);
            
            if (isAtEnd) state.loopEnd = state.currentProgression.length;
            
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        }

        function removeChord(index) {
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.splice(index, 1);
            
            if (isAtEnd) {
                state.loopEnd = state.currentProgression.length;
            } else if (index < state.loopEnd) {
                state.loopEnd--;
            }
            
            if (index < state.loopStart) {
                state.loopStart--;
            }
            
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        }

        function clearProgression() {
            stopProgression(highlightChordInUI);
            isPlaying = false;
            if (document.getElementById('btn-play-toggle')) document.getElementById('btn-play-toggle').textContent = '▶';
            state.currentProgression = [];
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        }

        function persistAppState() {
            saveState(state);
        }

        function createBracketElement(id, text) {
            const br = document.createElement('div');
            br.id = id;
            br.textContent = text;
            br.draggable = true;
            Object.assign(br.style, {
                display: 'inline-block',
                fontSize: '36px',
                fontWeight: '200',
                color: 'var(--bracket-color)',
                margin: '0 4px',
                cursor: 'ew-resize',
                userSelect: 'none',
                verticalAlign: 'top',
                lineHeight: '40px',
                fontFamily: 'monospace'
            });
            return br;
        }

        // --- UI Rendering ---
        function renderProgression() {
            const display = document.getElementById('progression-display');
            const existingItems = display.querySelectorAll('.progression-item');

            state.currentProgression.forEach((chord, index) => {
                let el = existingItems[index];
                
                if (!el) {
                    // Create new element if we have more state items than DOM nodes
                    el = document.createElement('div');
                    el.className = 'progression-item';

                    const textNode = document.createTextNode(`${chord} `);
                    el.appendChild(textNode);

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-btn';
                    removeBtn.textContent = '×';
                    el.appendChild(removeBtn);
                    
                    el.draggable = true;
                    display.appendChild(el);
                } else {
                    // Update existing element text in-place (childNodes[0] is the textNode)
                    el.childNodes[0].textContent = `${chord} `;
                }

                // Dataset index updated so Event Delegation can route the click correctly
                el.dataset.index = index;

                // Highlight items within the loop visually
                const isInsideLoop = state.isLooping && index >= state.loopStart && index < state.loopEnd;
                if (isInsideLoop) {
                    el.classList.add('in-loop');
                } else {
                    el.classList.remove('in-loop');
                }
            });

            // Remove excess DOM elements if the progression shrank
            for (let i = state.currentProgression.length; i < existingItems.length; i++) {
                display.removeChild(existingItems[i]);
            }

            // Ensure brackets are rendered natively into the flex flow if looping is enabled
            if (state.currentProgression.length > 0 && state.isLooping) {
                let startBr = document.getElementById('bracket-start') || createBracketElement('bracket-start', '[');
                let endBr = document.getElementById('bracket-end') || createBracketElement('bracket-end', ']');
                
                startBr.style.display = 'inline-block';
                endBr.style.display = 'inline-block';

                const updatedItems = display.querySelectorAll('.progression-item');
                
                if (updatedItems[state.loopStart]) display.insertBefore(startBr, updatedItems[state.loopStart]);
                else display.appendChild(startBr);

                if (updatedItems[state.loopEnd]) display.insertBefore(endBr, updatedItems[state.loopEnd]);
                else display.appendChild(endBr);
            } else {
                // Hide brackets if looping is disabled or progression is empty
                const startBr = document.getElementById('bracket-start');
                const endBr = document.getElementById('bracket-end');
                if (startBr && startBr.parentNode) startBr.parentNode.removeChild(startBr);
                if (endBr && endBr.parentNode) endBr.parentNode.removeChild(endBr);
            }
        }

        function highlightChordInUI(index) {
            const items = document.querySelectorAll('.progression-item');
            items.forEach(el => el.classList.remove('playing'));
            if (items[index]) {
                items[index].classList.add('playing');
            }
        }

        function updateLoopButtonUI() {
            const loopToggleBtn = document.getElementById('btn-loop-toggle');
            if (state.isLooping) {
                loopToggleBtn.className = 'control-btn primary';
            } else {
                loopToggleBtn.className = 'control-btn secondary';
            }
        }

// --- Initialization & Event Listeners ---
function initApp() {
    const display = document.getElementById('progression-display');
    
    setupDragZone(
        display,
        (oldIndex, newIndex, newLoopStart, newLoopEnd) => { // onReorder Event
            if (oldIndex === null || newIndex === null) {
                renderProgression(); // Clean up visually
                return;
            }
            
            if (oldIndex !== newIndex) {
                const itemToMove = state.currentProgression.splice(oldIndex, 1)[0];
                state.currentProgression.splice(newIndex, 0, itemToMove);
            }
            
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            }
            
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        },
        (sourceChord, insertIndex, newLoopStart, newLoopEnd) => { // onAddFromSource Event
            if (insertIndex === null) insertIndex = state.currentProgression.length;
            
            const isAtEnd = state.loopEnd === state.currentProgression.length;
            state.currentProgression.splice(insertIndex, 0, sourceChord);
            
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            } else {
                // Fallback math if looping is off and brackets are hidden
                if (isAtEnd) state.loopEnd = state.currentProgression.length;
                else if (insertIndex < state.loopEnd) state.loopEnd++;
                
                if (insertIndex <= state.loopStart) state.loopStart++;
            }
            
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        },
        (bracketId, insertIndex, newLoopStart, newLoopEnd) => { // onBracketDrop Event
            if (newLoopStart !== null && newLoopEnd !== null) {
                state.loopStart = newLoopStart;
                state.loopEnd = newLoopEnd;
            } else {
                if (insertIndex === null) insertIndex = state.currentProgression.length;
                if (bracketId === 'bracket-start') state.loopStart = insertIndex;
                else if (bracketId === 'bracket-end') state.loopEnd = insertIndex;
            }
            
            sanitizeLoopBounds();
            persistAppState();
            renderProgression();
        },
        () => renderProgression(), // onDragCancel Event
        (index) => state.currentProgression[index] // State lookup
    );

    // --- Event Delegation ---
    // A single listener catches all clicks efficiently, eliminating listener thrashing on render.
    display.addEventListener('click', (e) => {
        const item = e.target.closest('.progression-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.index, 10);
        if (e.target.classList.contains('remove-btn')) {
            removeChord(index);
        } else {
            auditionChord(state.currentProgression[index]);
        }
    });
    
    const chordBtns = document.querySelectorAll('.chord-btn');
    chordBtns.forEach(btn => {
        setupDraggableSource(btn);
        btn.addEventListener('click', () => {
            auditionChord(btn.dataset.chord);
        });
        btn.addEventListener('dblclick', () => {
            addChord(btn.dataset.chord);
        });
    });

    const playToggleBtn = document.getElementById('btn-play-toggle');
    playToggleBtn.addEventListener('click', () => {
        if (isPlaying) {
            stopProgression(highlightChordInUI);
            playToggleBtn.textContent = '▶';
            isPlaying = false;
        } else {
            playProgression(
                () => state, 
                highlightChordInUI,
                () => { // onComplete
                    playToggleBtn.textContent = '▶';
                    isPlaying = false;
                }
            );
            playToggleBtn.textContent = '■';
            isPlaying = true;
        }
    });

    // Spacebar to play/stop
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
            e.preventDefault(); // Prevent page scroll and default button clicks
            playToggleBtn.click();
        }
    });

    document.getElementById('btn-clear').addEventListener('click', clearProgression);
    document.getElementById('btn-export').addEventListener('click', () => exportToMidi(state));
    
    document.getElementById('bpm-slider').addEventListener('input', (e) => {
        state.bpm = parseInt(e.target.value, 10);
        persistAppState();
    });
    document.getElementById('btn-loop-toggle').addEventListener('click', () => {
        state.isLooping = !state.isLooping;
        updateLoopButtonUI();
        sanitizeLoopBounds();
        persistAppState();
        renderProgression();
    });
    document.getElementById('voice-leading').addEventListener('change', (e) => {
        state.useVoiceLeading = e.target.checked;
        persistAppState();
    });

    const savedState = loadState();
    if (savedState) {
        if (savedState.currentProgression) state.currentProgression = savedState.currentProgression;
        if (savedState.bpm) state.bpm = savedState.bpm;
        // Handle transition from old schema names (loop -> isLooping, voiceLeading -> useVoiceLeading)
        if (savedState.isLooping !== undefined || savedState.loop !== undefined) state.isLooping = savedState.isLooping ?? savedState.loop;
        if (savedState.useVoiceLeading !== undefined || savedState.voiceLeading !== undefined) state.useVoiceLeading = savedState.useVoiceLeading ?? savedState.voiceLeading;
        if (savedState.loopStart !== undefined) state.loopStart = savedState.loopStart;
        if (savedState.loopEnd !== undefined) state.loopEnd = savedState.loopEnd;
        if (savedState.theme !== undefined) state.theme = savedState.theme;
    }
    sanitizeLoopBounds();
    
    // --- Theme Management ---
    document.documentElement.setAttribute('data-theme', state.theme);
    
    const themeToggleBtn = document.createElement('button');
    themeToggleBtn.id = 'theme-toggle';
    themeToggleBtn.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    themeToggleBtn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
        themeToggleBtn.textContent = state.theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        persistAppState();
    });
    document.body.appendChild(themeToggleBtn);

    // Sync UI to State
    document.getElementById('bpm-slider').value = state.bpm;
    updateLoopButtonUI();
    document.getElementById('voice-leading').checked = state.useVoiceLeading;
    
    renderProgression();
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}