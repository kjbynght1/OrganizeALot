const OBS_PHOTOS = [
  ['front','Front','Full front of property. Include roofline if possible.'],
  ['front_angle','Front Angle','Corner angle showing front and one side.'],
  ['left','Left Side','Left elevation from front looking back.'],
  ['rear','Rear','Full rear elevation.'],
  ['right','Right Side','Right elevation from rear/front as accessible.'],
  ['roof','Roof','Best visible roof view without unsafe positioning.'],
  ['address','Address','House number, mailbox, curb, or sign.'],
  ['outbuildings','Outbuildings','Detached garage, shed, barn, pole barn if present. Optional if none.'],
  ['damage','Damage / Hazards','Any visible damage, hazards, or concerns. Optional if none.']
];
const STANDARD_PHOTOS = [
  ['front','Front','Exterior front photo.'],
  ['left','Left Side','Exterior left side.'],
  ['rear','Rear','Exterior rear.'],
  ['right','Right Side','Exterior right side.'],
  ['roof','Roof Overview','Full roof overview from the safest available angle.'],
  ['roof_close','Close Roof Photo','Close-up of shingles/roof covering, flashing, and visible condition.'],
  ['outbuildings','Outbuildings','Detached garage, shed, barn, pole barn, or other outbuilding if present.'],
  ['pool_hot_tub','Hot Tub / Swimming Pool','Swimming pool, hot tub, spa, or related feature if present.'],
  ['trampolines','Trampolines','Any trampoline or similar recreational equipment if present.'],
  ['interior','Interior','Interior photos as required.']
];
const state = { current:null, pendingPhoto:null, deferredInstall:null, qualityRunId:0 };
const PHOTO_DB='organizealot-photos-v1';
const PHOTO_STORE='photos';
const $ = id => document.getElementById(id);
const screens = ['menuScreen','setupScreen','dashboardScreen','cameraScreen','reviewScreen'];
function show(id){ screens.forEach(s=>$(s).classList.toggle('active',s===id)); if(id==='menuScreen') renderSaved(); window.scrollTo(0,0); }
function uid(){ return 'insp_'+Date.now(); }
function photosFor(type){ return type==='OBS'?OBS_PHOTOS:STANDARD_PHOTOS; }
function ensurePhotoChecklist(inspection){
  if(!inspection) return inspection;
  if(!inspection.photos) inspection.photos={};
  const ordered={};
  photosFor(inspection.type).forEach(([key,title,help])=>{
    const existing=inspection.photos[key]||{};
    ordered[key]={
      key,
      title,
      help,
      status:existing.status||'open',
      dataUrl:existing.dataUrl||null,
      note:existing.note||'',
      quality:existing.quality||null,
      hasPhoto:existing.hasPhoto||false
    };
  });
  Object.entries(inspection.photos).forEach(([key,value])=>{
    if(!ordered[key]) ordered[key]=value;
  });
  inspection.photos=ordered;
  return inspection;
}
function clearDepartureOverride(){
  if(state.current && state.current.departureOverride) state.current.departureOverride=null;
}
function newInspection(type){
  state.current = { id:uid(), type, inspectionId:'', address:'', inspector:'Chris Roberts', created:new Date().toISOString(), updated:new Date().toISOString(), photos:{} };
  photosFor(type).forEach(([key,title,help])=> state.current.photos[key]={key,title,help,status:'open',dataUrl:null,note:'',quality:null});
}
function openPhotoDb(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(PHOTO_DB,1);
   req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE); };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||new Error('Photo database could not open.'));
 });
}
function photoDbKey(inspectionId,key){ return `${inspectionId}::${key}`; }
async function storePhoto(inspectionId,key,dataUrl){
 try{
   const db=await openPhotoDb();
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(PHOTO_STORE,'readwrite');
     tx.objectStore(PHOTO_STORE).put(dataUrl,photoDbKey(inspectionId,key));
     tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
   });
   db.close();
   return true;
 }catch(err){ console.warn('Photo storage failed.',err); return false; }
}
async function getStoredPhoto(inspectionId,key){
 try{
   const db=await openPhotoDb();
   const value=await new Promise((resolve,reject)=>{
     const tx=db.transaction(PHOTO_STORE,'readonly');
     const req=tx.objectStore(PHOTO_STORE).get(photoDbKey(inspectionId,key));
     req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
   });
   db.close();
   return value;
 }catch(err){ console.warn('Photo read failed.',err); return null; }
}
async function removeStoredPhoto(inspectionId,key){
 try{
   const db=await openPhotoDb();
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(PHOTO_STORE,'readwrite');
     tx.objectStore(PHOTO_STORE).delete(photoDbKey(inspectionId,key));
     tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
   });
   db.close();
 }catch(err){ console.warn('Photo delete failed.',err); }
}
async function hydrateInspectionPhotos(inspection){
 if(!inspection) return;
 ensurePhotoChecklist(inspection);
 await Promise.all(Object.values(inspection.photos).map(async p=>{
   if(p.dataUrl) return;
   if(p.hasPhoto || p.status==='done') p.dataUrl=await getStoredPhoto(inspection.id,p.key);
 }));
}
function save(){
 if(!state.current) return false;
 state.current.updated=new Date().toISOString();
 try{
   const metadata=JSON.parse(JSON.stringify(state.current));
   Object.values(metadata.photos||{}).forEach(p=>{
     if(p.dataUrl){ p.hasPhoto=true; p.dataUrl=null; }
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
function allInspections(){ return Object.keys(localStorage).filter(k=>k.startsWith('insp_')).map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>new Date(b.updated)-new Date(a.updated)); }
function renderSaved(){
 const box=$('savedList'); box.innerHTML=''; const items=allInspections();
 if(!items.length){ box.innerHTML='<p class="muted">No saved inspections yet.</p>'; return; }
 items.forEach(item=>{ const b=document.createElement('button'); b.className='saved-item'; b.innerHTML=`<strong>${item.type} — ${item.inspectionId||'No ID'}</strong><br><small>${item.address||'No address'} · ${new Date(item.updated).toLocaleString()}</small>`; b.onclick=async()=>{state.current=item; await hydrateInspectionPhotos(state.current); renderDashboard(); show('dashboardScreen');}; box.appendChild(b); });
}
function renderDashboard(){
 const c=state.current; if(!c) return;
 ensurePhotoChecklist(c);
 $('dashTitle').textContent=`${c.type} Inspection`;
 $('dashMeta').textContent=`${c.inspectionId||'No ID'} • ${c.address||'No address'} • ${c.inspector||'Inspector not set'}`;
 $('obsNotice').classList.toggle('hidden', c.type!=='OBS');
 const list=$('photoList'); list.innerHTML='';
 const photos=Object.values(c.photos);
 const complete=photos.filter(p=>p.status==='done'||p.status==='missing').length;
 $('progressText').textContent=`${complete}/${photos.length} complete`;
 $('readyText').textContent=complete===photos.length?'Ready to export':c.departureOverride?'Saved with override':'Not ready';
 $('progressBar').style.width=`${Math.round(complete/photos.length*100)}%`;

 photos.forEach(p=>{
   const item=document.createElement('section');
   item.className=`photo-item ${p.status==='done'?'done':p.status==='missing'?'missing':''}`;
   item.dataset.photoKey=p.key;

   const row=document.createElement('div');
   row.className=`photo-row ${p.status==='done'?'done':p.status==='missing'?'missing':''}`;
   const status=document.createElement('div');
   status.className='status';
   status.textContent=p.status==='done'?'✓':p.status==='missing'?'!':'•';
   const info=document.createElement('div');
   info.className='info';
   const title=document.createElement('strong'); title.textContent=p.title;
   const help=document.createElement('small');
   help.textContent=p.status==='done'?'Saved — shown in Photos Taken below':p.status==='missing'?'Marked unobtainable':p.help;
   info.append(title,help);
   const openBtn=document.createElement('button');
   openBtn.className='secondary';
   openBtn.textContent=p.status==='done'?'View':'Take Photo';
   openBtn.onclick=()=>openPhoto(p.key,p.status!=='done');
   row.append(status,info,openBtn);
   item.appendChild(row);

   list.appendChild(item);
 });

 renderTakenPhotosGallery(c, photos);
}

function renderTakenPhotosGallery(inspection, photos){
 const gallery=$('takenPhotosGallery');
 const count=$('takenPhotosCount');
 if(!gallery || !count) return;
 gallery.innerHTML='';
 const saved=photos.filter(p=>p.status==='done' && (p.dataUrl || p.hasPhoto));
 count.textContent=`${saved.length} ${saved.length===1?'photo':'photos'}`;

 if(!saved.length){
   const empty=document.createElement('p');
   empty.className='taken-photos-empty';
   empty.textContent='No pictures taken yet. Your saved pictures will appear here automatically.';
   gallery.appendChild(empty);
   return;
 }

 saved.forEach((p,index)=>{
   const card=document.createElement('article');
   card.className='taken-photo-card';

   const heading=document.createElement('div');
   heading.className='taken-photo-card-heading';
   const number=document.createElement('span');
   number.className='taken-photo-number';
   number.textContent=String(index+1);
   const title=document.createElement('strong');
   title.textContent=p.title;
   heading.append(number,title);
   card.appendChild(heading);

   if(p.dataUrl){
     const imgBtn=document.createElement('button');
     imgBtn.type='button';
     imgBtn.className='taken-photo-image-button';
     imgBtn.setAttribute('aria-label',`View ${p.title} photo`);
     const img=document.createElement('img');
     img.src=p.dataUrl;
     img.alt=`${p.title} photo`;
     img.loading='eager';
     imgBtn.appendChild(img);
     imgBtn.onclick=()=>openPhoto(p.key,false);
     card.appendChild(imgBtn);
   }else{
     const loading=document.createElement('div');
     loading.className='photo-loading';
     loading.textContent='Loading saved picture…';
     card.appendChild(loading);
     getStoredPhoto(inspection.id,p.key).then(dataUrl=>{
       if(dataUrl && state.current && state.current.id===inspection.id){
         p.dataUrl=dataUrl;
         renderDashboard();
       }
     });
   }

   const del=document.createElement('button');
   del.type='button';
   del.className='delete-photo-btn';
   del.textContent='🗑 Delete Photo';
   del.onclick=()=>deletePhoto(p.key);
   card.appendChild(del);
   gallery.appendChild(card);
 });
}
async function deletePhoto(key){
 if(!state.current || !state.current.photos[key]) return;
 const inspectionId=state.current.id;
 const p=state.current.photos[key];
 p.dataUrl=null;
 p.hasPhoto=false;
 p.status='open';
 p.quality=null;
 clearDepartureOverride();
 await removeStoredPhoto(inspectionId,key);
 save();
 renderDashboard();
}
function firstOpen(){ return Object.values(state.current.photos).find(p=>p.status==='open'); }
function launchCamera(){
  const input=$('cameraInput');
  input.value='';
  input.click();
}
function openPhoto(key, autoLaunch=false){
  state.pendingPhoto=key;
  const p=state.current.photos[key];
  $('photoTitle').textContent=p.title;
  $('photoHelp').textContent=p.help;
  $('photoNote').value=p.note||'';
  $('cameraInput').value='';
  $('previewImg').classList.add('hidden');
  $('qualityBox').className='quality hidden';
  $('okPhotoBtn').disabled=!p.dataUrl;
  $('takePhotoBtn').textContent=p.dataUrl?'📷 Take New Photo':'📷 Take Photo';
  $('cameraHint').classList.toggle('hidden',!!p.dataUrl);
  if(p.dataUrl){
    $('previewImg').src=p.dataUrl;
    $('previewImg').classList.remove('hidden');
    runQuality(p.dataUrl);
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
       const maxW=320, maxH=240;
       const scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);
       const width=Math.max(40,Math.round(img.naturalWidth*scale));
       const height=Math.max(40,Math.round(img.naturalHeight*scale));
       const canvas=document.createElement('canvas');
       canvas.width=width; canvas.height=height;
       const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
       ctx.drawImage(img,0,0,width,height);
       const rgba=ctx.getImageData(0,0,width,height).data;
       const gray=new Float32Array(width*height);
       let sum=0, sumSq=0, dark=0, bright=0;
       for(let i=0,p=0;i<rgba.length;i+=4,p++){
         const y=0.299*rgba[i]+0.587*rgba[i+1]+0.114*rgba[i+2];
         gray[p]=y; sum+=y; sumSq+=y*y;
         if(y<35) dark++;
         if(y>245) bright++;
       }
       const pixels=gray.length;
       const average=sum/pixels;
       const contrast=Math.sqrt(Math.max(0,sumSq/pixels-average*average));
       let lapSum=0, lapSq=0, lapCount=0;
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
       if(average<42 || darkPct>62) failures.push('photo is too dark');
       if(average>225 || brightPct>42) failures.push('photo is overexposed');
       if(contrast<13) failures.push('photo has very low contrast');
       if(sharpness<55) failures.push('photo appears blurry');

       resolve({
         pass: failures.length===0,
         failures,
         mp,
         average,
         contrast,
         sharpness,
         darkPct,
         brightPct,
         orientation: img.naturalWidth>=img.naturalHeight?'landscape':'portrait'
       });
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
 const key=state.pendingPhoto;
 const box=$('qualityBox');
 box.className='quality';
 box.innerHTML='<strong>Automatic quality check</strong><p>Checking blur, lighting, overexposure, contrast, and resolution…</p>';
 box.classList.remove('hidden');
 try{
   const result=await analyzeImageQuality(dataUrl);
   if(runId!==state.qualityRunId || key!==state.pendingPhoto) return result;
   const p=state.current && state.current.photos[key];
   if(!p) return result;
   p.quality={
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
       p.note=$('photoNote').value.trim();
       p.status='done';
       p.hasPhoto=true;
       save();
       setTimeout(()=>{
         if(runId===state.qualityRunId && key===state.pendingPhoto) nextAfterSave();
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
   if(runId!==state.qualityRunId || key!==state.pendingPhoto) return null;
   box.className='quality warn';
   box.innerHTML='<strong>Quality check unavailable</strong><p>I could not automatically check this photo. Review it and save manually or retake it.</p>';
   $('okPhotoBtn').textContent='Save Photo';
   $('okPhotoBtn').disabled=false;
   return null;
 }
}
function readFile(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
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
   const dataUrl=await optimizePhoto(file);
   const p=state.current.photos[state.pendingPhoto];
   p.dataUrl=dataUrl;
   p.hasPhoto=true;
   p.status='preview';
   clearDepartureOverride();
   await storePhoto(state.current.id,state.pendingPhoto,dataUrl);
   $('previewImg').src=dataUrl;
   $('previewImg').classList.remove('hidden');
   result=await runQuality(dataUrl,{autoSave:true});
 }catch(err){
   console.error(err);
   alert('The photo could not be processed. Please retake it.');
 }finally{
   if(!result || !result.pass){
     const p=state.current && state.pendingPhoto ? state.current.photos[state.pendingPhoto] : null;
     if(btn.textContent==='Processing photo…') btn.textContent='Save Photo';
     btn.disabled=!(p && p.dataUrl);
   }
 }
}
function nextAfterSave(){
 const n=firstOpen();
 if(n){
   openPhoto(n.key,true);
 } else {
   save();
   renderDashboard();
   show('dashboardScreen');
 }
}
function qualityIssueText(p){
 if(!p.quality || typeof p.quality!=='object') return 'No automatic quality result is saved for this photo.';
 if(p.quality.pass===false) return p.quality.details || 'The automatic quality check flagged this photo.';
 return 'Photo quality looks acceptable.';
}
function getDepartureGroups(){
 const photos=Object.values(state.current.photos||{});
 const open=photos.filter(p=>p.status==='open' || p.status==='preview' || (p.status==='done' && !(p.dataUrl||p.hasPhoto)));
 const marked=photos.filter(p=>p.status==='missing');
 const questionable=photos.filter(p=>p.status==='done' && (p.dataUrl||p.hasPhoto) && !p.departureQualityOverride && (!p.quality || typeof p.quality!=='object' || p.quality.pass!==true));
 const passed=photos.filter(p=>p.status==='done' && (p.dataUrl||p.hasPhoto) && (p.departureQualityOverride || (p.quality && typeof p.quality==='object' && p.quality.pass===true)));
 return {photos,open,marked,questionable,passed};
}
async function markMissingFromDeparture(key){
 const p=state.current && state.current.photos[key];
 if(!p) return;
 p.note=p.note||'Photo could not be obtained or item was not present.';
 p.status='missing';
 p.dataUrl=null;
 p.hasPhoto=false;
 p.departureQualityOverride=false;
 clearDepartureOverride();
 await removeStoredPhoto(state.current.id,key);
 save();
 departureCheck();
}
function acceptQualityFromDeparture(key){
 const p=state.current && state.current.photos[key];
 if(!p) return;
 p.departureQualityOverride=true;
 clearDepartureOverride();
 save();
 departureCheck();
}
function saveDepartureAnyway(){
 const {open,questionable}=getDepartureGroups();
 state.current.departureOverride={
   savedAt:new Date().toISOString(),
   unresolved:[...open.map(p=>p.key),...questionable.map(p=>p.key)]
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
 const {photos,open,marked,questionable,passed}=getDepartureGroups();
 const box=$('reviewResults');
 box.innerHTML='';

 const summary=document.createElement('div');
 summary.className=`departure-summary ${open.length||questionable.length?'needs-attention':'passed'}`;
 const title=document.createElement('strong');
 title.textContent=open.length||questionable.length?'⚠ Departure check needs attention':'✓ Departure check passed';
 const detail=document.createElement('p');
 detail.textContent=`${passed.length} passed · ${open.length} missing · ${questionable.length} questionable · ${marked.length} marked cannot obtain`;
 summary.append(title,detail);
 box.appendChild(summary);

 if(!open.length && !questionable.length){
   const good=document.createElement('div');
   good.className='departure-all-clear';
   good.innerHTML='<strong>Everything is accounted for.</strong><p>You have a saved photo or a cannot-obtain mark for every checklist item, and no unresolved quality warnings remain.</p>';
   box.appendChild(good);
 }

 if(open.length){
   const h=document.createElement('h3'); h.textContent='Missing Photos'; box.appendChild(h);
   open.forEach(p=>{
     const card=document.createElement('article'); card.className='departure-issue missing-issue';
     const label=document.createElement('strong'); label.textContent=p.title;
     const note=document.createElement('p'); note.textContent='No completed photo is saved for this checklist item.';
     const actions=document.createElement('div'); actions.className='departure-actions';
     actions.append(
       makeDepartureAction('📷 Retake','primary',()=>openPhoto(p.key,true)),
       makeDepartureAction('Cannot Obtain','warning',()=>markMissingFromDeparture(p.key))
     );
     card.append(label,note,actions); box.appendChild(card);
   });
 }

 if(questionable.length){
   const h=document.createElement('h3'); h.textContent='Questionable Photo Quality'; box.appendChild(h);
   questionable.forEach(p=>{
     const card=document.createElement('article'); card.className='departure-issue quality-issue';
     const label=document.createElement('strong'); label.textContent=p.title;
     const note=document.createElement('p'); note.textContent=qualityIssueText(p);
     const actions=document.createElement('div'); actions.className='departure-actions';
     actions.append(
       makeDepartureAction('📷 Retake','primary',()=>openPhoto(p.key,true)),
       makeDepartureAction('Save Anyway','secondary',()=>acceptQualityFromDeparture(p.key))
     );
     card.append(label,note,actions); box.appendChild(card);
   });
 }

 if(marked.length){
   const h=document.createElement('h3'); h.textContent='Marked Cannot Obtain'; box.appendChild(h);
   marked.forEach(p=>{
     const card=document.createElement('article'); card.className='departure-issue marked-issue';
     const label=document.createElement('strong'); label.textContent=p.title;
     const note=document.createElement('p'); note.textContent=p.note||'Marked cannot obtain.';
     const actions=document.createElement('div'); actions.className='departure-actions';
     actions.append(makeDepartureAction('📷 Try Again','secondary',()=>openPhoto(p.key,true)));
     card.append(label,note,actions); box.appendChild(card);
   });
 }

 const footer=document.createElement('div'); footer.className='departure-footer';
 if(open.length||questionable.length){
   const saveAnyway=makeDepartureAction('Save Inspection Anyway','departure-save-anyway',saveDepartureAnyway);
   footer.appendChild(saveAnyway);
   const caution=document.createElement('p');
   caution.className='muted';
   caution.textContent='Use Save Inspection Anyway only when you have reviewed the remaining issues and intentionally want to leave them unresolved.';
   footer.appendChild(caution);
 }else{
   const done=makeDepartureAction('✓ Done — Return to Inspection','primary',()=>show('dashboardScreen'));
   footer.appendChild(done);
 }
 box.appendChild(footer);
 show('reviewScreen');
}
function exportReport(){
 save(); const c=state.current; const photos=Object.values(c.photos); const report={...c, exported:new Date().toISOString(), photoSummary:photos.map(p=>({title:p.title,status:p.status,note:p.note,quality:p.quality,hasPhoto:!!p.dataUrl}))};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`OrganizeALot_${c.type}_${c.inspectionId||c.id}.json`; a.click(); URL.revokeObjectURL(a.href);
}
document.querySelectorAll('.tile').forEach(b=>b.onclick=()=>{newInspection(b.dataset.type); $('setupTitle').textContent=`New ${b.dataset.type} Inspection`; $('inspectionId').value=''; $('address').value=''; $('inspector').value='Chris Roberts'; show('setupScreen');});
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>show(b.dataset.screen));
$('startBtn').onclick=()=>{ const c=state.current; c.inspectionId=$('inspectionId').value.trim(); c.address=$('address').value.trim(); c.inspector=$('inspector').value.trim()||'Chris Roberts'; save(); renderDashboard(); show('dashboardScreen'); };
$('openMapBtn').onclick=()=>{ const q=encodeURIComponent($('address').value.trim()); if(q) window.open(`https://www.google.com/maps/search/?api=1&query=${q}`,'_blank'); };
$('takeNextBtn').onclick=()=>{ const p=firstOpen(); if(p) openPhoto(p.key,true); else departureCheck(); };
$('cameraInput').addEventListener('change', onCamera);
$('takePhotoBtn').onclick=launchCamera;
$('okPhotoBtn').onclick=()=>{
 if(!state.current || !state.pendingPhoto) return;
 const p=state.current.photos[state.pendingPhoto];
 if(!p || !p.dataUrl) return;
 p.note=$('photoNote').value.trim();
 p.status='done';
 p.hasPhoto=true;
 p.departureQualityOverride=false;
 clearDepartureOverride();
 save();
 nextAfterSave();
};
$('retakeBtn').onclick=launchCamera;
$('markMissingBtn').onclick=async()=>{ const key=state.pendingPhoto; const p=state.current.photos[key]; p.note=$('photoNote').value.trim()||'Photo could not be obtained.'; p.status='missing'; p.dataUrl=null; p.hasPhoto=false; p.departureQualityOverride=false; clearDepartureOverride(); await removeStoredPhoto(state.current.id,key); save(); nextAfterSave(); };
$('saveBtn').onclick=save; $('departureBtn').onclick=departureCheck; $('exportBtn').onclick=exportReport;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); state.deferredInstall=e; $('installBtn').classList.remove('hidden');});
$('installBtn').onclick=async()=>{ if(state.deferredInstall){ state.deferredInstall.prompt(); state.deferredInstall=null; $('installBtn').classList.add('hidden'); }};
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=2.1.0-build-010',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
renderSaved();
