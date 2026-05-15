import { state, switchActiveSection, createAndAppendSection, renameSection, removeSectionFromSequence, appendExistingSection, reorderSequence, inheritSectionData } from './store.js';
import { initDragAndDrop } from './dragdrop.js';

let _onRenderProgression = null;
export let isSongTrayOpen = false;
let _activeSequenceIndex = null;
let _showInheritForSection = null;

// Generates a stable, professional muted hue based on the unique section ID
function getSectionHue(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const macroHues = [210, 280, 340, 15, 45, 180, 260, 320]; // Slate, Mauve, Rose, Rust, Gold, Teal, Indigo, Magenta
    return macroHues[Math.abs(hash) % macroHues.length];
}

export function setActiveSequenceIndex(index) {
    _activeSequenceIndex = index;
}

export function getActiveSequenceIndex() {
    return _activeSequenceIndex;
}

export function initSongController(callbacks) {
    _onRenderProgression = callbacks.onRenderProgression;

    const btnAddSection = document.getElementById('btn-add-section');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const btnCloseTray = document.getElementById('btn-close-song-tray');
    const tabsContainer = document.getElementById('section-tabs');
    const trayDisplay = document.getElementById('song-sequence-display');
    const progressionDisplay = document.getElementById('progression-display');
    const paletteContainer = document.getElementById('song-section-buttons');

    if (btnAddSection) {
        btnAddSection.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.getElementById('active-section-dropdown')) {
                closeSectionDropdown();
                return;
            }

            // Phase 6 First-Time Flow
            if (state.songSequence.length === 1) {
                const firstId = state.songSequence[0];
                if (state.sections[firstId] && state.sections[firstId].name === 'Section 1') {
                    openFirstTimeRenameDropdown(btnAddSection, firstId, () => {
                        setTimeout(() => openAddSectionDropdown(btnAddSection), 50); // slight delay to prevent event clashes
                    });
                    return;
                }
            }

            openAddSectionDropdown(btnAddSection);
        });
    }

    // Strict Event Delegation for tabs
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.section-tab');
            if (!tab) return;
            
            const sectionId = tab.dataset.id;
            
            if (sectionId === state.activeSectionId) {
                const existingDropdown = document.getElementById('active-section-dropdown');
                if (existingDropdown) {
                    closeSectionDropdown();
                } else {
                    openRenameDropdown(tab, sectionId);
                }
            } else {
                // Switch to existing section
                if (switchActiveSection(sectionId)) {
                    _activeSequenceIndex = state.songSequence.lastIndexOf(sectionId);
                    updateSongUI();
                    if (_onRenderProgression) _onRenderProgression();
                }
            }
        });
    }

    // Handle double tap on the dedicated palette buttons safely
    if (paletteContainer) {
        let lastPaletteTapTime = 0;
        let lastPaletteTapId = null;

        paletteContainer.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('.section-palette-btn');
            if (!btn) return;
            
            const now = Date.now();
            if (now - lastPaletteTapTime < 350 && lastPaletteTapId === btn.dataset.id) {
                e.preventDefault();
                appendExistingSection(btn.dataset.id);
                _activeSequenceIndex = state.songSequence.length - 1;
                switchActiveSection(btn.dataset.id);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
                lastPaletteTapTime = 0;
            } else {
                lastPaletteTapTime = now;
                lastPaletteTapId = btn.dataset.id;
            }
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
                removeSectionFromSequence(index);
                
                if (_activeSequenceIndex === index) _activeSequenceIndex = null;
                else if (_activeSequenceIndex !== null && _activeSequenceIndex > index) _activeSequenceIndex--;
                
                updateSongUI();
                return;
            }
            
            // Focus the clicked section in the editor
            const block = e.target.closest('.song-section-block');
            if (block && !removeBtn) {
                const index = parseInt(block.dataset.index, 10);
                _activeSequenceIndex = index;
                switchActiveSection(block.dataset.id);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            }
        });

        initDragAndDrop({
            display: trayDisplay,
            itemClass: 'song-section-block',
            placeholderClass: 'song-placeholder',
            sourceClass: 'section-palette-btn',
            sourceDataAttribute: 'id',
            onReorder: (oldIndex, newIndex) => {
                if (oldIndex === null || newIndex === null) { updateSongUI(); return; }
                if (oldIndex !== newIndex) {
                    reorderSequence(oldIndex, newIndex);
                    
                    // Keep highlight locked to the dragged block
                    if (_activeSequenceIndex === oldIndex) {
                        _activeSequenceIndex = newIndex;
                    } else if (_activeSequenceIndex !== null && _activeSequenceIndex > oldIndex && _activeSequenceIndex <= newIndex) {
                        _activeSequenceIndex--;
                    } else if (_activeSequenceIndex !== null && _activeSequenceIndex < oldIndex && _activeSequenceIndex >= newIndex) {
                        _activeSequenceIndex++;
                    }
                }
                updateSongUI();
            },
            onAddFromSource: (sourceId, sourceKey, insertIndex) => {
                if (insertIndex === null) insertIndex = state.songSequence.length;
                appendExistingSection(sourceId, insertIndex);
                _activeSequenceIndex = insertIndex;
                switchActiveSection(sourceId);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            },
            onDragCancel: () => updateSongUI(),
            getItemText: (index) => state.sections[state.songSequence[index]]?.name || ''
        });
    }

    // Strict Event Delegation for "Inherit From" logic
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'inherit-section-select') {
            const sourceId = e.target.value;
            if (!sourceId) return;
            
            inheritSectionData(state.activeSectionId, sourceId);
            updateSongUI();
            if (_onRenderProgression) _onRenderProgression();
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'btn-close-inherit') {
            _showInheritForSection = null;
            updateSongUI();
        }
    });
}

function getUniqueSectionName(name, excludeSectionId = null) {
    const existing = Object.values(state.sections)
        .filter(s => s.id !== excludeSectionId)
        .map(s => s.name.toLowerCase());
    
    let cleanName = name.trim();
    if (!existing.includes(cleanName.toLowerCase())) return cleanName;
    
    let base = cleanName;
    let counter = 2;
    const match = cleanName.match(/^(.*)\s+(\d+)$/);
    if (match) {
        base = match[1];
        counter = parseInt(match[2], 10);
    }
    
    while (existing.includes(`${base} ${counter}`.toLowerCase())) {
        counter++;
    }
    return `${base} ${counter}`;
}

function showDropdownMenu(anchorElement, titleText, presets, initialInputValue, placeholderText, onApply) {
    closeSectionDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'section-rename-dropdown';
    dropdown.id = 'active-section-dropdown';
    
    let html = '';
    if (titleText) {
        html += `<div style="font-size: 11px; padding: 4px 8px; opacity: 0.8; font-weight: bold;">${titleText}</div>`;
    }
    presets.forEach(p => {
        html += `<div class="rename-option preset-option">${p}</div>`;
    });
    html += `<div class="rename-option input-option">
                <input type="text" id="section-custom-input" value="${initialInputValue}" placeholder="${placeholderText}" />
             </div>`;
    
    dropdown.innerHTML = html;
    
    const rect = anchorElement.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    
    document.body.appendChild(dropdown);

    const input = dropdown.querySelector('#section-custom-input');
    input.focus();
    if (initialInputValue) input.select();

    const handleApply = (val) => {
        closeSectionDropdown();
        if (val && val.trim() !== '') {
            onApply(val.trim());
        }
    };

    dropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('preset-option')) {
            handleApply(e.target.textContent);
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleApply(input.value);
        else if (e.key === 'Escape') closeSectionDropdown();
    });

    // Smart distance closing logic (150px threshold)
    const moveHandler = (e) => {
        if (!document.getElementById('active-section-dropdown')) return;
        const dr = dropdown.getBoundingClientRect();
        const distX = Math.max(dr.left - e.clientX, 0, e.clientX - dr.right);
        const distY = Math.max(dr.top - e.clientY, 0, e.clientY - dr.bottom);
        const distance = Math.sqrt(distX * distX + distY * distY);
        if (distance > 150) closeSectionDropdown();
    };

    // Mobile tap-outside closing logic
    const outsideClickHandler = (e) => {
        if (!document.getElementById('active-section-dropdown')) return;
        if (!dropdown.contains(e.target) && !anchorElement.contains(e.target)) {
            closeSectionDropdown();
        }
    };

    setTimeout(() => {
        document.addEventListener('pointermove', moveHandler);
        document.addEventListener('pointerdown', outsideClickHandler);
        dropdown._cleanup = () => {
            document.removeEventListener('pointermove', moveHandler);
            document.removeEventListener('pointerdown', outsideClickHandler);
        };
    }, 50);
}

function openRenameDropdown(tabElement, sectionId) {
    const currentName = state.sections[sectionId].name;
    const basePresets = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];
    showDropdownMenu(tabElement, null, basePresets, currentName, "Custom name...", (newName) => {
        const unique = getUniqueSectionName(newName, sectionId);
        renameSection(sectionId, unique);
        updateSongUI();
    });
}

function openAddSectionDropdown(anchorElement) {
    const basePresets = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];
    const dynamicPresets = basePresets.map(p => getUniqueSectionName(p));
    showDropdownMenu(anchorElement, null, dynamicPresets, '', "Custom name...", (newName) => {
        const unique = getUniqueSectionName(newName);
        createAndAppendSection(unique);
        updateSongUI();
        if (_onRenderProgression) _onRenderProgression();
    });
}

function openFirstTimeRenameDropdown(anchorElement, sectionId, onComplete) {
    const presets = ['Intro', 'Verse'];
    showDropdownMenu(anchorElement, "Name current sketch:", presets, '', "e.g. Verse...", (newName) => {
        const unique = getUniqueSectionName(newName, sectionId);
        renameSection(sectionId, unique);
        updateSongUI();
        if (onComplete) onComplete();
    });
}

function closeSectionDropdown() {
    const dropdown = document.getElementById('active-section-dropdown');
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
    updateSongUI();
}

export function exitSongMode() {
    if (isSongTrayOpen) toggleSongTray();
}

export function updateSongUI() {
    const tabsContainer = document.getElementById('section-tabs');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const trayDisplay = document.getElementById('song-sequence-display');
    const progressionDisplay = document.getElementById('progression-display');
    const paletteContainer = document.getElementById('song-section-buttons');
    if (!tabsContainer || !trayDisplay || !progressionDisplay) return;

    // 1. Render Section Tabs & Palette Buttons (Unique list of created sections)
    const renderedIds = new Set();
    const orderedSections = state.songSequence.map(id => state.sections[id]).filter(sec => {
        if (!sec || renderedIds.has(sec.id)) return false;
        renderedIds.add(sec.id);
        return true;
    });

    tabsContainer.innerHTML = orderedSections.map(sec => `
        <div class="section-tab ${sec.id === state.activeSectionId ? 'active' : ''}" data-id="${sec.id}" title="${sec.id === state.activeSectionId ? 'Click to rename' : `Switch to ${sec.name}`}" style="--macro-hue: ${getSectionHue(sec.id)};">
            ${sec.name}
        </div>
    `).join('');
    
    if (paletteContainer) {
        paletteContainer.innerHTML = orderedSections.map(sec => `
            <button class="chord-btn section-palette-btn" data-id="${sec.id}" draggable="true" title="Drag to sequencer or double-click to append" style="--macro-hue: ${getSectionHue(sec.id)};">${sec.name}</button>
        `).join('');
    }

    if (btnToggleTray) {
        if (isSongTrayOpen) {
            btnToggleTray.style.display = 'none';
        } else {
            btnToggleTray.style.display = orderedSections.length > 1 ? 'inline-block' : 'none';
        }
    }

    // 2. Render Macro Sequencer Tray Blocks
    if (state.songSequence.length === 0) {
        trayDisplay.innerHTML = '<div class="section-empty-state">No sections in song sequence.</div>';
        _activeSequenceIndex = null;
    } else {
        // Validate _activeSequenceIndex matches activeSectionId
        if (_activeSequenceIndex !== null && state.songSequence[_activeSequenceIndex] !== state.activeSectionId) {
            _activeSequenceIndex = state.songSequence.lastIndexOf(state.activeSectionId);
            if (_activeSequenceIndex === -1) _activeSequenceIndex = null;
        } else if (_activeSequenceIndex === null) {
            _activeSequenceIndex = state.songSequence.lastIndexOf(state.activeSectionId);
        }

        trayDisplay.innerHTML = state.songSequence.map((id, index) => {
            const sec = state.sections[id];
            if (!sec) return '';
            const isPlaying = (id === state.activeSectionId && index === _activeSequenceIndex);
            return `<div class="song-section-block ${isPlaying ? 'playing' : ''}" data-id="${id}" data-index="${index}" draggable="true" style="--macro-hue: ${getSectionHue(id)};"><span style="opacity: 0.5; font-size: 10px;">☰</span>${sec.name}<button class="remove-btn remove-section-btn" style="margin-left: 6px;">×</button></div>`;
        }).join('');
    }

    // 3. Render "Inherit From" empty state
    let inheritContainer = document.getElementById('inherit-container');
    if (!inheritContainer) {
        inheritContainer = document.createElement('div');
        inheritContainer.id = 'inherit-container';
        progressionDisplay.parentNode.insertBefore(inheritContainer, progressionDisplay);
    }

    const oldInherit = progressionDisplay.querySelector('#inherit-empty-state');
    if (oldInherit) oldInherit.remove();

    if (state.currentProgression.length === 0 && Object.keys(state.sections).length > 1) {
        _showInheritForSection = state.activeSectionId;
    }

    if (_showInheritForSection === state.activeSectionId && Object.keys(state.sections).length > 1) {
        const currentName = state.sections[state.activeSectionId].name;
        let defaultInheritId = '';
        
        // Smart Default: Find a section with the same base name (e.g., "Chorus" for "Chorus 2")
        const baseNameMatch = currentName.match(/^([a-zA-Z\s]+)/);
        if (baseNameMatch) {
            const baseName = baseNameMatch[1].trim().toLowerCase();
            const possibleMatches = Object.values(state.sections).filter(s => 
                s.id !== state.activeSectionId && 
                s.progression.length > 0 && 
                s.name.toLowerCase().includes(baseName)
            );
            if (possibleMatches.length > 0) defaultInheritId = possibleMatches[0].id;
        }
        
        if (!defaultInheritId) {
            const anyNonEmpty = Object.values(state.sections).find(s => s.id !== state.activeSectionId && s.progression.length > 0);
            if (anyNonEmpty) defaultInheritId = anyNonEmpty.id;
        }

        const optionsHtml = Object.values(state.sections)
            .filter(s => s.id !== state.activeSectionId && s.progression.length > 0)
            .map(s => `<option value="${s.id}" ${s.id === defaultInheritId ? 'selected' : ''}>${s.name}</option>`)
            .join('');
            
        if (optionsHtml !== '') {
            const isEmpty = state.currentProgression.length === 0;
            const inheritHtml = `
                <div class="section-empty-state" id="inherit-empty-state" style="margin: auto; margin-top: 10px; margin-bottom: 10px; padding: 0;">
                    ${isEmpty ? `<div style="font-size: 15px; margin-bottom: 10px;">This section is empty.</div>` : ''}
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap;">
                        <span style="font-weight: bold; opacity: 0.8;">Inherit from:</span>
                        <select id="inherit-section-select" class="rhythm-select">
                            <option value="" disabled ${!defaultInheritId ? 'selected' : ''}>Select a section...</option>
                            ${optionsHtml}
                        </select>
                        <button id="btn-close-inherit" class="control-btn secondary" style="padding: 4px 12px; font-size: 13px;">⬅ Close</button>
                    </div>
                </div>
            `;
            
            inheritContainer.innerHTML = inheritHtml;
        } else {
            inheritContainer.innerHTML = '';
        }
    } else {
        inheritContainer.innerHTML = '';
    }
}