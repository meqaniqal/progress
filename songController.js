import { state, persistAppState, saveHistoryState, switchActiveSection } from './store.js';
import { initPatternSet } from './patternUtils.js';
import { initDragAndDrop } from './dragdrop.js';

let _onRenderProgression = null;
export let isSongTrayOpen = false;

export function initSongController(callbacks) {
    _onRenderProgression = callbacks.onRenderProgression;

    const btnAddSection = document.getElementById('btn-add-section');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const btnCloseTray = document.getElementById('btn-close-song-tray');
    const tabsContainer = document.getElementById('section-tabs');
    const trayDisplay = document.getElementById('song-sequence-display');

    if (btnAddSection) {
        btnAddSection.addEventListener('click', () => {
            // Phase 6 First-Time Flow: Prompt user to name their existing sketch first
            if (state.songSequence.length === 1) {
                const firstId = state.songSequence[0];
                if (state.sections[firstId] && state.sections[firstId].name === 'Section 1') {
                    const currentName = prompt('Before we add a new section, what should we call your current work? (e.g., Intro, Verse)', 'Verse');
                    if (currentName && currentName.trim() !== '') {
                        state.sections[firstId].name = currentName.trim();
                    }
                }
            }

            const name = prompt('Enter new section name (e.g., Chorus, Bridge):', 'Chorus');
            if (!name) return; // User cancelled
            
            saveHistoryState();
            
            // Deep copy global patterns from the current active section so instruments/bpm config is inherited seamlessly
            const currentSec = state.sections[state.activeSectionId];
            const inheritedPatterns = currentSec ? JSON.parse(JSON.stringify(currentSec.globalPatterns)) : initPatternSet();
            
            const newId = 'sec-' + Math.random().toString(36).substring(2, 10);
            state.sections[newId] = {
                id: newId,
                name: name,
                progression: [],
                globalPatterns: inheritedPatterns
            };
            
            state.songSequence.push(newId);
            switchActiveSection(newId);
            
            updateSongUI();
            if (_onRenderProgression) _onRenderProgression();
        });
    }

    // Strict Event Delegation for tabs
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.section-tab');
            if (!tab) return;
            
            const sectionId = tab.dataset.id;
            
            if (sectionId === state.activeSectionId) {
                const existingDropdown = document.getElementById('active-rename-dropdown');
                if (existingDropdown) {
                    closeRenameDropdown();
                } else {
                    openRenameDropdown(tab, sectionId);
                }
            } else {
                // Switch to existing section
                if (switchActiveSection(sectionId)) {
                    updateSongUI();
                    if (_onRenderProgression) _onRenderProgression();
                }
            }
        });
        
        // Double click tab to instantly append to the end of the song sequence
        tabsContainer.addEventListener('dblclick', (e) => {
            const tab = e.target.closest('.section-tab');
            if (!tab) return;
            saveHistoryState();
            state.songSequence.push(tab.dataset.id);
            persistAppState();
            updateSongUI();
        });
    }

    if (btnToggleTray) btnToggleTray.addEventListener('click', toggleSongTray);
    if (btnCloseTray) btnCloseTray.addEventListener('click', () => { if (isSongTrayOpen) toggleSongTray(); });

    if (trayDisplay) {
        trayDisplay.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-section-btn');
            if (removeBtn) {
                const block = e.target.closest('.song-section-block');
                const index = parseInt(block.dataset.index, 10);
                saveHistoryState();
                state.songSequence.splice(index, 1);
                persistAppState();
                updateSongUI();
                return;
            }
            
            // Focus the clicked section in the editor
            const block = e.target.closest('.song-section-block');
            if (block && !removeBtn) {
                switchActiveSection(block.dataset.id);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            }
        });

        initDragAndDrop({
            display: trayDisplay,
            itemClass: 'song-section-block',
            placeholderClass: 'song-placeholder',
            sourceClass: 'section-tab',
            sourceDataAttribute: 'id',
            onReorder: (oldIndex, newIndex) => {
                if (oldIndex === null || newIndex === null) { updateSongUI(); return; }
                if (oldIndex !== newIndex) {
                    saveHistoryState();
                    const item = state.songSequence.splice(oldIndex, 1)[0];
                    state.songSequence.splice(newIndex, 0, item);
                    persistAppState();
                }
                updateSongUI();
            },
            onAddFromSource: (sourceId, sourceKey, insertIndex) => {
                saveHistoryState();
                if (insertIndex === null) insertIndex = state.songSequence.length;
                state.songSequence.splice(insertIndex, 0, sourceId);
                persistAppState();
                updateSongUI();
            },
            onDragCancel: () => updateSongUI(),
            getItemText: (index) => state.sections[state.songSequence[index]]?.name || ''
        });
    }
}

function openRenameDropdown(tabElement, sectionId) {
    closeRenameDropdown(); // Ensure only one exists

    const currentName = state.sections[sectionId].name;
    const dropdown = document.createElement('div');
    dropdown.className = 'section-rename-dropdown';
    dropdown.id = 'active-rename-dropdown';
    
    const presets = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];
    
    let html = '';
    presets.forEach(p => {
        html += `<div class="rename-option preset-option">${p}</div>`;
    });
    html += `<div class="rename-option input-option">
                <input type="text" id="rename-custom-input" value="${currentName}" placeholder="Custom name..." />
             </div>`;
    
    dropdown.innerHTML = html;
    
    // Position precisely under the tab
    const tabRect = tabElement.getBoundingClientRect();
    dropdown.style.left = `${tabRect.left}px`;
    dropdown.style.top = `${tabRect.bottom + 2}px`;
    
    document.body.appendChild(dropdown);

    const input = dropdown.querySelector('#rename-custom-input');
    input.focus();
    input.select();

    const applyName = (newName) => {
        if (newName && newName.trim() !== '') {
            saveHistoryState();
            state.sections[sectionId].name = newName.trim();
            persistAppState();
            updateSongUI();
        }
        closeRenameDropdown();
    };

    dropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('preset-option')) {
            applyName(e.target.textContent);
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyName(input.value);
        else if (e.key === 'Escape') closeRenameDropdown();
    });

    // Smart distance closing logic (150px threshold)
    const moveHandler = (e) => {
        if (!document.getElementById('active-rename-dropdown')) return;
        const rect = dropdown.getBoundingClientRect();
        const distX = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
        const distY = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        if (distance > 150) closeRenameDropdown();
    };

    // Mobile tap-outside closing logic
    const outsideClickHandler = (e) => {
        if (!document.getElementById('active-rename-dropdown')) return;
        // Close if the user taps anywhere outside the dropdown and outside the tab that opened it
        if (!dropdown.contains(e.target) && !tabElement.contains(e.target)) {
            closeRenameDropdown();
        }
    };

    // Slight delay before attaching listeners to prevent instant closure on touch
    setTimeout(() => {
        document.addEventListener('pointermove', moveHandler);
        document.addEventListener('pointerdown', outsideClickHandler);
        dropdown._cleanup = () => {
            document.removeEventListener('pointermove', moveHandler);
            document.removeEventListener('pointerdown', outsideClickHandler);
        };
    }, 50);
}

function closeRenameDropdown() {
    const dropdown = document.getElementById('active-rename-dropdown');
    if (dropdown) {
        if (dropdown._cleanup) dropdown._cleanup();
        dropdown.remove();
    }
}

export function toggleSongTray() {
    const tray = document.getElementById('song-sequencer-tray');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    
    isSongTrayOpen = !isSongTrayOpen;
    
    if (isSongTrayOpen) {
        tray.style.display = 'block';
        btnToggleTray.classList.add('active');
        Array.from(document.querySelectorAll('.chord-palette')).forEach(p => p.style.display = 'none');
    } else {
        tray.style.display = 'none';
        btnToggleTray.classList.remove('active');
        Array.from(document.querySelectorAll('.chord-palette')).forEach(p => p.style.display = 'block');
    }
}

export function exitSongMode() {
    if (isSongTrayOpen) toggleSongTray();
}

export function updateSongUI() {
    const tabsContainer = document.getElementById('section-tabs');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const trayDisplay = document.getElementById('song-sequence-display');
    if (!tabsContainer || !trayDisplay) return;

    // 1. Render Section Tabs (Unique list of created sections)
    const renderedIds = new Set();
    const orderedSections = state.songSequence.map(id => state.sections[id]).filter(sec => {
        if (!sec || renderedIds.has(sec.id)) return false;
        renderedIds.add(sec.id);
        return true;
    });

    tabsContainer.innerHTML = orderedSections.map(sec => `
        <div class="section-tab ${sec.id === state.activeSectionId ? 'active' : ''}" data-id="${sec.id}" draggable="true" title="${sec.id === state.activeSectionId ? 'Click to rename' : `Switch to ${sec.name}`}">
            ${sec.name}
        </div>
    `).join('');
    
    if (btnToggleTray) btnToggleTray.style.display = orderedSections.length > 1 ? 'inline-block' : 'none';

    // 2. Render Macro Sequencer Tray Blocks
    if (state.songSequence.length === 0) {
        trayDisplay.innerHTML = '<div class="section-empty-state">No sections in song sequence.</div>';
    } else {
        trayDisplay.innerHTML = state.songSequence.map((id, index) => {
            const sec = state.sections[id];
            if (!sec) return '';
            return `<div class="song-section-block ${id === state.activeSectionId ? 'playing' : ''}" data-id="${id}" data-index="${index}" draggable="true"><span style="opacity: 0.5; font-size: 10px;">☰</span>${sec.name}<button class="remove-btn remove-section-btn" style="margin-left: 6px;">×</button></div>`;
        }).join('');
    }
}