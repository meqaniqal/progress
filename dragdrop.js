import { CONFIG } from './config.js';

export function getDragAfterElement(container, x, y, itemClass, bracketStartId = 'bracket-start', bracketEndId = 'bracket-end') {
    const draggableElements = [...container.querySelectorAll(`.${itemClass}:not(.dragging), #${bracketStartId}:not(.dragging), #${bracketEndId}:not(.dragging)`)];

    for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        // Check if the cursor is vertically within the range of the current or previous rows
        if (y < box.bottom) {
            if (y < box.top) return child;
            // If cursor is in the same row, check if it's in the left half.
            if (x < box.left + box.width / 2) return child;
        }
    }
    return null; // Mouse is at the very end or in an empty area
}

export function initDragAndDrop({
    display,
    itemClass = 'progression-item',
    placeholderClass = 'progression-placeholder',
    sourceClass = 'chord-btn',
    sourceDataAttribute = 'chord',
    bracketStartId = 'bracket-start',
    bracketEndId = 'bracket-end',
    onReorder,
    onAddFromSource,
    onBracketDrop,
    onDragCancel,
    getItemText,
    getBaseKey = () => 60
}) {
    let draggedIndex = null;
    let draggedBracket = null;
    let currentAfterElement = undefined;
    let draggedSourceItem = null;
    let draggedSourceKey = null;

    // Safely initialize DOM elements (protects against Jest Node.js environment)
    const dragPlaceholder = typeof document !== 'undefined' ? document.createElement('div') : null;

    if (dragPlaceholder) {
        dragPlaceholder.className = placeholderClass;
    }

    function createCustomDragImage(text) {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'custom-drag-image';
        document.body.appendChild(el);
        return el;
    }

    display.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains(itemClass)) {
            draggedIndex = parseInt(e.target.dataset.index, 10);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'reorder'); // polyfill safety
            
            dragPlaceholder.className = placeholderClass;
            dragPlaceholder.textContent = '';
            dragPlaceholder.style.cssText = '';

            const itemText = getItemText(draggedIndex);
            const dragImg = createCustomDragImage(itemText);
            e.dataTransfer.setDragImage(dragImg, CONFIG.DRAG_OFFSET_X, CONFIG.DRAG_OFFSET_Y);
            
            setTimeout(() => {
                e.target.classList.add('dragging');
                e.target.style.display = 'none'; 
                document.body.removeChild(dragImg);
            }, 0);
        } else if (e.target.id === bracketStartId || e.target.id === bracketEndId) {
            // Handling Dragging for Loop Brackets
            draggedBracket = e.target.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'bracket'); // polyfill safety
            
            // Make the placeholder look exactly like the bracket
            dragPlaceholder.className = 'bracket-placeholder';
            dragPlaceholder.textContent = e.target.textContent;
            dragPlaceholder.style.cssText = '';
            
            // Invisible drag image to prevent confusing ghost icon
            const dragImg = createCustomDragImage('');
            dragImg.style.background = 'transparent';
            dragImg.style.boxShadow = 'none';
            e.dataTransfer.setDragImage(dragImg, 0, 0);
            
            setTimeout(() => {
                e.target.classList.add('dragging');
                e.target.style.display = 'none'; 
                document.body.removeChild(dragImg);
            }, 0);
        }
    });

    display.addEventListener('dragend', () => {
        currentAfterElement = undefined;
        const draggingEl = document.querySelector('.dragging');
        if (draggingEl) {
            draggingEl.classList.remove('dragging');
            draggingEl.style.display = ''; // Restore visibility
        }
        if (dragPlaceholder.parentNode) dragPlaceholder.parentNode.removeChild(dragPlaceholder);
        
        const resetIndex = draggedIndex;
        const droppedBracket = draggedBracket; // Capture before nulling
        
        draggedIndex = null;
        draggedBracket = null;
        draggedSourceItem = null;
        draggedSourceKey = null;
        
        if (resetIndex !== null) {
            onReorder(resetIndex, resetIndex); // Dispatch a clean reset intent
        } else if (droppedBracket) {
            // If dropped outside, snap brackets to the absolute boundaries of the sequence
            const itemCount = display.querySelectorAll(`.${itemClass}:not(.dragging)`).length;
            const snapIndex = (droppedBracket === bracketStartId) ? 0 : itemCount;
            if (onBracketDrop) onBracketDrop(droppedBracket, snapIndex, null, null);
        } else {
            onDragCancel(); // Clean reset for palette items dropped outside
        }
    });

    display.addEventListener('dragenter', (e) => {
        e.preventDefault(); // Crucial for mobile polyfills to register as a valid drop target
    });

    display.addEventListener('dragover', (e) => {
        if (draggedIndex === null && draggedBracket === null && draggedSourceItem === null) return;
        e.preventDefault(); 
        const afterElement = getDragAfterElement(display, e.clientX, e.clientY, itemClass, bracketStartId, bracketEndId);
        
        if (afterElement !== currentAfterElement) {
            currentAfterElement = afterElement;
            dragPlaceholder.style.width = '0px';
            dragPlaceholder.style.margin = '0px';
            dragPlaceholder.style.opacity = '0';
            
            if (afterElement == null) display.appendChild(dragPlaceholder);
            else display.insertBefore(dragPlaceholder, afterElement);
            
            requestAnimationFrame(() => {
                if (draggedBracket) {
                    dragPlaceholder.style.width = 'auto'; 
                    dragPlaceholder.style.margin = '0 4px';
                    dragPlaceholder.style.opacity = '1';
                } else {
                    dragPlaceholder.style.width = '60px';
                    dragPlaceholder.style.margin = '0 4px';
                    dragPlaceholder.style.opacity = '1';
                }
            });
        }
    });

    display.addEventListener('dragleave', (e) => {
        if (!display.contains(e.relatedTarget) && dragPlaceholder.parentNode) {
            if (draggedBracket) {
                // Visually snap the placeholder to the absolute bounds instead of disappearing
                if (draggedBracket === bracketStartId) {
                    display.insertBefore(dragPlaceholder, display.firstElementChild);
                } else if (draggedBracket === bracketEndId) {
                    display.appendChild(dragPlaceholder);
                }
            } else {
                dragPlaceholder.parentNode.removeChild(dragPlaceholder);
            }
            currentAfterElement = undefined; // Ensure dragover recalculates if re-entered
        }
    });

    display.addEventListener('drop', (e) => {
        if (draggedIndex === null && draggedBracket === null && draggedSourceItem === null) return;
        e.preventDefault();
        currentAfterElement = undefined;

        const allItems = [...display.querySelectorAll(`.${itemClass}:not(.dragging), .${placeholderClass}, .bracket-placeholder, #${bracketStartId}:not(.dragging), #${bracketEndId}:not(.dragging)`)];
        
        let insertIndex = null;
        let newLoopStart = null;
        let newLoopEnd = null;
        let currentItemCount = 0;

        // Calculate exact state intents purely by looking at the resulting visual DOM order
        for (const el of allItems) {
            if (el.classList.contains(placeholderClass)) {
                insertIndex = currentItemCount;
            } else if (el.id === bracketStartId || (el.classList.contains('bracket-placeholder') && draggedBracket === bracketStartId)) {
                newLoopStart = currentItemCount;
            } else if (el.id === bracketEndId || (el.classList.contains('bracket-placeholder') && draggedBracket === bracketEndId)) {
                newLoopEnd = currentItemCount;
            }
            
            if (el.classList.contains(itemClass) || el.classList.contains(placeholderClass)) {
                currentItemCount++;
            }
        }

        if (dragPlaceholder.parentNode) dragPlaceholder.parentNode.removeChild(dragPlaceholder);

        if (draggedSourceItem) {
            const sourceKey = draggedSourceKey !== null ? draggedSourceKey : getBaseKey();
            onAddFromSource(draggedSourceItem, sourceKey, insertIndex, newLoopStart, newLoopEnd);
            draggedSourceItem = null;
            draggedSourceKey = null;
        } else if (draggedBracket) {
            if (onBracketDrop) onBracketDrop(draggedBracket, insertIndex, newLoopStart, newLoopEnd);
            draggedBracket = null;
        } else if (draggedIndex !== null) {
            onReorder(draggedIndex, insertIndex, newLoopStart, newLoopEnd);
            draggedIndex = null; // Consume intent
        }
    });

    // Use event delegation to support dynamically added source buttons (like modulation suggestions)
    document.body.addEventListener('dragstart', (e) => {
        const btn = e.target.closest(`.${sourceClass}`);
        if (btn && btn.dataset[sourceDataAttribute] && !btn.closest('.swap-menu')) {
            draggedSourceItem = btn.dataset[sourceDataAttribute];
            // Capture the specific target key if it exists, otherwise fall back to global baseKey
            draggedSourceKey = btn.hasAttribute('data-key') ? parseInt(btn.dataset.key, 10) : getBaseKey();
            e.dataTransfer.effectAllowed = 'copy';
            
            // Polyfill safety: provide dummy text so it registers as a valid drag
            e.dataTransfer.setData('text/plain', 'source');
            
            draggedIndex = null;
            
            dragPlaceholder.className = placeholderClass;
            dragPlaceholder.textContent = '';
            dragPlaceholder.style.cssText = '';

            // Use the explicit tab text if we are dragging a tab, rather than its raw ID
            let dragText = btn.dataset[sourceDataAttribute];
            if (sourceClass === 'section-tab') dragText = btn.textContent.trim();

            const dragImg = createCustomDragImage(dragText);
            e.dataTransfer.setDragImage(dragImg, CONFIG.DRAG_OFFSET_X, CONFIG.DRAG_OFFSET_Y);
            setTimeout(() => document.body.removeChild(dragImg), 0);
        }
    });

    document.body.addEventListener('dragend', (e) => {
        const btn = e.target.closest(`.${sourceClass}`);
        if (btn && btn.dataset[sourceDataAttribute] && !btn.closest('.swap-menu')) {
            draggedSourceItem = null;
            draggedSourceKey = null;
            if (dragPlaceholder && dragPlaceholder.parentNode) {
                dragPlaceholder.parentNode.removeChild(dragPlaceholder);
            }
        }
    });
}