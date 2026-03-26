'use strict';

document.addEventListener('DOMContentLoaded', () => {

// ─── Utilities ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const icons = { success:'fa-circle-check text-emerald-400', error:'fa-circle-xmark text-red-400', info:'fa-circle-info text-indigo-400' };
    const el = document.createElement('div');
    el.className = 'toast flex items-center gap-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-5 py-3 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 pointer-events-auto max-w-sm';
    el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info} text-lg flex-shrink-0"></i><span class="text-sm font-medium">${msg}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function snapshotCanvas(src) {
    // Returns a new canvas that is a pixel-perfect copy of src canvas / image
    const c = document.createElement('canvas');
    c.width  = src.width  || src.naturalWidth;
    c.height = src.height || src.naturalHeight;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.theme = dark ? 'dark' : 'light';
});

// ─── Style matrix ─────────────────────────────────────────────────────────────
const STYLES = [
    { id:'01_Pure_White_Studio',    type:'radial', c1:[255,255,255], c2:[240,240,240] },
    { id:'02_Off_White_Vignette',   type:'radial', c1:[252,252,252], c2:[220,220,220] },
    { id:'03_Light_Gray_Linear',    type:'linear', c1:[250,250,250], c2:[200,200,200] },
    { id:'04_Clean_Silver_Radial',  type:'radial', c1:[245,245,245], c2:[192,192,192] },
    { id:'05_Soft_Cloud',           type:'radial', c1:[255,255,255], c2:[200,205,210] },
    { id:'06_Executive_Platinum',   type:'radial', c1:[220,220,220], c2:[160,160,160] },
    { id:'07_Corporate_Cool_Gray',  type:'linear', c1:[230,233,236], c2:[180,185,190] },
    { id:'08_Slate_Light',          type:'radial', c1:[180,185,190], c2:[140,145,150] },
    { id:'09_Neutral_Gray_Medium',  type:'radial', c1:[169,169,169], c2:[105,105,105] },
    { id:'10_Tech_Slate_Linear',    type:'linear', c1:[200,205,210], c2:[120,125,130] },
    { id:'11_Warm_Paper',           type:'radial', c1:[255,253,245], c2:[230,225,215] },
    { id:'12_Cream_Studio',         type:'radial', c1:[255,250,240], c2:[220,210,190] },
    { id:'13_Warm_Beige_Linear',    type:'linear', c1:[250,245,235], c2:[210,200,180] },
    { id:'14_Latte_Vignette',       type:'radial', c1:[245,235,225], c2:[190,175,160] },
    { id:'15_UH_Red_Tint_Subtle',   type:'radial', c1:[255,250,250], c2:[240,220,220] },
    { id:'16_UH_Slate_Tint_Light',  type:'radial', c1:[230,235,240], c2:[160,170,180] },
    { id:'17_Cool_Blue_Tint',       type:'linear', c1:[240,245,255], c2:[200,210,230] },
    { id:'18_Modern_Dark_Gray',     type:'radial', c1:[120,120,120], c2:[60,60,60]   },
    { id:'19_Deep_Slate_Vignette',  type:'radial', c1:[100,110,115], c2:[40,45,50]   },
    { id:'20_Charcoal_Linear',      type:'linear', c1:[100,100,100], c2:[50,50,50]   },
    { id:'21_Midnight_Blue_Pro',    type:'radial', c1:[80,90,110],   c2:[30,40,60]   },
];

// ─── State ────────────────────────────────────────────────────────────────────
let currentSubjectImage = null;  // HTMLImageElement — current working image
let eraserBaseImage     = null;  // snapshot before eraser session (for session undo)
let currentStyleIndex   = 0;
let originalFilename    = 'image';
let solidBgColor        = null;
let cropperInstance     = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas     = document.getElementById('previewCanvas');
const ctx        = canvas.getContext('2d');
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');
const workspace  = document.getElementById('workspace');
const cropModal  = document.getElementById('cropModal');
const cropTarget = document.getElementById('cropTarget');

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.classList.add('text-slate-500'); });
        btn.classList.add('active'); btn.classList.remove('text-slate-500');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
});

// ─── Style grid ───────────────────────────────────────────────────────────────
const styleGrid = document.getElementById('styleGrid');
STYLES.forEach((style, i) => {
    const btn = document.createElement('button');
    btn.title = style.id.replace(/_/g,' ').substring(3);
    btn.className = `w-full aspect-square rounded-lg border-2 transition-all ${i===0?'border-indigo-500 scale-110 shadow-md z-10':'border-transparent hover:scale-105'}`;
    const c1=`rgb(${style.c1.join(',')})`, c2=`rgb(${style.c2.join(',')})`;
    btn.style.background = style.type==='radial'
        ? `radial-gradient(circle,${c1},${c2})`
        : `linear-gradient(to bottom,${c1},${c2})`;
    btn.addEventListener('click', () => {
        styleGrid.querySelectorAll('button').forEach(b => { b.className='w-full aspect-square rounded-lg border-2 border-transparent hover:scale-105 transition-all'; });
        btn.className='w-full aspect-square rounded-lg border-2 border-indigo-500 scale-110 shadow-md z-10 transition-all';
        currentStyleIndex = i;
        solidBgColor = null;
        document.getElementById('currentStyleName').innerText = style.id.replace(/_/g,' ').substring(3);
        renderCanvas();
    });
    styleGrid.appendChild(btn);
});

// ─── Solid BG ────────────────────────────────────────────────────────────────
document.getElementById('useSolidBgBtn').addEventListener('click', () => {
    solidBgColor = document.getElementById('solidBgColor').value;
    renderCanvas(); showToast('Solid background applied','info');
});
document.getElementById('clearSolidBgBtn').addEventListener('click', () => {
    solidBgColor = null; renderCanvas(); showToast('Back to gradient','info');
});

// ─── Crop aspect buttons ──────────────────────────────────────────────────────
document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (!cropperInstance) return;
        const r = btn.dataset.ratio;
        cropperInstance.setAspectRatio(r === 'free' ? NaN : parseFloat(r));
    });
});

// ─── File upload ──────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('border-indigo-500'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('border-indigo-500'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('border-indigo-500'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

document.getElementById('changeImageBtn').addEventListener('click', () => {
    workspace.classList.remove('flex'); workspace.style.display='none';
    uploadZone.classList.remove('hidden');
    document.getElementById('imageInfoBadge').classList.add('hidden');
    document.getElementById('undoEraserBtn').classList.add('hidden');
    currentSubjectImage = null; eraserBaseImage = null;
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) return showToast('Please upload an image file.','error');
    originalFilename = file.name.replace(/\.[^/.]+$/,'');
    const reader = new FileReader();
    reader.onload = e => {
        cropTarget.src = e.target.result;
        uploadZone.classList.add('hidden');
        cropModal.classList.add('flex');
        // Reset aspect btn highlight
        document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.crop-aspect-btn[data-ratio="free"]').classList.add('active');
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(cropTarget, { viewMode:1, autoCropArea:0.95, background:false });
    };
    reader.readAsDataURL(file);
}

document.getElementById('cancelCropBtn').addEventListener('click', () => {
    cropModal.classList.remove('flex'); uploadZone.classList.remove('hidden');
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance=null; }
});

document.getElementById('confirmCropBtn').addEventListener('click', () => {
    const cropped = cropperInstance.getCroppedCanvas({ maxWidth:4096, maxHeight:4096 });
    const img = new Image();
    img.onload = () => {
        currentSubjectImage = img;
        eraserBaseImage = null;
        document.getElementById('undoEraserBtn').classList.add('hidden');
        cropModal.classList.remove('flex');
        workspace.classList.add('flex'); workspace.style.display='flex';
        document.getElementById('canvasPreset').value = '1080x1920';
        document.getElementById('targetW').value = 1080;
        document.getElementById('targetH').value = 1920;
        document.getElementById('imageInfoBadge').textContent = `${img.width} × ${img.height}px`;
        document.getElementById('imageInfoBadge').classList.remove('hidden');
        renderCanvas();
        showToast('Image loaded!','success');
    };
    img.src = cropped.toDataURL('image/png');
});

// ─── Canvas render ────────────────────────────────────────────────────────────
function renderCanvas() {
    if (!currentSubjectImage) return;
    const W = parseInt(document.getElementById('targetW').value)||1080;
    const H = parseInt(document.getElementById('targetH').value)||1920;
    canvas.width=W; canvas.height=H;
    ctx.clearRect(0,0,W,H);
    ctx.filter='none';

    // Background
    if (solidBgColor) {
        ctx.fillStyle = solidBgColor;
        ctx.fillRect(0,0,W,H);
    } else {
        const s=STYLES[currentStyleIndex];
        const c1=`rgb(${s.c1.join(',')})`, c2=`rgb(${s.c2.join(',')})`;
        let grd;
        if (s.type==='radial') {
            grd = ctx.createRadialGradient(W/2,H/2.5,0, W/2,H/2.5, Math.hypot(W,H)*0.85);
        } else {
            grd = ctx.createLinearGradient(0,0,0,H);
        }
        grd.addColorStop(0,c1); grd.addColorStop(1,c2);
        ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
    }

    // Subject
    const iw=currentSubjectImage.width, ih=currentSubjectImage.height;
    const userScale = (parseInt(document.getElementById('scaleControl').value)||100)/100;
    const fit = Math.min(W/iw, H/ih);
    const nw=iw*fit*userScale, nh=ih*fit*userScale;
    const align = document.getElementById('alignPos').value;
    let x=(W-nw)/2;
    let y = align==='center'?(H-nh)/2 : align==='bottom-center'?H-nh : 0;
    x += parseInt(document.getElementById('offsetX').value)||0;
    y += parseInt(document.getElementById('offsetY').value)||0;

    const br=document.getElementById('brightnessControl').value;
    const co=document.getElementById('contrastControl').value;
    const sa=document.getElementById('saturateControl').value;
    const bl=document.getElementById('blurControl').value;
    ctx.filter=`brightness(${br}%) contrast(${co}%) saturate(${sa}%) blur(${bl}px)`;

    const rot=(parseInt(document.getElementById('rotateSubject').value)||0)*Math.PI/180;
    const shBlur=parseInt(document.getElementById('shadowBlur').value)||0;

    ctx.save();
    ctx.translate(x+nw/2, y+nh/2);
    ctx.rotate(rot);
    ctx.scale(document.getElementById('flipX').checked?-1:1, document.getElementById('flipY').checked?-1:1);
    if (shBlur>0) {
        ctx.shadowBlur=shBlur;
        ctx.shadowColor=document.getElementById('shadowColor').value;
        ctx.shadowOffsetX=parseInt(document.getElementById('shadowOffsetX').value)||0;
        ctx.shadowOffsetY=parseInt(document.getElementById('shadowOffsetY').value)||10;
    }
    ctx.drawImage(currentSubjectImage,-nw/2,-nh/2,nw,nh);
    ctx.restore();
    ctx.filter='none';

    // Text overlay helper
    function drawText(text,size,color,weight,font,alignMode,xPct,yPct,opacity,lspacing,shBlurT,shCol,upper) {
        if (!text) return;
        ctx.save();
        ctx.globalAlpha=Math.max(0,Math.min(1,opacity/100));
        if (shBlurT>0){ctx.shadowBlur=shBlurT;ctx.shadowColor=shCol;ctx.shadowOffsetX=0;ctx.shadowOffsetY=3;}
        ctx.font=`${weight} ${size}px ${font},sans-serif`;
        ctx.fillStyle=color; ctx.textAlign=alignMode; ctx.textBaseline='middle';
        const str = upper?text.toUpperCase():text;
        const tx=(W*xPct)/100, ty=(H*yPct)/100;
        if (lspacing!==0) {
            ctx.textAlign='left';
            const chars=[...str];
            let cx=tx;
            const totalW=chars.reduce((s,c)=>s+ctx.measureText(c).width+lspacing,0);
            if (alignMode==='center') cx=tx-totalW/2;
            else if (alignMode==='right') cx=tx-totalW;
            chars.forEach(ch=>{ctx.fillText(ch,cx,ty);cx+=ctx.measureText(ch).width+lspacing;});
        } else {
            ctx.fillText(str,tx,ty);
        }
        ctx.restore();
    }

    const tx=parseInt(document.getElementById('textPosX').value)||50;
    const ty=parseInt(document.getElementById('textPosY').value)||15;
    const ls=parseInt(document.getElementById('letterSpacing').value)||0;
    drawText(
        document.getElementById('overlayText').value,
        parseInt(document.getElementById('textSize').value)||120,
        document.getElementById('textColor').value,
        document.getElementById('textWeight').value,
        document.getElementById('textFont').value,
        document.getElementById('textAlign').value,
        tx,ty,
        parseInt(document.getElementById('textOpacity').value)||100,
        ls,
        parseInt(document.getElementById('textShadowBlur').value)||0,
        document.getElementById('textShadowColor').value,
        document.getElementById('textUppercase').checked
    );
    drawText(
        document.getElementById('subText').value,
        parseInt(document.getElementById('subTextSize').value)||60,
        document.getElementById('subTextColor').value,
        '400', document.getElementById('textFont').value,
        document.getElementById('textAlign').value,
        tx, Math.min(95,ty+8),
        100,ls,0,'#000',false
    );

    document.getElementById('canvasSizeBadge').textContent=`${W} × ${H}`;
    document.getElementById('exportInfoSize').textContent=`${W} × ${H}`;
    document.getElementById('exportInfoStyle').textContent=solidBgColor?`Solid ${solidBgColor}`:STYLES[currentStyleIndex].id.replace(/_/g,' ').substring(3);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
const inputIds = ['targetW','targetH','offsetX','offsetY','rotateSubject',
    'shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY',
    'overlayText','textFont','textSize','textColor','textAlign','textWeight',
    'textOpacity','subText','subTextSize','subTextColor','textShadowBlur','textShadowColor'];
inputIds.forEach(id => document.getElementById(id).addEventListener('input', renderCanvas));

['alignPos'].forEach(id => document.getElementById(id).addEventListener('change', renderCanvas));
['flipX','flipY','textUppercase'].forEach(id => document.getElementById(id).addEventListener('change', renderCanvas));

document.getElementById('matchImageSizeBtn').addEventListener('click', () => {
    if (!currentSubjectImage) return showToast('No image loaded yet.', 'error');
    document.getElementById('targetW').value = currentSubjectImage.width;
    document.getElementById('targetH').value = currentSubjectImage.height;
    document.getElementById('canvasPreset').value = 'custom';
    renderCanvas();
    showToast(`Canvas set to ${currentSubjectImage.width} × ${currentSubjectImage.height}`, 'success');
});

document.getElementById('canvasPreset').addEventListener('change', e => {
    if (e.target.value!=='custom') {
        const [w,h]=e.target.value.split('x');
        document.getElementById('targetW').value=w;
        document.getElementById('targetH').value=h;
        renderCanvas();
    }
});
document.getElementById('targetW').addEventListener('input',()=>document.getElementById('canvasPreset').value='custom');
document.getElementById('targetH').addEventListener('input',()=>document.getElementById('canvasPreset').value='custom');

function bindSlider(id,valId,suffix='%') {
    const el=document.getElementById(id), val=document.getElementById(valId);
    el.addEventListener('input',()=>{val.innerText=el.value+suffix;renderCanvas();});
}
bindSlider('brightnessControl','brightnessVal');
bindSlider('contrastControl','contrastVal');
bindSlider('saturateControl','saturateVal');
bindSlider('blurControl','blurVal','');
bindSlider('scaleControl','scaleVal');
bindSlider('textPosX','textPosXVal');
bindSlider('textPosY','textPosVal');
bindSlider('letterSpacing','letterSpacingVal','');

// ─── Export ───────────────────────────────────────────────────────────────────
async function compressBlob(src,format,maxKb) {
    const mime=format==='jpeg'?'image/jpeg':`image/${format}`;
    let quality=0.92, scale=1;
    return new Promise(resolve=>{
        const attempt=()=>{
            let c=src;
            if (scale<1){c=document.createElement('canvas');c.width=src.width*scale;c.height=src.height*scale;c.getContext('2d').drawImage(src,0,0,c.width,c.height);}
            c.toBlob(blob=>{
                if (blob.size/1024<=maxKb||format==='png') return resolve(blob);
                if (quality>0.5){quality-=0.05;attempt();}
                else{scale*=0.9;quality=0.92;if(src.width*scale<200)return resolve(blob);attempt();}
            },mime,quality);
        };
        attempt();
    });
}

document.getElementById('exportSingleBtn').addEventListener('click', async()=>{
    const btn=document.getElementById('exportSingleBtn');
    btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
    const fmt=document.getElementById('outFormat').value;
    const blob=await compressBlob(canvas,fmt,parseInt(document.getElementById('maxKb').value)||500);
    downloadBlob(blob,`${originalFilename}_${STYLES[currentStyleIndex].id}.${fmt==='jpeg'?'jpg':fmt}`);
    btn.innerHTML='<i class="fa-solid fa-download mr-2"></i>Export current';
    showToast('Exported!','success');
});

document.getElementById('exportTransparentBtn').addEventListener('click',()=>{
    if (!currentSubjectImage) return;
    const btn=document.getElementById('exportTransparentBtn');
    btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
    // Render subject only on transparent canvas
    const W=parseInt(document.getElementById('targetW').value)||1080;
    const H=parseInt(document.getElementById('targetH').value)||1920;
    const tc=document.createElement('canvas'); tc.width=W; tc.height=H;
    const tctx=tc.getContext('2d');
    const iw=currentSubjectImage.width,ih=currentSubjectImage.height;
    const scale=(parseInt(document.getElementById('scaleControl').value)||100)/100;
    const fit=Math.min(W/iw,H/ih);
    const nw=iw*fit*scale,nh=ih*fit*scale;
    const align=document.getElementById('alignPos').value;
    let x=(W-nw)/2,y=align==='center'?(H-nh)/2:align==='bottom-center'?H-nh:0;
    x+=parseInt(document.getElementById('offsetX').value)||0;
    y+=parseInt(document.getElementById('offsetY').value)||0;
    tctx.save();
    tctx.translate(x+nw/2,y+nh/2);
    tctx.rotate((parseInt(document.getElementById('rotateSubject').value)||0)*Math.PI/180);
    tctx.scale(document.getElementById('flipX').checked?-1:1,document.getElementById('flipY').checked?-1:1);
    tctx.drawImage(currentSubjectImage,-nw/2,-nh/2,nw,nh);
    tctx.restore();
    tc.toBlob(blob=>{
        downloadBlob(blob,`${originalFilename}_transparent.png`);
        btn.innerHTML='<i class="fa-solid fa-chess-board mr-2"></i>Export transparent PNG';
        showToast('Transparent PNG exported!','success');
    },'image/png');
});

document.getElementById('exportAllBtn').addEventListener('click',async()=>{
    const btn=document.getElementById('exportAllBtn');
    btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    btn.disabled=true;
    const fmt=document.getElementById('outFormat').value;
    const maxKb=parseInt(document.getElementById('maxKb').value)||500;
    const ext=fmt==='jpeg'?'jpg':fmt;
    const zip=new JSZip();
    const saved=currentStyleIndex;
    for(let i=0;i<STYLES.length;i++){
        currentStyleIndex=i; solidBgColor=null; renderCanvas();
        const blob=await compressBlob(canvas,fmt,maxKb);
        zip.file(`${STYLES[i].id}/${originalFilename}.${ext}`,blob);
    }
    currentStyleIndex=saved; renderCanvas();
    btn.innerHTML='<i class="fa-solid fa-file-zipper fa-spin"></i> Zipping...';
    const zipBlob=await zip.generateAsync({type:'blob'});
    downloadBlob(zipBlob,`${originalFilename}_21_Styles.zip`);
    btn.innerHTML='<i class="fa-solid fa-layer-group mr-2"></i>Generate all 21 styles';
    btn.disabled=false;
    showToast('All 21 styles exported!','success');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERASER
// ═══════════════════════════════════════════════════════════════════════════════

// ── DOM refs ──────────────────────────────────────────────────────────────────
const eraserModal    = document.getElementById('eraserModal');
const eraserViewport = document.getElementById('eraserViewport');
const eraserCanvasEl = document.getElementById('eraserCanvas');
const eraserOverlay  = document.getElementById('eraserOverlay');  // original preview overlay
const eraserCtx      = eraserCanvasEl.getContext('2d');
const magCanvasEl    = document.getElementById('magCanvas');
const magCtx         = magCanvasEl.getContext('2d');
const eraserCursor   = document.getElementById('eraserCursor');
const eraserMag      = document.getElementById('eraserMagnifier');
const eraserSizeSlider = document.getElementById('eraserSize');
const eraserHardSlider = document.getElementById('eraserHardness');
const eraserOpSlider   = document.getElementById('eraserOpacity');
const undoEraserBtn    = document.getElementById('undoEraserBtn');

// ── Eraser state ──────────────────────────────────────────────────────────────
let eraserWorking  = null;   // canvas — live working copy
let eraserOriginal = null;   // canvas — frozen original (for restore brush & preview)
let eraserHistory  = [];     // array of ImageData for step undo
let eraserRedoStack = [];
let eraserZoom     = 1;
let eraserPanX     = 0, eraserPanY = 0;
let eraserPainting = false;
let eraserPanning  = false;
let eraserSpaceHeld = false;
let eraserPanStart  = {x:0,y:0};
let eraserMode      = 'erase';
let eraserPreviewOn = false;   // toggle show original
let eraserLastX     = null, eraserLastY = null;

// ── Open ──────────────────────────────────────────────────────────────────────
document.getElementById('openEraserBtn').addEventListener('click', openEraser);

function openEraser() {
    if (!currentSubjectImage) return;

    // Snapshot the current image into working & original canvases
    eraserWorking  = snapshotCanvas(currentSubjectImage);
    eraserOriginal = snapshotCanvas(currentSubjectImage);

    eraserHistory   = [];
    eraserRedoStack = [];
    // Save initial base state (index 0); undo will never go past this
    const baseSnap = eraserWorking.getContext('2d').getImageData(0,0,eraserWorking.width,eraserWorking.height);
    eraserHistory.push(baseSnap);

    // Size the display canvas to image
    eraserCanvasEl.width  = eraserWorking.width;
    eraserCanvasEl.height = eraserWorking.height;
    eraserOverlay.width   = eraserWorking.width;
    eraserOverlay.height  = eraserWorking.height;

    eraserModal.style.display = 'flex';
    eraserModal.classList.add('open');

    eraserPreviewOn = false;
    syncPreviewBtn();

    // Small delay so viewport has measured its size
    requestAnimationFrame(() => { fitZoom(); drawWorking(); });
}

// ── Close ─────────────────────────────────────────────────────────────────────
document.getElementById('eraserCancelBtn').addEventListener('click', closeEraser);

function closeEraser() {
    eraserModal.style.display = 'none';
    eraserModal.classList.remove('open');
}

document.getElementById('eraserDoneBtn').addEventListener('click', () => {
    // Commit working canvas → currentSubjectImage
    eraserBaseImage = currentSubjectImage;   // for session-level undo button
    const img = new Image();
    img.onload = () => {
        currentSubjectImage = img;
        renderCanvas();
        undoEraserBtn.classList.remove('hidden');
        showToast('Eraser applied!','success');
    };
    img.src = eraserWorking.toDataURL('image/png');
    closeEraser();
});

// Session-level undo (restore full pre-session image)
undoEraserBtn.addEventListener('click', () => {
    if (!eraserBaseImage) return;
    currentSubjectImage = eraserBaseImage;
    eraserBaseImage = null;
    undoEraserBtn.classList.add('hidden');
    renderCanvas();
    showToast('Erase undone.','info');
});

// ── History (step undo/redo) ──────────────────────────────────────────────────
// Strategy: save a snapshot of the working canvas AFTER each completed stroke.
// The history stack always starts with the initial state (index 0 = open state).
// undoStep restores the previous entry; redoStep re-applies the popped entry.

function saveHistory() {
    const snap = eraserWorking.getContext('2d').getImageData(0,0,eraserWorking.width,eraserWorking.height);
    eraserHistory.push(snap);
    if (eraserHistory.length > 51) eraserHistory.shift(); // keep base + 50 strokes
    eraserRedoStack = [];  // new stroke clears redo future
}

function undoStep() {
    // Need at least 2 entries: base state + at least one stroke to undo
    if (eraserHistory.length < 2) return;
    const current = eraserHistory.pop();       // remove current stroke's result
    eraserRedoStack.push(current);             // save it for redo
    const prev = eraserHistory[eraserHistory.length - 1];  // restore previous
    eraserWorking.getContext('2d').putImageData(prev, 0, 0);
    drawWorking();
}

function redoStep() {
    if (!eraserRedoStack.length) return;
    const next = eraserRedoStack.pop();
    eraserWorking.getContext('2d').putImageData(next, 0, 0);
    eraserHistory.push(next);
    drawWorking();
}

document.getElementById('eraserUndoBtn').addEventListener('click', undoStep);
document.getElementById('eraserRedoBtn').addEventListener('click', redoStep);

// ── Preview toggle ────────────────────────────────────────────────────────────
document.getElementById('eraserPreviewToggle').addEventListener('click', togglePreview);

function togglePreview() {
    eraserPreviewOn = !eraserPreviewOn;
    syncPreviewBtn();
    drawWorking();
}

function syncPreviewBtn() {
    const btn = document.getElementById('eraserPreviewToggle');
    const label = document.getElementById('eraserPreviewLabel');
    if (eraserPreviewOn) {
        btn.classList.add('previewing');
        label.textContent = 'Show Erased';
    } else {
        btn.classList.remove('previewing');
        label.textContent = 'Show Original';
    }
}

// ── Draw working canvas ───────────────────────────────────────────────────────
function drawWorking() {
    if (!eraserWorking) return;
    eraserCtx.clearRect(0,0,eraserCanvasEl.width,eraserCanvasEl.height);
    if (eraserPreviewOn) {
        // Show original on top of checker (eraserCtx already clears — draw original)
        eraserCtx.drawImage(eraserOriginal,0,0);
    } else {
        eraserCtx.drawImage(eraserWorking,0,0);
    }
}

// ── Zoom & pan ────────────────────────────────────────────────────────────────
function applyTransform() {
    const t = `translate(${eraserPanX}px,${eraserPanY}px) scale(${eraserZoom})`;
    eraserCanvasEl.style.transform = t;
    eraserOverlay.style.transform  = t;
    document.getElementById('eraserZoomVal').textContent = Math.round(eraserZoom*100)+'%';
}

function fitZoom() {
    const vw = eraserViewport.clientWidth  || window.innerWidth;
    const vh = eraserViewport.clientHeight || (window.innerHeight - 120);
    eraserZoom = Math.min((vw-40)/eraserWorking.width, (vh-40)/eraserWorking.height, 2);
    centerPan();
}

function centerPan() {
    const vw = eraserViewport.clientWidth  || window.innerWidth;
    const vh = eraserViewport.clientHeight || (window.innerHeight - 120);
    eraserPanX = (vw - eraserWorking.width  * eraserZoom) / 2;
    eraserPanY = (vh - eraserWorking.height * eraserZoom) / 2;
    applyTransform();
}

document.getElementById('eraserZoomIn').addEventListener('click',  () => { eraserZoom=Math.min(20,eraserZoom*1.25); centerPan(); });
document.getElementById('eraserZoomOut').addEventListener('click', () => { eraserZoom=Math.max(0.05,eraserZoom/1.25); centerPan(); });
document.getElementById('eraserZoomFit').addEventListener('click', () => { fitZoom(); applyTransform(); });

// Scroll to zoom anchored to cursor
eraserViewport.addEventListener('wheel', e => {
    e.preventDefault();
    const r=eraserViewport.getBoundingClientRect();
    const vx=e.clientX-r.left, vy=e.clientY-r.top;
    const img=vpToImg(vx,vy);
    eraserZoom=Math.max(0.05,Math.min(20,eraserZoom*(e.deltaY<0?1.1:0.9)));
    eraserPanX=vx-img.x*eraserZoom;
    eraserPanY=vy-img.y*eraserZoom;
    applyTransform();
},{passive:false});

function vpToImg(vx,vy) {
    return { x:(vx-eraserPanX)/eraserZoom, y:(vy-eraserPanY)/eraserZoom };
}

// ── Pointer events ────────────────────────────────────────────────────────────
eraserViewport.addEventListener('pointerdown', e => {
    if (eraserSpaceHeld) {
        eraserPanning=true;
        eraserPanStart={x:e.clientX-eraserPanX, y:e.clientY-eraserPanY};
        eraserViewport.style.cursor='grabbing'; return;
    }
    eraserPainting=true; eraserLastX=null; eraserLastY=null;
    const r=eraserViewport.getBoundingClientRect();
    const img=vpToImg(e.clientX-r.left,e.clientY-r.top);
    paint(img.x,img.y);
    eraserViewport.setPointerCapture(e.pointerId);
});

eraserViewport.addEventListener('pointermove', e => {
    const r=eraserViewport.getBoundingClientRect();
    const vx=e.clientX-r.left, vy=e.clientY-r.top;
    updateCursor(vx,vy);
    updateMagnifier(vx,vy);
    eraserMag.style.display='block';

    if (eraserPanning) {
        eraserPanX=e.clientX-eraserPanStart.x;
        eraserPanY=e.clientY-eraserPanStart.y;
        applyTransform(); return;
    }
    if (!eraserPainting) return;
    const img=vpToImg(vx,vy);
    paint(img.x,img.y);
});

eraserViewport.addEventListener('pointerup', () => {
    if (eraserPainting) {
        // Stroke just finished — save a snapshot so undo can revert this one stroke
        saveHistory();
    }
    eraserPainting=false; eraserPanning=false;
    eraserLastX=null; eraserLastY=null;
    eraserViewport.style.cursor='none';
});
eraserViewport.addEventListener('mouseleave', () => {
    eraserCursor.style.display='none'; eraserMag.style.display='none';
});

// ── Keyboard ──────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
    if (eraserModal.style.display==='none') return;
    if (e.code==='Space')  { eraserSpaceHeld=true; eraserViewport.style.cursor='grab'; e.preventDefault(); }
    if (e.key==='e'||e.key==='E') setMode('erase');
    if (e.key==='r'||e.key==='R') setMode('restore');
    if (e.key==='v'||e.key==='V') togglePreview();
    if (e.key==='[') { eraserSizeSlider.value=Math.max(2,+eraserSizeSlider.value-4); syncSizeLabel(); }
    if (e.key===']') { eraserSizeSlider.value=Math.min(150,+eraserSizeSlider.value+4); syncSizeLabel(); }
    if ((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='z') { e.preventDefault(); undoStep(); }
    if ((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))) { e.preventDefault(); redoStep(); }
});
window.addEventListener('keyup', e => {
    if (e.code==='Space') { eraserSpaceHeld=false; eraserViewport.style.cursor='none'; }
});

// ── Mode ──────────────────────────────────────────────────────────────────────
document.getElementById('eraserModeErase').addEventListener('click',   ()=>setMode('erase'));
document.getElementById('eraserModeRestore').addEventListener('click', ()=>setMode('restore'));

function setMode(m) {
    eraserMode=m;
    const eBtn=document.getElementById('eraserModeErase');
    const rBtn=document.getElementById('eraserModeRestore');
    eBtn.classList.toggle('active',m==='erase');
    rBtn.classList.toggle('active',m==='restore');
    rBtn.classList.toggle('restore-active',m==='restore');
    eraserCursor.classList.toggle('restore-mode',m==='restore');
}

// ── Sliders ───────────────────────────────────────────────────────────────────
function syncSizeLabel() { document.getElementById('eraserSizeVal').textContent=eraserSizeSlider.value; }
eraserSizeSlider.addEventListener('input', syncSizeLabel);
eraserOpSlider.addEventListener('input', ()=>document.getElementById('eraserOpacityVal').textContent=eraserOpSlider.value);

// ── Cursor ring ───────────────────────────────────────────────────────────────
function updateCursor(vx,vy) {
    const sz = +eraserSizeSlider.value * eraserZoom;
    Object.assign(eraserCursor.style,{width:sz+'px',height:sz+'px',left:vx+'px',top:vy+'px',display:'block'});
}

// ── Magnifier ─────────────────────────────────────────────────────────────────
function updateMagnifier(vx,vy) {
    const img=vpToImg(vx,vy);
    const MAG=4, mw=magCanvasEl.width, mh=magCanvasEl.height;
    const srcW=mw/MAG, srcH=mh/MAG;
    const sx=img.x-srcW/2, sy=img.y-srcH/2;

    // Checker background
    for (let ty=0;ty<mh;ty+=8)
        for (let tx=0;tx<mw;tx+=8){
            magCtx.fillStyle=((tx+ty)/8)%2===0?'#bbb':'#fff';
            magCtx.fillRect(tx,ty,8,8);
        }
    magCtx.imageSmoothingEnabled=false;
    // Draw from working (or original if previewing)
    magCtx.drawImage(eraserPreviewOn?eraserOriginal:eraserWorking, sx,sy,srcW,srcH, 0,0,mw,mh);

    // Position mag: top-right, flip to top-left if cursor is near
    const vpW=eraserViewport.clientWidth;
    let mx = vpW-220, my=10;
    if (vx>vpW-240 && vy<230) { mx=10; }
    eraserMag.style.left=mx+'px'; eraserMag.style.top=my+'px';
}

// ── Paint stroke ──────────────────────────────────────────────────────────────
function paint(imgX, imgY) {
    if (eraserPreviewOn) return; // don't paint while previewing original

    const size     = +eraserSizeSlider.value;
    const hardness = +eraserHardSlider.value / 100;
    const opacity  = +eraserOpSlider.value   / 100;
    const r        = size / 2;
    const wctx     = eraserWorking.getContext('2d');

    // Interpolate along stroke
    const steps = eraserLastX!==null
        ? Math.max(1, Math.ceil(Math.hypot(imgX-eraserLastX, imgY-eraserLastY) / Math.max(1,r*0.3)))
        : 1;

    for (let s=0; s<steps; s++) {
        const t  = steps===1 ? 1 : (s+1)/steps;
        const cx = eraserLastX!==null ? eraserLastX+(imgX-eraserLastX)*t : imgX;
        const cy = eraserLastY!==null ? eraserLastY+(imgY-eraserLastY)*t : imgY;

        if (eraserMode==='erase') {
            const grd=wctx.createRadialGradient(cx,cy,r*(1-hardness)*0.6,cx,cy,r);
            grd.addColorStop(0,`rgba(0,0,0,${opacity})`);
            grd.addColorStop(1,'rgba(0,0,0,0)');
            wctx.globalCompositeOperation='destination-out';
            wctx.fillStyle=grd;
            wctx.beginPath(); wctx.arc(cx,cy,r,0,Math.PI*2); wctx.fill();
        } else {
            // Restore: stamp original pixels clipped to soft brush shape
            const d=Math.ceil(r*2)+4;
            const bx=Math.round(cx-r)-2, by=Math.round(cy-r)-2;
            const tmp=document.createElement('canvas'); tmp.width=d; tmp.height=d;
            const tc=tmp.getContext('2d');
            tc.drawImage(eraserOriginal, bx,by,d,d, 0,0,d,d);
            const grd=tc.createRadialGradient(r+2,r+2,r*(1-hardness)*0.6,r+2,r+2,r);
            grd.addColorStop(0,`rgba(0,0,0,${opacity})`);
            grd.addColorStop(1,'rgba(0,0,0,0)');
            tc.globalCompositeOperation='destination-in';
            tc.fillStyle=grd;
            tc.beginPath(); tc.arc(r+2,r+2,r,0,Math.PI*2); tc.fill();
            wctx.globalCompositeOperation='source-over';
            wctx.drawImage(tmp,bx,by);
        }
    }
    wctx.globalCompositeOperation='source-over';
    eraserLastX=imgX; eraserLastY=imgY;
    drawWorking();
    updateMagnifier(...(() => {
        // recalculate viewport position from image coords
        const vx=imgX*eraserZoom+eraserPanX, vy=imgY*eraserZoom+eraserPanY;
        return [vx,vy];
    })());
}

}); // end DOMContentLoaded
