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
  ['front','Front','Exterior front photo.'],['left','Left Side','Exterior left side.'],['rear','Rear','Exterior rear.'],['right','Right Side','Exterior right side.'],['roof','Roof','Roof overview.'],['interior','Interior','Interior photos as required.']
];
const state = { current:null, pendingPhoto:null, deferredInstall:null, qualityRunId:0 };
const $ = id => document.getElementById(id);
const screens = ['menuScreen','setupScreen','dashboardScreen','cameraScreen','reviewScreen'];
function show(id){ screens.forEach(s=>$(s).classList.toggle('active',s===id)); if(id==='menuScreen') renderSaved(); window.scrollTo(0,0); }
function uid(){ return 'insp_'+Date.now(); }
function photosFor(type){ return type==='OBS'?OBS_PHOTOS:STANDARD_PHOTOS; }
function newInspection(type){
  state.current = { id:uid(), type, inspectionId:'', address:'', inspector:'Chris Roberts', created:new Date().toISOString(), updated:new Date().toISOString(), photos:{} };
  photosFor(type).forEach(([key,title,help])=> state.current.photos[key]={key,title,help,status:'open',dataUrl:null,note:'',quality:null});
}
function save(){
 if(!state.current) return false;
 state.current.updated=new Date().toISOString();
 try{
   localStorage.setItem(state.current.id,JSON.stringify(state.current));
   renderDashboard();
   return true;
 }catch(err){
   console.warn('Full inspection save failed; saving lightweight metadata instead.',err);
   try{
     const lightweight=JSON.parse(JSON.stringify(state.current));
     Object.values(lightweight.photos||{}).forEach(p=>{
       if(p.dataUrl){ p.hasPhoto=true; p.dataUrl=null; }
     });
     localStorage.setItem(state.current.id,JSON.stringify(lightweight));
   }catch(fallbackErr){
     console.warn('Lightweight save also failed.',fallbackErr);
   }
   renderDashboard();
   return false;
 }
}
function allInspections(){ return Object.keys(localStorage).filter(k=>k.startsWith('insp_')).map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>new Date(b.updated)-new Date(a.updated)); }
function renderSaved(){
 const box=$('savedList'); box.innerHTML=''; const items=allInspections();
 if(!items.length){ box.innerHTML='<p class="muted">No saved inspections yet.</p>'; return; }
 items.forEach(item=>{ const b=document.createElement('button'); b.className='saved-item'; b.innerHTML=`<strong>${item.type} — ${item.inspectionId||'No ID'}</strong><br><small>${item.address||'No address'} · ${new Date(item.updated).toLocaleString()}</small>`; b.onclick=()=>{state.current=item; renderDashboard(); show('dashboardScreen');}; box.appendChild(b); });
}
function renderDashboard(){
 const c=state.current; if(!c) return; $('dashTitle').textContent=`${c.type} Inspection`; $('dashMeta').textContent=`${c.inspectionId||'No ID'} • ${c.address||'No address'} • ${c.inspector||'Inspector not set'}`;
 $('obsNotice').classList.toggle('hidden', c.type!=='OBS');
 const list=$('photoList'); list.innerHTML=''; const photos=Object.values(c.photos); const complete=photos.filter(p=>p.status==='done'||p.status==='missing').length;
 $('progressText').textContent=`${complete}/${photos.length} complete`; $('readyText').textContent= complete===photos.length?'Ready to export':'Not ready'; $('progressBar').style.width=`${Math.round(complete/photos.length*100)}%`;
 photos.forEach(p=>{ const row=document.createElement('div'); row.className=`photo-row ${p.status==='done'?'done':p.status==='missing'?'missing':''}`; row.innerHTML=`<div class="status">${p.status==='done'?'✓':p.status==='missing'?'!':'•'}</div><div class="info"><strong>${p.title}</strong><small>${p.status==='done'?'Saved':p.status==='missing'?'Marked unobtainable':p.help}</small></div><button class="secondary">${p.status==='done'?'View':'Take Photo'}</button>`; row.querySelector('button').onclick=()=>openPhoto(p.key,p.status!=='done'); list.appendChild(row); });
 renderQuickPhotoGallery(photos);
}
function renderQuickPhotoGallery(photos){
 const gallery=$('quickPhotoGallery');
 const count=$('quickPhotoCount');
 if(!gallery || !count) return;
 const saved=photos.filter(p=>p.status==='done' && p.dataUrl);
 count.textContent=`${saved.length} saved`;
 gallery.innerHTML='';
 if(!saved.length){
   gallery.innerHTML='<p class="muted quick-reference-empty">Saved pictures will appear here for quick reference.</p>';
   return;
 }
 saved.forEach(p=>{
   const card=document.createElement('button');
   card.type='button';
   card.className='quick-photo-card';
   card.setAttribute('aria-label',`View ${p.title} photo`);
   card.innerHTML=`<img src="${p.dataUrl}" alt="${p.title} photo"><span>${p.title}</span>`;
   card.onclick=()=>openPhoto(p.key,false);
   gallery.appendChild(card);
 });
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
   const maxDim=1600;
   const largest=Math.max(img.naturalWidth,img.naturalHeight);
   const scale=largest>maxDim?maxDim/largest:1;
   const width=Math.max(1,Math.round(img.naturalWidth*scale));
   const height=Math.max(1,Math.round(img.naturalHeight*scale));
   const canvas=document.createElement('canvas');
   canvas.width=width; canvas.height=height;
   const ctx=canvas.getContext('2d',{alpha:false});
   ctx.drawImage(img,0,0,width,height);
   return canvas.toDataURL('image/jpeg',0.76);
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
function departureCheck(){
 const photos=Object.values(state.current.photos); const missing=photos.filter(p=>p.status==='open'); const marked=photos.filter(p=>p.status==='missing'); const done=photos.filter(p=>p.status==='done');
 let html=`<div class="notice"><strong>${done.length} photos saved.</strong><br>${missing.length} still open. ${marked.length} marked unobtainable.</div>`;
 if(missing.length) html+=`<h3>Still needed</h3><ul>${missing.map(p=>`<li>${p.title}</li>`).join('')}</ul>`;
 if(marked.length) html+=`<h3>Manual overrides</h3><ul>${marked.map(p=>`<li>${p.title}${p.note?': '+p.note:''}</li>`).join('')}</ul>`;
 html+=`<p class="muted">Before leaving, confirm all four sides, roof, address, and visible outbuildings/damage have either a photo or a note.</p>`;
 $('reviewResults').innerHTML=html; show('reviewScreen');
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
 save();
 nextAfterSave();
};
$('retakeBtn').onclick=launchCamera;
$('markMissingBtn').onclick=()=>{ const p=state.current.photos[state.pendingPhoto]; p.note=$('photoNote').value.trim()||'Photo could not be obtained.'; p.status='missing'; p.dataUrl=null; save(); nextAfterSave(); };
$('saveBtn').onclick=save; $('departureBtn').onclick=departureCheck; $('exportBtn').onclick=exportReport;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); state.deferredInstall=e; $('installBtn').classList.remove('hidden');});
$('installBtn').onclick=async()=>{ if(state.deferredInstall){ state.deferredInstall.prompt(); state.deferredInstall=null; $('installBtn').classList.add('hidden'); }};
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=2.1.0-build-005',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
renderSaved();
