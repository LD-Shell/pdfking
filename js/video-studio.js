'use strict';

document.addEventListener('DOMContentLoaded', () => {

// ─── Utilities ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const icons = {
        success: 'fa-circle-check text-emerald-400',
        error:   'fa-circle-xmark text-red-400',
        info:    'fa-circle-info text-indigo-400',
        warn:    'fa-triangle-exclamation text-yellow-400'
    };
    const el = document.createElement('div');
    el.className = 'flex items-center gap-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-5 py-3 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 pointer-events-auto max-w-sm animate-slide-in';
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} text-lg flex-shrink-0"></i><span class="text-sm font-medium">${msg}</span>`;
    const container = document.getElementById('toastContainer');
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; el.style.transition = 'all 0.3s'; setTimeout(() => el.remove(), 350); }, 3000);
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

function formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ─── Theme ────────────────────────────────────────────────────────────────────
document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.theme = dark ? 'dark' : 'light';
});

// ─── State ────────────────────────────────────────────────────────────────────
let loadedFiles   = [];   // Array of File objects
let videoMeta     = [];   // [{duration, width, height, name}]
let isMergeMode   = false;
let isProcessing  = false;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const uploadZone        = document.getElementById('uploadZone');
const fileInput         = document.getElementById('fileInput');
const workspace         = document.getElementById('workspace');
const videoPreview      = document.getElementById('videoPreview');
const processingOverlay = document.getElementById('processingOverlay');
const encodeProgress    = document.getElementById('encodeProgress');
const encodeDetail      = document.getElementById('encodeDetail');
const initOverlay       = document.getElementById('initOverlay');
const panelTitle        = document.getElementById('panelTitle');

// Hide init overlay immediately — no FFmpeg needed
initOverlay.style.display = 'none';
uploadZone.classList.remove('hidden');
uploadZone.classList.add('flex');

// ─── Upload ───────────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('border-indigo-500', 'bg-indigo-100/50'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('border-indigo-500', 'bg-indigo-100/50'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('border-indigo-500', 'bg-indigo-100/50');
    if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFiles(Array.from(e.target.files)); });

async function handleFiles(files) {
    const videoFiles = files.filter(f => f.type.startsWith('video/'));
    if (!videoFiles.length) return showToast('Please upload video files.', 'error');

    loadedFiles = videoFiles;
    isMergeMode = videoFiles.length > 1;
    videoMeta = [];

    // Probe each file for metadata
    for (const file of videoFiles) {
        const meta = await probeVideo(file);
        videoMeta.push(meta);
    }

    // Show first video in preview
    videoPreview.src = URL.createObjectURL(videoFiles[0]);
    videoPreview.load();

    // Update UI
    panelTitle.textContent = isMergeMode
        ? `Merge ${videoFiles.length} Videos`
        : 'Encoding Parameters';

    const firstMeta = videoMeta[0];
    document.getElementById('trimStart').value = 0;
    document.getElementById('trimEnd').value   = firstMeta.duration.toFixed(2);
    document.getElementById('cropW').value     = '';
    document.getElementById('cropH').value     = '';
    document.getElementById('cropX').value     = 0;
    document.getElementById('cropY').value     = 0;
    document.getElementById('resizeW').value   = '';
    document.getElementById('resizeH').value   = '';

    // Update info badge
    updateInfoPanel();

    workspace.classList.remove('hidden');
    workspace.classList.add('flex');
    uploadZone.classList.add('hidden');
    uploadZone.classList.remove('flex');

    if (isMergeMode) {
        showToast(`${videoFiles.length} videos loaded — will be merged in order.`, 'info');
    } else {
        showToast(`Loaded: ${firstMeta.name} (${firstMeta.width}×${firstMeta.height}, ${formatTime(firstMeta.duration)})`, 'success');
    }
}

function probeVideo(file) {
    return new Promise(resolve => {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
            resolve({
                name:     file.name.replace(/\.[^/.]+$/, ''),
                duration: vid.duration,
                width:    vid.videoWidth,
                height:   vid.videoHeight,
                file
            });
            URL.revokeObjectURL(vid.src);
        };
        vid.onerror = () => resolve({ name: file.name, duration: 0, width: 0, height: 0, file });
        vid.src = URL.createObjectURL(file);
    });
}

function updateInfoPanel() {
    // Update or create an info strip above the action buttons
    let infoEl = document.getElementById('videoInfoStrip');
    if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.id = 'videoInfoStrip';
        infoEl.className = 'bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex flex-col gap-1';
        const actionsEl = document.getElementById('executeExportBtn').parentElement;
        actionsEl.parentElement.insertBefore(infoEl, actionsEl);
    }

    if (isMergeMode) {
        const totalDur = videoMeta.reduce((s, m) => s + m.duration, 0);
        infoEl.innerHTML = `
            <div class="font-bold text-slate-700 dark:text-slate-300 mb-1">Merge queue (${videoMeta.length} clips)</div>
            ${videoMeta.map((m, i) => `<div class="flex justify-between"><span class="truncate max-w-[140px]">${i + 1}. ${m.name}</span><span>${m.width}×${m.height} · ${formatTime(m.duration)}</span></div>`).join('')}
            <div class="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1 flex justify-between font-semibold text-slate-600 dark:text-slate-400"><span>Total</span><span>${formatTime(totalDur)}</span></div>
        `;
    } else {
        const m = videoMeta[0];
        infoEl.innerHTML = `
            <div class="flex justify-between"><span>Resolution</span><span class="font-semibold text-slate-700 dark:text-slate-300">${m.width} × ${m.height}</span></div>
            <div class="flex justify-between"><span>Duration</span><span class="font-semibold text-slate-700 dark:text-slate-300">${formatTime(m.duration)}</span></div>
            <div class="flex justify-between"><span>File size</span><span class="font-semibold text-slate-700 dark:text-slate-300">${formatBytes(m.file.size)}</span></div>
        `;
    }
}

// ─── Set duration button ───────────────────────────────────────────────────────
document.getElementById('setDurationBtn').addEventListener('click', () => {
    if (!videoMeta.length) return;
    document.getElementById('trimStart').value = 0;
    document.getElementById('trimEnd').value   = videoMeta[0].duration.toFixed(2);
});

// ─── Reset ────────────────────────────────────────────────────────────────────
document.getElementById('resetWorkspaceBtn').addEventListener('click', () => {
    loadedFiles = []; videoMeta = []; isProcessing = false;
    videoPreview.src = '';
    workspace.classList.add('hidden'); workspace.classList.remove('flex');
    uploadZone.classList.remove('hidden'); uploadZone.classList.add('flex');
    fileInput.value = '';
    const strip = document.getElementById('videoInfoStrip');
    if (strip) strip.remove();
});

// ─── Core: Canvas-based video processor ───────────────────────────────────────
/**
 * processVideoSegment — draws video frames onto a canvas and captures via MediaRecorder.
 * @param {HTMLVideoElement} srcVid - preloaded video element (readyState >= 2)
 * @param {Object} opts - { startSec, endSec, cropW, cropH, cropX, cropY, outW, outH, fps }
 * @param {Function} onProgress - called with (0..1)
 * @returns {Promise<Blob>} — webm blob
 */
function processVideoSegment(srcVid, opts, onProgress) {
    return new Promise((resolve, reject) => {
        const { startSec, endSec, cropW, cropH, cropX, cropY, outW, outH, fps } = opts;
        const duration = endSec - startSec;

        const canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        // Pick best supported MIME
        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
        const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

        const stream  = canvas.captureStream(fps);
        const chunks  = [];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.bitsPerSec || 4_000_000 });
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));

        srcVid.currentTime = startSec;
        srcVid.onseeked = null;

        let frameHandle = null;
        let started = false;

        function drawFrame() {
            if (!started || srcVid.currentTime > endSec + 0.05) {
                recorder.stop();
                srcVid.pause();
                if (frameHandle) cancelAnimationFrame(frameHandle);
                return;
            }
            // Draw cropped region scaled to output size
            ctx.drawImage(srcVid, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
            const elapsed = srcVid.currentTime - startSec;
            onProgress(Math.min(1, elapsed / duration));
            frameHandle = requestAnimationFrame(drawFrame);
        }

        srcVid.onseeked = () => {
            if (started) return;
            started = true;
            recorder.start(100); // collect chunks every 100ms
            srcVid.play().catch(reject);
            frameHandle = requestAnimationFrame(drawFrame);
        };

        srcVid.onerror = reject;
    });
}

/**
 * loadVideoEl — create and preload a hidden video element from a File
 */
function loadVideoEl(file) {
    return new Promise((resolve, reject) => {
        const vid = document.createElement('video');
        vid.preload = 'auto';
        vid.muted   = true;
        vid.style.display = 'none';
        document.body.appendChild(vid);
        vid.oncanplaythrough = () => resolve(vid);
        vid.onerror = reject;
        vid.src = URL.createObjectURL(file);
        vid.load();
    });
}

/**
 * mergeBlobs — concatenate two webm blobs by encoding each segment sequentially.
 * (True mux-level merge requires FFmpeg; here we play each and record.)
 */
async function processAndMerge(files, opts, onProgress) {
    const blobs = [];
    for (let i = 0; i < files.length; i++) {
        const vid = await loadVideoEl(files[i]);
        const meta = videoMeta[i];
        const segOpts = {
            ...opts,
            startSec:   0,
            endSec:     meta.duration,
            cropW:      opts.cropW   || meta.width,
            cropH:      opts.cropH   || meta.height,
            outW:       opts.outW    || opts.cropW || meta.width,
            outH:       opts.outH    || opts.cropH || meta.height,
        };
        const blob = await processVideoSegment(vid, segOpts, p => {
            onProgress((i + p) / files.length);
        });
        blobs.push(blob);
        vid.pause();
        URL.revokeObjectURL(vid.src);
        document.body.removeChild(vid);
    }
    // Concatenate blobs (WebM container allows naive concatenation for same-codec streams)
    return new Blob(blobs, { type: blobs[0].type });
}

// ─── Export handler ────────────────────────────────────────────────────────────
document.getElementById('executeExportBtn').addEventListener('click', async () => {
    if (isProcessing || !loadedFiles.length) return;

    // ── Read parameters ──
    const trimStart   = parseFloat(document.getElementById('trimStart').value) || 0;
    const trimEnd     = parseFloat(document.getElementById('trimEnd').value)   || videoMeta[0].duration;
    const cropWInput  = parseInt(document.getElementById('cropW').value)  || null;
    const cropHInput  = parseInt(document.getElementById('cropH').value)  || null;
    const cropX       = parseInt(document.getElementById('cropX').value)  || 0;
    const cropY       = parseInt(document.getElementById('cropY').value)  || 0;
    const resizeW     = parseInt(document.getElementById('resizeW').value) || null;
    const resizeH     = parseInt(document.getElementById('resizeH').value) || null;
    const targetMb    = parseFloat(document.getElementById('targetSizeMb').value) || null;

    // Resolve final dimensions from first video
    const firstMeta  = videoMeta[0];
    const srcW       = firstMeta.width;
    const srcH       = firstMeta.height;

    const cropW = cropWInput || srcW - cropX;
    const cropH = cropHInput || srcH - cropY;

    // Compute output size honouring resize + aspect ratio
    let outW = resizeW, outH = resizeH;
    if (outW && !outH) outH = Math.round(outW * cropH / cropW);
    if (outH && !outW) outW = Math.round(outH * cropW / cropH);
    if (!outW && !outH) { outW = cropW; outH = cropH; }

    // Force even dimensions (video codecs requirement)
    outW = outW % 2 === 0 ? outW : outW + 1;
    outH = outH % 2 === 0 ? outH : outH + 1;

    const duration = isMergeMode
        ? videoMeta.reduce((s, m) => s + m.duration, 0)
        : (trimEnd - trimStart);

    if (duration <= 0) return showToast('Invalid trim range.', 'error');
    if (cropW <= 0 || cropH <= 0) return showToast('Invalid crop dimensions.', 'error');

    // Compute bitrate from target size
    let bitsPerSec = 4_000_000; // 4 Mbps default
    if (targetMb) {
        // Reserve 10% for audio/container overhead
        bitsPerSec = Math.round((targetMb * 8 * 1_000_000 * 0.9) / duration);
        bitsPerSec = Math.max(200_000, Math.min(bitsPerSec, 20_000_000));
    }

    const opts = { startSec: trimStart, endSec: trimEnd, cropW, cropH, cropX, cropY, outW, outH, fps: 30, bitsPerSec };

    // ── Start processing ──
    isProcessing = true;
    processingOverlay.classList.remove('hidden');
    processingOverlay.classList.add('flex');
    encodeProgress.style.width = '0%';
    encodeDetail.textContent   = '0%';
    const btn = document.getElementById('executeExportBtn');
    btn.disabled = true;

    const onProgress = (p) => {
        const pct = Math.round(p * 100);
        encodeProgress.style.width = pct + '%';
        encodeDetail.textContent   = pct + '%';
    };

    try {
        let resultBlob;

        if (isMergeMode) {
            resultBlob = await processAndMerge(loadedFiles, opts, onProgress);
        } else {
            const vid = await loadVideoEl(loadedFiles[0]);
            resultBlob = await processVideoSegment(vid, opts, onProgress);
            vid.pause();
            URL.revokeObjectURL(vid.src);
            document.body.removeChild(vid);
        }

        onProgress(1);

        const ext = resultBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const outName = isMergeMode
            ? `merged_${Date.now()}.${ext}`
            : `${videoMeta[0].name}_edited.${ext}`;

        downloadBlob(resultBlob, outName);
        showToast(`Done! ${formatBytes(resultBlob.size)} · ${outW}×${outH}`, 'success');

    } catch (err) {
        console.error(err);
        showToast('Processing failed: ' + (err.message || err), 'error');
    } finally {
        isProcessing = false;
        processingOverlay.classList.add('hidden');
        processingOverlay.classList.remove('flex');
        btn.disabled = false;
    }
});

// ─── Keyboard shortcut: Space = play/pause preview ────────────────────────────
document.addEventListener('keydown', e => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        videoPreview.paused ? videoPreview.play() : videoPreview.pause();
    }
});

}); // end DOMContentLoaded
