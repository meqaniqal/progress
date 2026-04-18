import { saveState, loadState } from './storage.js';

// MIDI note numbers (C4 = 60)
        // Storing root-position triads for C Major and common borrowed chords
        const chordDictionary = {
            'I':    [60, 64, 67], // C, E, G
            'ii':   [62, 65, 69], // D, F, A
            'iii':  [64, 67, 71], // E, G, B
            'IV':   [65, 69, 72], // F, A, C (C5)
            'V':    [67, 71, 74], // G, B, D (D5)
            'vi':   [69, 72, 76], // A, C, E (E5)
            'iv':   [65, 68, 72], // F, Ab, C - Borrowed from C min
            'bVI':  [68, 72, 75], // Ab, C, Eb - Borrowed from C min
            'bVII': [70, 74, 77]  // Bb, D, F - Borrowed from C min
        };

        let currentProgression = [];

        function addChord(numeral) {
            console.log(`[addChord] Entering. Intent: Add ${numeral} to progression.`);
            currentProgression.push(numeral);
            persistAppState();
            renderProgression();
        }

        function removeChord(index) {
            currentProgression.splice(index, 1);
            persistAppState();
            renderProgression();
        }

        function clearProgression() {
            console.log('[clearProgression] Intent: Clear all chords.');
            stopProgression();
            currentProgression = [];
            persistAppState();
            renderProgression();
        }

        function persistAppState() {
            const state = {
                currentProgression,
                bpm: document.getElementById('bpm-slider').value,
                loop: document.getElementById('loop-playback').checked,
                voiceLeading: document.getElementById('voice-leading').checked
            };
            saveState(state);
        }

        function renderProgression() {
            const display = document.getElementById('progression-display');
            display.innerHTML = '';
            currentProgression.forEach((chord, index) => {
                const el = document.createElement('div');
                el.className = 'progression-item';

                const textNode = document.createTextNode(`${chord} `);
                el.appendChild(textNode);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-btn';
                removeBtn.textContent = '×';
                removeBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevents the audition handler from firing
                    removeChord(index);
                };
                el.appendChild(removeBtn);
                
                // Add audition click handler
                el.onclick = () => {
                    auditionChord(index);
                };

                // Make item draggable and store its index
                el.draggable = true;
                el.dataset.index = index;

                display.appendChild(el);
            });
        }

        function auditionChord(index) {
            console.log(`[auditionChord] Intent: Audition chord at index ${index}.`);
            initAudio();

            const chordSymbol = currentProgression[index];
            if (!chordSymbol) return;

            const chordNotes = chordDictionary[chordSymbol];
            const rootNoteMidi = chordNotes[0] - 24;
            const auditionDuration = 0.8;
            const now = audioCtx.currentTime;

            // Play chord and bass note without interrupting main playback loop
            chordNotes.forEach(note => playTone(midiToFreq(note), now, auditionDuration, 'sine'));
            playTone(midiToFreq(rootNoteMidi), now, auditionDuration, 'triangle');
        }

        // --- Drag and Drop Logic ---
        let draggedIndex = null;

        function setupDragAndDrop() {
            const display = document.getElementById('progression-display');

            display.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('progression-item')) {
                    draggedIndex = parseInt(e.target.dataset.index, 10);
                    e.dataTransfer.effectAllowed = 'move';
                    // Add a slight delay to allow the browser to create the drag image
                    setTimeout(() => {
                        e.target.classList.add('dragging');
                    }, 0);
                }
            });

            display.addEventListener('dragend', (e) => {
                if (e.target.classList.contains('progression-item')) {
                    e.target.classList.remove('dragging');
                }
                draggedIndex = null;
            });

            display.addEventListener('dragover', (e) => {
                e.preventDefault(); // This is necessary to allow a drop
            });

            display.addEventListener('drop', (e) => {
                e.preventDefault();
                const dropTarget = e.target.closest('.progression-item');
                if (dropTarget && draggedIndex !== null) {
                    const droppedOnIndex = parseInt(dropTarget.dataset.index, 10);
                    if (draggedIndex === droppedOnIndex) return;

                    const itemToMove = currentProgression.splice(draggedIndex, 1)[0];
                    currentProgression.splice(droppedOnIndex, 0, itemToMove);
                    persistAppState();
                    renderProgression(); // Re-render to reflect the new order
                }
            });
        }
        document.addEventListener('DOMContentLoaded', setupDragAndDrop);

        // --- Core Algorithm: Voice Leading ---
        // Calculates the inversion of a target chord that has the shortest 
        // total melodic distance from the previous chord.
        function applyVoiceLeading(progression) {
            if (progression.length === 0) return [];
            
            // Start the first chord in root position, dropped down an octave for warmth (C3 range)
            let processed = [chordDictionary[progression[0]].map(n => n - 12)]; 

            for (let i = 1; i < progression.length; i++) {
                let prevChord = processed[i - 1];
                let targetNotes = chordDictionary[progression[i]];
                
                // Generate possible inversions (moving notes up/down octaves)
                let inversions = generateInversions(targetNotes);
                
                // Find the inversion with the smallest movement delta
                let bestInversion = inversions[0];
                let smallestDistance = Infinity;

                inversions.forEach(inv => {
                    let distance = calculateDistance(prevChord, inv);
                    if (distance < smallestDistance) {
                        smallestDistance = distance;
                        bestInversion = inv;
                    }
                });

                processed.push(bestInversion);
            }
            return processed;
        }

        function generateInversions(chord) {
            // Generates Root, 1st, and 2nd inversions, plus octave shifted versions
            const [n1, n2, n3] = chord;
            return [
                [n1 - 12, n2 - 12, n3 - 12], // Down an octave
                [n1 - 12, n2 - 12, n3],      // Spread
                [n1, n2, n3],                // Root 
                [n2 - 12, n3 - 12, n1],      // 1st inversion (lower)
                [n2, n3, n1 + 12],           // 1st inversion
                [n3 - 12, n1, n2],           // 2nd inversion
                [n3, n1 + 12, n2 + 12]       // 2nd inversion (higher)
            ];
        }

        function calculateDistance(chordA, chordB) {
            // Sort to compare bottom-to-bottom, middle-to-middle, top-to-top
            let sortedA = [...chordA].sort((a,b)=>a-b);
            let sortedB = [...chordB].sort((a,b)=>a-b);
            let dist = 0;
            for (let i = 0; i < 3; i++) {
                dist += Math.abs(sortedA[i] - sortedB[i]);
            }
            return dist;
        }

        // --- Export Logic ---
        function exportMidi() {
            if (currentProgression.length === 0) {
                console.log("[exportMidi] Aborted: Progression is empty.");
                alert("Please add some chords to the progression first!");
                return;
            }

            const useVoiceLeading = document.getElementById('voice-leading').checked;
            let midiNotesToWrite = [];

            if (useVoiceLeading) {
                midiNotesToWrite = applyVoiceLeading(currentProgression);
            } else {
                // Just use block root position chords
                midiNotesToWrite = currentProgression.map(c => chordDictionary[c]);
            }

            // Initialize MidiWriterJS
            const track = new MidiWriter.Track();
            track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1})); // Acoustic Grand Piano

            // Add chords to track (Whole notes, length '1')
            midiNotesToWrite.forEach(notes => {
                const chordEvent = new MidiWriter.NoteEvent({
                    pitch: notes,
                    duration: '1',
                    velocity: 80 
                });
                track.addEvent(chordEvent);
            });

            // Add a bass line! (Root notes played down two octaves)
            // This satisfies the "drafting the bass line first" concept from the text
            const bassTrack = new MidiWriter.Track();
            currentProgression.forEach(chordSymbol => {
                const rootNote = chordDictionary[chordSymbol][0] - 24; 
                bassTrack.addEvent(new MidiWriter.NoteEvent({
                    pitch: [rootNote],
                    duration: '1',
                    velocity: 90
                }));
            });

            const bpm = document.getElementById('bpm-slider').value;
            const write = new MidiWriter.Writer([track, bassTrack], { tempo: parseInt(bpm, 10) });
            console.log(`[exportMidi] Exporting MIDI with tempo: ${bpm} BPM.`);
            const dataUri = write.dataUri();

            // Trigger download
            const link = document.createElement('a');
            link.href = dataUri;
            link.download = 'Harmonic_Progression.mid';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // --- Web Audio API Engine ---
        let audioCtx;
        let activeOscillators = [];
        let loopTimeoutId = null;
        let uiTimeouts = [];

        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function midiToFreq(m) {
            return Math.pow(2, (m - 69) / 12) * 440;
        }

        function playTone(freq, startTime, duration, type = 'sine') {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = type;
            osc.frequency.value = freq;

            // Envelope to avoid clicks: Attack -> Sustain -> Release
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // Attack
            gainNode.gain.setValueAtTime(0.15, startTime + duration - 0.1); // Sustain
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);

            activeOscillators.push(osc);
        }

        function highlightChordInUI(index) {
            const items = document.querySelectorAll('.progression-item');
            items.forEach(el => el.classList.remove('playing'));
            if (items[index]) {
                items[index].classList.add('playing');
            }
        }

        function playProgression() {
            const isLooping = document.getElementById('loop-playback').checked;
            console.log(`[playProgression] Intent: Play ${currentProgression.length} chords. Looping: ${isLooping}`);
            if (currentProgression.length === 0) return;
            
            initAudio();
            // Clear any previous loop timeout before stopping oscillators
            if (loopTimeoutId) clearTimeout(loopTimeoutId);
            stopProgression(); // Clear existing playback

            const useVoiceLeading = document.getElementById('voice-leading').checked;
            const notesToPlay = useVoiceLeading ? applyVoiceLeading(currentProgression) : currentProgression.map(c => chordDictionary[c]);
            
            const bpm = document.getElementById('bpm-slider').value;
            const chordDuration = 60 / bpm; // Duration of a quarter note in seconds.
            console.log(`[playProgression] BPM: ${bpm}, Chord Duration: ${chordDuration}s`);

            const now = audioCtx.currentTime;

            notesToPlay.forEach((chordNotes, index) => {
                const startTime = now + (index * chordDuration);
                
                // Play Track 1 (Chords) - Sine waves for clean reference
                chordNotes.forEach(note => playTone(midiToFreq(note), startTime, chordDuration, 'sine'));

                // Play Track 2 (Bass) - Triangle wave, down 2 octaves
                const rootSymbol = currentProgression[index];
                const rootNoteMidi = chordDictionary[rootSymbol][0] - 24; 
                playTone(midiToFreq(rootNoteMidi), startTime, chordDuration, 'triangle');

                // Schedule UI Highlight
                const delayMs = (index * chordDuration) * 1000;
                uiTimeouts.push(setTimeout(() => {
                    highlightChordInUI(index);
                }, delayMs));
            });

            // If looping is enabled, set a timeout to call this function again
            if (isLooping) {
                const totalDurationMs = notesToPlay.length * chordDuration * 1000;
                console.log(`[playProgression] Scheduling loop in ${totalDurationMs.toFixed(0)}ms.`);
                loopTimeoutId = setTimeout(playProgression, totalDurationMs);
            }
        }

        function stopProgression() {
            console.log(`[stopProgression] Intent: Stop all playback.`);
            if (loopTimeoutId) clearTimeout(loopTimeoutId);
            loopTimeoutId = null;

            uiTimeouts.forEach(clearTimeout);
            uiTimeouts = [];
            highlightChordInUI(-1); // Clear all highlights

            activeOscillators.forEach(osc => {
                try {
                    osc.stop();
                    osc.disconnect();
                } catch (e) {}
            });
            activeOscillators = [];
        }

// --- Initialization & Event Listeners ---
function initApp() {
    console.log('[initApp] Starting app initialization.');
    setupDragAndDrop();
    
    const chordBtns = document.querySelectorAll('.chord-btn');
    console.log(`[initApp] Found ${chordBtns.length} chord buttons. Attaching listeners.`);
    chordBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log(`[UI Click] Button clicked. Dispatching addChord for: ${btn.dataset.chord}`);
            addChord(btn.dataset.chord);
        });
    });

    document.getElementById('btn-play').addEventListener('click', playProgression);
    document.getElementById('btn-stop').addEventListener('click', stopProgression);
    document.getElementById('btn-clear').addEventListener('click', clearProgression);
    document.getElementById('btn-export').addEventListener('click', exportMidi);
    
    document.getElementById('bpm-slider').addEventListener('input', persistAppState);
    document.getElementById('loop-playback').addEventListener('change', persistAppState);
    document.getElementById('voice-leading').addEventListener('change', persistAppState);

    const savedState = loadState();
    if (savedState) {
        console.log('[initApp] Loaded saved state:', savedState);
        if (savedState.currentProgression) currentProgression = savedState.currentProgression;
        if (savedState.bpm) document.getElementById('bpm-slider').value = savedState.bpm;
        if (savedState.loop !== undefined) document.getElementById('loop-playback').checked = savedState.loop;
        if (savedState.voiceLeading !== undefined) document.getElementById('voice-leading').checked = savedState.voiceLeading;
    }
    
    renderProgression();
    console.log('[initApp] Initialization complete.');
}

// Robust initialization: handle cases where DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- Jest Testing Exports ---
// This check ensures the browser doesn't throw an error when running normally, 
// but allows Node.js to import these functions for testing.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { applyVoiceLeading, generateInversions, calculateDistance };
}