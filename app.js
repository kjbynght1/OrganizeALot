/* OrganizeALot Residential Inspection Assistant - Phone PWA v1.8 */
const DB_NAME = 'organizealot_inspection_assistant_v1';
const DB_VERSION = 1;
const STORE_INSPECTIONS = 'inspections';
const STORE_PHOTOS = 'photos';

const CATEGORIES = [
  { id: 'job_id', label: 'Job / ID' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'roof', label: 'Roof' },
  { id: 'interior', label: 'Interior' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'detached', label: 'Detached / Other' },
  { id: 'other', label: 'Extra Photos' }
];

const CHECKLIST = {
  job_id: [
    'Inspection ID / job screen',
    'Address numbers / house number',
    'Mailbox or address marker if house number is unclear'
  ],
  exterior: [
    'Front elevation',
    'Left elevation',
    'Right elevation',
    'Rear elevation',
    'Street view showing property',
    'Driveway / parking area',
    'Front entry / porch',
    'Rear entry / deck / patio',
    'Foundation visible front',
    'Foundation visible rear',
    'Siding / exterior wall condition',
    'Windows / doors overview'
  ],
  roof: [
    'Roof front slope from ground',
    'Roof rear slope from ground',
    'Roof left slope / side view',
    'Roof right slope / side view',
    'Roof close-up if safe from ground',
    'Gutters and downspouts',
    'Chimney / flue if present',
    'Roof damage or wear if present',
    'Trees touching or overhanging roof'
  ],
  interior: [
    'Kitchen',
    'Bathroom 1',
    'Bathroom 2 / additional bathroom',
    'Laundry area',
    'Basement overview or crawl access',
    'Attic access if visible',
    'Interior ceiling / wall condition issue',
    'No bedrooms unless specifically required'
  ],
  utilities: [
    'Electrical panel closed',
    'Electrical panel open / breakers',
    'Electrical panel label / amperage if visible',
    'Furnace / air handler',
    'Central AC condenser outside',
    'Water heater',
    'Main water shutoff / plumbing visible',
    'Fuel tank / gas meter if present'
  ],
  hazards: [
    'Steps / stairs / handrails',
    'Walkway or trip hazard',
    'Pool / hot tub if present',
    'Trampoline / playground if present',
    'Dog / animal hazard if present',
    'Debris / fire hazard',
    'Outbuilding hazard or poor condition',
    'No access / locked gate / obstruction'
  ],
  detached: [
    'Detached garage front if present',
    'Detached garage side/rear if present',
    'Shed / barn / outbuilding if present',
    'Fence / gate if important',
    'Special condition requested by carrier'
  ],
  other: [
    'Extra photo',
    'Special instruction photo',
    'Follow-up needed'
  ]
};

let db;
let currentInspection = null;
let currentPhotos = [];
let selectedPhotoCategory = 'other';
let selectedChecklistItem = '';
let deferredInstallPrompt = null;

let sketchCanvas = null;
let sketchCtx = null;
let sketchDrawing = false;
let sketchTool = 'pen';
let sketchLastPoint = null;
let sketchHistory = [];
let sketchInitialized = false;

const $ = (id) => document.getElementById(id);

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function nowIso() { return new Date().toISOString(); }

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function safeFolderName(text, fallback = 'Untitled') {
  return (text || fallback)
    .toString()
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || fallback;
}

function compactDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_INSPECTIONS)) {
        database.createObjectStore(STORE_INSPECTIONS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_PHOTOS)) {
        const store = database.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
        store.createIndex('inspectionId', 'inspectionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

function get(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deleteKey(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function photosForInspection(inspectionId) {
  return new Promise((resolve, reject) => {
    const store = tx(STORE_PHOTOS);
    const index = store.index('inspectionId');
    const req = index.getAll(inspectionId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function saveSettings() {
  const settings = {
    defaultCompany: $('defaultCompany').value.trim(),
    autoLocation: $('autoLocation').checked,
    useExifFirst: $('useExifFirst').checked,
    autoEnhancePhotos: $('autoEnhancePhotos').checked,
    qualityCheckPhotos: $('qualityCheckPhotos').checked,
    enhanceStrength: $('enhanceStrength').value
  };
  localStorage.setItem('organizealot_settings_v1', JSON.stringify(settings));
  $('settingsStatus').textContent = 'Settings saved.';
  toast('Settings saved');
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem('organizealot_settings_v1') || '{}');
    $('defaultCompany').value = settings.defaultCompany || '';
    $('autoLocation').checked = settings.autoLocation !== false;
    $('useExifFirst').checked = settings.useExifFirst !== false;
    if ($('autoEnhancePhotos')) $('autoEnhancePhotos').checked = settings.autoEnhancePhotos !== false;
    if ($('qualityCheckPhotos')) $('qualityCheckPhotos').checked = settings.qualityCheckPhotos !== false;
    if ($('enhanceStrength')) $('enhanceStrength').value = settings.enhanceStrength || 'medium';
  } catch {}
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('organizealot_settings_v1') || '{}');
  } catch {
    return {};
  }
}

function newInspection() {
  const settings = getSettings();
  currentInspection = {
    id: uuid(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    company: settings.defaultCompany || '',
    workflow: 'Residential',
    inspectionId: '',
    insuredName: '',
    address: '',
    city: '',
    state: 'OH',
    zip: '',
    yearBuilt: '',
    roofAge: '',
    hvacAge: '',
    electric: '',
    notes: '',
    sketchNotes: '',
    sketchDataUrl: '',
    sketchMeasurements: [],
    checklist: {}
  };
  currentPhotos = [];
  fillForm();
  renderCategoryButtons();
  renderChecklist();
  renderPhotos();
  if (sketchInitialized) loadSketchForCurrentInspection();
  toast('New inspection started');
}

function readForm() {
  if (!currentInspection) newInspection();
  const fields = ['company','workflow','inspectionId','insuredName','address','city','state','zip','yearBuilt','roofAge','hvacAge','electric','notes'];
  for (const f of fields) currentInspection[f] = $(f).value.trim();
  if ($('sketchNotes')) currentInspection.sketchNotes = $('sketchNotes').value.trim();
  currentInspection.updatedAt = nowIso();
  return currentInspection;
}

function fillForm() {
  const i = currentInspection || {};
  const fields = ['company','workflow','inspectionId','insuredName','address','city','state','zip','yearBuilt','roofAge','hvacAge','electric','notes'];
  for (const f of fields) $(f).value = i[f] || (f === 'state' ? 'OH' : '');
}

async function saveInspection() {
  const inspection = readForm();
  await put(STORE_INSPECTIONS, inspection);
  localStorage.setItem('organizealot_current_inspection_id', inspection.id);
  toast('Inspection saved');
  await renderSavedList();
}

async function loadInspection(id) {
  const inspection = await get(STORE_INSPECTIONS, id);
  if (!inspection) return toast('Inspection not found');
  currentInspection = inspection;
  currentPhotos = await photosForInspection(id);
  localStorage.setItem('organizealot_current_inspection_id', id);
  fillForm();
  renderCategoryButtons();
  renderChecklist();
  renderPhotos();
  if (sketchInitialized) loadSketchForCurrentInspection();
  switchTab('details');
  toast('Inspection loaded');
}

async function loadLastInspection() {
  const id = localStorage.getItem('organizealot_current_inspection_id');
  if (id) {
    const inspection = await get(STORE_INSPECTIONS, id);
    if (inspection) {
      currentInspection = inspection;
      currentPhotos = await photosForInspection(id);
      fillForm();
      renderChecklist();
      renderPhotos();
      return;
    }
  }
  newInspection();
}

async function deleteCurrentInspection() {
  if (!currentInspection) return;
  if (!confirm('Delete the current inspection and its stored photos from this device?')) return;
  const id = currentInspection.id;
  const photos = await photosForInspection(id);
  for (const p of photos) await deleteKey(STORE_PHOTOS, p.id);
  await deleteKey(STORE_INSPECTIONS, id);
  localStorage.removeItem('organizealot_current_inspection_id');
  newInspection();
  await renderSavedList();
  toast('Current inspection deleted');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === tabId));
  if (tabId === 'saved') renderSavedList();
  if (tabId === 'sketch') loadSketchForCurrentInspection();
}

function photoCountForCategory(categoryId) {
  return currentPhotos.filter(p => p.category === categoryId).length;
}

function photoCountForChecklistItem(categoryId, itemLabel) {
  return currentPhotos.filter(p => p.category === categoryId && p.itemLabel === itemLabel).length;
}

function renderCategoryButtons() {
  const wrap = $('categoryButtons');
  wrap.innerHTML = '';
  for (const cat of CATEGORIES) {
    const count = photoCountForCategory(cat.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    if (count > 0) btn.classList.add('has-photo');
    btn.innerHTML = count > 0
      ? `<strong>${cat.label}</strong><br><span class="small">Photo added</span><br><span class="photo-count-badge">${count}</span>`
      : `<strong>${cat.label}</strong><br><span class="small">Add photo</span>`;
    btn.addEventListener('click', () => {
      selectedPhotoCategory = cat.id;
      selectedChecklistItem = '';
      $('photoInput').click();
    });
    wrap.appendChild(btn);
  }
}


function requiredPhotoItems() {
  const out = [];
  for (const cat of CATEGORIES) {
    const items = CHECKLIST[cat.id] || [];
    for (const item of items) out.push({ categoryId: cat.id, item });
  }
  return out;
}

function requiredPhotoProgress() {
  const items = requiredPhotoItems();
  const done = items.filter(x => photoCountForChecklistItem(x.categoryId, x.item) > 0).length;
  return { done, total: items.length };
}

function renderRequiredPhotoProgress() {
  const el = $('requiredPhotoProgress');
  if (!el) return;
  const p = requiredPhotoProgress();
  el.textContent = `Required photos: ${p.done} / ${p.total} done`;
  el.classList.toggle('complete', p.total > 0 && p.done === p.total);
  el.classList.toggle('warning-progress', p.done > 0 && p.done < p.total);
}

function renderChecklist() {
  const wrap = $('checklist');
  wrap.innerHTML = '';
  if (!currentInspection) return;
  for (const cat of CATEGORIES) {
    const div = document.createElement('div');
    div.className = 'check-category';
    div.innerHTML = `<h3>${cat.label}</h3>`;
    const items = CHECKLIST[cat.id] || [];
    for (const item of items) {
      const key = `${cat.id}:${item}`;
      const row = document.createElement('div');
      row.className = 'check-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!currentInspection.checklist[key];
      cb.addEventListener('change', async () => {
        currentInspection.checklist[key] = cb.checked;
        await saveInspection();
      });
      const span = document.createElement('span');
      span.textContent = item;
      const photoBtn = document.createElement('button');
      photoBtn.type = 'button';
      const itemPhotoCount = photoCountForChecklistItem(cat.id, item);
      if (itemPhotoCount > 0) {
        row.classList.add('has-photo');
        photoBtn.classList.add('has-photo');
        photoBtn.textContent = `✓ ${itemPhotoCount}`;
      } else {
        photoBtn.textContent = '+ Photo';
      }
      photoBtn.addEventListener('click', () => {
        selectedPhotoCategory = cat.id;
        selectedChecklistItem = item;
        $('photoNote').value = item;
        $('photoInput').click();
      });
      row.append(cb, span, photoBtn);
      div.appendChild(row);
    }
    wrap.appendChild(div);
  }
  renderRequiredPhotoProgress();
}

async function getCurrentLocationMaybe() {
  const settings = getSettings();
  if (settings.autoLocation === false || !navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        source: 'phone_gps',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        capturedAt: nowIso()
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  });
}

function getAscii(view, offset, length) {
  let s = '';
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

async function extractExif(file) {
  const result = { gps: null, dateTaken: null, orientation: 1 };
  try {
    const buf = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return result;
    let offset = 2;
    while (offset < view.byteLength - 4) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const len = view.getUint16(offset + 2, false);
      if (marker === 0xe1 && getAscii(view, offset + 4, 6) === 'Exif') {
        return parseExifSegment(view, offset + 10, len - 8);
      }
      offset += 2 + len;
    }
  } catch {}
  return result;
}

function parseExifSegment(view, tiff, length) {
  const result = { gps: null, dateTaken: null, orientation: 1 };
  const endian = getAscii(view, tiff, 2);
  const little = endian === 'II';
  if (!little && endian !== 'MM') return result;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const ifd0 = tiff + u32(tiff + 4);

  function readValue(entryOffset) {
    const type = u16(entryOffset + 2);
    const count = u32(entryOffset + 4);
    const valueOffsetRaw = entryOffset + 8;
    const typeSize = {1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8}[type] || 1;
    const valueOffset = count * typeSize <= 4 ? valueOffsetRaw : tiff + u32(valueOffsetRaw);
    if (type === 2) return getAscii(view, valueOffset, count);
    if (type === 3 && count === 1) return u16(valueOffset);
    if (type === 4 && count === 1) return u32(valueOffset);
    if (type === 5) {
      const vals = [];
      for (let i = 0; i < count; i++) {
        const n = u32(valueOffset + i * 8);
        const d = u32(valueOffset + i * 8 + 4) || 1;
        vals.push(n / d);
      }
      return vals;
    }
    return null;
  }

  function entries(ifdOffset) {
    const out = new Map();
    const count = u16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const e = ifdOffset + 2 + i * 12;
      out.set(u16(e), readValue(e));
    }
    return out;
  }

  try {
    const ifd0Entries = entries(ifd0);
    result.orientation = Number(ifd0Entries.get(0x0112) || 1) || 1;
    const exifPtr = ifd0Entries.get(0x8769);
    const gpsPtr = ifd0Entries.get(0x8825);
    if (exifPtr) {
      const exifEntries = entries(tiff + exifPtr);
      result.dateTaken = exifEntries.get(0x9003) || exifEntries.get(0x9004) || null;
      if (result.dateTaken) result.dateTaken = String(result.dateTaken).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    }
    if (gpsPtr) {
      const gpsEntries = entries(tiff + gpsPtr);
      const latRef = gpsEntries.get(1);
      const lat = gpsEntries.get(2);
      const lngRef = gpsEntries.get(3);
      const lng = gpsEntries.get(4);
      if (Array.isArray(lat) && Array.isArray(lng)) {
        let latDec = lat[0] + lat[1]/60 + lat[2]/3600;
        let lngDec = lng[0] + lng[1]/60 + lng[2]/3600;
        if (String(latRef).trim().toUpperCase() === 'S') latDec *= -1;
        if (String(lngRef).trim().toUpperCase() === 'W') lngDec *= -1;
        result.gps = { source: 'exif', lat: latDec, lng: lngDec, accuracy: null, capturedAt: nowIso() };
      }
    }
  } catch {}
  return result;
}


async function normalizeImageOrientation(file, orientation = 1) {
  orientation = Number(orientation || 1);

  // No rotation needed. Keep original file so quality and metadata stay as intact as possible.
  if (orientation === 1 || !file.type.startsWith('image/')) {
    return { blob: file, changed: false, orientation };
  }

  let bitmap = null;
  try {
    // imageOrientation:none tells supporting browsers to give us the raw pixels.
    bitmap = await createImageBitmap(file, { imageOrientation: 'none' });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return { blob: file, changed: false, orientation };
    }
  }

  const swap = [5, 6, 7, 8].includes(orientation);
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;

  const ctx = canvas.getContext('2d');

  switch (orientation) {
    case 2: // flip horizontal
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // rotate 180
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 4: // flip vertical
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      break;
    case 5: // transpose
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // rotate 90 clockwise
      ctx.translate(canvas.width, 0);
      ctx.rotate(0.5 * Math.PI);
      break;
    case 7: // transverse
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(-1, 1);
      break;
    case 8: // rotate 90 counterclockwise
      ctx.translate(0, canvas.height);
      ctx.rotate(-0.5 * Math.PI);
      break;
    default:
      break;
  }

  ctx.drawImage(bitmap, 0, 0);

  const normalizedBlob = await new Promise(resolve => {
    canvas.toBlob(
      blob => resolve(blob || file),
      file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      0.92
    );
  });

  if (bitmap.close) bitmap.close();

  return {
    blob: normalizedBlob,
    changed: normalizedBlob !== file,
    orientation
  };
}


async function autoAdjustInspectionPhoto(blob, strength = 'medium') {
  if (!blob || !blob.type || !blob.type.startsWith('image/')) {
    return { blob, changed: false, note: 'Not an image' };
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { blob, changed: false, note: 'Adjustment skipped' };
  }

  const maxSide = 2400;
  let width = bitmap.width;
  let height = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let sum = 0, count = 0, brightPixels = 0, darkPixels = 0;
  const sampleStep = 12;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    count++;
    if (luma > 218) brightPixels++;
    if (luma < 75) darkPixels++;
  }

  const avg = count ? sum / count : 128;
  const brightRatio = count ? brightPixels / count : 0;
  const darkRatio = count ? darkPixels / count : 0;

  const presets = {
    light:  { baseLift: 10, shadowLift: 28, contrast: 1.035, saturation: 1.025 },
    medium: { baseLift: 16, shadowLift: 42, contrast: 1.055, saturation: 1.040 },
    strong: { baseLift: 22, shadowLift: 58, contrast: 1.070, saturation: 1.055 }
  };
  const p = presets[strength] || presets.medium;

  const darkBoost = avg < 90 ? 1.22 : avg < 120 ? 1.10 : 1.0;
  const brightProtect = avg > 150 ? 0.65 : avg > 135 ? 0.82 : 1.0;
  const skyProtect = brightRatio > 0.18 ? 0.72 : brightRatio > 0.10 ? 0.86 : 1.0;
  const clamp = v => Math.max(0, Math.min(255, v));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const colorSpread = maxc - minc;

    // Roof/shingle/stone protection: neutral gray/brown surfaces get a lighter touch.
    const likelyRoofOrNeutralSurface = luma > 45 && luma < 190 && colorSpread < 42;

    const shadowFactor = Math.max(0, Math.min(1, (165 - luma) / 165));
    const highlightProtect = Math.max(0, Math.min(1, (238 - luma) / 85));

    let lift = (p.baseLift + p.shadowLift * shadowFactor) * darkBoost * brightProtect * skyProtect * highlightProtect;

    // Prevent shingles from washing out or getting that fake/distorted look.
    if (likelyRoofOrNeutralSurface) lift *= 0.48;

    r += lift; g += lift; b += lift;

    const contrast = likelyRoofOrNeutralSurface ? 1.018 : p.contrast;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = likelyRoofOrNeutralSurface ? 1.0 : p.saturation;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imgData, 0, 0);

  const outBlob = await new Promise(resolve => {
    canvas.toBlob(
      blobOut => resolve(blobOut || blob),
      blob.type === 'image/png' ? 'image/png' : 'image/jpeg',
      0.92
    );
  });

  if (bitmap.close) bitmap.close();

  const note = `Auto adjusted ${strength}; avg ${Math.round(avg)}; bright protect ${Math.round(brightRatio * 100)}%; dark ${Math.round(darkRatio * 100)}%`;
  return { blob: outBlob, changed: outBlob !== blob, note };
}


async function analyzeInspectionPhotoQuality(blob) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { ok: true, severity: 0, issues: [], metrics: {}, note: 'Quality check skipped' };
  }

  const maxSide = 900;
  let width = bitmap.width;
  let height = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  let sum = 0, count = 0;
  let dark = 0, bright = 0, blown = 0;
  let neutralRoofLike = 0, roofTooBright = 0;
  const lumas = new Float32Array(width * height);

  for (let y = 0, idx = 0; y < height; y++) {
    for (let x = 0; x < width; x++, idx++) {
      const i = idx * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas[idx] = l;
      sum += l;
      count++;
      if (l < 55) dark++;
      if (l > 218) bright++;
      if (l > 242) blown++;

      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const roofLike = l > 60 && l < 220 && spread < 45;
      if (roofLike) {
        neutralRoofLike++;
        if (l > 178) roofTooBright++;
      }
    }
  }

  const avg = sum / Math.max(1, count);
  const darkRatio = dark / Math.max(1, count);
  const brightRatio = bright / Math.max(1, count);
  const blownRatio = blown / Math.max(1, count);
  const roofBrightRatio = neutralRoofLike ? roofTooBright / neutralRoofLike : 0;

  // Simple blur/detail estimate using luma difference between neighboring pixels.
  let edgeSum = 0, edgeCount = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const gx = Math.abs(lumas[idx + 1] - lumas[idx - 1]);
      const gy = Math.abs(lumas[idx + width] - lumas[idx - width]);
      edgeSum += gx + gy;
      edgeCount++;
    }
  }
  const sharpness = edgeSum / Math.max(1, edgeCount);

  const issues = [];
  let severity = 0;

  if (avg < 82 || darkRatio > 0.48) {
    issues.push('Too dark / heavy shade');
    severity = Math.max(severity, 2);
  } else if (avg < 105 || darkRatio > 0.34) {
    issues.push('A little dark');
    severity = Math.max(severity, 1);
  }

  if (blownRatio > 0.10 || brightRatio > 0.34) {
    issues.push('Too bright / highlights may be blown out');
    severity = Math.max(severity, 2);
  } else if (brightRatio > 0.22) {
    issues.push('Bright areas detected');
    severity = Math.max(severity, 1);
  }

  if (roofBrightRatio > 0.28) {
    issues.push('Roof/shingle detail may be washed out');
    severity = Math.max(severity, 2);
  } else if (roofBrightRatio > 0.16) {
    issues.push('Roof/shingle detail may need protection');
    severity = Math.max(severity, 1);
  }

  if (sharpness < 8.5) {
    issues.push('Possibly blurry / low detail');
    severity = Math.max(severity, 2);
  } else if (sharpness < 12) {
    issues.push('Slightly soft focus');
    severity = Math.max(severity, 1);
  }

  if (bitmap.close) bitmap.close();

  return {
    ok: severity === 0,
    severity,
    issues,
    metrics: {
      avg: Math.round(avg),
      dark: Math.round(darkRatio * 100),
      bright: Math.round(brightRatio * 100),
      blown: Math.round(blownRatio * 100),
      roofBright: Math.round(roofBrightRatio * 100),
      sharpness: Math.round(sharpness * 10) / 10
    }
  };
}

function showQualityReview(blob, analysis) {
  return new Promise(resolve => {
    const modal = $('qualityModal');
    const preview = $('qualityPreview');
    const message = $('qualityMessage');
    const issuesBox = $('qualityIssues');
    const saveBtn = $('qualitySaveBtn');
    const retakeBtn = $('qualityRetakeBtn');
    const fixBtn = $('qualityFixBtn');

    const previewUrl = URL.createObjectURL(blob);
    preview.src = previewUrl;

    message.textContent = analysis.severity >= 2
      ? 'This photo may not be good enough for inspection records. Choose what to do.'
      : 'This photo has a minor issue. Choose what to do.';

    const issueLines = analysis.issues.length ? analysis.issues.map(x => '• ' + x).join('\n') : 'No major issues found.';
    const m = analysis.metrics || {};
    issuesBox.textContent =
      `${issueLines}\n\n` +
      `Brightness: ${m.avg ?? '-'} | Dark: ${m.dark ?? '-'}% | Bright: ${m.bright ?? '-'}% | Blown: ${m.blown ?? '-'}%\n` +
      `Roof bright risk: ${m.roofBright ?? '-'}% | Sharpness: ${m.sharpness ?? '-'}`;

    issuesBox.classList.toggle('bad', analysis.severity === 1);
    issuesBox.classList.toggle('very-bad', analysis.severity >= 2);

    modal.classList.remove('hidden');

    const cleanup = (choice) => {
      modal.classList.add('hidden');
      preview.src = '';
      URL.revokeObjectURL(previewUrl);
      saveBtn.onclick = null;
      retakeBtn.onclick = null;
      fixBtn.onclick = null;
      resolve(choice);
    };

    saveBtn.onclick = () => cleanup('save');
    retakeBtn.onclick = () => cleanup('retake');
    fixBtn.onclick = () => cleanup('fix');
  });
}

async function handlePhotos(files) {
  if (!currentInspection) newInspection();
  await saveInspection();

  const note = $('photoNote').value.trim() || selectedChecklistItem || selectedPhotoCategory;
  const location = await getCurrentLocationMaybe();
  const settings = getSettings();
  let added = 0;
  let skippedForRetake = 0;

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const exif = settings.useExifFirst === false ? { gps: null, dateTaken: null, orientation: 1 } : await extractExif(file);
    const normalized = await normalizeImageOrientation(file, exif.orientation || 1);
    let storedBlob = normalized.blob || file;

    let quality = { ok: true, severity: 0, issues: [], metrics: {} };
    let qualityChoice = 'auto-save';
    let adjustment = { blob: storedBlob, changed: false, note: 'Auto adjustment not needed' };

    if (settings.qualityCheckPhotos !== false) {
      quality = await analyzeInspectionPhotoQuality(storedBlob);
      if (!quality.ok) {
        qualityChoice = await showQualityReview(storedBlob, quality);
      }
    }

    if (qualityChoice === 'retake') {
      skippedForRetake++;
      continue;
    }

    if (qualityChoice === 'fix') {
      adjustment = await autoAdjustInspectionPhoto(storedBlob, settings.enhanceStrength || 'medium');
      storedBlob = adjustment.blob || storedBlob;
    } else if (settings.qualityCheckPhotos === false && settings.autoEnhancePhotos !== false) {
      adjustment = await autoAdjustInspectionPhoto(storedBlob, settings.enhanceStrength || 'medium');
      storedBlob = adjustment.blob || storedBlob;
    }

    const takenAt = exif.dateTaken ? new Date(exif.dateTaken.replace(' ', 'T')).toISOString() : new Date(file.lastModified || Date.now()).toISOString();
    const photo = {
      id: uuid(),
      inspectionId: currentInspection.id,
      category: selectedPhotoCategory,
      itemLabel: note,
      originalName: file.name || 'photo.jpg',
      mime: storedBlob.type || file.type || 'image/jpeg',
      size: storedBlob.size || file.size,
      takenAt,
      storedAt: nowIso(),
      geo: exif.gps || location || null,
      orientation: exif.orientation || 1,
      orientationFixed: !!normalized.changed,
      qualityChecked: settings.qualityCheckPhotos !== false,
      qualityChoice,
      qualityIssues: quality.issues || [],
      qualityMetrics: quality.metrics || {},
      autoAdjusted: !!adjustment.changed,
      adjustmentNote: adjustment.note || '',
      blob: storedBlob
    };
    await put(STORE_PHOTOS, photo);
    added++;
  }
  currentPhotos = await photosForInspection(currentInspection.id);
  renderCategoryButtons();
  renderChecklist();
  renderPhotos();
  let msg = `${added} photo${added === 1 ? '' : 's'} added`;
  if (skippedForRetake) msg += `; ${skippedForRetake} skipped for retake`;
  toast(msg);
  $('photoInput').value = '';
  if (skippedForRetake) {
    setTimeout(() => $('photoInput').click(), 350);
  }
}

function renderPhotos() {
  renderRequiredPhotoProgress();
  const wrap = $('photoGallery');
  wrap.innerHTML = '';
  $('photoCount').textContent = `${currentPhotos.length} photo${currentPhotos.length === 1 ? '' : 's'} stored for this inspection.`;
  currentPhotos
    .slice()
    .sort((a,b) => new Date(b.storedAt) - new Date(a.storedAt))
    .forEach(photo => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(photo.blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      const meta = document.createElement('div');
      meta.className = 'meta';
      const gps = photo.geo ? `${photo.geo.lat.toFixed(5)}, ${photo.geo.lng.toFixed(5)} (${photo.geo.source})` : 'No GPS';
      const orientationNote = photo.orientationFixed ? 'Orientation fixed' : 'Orientation OK';
      const qualityNote = photo.qualityChecked ? `Quality: ${photo.qualityChoice || 'checked'}${photo.qualityIssues?.length ? ' — ' + photo.qualityIssues.join(', ') : ''}` : 'Quality not checked';
      const adjustNote = photo.autoAdjusted ? `Auto adjusted: ${photo.adjustmentNote || 'yes'}` : 'Auto adjustment not applied';
      meta.textContent = `${photo.category} — ${photo.itemLabel || ''}\n${new Date(photo.takenAt).toLocaleString()}\n${gps}\n${orientationNote}\n${qualityNote}\n${adjustNote}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Remove photo';
      del.addEventListener('click', async () => {
        if (!confirm('Remove this photo from the app storage?')) return;
        await deleteKey(STORE_PHOTOS, photo.id);
        currentPhotos = await photosForInspection(currentInspection.id);
        renderCategoryButtons();
        renderChecklist();
        renderPhotos();
      });
      card.append(img, meta, del);
      wrap.appendChild(card);
    });
}

async function renderSavedList() {
  const wrap = $('savedList');
  const all = await getAll(STORE_INSPECTIONS);
  all.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  wrap.innerHTML = '';
  if (!all.length) {
    wrap.innerHTML = '<p class="small">No saved inspections yet.</p>';
    return;
  }
  for (const i of all) {
    const photoCount = (await photosForInspection(i.id)).length;
    const div = document.createElement('div');
    div.className = 'saved-item';
    const title = i.inspectionId || i.address || i.insuredName || 'Untitled inspection';
    div.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <div class="small">${escapeHtml(i.company || 'No company')} • ${escapeHtml(i.workflow || '')}<br>${escapeHtml(i.address || '')} ${escapeHtml(i.city || '')} ${escapeHtml(i.state || '')}<br>${photoCount} photos • Updated ${new Date(i.updatedAt).toLocaleString()}</div>
    `;
    const row = document.createElement('div');
    row.className = 'row';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open';
    open.addEventListener('click', () => loadInspection(i.id));
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export ZIP';
    exportBtn.addEventListener('click', async () => {
      await loadInspection(i.id);
      await exportZip();
    });
    row.append(open, exportBtn);
    div.appendChild(row);
    wrap.appendChild(div);
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

/* Minimal ZIP writer - uncompressed STORE method */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth()+1) << 5) | d.getDate();
  return { time, date: dosDate };
}

function u16(n) { return [n & 255, (n >>> 8) & 255]; }
function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

function concatUint8(arrays) {
  const len = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.path);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(await f.data.arrayBuffer());
    const crc = crc32(data);
    const dt = dosDateTime(f.date ? new Date(f.date) : new Date());
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(dt.time), ...u16(dt.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
    ]);
    localParts.push(local, nameBytes, data);

    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dt.time), ...u16(dt.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
    ]);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralDir = concatUint8(centralParts);
  const localData = concatUint8(localParts);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralDir.length), ...u32(localData.length), ...u16(0)
  ]);

  return new Blob([localData, centralDir, end], { type: 'application/zip' });
}

function inspectionFolderName(i) {
  const id = i.inspectionId ? `${i.inspectionId} - ` : '';
  const who = i.insuredName || 'Inspection';
  const addr = i.address ? ` - ${i.address}` : '';
  return safeFolderName(`${id}${who}${addr}`);
}

function makeInspectionSummary(i, photos) {
  const lines = [];
  lines.push('OrganizeALot Inspection Assistant');
  lines.push('Inspection Summary');
  lines.push('');
  for (const key of ['company','workflow','inspectionId','insuredName','address','city','state','zip','yearBuilt','roofAge','hvacAge','electric']) {
    lines.push(`${key}: ${i[key] || ''}`);
  }
  lines.push(`createdAt: ${i.createdAt || ''}`);
  lines.push(`updatedAt: ${i.updatedAt || ''}`);
  lines.push('');
  const progress = requiredPhotoProgress();
  lines.push(`Required photo progress: ${progress.done} / ${progress.total}`);
  lines.push('');
  lines.push('Notes:');
  lines.push(i.notes || '');
  lines.push('');
  lines.push('Sketch Notes:');
  lines.push(i.sketchNotes || '');
  lines.push('');
  if (Array.isArray(i.sketchMeasurements) && i.sketchMeasurements.length) {
    lines.push('Measurement Sketch:');
    i.sketchMeasurements.forEach((s, idx) => {
      lines.push(`${idx + 1}. ${s.length}${s.unit || 'ft'} angle=${Math.round(Number(s.angle || 0) * 10) / 10}° label=${s.label || ''}`);
    });
    lines.push(`Approx. perimeter: ${i.sketchMeasurements.reduce((sum, s) => sum + Number(s.length || 0), 0).toFixed(1)} ${i.sketchMeasurements[0]?.unit || 'ft'}`);
    lines.push('');
  }
  lines.push('Checklist:');
  for (const [key, checked] of Object.entries(i.checklist || {})) {
    lines.push(`${checked ? '[x]' : '[ ]'} ${key}`);
  }
  lines.push('');
  lines.push('Photos:');
  for (const p of photos) {
    const gps = p.geo ? `${p.geo.lat},${p.geo.lng} source=${p.geo.source || ''} accuracy=${p.geo.accuracy || ''}` : 'No GPS';
    const orient = p.orientationFixed ? `orientation fixed from EXIF ${p.orientation || 1}` : `orientation ${p.orientation || 1}`;
    const quality = p.qualityChecked ? `quality ${p.qualityChoice || 'checked'} issues=${(p.qualityIssues || []).join('; ')}` : 'quality not checked';
    const adjust = p.autoAdjusted ? `auto adjusted: ${p.adjustmentNote || 'yes'}` : 'auto adjustment not applied';
    lines.push(`${p.category} | ${p.itemLabel || ''} | ${p.originalName || ''} | takenAt=${p.takenAt || ''} | ${gps} | ${orient} | ${quality} | ${adjust}`);
  }
  return lines.join('\n');
}

async function exportZip() {
  if (!currentInspection) return toast('No inspection loaded');
  await saveInspection();
  currentPhotos = await photosForInspection(currentInspection.id);

  const progress = requiredPhotoProgress();
  if (progress.done < progress.total) {
    const proceed = confirm(`Required photos are incomplete: ${progress.done} / ${progress.total} done. Export anyway?`);
    if (!proceed) return;
  }

  const i = currentInspection;
  const company = safeFolderName(i.company || 'OrganizeALot');
  const folder = inspectionFolderName(i);
  const basePath = `${company}/${folder}`;
  const files = [];

  files.push({
    path: `${basePath}/inspection-summary.txt`,
    data: new TextEncoder().encode(makeInspectionSummary(i, currentPhotos)),
    date: i.updatedAt
  });

  files.push({
    path: `${basePath}/inspection-data.json`,
    data: new TextEncoder().encode(JSON.stringify({
      inspection: { ...i },
      photos: currentPhotos.map(p => {
        const { blob, ...rest } = p;
        return rest;
      })
    }, null, 2)),
    date: i.updatedAt
  });

  if (i.sketchDataUrl) {
    const sketchBytes = dataUrlToBytes(i.sketchDataUrl);
    files.push({
      path: `${basePath}/Sketch/measurement-sketch.png`,
      data: sketchBytes.bytes,
      date: i.updatedAt
    });
  }

  if (Array.isArray(i.sketchMeasurements) && i.sketchMeasurements.length) {
    files.push({
      path: `${basePath}/Sketch/measurements.txt`,
      data: new TextEncoder().encode(measurementsText()),
      date: i.updatedAt
    });
  }

  const counts = {};
  for (const p of currentPhotos) {
    const cat = safeFolderName(p.category || 'other');
    counts[cat] = (counts[cat] || 0) + 1;
    const ext = (p.originalName?.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
    const note = safeFolderName(p.itemLabel || 'photo').slice(0, 40);
    const name = `${String(counts[cat]).padStart(3, '0')}_${compactDate(p.takenAt)}_${note}.${ext}`;
    files.push({
      path: `${basePath}/Photos/${cat}/${name}`,
      data: p.blob,
      date: p.takenAt
    });
  }

  $('exportStatus').textContent = `Building ZIP with ${currentPhotos.length} photo(s)...`;
  try {
    const zip = await createZip(files);
    const a = document.createElement('a');
    const zipName = safeFolderName(`${folder}_${compactDate(nowIso())}`).replace(/\s+/g, '_') + '.zip';
    a.href = URL.createObjectURL(zip);
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    $('exportStatus').textContent = `ZIP created: ${zipName}`;
    toast('ZIP export created');
  } catch (err) {
    console.error(err);
    $('exportStatus').textContent = 'Export failed: ' + (err.message || err);
    toast('Export failed');
  }
}

async function clearAllData() {
  if (!confirm('Clear ALL OrganizeALot app data from this browser? This cannot be undone.')) return;
  db.close();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  localStorage.removeItem('organizealot_current_inspection_id');
  db = await openDB();
  newInspection();
  await renderSavedList();
  toast('All app data cleared');
}



function setupSketchCanvas() {
  if (sketchInitialized) return;
  sketchCanvas = $('houseSketchCanvas');
  if (!sketchCanvas) return;

  sketchCtx = sketchCanvas.getContext('2d', { willReadFrequently: true });

  document.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => addMeasuredWall(btn.dataset.dir));
  });

  $('addCustomAngleBtn')?.addEventListener('click', addCustomAngleWall);
  $('closeShapeBtn')?.addEventListener('click', closeMeasurementShape);
  $('undoMeasureBtn')?.addEventListener('click', undoMeasurement);
  $('resetMeasureBtn')?.addEventListener('click', resetMeasurementSketch);
  $('centerSketchBtn')?.addEventListener('click', drawMeasurementSketch);
  $('saveSketchBtn')?.addEventListener('click', saveSketch);
  $('downloadSketchBtn')?.addEventListener('click', downloadSketch);
  $('exportMeasurementsBtn')?.addEventListener('click', downloadMeasurementsText);
  $('sketchNotes')?.addEventListener('change', saveSketch);

  sketchInitialized = true;
}

function ensureSketchMeasurements() {
  if (!currentInspection) newInspection();
  if (!Array.isArray(currentInspection.sketchMeasurements)) {
    currentInspection.sketchMeasurements = [];
  }
}

function getMeasureInputLength() {
  const value = parseFloat($('measureLength')?.value || '');
  if (!Number.isFinite(value) || value <= 0) {
    toast('Enter a wall length first');
    return null;
  }
  return value;
}

function directionToAngle(dir) {
  // Canvas math: 0 = right/east, 90 = up/north.
  const map = {
    e: 0,
    ne: 45,
    n: 90,
    nw: 135,
    w: 180,
    sw: 225,
    s: 270,
    se: 315
  };
  return map[dir] ?? 0;
}

function angleToDelta(angleDeg, length) {
  const rad = angleDeg * Math.PI / 180;
  return {
    dx: Math.cos(rad) * length,
    dy: -Math.sin(rad) * length
  };
}

function addMeasuredWall(dir) {
  const length = getMeasureInputLength();
  if (length === null) return;
  const unit = $('measureUnit')?.value || 'ft';
  const angle = directionToAngle(dir);
  addMeasurementSegment(length, unit, angle, dir.toUpperCase());
}

function addCustomAngleWall() {
  const length = getMeasureInputLength();
  if (length === null) return;

  let angle = parseFloat($('customAngle')?.value || '0');
  if (!Number.isFinite(angle)) angle = 0;

  const mode = $('angleMode')?.value || 'standard';
  if (mode === 'bearing') {
    // Bearing: 0 north, 90 east, 180 south, 270 west.
    angle = 90 - angle;
  }

  const unit = $('measureUnit')?.value || 'ft';
  addMeasurementSegment(length, unit, angle, `${Math.round(angle)}°`);
}

function addMeasurementSegment(length, unit, angle, label) {
  ensureSketchMeasurements();

  currentInspection.sketchMeasurements.push({
    id: uuid(),
    length,
    unit,
    angle,
    label,
    createdAt: nowIso()
  });

  currentInspection.updatedAt = nowIso();
  drawMeasurementSketch();
  saveSketch();
}

function closeMeasurementShape() {
  ensureSketchMeasurements();
  const points = measurementPoints();
  if (points.length < 2) {
    toast('Add at least two walls first');
    return;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const dx = start.x - end.x;
  const dy = start.y - end.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.2) {
    toast('Shape is already closed');
    return;
  }

  const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
  currentInspection.sketchMeasurements.push({
    id: uuid(),
    length: Math.round(length * 10) / 10,
    unit: $('measureUnit')?.value || 'ft',
    angle,
    label: 'CLOSE',
    createdAt: nowIso()
  });

  currentInspection.updatedAt = nowIso();
  drawMeasurementSketch();
  saveSketch();
}

function undoMeasurement() {
  ensureSketchMeasurements();
  if (!currentInspection.sketchMeasurements.length) {
    toast('No measurement to undo');
    return;
  }
  currentInspection.sketchMeasurements.pop();
  currentInspection.updatedAt = nowIso();
  drawMeasurementSketch();
  saveSketch();
}

function resetMeasurementSketch() {
  if (!confirm('Reset the measurement sketch?')) return;
  ensureSketchMeasurements();
  currentInspection.sketchMeasurements = [];
  currentInspection.sketchDataUrl = '';
  currentInspection.updatedAt = nowIso();
  drawMeasurementSketch();
  saveSketch();
}

function measurementPoints() {
  ensureSketchMeasurements();
  const points = [{ x: 0, y: 0 }];
  let x = 0, y = 0;

  for (const seg of currentInspection.sketchMeasurements) {
    const d = angleToDelta(Number(seg.angle || 0), Number(seg.length || 0));
    x += d.dx;
    y += d.dy;
    points.push({ x, y, seg });
  }
  return points;
}

function drawMeasurementSketch() {
  setupSketchCanvas();
  if (!sketchCtx || !sketchCanvas) return;

  ensureSketchMeasurements();

  const canvas = sketchCanvas;
  const ctx = sketchCtx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.save();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();

  const pts = measurementPoints();

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 24px system-ui, Arial';
  ctx.fillText('Measurement Sketch', 24, 36);
  ctx.font = '16px system-ui, Arial';
  ctx.fillText('Use directional keys to build measured walls', 24, 62);

  if (pts.length <= 1) {
    ctx.fillStyle = '#64748b';
    ctx.font = '20px system-ui, Arial';
    ctx.fillText('Enter wall length, then tap a direction arrow.', 260, 375);
    updateMeasurementSummary();
    currentInspection.sketchDataUrl = canvas.toDataURL('image/png');
    return;
  }

  const minX = Math.min(...pts.map(p => p.x));
  const maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y));
  const maxY = Math.max(...pts.map(p => p.y));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const margin = 90;
  const scale = Math.min((canvas.width - margin * 2) / w, (canvas.height - margin * 2) / h, 18);
  const offsetX = (canvas.width - w * scale) / 2 - minX * scale;
  const offsetY = (canvas.height - h * scale) / 2 - minY * scale;

  const sx = p => offsetX + p.x * scale;
  const sy = p => offsetY + p.y * scale;

  // Draw walls
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(sx(pts[0]), sy(pts[0]));
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(sx(pts[i]), sy(pts[i]));
  }
  ctx.stroke();
  ctx.restore();

  // Draw points and labels
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = b.seg;
    const ax = sx(a), ay = sy(a);
    const bx = sx(b), by = sy(b);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px system-ui, Arial';
    const label = `${seg.length}${seg.unit || 'ft'}`;
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(mx - textW / 2 - 5, my - 22, textW + 10, 22);
    ctx.fillStyle = '#111827';
    ctx.fillText(label, mx - textW / 2, my - 6);
  }

  // Start marker
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(sx(pts[0]), sy(pts[0]), 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 15px system-ui, Arial';
  ctx.fillText('START', sx(pts[0]) + 10, sy(pts[0]) - 10);

  // Stats
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 16px system-ui, Arial';
  ctx.fillText(`Segments: ${currentInspection.sketchMeasurements.length}`, 24, canvas.height - 42);
  ctx.fillText(`Approx. perimeter: ${measurementPerimeter()} ${dominantMeasurementUnit()}`, 24, canvas.height - 20);

  updateMeasurementSummary();
  currentInspection.sketchDataUrl = canvas.toDataURL('image/png');
}

function dominantMeasurementUnit() {
  ensureSketchMeasurements();
  return currentInspection.sketchMeasurements[0]?.unit || $('measureUnit')?.value || 'ft';
}

function measurementPerimeter() {
  ensureSketchMeasurements();
  const total = currentInspection.sketchMeasurements.reduce((sum, s) => sum + Number(s.length || 0), 0);
  return Math.round(total * 10) / 10;
}

function measurementsText() {
  ensureSketchMeasurements();
  const lines = [];
  lines.push('OrganizeALot Measurement Sketch');
  lines.push('');
  lines.push(`Inspection ID: ${currentInspection?.inspectionId || ''}`);
  lines.push(`Insured / Job: ${currentInspection?.insuredName || ''}`);
  lines.push(`Address: ${currentInspection?.address || ''}`);
  lines.push('');
  lines.push('Segments:');
  currentInspection.sketchMeasurements.forEach((s, idx) => {
    lines.push(`${idx + 1}. ${s.length}${s.unit || 'ft'}  angle=${Math.round(Number(s.angle || 0) * 10) / 10}°  label=${s.label || ''}`);
  });
  lines.push('');
  lines.push(`Approx. perimeter: ${measurementPerimeter()} ${dominantMeasurementUnit()}`);
  lines.push('');
  lines.push('Sketch notes:');
  lines.push(currentInspection?.sketchNotes || '');
  return lines.join('\n');
}

function updateMeasurementSummary() {
  const el = $('measurementSummary');
  if (!el) return;

  ensureSketchMeasurements();
  if (!currentInspection.sketchMeasurements.length) {
    el.textContent = 'No measurements yet.';
    return;
  }

  const last = currentInspection.sketchMeasurements[currentInspection.sketchMeasurements.length - 1];
  el.textContent =
    `Segments: ${currentInspection.sketchMeasurements.length}\n` +
    `Approx. perimeter: ${measurementPerimeter()} ${dominantMeasurementUnit()}\n` +
    `Last wall: ${last.length}${last.unit || 'ft'} at ${Math.round(Number(last.angle || 0) * 10) / 10}°`;
}

function loadSketchForCurrentInspection() {
  setupSketchCanvas();
  if (!currentInspection) return;

  ensureSketchMeasurements();
  if ($('sketchNotes')) $('sketchNotes').value = currentInspection.sketchNotes || '';
  drawMeasurementSketch();
  $('sketchStatus').textContent = currentInspection.sketchMeasurements.length
    ? 'Measurement sketch loaded.'
    : 'Measurement sketch ready.';
}

async function saveSketch() {
  if (!currentInspection) newInspection();
  setupSketchCanvas();
  ensureSketchMeasurements();
  if (!sketchCanvas) return;

  currentInspection.sketchNotes = $('sketchNotes')?.value.trim() || '';
  currentInspection.sketchDataUrl = sketchCanvas.toDataURL('image/png');
  currentInspection.updatedAt = nowIso();
  await put(STORE_INSPECTIONS, currentInspection);
  localStorage.setItem('organizealot_current_inspection_id', currentInspection.id);
  updateMeasurementSummary();
  $('sketchStatus').textContent = 'Measurement sketch saved with this inspection.';
  await renderSavedList();
}

function downloadSketch() {
  if (!sketchCanvas) return;
  drawMeasurementSketch();
  const a = document.createElement('a');
  const base = currentInspection ? inspectionFolderName(currentInspection) : 'measurement-sketch';
  a.href = sketchCanvas.toDataURL('image/png');
  a.download = safeFolderName(base).replace(/\s+/g, '_') + '_measurement_sketch.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadMeasurementsText() {
  const a = document.createElement('a');
  const base = currentInspection ? inspectionFolderName(currentInspection) : 'measurements';
  const blob = new Blob([measurementsText()], { type: 'text/plain' });
  a.href = URL.createObjectURL(blob);
  a.download = safeFolderName(base).replace(/\s+/g, '_') + '_measurements.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function dataUrlToBytes(dataUrl) {
  const [header, base64Data] = dataUrl.split(',');
  const mime = (header.match(/data:(.*?);/) || [])[1] || 'image/png';
  const binary = atob(base64Data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('installBtn').classList.remove('hidden');
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('installBtn').classList.add('hidden');
  });
}

async function init() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { navigator.serviceWorker.register('service-worker.js'); } catch {}
  }
  db = await openDB();
  loadSettings();
  renderCategoryButtons();
  setupSketchCanvas();

  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('newInspectionBtn').addEventListener('click', newInspection);
  $('saveInspectionBtn').addEventListener('click', saveInspection);
  $('deleteInspectionBtn').addEventListener('click', deleteCurrentInspection);
  $('exportZipBtn').addEventListener('click', exportZip);
  $('refreshSavedBtn').addEventListener('click', renderSavedList);
  $('saveSettingsBtn').addEventListener('click', saveSettings);
  $('clearAllBtn').addEventListener('click', clearAllData);
  $('photoInput').addEventListener('change', e => handlePhotos([...e.target.files]));

  for (const id of ['company','workflow','inspectionId','insuredName','address','city','state','zip','yearBuilt','roofAge','hvacAge','electric','notes']) {
    $(id).addEventListener('change', () => saveInspection());
  }

  setupInstall();
  await loadLastInspection();
  await renderSavedList();
}

init().catch(err => {
  console.error(err);
  toast('App startup error: ' + (err.message || err));
});
