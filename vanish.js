/**
 * Vanish — Background Removal Engine Script
 * Features:
 * - Intelligent edge & corner background auto-detection
 * - Euclidean color distance segmentation with smooth alpha feathering
 * - Real-time tolerance and feathering sliders
 * - Magic wand mode (click image to sample background color)
 * - Manual erase / restore brush
 * - Background replacement (Transparent, White, Black, Comfy Pastels)
 * - Instant PNG download + Audio feedback chime
 */

(function () {
  'use strict';

  // DOM Elements
  const dropzoneBox = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');
  const workspaceEl = document.getElementById('workspaceEl');
  const changeImgBtn = document.getElementById('changeImgBtn');

  const origCanvas = document.getElementById('origCanvas');
  const resultCanvas = document.getElementById('resultCanvas');
  const origCtx = origCanvas.getContext('2d');
  const resultCtx = resultCanvas.getContext('2d');

  const toleranceSlider = document.getElementById('toleranceSlider');
  const toleranceVal = document.getElementById('toleranceVal');
  const featherSlider = document.getElementById('featherSlider');
  const featherVal = document.getElementById('featherVal');
  const brushSizeSlider = document.getElementById('brushSizeSlider');
  const brushSizeVal = document.getElementById('brushSizeVal');

  const modeAutoBtn = document.getElementById('modeAutoBtn');
  const modeWandBtn = document.getElementById('modeWandBtn');
  const modeEraserBtn = document.getElementById('modeEraserBtn');
  const modeRestoreBtn = document.getElementById('modeRestoreBtn');

  const bgChips = document.querySelectorAll('.bg-chip');
  const downloadPngBtn = document.getElementById('downloadPngBtn');

  // State
  let loadedImage = null;
  let originalImageData = null;
  let processedImageData = null;
  let selectedBgColor = null; // null = auto detect
  let currentTool = 'auto'; // 'auto', 'wand', 'eraser', 'restore'
  let activeBgFill = 'transparent';
  let isDrawing = false;

  // Web Audio Chime on Completion
  function playVanishChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();

      const freqs = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + (idx * 0.07);
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

  // Load Image
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        setupCanvases(img);
        dropzoneBox.classList.add('hidden');
        workspaceEl.classList.remove('hidden');
        autoRemoveBackground();
        playVanishChime();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupCanvases(img) {
    // Keep reasonable maximum dimensions for responsive processing
    let w = img.width;
    let h = img.height;
    const maxDim = 1200;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    origCanvas.width = w;
    origCanvas.height = h;
    resultCanvas.width = w;
    resultCanvas.height = h;

    origCtx.clearRect(0, 0, w, h);
    origCtx.drawImage(img, 0, 0, w, h);
    originalImageData = origCtx.getImageData(0, 0, w, h);

    selectedBgColor = null;
  }

  // Detect dominant background color from borders and corners
  function detectBackgroundColor(imgData) {
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Sample four corners and edge midpoints
    const sampleIndices = [
      0, // top-left
      (w - 1) * 4, // top-right
      ((h - 1) * w) * 4, // bottom-left
      ((h - 1) * w + (w - 1)) * 4, // bottom-right
      Math.floor(w / 2) * 4, // top-center
      (Math.floor(h / 2) * w) * 4 // middle-left
    ];

    let rTotal = 0, gTotal = 0, bTotal = 0;
    sampleIndices.forEach(idx => {
      rTotal += data[idx];
      gTotal += data[idx + 1];
      bTotal += data[idx + 2];
    });

    return {
      r: Math.round(rTotal / sampleIndices.length),
      g: Math.round(gTotal / sampleIndices.length),
      b: Math.round(bTotal / sampleIndices.length)
    };
  }

  // Core background removal pass
  function autoRemoveBackground() {
    if (!originalImageData) return;

    const w = originalImageData.width;
    const h = originalImageData.height;
    const src = originalImageData.data;

    // Create fresh copy
    processedImageData = new ImageData(new Uint8ClampedArray(src), w, h);
    const dest = processedImageData.data;

    // Target background color to isolate
    const targetColor = selectedBgColor || detectBackgroundColor(originalImageData);

    const tolerance = parseInt(toleranceSlider.value, 10);
    const feather = parseInt(featherSlider.value, 10);

    const tolDist = (tolerance / 100) * 441.67; // Max Euclidean distance sqrt(255^2 * 3) ≈ 441.67
    const featherDist = (feather / 100) * 120;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];

      // Euclidean color distance
      const dr = r - targetColor.r;
      const dg = g - targetColor.g;
      const db = b - targetColor.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist <= tolDist) {
        dest[i + 3] = 0; // Transparent
      } else if (dist < tolDist + featherDist && featherDist > 0) {
        // Smooth alpha feathering
        const factor = (dist - tolDist) / featherDist;
        dest[i + 3] = Math.round(src[i + 3] * factor);
      } else {
        dest[i + 3] = src[i + 3];
      }
    }

    renderProcessedCanvas();
  }

  // Render processed image with active background fill
  function renderProcessedCanvas() {
    if (!processedImageData) return;

    const w = resultCanvas.width;
    const h = resultCanvas.height;

    resultCtx.clearRect(0, 0, w, h);

    if (activeBgFill !== 'transparent') {
      resultCtx.fillStyle = activeBgFill;
      resultCtx.fillRect(0, 0, w, h);
    }

    // Temporary canvas for compositing alpha mask over solid color if needed
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(processedImageData, 0, 0);

    resultCtx.drawImage(tempCanvas, 0, 0);
  }

  // Magic Wand: Click on original canvas to pick color
  origCanvas.addEventListener('click', (e) => {
    if (currentTool !== 'wand' || !originalImageData) return;

    const rect = origCanvas.getBoundingClientRect();
    const scaleX = origCanvas.width / rect.width;
    const scaleY = origCanvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x >= 0 && x < origCanvas.width && y >= 0 && y < origCanvas.height) {
      const idx = (y * origCanvas.width + x) * 4;
      const src = originalImageData.data;
      selectedBgColor = {
        r: src[idx],
        g: src[idx + 1],
        b: src[idx + 2]
      };
      autoRemoveBackground();
    }
  });

  // Manual Brush (Erase / Restore) on Result Canvas
  function applyBrush(e) {
    if (!processedImageData || !originalImageData) return;
    if (currentTool !== 'eraser' && currentTool !== 'restore') return;

    const rect = resultCanvas.getBoundingClientRect();
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    const cx = Math.floor((e.clientX - rect.left) * scaleX);
    const cy = Math.floor((e.clientY - rect.top) * scaleY);
    const radius = parseInt(brushSizeSlider.value, 10);

    const w = resultCanvas.width;
    const h = resultCanvas.height;
    const dest = processedImageData.data;
    const src = originalImageData.data;

    const r2 = radius * radius;
    const startX = Math.max(0, cx - radius);
    const endX = Math.min(w, cx + radius);
    const startY = Math.max(0, cy - radius);
    const endY = Math.min(h, cy + radius);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= r2) {
          const idx = (y * w + x) * 4;
          if (currentTool === 'eraser') {
            dest[idx + 3] = 0;
          } else if (currentTool === 'restore') {
            dest[idx] = src[idx];
            dest[idx + 1] = src[idx + 1];
            dest[idx + 2] = src[idx + 2];
            dest[idx + 3] = src[idx + 3];
          }
        }
      }
    }

    renderProcessedCanvas();
  }

  resultCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    applyBrush(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDrawing) applyBrush(e);
  });

  window.addEventListener('mouseup', () => {
    isDrawing = false;
  });

  // Sliders input
  toleranceSlider.addEventListener('input', (e) => {
    toleranceVal.textContent = `${e.target.value}%`;
    autoRemoveBackground();
  });

  featherSlider.addEventListener('input', (e) => {
    featherVal.textContent = `${e.target.value}%`;
    autoRemoveBackground();
  });

  brushSizeSlider.addEventListener('input', (e) => {
    brushSizeVal.textContent = `${e.target.value}px`;
  });

  // Tool Modes
  function setToolMode(mode) {
    currentTool = mode;
    [modeAutoBtn, modeWandBtn, modeEraserBtn, modeRestoreBtn].forEach(b => b.classList.remove('btn-primary'));
    if (mode === 'auto') modeAutoBtn.classList.add('btn-primary');
    if (mode === 'wand') modeWandBtn.classList.add('btn-primary');
    if (mode === 'eraser') modeEraserBtn.classList.add('btn-primary');
    if (mode === 'restore') modeRestoreBtn.classList.add('btn-primary');
  }

  modeAutoBtn.addEventListener('click', () => {
    setToolMode('auto');
    selectedBgColor = null;
    autoRemoveBackground();
  });

  modeWandBtn.addEventListener('click', () => {
    setToolMode('wand');
  });

  modeEraserBtn.addEventListener('click', () => {
    setToolMode('eraser');
  });

  modeRestoreBtn.addEventListener('click', () => {
    setToolMode('restore');
  });

  // Background Fill Chips
  bgChips.forEach(chip => {
    chip.addEventListener('click', () => {
      bgChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeBgFill = chip.getAttribute('data-bg');
      renderProcessedCanvas();
    });
  });

  // Download Transparent PNG
  downloadPngBtn.addEventListener('click', () => {
    if (!resultCanvas) return;
    const a = document.createElement('a');
    a.href = resultCanvas.toDataURL('image/png');
    a.download = 'vanished_cutout.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // Change Image
  changeImgBtn.addEventListener('click', () => {
    fileInput.value = '';
    workspaceEl.classList.add('hidden');
    dropzoneBox.classList.remove('hidden');
  });

  // Dropzone events
  dropzoneBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneBox.classList.add('drag-over');
  });

  dropzoneBox.addEventListener('dragleave', () => {
    dropzoneBox.classList.remove('drag-over');
  });

  dropzoneBox.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneBox.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

})();

