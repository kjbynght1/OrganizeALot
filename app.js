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
const state = { current:null, pendingPhoto:null, deferredInstall:null };
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
function runQuality(dataUrl){
 const img=new Image(); img.onload=()=>{
   const mp=(img.naturalWidth*img.naturalHeight)/1000000; let msg=[], cls='good';
   if(mp<1){ msg.push('Photo may be low resolution.'); cls='warn'; } else msg.push('Resolution looks usable.');
   if(img.naturalWidth<img.naturalHeight && ['front','rear','left','right','roof'].includes(state.pendingPhoto)){ msg.push('Portrait photo is OK, but landscape may show more of the structure.'); cls=cls==='good'?'warn':cls; }
   msg.push('Review for blur, glare, darkness, and sun distortion before pressing OK.');
   const box=$('qualityBox'); box.className=`quality ${cls}`; box.innerHTML=`<strong>AI quality check</strong><p>${msg.join(' ')}</p>`; box.classList.remove('hidden');
   state.current.photos[state.pendingPhoto].quality=msg.join(' ');
 }; img.src=dataUrl;
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
 try{
   const dataUrl=await optimizePhoto(file);
   const p=state.current.photos[state.pendingPhoto];
   p.dataUrl=dataUrl;
   p.hasPhoto=true;
   p.status='preview';
   $('previewImg').src=dataUrl;
   $('previewImg').classList.remove('hidden');
   runQuality(dataUrl);
 }catch(err){
   console.error(err);
   alert('The photo could not be processed. Please retake it.');
 }finally{
   btn.textContent='OK / Save Photo';
   btn.disabled=!(state.current && state.pendingPhoto && state.current.photos[state.pendingPhoto] && state.current.photos[state.pendingPhoto].dataUrl);
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
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=2.1.0-build-003',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
renderSaved();
