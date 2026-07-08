const DB_NAME='organizealot-v2'; const STORE='photos';
const sectionNames={exterior:'House Exterior',interior:'Interior',outbuildings:'Outbuildings'};
const sectionOrder=['exterior','interior','outbuildings'];
const checklist={
  'House Exterior':['Front','Rear','Left side','Right side','Address verification','Ground roof overview','Elevated / zoom roof view','Electric meter','HVAC exterior','Pool / deck if present'],
  'Interior':['Kitchen','Living room','Bathrooms','Basement / crawl if present','Electrical panel','Furnace','Water heater','Laundry / utility','Interior hazards if present'],
  'Outbuildings':['Shed / small outbuilding photos','Garage photos','Barn / pole barn photos','Over 400 sq ft: all sides','Over 400 sq ft: ground roof view','Over 400 sq ft: elevated / zoom roof view']
};
const minimumPhotos={exterior:8,interior:6,outbuildings:0};
let state=JSON.parse(localStorage.getItem('oal-state')||'{}'); let activeSection='exterior'; let deferredPrompt; let pendingTargetSection=null; let reviewingSection=null;
function save(){localStorage.setItem('oal-state',JSON.stringify(state));}
function $(id){return document.getElementById(id)}
function show(id){['setup','dashboard','capture','aiReview','departure'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden');}
function db(){return new Promise((res,rej)=>{let r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function putPhoto(p){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(p);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function getPhotos(){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readonly');let r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.filter(p=>p.inspectionId===state.id));r.onerror=()=>rej(r.error);});}
async function delPhoto(id){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
function initState(){ if(!state.checks) state.checks={}; Object.values(checklist).flat().forEach(x=>{ if(state.checks[x]===undefined) state.checks[x]=false; }); if(!state.notes) state.notes={}; if(!state.reviews) state.reviews={}; }
async function refreshDash(){initState(); $('activeTitle').textContent=state.id?`${state.id} — ${state.address||''}`:'No inspection'; $('activeSub').textContent=state.insured?`Insured: ${state.insured}`:''; let photos=await getPhotos().catch(()=>[]); for(let s of Object.keys(sectionNames)) $('count-'+s).textContent=photos.filter(p=>p.section===s).length; let unchecked=Object.values(state.checks||{}).filter(v=>!v).length; $('statusBadge').textContent=unchecked?'Check':'Ready?';}

function mapQuery(){return encodeURIComponent(($('address').value||state.address||'').trim());}
function openMapCheck(){const q=mapQuery(); if(!q){ alert('Enter the property address first.'); return; } state.address=$('address').value.trim(); save(); window.open('https://www.google.com/maps/search/?api=1&query='+q,'_blank','noopener');}
$('mapCheckBtn').onclick=openMapCheck;

$('startBtn').onclick=async()=>{state.id=$('inspectionId').value.trim()||('INS-'+Date.now());state.address=$('address').value.trim();state.insured=$('insured').value.trim();state.type=$('inspectionType').value;initState();save();await refreshDash();show('dashboard');};
$('resetBtn').onclick=()=>show('setup');
document.querySelectorAll('.sectionBtn').forEach(b=>b.onclick=async()=>handleSectionTap(b.dataset.section));

async function handleSectionTap(target){
  initState();
  const targetIndex=sectionOrder.indexOf(target);
  const last=state.lastSection||'exterior';
  const lastIndex=sectionOrder.indexOf(last);
  if(targetIndex>lastIndex && last!==target){
    await startSectionReview(last,target);
  } else {
    await openSection(target);
  }
}
async function openSection(s){activeSection=s;state.lastSection=s;save();$('sectionTitle').textContent=sectionNames[s];$('sectionNote').value=state.notes[s]||'';$('sectionNote').classList.add('hidden');await renderThumbs();show('capture');}
$('takePhoto').onclick=()=>$('photoInput').click();
$('photoInput').onchange=async e=>{
  const files=[...e.target.files];
  if(!files.length){e.target.value='';return;}
  for(let file of files){let id=Date.now()+'-'+Math.random().toString(36).slice(2);await putPhoto({id,inspectionId:state.id,section:activeSection,name:file.name,ts:new Date().toISOString(),blob:file});}
  e.target.value='';
  await renderThumbs(); await refreshDash();
  confirmSavedThenCamera();
};
function confirmSavedThenCamera(){
  const toast=$('saveToast'); toast.classList.remove('hidden'); toast.textContent='✅ OK — Photo saved';
  try{navigator.vibrate&&navigator.vibrate(80);}catch(e){}
  try{new AudioContext().resume().then(()=>{});}catch(e){}
  setTimeout(()=>{toast.classList.add('hidden'); if(!document.hidden && !$('capture').classList.contains('hidden')) $('photoInput').click();},650);
}
async function renderThumbs(){let photos=(await getPhotos()).filter(p=>p.section===activeSection).sort((a,b)=>a.ts.localeCompare(b.ts));$('thumbs').innerHTML='';photos.forEach(p=>{let u=URL.createObjectURL(p.blob);let div=document.createElement('div');div.className='thumb';div.innerHTML=`<button title="delete">×</button><img src="${u}"><small>${new Date(p.ts).toLocaleString()}</small>`;div.querySelector('button').onclick=async()=>{await delPhoto(p.id);renderThumbs();refreshDash();};$('thumbs').appendChild(div);});}
$('addNoteBtn').onclick=()=>$('sectionNote').classList.toggle('hidden');
$('sectionNote').oninput=()=>{state.notes[activeSection]=$('sectionNote').value;save();};
$('backDash').onclick=async()=>{await refreshDash();show('dashboard');}; $('backDash2').onclick=async()=>{await refreshDash();show('dashboard');};

async function startSectionReview(section,target){
  reviewingSection=section; pendingTargetSection=target;
  $('reviewTitle').textContent=`AI Review — ${sectionNames[section]}`;
  $('reviewBox').innerHTML='<div class="analyzing">🤖 Analyzing section photos...</div>';
  show('aiReview');
  setTimeout(async()=>{ $('reviewBox').innerHTML=await buildReview(section); },550);
}
async function buildReview(section){
  const photos=(await getPhotos()).filter(p=>p.section===section);
  const count=photos.length; const min=minimumPhotos[section]||0; const note=(state.notes&&state.notes[section])||'';
  let lines=[]; let warnings=[];
  lines.push(`<div class="score">${count>=min?'✅':'⚠️'} ${sectionNames[section]} Photos: <b>${count}</b>${min?` / suggested ${min}+`:''}</div>`);
  if(section==='exterior'){
    lines.push('<div>AI field check looks for: front, rear, left, right, roof, meter, HVAC, foundation/porch/deck.</div>');
    if(count<8) warnings.push('Consider more exterior coverage before leaving this section.');
    if(count<4) warnings.push('You may not have all four sides photographed yet.');
  }
  if(section==='interior'){
    lines.push('<div>AI field check looks for: kitchen, bathrooms, electrical panel, HVAC/furnace, water heater, basement/crawl if needed.</div>');
    if(count<6) warnings.push('Interior may be missing a system photo such as panel, furnace, or water heater.');
  }
  if(section==='outbuildings'){
    lines.push('<div>AI field check looks for detached structures. Large outbuildings should have all sides plus roof photos.</div>');
    if(count===0) warnings.push('No outbuilding photos saved. That is OK only if there are no outbuildings.');
  }
  if(note) lines.push(`<div class="noteLine">Note saved: ${escapeHtml(note)}</div>`);
  if(warnings.length){lines.push('<h3>Recommended before continuing</h3><ul>'+warnings.map(w=>`<li>${w}</li>`).join('')+'</ul>');}
  else {lines.push('<h3 class="okText">✅ Section looks ready to continue.</h3>');}
  lines.push('<p class="small">OrganizeALot is only your field assistant. It does not change NIIS or submit anything to NIIS.</p>');
  state.reviews[section]={ts:new Date().toISOString(),photoCount:count,warnings}; save();
  return lines.join('');
}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
$('reviewBack').onclick=async()=>{await refreshDash();show('dashboard');};
$('reviewReturn').onclick=async()=>{await openSection(reviewingSection||'exterior');};
$('reviewContinue').onclick=async()=>{await openSection(pendingTargetSection||'interior');};

$('departureBtn').onclick=async()=>{if((state.lastSection||'exterior')==='outbuildings'){await startSectionReview('outbuildings','departure'); pendingTargetSection='departure';}else{renderChecks();show('departure');}};
const oldContinue=()=>{};
$('reviewContinue').addEventListener('click',async e=>{ if(pendingTargetSection==='departure'){e.stopImmediatePropagation(); renderChecks(); show('departure');} },true);
function renderChecks(){initState(); $('finalNote').value=state.finalNote||''; $('checklists').innerHTML=''; let tpl=$('checkTemplate'); Object.entries(checklist).forEach(([group,items])=>{let n=tpl.content.cloneNode(true); n.querySelector('summary').textContent=group; let box=n.querySelector('.checks'); items.forEach(item=>{let lab=document.createElement('label');lab.className='checkItem';lab.innerHTML=`<input type="checkbox" ${state.checks[item]?'checked':''}><span>${item}</span>`;lab.querySelector('input').onchange=e=>{state.checks[item]=e.target.checked;save();updateReady();}; box.appendChild(lab);}); $('checklists').appendChild(n);}); updateReady();}
$('finalNote').oninput=()=>{state.finalNote=$('finalNote').value;save();}; $('readyBtn').onclick=updateReady;
function updateReady(){let missing=Object.entries(state.checks||{}).filter(([k,v])=>!v).map(([k])=>k); let el=$('readyStatus'); if(missing.length){el.className='status bad';el.innerHTML=`🔴 NOT READY<br><small>${missing.slice(0,6).join(', ')}${missing.length>6?'...':''}</small>`;} else {el.className='status ok';el.textContent='🟢 READY TO LEAVE';}}
$('exportBtn').onclick=async()=>{let photos=await getPhotos();let summary={inspection:state,photoCounts:Object.fromEntries(Object.keys(sectionNames).map(s=>[sectionNames[s],photos.filter(p=>p.section===s).length])),created:new Date().toISOString()};let blob=new Blob([JSON.stringify(summary,null,2)],{type:'application/json'});let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`OrganizeALot_${state.id||'inspection'}_summary.json`;a.click();};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden');}); $('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;$('installBtn').classList.add('hidden');}};
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
(function boot(){if(state.id){$('inspectionId').value=state.id;$('address').value=state.address||'';$('insured').value=state.insured||'';$('inspectionType').value=state.type||'Residential';refreshDash();show('dashboard');}})();
