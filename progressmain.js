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
            currentProgression.push(numeral);
            renderProgression();
        }

        function removeChord(index) {
            currentProgression.splice(index, 1);
            renderProgression();
        }

        function renderProgression() {
            const display = document.getElementById('progression-display');
            display.innerHTML = '';
            currentProgression.forEach((chord, index) => {
                const el = document.createElement('div');
                el.className = 'progression-item';
                el.innerHTML = `${chord} <button class="remove-btn" onclick="removeChord(${index})">×</button>`;
                display.appendChild(el);
            });
        }

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

            const write = new MidiWriter.Writer([track, bassTrack]);
            const dataUri = write.dataUri();

            // Trigger download
            const link = document.createElement('a');
            link.href = dataUri;
            link.download = 'Harmonic_Progression.mid';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

// --- Jest Testing Exports ---
// This check ensures the browser doesn't throw an error when running normally, 
// but allows Node.js to import these functions for testing.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { applyVoiceLeading, generateInversions, calculateDistance };
}