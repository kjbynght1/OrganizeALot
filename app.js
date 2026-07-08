const DB_NAME='organizealot-v2'; const STORE='photos';
const sectionNames={exterior:'House Exterior',interior:'Interior',outbuildings:'Outbuildings'};
const checklist={
  'House Exterior':['Front','Rear','Left side','Right side','Address verification','Ground roof overview','Elevated / zoom roof view','Electric meter','HVAC exterior','Pool / deck if present'],
  'Interior':['Kitchen','Living room','Bathrooms','Basement / crawl if present','Electrical panel','Furnace','Water heater','Laundry / utility','Interior hazards if present'],
  'Outbuildings':['Shed / small outbuilding photos','Garage photos','Barn / pole barn photos','Over 400 sq ft: all sides','Over 400 sq ft: ground roof view','Over 400 sq ft: elevated / zoom roof view']
};
let state=JSON.parse(localStorage.getItem('oal-state')||'{}'); let activeSection='exterior'; let deferredPrompt;
function save(){localStorage.setItem('oal-state',JSON.stringify(state));}
function $(id){return document.getElementById(id)}
function show(id){['setup','dashboard','capture','departure'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden');}
function db(){return new Promise((res,rej)=>{let r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function putPhoto(p){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(p);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function getPhotos(){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readonly');let r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.filter(p=>p.inspectionId===state.id));r.onerror=()=>rej(r.error);});}
async function delPhoto(id){let d=await db();return new Promise((res,rej)=>{let tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
function initState(){ if(!state.checks) state.checks={}; Object.values(checklist).flat().forEach(x=>{ if(state.checks[x]===undefined) state.checks[x]=false; }); if(!state.notes) state.notes={}; }
async function refreshDash(){initState(); $('activeTitle').textContent=state.id?`${state.id} — ${state.address||''}`:'No inspection'; $('activeSub').textContent=state.insured?`Insured: ${state.insured}`:''; let photos=await getPhotos().catch(()=>[]); for(let s of Object.keys(sectionNames)) $('count-'+s).textContent=photos.filter(p=>p.section===s).length; let unchecked=Object.values(state.checks||{}).filter(v=>!v).length; $('statusBadge').textContent=unchecked?'Check':'Ready?';}

function mapQuery(){
  return encodeURIComponent(($('address').value||state.address||'').trim());
}
function openMapCheck(){
  const q=mapQuery();
  if(!q){ alert('Enter the property address first.'); return; }
  state.address=$('address').value.trim(); save();
  const url='https://www.google.com/maps/search/?api=1&query='+q;
  window.open(url,'_blank','noopener');
}
$('mapCheckBtn').onclick=openMapCheck;

$('startBtn').onclick=async()=>{state.id=$('inspectionId').value.trim()||('INS-'+Date.now());state.address=$('address').value.trim();state.insured=$('insured').value.trim();state.type=$('inspectionType').value;initState();save();await refreshDash();show('dashboard');};
$('resetBtn').onclick=()=>show('setup');
document.querySelectorAll('.sectionBtn').forEach(b=>b.onclick=()=>openSection(b.dataset.section));
async function openSection(s){activeSection=s;$('sectionTitle').textContent=sectionNames[s];$('sectionNote').value=state.notes[s]||'';$('sectionNote').classList.add('hidden');await renderThumbs();show('capture');}
$('takePhoto').onclick=()=>$('photoInput').click();
$('photoInput').onchange=async e=>{for(let file of e.target.files){let id=Date.now()+'-'+Math.random().toString(36).slice(2);await putPhoto({id,inspectionId:state.id,section:activeSection,name:file.name,ts:new Date().toISOString(),blob:file});} e.target.value=''; await renderThumbs(); await refreshDash();};
async function renderThumbs(){let photos=(await getPhotos()).filter(p=>p.section===activeSection).sort((a,b)=>a.ts.localeCompare(b.ts));$('thumbs').innerHTML='';photos.forEach(p=>{let u=URL.createObjectURL(p.blob);let div=document.createElement('div');div.className='thumb';div.innerHTML=`<button title="delete">×</button><img src="${u}"><small>${new Date(p.ts).toLocaleString()}</small>`;div.querySelector('button').onclick=async()=>{await delPhoto(p.id);renderThumbs();refreshDash();};$('thumbs').appendChild(div);});}
$('addNoteBtn').onclick=()=>$('sectionNote').classList.toggle('hidden');
$('sectionNote').oninput=()=>{state.notes[activeSection]=$('sectionNote').value;save();};
$('backDash').onclick=async()=>{await refreshDash();show('dashboard');}; $('backDash2').onclick=async()=>{await refreshDash();show('dashboard');};
$('departureBtn').onclick=()=>{renderChecks();show('departure');};
function renderChecks(){initState(); $('finalNote').value=state.finalNote||''; $('checklists').innerHTML=''; let tpl=$('checkTemplate'); Object.entries(checklist).forEach(([group,items])=>{let n=tpl.content.cloneNode(true); n.querySelector('summary').textContent=group; let box=n.querySelector('.checks'); items.forEach(item=>{let lab=document.createElement('label');lab.className='checkItem';lab.innerHTML=`<input type="checkbox" ${state.checks[item]?'checked':''}><span>${item}</span>`;lab.querySelector('input').onchange=e=>{state.checks[item]=e.target.checked;save();updateReady();}; box.appendChild(lab);}); $('checklists').appendChild(n);}); updateReady();}
$('finalNote').oninput=()=>{state.finalNote=$('finalNote').value;save();}; $('readyBtn').onclick=updateReady;
function updateReady(){let missing=Object.entries(state.checks||{}).filter(([k,v])=>!v).map(([k])=>k); let el=$('readyStatus'); if(missing.length){el.className='status bad';el.innerHTML=`🔴 NOT READY<br><small>${missing.slice(0,6).join(', ')}${missing.length>6?'...':''}</small>`;} else {el.className='status ok';el.textContent='🟢 READY TO LEAVE';}}
$('exportBtn').onclick=async()=>{let photos=await getPhotos();let summary={inspection:state,photoCounts:Object.fromEntries(Object.keys(sectionNames).map(s=>[sectionNames[s],photos.filter(p=>p.section===s).length])),created:new Date().toISOString()};let blob=new Blob([JSON.stringify(summary,null,2)],{type:'application/json'});let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`OrganizeALot_${state.id||'inspection'}_summary.json`;a.click();};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden');}); $('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;$('installBtn').classList.add('hidden');}};
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
(function boot(){if(state.id){$('inspectionId').value=state.id;$('address').value=state.address||'';$('insured').value=state.insured||'';$('inspectionType').value=state.type||'Residential';refreshDash();show('dashboard');}})();
