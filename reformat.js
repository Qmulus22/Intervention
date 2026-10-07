/**
 * Reformat — In-Browser File & Alter Engine
 * Supports:
 * - Image conversions: PNG ⇄ JPEG ⇄ WEBP ⇄ BMP ⇄ SVG ➔ PDF
 * - Document conversions: DOCX ➔ PDF / HTML / TXT (via Mammoth + jsPDF)
 * - Text conversions: Markdown / TXT / HTML ➔ PDF
 * - Data transforms: JSON ⇄ CSV
 * 100% Client-Side Privacy.
 */

(function () {
  'use strict';

  // State
  let currentFile = null;
  let convertedBlob = null;
  let convertedFileName = '';

  // DOM Elements
  const dropzoneBox = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');
  const workspaceCard = document.getElementById('workspaceCard');
  const fileThumb = document.getElementById('fileThumb');
  const fileNameEl = document.getElementById('fileName');
  const fileMetaEl = document.getElementById('fileMeta');
  const removeFileBtn = document.getElementById('removeFileBtn');

  const targetFormatSelect = document.getElementById('targetFormatSelect');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValEl = document.getElementById('qualityVal');
  const qualityGroup = document.getElementById('qualityGroup');
  const bgColorSelect = document.getElementById('bgColorSelect');
  const bgColorGroup = document.getElementById('bgColorGroup');

  const convertBtn = document.getElementById('convertBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  const resultCard = document.getElementById('resultCard');
  const resultFileNameEl = document.getElementById('resultFileName');
  const resultOrigSizeEl = document.getElementById('resultOrigSize');
  const resultNewSizeEl = document.getElementById('resultNewSize');
  const resultDiffEl = document.getElementById('resultDiff');
  const resultPreviewBox = document.getElementById('resultPreviewBox');
  const downloadBtn = document.getElementById('downloadBtn');
  const convertAnotherBtn = document.getElementById('convertAnotherBtn');

  // Shortcut Chips
  const shortcutChips = document.querySelectorAll('.shortcut-chip');

  // Web Audio Chime on Completion
  function playSuccessChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();

      const notes = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + (idx * 0.08);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.6);
      });
    } catch (e) {
      // Audio fallback
    }
  }

  // Format File Size
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Detect File Category
  function getFileCategory(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const type = file.type.toLowerCase();

    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif'].includes(ext)) {
      return 'image';
    }
    if (ext === 'docx' || type.includes('wordprocessingml')) {
      return 'docx';
    }
    if (['md', 'markdown'].includes(ext)) {
      return 'markdown';
    }
    if (ext === 'txt' || type.includes('text/plain')) {
      return 'text';
    }
    if (ext === 'json' || type.includes('json')) {
      return 'json';
    }
    if (ext === 'csv' || type.includes('csv')) {
      return 'csv';
    }
    if (ext === 'html' || ext === 'htm') {
      return 'html';
    }
    return 'generic';
  }

  // Populate Target Formats based on Category
  function populateTargetFormats(category, originalExt) {
    targetFormatSelect.innerHTML = '';
    let options = [];

    if (category === 'image') {
      options = [
        { val: 'png', text: 'PNG (Portable Network Graphics)' },
        { val: 'jpeg', text: 'JPEG / JPG (Standard Photo)' },
        { val: 'webp', text: 'WEBP (High Efficiency Web Image)' },
        { val: 'bmp', text: 'BMP (Bitmap Image)' },
        { val: 'pdf', text: 'PDF (Single-Page Document)' }
      ];
      options.sort((a, b) => (a.val === originalExt ? 1 : -1));
    } else if (category === 'docx') {
      options = [
        { val: 'pdf', text: 'PDF (Print Document)' },
        { val: 'html', text: 'HTML (Web Document)' },
        { val: 'txt', text: 'Plain Text (.txt)' },
        { val: 'md', text: 'Markdown (.md)' }
      ];
    } else if (category === 'markdown') {
      options = [
        { val: 'pdf', text: 'PDF (Print Document)' },
        { val: 'html', text: 'HTML Web Page' },
        { val: 'txt', text: 'Plain Text (.txt)' }
      ];
    } else if (category === 'text' || category === 'html') {
      options = [
        { val: 'pdf', text: 'PDF Document' },
        { val: 'txt', text: 'Plain Text (.txt)' },
        { val: 'md', text: 'Markdown (.md)' }
      ];
    } else if (category === 'json') {
      options = [
        { val: 'csv', text: 'CSV (Comma Separated Values)' },
        { val: 'txt', text: 'Plain Text (.txt)' },
        { val: 'json-pretty', text: 'Formatted JSON (Beautified)' }
      ];
    } else if (category === 'csv') {
      options = [
        { val: 'json', text: 'JSON Data (.json)' },
        { val: 'txt', text: 'Plain Text (.txt)' }
      ];
    } else {
      options = [
        { val: 'txt', text: 'Plain Text (.txt)' },
        { val: 'pdf', text: 'PDF Document' }
      ];
    }

    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.val;
      el.textContent = opt.text;
      targetFormatSelect.appendChild(el);
    });

    handleTargetFormatChange();
  }

  function handleTargetFormatChange() {
    const val = targetFormatSelect.value;
    const isLossyImage = (val === 'jpeg' || val === 'webp');
    qualityGroup.classList.toggle('hidden', !isLossyImage);
    bgColorGroup.classList.toggle('hidden', val !== 'jpeg');
  }

  // Handle Uploaded File
  function handleFileSelected(file) {
    if (!file) return;
    currentFile = file;
    convertedBlob = null;
    resultCard.classList.add('hidden');

    const ext = file.name.split('.').pop().toLowerCase();
    const category = getFileCategory(file);

    fileNameEl.textContent = file.name;
    fileMetaEl.textContent = `${formatBytes(file.size)} • ${category.toUpperCase()}`;

    // Thumbnail
    if (category === 'image') {
      const reader = new FileReader();
      reader.onload = (e) => {
        fileThumb.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(file);
    } else {
      fileThumb.innerHTML = `<span style="font-weight: 800; font-size: 0.82rem; color: var(--cp-peach);">${ext.toUpperCase().substring(0, 4)}</span>`;
    }

    populateTargetFormats(category, ext);
    workspaceCard.classList.remove('hidden');
    workspaceCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // =========================================================================
  // Conversion Handlers
  // =========================================================================
  async function executeConversion() {
    if (!currentFile) return;

    convertBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '20%';
    progressLabel.textContent = 'Analyzing and reading file...';

    const targetFormat = targetFormatSelect.value;
    const category = getFileCategory(currentFile);
    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || currentFile.name;

    try {
      progressFill.style.width = '45%';
      progressLabel.textContent = `Altering format to ${targetFormat.toUpperCase()}...`;

      let result = null;

      if (category === 'image') {
        if (targetFormat === 'pdf') {
          result = await convertImageToPdf(currentFile);
          convertedFileName = `${baseName}.pdf`;
        } else {
          result = await convertImage(currentFile, targetFormat);
          convertedFileName = `${baseName}.${targetFormat === 'jpeg' ? 'jpg' : targetFormat}`;
        }
      } else if (category === 'docx') {
        result = await convertDocx(currentFile, targetFormat, baseName);
      } else if (category === 'markdown' || category === 'text' || category === 'html') {
        result = await convertTextDocument(currentFile, targetFormat, baseName);
      } else if (category === 'json' || category === 'csv') {
        result = await convertDataFile(currentFile, targetFormat, baseName);
      } else {
        throw new Error('Unsupported format combination');
      }

      progressFill.style.width = '100%';
      progressLabel.textContent = 'Conversion complete!';

      setTimeout(() => {
        displayResult(result);
        playSuccessChime();
        convertBtn.disabled = false;
        progressContainer.classList.add('hidden');
        progressFill.style.width = '0%';
      }, 350);

    } catch (err) {
      console.error(err);
      alert('Conversion error: ' + (err.message || 'Failed to process file.'));
      convertBtn.disabled = false;
      progressContainer.classList.add('hidden');
      progressFill.style.width = '0%';
    }
  }

  function convertImage(file, targetFormat) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (targetFormat === 'jpeg') {
            ctx.fillStyle = bgColorSelect.value || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          ctx.drawImage(img, 0, 0);

          let mime = 'image/png';
          if (targetFormat === 'jpeg') mime = 'image/jpeg';
          if (targetFormat === 'webp') mime = 'image/webp';
          if (targetFormat === 'bmp') mime = 'image/bmp';

          const quality = parseFloat(qualitySlider.value) / 100;
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({
                blob,
                type: 'image',
                previewUrl: URL.createObjectURL(blob)
              });
            } else {
              reject(new Error('Canvas blob generation failed'));
            }
          }, mime, quality);
        };
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function convertImageToPdf(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (window.jspdf && window.jspdf.jsPDF) {
            const orientation = img.width > img.height ? 'landscape' : 'portrait';
            const doc = new window.jspdf.jsPDF({ orientation, unit: 'px', format: [img.width, img.height] });
            doc.addImage(img, 'JPEG', 0, 0, img.width, img.height);
            const pdfBlob = doc.output('blob');
            resolve({ blob: pdfBlob, type: 'pdf' });
          } else {
            reject(new Error('jsPDF library loading error. Check connection.'));
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function convertDocx(file, targetFormat, baseName) {
    const arrayBuffer = await file.arrayBuffer();

    if (!window.mammoth) {
      throw new Error('Mammoth parser not ready');
    }

    if (targetFormat === 'html') {
      const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      convertedFileName = `${baseName}.html`;
      return { blob, type: 'text', previewText: html.substring(0, 500) + '...' };
    }

    const { value: rawText } = await window.mammoth.extractRawText({ arrayBuffer });

    if (targetFormat === 'txt' || targetFormat === 'md') {
      const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
      convertedFileName = `${baseName}.${targetFormat}`;
      return { blob, type: 'text', previewText: rawText.substring(0, 500) + '...' };
    }

    if (targetFormat === 'pdf') {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF generator unavailable');
      const doc = new window.jspdf.jsPDF();
      const splitText = doc.splitTextToSize(rawText, 180);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(splitText, 15, 20);
      const pdfBlob = doc.output('blob');
      convertedFileName = `${baseName}.pdf`;
      return { blob: pdfBlob, type: 'pdf' };
    }

    throw new Error('Unsupported DOCX target');
  }

  async function convertTextDocument(file, targetFormat, baseName) {
    const text = await file.text();

    if (targetFormat === 'pdf') {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF generator unavailable');
      const doc = new window.jspdf.jsPDF();
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 15, 20);
      const blob = doc.output('blob');
      convertedFileName = `${baseName}.pdf`;
      return { blob, type: 'pdf' };
    }

    if (targetFormat === 'html') {
      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:1rem;line-height:1.6;}</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      convertedFileName = `${baseName}.html`;
      return { blob, type: 'text', previewText: text.substring(0, 500) };
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    convertedFileName = `${baseName}.${targetFormat}`;
    return { blob, type: 'text', previewText: text.substring(0, 500) };
  }

  async function convertDataFile(file, targetFormat, baseName) {
    const raw = await file.text();

    if (targetFormat === 'csv') {
      const json = JSON.parse(raw);
      const arr = Array.isArray(json) ? json : [json];
      if (arr.length === 0) throw new Error('Empty JSON array');

      const headers = Object.keys(arr[0]);
      const csvRows = [headers.join(',')];

      for (const row of arr) {
        const values = headers.map(header => {
          const val = row[header] !== undefined ? String(row[header]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
      }

      const csvData = csvRows.join('\n');
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
      convertedFileName = `${baseName}.csv`;
      return { blob, type: 'text', previewText: csvData.substring(0, 500) };
    }

    if (targetFormat === 'json') {
      const lines = raw.trim().split(/\r\n|\n/);
      if (lines.length < 2) throw new Error('CSV requires header and at least one row');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const resultArr = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = vals[idx] !== undefined ? vals[idx] : '';
        });
        resultArr.push(obj);
      }

      const jsonStr = JSON.stringify(resultArr, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      convertedFileName = `${baseName}.json`;
      return { blob, type: 'text', previewText: jsonStr.substring(0, 500) };
    }

    if (targetFormat === 'json-pretty') {
      const json = JSON.parse(raw);
      const pretty = JSON.stringify(json, null, 2);
      const blob = new Blob([pretty], { type: 'application/json;charset=utf-8' });
      convertedFileName = `${baseName}_beautified.json`;
      return { blob, type: 'text', previewText: pretty.substring(0, 500) };
    }

    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    convertedFileName = `${baseName}.txt`;
    return { blob, type: 'text', previewText: raw.substring(0, 500) };
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function displayResult(result) {
    convertedBlob = result.blob;
    resultFileNameEl.textContent = convertedFileName;
    resultOrigSizeEl.textContent = formatBytes(currentFile.size);
    resultNewSizeEl.textContent = formatBytes(convertedBlob.size);

    const diff = convertedBlob.size - currentFile.size;
    const diffPct = Math.round((diff / currentFile.size) * 100);
    if (diff < 0) {
      resultDiffEl.textContent = `${diffPct}% (Saved ${formatBytes(Math.abs(diff))})`;
      resultDiffEl.style.color = 'var(--cp-green)';
    } else {
      resultDiffEl.textContent = `+${diffPct}%`;
      resultDiffEl.style.color = 'var(--text-muted)';
    }

    resultPreviewBox.innerHTML = '';
    if (result.type === 'image' && result.previewUrl) {
      resultPreviewBox.innerHTML = `<img src="${result.previewUrl}" alt="Converted Preview">`;
    } else if (result.type === 'pdf') {
      resultPreviewBox.innerHTML = `
        <div style="text-align:center; padding: 1.5rem; color: var(--cp-peach);">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <p style="margin-top: 0.5rem; font-weight:600;">PDF Document Ready for Download</p>
        </div>
      `;
    } else if (result.previewText) {
      resultPreviewBox.innerHTML = `<pre class="result-preview-text">${escapeHtml(result.previewText)}</pre>`;
    } else {
      resultPreviewBox.innerHTML = `<span style="color:var(--text-muted);">Conversion ready for download.</span>`;
    }

    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function downloadConvertedFile() {
    if (!convertedBlob || !convertedFileName) return;
    const url = URL.createObjectURL(convertedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = convertedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  function setupListeners() {
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
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0]);
      }
    });

    removeFileBtn.addEventListener('click', () => {
      currentFile = null;
      convertedBlob = null;
      fileInput.value = '';
      workspaceCard.classList.add('hidden');
      resultCard.classList.add('hidden');
    });

    targetFormatSelect.addEventListener('change', handleTargetFormatChange);

    qualitySlider.addEventListener('input', (e) => {
      qualityValEl.textContent = `${e.target.value}%`;
    });

    convertBtn.addEventListener('click', executeConversion);
    downloadBtn.addEventListener('click', downloadConvertedFile);

    convertAnotherBtn.addEventListener('click', () => {
      currentFile = null;
      convertedBlob = null;
      fileInput.value = '';
      workspaceCard.classList.add('hidden');
      resultCard.classList.add('hidden');
      dropzoneBox.scrollIntoView({ behavior: 'smooth' });
    });

    shortcutChips.forEach(chip => {
      chip.addEventListener('click', () => {
        fileInput.click();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', setupListeners);
})();

