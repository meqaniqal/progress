const DB_NAME = 'ProgressAppDB';
const DRUM_STORE = 'customDrums';
const PROJECT_STORE = 'projects';
const DB_VERSION = 2; // Bumped to 2 to trigger onupgradeneeded

export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(DRUM_STORE)) {
                db.createObjectStore(DRUM_STORE);
            }
            if (!db.objectStoreNames.contains(PROJECT_STORE)) {
                db.createObjectStore(PROJECT_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- Drum Sample Methods ---
export async function saveDrumSample(type, arrayBuffer) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRUM_STORE, 'readwrite');
        const store = tx.objectStore(DRUM_STORE);
        store.put(arrayBuffer, type);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadDrumSample(type) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRUM_STORE, 'readonly');
        const store = tx.objectStore(DRUM_STORE);
        const request = store.get(type);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function clearAllDrumSamples() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRUM_STORE, 'readwrite');
        const store = tx.objectStore(DRUM_STORE);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function deleteDrumSample(type) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRUM_STORE, 'readwrite');
        const store = tx.objectStore(DRUM_STORE);
        const request = store.delete(type);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Project Management Methods ---
export async function saveProjectToDB(name, projectData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        const store = tx.objectStore(PROJECT_STORE);
        const { history, ...stateToSave } = projectData;
        store.put({ ...stateToSave, _savedAt: Date.now() }, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getSavedProjectsFromDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readonly');
        const store = tx.objectStore(PROJECT_STORE);
        const request = store.getAllKeys();
        const valuesRequest = store.getAll();
        
        tx.oncomplete = () => {
            const projects = {};
            const keys = request.result;
            const values = valuesRequest.result;
            for(let i = 0; i < keys.length; i++) {
                projects[keys[i]] = values[i];
            }
            resolve(projects);
        };
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadProjectFromDB(name) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readonly');
        const store = tx.objectStore(PROJECT_STORE);
        const request = store.get(name);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(tx.error);
    });
}

export async function deleteProjectFromDB(name) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        const store = tx.objectStore(PROJECT_STORE);
        store.delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearAllProjectsFromDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        const store = tx.objectStore(PROJECT_STORE);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}