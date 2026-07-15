'use strict';

const VERSION='v2.1.0 Build 023';
const DB_NAME='organizealot-build022';
const DB_VERSION=1;
const INSPECTION_STORE='inspections';
const PHOTO_STORE='photos';

const $=id=>document.getElementById(id);
const screens=['menuScreen','setupScreen','inspectionScreen','departureScreen'];
const state={current:null,db:null,photos:[],pendingFile:null,pendingItemKey:null,pendingInput:null,deferredInstall:null,objectUrls:new Set()};

const GallerySaver=(window.Capacitor&&typeof window.Capacitor.registerPlugin==='function')?window.Capacitor.registerPlugin('GallerySaver'):null;

const GENERAL_WORKFLOWS={
  Residential:[
    {title:'House Exterior',items:[
      req('front','Front','Full front of home.'),req('rear','Rear','Full rear of home.'),req('left','Left Side','Left elevation.'),req('right','Right Side','Right elevation.'),req('address','Address Verification','House number, mailbox, curb or sign.'),
      req('roof','Roof','Best visible roof view.'),opt('outbuildings','All Outbuildings','Garage, shed, barn, etc.'),opt('pool','Pools / Spas','Show pool/spa and fencing if present.'),opt('hud','HUD Label if MH','Required when mobile/manufactured home.')
    ]},
    {title:'Interior',items:[
      req('level','1 per Level including Basement','At least one overview per level.'),req('kitchen1','Kitchen 1','Kitchen overview.'),req('kitchen2','Kitchen 2','Second kitchen angle.'),req('bathrooms','All Bathrooms','Photograph each bathroom.'),req('living','Living Room','Main living area.'),opt('waterheater','Water Heater','Show unit and label when accessible.'),opt('furnace','Furnace / Air Handler','Show unit and label when accessible.'),opt('panel','Electrical Panel','Clear breaker and manufacturer photos.')
    ]},
    {title:'Outbuildings',items:[
      opt('outbuilding_overview','Outbuilding Overview','Each outbuilding.'),opt('outbuilding_roof','Outbuilding Roof','For buildings over 400 sq ft, include perimeter and roof photos.')
    ]}
  ],
  OBS:[{title:'OBS Exterior',items:[req('front','Front','Full front.'),req('front_angle','Front Angle','Front plus one side.'),req('left','Left Side','Left elevation.'),req('rear','Rear','Rear elevation if accessible.'),req('right','Right Side','Right elevation.'),req('roof','Roof','Best visible roof view.'),req('address','Address Verification','House number/mailbox/sign.'),opt('outbuildings','Outbuildings','If present.'),opt('hazards','Damage / Hazards','Overview and close-up of concerns.')]}],
  USAA:[
    {title:'USAA Exterior',items:[req('front','Front','Front elevation.'),req('rear','Rear','Rear elevation.'),req('left','Left','Left elevation.'),req('right','Right','Right elevation.'),req('address','Address Verification','Verify property.'),req('roof_front','Roof Front','Front slope.'),req('roof_rear','Roof Rear','Rear slope.'),opt('roof_close','Roof Close-up','When safely possible.'),opt('outbuildings','Outbuildings','All detached structures.'),opt('hazards','Exterior Hazards','Overview + close-up.') ]},
    {title:'USAA Interior',items:[req('kitchen','Kitchen','Kitchen overview.'),req('bathrooms','All Bathrooms','All required bathrooms.'),req('living','Main Living Area','Living room/family room.'),opt('basement','Basement / Crawlspace','When present.'),opt('attic','Attic Access','When accessible.'),opt('waterheater','Water Heater','Unit and label.'),opt('furnace','Furnace / Air Handler','Unit and label.'),opt('panel','Electrical Panel','Open if allowed.'),opt('smoke','Smoke / CO Detectors','Show devices.'),opt('damage','Interior Damage','Any concerns.') ]}
  ]
};

const PREFERRED_SECTIONS=[
  {title:'1. Assignment & Contact',fields:[field('contact_name','Contact / Interviewed Person'),field('contact_title','Title'),field('contact_phone','Phone'),field('contact_email','Email'),area('special_instructions','Special Instructions / Access Notes')],items:[req('pr_address','Address Verification','Verify the insured location and signage.'),req('pr_front','Front View','Front of main building and roofline if possible.')]},
  {title:'2. General Risk Overview',fields:[selectField('overall_opinion','Overall Opinion of Risk',['','Good','Average','Poor']),selectField('housekeeping','Housekeeping Conditions',['','Good','Average','Poor']),area('overall_comments','Overall Risk / Housekeeping Comments')],items:[opt('street_view','Street / Approach View','Context and approach to risk.'),opt('general_condition','Overall Condition','Useful overview photos.') ]},
  {title:'3. Business Operations',fields:[area('occupancy','Who and what occupies the space?'),area('operations','Nature of operations'),field('years_business','Years in Business'),field('years_experience','Years Experience in Field'),selectField('building_for_sale','Building for Sale?',['','Yes','No']),area('animals','Dogs / Livestock / Animal Details')],items:[opt('operations_overview','Operations Overview','Representative operations/occupancy photo.'),opt('business_signage','Business Signage','Signage identifying the operation.') ]},
  {title:'4. Sales / Payroll / Staffing',fields:[field('annual_sales','Annual Sales'),field('annual_payroll','Annual Payroll'),field('employees_ft','Full-Time Employees'),field('employees_pt','Part-Time Employees'),area('sales_breakdown','Sales / Revenue Breakdown Notes')],items:[opt('records_support','Supporting Records / Posted Information','Only when appropriate and permitted.') ]},
  {title:'5. Building Details & Square Footage',fields:[field('year_built','Year Built'),field('stories','Stories'),field('sq_ft','Total Square Footage'),field('construction','Construction Type'),field('roof_age','Roof Age'),field('hvac_age','HVAC Age'),area('updates','Electrical / Plumbing / Roof / HVAC Updates')],items:[req('building_overview','Building Overview','Representative overall view.'),opt('construction_detail','Construction Detail','Wall/foundation/roof details as needed.') ]},
  {title:'6. Front / Address Verification',fields:[],items:[req('front_view','Front View','First picture should be the front of the building.'),req('address_verification','Address Verification','Building number, mailbox, curb or sign.'),opt('street_context','Street Context','Overall street/exposure context.') ]},
  {title:'7. Exterior',fields:[area('exterior_notes','Exterior Notes')],items:[req('left_view','Left Side','Left elevation.'),req('right_view','Right Side','Right elevation.'),req('rear_view','Rear View','Rear elevation if accessible.'),opt('roof_view','Roof Overview','Best safely visible roof view.'),opt('parking','Parking Areas','Parking lots/areas.'),opt('walkways','Driveways / Sidewalks / Walkways','Document condition and hazards.'),opt('stairs_railings','Steps / Stairs / Balconies / Railings','Include baluster spacing/height as needed.'),opt('lighting','Exterior Lighting','Representative lighting.'),opt('fencing','Fencing / Security','Security of premises.'),opt('exterior_hazards','Exterior Hazards','Overview + close-up of each hazard.') ]},
  {title:'8. Interior',fields:[area('interior_notes','Interior Notes')],items:[opt('interior_overview','Interior Areas','Representative interior areas.'),opt('common_areas','Interior Common Areas','Hallways, lobby, common spaces.'),opt('interior_stairs','Interior Stairs / Steps','Show stairs, rails and hazards.'),opt('entry_exits','Entry / Exit Points','Doors and egress paths.'),opt('water_heaters','Water Heaters','Unit and identifying label.'),opt('interior_hazards','Interior Hazards','Overview + close-up.') ]},
  {title:'9. Electrical',fields:[field('panel_manufacturer','Panel Manufacturer'),field('panel_serial','Panel Serial Number'),area('electrical_notes','Electrical Notes / Updates')],items:[req('breaker_panel','Circuit Breaker Panel','Clear full panel photo.'),req('breaker_close','Breakers / Manufacturer Close-up','Clear identifying photo.'),opt('panel_serial_photo','Serial Number Close-up','Required when visible.'),opt('outdated_electrical','Outdated Electrical','Identifying photos of concerns.') ]},
  {title:'10. Fire Protection / Life Safety',fields:[selectField('sprinklers','Sprinkler System',['','Yes','No','N/A']),selectField('fire_alarm','Fire Alarm',['','Yes','No','N/A']),area('fire_notes','Fire Protection Notes')],items:[opt('smoke_co','Smoke / CO Detectors','As required for occupancy.'),opt('extinguishers','Fire Extinguishers','Representative extinguishers and tags.'),opt('alarm_panel','Fire / Burglar Alarm Panel','Panel when present.'),opt('sprinkler_riser','Sprinkler Riser & Tag','Riser and tag if applicable.'),opt('emergency_lights','Emergency Lights / Exit Signs','Representative devices.'),opt('cooking_suppression','Commercial Cooking Suppression','Hood/suppression when applicable.') ]},
  {title:'11. Hazards / Recommendations',fields:[area('hazards_notes','Hazards / Recommendations Notes')],items:[opt('hazard_overview','Hazard Overview','Show location/context.'),opt('hazard_closeup','Hazard Close-up','Show specific defect/condition.'),opt('recommendation_support','Recommendation Support','Photos supporting recommendations.') ]},
  {title:'12. Additional Buildings / Exposures',fields:[area('additional_buildings_notes','Additional Buildings / Exposure Notes')],items:[opt('additional_buildings','Additional Buildings','All additional structures.'),opt('additional_utilities','Buildings with Utilities','Inspect enclosed buildings with electrical/plumbing/heating.'),opt('commercial_exposures','Commercial Exposures','Adjacent exposures.'),opt('pools','Pools / Water Features','Show fencing, slides, diving boards.'),opt('heating_sources','Heating Sources / Fireplaces / Wood Stoves','As applicable.') ]},
  {title:'13. BVS / RCT / Diagrams / Attachments',fields:[field('bvs_occupancy','BVS Occupancy / Code'),field('rct_value','RCT / Replacement Cost Notes'),area('diagram_notes','Diagram / Exposure Notes')],items:[opt('diagram','Diagram / Sketch','Photo or supporting diagram if used.'),opt('exposure_diagram','Exposure Diagram','Show exposure relationships.'),opt('bvs_support','BVS / RCT Support','Supporting building details.'),opt('attachments','Attachment Checklist Support','Any required supporting images.')],checks:['Assignment instructions reviewed','Front photo first in final set','Exterior photos completed','Interior photos completed if required','Hazards have overview + close-up','Electrical manufacturer / serial documented','All additional buildings photographed','Attachments and diagrams reviewed']}
];

function req(key,title,help){return {key,title,help,required:true};}
function opt(key,title,help){return {key,title,help,required:false};}
function field(key,label){return {type:'text',key,label};}
function area(key,label){return {type:'textarea',key,label};}
function selectField(key,label,options){return {type:'select',key,label,options};}

function makeId(){return 'insp_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);}
function show(id){screens.forEach(s=>$(s).classList.toggle('active',s===id));if(id==='menuScreen')renderSaved();window.scrollTo(0,0);}
function clean(s){return String(s||'').trim();}
function slug(s){return clean(s).replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,80)||'item';}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function displayDate(v){try{return new Date(v).toLocaleString();}catch{return '';}}

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(INSPECTION_STORE))db.createObjectStore(INSPECTION_STORE,{keyPath:'id'});if(!db.objectStoreNames.contains(PHOTO_STORE)){const ps=db.createObjectStore(PHOTO_STORE,{keyPath:'id'});ps.createIndex('inspectionId','inspectionId',{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function tx(store,mode='readonly'){return state.db.transaction(store,mode).objectStore(store);}
function dbPut(store,value){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error);});}
function dbDelete(store,key){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
function dbGetAll(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
function getPhotosForInspection(inspectionId){return new Promise((resolve,reject)=>{const idx=tx(PHOTO_STORE).index('inspectionId');const r=idx.getAll(inspectionId);r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}

function workflowFor(type){return type==='Preferred Reports'?PREFERRED_SECTIONS:(GENERAL_WORKFLOWS[type]||GENERAL_WORKFLOWS.Residential);}
function newInspection(type){return {id:makeId(),type,inspectionId:'',address:'',inspector:'Chris Roberts',created:new Date().toISOString(),updated:new Date().toISOString(),fields:{},notes:{},checks:{}};}
function isSavable(c){return !!(c&&clean(c.inspectionId)&&clean(c.address));}
async function saveCurrent(msg='Saved'){
  const c=state.current;if(!c)return false;c.updated=new Date().toISOString();
  if(!isSavable(c)){toast('Enter both Inspection ID and Address to save.');return false;}
  await dbPut(INSPECTION_STORE,c);renderInspectionHeader();toast(msg);return true;
}

async function renderSaved(){
  const all=(await dbGetAll(INSPECTION_STORE)).sort((a,b)=>new Date(b.updated)-new Date(a.updated));
  const recent=all.slice(0,6),archived=all.slice(6);
  renderSavedInto($('savedList'),recent);
  $('archiveDetails').classList.toggle('hidden',!archived.length);
  renderSavedInto($('archivedList'),archived);
}
function renderSavedInto(box,items){
  box.innerHTML='';if(!items.length){box.innerHTML='<p class="muted">No saved inspections yet.</p>';return;}
  for(const item of items){const b=document.createElement('button');b.className='saved-item';b.innerHTML=`<strong>${esc(item.type)} — ${esc(item.inspectionId||'No ID')}</strong><br><small>${esc(item.address||'No address')} · ${esc(displayDate(item.updated))}</small>`;b.onclick=()=>openInspection(item.id);box.appendChild(b);}
}

async function openInspection(id){
  const all=await dbGetAll(INSPECTION_STORE);const c=all.find(x=>x.id===id);if(!c)return;state.current=c;state.photos=await getPhotosForInspection(c.id);renderInspection();show('inspectionScreen');
}

function setupNew(type){
  state.current=newInspection(type);state.photos=[];$('setupTitle').textContent=`New ${type} Inspection`;$('inspectionId').value='';$('address').value='';$('inspector').value='Chris Roberts';show('setupScreen');
}

function renderInspection(){
  const c=state.current;if(!c)return;renderInspectionHeader();renderCoreFields();renderSections();
}
function renderInspectionHeader(){
  const c=state.current;if(!c)return;$('inspectionTitle').textContent=`${c.type} Inspection`;$('inspectionMeta').textContent=`${c.inspectionId||'No ID'} • ${c.address||'No address'} • ${c.inspector||'Inspector not set'} • ${VERSION}`;
  if($('galleryStatus'))$('galleryStatus').textContent=isNativeAndroid()?`📱 Gallery backup ON • OrganizeALot / ${c.inspectionId||'Inspection ID'}`:'📱 Gallery backup available in the Android app';
  const {required,total,done}=progressStats();$('progressText').textContent=`${done}/${required} required photo items complete`;$('readyText').textContent=done>=required?'Ready to review':'In progress';$('progressBar').style.width=required?`${Math.round(done/required*100)}%`:'0%';
}
function renderCoreFields(){
  const c=state.current;const box=$('coreFields');
  box.innerHTML=`<h2>Inspection Information</h2><div class="core-grid"><label>Inspection ID<input id="coreInspectionId" value="${esc(c.inspectionId)}"></label><label>Inspector<input id="coreInspector" value="${esc(c.inspector)}"></label></div><label>Address<input id="coreAddress" value="${esc(c.address)}"></label><p class="muted">The Waze button above always uses this inspection's current address.</p>`;
  $('coreInspectionId').oninput=e=>{c.inspectionId=e.target.value;autosave();renderInspectionHeader();};$('coreInspector').oninput=e=>{c.inspector=e.target.value;autosave();renderInspectionHeader();};$('coreAddress').oninput=e=>{c.address=e.target.value;autosave();renderInspectionHeader();};
}

function renderSections(){
  revokeObjectUrls();const box=$('sections');box.innerHTML='';const sections=workflowFor(state.current.type);
  sections.forEach((section,sectionIndex)=>box.appendChild(renderSection(section,sectionIndex)));
}
function renderSection(section,sectionIndex){
  const wrap=document.createElement('section');wrap.className='section-card';const stat=sectionStats(section);const statusClass=stat.required===0?(stat.any?'status-green':'status-yellow'):(stat.done===stat.required?'status-green':stat.done>0?'status-yellow':'status-red');
  const head=document.createElement('div');head.className='section-head';head.innerHTML=`<span class="section-status ${statusClass}"></span><h3>${esc(section.title)}</h3><span>${stat.done}/${stat.required}</span>`;
  const body=document.createElement('div');body.className='section-body';
  if(section.fields?.length){for(const f of section.fields)body.appendChild(renderField(f));}
  for(const item of section.items||[])body.appendChild(renderItem(sectionIndex,item));
  if(section.checks?.length){const h=document.createElement('h4');h.textContent='Attachment / Final Checklist';body.appendChild(h);for(const label of section.checks)body.appendChild(renderCheck(label));}
  head.onclick=()=>body.classList.toggle('hidden');wrap.append(head,body);return wrap;
}
function renderField(f){
  const label=document.createElement('label');label.textContent=f.label;let el;
  if(f.type==='textarea'){el=document.createElement('textarea');}else if(f.type==='select'){el=document.createElement('select');for(const o of f.options||[]){const opt=document.createElement('option');opt.value=o;opt.textContent=o||'Choose';el.appendChild(opt);}}else{el=document.createElement('input');}
  el.value=state.current.fields[f.key]||'';el.oninput=()=>{state.current.fields[f.key]=el.value;autosave();};label.appendChild(el);return label;
}
function renderCheck(label){
  const key='check_'+slug(label);const row=document.createElement('label');row.className='check-row';row.innerHTML=`<input type="checkbox" ${state.current.checks[key]?'checked':''}><span>${esc(label)}</span>`;const cb=row.querySelector('input');cb.onchange=()=>{state.current.checks[key]=cb.checked;autosave();};return row;
}
function itemKey(sectionIndex,item){return `s${sectionIndex}::${item.key}`;}
function photosForItem(key){return state.photos.filter(p=>p.itemKey===key).sort((a,b)=>new Date(a.created)-new Date(b.created));}
function renderItem(sectionIndex,item){
  const key=itemKey(sectionIndex,item),photos=photosForItem(key);const div=document.createElement('div');div.className=`item ${photos.length?'completed':''} ${item.required?'':'optional'}`;
  div.innerHTML=`<div class="item-name">${esc(item.title)}</div><div class="item-help">${esc(item.help||'')}</div><span class="badge ${photos.length?'done':item.required?'required':'optional'}">${photos.length?`${photos.length} photo${photos.length===1?'':'s'}`:item.required?'Required':'Optional'}</span><button class="photo-add">📷 Take / Add Photo</button><input class="file-input" type="file" accept="image/*" capture="environment"><div class="photos"></div>`;
  const input=div.querySelector('.file-input');div.querySelector('.photo-add').onclick=()=>input.click();input.onchange=e=>preparePhoto(e,key,item.title,input);
  const photosBox=div.querySelector('.photos');for(const p of photos)photosBox.appendChild(renderPhotoCard(p));return div;
}
function renderPhotoCard(p){
  const card=document.createElement('div');card.className='photo-card';const url=URL.createObjectURL(p.blob);state.objectUrls.add(url);card.innerHTML=`<img src="${url}" alt="Inspection photo"><div class="photo-actions"><button class="danger">Delete Photo</button></div>`;
  card.querySelector('.danger').onclick=async()=>{if(!confirm('Delete this photo?'))return;await dbDelete(PHOTO_STORE,p.id);state.photos=state.photos.filter(x=>x.id!==p.id);renderSections();renderInspectionHeader();await saveCurrent('Photo deleted');};return card;
}
function revokeObjectUrls(){for(const u of state.objectUrls)URL.revokeObjectURL(u);state.objectUrls.clear();}

function preparePhoto(e,key,title,input){
  const file=e.target.files?.[0];if(!file)return;state.pendingFile=file;state.pendingItemKey=key;state.pendingInput=input;$('photoModalTitle').textContent=title;$('photoPreview').src=URL.createObjectURL(file);$('photoModal').classList.remove('hidden');
}
async function usePendingPhoto(){
  if(!state.pendingFile||!state.current)return;
  const file=state.pendingFile,itemKeyValue=state.pendingItemKey;
  const rec={id:'photo_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),inspectionId:state.current.id,itemKey:itemKeyValue,created:new Date().toISOString(),name:file.name||'photo.jpg',type:file.type||'image/jpeg',blob:file,gallerySaved:false,galleryUri:'',galleryFileName:''};
  await dbPut(PHOTO_STORE,rec);state.photos.push(rec);closePhotoModal();
  let gallerySaved=false;
  try{
    const result=await saveAcceptedPhotoToGallery(file,itemKeyValue);
    if(result?.saved){
      rec.gallerySaved=true;rec.galleryUri=result.uri||'';rec.galleryFileName=result.fileName||'';gallerySaved=true;await dbPut(PHOTO_STORE,rec);
    }
  }catch(err){console.error('Gallery backup failed',err);}
  await saveCurrent(gallerySaved?'Photo saved + Gallery backup':'Photo saved');renderSections();renderInspectionHeader();
  if(isNativeAndroid()&&!gallerySaved)toast('Photo saved in inspection — Gallery backup failed');
}
function isNativeAndroid(){return !!(window.Capacitor&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform()==='android');}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const result=String(reader.result||'');resolve(result.includes(',')?result.split(',')[1]:result);};reader.onerror=()=>reject(reader.error||new Error('Could not read photo'));reader.readAsDataURL(blob);});}
function photoItemInfo(key){
  const [sPart,itemPart]=String(key||'').split('::');const si=Number((sPart||'s0').replace('s',''))||0;const section=workflowFor(state.current?.type)[si];const item=(section?.items||[]).find(i=>i.key===itemPart);return {sectionTitle:section?.title||'Section',itemTitle:item?.title||itemPart||'Photo'};
}
function extensionForMime(mime){const m=String(mime||'').toLowerCase();if(m.includes('png'))return'png';if(m.includes('webp'))return'webp';if(m.includes('heic'))return'heic';return'jpg';}
function compactTimestamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3,'0')}`;}
async function saveAcceptedPhotoToGallery(file,key){
  if(!isNativeAndroid()||!GallerySaver)return {saved:false,reason:'not_native'};
  const info=photoItemInfo(key),ext=extensionForMime(file.type),inspectionFolder=slug(state.current.inspectionId),fileName=`${inspectionFolder}_${slug(info.itemTitle)}_${compactTimestamp()}.${ext}`;
  const data=await blobToBase64(file);
  return GallerySaver.saveImage({data,fileName,mimeType:file.type||'image/jpeg',albumName:'OrganizeALot',inspectionFolder});
}
function retakePendingPhoto(){const input=state.pendingInput;closePhotoModal();if(input){input.value='';setTimeout(()=>input.click(),50);}}
function closePhotoModal(){try{URL.revokeObjectURL($('photoPreview').src);}catch{}$('photoModal').classList.add('hidden');$('photoPreview').src='';if(state.pendingInput)state.pendingInput.value='';state.pendingFile=null;state.pendingItemKey=null;state.pendingInput=null;}

function sectionStats(section){
  const index=workflowFor(state.current.type).indexOf(section);const reqItems=(section.items||[]).filter(x=>x.required);const done=reqItems.filter(i=>photosForItem(itemKey(index,i)).length>0).length;const any=(section.items||[]).some(i=>photosForItem(itemKey(index,i)).length>0);return {required:reqItems.length,done,any};
}
function progressStats(){
  const sections=workflowFor(state.current.type);let required=0,done=0,total=0;sections.forEach((s,si)=>(s.items||[]).forEach(i=>{total++;if(i.required){required++;if(photosForItem(itemKey(si,i)).length)done++;}}));return {required,done,total};
}
function missingRequired(){
  const missing=[];workflowFor(state.current.type).forEach((s,si)=>(s.items||[]).forEach(i=>{if(i.required&&!photosForItem(itemKey(si,i)).length)missing.push(`${s.title}: ${i.title}`);}));return missing;
}

async function buildDeparture(){
  const missing=missingRequired();let html=`<div class="notice ${missing.length?'warning-box':''}"><strong>${missing.length?`${missing.length} required photo item(s) still missing.`:'Required photo checklist complete.'}</strong></div>`;
  if(missing.length)html+=`<div class="card bad-box"><h3>Missing Required Photos</h3><ul>${missing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><button id="backToInspectionBtn" class="secondary">Go Back to Inspection</button></div>`;
  html+=`<div class="card"><h3>Inspection</h3><p><strong>${esc(state.current.inspectionId)}</strong><br>${esc(state.current.address)}</p><button id="departureExportBtn" class="primary">Export ZIP Anyway</button></div>`;
  $('departureResults').innerHTML=html;if($('backToInspectionBtn'))$('backToInspectionBtn').onclick=()=>show('inspectionScreen');$('departureExportBtn').onclick=exportZip;show('departureScreen');
}

async function exportZip(){
  if(!isSavable(state.current)){alert('Enter both Inspection ID and Address before export.');return;}
  await saveCurrent('Saved before export');
  if(typeof JSZip==='undefined'){alert('ZIP library did not load. Connect to the internet once and reopen the app.');return;}
  const zip=new JSZip();const c=state.current;const report={version:VERSION,exported:new Date().toISOString(),inspection:c,photoCount:state.photos.length,missingRequired:missingRequired()};zip.file('inspection-report.json',JSON.stringify(report,null,2));
  const sections=workflowFor(c.type);for(const p of state.photos){const [sPart,itemPart]=p.itemKey.split('::');const si=Number((sPart||'s0').replace('s',''))||0;const section=sections[si];const item=(section?.items||[]).find(i=>i.key===itemPart);const ext=(p.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').slice(0,5)||'jpg';const name=`photos/${String(si+1).padStart(2,'0')}_${slug(section?.title||'section')}/${slug(item?.title||itemPart)}_${slug(p.id)}.${ext}`;zip.file(name,p.blob);}
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});const filename=`OrganizeALot_${slug(c.inspectionId)}_${slug(c.address)}_Build023.zip`;
  try{if(navigator.canShare&&navigator.share){const f=new File([blob],filename,{type:'application/zip'});if(navigator.canShare({files:[f]})){await navigator.share({title:'OrganizeALot Inspection Export',text:`${c.inspectionId} - ${c.address}`,files:[f]});return;}}}catch(e){if(e?.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}

function openWaze(address){
  const q=clean(address);if(!q){alert('Enter the inspection address first.');return;}window.location.href=`https://www.waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}
let autosaveTimer=null;function autosave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>{if(isSavable(state.current))saveCurrent('Auto-saved');},450);}
function toast(msg){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:200;background:#020617;color:#fff;border:1px solid #334155;border-radius:999px;padding:10px 16px;font-weight:700;box-shadow:0 8px 30px #0008';document.body.appendChild(t);}t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),1800);}

async function init(){
  state.db=await openDB();document.querySelectorAll('.tile').forEach(b=>b.onclick=()=>setupNew(b.dataset.type));document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>show(b.dataset.screen));
  $('startBtn').onclick=async()=>{const c=state.current;c.inspectionId=clean($('inspectionId').value);c.address=clean($('address').value);c.inspector=clean($('inspector').value)||'Chris Roberts';if(!isSavable(c)){alert('Enter both Inspection ID and Address first.');return;}await dbPut(INSPECTION_STORE,c);state.photos=[];renderInspection();show('inspectionScreen');};
  $('wazeSetupBtn').onclick=()=>openWaze($('address').value);$('wazeBtn').onclick=()=>openWaze(state.current?.address);$('saveBtn').onclick=()=>saveCurrent('Saved');$('exportBtn').onclick=buildDeparture;
  $('usePhotoBtn').onclick=usePendingPhoto;$('retakePhotoBtn').onclick=retakePendingPhoto;$('cancelPhotoBtn').onclick=closePhotoModal;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('installBtn').classList.remove('hidden');});$('installBtn').onclick=async()=>{if(state.deferredInstall){state.deferredInstall.prompt();state.deferredInstall=null;$('installBtn').classList.add('hidden');}};
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});await renderSaved();
}

init().catch(err=>{console.error(err);alert('OrganizeALot could not start: '+err.message);});
