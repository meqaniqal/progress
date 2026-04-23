// Pure function to convert an AudioBuffer into a binary WAV file Blob structure
export function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferData = new ArrayBuffer(length);
    const view = new DataView(bufferData);
    const channels = [];
    let offset = 0;
    let pos = 0;

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, length - 8, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // length of fmt data
    view.setUint16(offset, 1, true); offset += 2; // format (PCM)
    view.setUint16(offset, numOfChan, true); offset += 2;
    view.setUint32(offset, buffer.sampleRate, true); offset += 4;
    view.setUint32(offset, buffer.sampleRate * 2 * numOfChan, true); offset += 4; // byte rate
    view.setUint16(offset, numOfChan * 2, true); offset += 2; // block align
    view.setUint16(offset, 16, true); offset += 2; // bits per sample
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, length - offset - 4, true); offset += 4;

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // float to 16-bit PCM
            view.setInt16(offset, sample, true);
            offset += 2;
        }
        pos++;
    }
    return bufferData;
}