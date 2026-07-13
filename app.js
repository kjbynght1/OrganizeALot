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
  ['front','Front of Home','Take 1 clear front photo of the main dwelling.','Exterior',1,false,true],
  ['rear','Rear of Home','Take 1 clear rear photo of the main dwelling.','Exterior',1,false,true],
  ['left','Left Side of Home','Take 1 clear left-side photo of the main dwelling.','Exterior',1,false,true],
  ['right','Right Side of Home','Take 1 clear right-side photo of the main dwelling.','Exterior',1,false,true],
  ['address','Address Verification','Photograph the house number, mailbox, curb, street sign, or another clear address identifier.','Exterior',1,false,true],
  ['outbuildings','All Outbuildings','Photograph every detached garage, shed, barn, pole barn, or other outbuilding on the premises. Stay on this item and add as many photos as needed.','Exterior',1,true,true],
  ['pools_spas','All Pools / Spas','Photograph every swimming pool, hot tub, or spa on the premises. Stay on this item and add as many photos as needed.','Exterior',1,true,true],
  ['hud_label','HUD Label if Manufactured Home','Photograph the HUD label if the property is a manufactured home. Mark Not Applicable when it is not a manufactured home.','Exterior',1,true,true],

  ['levels','Each Level, Including Basement','Take at least 1 photo per level of the home, including the basement when present. Stay on this item and add one or more photos for every level.','Interior',1,false,true],
  ['kitchen','Kitchen — 2 Photos Required','Take at least 2 kitchen photos showing the room and visible condition.','Interior',2,false,true],
  ['bathrooms','All Bathrooms','Photograph every bathroom. Stay on this item and add as many photos as needed until every bathroom is covered.','Interior',1,false,true],
  ['living_room','Living Room','Take at least 1 clear living-room photo.','Interior',1,false,true],
  ['electrical_panels','All Electrical Panels','Photograph every electrical panel present. Stay on this item and add as many photos as needed.','Interior',1,false,true],

  ['roof_front','Roof — Front View','Take 1 roof photo from the front showing the overall roof view.','Roof',1,false,true],
  ['roof_close','Roof — Close-Up','Take 1 close-up photo of the roof covering and visible condition.','Roof',1,false,true],

  ['hazards','All Hazards — Main Dwelling / Outbuildings','Photograph every noted hazard involving the main dwelling, outbuildings, or premises. Stay on this item and add as many photos as needed. Mark Not Present when no hazards are noted.','Hazards',1,true,true],
  ['roof_hazard','Roof Hazard — 4 Photos if Present','If a roof hazard is present, take 3 close-up photos of the hazard and 1 further-back photo showing the hazard in context. Mark Not Present when there is no roof hazard.','Hazards',4,true,true]
];

const LEGACY_PHOTO_KEY_MAP = {
  pools_spas:['pool_hot_tub'],
  kitchen:['interior_kitchen'],
  bathrooms:['interior_bathrooms'],
  living_room:['interior_living'],
  roof_front:['roof'],
  hazards:['exterior_damage','interior_damage']
};


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
function savedImageCount(item){ return itemImages(item).filter(img=>img.hasPhoto || img.dataUrl).length; }
function requiredPhotoCount(item){ return Math.max(1,Number(item?.minPhotos)||1); }
function conditionValue(item){ return item && item.conditional ? (item.condition||'unknown') : 'present'; }
function isNotApplicable(item){ return !!(item && item.conditional && conditionValue(item)==='none'); }
function itemStatus(item){
  if(isNotApplicable(item)) return 'na';
  if(item.status==='missing' && !itemHasPhotos(item)) return 'missing';
  if(savedImageCount(item)>=requiredPhotoCount(item)) return 'done';
  return 'open';
}
function conditionalLabels(item){
  const labels={
    outbuildings:['Outbuildings Present','No Outbuildings'],
    pools_spas:['Pool / Spa Present','No Pool / Spa'],
    hud_label:['Manufactured Home','Not Manufactured Home'],
    hazards:['Hazards Present','No Hazards'],
    roof_hazard:['Roof Hazard Present','No Roof Hazard']
  };
  return labels[item?.key]||['Present','None / N/A'];
}
function ensureInspectionConditions(inspection){
  if(!inspection.conditions) inspection.conditions={};
  if(!['unknown','present','none'].includes(inspection.conditions.basement)) inspection.conditions.basement='unknown';
  return inspection.conditions;
}

function clearDepartureOverride(){
  if(state.current && state.current.departureOverride) state.current.departureOverride=null;
}

function legacyImageFromItem(existing,storageItemKey=null){
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
    legacyStorageKey:true,
    storageItemKey:storageItemKey||null
  };
}

function normalizeImage(img,index,storageItemKey=null){
  if(!img) return null;
  return {
    id:img.id||`legacy_${index}`,
    dataUrl:img.dataUrl||null,
    hasPhoto:!!(img.hasPhoto||img.dataUrl),
    quality:img.quality||null,
    note:img.note||'',
    departureQualityOverride:!!img.departureQualityOverride,
    createdAt:img.createdAt||new Date().toISOString(),
    legacyStorageKey:!!img.legacyStorageKey,
    storageItemKey:img.storageItemKey||storageItemKey||null
  };
}

function ensurePhotoChecklist(inspection){
  if(!inspection) return inspection;
  if(!inspection.photos) inspection.photos={};
  ensureInspectionConditions(inspection);
  const ordered={};

  photosFor(inspection.type).forEach(([key,title,help,section,minPhotos=1,conditional=false,unlimited=true])=>{
    const sourceKeys=[key,...(LEGACY_PHOTO_KEY_MAP[key]||[])];
    const sources=sourceKeys.map(sourceKey=>({sourceKey,existing:inspection.photos[sourceKey]})).filter(x=>x.existing);
    const images=[];
    const seen=new Set();
    let note='';
    let sourceStatus='open';
    let sourceCondition='unknown';

    sources.forEach(({sourceKey,existing})=>{
      if(!note && existing.note) note=existing.note;
      if(existing.status==='missing') sourceStatus='missing';
      if(existing.condition==='present'||existing.condition==='none') sourceCondition=existing.condition;
      else if(conditional && existing.status==='missing' && !itemHasPhotos(existing)) sourceCondition='none';
      let sourceImages=[];
      if(Array.isArray(existing.images)) sourceImages=existing.images.map((img,index)=>normalizeImage(img,index,sourceKey===key?null:sourceKey)).filter(Boolean);
      else{
        const legacy=legacyImageFromItem(existing,sourceKey===key?null:sourceKey);
        if(legacy) sourceImages=[legacy];
      }
      sourceImages.forEach(image=>{
        const token=`${image.storageItemKey||sourceKey}:${image.id}`;
        if(!seen.has(token)){ seen.add(token); images.push(image); }
      });
    });

    ordered[key]={
      key,
      title,
      help,
      section:section||'Exterior',
      minPhotos:Math.max(1,Number(minPhotos)||1),
      conditional:!!conditional,
      condition:conditional?(images.length?'present':sourceCondition):'present',
      unlimited:unlimited!==false,
      status:images.length>=Math.max(1,Number(minPhotos)||1)?'done':(sourceStatus||'open'),
      note,
      images
    };
  });

  // OBS keeps any legacy/custom checklist items. Residential uses the official list above exactly.
  if(inspection.type==='OBS'){
    Object.entries(inspection.photos).forEach(([key,value])=>{
      if(ordered[key]) return;
      const extra={...value};
      if(!Array.isArray(extra.images)){
        const legacy=legacyImageFromItem(extra);
        extra.images=legacy?[legacy]:[];
      }
      extra.section=extra.section||'Other';
      extra.minPhotos=Math.max(1,Number(extra.minPhotos)||1);
      extra.conditional=!!extra.conditional;
      extra.condition=extra.conditional?(extra.condition||((extra.status==='missing'&&!itemHasPhotos(extra))?'none':'unknown')):'present';
      extra.unlimited=extra.unlimited!==false;
      extra.status=itemStatus(extra);
      ordered[key]=extra;
    });
  }

  inspection.photos=ordered;
  return inspection;
}

function newInspection(type){
  state.current={
    id:uid(), type, inspectionId:'', address:'', inspector:'Chris Roberts',
    created:new Date().toISOString(), updated:new Date().toISOString(), conditions:{basement:'unknown'}, resumeTarget:{screen:'dashboardScreen',itemKey:null}, photos:{}
  };
  photosFor(type).forEach(([key,title,help,section,minPhotos=1,conditional=false,unlimited=true])=>{
    state.current.photos[key]={key,title,help,section:section||'Exterior',minPhotos:Math.max(1,Number(minPhotos)||1),conditional:!!conditional,condition:conditional?'unknown':'present',unlimited:unlimited!==false,status:'open',note:'',images:[]};
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
      const storageItemKey=image.storageItemKey||itemKey;
      const primary=store.get(photoDbKey(inspectionId,storageItemKey,image.id));
      primary.onsuccess=()=>{
        if(primary.result){ resolve(primary.result); return; }
        if(image.legacyStorageKey || image.id==='legacy'){
          const legacy=store.get(legacyPhotoDbKey(inspectionId,storageItemKey));
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
      const storageItemKey=image.storageItemKey||itemKey;
      store.delete(photoDbKey(inspectionId,storageItemKey,image.id));
      if(image.legacyStorageKey || image.id==='legacy') store.delete(legacyPhotoDbKey(inspectionId,storageItemKey));
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

function persistInspectionMetadata({render=false}={}){
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
    if(render) renderDashboard();
    return true;
  }catch(err){
    console.warn('Inspection metadata save failed.',err);
    if(render) renderDashboard();
    return false;
  }
}

function save(){ return persistInspectionMetadata({render:true}); }

function setResumeTarget(screen='dashboardScreen',itemKey=null){
  if(!state.current) return;
  state.current.resumeTarget={screen,itemKey:itemKey||null,updatedAt:new Date().toISOString()};
  persistInspectionMetadata({render:false});
}

function inspectionProgress(inspection){
  ensurePhotoChecklist(inspection);
  const items=Object.values(inspection.photos||{});
  const complete=items.filter(item=>['done','missing','na'].includes(itemStatus(item))).length;
  return {complete,total:items.length,pct:items.length?Math.round(complete/items.length*100):0};
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
  const query=($('resumeSearch')?.value||'').trim().toLowerCase();
  const all=allInspections();
  const items=all.filter(item=>{
    if(!query) return true;
    return [item.inspectionId,item.address,item.type].some(value=>String(value||'').toLowerCase().includes(query));
  });
  if(!all.length){ box.innerHTML='<p class="muted">No saved inspections yet.</p>'; return; }
  if(!items.length){ box.innerHTML='<p class="muted">No saved inspection matches that ID or address.</p>'; return; }

  items.forEach(item=>{
    const progress=inspectionProgress(item);
    const card=document.createElement('article');
    card.className='saved-inspection-card';

    const top=document.createElement('div');
    top.className='saved-inspection-top';
    const info=document.createElement('div');
    const title=document.createElement('strong');
    title.textContent=`${item.type} — ${item.inspectionId||'No ID'}`;
    const address=document.createElement('span');
    address.textContent=item.address||'No address';
    info.append(title,address);
    const badge=document.createElement('span');
    badge.className='saved-progress-badge';
    badge.textContent=`${progress.complete}/${progress.total}`;
    top.append(info,badge);

    const bar=document.createElement('div');
    bar.className='saved-progress';
    const fill=document.createElement('div');
    fill.style.width=`${progress.pct}%`;
    bar.appendChild(fill);

    const meta=document.createElement('small');
    meta.className='saved-inspection-meta';
    meta.textContent=`${progress.pct}% complete · Last saved ${new Date(item.updated).toLocaleString()}`;

    const resume=document.createElement('button');
    resume.className='primary resume-inspection-btn';
    resume.textContent='Resume Inspection';
    resume.onclick=()=>resumeInspection(item);

    card.append(top,bar,meta,resume);
    box.appendChild(card);
  });
}

async function resumeInspection(item){
  state.current=item;
  ensurePhotoChecklist(state.current);
  await hydrateInspectionPhotos(state.current);
  renderDashboard();
  const target=state.current.resumeTarget||{};
  if(target.screen==='cameraScreen' && target.itemKey && state.current.photos[target.itemKey]){
    openPhoto(target.itemKey,false,null);
    const resumeNote=$('qualityBox');
    if(resumeNote){
      resumeNote.className='quality good';
      resumeNote.innerHTML='<strong>Inspection resumed</strong><p>You are back on the checklist item where you stopped. Take another photo or move to the next item when ready.</p>';
      resumeNote.classList.remove('hidden');
    }
    return;
  }
  show('dashboardScreen');
  if(target.itemKey){
    requestAnimationFrame(()=>{
      const el=document.querySelector(`[data-photo-key="${CSS.escape(target.itemKey)}"]`);
      if(el){ el.classList.add('resume-highlight'); el.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>el.classList.remove('resume-highlight'),1800); }
    });
  }
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
  const complete=items.filter(item=>['done','missing','na'].includes(itemStatus(item))).length;
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
    const min=requiredPhotoCount(item);
    const wrapper=document.createElement('section');
    wrapper.className=`photo-item ${statusValue}`;
    wrapper.dataset.photoKey=item.key;

    const row=document.createElement('div');
    row.className=`photo-row ${statusValue}`;
    const status=document.createElement('div');
    status.className='status';
    status.textContent=statusValue==='done'?String(count):statusValue==='na'?'N/A':statusValue==='missing'?'!':count?`${count}/${min}`:'•';

    const info=document.createElement('div');
    info.className='info';
    const title=document.createElement('strong');
    title.textContent=item.title;
    const help=document.createElement('small');
    if(statusValue==='done') help.textContent=`${count} ${count===1?'photo':'photos'} saved — minimum requirement met; unlimited additional photos allowed`;
    else if(statusValue==='na') help.textContent=`Not applicable — ${conditionalLabels(item)[1]} selected.`;
    else if(statusValue==='missing') help.textContent='Marked cannot obtain';
    else if(count>0 && min>1) help.textContent=`${count} of ${min} required photos saved — ${min-count} more needed. Unlimited additional photos allowed. ${item.help}`;
    else if(item.conditional && conditionValue(item)==='unknown') help.textContent=`Choose whether this item is present. ${item.help}`;
    else help.textContent=`${item.help} Unlimited photos allowed.`;
    info.append(title,help);

    const addBtn=document.createElement('button');
    addBtn.className=statusValue==='done'?'add-photo-btn':'secondary';
    addBtn.textContent=count?'+ Add Another Photo':'Take Photo';
    addBtn.disabled=isNotApplicable(item)||(item.conditional&&conditionValue(item)==='unknown');
    if(addBtn.disabled) addBtn.classList.add('disabled-photo-btn');
    addBtn.onclick=()=>openPhoto(item.key,true,null);

    row.append(status,info,addBtn);
    wrapper.appendChild(row);

    if(item.conditional){
      const controls=document.createElement('div');
      controls.className='smart-condition-controls';
      const labels=conditionalLabels(item);
      const presentBtn=document.createElement('button');
      presentBtn.type='button';
      presentBtn.className=`condition-choice ${conditionValue(item)==='present'?'selected present':''}`;
      presentBtn.textContent=`✓ ${labels[0]}`;
      presentBtn.onclick=()=>setItemCondition(item.key,'present');
      const noneBtn=document.createElement('button');
      noneBtn.type='button';
      noneBtn.className=`condition-choice ${conditionValue(item)==='none'?'selected none':''}`;
      noneBtn.textContent=`✕ ${labels[1]}`;
      noneBtn.onclick=()=>setItemCondition(item.key,'none');
      controls.append(presentBtn,noneBtn);
      wrapper.appendChild(controls);
    }

    if(item.key==='levels'){
      const basement=document.createElement('div');
      basement.className='smart-condition-controls basement-condition';
      const basementValue=ensureInspectionConditions(c).basement;
      const basementPresent=document.createElement('button');
      basementPresent.type='button';
      basementPresent.className=`condition-choice ${basementValue==='present'?'selected present':''}`;
      basementPresent.textContent='✓ Basement Present';
      basementPresent.onclick=()=>setBasementCondition('present');
      const noBasement=document.createElement('button');
      noBasement.type='button';
      noBasement.className=`condition-choice ${basementValue==='none'?'selected none':''}`;
      noBasement.textContent='✕ No Basement';
      noBasement.onclick=()=>setBasementCondition('none');
      basement.append(basementPresent,noBasement);
      wrapper.appendChild(basement);
    }

    list.appendChild(wrapper);
  });

  renderTakenPhotosGallery(c,items);
}

function setItemCondition(itemKey,value){
  if(!state.current||!state.current.photos[itemKey]) return;
  const item=state.current.photos[itemKey];
  if(!item.conditional||!['present','none'].includes(value)) return;
  item.condition=value;
  if(value==='none'){
    item.status='open';
    item.note=conditionalLabels(item)[1];
  }else{
    if(item.status==='missing') item.status='open';
    if(item.note===conditionalLabels(item)[1]) item.note='';
  }
  clearDepartureOverride();
  save();
  renderDashboard();
}

function setBasementCondition(value){
  if(!state.current||!['present','none'].includes(value)) return;
  ensureInspectionConditions(state.current).basement=value;
  clearDepartureOverride();
  save();
  renderDashboard();
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
  return Object.values(state.current.photos).find(item=>itemStatus(item)==='open' && (!item.conditional || conditionValue(item)==='present'));
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
  const min=requiredPhotoCount(item);
  $('photoTitle').textContent=existing?`${item.title} — Photo ${itemImages(item).findIndex(img=>img.id===imageId)+1}`:`${item.title} — Add Photo`;
  $('photoHelp').textContent=count?`${item.help} You currently have ${count} ${count===1?'photo':'photos'} saved for this item. Unlimited additional photos are allowed.`:`${item.help} Unlimited photos are allowed for this item.`;
  $('photoNote').value=existing?.note||'';
  $('cameraInput').value='';
  $('previewImg').classList.add('hidden');
  $('qualityBox').className='quality hidden';
  $('okPhotoBtn').textContent='OK / Save Photo';
  $('okPhotoBtn').disabled=!state.pendingDataUrl;
  $('takePhotoBtn').textContent=existing?'📷 Retake This Photo':count?`📷 Take Another ${item.title} Photo`:'📷 Take Photo';
  $('nextChecklistBtn').textContent=count<min?`Next Checklist Item (${count}/${min} saved) →`:`Done With ${item.title} — Next →`;
  $('cameraHint').classList.toggle('hidden',!!existing);
  $('markMissingBtn').textContent=count&&!existing?'Cancel Add Photo':item.conditional?conditionalLabels(item)[1]:'Cannot Get Photo';

  if(state.pendingDataUrl){
    $('previewImg').src=state.pendingDataUrl;
    $('previewImg').classList.remove('hidden');
    runQuality(state.pendingDataUrl,{autoSave:false});
  }
  setResumeTarget('cameraScreen',itemKey);
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
  if(!isNew && (image.storageItemKey || image.legacyStorageKey)) await removeStoredPhoto(state.current.id,itemKey,image);
  image.dataUrl=state.pendingDataUrl;
  image.hasPhoto=true;
  image.quality=state.pendingQuality;
  image.note=$('photoNote').value.trim();
  image.departureQualityOverride=false;
  image.legacyStorageKey=false;
  image.storageItemKey=null;
  item.status=savedImageCount(item)>=requiredPhotoCount(item)?'done':'open';
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
  const min=requiredPhotoCount(item);
  const box=$('qualityBox');
  box.className=count>=min?'quality good':'quality warn';
  const requirement=count>=min?'Requirement met.':`${count} of ${min} required photos saved — ${min-count} more needed.`;
  box.innerHTML=`<strong>✓ ${count===1?'Photo':'Photos'} saved for ${item.title}</strong><p>${requirement} Tap Take Photo for another ${item.title} picture, or tap Next Checklist Item when you are ready to move on.</p>`;
  box.classList.remove('hidden');
  $('takePhotoBtn').textContent=`📷 Take Another ${item.title} Photo`;
  $('nextChecklistBtn').textContent=count<min?`Next Checklist Item (${count}/${min} saved) →`:`Done With ${item.title} — Next →`;
  $('nextChecklistBtn').classList.remove('hidden');
}

function nextOpenAfter(itemKey){
  const items=Object.values(state.current?.photos||{});
  const currentIndex=items.findIndex(item=>item.key===itemKey);
  for(let i=currentIndex+1;i<items.length;i++){
    if(itemStatus(items[i])==='open' && (!items[i].conditional || conditionValue(items[i])==='present')) return items[i];
  }
  for(let i=0;i<currentIndex;i++){
    if(itemStatus(items[i])==='open' && (!items[i].conditional || conditionValue(items[i])==='present')) return items[i];
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
    setResumeTarget('dashboardScreen',currentKey);
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
  const notApplicable=items.filter(item=>itemStatus(item)==='na');
  const basementUnknown=state.current.type==='Residential' && ensureInspectionConditions(state.current).basement==='unknown';
  const questionable=[];
  let passedPhotos=0;
  flattenSavedImages(items).forEach(({item,image,index})=>{
    if(image.departureQualityOverride || (image.quality && typeof image.quality==='object' && image.quality.pass===true)) passedPhotos++;
    else questionable.push({item,image,index});
  });
  return {items,open,marked,notApplicable,basementUnknown,questionable,passedPhotos};
}

async function markMissingFromDeparture(itemKey){
  const item=state.current && state.current.photos[itemKey];
  if(!item || itemHasPhotos(item)) return;
  if(item.conditional){
    item.condition='none';
    item.status='open';
    item.note=conditionalLabels(item)[1];
  }else{
    item.note=item.note||'Photo could not be obtained.';
    item.status='missing';
  }
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
  const {open,questionable,basementUnknown}=getDepartureGroups();
  state.current.departureOverride={
    savedAt:new Date().toISOString(),
    unresolved:[...open.map(item=>item.key),...(basementUnknown?['condition:basement']:[]),...questionable.map(q=>`${q.item.key}:${q.image.id}`)]
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
  const {items,open,marked,notApplicable,basementUnknown,questionable,passedPhotos}=getDepartureGroups();
  const box=$('reviewResults');
  box.innerHTML='';

  const summary=document.createElement('div');
  summary.className=`departure-summary ${open.length||basementUnknown||questionable.length?'needs-attention':'passed'}`;
  const title=document.createElement('strong');
  title.textContent=open.length||basementUnknown||questionable.length?'⚠ Departure check needs attention':'✓ Departure check passed';
  const detail=document.createElement('p');
  detail.textContent=`${passedPhotos} photos passed · ${open.length + (basementUnknown?1:0)} checklist choices/items missing · ${questionable.length} questionable photos · ${marked.length} cannot obtain · ${notApplicable.length} not applicable`;
  summary.append(title,detail);
  box.appendChild(summary);

  if(!open.length && !basementUnknown && !questionable.length){
    const good=document.createElement('div');
    good.className='departure-all-clear';
    good.innerHTML='<strong>Everything is accounted for.</strong><p>Every checklist item has a saved photo, a cannot-obtain mark, or a smart Not Applicable choice, and no unresolved quality warnings remain.</p>';
    box.appendChild(good);
  }

  if(basementUnknown){
    const h=document.createElement('h3');
    h.textContent='Property Detail Needed';
    box.appendChild(h);
    const card=document.createElement('article');
    card.className='departure-issue missing-issue';
    const label=document.createElement('strong');
    label.textContent='Interior: Basement';
    const note=document.createElement('p');
    note.textContent='Choose whether the property has a basement so the inspection record is complete.';
    const actions=document.createElement('div');
    actions.className='departure-actions';
    actions.append(
      makeDepartureAction('✓ Basement Present','primary',()=>{setBasementCondition('present'); departureCheck();}),
      makeDepartureAction('✕ No Basement','warning',()=>{setBasementCondition('none'); departureCheck();})
    );
    card.append(label,note,actions);
    box.appendChild(card);
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
      const count=savedImageCount(item);
      const min=requiredPhotoCount(item);
      note.textContent=item.conditional&&conditionValue(item)==='unknown'?'Choose whether this item is present or not applicable.':count?`${count} of ${min} required photos saved. ${min-count} more needed.`:'No completed photo is saved for this checklist item.';
      const actions=document.createElement('div');
      actions.className='departure-actions';
      actions.append(
        makeDepartureAction(count?'📷 Add Photo':'📷 Take Photo','primary',()=>{ if(item.conditional&&conditionValue(item)==='unknown') setItemCondition(item.key,'present'); openPhoto(item.key,true,null); }),
        makeDepartureAction(item.conditional?conditionalLabels(item)[1]:'Cannot Obtain','warning',()=>markMissingFromDeparture(item.key))
      );
      card.append(label,note,actions);
      box.appendChild(card);
    });
  }

  if(notApplicable.length){
    const h=document.createElement('h3');
    h.textContent='Not Applicable / Not Present';
    box.appendChild(h);
    notApplicable.forEach(item=>{
      const card=document.createElement('article');
      card.className='departure-issue na-issue';
      const label=document.createElement('strong');
      label.textContent=`${item.section}: ${item.title}`;
      const note=document.createElement('p');
      note.textContent=conditionalLabels(item)[1];
      const actions=document.createElement('div');
      actions.className='departure-actions';
      actions.append(makeDepartureAction('Change to Present','secondary',()=>{setItemCondition(item.key,'present'); departureCheck();}));
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
  if(open.length||basementUnknown||questionable.length){
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
      condition:item.conditional?conditionValue(item):null,
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
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{
  const target=b.dataset.screen;
  if(state.current && (target==='dashboardScreen'||target==='menuScreen')){
    setResumeTarget('dashboardScreen',state.pendingPhoto?.itemKey||state.current.resumeTarget?.itemKey||null);
  }
  show(target);
});
$('startBtn').onclick=()=>{
  const c=state.current;
  c.inspectionId=$('inspectionId').value.trim();
  c.address=$('address').value.trim();
  c.inspector=$('inspector').value.trim()||'Chris Roberts';
  c.resumeTarget={screen:'dashboardScreen',itemKey:null,updatedAt:new Date().toISOString()};
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
  if(item.conditional){
    item.condition='none';
    item.note=$('photoNote').value.trim()||conditionalLabels(item)[1];
    item.status='open';
  }else{
    item.note=$('photoNote').value.trim()||'Photo could not be obtained.';
    item.status='missing';
  }
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
  navigator.serviceWorker.register('sw.js?v=2.1.0-build-016',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
$('resumeSearch')?.addEventListener('input',renderSaved);
renderSaved();
