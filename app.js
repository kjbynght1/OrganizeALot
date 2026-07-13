const OBS_PHOTOS = [
  ['front','Front','Full front of property. Include roofline if possible.','Exterior'],
  ['front_angle','Front Angle','Corner angle showing front and one side.','Exterior'],
  ['left','Left Side','Left elevation from front looking back.','Exterior'],
  ['rear','Rear','Full rear elevation.','Exterior'],
  ['right','Right Side','Right elevation from rear/front as accessible.','Exterior'],
  ['roof','Roof','Best visible roof view without unsafe positioning.','Exterior'],
  ['address','Address','House number, mailbox, curb, or sign.','Exterior'],
  ['outbuildings','Outbuildings','Detached garage, shed, barn, pole barn if present. Add as many photos as needed.','Exterior'],
  ['damage','Damage / Hazards','Any visible damage, hazards, or concerns. Add as many photos as needed.','Exterior']
];

const STANDARD_PHOTOS = [
  ['front','Front','Exterior front photo.','Exterior'],
  ['left','Left Side','Exterior left side.','Exterior'],
  ['rear','Rear','Exterior rear.','Exterior'],
  ['right','Right Side','Exterior right side.','Exterior'],
  ['roof','Roof Overview','Full roof overview from the safest available angle.','Exterior'],
  ['roof_close','Close Roof Photo','Close-up of shingles/roof covering, flashing, and visible condition.','Exterior'],
  ['outbuildings','Outbuildings','Detached garage, shed, barn, pole barn, or other outbuildings. Add as many photos as needed.','Exterior'],
  ['pool_hot_tub','Hot Tub / Swimming Pool','Swimming pool, hot tub, spa, or related feature. Add multiple photos when both pool and hot tub are present.','Exterior'],
  ['trampolines','Trampolines','Any trampoline or similar recreational equipment. Add as many photos as needed.','Exterior'],
  ['exterior_damage','Exterior Damage / Hazards','Visible damage, hazards, liability concerns, or unusual conditions. Add as many photos as needed.','Exterior'],

  ['interior_entry','Entry / Foyer','Main entry, foyer, and immediate interior condition.','Interior'],
  ['interior_living','Living / Family Room','Living room, family room, great room, or similar main living area.','Interior'],
  ['interior_kitchen','Kitchen','Kitchen overview, cabinets, counters, appliances, and visible condition. Add multiple photos as needed.','Interior'],
  ['interior_dining','Dining Area','Dining room, breakfast area, or eat-in kitchen area.','Interior'],
  ['interior_bathrooms','Bathrooms','Photograph every required bathroom. Add multiple photos for multiple bathrooms or extra views.','Interior'],
  ['interior_bedrooms','Bedrooms (if required)','Bedrooms when required by the inspection assignment. Add multiple photos as needed.','Interior'],
  ['interior_halls','Hallways / Landings','Hallways, upstairs landing, and circulation areas.','Interior'],
  ['interior_stairs','Stairs / Railings','Interior stairs, handrails, guardrails, and stair condition.','Interior'],
  ['interior_basement','Basement / Crawlspace','Basement or accessible crawlspace overview, walls, foundation, utilities, and visible conditions. Add multiple photos as needed.','Interior'],
  ['interior_utility','Utility / Mechanical','Electrical panel, furnace, water heater, laundry, and other mechanical equipment when required.','Interior'],
  ['interior_attic','Attic (if accessible)','Attic access and visible attic condition when safely accessible and required.','Interior'],
  ['interior_damage','Interior Damage / Hazards','Visible interior damage, water staining, hazards, or unusual conditions. Add as many photos as needed.','Interior']
];

const state = {
  current:null,
  pendingPhoto:null,
  pendingDataUrl:null,
  pendingQuality:null,
  deferredInstall:null,
  qualityRunId:0
};

const PHOTO_DB='organizealot-photos-v1';
const PHOTO_STORE='photos';
const $ = id => document.getElementById(id);
const screens = ['menuScreen','setupScreen','dashboardScreen','cameraScreen','reviewScreen'];

function show(id){
  screens.forEach(s=>$(s).classList.toggle('active',s===id));
  if(id==='menuScreen') renderSaved();
  window.scrollTo(0,0);
}
function uid(){ return 'insp_'+Date.now(); }
function photoUid(){ return 'photo_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
function photosFor(type){ return type==='OBS'?OBS_PHOTOS:STANDARD_PHOTOS; }
function itemImages(item){ return Array.isArray(item.images)?item.images:[]; }
function itemHasPhotos(item){ return itemImages(item).some(img=>img.hasPhoto || img.dataUrl); }
function itemStatus(item){
  if(item.status==='missing' && !itemHasPhotos(item)) return 'missing';
  if(itemHasPhotos(item)) return 'done';
  return 'open';
}
function savedImageCount(item){ return itemImages(item).filter(img=>img.hasPhoto || img.dataUrl).length; }
function clearDepartureOverride(){
  if(state.current && state.current.departureOverride) state.current.departureOverride=null;
}

function legacyImageFromItem(existing){
  if(!existing) return null;
  if(!(existing.dataUrl || existing.hasPhoto || existing.status==='done')) return null;
  return {
    id:'legacy',
    dataUrl:existing.dataUrl||null,
    hasPhoto:!!(existing.hasPhoto||existing.dataUrl||existing.status==='done'),
    quality:existing.quality||null,
    note:existing.note||'',
    departureQualityOverride:!!existing.departureQualityOverride,
    createdAt:existing.updated||new Date().toISOString(),
    legacyStorageKey:true
  };
}

function normalizeImage(img,index){
  if(!img) return null;
  return {
    id:img.id||`legacy_${index}`,
    dataUrl:img.dataUrl||null,
    hasPhoto:!!(img.hasPhoto||img.dataUrl),
    quality:img.quality||null,
    note:img.note||'',
    departureQualityOverride:!!img.departureQualityOverride,
    createdAt:img.createdAt||new Date().toISOString(),
    legacyStorageKey:!!img.legacyStorageKey
  };
}

function ensurePhotoChecklist(inspection){
  if(!inspection) return inspection;
  if(!inspection.photos) inspection.photos={};
  const ordered={};

  photosFor(inspection.type).forEach(([key,title,help,section])=>{
    const existing=inspection.photos[key]||{};
    let images=[];
    if(Array.isArray(existing.images)){
      images=existing.images.map(normalizeImage).filter(Boolean);
    }else{
      const legacy=legacyImageFromItem(existing);
      if(legacy) images=[legacy];
    }
    ordered[key]={
      key,
      title,
      help,
      section:section||'Exterior',
      status:itemHasPhotos({images})?'done':(existing.status||'open'),
      note:existing.note||'',
      images
    };
  });

  Object.entries(inspection.photos).forEach(([key,value])=>{
    if(ordered[key]) return;
    const extra={...value};
    if(!Array.isArray(extra.images)){
      const legacy=legacyImageFromItem(extra);
      extra.images=legacy?[legacy]:[];
    }
    extra.section=extra.section||'Other';
    extra.status=itemStatus(extra);
    ordered[key]=extra;
  });

  inspection.photos=ordered;
  return inspection;
}

function newInspection(type){
  state.current={
    id:uid(), type, inspectionId:'', address:'', inspector:'Chris Roberts',
    created:new Date().toISOString(), updated:new Date().toISOString(), photos:{}
  };
  photosFor(type).forEach(([key,title,help,section])=>{
    state.current.photos[key]={key,title,help,section:section||'Exterior',status:'open',note:'',images:[]};
  });
}

function openPhotoDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(PHOTO_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Photo database could not open.'));
  });
}
function photoDbKey(inspectionId,itemKey,imageId){ return `${inspectionId}::${itemKey}::${imageId}`; }
function legacyPhotoDbKey(inspectionId,itemKey){ return `${inspectionId}::${itemKey}`; }

async function storePhoto(inspectionId,itemKey,imageId,dataUrl){
  try{
    const db=await openPhotoDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(PHOTO_STORE,'readwrite');
      tx.objectStore(PHOTO_STORE).put(dataUrl,photoDbKey(inspectionId,itemKey,imageId));
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
    return true;
  }catch(err){ console.warn('Photo storage failed.',err); return false; }
}

async function getStoredPhoto(inspectionId,itemKey,image){
  try{
    const db=await openPhotoDb();
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction(PHOTO_STORE,'readonly');
      const store=tx.objectStore(PHOTO_STORE);
      const primary=store.get(photoDbKey(inspectionId,itemKey,image.id));
      primary.onsuccess=()=>{
        if(primary.result){ resolve(primary.result); return; }
        if(image.legacyStorageKey || image.id==='legacy'){
          const legacy=store.get(legacyPhotoDbKey(inspectionId,itemKey));
          legacy.onsuccess=()=>resolve(legacy.result||null);
          legacy.onerror=()=>reject(legacy.error);
        }else resolve(null);
      };
      primary.onerror=()=>reject(primary.error);
    });
    db.close();
    return value;
  }catch(err){ console.warn('Photo read failed.',err); return null; }
}

async function removeStoredPhoto(inspectionId,itemKey,image){
  try{
    const db=await openPhotoDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(PHOTO_STORE,'readwrite');
      const store=tx.objectStore(PHOTO_STORE);
      store.delete(photoDbKey(inspectionId,itemKey,image.id));
      if(image.legacyStorageKey || image.id==='legacy') store.delete(legacyPhotoDbKey(inspectionId,itemKey));
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
  }catch(err){ console.warn('Photo delete failed.',err); }
}

async function hydrateInspectionPhotos(inspection){
  if(!inspection) return;
  ensurePhotoChecklist(inspection);
  await Promise.all(Object.values(inspection.photos).flatMap(item=>
    itemImages(item).map(async image=>{
      if(image.dataUrl) return;
      if(image.hasPhoto) image.dataUrl=await getStoredPhoto(inspection.id,item.key,image);
    })
  ));
}

function save(){
  if(!state.current) return false;
  ensurePhotoChecklist(state.current);
  state.current.updated=new Date().toISOString();
  try{
    const metadata=JSON.parse(JSON.stringify(state.current));
    Object.values(metadata.photos||{}).forEach(item=>{
      item.status=itemStatus(item);
      itemImages(item).forEach(image=>{
        if(image.dataUrl){ image.hasPhoto=true; image.dataUrl=null; }
      });
    });
    localStorage.setItem(state.current.id,JSON.stringify(metadata));
    renderDashboard();
    return true;
  }catch(err){
    console.warn('Inspection metadata save failed.',err);
    renderDashboard();
    return false;
  }
}

function allInspections(){
  return Object.keys(localStorage)
    .filter(k=>k.startsWith('insp_'))
    .map(k=>{ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} })
    .filter(Boolean)
    .sort((a,b)=>new Date(b.updated)-new Date(a.updated));
}

function renderSaved(){
  const box=$('savedList');
  box.innerHTML='';
  const items=allInspections();
  if(!items.length){ box.innerHTML='<p class="muted">No saved inspections yet.</p>'; return; }
  items.forEach(item=>{
    const b=document.createElement('button');
    b.className='saved-item';
    b.innerHTML=`<strong>${item.type} — ${item.inspectionId||'No ID'}</strong><br><small>${item.address||'No address'} · ${new Date(item.updated).toLocaleString()}</small>`;
    b.onclick=async()=>{
      state.current=item;
      await hydrateInspectionPhotos(state.current);
      renderDashboard();
      show('dashboardScreen');
    };
    box.appendChild(b);
  });
}

function renderDashboard(){
  const c=state.current;
  if(!c) return;
  ensurePhotoChecklist(c);
  $('dashTitle').textContent=`${c.type} Inspection`;
  $('dashMeta').textContent=`${c.inspectionId||'No ID'} • ${c.address||'No address'} • ${c.inspector||'Inspector not set'}`;
  $('obsNotice').classList.toggle('hidden',c.type!=='OBS');

  const list=$('photoList');
  list.innerHTML='';
  const items=Object.values(c.photos);
  const complete=items.filter(item=>itemStatus(item)==='done'||itemStatus(item)==='missing').length;
  $('progressText').textContent=`${complete}/${items.length} complete`;
  $('readyText').textContent=complete===items.length?'Ready to export':c.departureOverride?'Saved with override':'Not ready';
  $('progressBar').style.width=`${items.length?Math.round(complete/items.length*100):0}%`;

  let currentSection='';
  items.forEach(item=>{
    if(item.section!==currentSection){
      currentSection=item.section;
      const heading=document.createElement('div');
      heading.className='checklist-section-heading';
      heading.innerHTML=`<h3>${currentSection}</h3><span>${items.filter(i=>i.section===currentSection).length} items</span>`;
      list.appendChild(heading);
    }

    const statusValue=itemStatus(item);
    const count=savedImageCount(item);
    const wrapper=document.createElement('section');
    wrapper.className=`photo-item ${statusValue}`;
    wrapper.dataset.photoKey=item.key;

    const row=document.createElement('div');
    row.className=`photo-row ${statusValue}`;
    const status=document.createElement('div');
    status.className='status';
    status.textContent=statusValue==='done'?String(count):statusValue==='missing'?'!':'•';

    const info=document.createElement('div');
    info.className='info';
    const title=document.createElement('strong');
    title.textContent=item.title;
    const help=document.createElement('small');
    if(statusValue==='done') help.textContent=`${count} ${count===1?'photo':'photos'} saved — add more anytime`;
    else if(statusValue==='missing') help.textContent='Marked cannot obtain / not present';
    else help.textContent=item.help;
    info.append(title,help);

    const addBtn=document.createElement('button');
    addBtn.className=statusValue==='done'?'add-photo-btn':'secondary';
    addBtn.textContent=statusValue==='done'?'+ Add Photo':'Take Photo';
    addBtn.onclick=()=>openPhoto(item.key,true,null);

    row.append(status,info,addBtn);
    wrapper.appendChild(row);
    list.appendChild(wrapper);
  });

  renderTakenPhotosGallery(c,items);
}

function flattenSavedImages(items){
  const output=[];
  items.forEach(item=>{
    itemImages(item).forEach((image,index)=>{
      if(image.hasPhoto||image.dataUrl) output.push({item,image,index});
    });
  });
  return output;
}

function renderTakenPhotosGallery(inspection,items){
  const gallery=$('takenPhotosGallery');
  const countBox=$('takenPhotosCount');
  if(!gallery||!countBox) return;
  gallery.innerHTML='';
  const saved=flattenSavedImages(items);
  countBox.textContent=`${saved.length} ${saved.length===1?'photo':'photos'}`;

  if(!saved.length){
    const empty=document.createElement('p');
    empty.className='taken-photos-empty';
    empty.textContent='No pictures taken yet. Every saved picture will appear here automatically.';
    gallery.appendChild(empty);
    return;
  }

  saved.forEach(({item,image,index},globalIndex)=>{
    const card=document.createElement('article');
    card.className='taken-photo-card';

    const heading=document.createElement('div');
    heading.className='taken-photo-card-heading';
    const number=document.createElement('span');
    number.className='taken-photo-number';
    number.textContent=String(globalIndex+1);
    const titleWrap=document.createElement('div');
    const title=document.createElement('strong');
    title.textContent=item.title;
    const sub=document.createElement('small');
    sub.textContent=`Photo ${index+1} of ${savedImageCount(item)} · ${item.section}`;
    titleWrap.append(title,sub);
    heading.append(number,titleWrap);
    card.appendChild(heading);

    if(image.dataUrl){
      const imgBtn=document.createElement('button');
      imgBtn.type='button';
      imgBtn.className='taken-photo-image-button';
      imgBtn.setAttribute('aria-label',`View ${item.title} photo ${index+1}`);
      const img=document.createElement('img');
      img.src=image.dataUrl;
      img.alt=`${item.title} photo ${index+1}`;
      img.loading='eager';
      imgBtn.appendChild(img);
      imgBtn.onclick=()=>openPhoto(item.key,false,image.id);
      card.appendChild(imgBtn);
    }else{
      const loading=document.createElement('div');
      loading.className='photo-loading';
      loading.textContent='Loading saved picture…';
      card.appendChild(loading);
      getStoredPhoto(inspection.id,item.key,image).then(dataUrl=>{
        if(dataUrl && state.current && state.current.id===inspection.id){
          image.dataUrl=dataUrl;
          renderDashboard();
        }
      });
    }

    const actions=document.createElement('div');
    actions.className='gallery-card-actions';
    const retake=document.createElement('button');
    retake.type='button';
    retake.className='secondary';
    retake.textContent='📷 Retake';
    retake.onclick=()=>openPhoto(item.key,true,image.id);
    const del=document.createElement('button');
    del.type='button';
    del.className='delete-photo-btn';
    del.textContent='🗑 Delete';
    del.onclick=()=>deletePhoto(item.key,image.id);
    actions.append(retake,del);
    card.appendChild(actions);
    gallery.appendChild(card);
  });
}

async function deletePhoto(itemKey,imageId){
  if(!state.current||!state.current.photos[itemKey]) return;
  const item=state.current.photos[itemKey];
  const image=itemImages(item).find(img=>img.id===imageId);
  if(!image) return;
  item.images=itemImages(item).filter(img=>img.id!==imageId);
  item.status=itemHasPhotos(item)?'done':'open';
  clearDepartureOverride();
  await removeStoredPhoto(state.current.id,itemKey,image);
  save();
}

function firstOpen(){
  return Object.values(state.current.photos).find(item=>itemStatus(item)==='open');
}

function launchCamera(){
  const input=$('cameraInput');
  input.value='';
  input.click();
}

function findImage(item,imageId){ return itemImages(item).find(img=>img.id===imageId)||null; }

function openPhoto(itemKey,autoLaunch=false,imageId=null){
  const item=state.current && state.current.photos[itemKey];
  if(!item) return;
  const existing=imageId?findImage(item,imageId):null;
  state.pendingPhoto={itemKey,imageId:imageId||null};
  state.pendingDataUrl=existing?existing.dataUrl:null;
  state.pendingQuality=existing?existing.quality:null;
  state.qualityRunId++;

  const count=savedImageCount(item);
  $('photoTitle').textContent=existing?`${item.title} — Photo ${itemImages(item).findIndex(img=>img.id===imageId)+1}`:`${item.title} — Add Photo`;
  $('photoHelp').textContent=count?`${item.help} You currently have ${count} ${count===1?'photo':'photos'} saved for this item.`:item.help;
  $('photoNote').value=existing?.note||'';
  $('cameraInput').value='';
  $('previewImg').classList.add('hidden');
  $('qualityBox').className='quality hidden';
  $('okPhotoBtn').textContent='OK / Save Photo';
  $('okPhotoBtn').disabled=!state.pendingDataUrl;
  $('takePhotoBtn').textContent=existing?'📷 Retake This Photo':'📷 Take Photo';
  $('nextChecklistBtn').textContent=`Done With ${item.title} — Next →`;
  $('cameraHint').classList.toggle('hidden',!!existing);
  $('markMissingBtn').textContent=count&&!existing?'Cancel Add Photo':'Cannot Get Photo';

  if(state.pendingDataUrl){
    $('previewImg').src=state.pendingDataUrl;
    $('previewImg').classList.remove('hidden');
    runQuality(state.pendingDataUrl,{autoSave:false});
  }
  show('cameraScreen');
  if(autoLaunch) launchCamera();
}

function analyzeImageQuality(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const mp=(img.naturalWidth*img.naturalHeight)/1000000;
        const maxW=320,maxH=240;
        const scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);
        const width=Math.max(40,Math.round(img.naturalWidth*scale));
        const height=Math.max(40,Math.round(img.naturalHeight*scale));
        const canvas=document.createElement('canvas');
        canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
        ctx.drawImage(img,0,0,width,height);
        const rgba=ctx.getImageData(0,0,width,height).data;
        const gray=new Float32Array(width*height);
        let sum=0,sumSq=0,dark=0,bright=0;
        for(let i=0,p=0;i<rgba.length;i+=4,p++){
          const y=0.299*rgba[i]+0.587*rgba[i+1]+0.114*rgba[i+2];
          gray[p]=y; sum+=y; sumSq+=y*y;
          if(y<35) dark++;
          if(y>245) bright++;
        }
        const pixels=gray.length;
        const average=sum/pixels;
        const contrast=Math.sqrt(Math.max(0,sumSq/pixels-average*average));
        let lapSum=0,lapSq=0,lapCount=0;
        for(let y=1;y<height-1;y++){
          const row=y*width;
          for(let x=1;x<width-1;x++){
            const i=row+x;
            const lap=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width];
            lapSum+=lap; lapSq+=lap*lap; lapCount++;
          }
        }
        const lapMean=lapCount?lapSum/lapCount:0;
        const sharpness=lapCount?Math.max(0,lapSq/lapCount-lapMean*lapMean):0;
        const darkPct=dark/pixels*100;
        const brightPct=bright/pixels*100;
        const failures=[];
        if(mp<0.6) failures.push('resolution is too low');
        if(average<42||darkPct>62) failures.push('photo is too dark');
        if(average>225||brightPct>42) failures.push('photo is overexposed');
        if(contrast<13) failures.push('photo has very low contrast');
        if(sharpness<55) failures.push('photo appears blurry');
        resolve({pass:failures.length===0,failures,mp,average,contrast,sharpness,darkPct,brightPct});
      }catch(err){ reject(err); }
    };
    img.onerror=()=>reject(new Error('Could not analyze photo.'));
    img.src=dataUrl;
  });
}

function qualitySummary(result){
  const sharpLabel=result.sharpness>=140?'very sharp':result.sharpness>=80?'sharp':'usable';
  const lightLabel=result.average<75?'a little dark':result.average>195?'a little bright':'good lighting';
  return `Sharpness: ${sharpLabel}. Lighting: ${lightLabel}. Resolution: ${result.mp.toFixed(1)} MP.`;
}

async function runQuality(dataUrl,{autoSave=false}={}){
  const runId=++state.qualityRunId;
  const pending=state.pendingPhoto?{...state.pendingPhoto}:null;
  const box=$('qualityBox');
  box.className='quality';
  box.innerHTML='<strong>Automatic quality check</strong><p>Checking blur, lighting, overexposure, contrast, and resolution…</p>';
  box.classList.remove('hidden');
  try{
    const result=await analyzeImageQuality(dataUrl);
    if(runId!==state.qualityRunId || !state.pendingPhoto || pending.itemKey!==state.pendingPhoto.itemKey || pending.imageId!==state.pendingPhoto.imageId) return result;
    state.pendingQuality={
      pass:result.pass,
      checkedAt:new Date().toISOString(),
      sharpness:Math.round(result.sharpness),
      brightness:Math.round(result.average),
      contrast:Math.round(result.contrast),
      darkPct:Math.round(result.darkPct),
      brightPct:Math.round(result.brightPct),
      resolutionMP:Number(result.mp.toFixed(2)),
      details:result.pass?qualitySummary(result):result.failures.join('; ')
    };

    if(result.pass){
      box.className='quality good';
      box.innerHTML=`<strong>✓ Quality passed — auto-saving</strong><p>${qualitySummary(result)}</p>`;
      $('okPhotoBtn').textContent='✓ Passed — Auto-saving…';
      $('okPhotoBtn').disabled=true;
      if(autoSave){
        await commitPendingPhoto();
        setTimeout(()=>{
          if(runId===state.qualityRunId) stayOnCurrentItemAfterSave(pending.itemKey);
        },450);
      }
    }else{
      box.className='quality bad';
      box.innerHTML=`<strong>⚠ Quality check needs attention</strong><p>${result.failures.join('. ')}. Retake the photo, or save it manually if it is still usable.</p>`;
      $('okPhotoBtn').textContent='Save Anyway';
      $('okPhotoBtn').disabled=false;
    }
    return result;
  }catch(err){
    console.warn('Automatic quality check failed.',err);
    if(runId!==state.qualityRunId) return null;
    box.className='quality warn';
    box.innerHTML='<strong>Quality check unavailable</strong><p>I could not automatically check this photo. Review it and save manually or retake it.</p>';
    $('okPhotoBtn').textContent='Save Photo';
    $('okPhotoBtn').disabled=false;
    return null;
  }
}

function readFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function loadImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('Could not read photo.')); };
    img.src=url;
  });
}
async function optimizePhoto(file){
  try{
    const img=await loadImageFromFile(file);
    const maxDim=1400;
    const largest=Math.max(img.naturalWidth,img.naturalHeight);
    const scale=largest>maxDim?maxDim/largest:1;
    const width=Math.max(1,Math.round(img.naturalWidth*scale));
    const height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.drawImage(img,0,0,width,height);
    return canvas.toDataURL('image/jpeg',0.72);
  }catch(err){
    console.warn('Photo optimization failed; using original image.',err);
    return readFile(file);
  }
}

async function onCamera(e){
  const file=e.target.files[0];
  if(!file || !state.current || !state.pendingPhoto) return;
  const btn=$('okPhotoBtn');
  btn.disabled=true;
  btn.textContent='Processing photo…';
  let result=null;
  try{
    state.pendingDataUrl=await optimizePhoto(file);
    state.pendingQuality=null;
    clearDepartureOverride();
    $('previewImg').src=state.pendingDataUrl;
    $('previewImg').classList.remove('hidden');
    result=await runQuality(state.pendingDataUrl,{autoSave:true});
  }catch(err){
    console.error(err);
    alert('The photo could not be processed. Please retake it.');
  }finally{
    if(!result || !result.pass){
      if(btn.textContent==='Processing photo…') btn.textContent='Save Photo';
      btn.disabled=!state.pendingDataUrl;
    }
  }
}

async function commitPendingPhoto(){
  if(!state.current || !state.pendingPhoto || !state.pendingDataUrl) return false;
  const {itemKey,imageId}=state.pendingPhoto;
  const item=state.current.photos[itemKey];
  if(!item) return false;

  let image=imageId?findImage(item,imageId):null;
  const isNew=!image;
  if(isNew){
    image={id:photoUid(),dataUrl:null,hasPhoto:false,quality:null,note:'',departureQualityOverride:false,createdAt:new Date().toISOString()};
    item.images.push(image);
  }

  if(!isNew && image.dataUrl && image.id!==imageId){
    await removeStoredPhoto(state.current.id,itemKey,image);
  }
  image.dataUrl=state.pendingDataUrl;
  image.hasPhoto=true;
  image.quality=state.pendingQuality;
  image.note=$('photoNote').value.trim();
  image.departureQualityOverride=false;
  image.legacyStorageKey=false;
  item.status='done';
  item.note='';
  await storePhoto(state.current.id,itemKey,image.id,image.dataUrl);
  save();
  return true;
}

function stayOnCurrentItemAfterSave(itemKey){
  state.pendingDataUrl=null;
  state.pendingQuality=null;
  const item=state.current && state.current.photos[itemKey];
  if(!item){
    renderDashboard();
    show('dashboardScreen');
    return;
  }
  openPhoto(itemKey,false,null);
  const count=savedImageCount(item);
  const box=$('qualityBox');
  box.className='quality good';
  box.innerHTML=`<strong>✓ ${count===1?'Photo':'Photos'} saved for ${item.title}</strong><p>You now have ${count} ${count===1?'photo':'photos'} for this item. Tap Take Photo for another ${item.title} picture, or tap Next Checklist Item when you are ready to move on.</p>`;
  box.classList.remove('hidden');
  $('takePhotoBtn').textContent=`📷 Take Another ${item.title} Photo`;
  $('nextChecklistBtn').classList.remove('hidden');
}

function nextOpenAfter(itemKey){
  const items=Object.values(state.current?.photos||{});
  const currentIndex=items.findIndex(item=>item.key===itemKey);
  for(let i=currentIndex+1;i<items.length;i++){
    if(itemStatus(items[i])==='open') return items[i];
  }
  for(let i=0;i<currentIndex;i++){
    if(itemStatus(items[i])==='open') return items[i];
  }
  return null;
}

function advanceFromCurrent(){
  const currentKey=state.pendingPhoto?.itemKey||null;
  state.pendingDataUrl=null;
  state.pendingQuality=null;
  const next=currentKey?nextOpenAfter(currentKey):firstOpen();
  if(next){
    openPhoto(next.key,true,null);
  }else{
    save();
    renderDashboard();
    show('dashboardScreen');
  }
}

function qualityIssueText(image){
  if(!image.quality || typeof image.quality!=='object') return 'No automatic quality result is saved for this photo.';
  if(image.quality.pass===false) return image.quality.details || 'The automatic quality check flagged this photo.';
  return 'Photo quality looks acceptable.';
}

function getDepartureGroups(){
  const items=Object.values(state.current.photos||{});
  const open=items.filter(item=>itemStatus(item)==='open');
  const marked=items.filter(item=>itemStatus(item)==='missing');
  const questionable=[];
  let passedPhotos=0;
  flattenSavedImages(items).forEach(({item,image,index})=>{
    if(image.departureQualityOverride || (image.quality && typeof image.quality==='object' && image.quality.pass===true)) passedPhotos++;
    else questionable.push({item,image,index});
  });
  return {items,open,marked,questionable,passedPhotos};
}

async function markMissingFromDeparture(itemKey){
  const item=state.current && state.current.photos[itemKey];
  if(!item || itemHasPhotos(item)) return;
  item.note=item.note||'Photo could not be obtained or item was not present.';
  item.status='missing';
  clearDepartureOverride();
  save();
  departureCheck();
}

function acceptQualityFromDeparture(itemKey,imageId){
  const item=state.current && state.current.photos[itemKey];
  const image=item?findImage(item,imageId):null;
  if(!image) return;
  image.departureQualityOverride=true;
  clearDepartureOverride();
  save();
  departureCheck();
}

function saveDepartureAnyway(){
  const {open,questionable}=getDepartureGroups();
  state.current.departureOverride={
    savedAt:new Date().toISOString(),
    unresolved:[...open.map(item=>item.key),...questionable.map(q=>`${q.item.key}:${q.image.id}`)]
  };
  save();
  renderDashboard();
  show('dashboardScreen');
}

function makeDepartureAction(label,className,onClick){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className=className;
  btn.textContent=label;
  btn.onclick=onClick;
  return btn;
}

function departureCheck(){
  if(!state.current) return;
  ensurePhotoChecklist(state.current);
  const {items,open,marked,questionable,passedPhotos}=getDepartureGroups();
  const box=$('reviewResults');
  box.innerHTML='';

  const summary=document.createElement('div');
  summary.className=`departure-summary ${open.length||questionable.length?'needs-attention':'passed'}`;
  const title=document.createElement('strong');
  title.textContent=open.length||questionable.length?'⚠ Departure check needs attention':'✓ Departure check passed';
  const detail=document.createElement('p');
  detail.textContent=`${passedPhotos} photos passed · ${open.length} checklist items missing · ${questionable.length} questionable photos · ${marked.length} marked cannot obtain`;
  summary.append(title,detail);
  box.appendChild(summary);

  if(!open.length && !questionable.length){
    const good=document.createElement('div');
    good.className='departure-all-clear';
    good.innerHTML='<strong>Everything is accounted for.</strong><p>Every checklist item has at least one saved photo or a cannot-obtain mark, and no unresolved quality warnings remain.</p>';
    box.appendChild(good);
  }

  if(open.length){
    const h=document.createElement('h3');
    h.textContent='Missing Checklist Items';
    box.appendChild(h);
    open.forEach(item=>{
      const card=document.createElement('article');
      card.className='departure-issue missing-issue';
      const label=document.createElement('strong');
      label.textContent=`${item.section}: ${item.title}`;
      const note=document.createElement('p');
      note.textContent='No completed photo is saved for this checklist item.';
      const actions=document.createElement('div');
      actions.className='departure-actions';
      actions.append(
        makeDepartureAction('📷 Take Photo','primary',()=>openPhoto(item.key,true,null)),
        makeDepartureAction('Cannot Obtain','warning',()=>markMissingFromDeparture(item.key))
      );
      card.append(label,note,actions);
      box.appendChild(card);
    });
  }

  if(questionable.length){
    const h=document.createElement('h3');
    h.textContent='Questionable Photo Quality';
    box.appendChild(h);
    questionable.forEach(({item,image,index})=>{
      const card=document.createElement('article');
      card.className='departure-issue quality-issue';
      const label=document.createElement('strong');
      label.textContent=`${item.title} — Photo ${index+1}`;
      const note=document.createElement('p');
      note.textContent=qualityIssueText(image);
      const actions=document.createElement('div');
      actions.className='departure-actions';
      actions.append(
        makeDepartureAction('📷 Retake','primary',()=>openPhoto(item.key,true,image.id)),
        makeDepartureAction('Save Anyway','secondary',()=>acceptQualityFromDeparture(item.key,image.id))
      );
      card.append(label,note,actions);
      box.appendChild(card);
    });
  }

  if(marked.length){
    const h=document.createElement('h3');
    h.textContent='Marked Cannot Obtain';
    box.appendChild(h);
    marked.forEach(item=>{
      const card=document.createElement('article');
      card.className='departure-issue marked-issue';
      const label=document.createElement('strong');
      label.textContent=`${item.section}: ${item.title}`;
      const note=document.createElement('p');
      note.textContent=item.note||'Marked cannot obtain.';
      const actions=document.createElement('div');
      actions.className='departure-actions';
      actions.append(makeDepartureAction('📷 Try Again','secondary',()=>openPhoto(item.key,true,null)));
      card.append(label,note,actions);
      box.appendChild(card);
    });
  }

  const footer=document.createElement('div');
  footer.className='departure-footer';
  if(open.length||questionable.length){
    footer.appendChild(makeDepartureAction('Save Inspection Anyway','departure-save-anyway',saveDepartureAnyway));
    const caution=document.createElement('p');
    caution.className='muted';
    caution.textContent='Use Save Inspection Anyway only when you have reviewed the remaining issues and intentionally want to leave them unresolved.';
    footer.appendChild(caution);
  }else{
    footer.appendChild(makeDepartureAction('✓ Done — Return to Inspection','primary',()=>show('dashboardScreen')));
  }
  box.appendChild(footer);
  show('reviewScreen');
}

function exportReport(){
  save();
  const c=state.current;
  const items=Object.values(c.photos);
  const report={
    ...c,
    exported:new Date().toISOString(),
    photoSummary:items.map(item=>({
      key:item.key,
      section:item.section,
      title:item.title,
      status:itemStatus(item),
      note:item.note,
      photoCount:savedImageCount(item),
      photos:itemImages(item).map((image,index)=>({
        photoNumber:index+1,
        quality:image.quality,
        note:image.note,
        hasPhoto:!!(image.dataUrl||image.hasPhoto)
      }))
    }))
  };
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`OrganizeALot_${c.type}_${c.inspectionId||c.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.querySelectorAll('.tile').forEach(b=>b.onclick=()=>{
  newInspection(b.dataset.type);
  $('setupTitle').textContent=`New ${b.dataset.type} Inspection`;
  $('inspectionId').value='';
  $('address').value='';
  $('inspector').value='Chris Roberts';
  show('setupScreen');
});
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>show(b.dataset.screen));
$('startBtn').onclick=()=>{
  const c=state.current;
  c.inspectionId=$('inspectionId').value.trim();
  c.address=$('address').value.trim();
  c.inspector=$('inspector').value.trim()||'Chris Roberts';
  save();
  renderDashboard();
  show('dashboardScreen');
};
$('openMapBtn').onclick=()=>{
  const q=encodeURIComponent($('address').value.trim());
  if(q) window.open(`https://www.google.com/maps/search/?api=1&query=${q}`,'_blank');
};
$('takeNextBtn').onclick=()=>{
  const next=firstOpen();
  if(next) openPhoto(next.key,true,null);
  else departureCheck();
};
$('cameraInput').addEventListener('change',onCamera);
$('takePhotoBtn').onclick=launchCamera;
$('okPhotoBtn').onclick=async()=>{
  if(!state.pendingDataUrl) return;
  const itemKey=state.pendingPhoto?.itemKey;
  await commitPendingPhoto();
  if(itemKey) stayOnCurrentItemAfterSave(itemKey);
};
$('retakeBtn').onclick=launchCamera;
$('nextChecklistBtn').onclick=advanceFromCurrent;
$('markMissingBtn').onclick=async()=>{
  if(!state.current||!state.pendingPhoto) return;
  const item=state.current.photos[state.pendingPhoto.itemKey];
  if(!item) return;
  if(itemHasPhotos(item) && !state.pendingPhoto.imageId){
    renderDashboard();
    show('dashboardScreen');
    return;
  }
  if(state.pendingPhoto.imageId){
    renderDashboard();
    show('dashboardScreen');
    return;
  }
  item.note=$('photoNote').value.trim()||'Photo could not be obtained or item was not present.';
  item.status='missing';
  clearDepartureOverride();
  save();
  advanceFromCurrent();
};
$('saveBtn').onclick=save;
$('departureBtn').onclick=departureCheck;
$('exportBtn').onclick=exportReport;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  state.deferredInstall=e;
  $('installBtn').classList.remove('hidden');
});
$('installBtn').onclick=async()=>{
  if(state.deferredInstall){
    state.deferredInstall.prompt();
    state.deferredInstall=null;
    $('installBtn').classList.add('hidden');
  }
};
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js?v=2.1.0-build-012',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
renderSaved();
