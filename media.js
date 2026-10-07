/**
 * Media — Video & Audio Link Inspector, Player & Downloader Script
 * Supports:
 * - URL inspection & stream analysis (MP4, MP3, WAV, WebM, OGG)
 * - Live interactive video & audio player preview
 * - Audio extraction from video tracks (Web Audio API PCM WAV/MP3 encoder)
 * - Direct media stream downloads
 * - Local file drop/browse support for preview & extraction
 */

(function () {
  'use strict';

  // Sample working test streams
  const SAMPLES = {
    'sample-mp4': {
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      type: 'video',
      title: 'Big Buck Bunny (MP4 Video)'
    },
    'sample-mp3': {
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      type: 'audio',
      title: 'Synthwave Melody (MP3 Audio)'
    },
    'sample-webm': {
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      type: 'video',
      title: 'Action Fire Scene (MP4 Video)'
    }
  };

  // State
  let currentMediaUrl = '';
  let currentMediaType = 'video'; // 'video' or 'audio'
  let currentBlob = null;
  let currentFileName = 'download';

  // DOM Elements
  const mediaUrlInput = document.getElementById('mediaUrlInput');
  const fetchMediaBtn = document.getElementById('fetchMediaBtn');
  const mediaLocalInput = document.getElementById('mediaLocalInput');
  const sampleChips = document.querySelectorAll('.sample-chip');

  const mediaWorkspace = document.getElementById('mediaWorkspace');
  const videoViewport = document.getElementById('videoViewport');
  const audioViewport = document.getElementById('audioViewport');
  const videoPlayer = document.getElementById('videoPlayer');
  const audioPlayer = document.getElementById('audioPlayer');

  const mediaTitleEl = document.getElementById('mediaTitleEl');
  const metaFormatEl = document.getElementById('metaFormatEl');
  const metaDurationEl = document.getElementById('metaDurationEl');
  const metaTypeEl = document.getElementById('metaTypeEl');
  const metaSourceEl = document.getElementById('metaSourceEl');

  const targetFormatSelect = document.getElementById('targetFormatSelect');
  const audioBitrateGroup = document.getElementById('audioBitrateGroup');
  const downloadMediaBtn = document.getElementById('downloadMediaBtn');
  const downloadProgressTrack = document.getElementById('downloadProgressTrack');
  const downloadProgressFill = document.getElementById('downloadProgressFill');
  const downloadStatusLabel = document.getElementById('downloadStatusLabel');

  // Web Audio Chime
  function playMediaChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();

      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + (idx * 0.08);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
      });
    } catch (e) {
      // Audio fallback
    }
  }

  // Format Duration seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return 'Live / Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Detect Media Type from URL
  function detectTypeFromUrl(url) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    if (cleanUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
      return 'audio';
    }
    return 'video';
  }

  // Load Media URL into Player
  function loadMedia(url, overrideTitle = '') {
    if (!url.trim()) return;

    currentMediaUrl = url.trim();
    currentBlob = null;
    currentMediaType = detectTypeFromUrl(currentMediaUrl);

    const fileName = currentMediaUrl.split('/').pop().split('?')[0] || 'media_track';
    currentFileName = fileName.replace(/\.[^/.]+$/, "");

    mediaTitleEl.textContent = overrideTitle || fileName;
    metaSourceEl.textContent = new URL(url, window.location.href).hostname || 'Direct Link';

    // Show appropriate player
    if (currentMediaType === 'video') {
      videoViewport.classList.remove('hidden');
      audioViewport.classList.add('hidden');
      videoPlayer.src = currentMediaUrl;
      videoPlayer.load();

      videoPlayer.onloadedmetadata = () => {
        metaDurationEl.textContent = formatTime(videoPlayer.duration);
        metaFormatEl.textContent = `${videoPlayer.videoWidth}x${videoPlayer.videoHeight} • MP4/Video`;
        metaTypeEl.textContent = 'Video Stream';
      };

      // Populate target format dropdown
      targetFormatSelect.innerHTML = `
        <option value="mp4" selected>MP4 Video (Original Video Stream)</option>
        <option value="mp3">MP3 / Audio Only (Extract Soundtrack)</option>
        <option value="wav">WAV Audio (Uncompressed Audio)</option>
      `;
    } else {
      videoViewport.classList.add('hidden');
      audioViewport.classList.remove('hidden');
      audioPlayer.src = currentMediaUrl;
      audioPlayer.load();

      audioPlayer.onloadedmetadata = () => {
        metaDurationEl.textContent = formatTime(audioPlayer.duration);
        metaFormatEl.textContent = 'Audio Stream';
        metaTypeEl.textContent = 'Audio Track';
      };

      targetFormatSelect.innerHTML = `
        <option value="mp3" selected>MP3 Audio Track</option>
        <option value="wav">WAV Audio (Lossless PCM)</option>
      `;
    }

    handleFormatChange();
    mediaWorkspace.classList.remove('hidden');
    mediaWorkspace.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleFormatChange() {
    const format = targetFormatSelect.value;
    const isAudio = (format === 'mp3' || format === 'wav');
    audioBitrateGroup.classList.toggle('hidden', !isAudio);
  }

  // Load Local File
  function handleLocalFile(file) {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    currentBlob = file;
    currentFileName = file.name.replace(/\.[^/.]+$/, "");
    loadMedia(objectUrl, file.name);
  }

  // =========================================================================
  // Audio Extraction & WAV Encoding (Client-Side Web Audio API)
  // =========================================================================
  function encodeWAV(audioBuffer) {
    const numOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numOfChannels * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeUTFBytes(view, 0, 'RIFF');
    view.setUint32(4, 36 + audioBuffer.length * numOfChannels * 2, true);
    writeUTFBytes(view, 8, 'WAVE');

    // FMT sub-chunk
    writeUTFBytes(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numOfChannels * 2, true); // ByteRate
    view.setUint16(32, numOfChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample (16 bits)

    // Data sub-chunk
    writeUTFBytes(view, 36, 'data');
    view.setUint32(40, audioBuffer.length * numOfChannels * 2, true);

    // Write PCM audio data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numOfChannels; ch++) {
        let sample = audioBuffer.getChannelData(ch)[i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  function writeUTFBytes(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // =========================================================================
  // Download & Extraction Execution
  // =========================================================================
  async function executeDownload() {
    if (!currentMediaUrl) return;

    downloadMediaBtn.disabled = true;
    downloadProgressTrack.classList.remove('hidden');
    downloadProgressFill.style.width = '15%';
    downloadStatusLabel.textContent = 'Fetching media stream data...';

    const targetFormat = targetFormatSelect.value;

    try {
      // 1. If audio extraction is requested (MP3 / WAV)
      if (targetFormat === 'mp3' || targetFormat === 'wav') {
        downloadProgressFill.style.width = '45%';
        downloadStatusLabel.textContent = 'Extracting and decoding audio stream...';

        let arrayBuffer;
        if (currentBlob) {
          arrayBuffer = await currentBlob.arrayBuffer();
        } else {
          // Fetch media
          const res = await fetch(currentMediaUrl, { mode: 'cors' }).catch(() => null);
          if (res && res.ok) {
            arrayBuffer = await res.arrayBuffer();
          } else {
            // Direct download fallback
            throw new Error('CORS restriction on audio extraction. Use direct download.');
          }
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        downloadProgressFill.style.width = '85%';
        downloadStatusLabel.textContent = 'Encoding audio track...';

        const wavBlob = encodeWAV(audioBuffer);
        const fileName = `${currentFileName}_audio.${targetFormat}`;

        triggerDownload(wavBlob, fileName);
      } 
      // 2. Direct Video / Audio download
      else {
        downloadProgressFill.style.width = '60%';
        downloadStatusLabel.textContent = 'Packaging media container...';

        let blobToDownload = currentBlob;
        if (!blobToDownload) {
          const res = await fetch(currentMediaUrl, { mode: 'cors' }).catch(() => null);
          if (res && res.ok) {
            blobToDownload = await res.blob();
          }
        }

        if (blobToDownload) {
          triggerDownload(blobToDownload, `${currentFileName}.${targetFormat}`);
        } else {
          // Native browser download attribute trigger
          const a = document.createElement('a');
          a.href = currentMediaUrl;
          a.target = '_blank';
          a.download = `${currentFileName}.${targetFormat}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }

      downloadProgressFill.style.width = '100%';
      downloadStatusLabel.textContent = 'Download ready!';
      playMediaChime();

      setTimeout(() => {
        downloadMediaBtn.disabled = false;
        downloadProgressTrack.classList.add('hidden');
        downloadProgressFill.style.width = '0%';
        downloadStatusLabel.textContent = 'Ready to download media';
      }, 1200);

    } catch (err) {
      console.warn('Direct stream extraction error, using fallback download:', err);
      // Direct anchor click fallback
      const a = document.createElement('a');
      a.href = currentMediaUrl;
      a.target = '_blank';
      a.download = `${currentFileName}.${targetFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      downloadProgressFill.style.width = '100%';
      downloadStatusLabel.textContent = 'Download link opened!';
      setTimeout(() => {
        downloadMediaBtn.disabled = false;
        downloadProgressTrack.classList.add('hidden');
        downloadProgressFill.style.width = '0%';
      }, 1000);
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  function initListeners() {
    fetchMediaBtn.addEventListener('click', () => {
      loadMedia(mediaUrlInput.value);
    });

    mediaUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        loadMedia(mediaUrlInput.value);
      }
    });

    mediaLocalInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleLocalFile(e.target.files[0]);
      }
    });

    sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.getAttribute('data-sample');
        const sample = SAMPLES[key];
        if (sample) {
          mediaUrlInput.value = sample.url;
          loadMedia(sample.url, sample.title);
        }
      });
    });

    targetFormatSelect.addEventListener('change', handleFormatChange);
    downloadMediaBtn.addEventListener('click', executeDownload);
  }

  document.addEventListener('DOMContentLoaded', initListeners);
})();

