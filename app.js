'use strict';

const APP_VERSION = 'v2.1.0 Build 022';
const STORAGE_PREFIX = 'insp_';
const DB_NAME = 'OrganizeALotDB';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
const RECENT_LIMIT = 6;

const $ = id => document.getElementById(id);
const screens = ['menuScreen','setupScreen','dashboardScreen','sectionScreen','photoPreviewScreen','reviewScreen'];
const state = {
  current: null,
  currentSectionId: null,
  pendingPhotoTarget: null,
  pendingCapture: null,
  previewUrl: null,
  deferredInstall: null,
  dbPromise: null,
  search: ''
};

const photo = (id, label, help='', min=0) => ({kind:'photo', id, label, help, min});
const field = (id, label, type='text', required=false, options=[], help='') => ({kind:'field', id, label, type, required, options, help});
const check = (id, label, required=false, help='') => ({kind:'field', id, label, type:'checkbox', required, options:[], help});

const RESIDENTIAL_SECTIONS = [
  {
    id:'res_exterior', title:'House Exterior', help:'General residential exterior checklist. Add as many photos as needed.',
    items:[
      photo('front','Front','At least one full front view.',1),
      photo('rear','Rear','At least one full rear view.',1),
      photo('left','Left Side','At least one full left elevation.',1),
      photo('right','Right Side','At least one full right elevation.',1),
      photo('address','Address Verification','House number, mailbox, curb, street sign, or other clear verification.',1),
      photo('roof','Roof Views','Overview plus close-ups when needed.',1),
      photo('outbuildings','All Outbuildings','Photograph every detached garage, shed, barn, gazebo, pavilion, or similar structure.'),
      photo('pools_spas','All Pools / Spas','Include fencing, slides, diving boards, gates, and hazards when present.'),
      photo('hud_label','HUD Label if Manufactured Home','Add HUD label / data plate when applicable.'),
      photo('damage_hazards','Damage / Hazards','Add any concerns or damage.'),
      photo('other_exterior','Other Exterior Photos','Unlimited supporting exterior photos.')
    ]
  },
  {
    id:'res_interior', title:'Interior', help:'Take required interior photos. You do not have to take them in order.',
    items:[
      photo('levels','One Per Level Including Basement','At least one overview for every level.',1),
      photo('kitchen','Kitchen','Minimum two kitchen photos.',2),
      photo('bathrooms','All Bathrooms','Photograph every bathroom.'),
      photo('living_room','Living Room','At least one living-room overview.',1),
      photo('bedrooms','Bedrooms','Use when required by the client.'),
      photo('mechanicals','Mechanical / Utility Areas','Water heater, furnace, electrical, plumbing, or other required systems.'),
      photo('other_interior','Other Interior Photos','Unlimited supporting interior photos.')
    ]
  },
  {
    id:'res_notes', title:'Notes & Final Review', help:'Add field notes before leaving.',
    items:[
      field('res_notes_general','Inspection Notes','textarea'),
      check('res_reviewed','I reviewed the inspection for missing required photos',true)
    ]
  }
];

const OBS_SECTIONS = [
  {
    id:'obs_exterior', title:'OBS Exterior Photos', help:'Observation exterior-only workflow.',
    items:[
      photo('front','Front','Full front including roofline when possible.',1),
      photo('front_angle','Front Angle','Corner angle showing front and one side.',1),
      photo('left','Left Side','Left elevation.',1),
      photo('rear','Rear','Full rear when accessible.',1),
      photo('right','Right Side','Right elevation.',1),
      photo('roof','Roof','Best visible roof view without unsafe positioning.',1),
      photo('address','Address Verification','House number, mailbox, curb, or sign.',1),
      photo('outbuildings','Outbuildings','Detached garage, shed, barn, pole barn, or other structure.'),
      photo('damage','Damage / Hazards','Any visible damage, hazards, or concerns.')
    ]
  },
  {
    id:'obs_review', title:'OBS Final Review', help:'Review before leaving.',
    items:[
      field('obs_notes','Notes / reason for inaccessible photos','textarea'),
      check('obs_reviewed','I reviewed all four sides, roof, address, outbuildings, and visible hazards',true)
    ]
  }
];

const PREFERRED_SECTIONS = [
  {
    id:'pr_job_contact', title:'1. Job Setup & Contact', help:'Appointment, insured and contact information.',
    items:[
      field('pr_customer','Customer / Program','text',false,[], 'Example: RT Specialty | 1054-TITAN'),
      field('pr_policy','Policy Number'),
      field('pr_due_date','Due Date','date'),
      field('pr_appointment','Appointment Date / Time','datetime-local'),
      field('pr_contact_name','Contact Name','text',true),
      field('pr_contact_phone','Contact Phone','tel'),
      field('pr_contact_email','Contact Email','email'),
      field('pr_contact_role','Contact Role / Title'),
      field('pr_special_instructions','Special Instructions','textarea'),
      check('pr_address_verified','Address verified onsite',true)
    ]
  },
  {
    id:'pr_operations', title:'2. Business Operations', help:'Document who occupies the space, what they do, and the financial / operational details requested.',
    items:[
      field('pr_occupancy_name','Business / Occupancy Name','text',true),
      field('pr_operations_desc','Description of Operations','textarea',true),
      field('pr_occupies_space','Who / What Occupies the Space','textarea',true),
      field('pr_annual_sales','Annual Sales / Revenue','number'),
      field('pr_annual_payroll','Annual Payroll','number'),
      field('pr_employees','Number of Employees','number'),
      field('pr_years_business','Years in Business','number'),
      field('pr_years_experience','Owner / Manager Years of Experience','number'),
      field('pr_ownership_type','Occupancy / Ownership Status','select',false,['','Property owner','Property-business owner','Tenant-business owner','Other']),
      field('pr_lessor_risk','Lessor’s Risk / Class Specification Notes','textarea'),
      field('pr_risk_opinion','Overall Opinion of Risk','select',false,['','Excellent','Good','Average','Below Average','Poor']),
      field('pr_housekeeping','Housekeeping / Maintenance','select',false,['','Excellent','Good','Average','Below Average','Poor']),
      field('pr_for_sale','Is the building / business for sale?','select',false,['','No','Yes','Unknown']),
      field('pr_animals','Dogs / Livestock / Animals Present','textarea')
    ]
  },
  {
    id:'pr_building', title:'3. Building & Square Footage', help:'Capture construction, area and valuation-supporting details.',
    items:[
      field('pr_year_built','Year Built','number'),
      field('pr_stories','Number of Stories','number'),
      field('pr_total_sqft','Total Square Footage','number',true),
      field('pr_area_breakdown','Square Footage Breakdown by Area / Use','textarea'),
      field('pr_construction','Construction Type'),
      field('pr_exterior_walls','Exterior Wall Material'),
      field('pr_roof_type','Roof Type / Covering'),
      field('pr_foundation','Foundation Type'),
      field('pr_updates','Major Updates / Renovations','textarea'),
      field('pr_condition','General Building Condition','select',false,['','Excellent','Good','Average','Below Average','Poor'])
    ]
  },
  {
    id:'pr_front', title:'4. Front & Address Photos', help:'Exported first. Start with clear front and address verification images.',
    items:[
      photo('pr_front_view','Front View','Full front elevation.',1),
      photo('pr_front_angle','Front / Corner Angles','Add enough angles to understand the property.'),
      photo('pr_address_photo','Address Verification','Clear address verification.',1),
      photo('pr_signage','Business Signage / Tenant Identification','When present.')
    ]
  },
  {
    id:'pr_exterior', title:'5. Exterior Photos', help:'Take exterior photos in any order; add unlimited photos to each item.',
    items:[
      photo('pr_left','Left Side','Full left elevation.',1),
      photo('pr_right','Right Side','Full right elevation.',1),
      photo('pr_rear','Rear View','Rear when possible.',1),
      photo('pr_driveways','Driveways / Sidewalks / Walkways'),
      photo('pr_parking','Parking Lots / Parking Areas'),
      photo('pr_exterior_common','Exterior Common Areas'),
      photo('pr_fencing','Fencing / Security of Premises'),
      photo('pr_exterior_lighting','Exterior Lighting'),
      photo('pr_steps','Steps / Stairs / Balconies'),
      photo('pr_railings','Railings / Baluster Spacing / Balcony Height','Show spacing and height where applicable.'),
      photo('pr_roof','Roof Views','Overview and close-ups where needed.'),
      photo('pr_additional_buildings_ext','Additional Buildings / Structures','Photograph every applicable structure.'),
      photo('pr_exterior_other','Other Exterior Supporting Photos')
    ]
  },
  {
    id:'pr_interior', title:'6. Interior Photos', help:'Required interior documentation and common areas.',
    items:[
      photo('pr_interior_areas','Interior Areas / Occupied Space','General interior areas.',1),
      photo('pr_interior_common','Interior Common Areas'),
      photo('pr_interior_stairs','Interior Stairs / Steps'),
      photo('pr_entry_exit','Entry / Exit Points','Document means of egress.',1),
      photo('pr_smoke_co','Smoke / CO Detectors'),
      photo('pr_water_heaters','Water Heaters'),
      photo('pr_heating_sources','Heating Sources / Wood Stoves / Fireplaces'),
      photo('pr_outdated_plumbing','Outdated Plumbing Identification'),
      photo('pr_interior_other','Other Interior Supporting Photos')
    ]
  },
  {
    id:'pr_electrical', title:'7. Electrical', help:'Clear close-ups are critical. Capture panel, breakers, manufacturer and serial / label information.',
    items:[
      photo('pr_panel_overview','Circuit Breaker Panel Overview','Show the full panel and surrounding area.',1),
      photo('pr_breakers_closeup','Circuit Breakers Close-Up','Clear close-up of breakers.',1),
      photo('pr_manufacturer_label','Manufacturer / Data Label','Clear readable manufacturer identification.',1),
      photo('pr_serial_number','Serial Number / Identification Label','If no serial number is visible, document that in notes.'),
      photo('pr_meter_service','Meter / Service Entrance'),
      photo('pr_solar_meter','Solar Ready Meter Combo / Solar Equipment','When applicable.'),
      field('pr_electrical_manufacturer','Electrical Panel Manufacturer','text',true),
      field('pr_electrical_serial','Serial Number / Note if Not Visible'),
      field('pr_electrical_service','Electrical Service Size / Amperage'),
      field('pr_electrical_notes','Electrical Notes','textarea')
    ]
  },
  {
    id:'pr_fire', title:'8. Fire Protection & Commercial Cooking', help:'Document fire protection, emergency systems and cooking exposures when present.',
    items:[
      photo('pr_extinguishers','Fire Extinguishers'),
      photo('pr_fire_alarm','Fire / Burglar Alarm Panel'),
      photo('pr_sprinkler_riser','Sprinkler Riser & Tag'),
      photo('pr_emergency_exits','Emergency Exits / Exit Signs'),
      photo('pr_commercial_cooking','Commercial Cooking Line / Equipment'),
      photo('pr_hood_system','Hood / Duct / Suppression System'),
      photo('pr_suppression_tag','Suppression Inspection Tag'),
      photo('pr_gas_shutoff','Gas Shutoff / Fuel Controls'),
      field('pr_fire_notes','Fire Protection / Cooking Notes','textarea')
    ]
  },
  {
    id:'pr_additional', title:'9. Additional Buildings & Exposures', help:'Document structures, utilities, adjacent risks and site exposures.',
    items:[
      field('pr_additional_building_count','Number of Additional Buildings / Structures','number'),
      field('pr_additional_building_desc','Description of Additional Buildings / Utilities','textarea'),
      photo('pr_additional_building_photos','Additional Building Photos'),
      photo('pr_adjacent_structures','Adjacent Structures / Neighboring Exposures'),
      photo('pr_commercial_exposures','Commercial Exposures'),
      photo('pr_pools','Swimming Pools / Fencing / Slides / Diving Boards'),
      field('pr_exposure_notes','Exposure Notes','textarea')
    ]
  },
  {
    id:'pr_hazards', title:'10. Hazards & Recommendations', help:'Document hazards clearly and record practical recommendations.',
    items:[
      photo('pr_hazard_photos','Hazard Photos','Unlimited hazard / concern photos.'),
      field('pr_hazard_summary','Hazards / Concerns Found','textarea'),
      field('pr_hazard_location','Hazard Locations','textarea'),
      field('pr_recommendations','Recommendations','textarea'),
      field('pr_recommendation_priority','Recommendation Priority / Urgency','select',false,['','None','Routine','Important','Urgent']),
      check('pr_no_hazards','No hazards or recommendations observed')
    ]
  },
  {
    id:'pr_bvs', title:'11. BVS / RCT Data', help:'Enter valuation and occupancy information. Use the official reference tools to verify the correct occupancy and assumptions.',
    items:[
      field('pr_bvs_code','BVS Occupancy Code'),
      field('pr_bvs_description','BVS Occupancy Description','textarea'),
      field('pr_bvs_construction_class','Construction Class / Type'),
      field('pr_bvs_quality','Quality / Grade'),
      field('pr_bvs_stories','Stories','number'),
      field('pr_bvs_sqft','BVS / RCT Square Footage','number'),
      field('pr_bvs_replacement_cost','Estimated Replacement Cost / RCT Value','number'),
      field('pr_bvs_assumptions','BVS / RCT Assumptions & Notes','textarea'),
      check('pr_bvs_verified','BVS / RCT data verified when required')
    ]
  },
  {
    id:'pr_attachments', title:'12. Diagrams & Attachments', help:'Keep supporting diagrams, exposures and required documents together.',
    items:[
      photo('pr_site_diagram','Site Diagram / Sketch'),
      photo('pr_exposure_diagram','Exposure / Adjacent Structure Diagram'),
      photo('pr_attachment_photos','Other Attachment Images'),
      check('pr_attach_site_diagram','Site diagram / sketch attached if required'),
      check('pr_attach_electrical','Electrical reference attachments reviewed / included if applicable'),
      check('pr_attach_solar','Solar meter combo attachment included if applicable'),
      check('pr_attach_other','Other client-specific attachments included if applicable'),
      field('pr_attachment_notes','Attachment Notes','textarea')
    ]
  },
  {
    id:'pr_final', title:'13. Final Field Review', help:'Last check before leaving the property.',
    items:[
      check('pr_final_front','Front and address photos reviewed',true),
      check('pr_final_exterior','Exterior sides and required exterior exposures reviewed',true),
      check('pr_final_interior','Interior access / required interior photos reviewed',true),
      check('pr_final_electrical','Electrical panel, breakers, manufacturer and serial / label reviewed',true),
      check('pr_final_hazards','Hazards / recommendations reviewed or confirmed none',true),
      check('pr_final_sqft','Square footage and operation description reviewed',true),
      check('pr_final_attachments','Required diagrams / attachments reviewed',true),
      field('pr_final_notes','Final Notes Before Departure','textarea')
    ]
  }
];

const CONFIGS = {
  Residential: {title:'Residential', sections:RESIDENTIAL_SECTIONS},
  OBS: {title:'OBS Exterior', sections:OBS_SECTIONS},
  PreferredCommercial: {title:'Preferred Reports Commercial', sections:PREFERRED_SECTIONS}
};

function show(id){
  screens.forEach(s => $(s).classList.toggle('active', s===id));
  if(id==='menuScreen') renderSaved();
  if(id==='dashboardScreen') renderDashboard();
  window.scrollTo(0,0);
}

function toast(message, ms=1800){
  const el=$('toast');
  el.textContent=message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.add('hidden'),ms);
}

function uid(prefix='id'){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function sanitizeName(v=''){ return String(v).trim().replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').slice(0,100) || 'Untitled'; }
function sectionsFor(type){ return CONFIGS[type]?.sections || []; }
function sectionById(id){ return sectionsFor(state.current?.type).find(s=>s.id===id); }
function itemById(sectionId,itemId){ return sectionById(sectionId)?.items.find(i=>i.id===itemId); }

function blankInspection(type){
  const now=new Date().toISOString();
  return {
    id:uid('insp'), type, inspectionId:'', address:'', insured:'', inspector:'Chris Roberts',
    created:now, updated:now, data:{}, photos:{}, manualComplete:{}, version:APP_VERSION
  };
}

function normalizeInspection(c){
  c.data ||= {};
  c.photos ||= {};
  c.manualComplete ||= {};
  c.insured ||= '';
  c.inspector ||= 'Chris Roberts';
  c.version ||= APP_VERSION;
  return c;
}

function validForStorage(c){ return !!(c?.inspectionId?.trim() && c?.address?.trim()); }

function saveCurrent(showMessage=false){
  const c=state.current;
  if(!c || !validForStorage(c)) return false;
  c.updated=new Date().toISOString();
  c.version=APP_VERSION;
  try{
    localStorage.setItem(c.id, JSON.stringify(c));
    if(showMessage) toast('Inspection saved');
    return true;
  }catch(err){
    console.error(err);
    toast('Could not save inspection data');
    return false;
  }
}

function allInspections(){
  const items=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith(STORAGE_PREFIX)) continue;
    try{
      const c=normalizeInspection(JSON.parse(localStorage.getItem(key)));
      if(validForStorage(c)) items.push(c);
    }catch(err){ console.warn('Skipping unreadable inspection',key,err); }
  }
  return items.sort((a,b)=>new Date(b.updated)-new Date(a.updated));
}

function renderSaved(){
  const query=($('resumeSearch')?.value || state.search || '').trim().toLowerCase();
  state.search=query;
  const all=allInspections();
  const matches=c=>{
    const hay=[c.inspectionId,c.address,c.insured,CONFIGS[c.type]?.title,c.type].join(' ').toLowerCase();
    return !query || hay.includes(query);
  };
  const recent=all.slice(0,RECENT_LIMIT).filter(matches);
  const archived=all.slice(RECENT_LIMIT).filter(matches);
  renderSavedList($('savedList'),recent,query?'No recent inspections match your search.':'No saved inspections yet.');
  $('archiveCount').textContent=archived.length;
  $('archiveDetails').classList.toggle('hidden',!archived.length);
  renderSavedList($('archivedList'),archived,'No archived inspections match your search.');
}

function renderSavedList(box,items,emptyText){
  box.innerHTML='';
  if(!items.length){ box.innerHTML=`<p class="muted">${escapeHtml(emptyText)}</p>`; return; }
  items.forEach(c=>{
    const b=document.createElement('button');
    b.className='saved-item';
    const typeTitle=CONFIGS[c.type]?.title || c.type;
    b.innerHTML=`<strong>${escapeHtml(typeTitle)} — ${escapeHtml(c.inspectionId)}</strong><br><small>${escapeHtml(c.insured || 'No insured / business name')} · ${escapeHtml(c.address)} · ${new Date(c.updated).toLocaleString()}</small>`;
    b.onclick=()=>{ state.current=normalizeInspection(c); renderDashboard(); show('dashboardScreen'); };
    box.appendChild(b);
  });
}

function sectionProgress(section,c){
  let total=0, done=0, touched=0;
  for(const item of section.items){
    if(item.kind==='field'){
      const v=c.data[item.id];
      const isDone=item.type==='checkbox' ? v===true : String(v ?? '').trim()!=='';
      if(item.required){ total++; if(isDone) done++; }
      if(isDone) touched++;
    }else if(item.kind==='photo'){
      const count=(c.photos[section.id]?.[item.id] || []).length;
      if(item.min>0){ total++; if(count>=item.min) done++; }
      if(count>0) touched++;
    }
  }
  const manual=!!c.manualComplete[section.id];
  if(manual || (total>0 && done===total)) return {status:'green',done,total,touched,label:'Complete'};
  if(touched>0 || done>0) return {status:'yellow',done,total,touched,label:'In progress'};
  return {status:total>0?'red':'yellow',done,total,touched,label:total>0?'Not started':'Optional'};
}

function renderDashboard(){
  const c=state.current;
  if(!c) return;
  const cfg=CONFIGS[c.type];
  $('dashTitle').textContent=`${cfg?.title || c.type} Inspection`;
  $('dashMeta').textContent=`${c.inspectionId} • ${c.address}${c.insured?` • ${c.insured}`:''} • ${c.inspector}`;
  $('preferredNotice').classList.toggle('hidden',c.type!=='PreferredCommercial');
  const sections=sectionsFor(c.type);
  const box=$('sectionList'); box.innerHTML='';
  let green=0;
  sections.forEach(section=>{
    const p=sectionProgress(section,c);
    if(p.status==='green') green++;
    const b=document.createElement('button');
    b.className=`section-card status-${p.status}`;
    const reqSummary=p.total?`${p.done}/${p.total} required complete`:(p.touched?`${p.touched} item${p.touched===1?'':'s'} recorded`:'Optional section');
    b.innerHTML=`<span class="section-dot"></span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(reqSummary)}</small></span><span class="section-state">${escapeHtml(p.label)}</span>`;
    b.onclick=()=>openSection(section.id);
    box.appendChild(b);
  });
  $('progressText').textContent=`${green}/${sections.length} sections complete`;
  $('readyText').textContent=green===sections.length?'Ready to export':'In progress';
  $('progressBar').style.width=sections.length?`${Math.round(green/sections.length*100)}%`:'0%';
}

function openSection(sectionId){
  state.currentSectionId=sectionId;
  renderSection();
  show('sectionScreen');
}

function renderSection(){
  const c=state.current, section=sectionById(state.currentSectionId);
  if(!c || !section) return;
  $('sectionTitle').textContent=section.title;
  $('sectionHelp').textContent=section.help || '';
  const p=sectionProgress(section,c);
  $('sectionCompleteBtn').textContent=c.manualComplete[section.id]?'Marked Complete ✓':'Mark Complete';
  $('sectionCompleteBtn').className=c.manualComplete[section.id]?'primary':'secondary';
  const form=$('sectionForm'); form.innerHTML='';
  section.items.forEach(item=>{
    if(item.kind==='photo') form.appendChild(renderPhotoItem(section,item));
    else form.appendChild(renderFieldItem(section,item));
  });
  const summary=document.createElement('div');
  summary.className='section-summary';
  summary.textContent=`Section status: ${p.label}${p.total?` • ${p.done}/${p.total} required complete`:''}`;
  form.appendChild(summary);
  loadSectionThumbnails(section);
}

function renderFieldItem(section,item){
  const c=state.current;
  const wrap=document.createElement('div');
  wrap.className=`field-card ${item.type==='checkbox'?'checkbox-card':''}`;
  const current=c.data[item.id];
  if(item.type==='checkbox'){
    wrap.innerHTML=`<label><input type="checkbox" ${current===true?'checked':''}><span>${escapeHtml(item.label)}${item.required?' <span class="required">Required</span>':''}${item.help?`<small>${escapeHtml(item.help)}</small>`:''}</span></label>`;
    const input=wrap.querySelector('input');
    input.addEventListener('change',()=>{ c.data[item.id]=input.checked; saveCurrent(); renderDashboard(); });
    return wrap;
  }
  let control='';
  const value=current ?? '';
  if(item.type==='textarea') control=`<textarea rows="4" data-field="${escapeHtml(item.id)}">${escapeHtml(value)}</textarea>`;
  else if(item.type==='select') control=`<select data-field="${escapeHtml(item.id)}">${item.options.map(opt=>`<option value="${escapeHtml(opt)}" ${String(value)===String(opt)?'selected':''}>${escapeHtml(opt || 'Select')}</option>`).join('')}</select>`;
  else control=`<input data-field="${escapeHtml(item.id)}" type="${escapeHtml(item.type)}" value="${escapeHtml(value)}" />`;
  wrap.innerHTML=`<label>${escapeHtml(item.label)}${item.required?' <span class="required">Required</span>':''}${item.help?`<small>${escapeHtml(item.help)}</small>`:''}${control}</label>`;
  const input=wrap.querySelector('[data-field]');
  const saveValue=()=>{ c.data[item.id]=item.type==='number' && input.value!==''?Number(input.value):input.value; saveCurrent(); renderDashboard(); };
  input.addEventListener('change',saveValue);
  input.addEventListener('blur',saveValue);
  return wrap;
}

function photoRefs(sectionId,itemId){
  const c=state.current;
  c.photos[sectionId] ||= {};
  c.photos[sectionId][itemId] ||= [];
  return c.photos[sectionId][itemId];
}

function renderPhotoItem(section,item){
  const refs=photoRefs(section.id,item.id);
  const wrap=document.createElement('div');
  wrap.className='photo-item';
  wrap.dataset.photoItem=item.id;
  wrap.innerHTML=`
    <div class="photo-item-head">
      <div><strong>${escapeHtml(item.label)}${item.min?` <span class="required">Min ${item.min}</span>`:''}</strong>${item.help?`<small>${escapeHtml(item.help)}</small>`:''}</div>
      <span class="photo-count">${refs.length} photo${refs.length===1?'':'s'}</span>
    </div>
    <div class="photo-actions"><button class="primary add-photo">Take Photo</button></div>
    <div class="thumb-grid" data-thumbs="${escapeHtml(item.id)}"></div>`;
  wrap.querySelector('.add-photo').onclick=()=>startCamera(section.id,item.id,item.label);
  return wrap;
}

async function loadSectionThumbnails(section){
  for(const item of section.items.filter(i=>i.kind==='photo')){
    const grid=$('sectionForm').querySelector(`[data-thumbs="${CSS.escape(item.id)}"]`);
    if(!grid) continue;
    grid.innerHTML='';
    const refs=photoRefs(section.id,item.id);
    for(const ref of refs){
      const blob=await getPhotoBlob(ref.id);
      if(!blob) continue;
      const url=URL.createObjectURL(blob);
      const card=document.createElement('div');
      card.className='thumb';
      card.innerHTML=`<img alt="${escapeHtml(item.label)}"><button type="button">Delete</button>${ref.note?`<span class="thumb-note">${escapeHtml(ref.note)}</span>`:''}`;
      card.querySelector('img').src=url;
      card.querySelector('img').onload=()=>URL.revokeObjectURL(url);
      card.querySelector('button').onclick=async()=>{
        if(!confirm(`Delete this ${item.label} photo?`)) return;
        await deletePhotoBlob(ref.id);
        const arr=photoRefs(section.id,item.id);
        const idx=arr.findIndex(x=>x.id===ref.id);
        if(idx>=0) arr.splice(idx,1);
        saveCurrent(); renderSection(); renderDashboard(); toast('Photo deleted');
      };
      grid.appendChild(card);
    }
  }
}

function startCamera(sectionId,itemId,label){
  state.pendingPhotoTarget={sectionId,itemId,label};
  const input=$('cameraInput');
  input.value='';
  input.click();
}

async function onCameraFile(e){
  const file=e.target.files?.[0];
  if(!file || !state.pendingPhotoTarget) return;
  try{
    const blob=await compressImage(file);
    state.pendingCapture={blob, originalName:file.name || 'camera.jpg', capturedAt:new Date().toISOString()};
    if(state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl=URL.createObjectURL(blob);
    $('previewImg').src=state.previewUrl;
    $('photoPreviewTitle').textContent=state.pendingPhotoTarget.label;
    $('photoNote').value='';
    showQuality(blob);
    show('photoPreviewScreen');
  }catch(err){
    console.error(err);
    toast('Could not read that photo');
  }
}

async function compressImage(file){
  const bitmap=await createImageBitmap(file);
  const max=2200;
  let w=bitmap.width,h=bitmap.height;
  const scale=Math.min(1,max/Math.max(w,h));
  w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,0,0,w,h);
  bitmap.close?.();
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image conversion failed')),'image/jpeg',0.88));
}

async function showQuality(blob){
  const img=await createImageBitmap(blob);
  const mp=(img.width*img.height)/1_000_000;
  const notes=[];
  let cls='good';
  if(mp<1){ notes.push('Resolution may be low.'); cls='warn'; } else notes.push('Resolution looks usable.');
  if(img.width<img.height) notes.push('Portrait orientation saved.'); else notes.push('Landscape orientation saved.');
  notes.push('Review for blur, glare, darkness, overexposure and framing before using the photo.');
  img.close?.();
  const box=$('qualityBox'); box.className=`quality ${cls}`; box.innerHTML=`<strong>Photo check</strong><p>${escapeHtml(notes.join(' '))}</p>`; box.classList.remove('hidden');
}

async function usePendingPhoto(){
  const target=state.pendingPhotoTarget, pending=state.pendingCapture;
  if(!target || !pending || !state.current) return;
  const id=uid('photo');
  const note=$('photoNote').value.trim();
  await putPhotoBlob(id,pending.blob);
  photoRefs(target.sectionId,target.itemId).push({id,note,capturedAt:pending.capturedAt,originalName:pending.originalName,type:'image/jpeg'});
  saveCurrent();
  clearPendingCapture();
  state.currentSectionId=target.sectionId;
  renderSection(); renderDashboard(); show('sectionScreen');
  if(navigator.vibrate) navigator.vibrate(60);
  toast('Photo saved');
}

function clearPendingCapture(){
  if(state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl=null;
  state.pendingCapture=null;
}

function cancelPreview(){
  const sectionId=state.pendingPhotoTarget?.sectionId;
  clearPendingCapture();
  if(sectionId){ state.currentSectionId=sectionId; renderSection(); show('sectionScreen'); }
  else show('dashboardScreen');
}

function retakePhoto(){
  clearPendingCapture();
  const input=$('cameraInput'); input.value=''; input.click();
}

function departureCheck(){
  const c=state.current;
  if(!c) return;
  const sections=sectionsFor(c.type);
  const incomplete=[];
  const optional=[];
  for(const section of sections){
    const p=sectionProgress(section,c);
    if(p.status==='red' || (p.status==='yellow' && p.total>0)) incomplete.push({section,p});
    else if(p.status==='yellow') optional.push(section);
  }
  let html='';
  if(!incomplete.length){
    html+=`<div class="notice"><strong class="good-text">No required section gaps detected.</strong><br>Still review optional sections and image quality before leaving.</div>`;
  }else{
    html+=`<div class="error"><strong>${incomplete.length} section${incomplete.length===1?'':'s'} still have required gaps.</strong></div><ul>`;
    incomplete.forEach(({section,p})=>{ html+=`<li><strong>${escapeHtml(section.title)}</strong> — ${p.done}/${p.total} required complete</li>`; });
    html+='</ul>';
  }
  if(optional.length){ html+=`<h3>Optional sections not marked complete</h3><ul>${optional.map(s=>`<li>${escapeHtml(s.title)}</li>`).join('')}</ul>`; }
  html+=`<p class="muted">You can still export at any time. OrganizeALot does not block the inspector from saving when a photo or optional item cannot be obtained.</p>`;
  $('reviewResults').innerHTML=html;
  show('reviewScreen');
}

async function exportInspection(){
  const c=state.current;
  if(!c || !validForStorage(c)) return;
  saveCurrent();
  if(typeof JSZip==='undefined'){
    alert('ZIP library did not load. Refresh the app and try again.');
    return;
  }
  const button=$('finishExportBtn');
  const oldText=button.textContent; button.disabled=true; button.textContent='Building ZIP…';
  try{
    const zip=new JSZip();
    const exportCopy=JSON.parse(JSON.stringify(c));
    exportCopy.exported=new Date().toISOString();
    exportCopy.appVersion=APP_VERSION;
    exportCopy.photoSummary=[];

    const cfg=CONFIGS[c.type];
    const root=zip.folder(`${sanitizeName(cfg?.title || c.type)}_${sanitizeName(c.inspectionId)}_${sanitizeName(c.address)}`);
    for(const section of sectionsFor(c.type)){
      const sectionFolder=root.folder(sanitizeName(section.title));
      for(const item of section.items.filter(i=>i.kind==='photo')){
        const refs=c.photos[section.id]?.[item.id] || [];
        exportCopy.photoSummary.push({section:section.title,item:item.label,count:refs.length,minimum:item.min||0});
        if(!refs.length) continue;
        const itemFolder=sectionFolder.folder(sanitizeName(item.label));
        let n=1;
        for(const ref of refs){
          const blob=await getPhotoBlob(ref.id);
          if(!blob) continue;
          const num=String(n++).padStart(2,'0');
          itemFolder.file(`${num}_${sanitizeName(item.label)}.jpg`,blob);
          if(ref.note) itemFolder.file(`${num}_${sanitizeName(item.label)}_note.txt`,ref.note);
        }
      }
    }
    root.file('inspection_report.json',JSON.stringify(exportCopy,null,2));
    root.file('inspection_report.html',buildPrintableReport(c));
    root.file('EXPORT_INFO.txt',`OrganizeALot ${APP_VERSION}\nExported: ${new Date().toLocaleString()}\n\nPreferred save target: OneDrive / NIIS when available on this device.\nNo Azure, Microsoft Entra, Client ID, Microsoft sign-in or MSAL is required.\n`);

    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const filename=`OrganizeALot_${sanitizeName(c.inspectionId)}_${sanitizeName(c.address)}.zip`;
    button.textContent='Opening save options…';
    await saveZip(blob,filename);
    toast('Export ready');
  }catch(err){
    console.error(err);
    alert(`Export failed: ${err.message || err}`);
  }finally{
    button.disabled=false; button.textContent=oldText;
  }
}

async function saveZip(blob,filename){
  const file=new File([blob],filename,{type:'application/zip'});
  if('showSaveFilePicker' in window){
    try{
      const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'ZIP archive',accept:{'application/zip':['.zip']}}]});
      const writable=await handle.createWritable();
      await writable.write(blob); await writable.close();
      return;
    }catch(err){ if(err?.name==='AbortError') throw err; }
  }
  if(navigator.canShare?.({files:[file]})){
    try{
      await navigator.share({files:[file],title:'Save OrganizeALot inspection ZIP',text:'Choose OneDrive → NIIS or another folder.'});
      return;
    }catch(err){ if(err?.name==='AbortError') throw err; }
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function buildPrintableReport(c){
  const cfg=CONFIGS[c.type];
  let body=`<h1>${escapeHtml(cfg?.title || c.type)} Inspection</h1><p><strong>Inspection ID:</strong> ${escapeHtml(c.inspectionId)}<br><strong>Address:</strong> ${escapeHtml(c.address)}<br><strong>Insured / Business:</strong> ${escapeHtml(c.insured || '')}<br><strong>Inspector:</strong> ${escapeHtml(c.inspector)}<br><strong>Updated:</strong> ${escapeHtml(new Date(c.updated).toLocaleString())}</p>`;
  for(const section of sectionsFor(c.type)){
    body+=`<h2>${escapeHtml(section.title)}</h2><table><tbody>`;
    for(const item of section.items){
      if(item.kind==='field'){
        const v=c.data[item.id];
        const display=item.type==='checkbox'?(v===true?'Yes':'No'):(v ?? '');
        if(display!=='' || item.required) body+=`<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(display)}</td></tr>`;
      }else{
        const count=(c.photos[section.id]?.[item.id] || []).length;
        body+=`<tr><th>${escapeHtml(item.label)}</th><td>${count} photo${count===1?'':'s'}${item.min?` (minimum ${item.min})`:''}</td></tr>`;
      }
    }
    body+='</tbody></table>';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(c.inspectionId)} Inspection Report</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:2px solid #333;padding-bottom:4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}th{width:42%;background:#f3f4f6}</style></head><body>${body}<p><small>Generated by OrganizeALot ${escapeHtml(APP_VERSION)}</small></p></body></html>`;
}

function openDb(){
  if(state.dbPromise) return state.dbPromise;
  state.dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return state.dbPromise;
}

async function putPhotoBlob(id,blob){ const db=await openDb(); return txPromise(db.transaction(PHOTO_STORE,'readwrite').objectStore(PHOTO_STORE).put(blob,id)); }
async function getPhotoBlob(id){ const db=await openDb(); return txPromise(db.transaction(PHOTO_STORE,'readonly').objectStore(PHOTO_STORE).get(id)); }
async function deletePhotoBlob(id){ const db=await openDb(); return txPromise(db.transaction(PHOTO_STORE,'readwrite').objectStore(PHOTO_STORE).delete(id)); }
function txPromise(req){ return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }

function startNew(type){
  state.current=blankInspection(type);
  $('setupTitle').textContent=`New ${CONFIGS[type]?.title || type} Inspection`;
  $('inspectionId').value=''; $('address').value=''; $('insured').value=''; $('inspector').value='Chris Roberts';
  $('setupError').classList.add('hidden');
  $('setupClientNotice').classList.toggle('hidden',type!=='PreferredCommercial');
  if(type==='PreferredCommercial') $('setupClientNotice').innerHTML='<strong>Preferred Reports Commercial.</strong> Appointment and interior-access details are handled inside the job workflow.';
  show('setupScreen');
}

function startInspection(){
  const c=state.current;
  c.inspectionId=$('inspectionId').value.trim();
  c.address=$('address').value.trim();
  c.insured=$('insured').value.trim();
  c.inspector=$('inspector').value.trim() || 'Chris Roberts';
  if(!c.inspectionId || !c.address){
    $('setupError').textContent='Enter both Inspection ID and Address before starting. Blank inspections will not be saved.';
    $('setupError').classList.remove('hidden');
    return;
  }
  $('setupError').classList.add('hidden');
  saveCurrent();
  renderDashboard(); show('dashboardScreen');
}

function getSetupAddress(){
  return $('address').value.trim();
}

function requireSetupAddress(){
  const address=getSetupAddress();
  if(address) return address;
  $('setupError').textContent='Enter the property address first, then open navigation.';
  $('setupError').classList.remove('hidden');
  $('address').focus();
  return '';
}

function openMap(){
  const address=requireSetupAddress();
  if(!address) return;
  const q=encodeURIComponent(address);
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`,'_blank');
}

function openWaze(){
  const address=requireSetupAddress();
  if(!address) return;
  $('setupError').classList.add('hidden');
  const q=encodeURIComponent(address);
  window.open(`https://waze.com/ul?q=${q}&navigate=yes&utm_source=organizealot`,'_blank');
}

function toggleSectionComplete(){
  const c=state.current, id=state.currentSectionId;
  if(!c || !id) return;
  c.manualComplete[id]=!c.manualComplete[id];
  saveCurrent(); renderSection(); renderDashboard(); toast(c.manualComplete[id]?'Section marked complete':'Section reopened');
}

// Event wiring
document.querySelectorAll('.tile').forEach(b=>b.addEventListener('click',()=>startNew(b.dataset.type)));
document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.screen)));
$('startBtn').addEventListener('click',startInspection);
$('openMapBtn').addEventListener('click',openMap);
$('openWazeBtn').addEventListener('click',openWaze);
$('saveBtn').addEventListener('click',()=>saveCurrent(true));
$('sectionCompleteBtn').addEventListener('click',toggleSectionComplete);
$('cameraInput').addEventListener('change',onCameraFile);
$('usePhotoBtn').addEventListener('click',usePendingPhoto);
$('retakeBtn').addEventListener('click',retakePhoto);
$('cancelPreviewBtn').addEventListener('click',cancelPreview);
$('departureBtn').addEventListener('click',departureCheck);
$('finishExportBtn').addEventListener('click',exportInspection);
$('resumeSearch').addEventListener('input',renderSaved);

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredInstall=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click',async()=>{ if(state.deferredInstall){ state.deferredInstall.prompt(); state.deferredInstall=null; $('installBtn').classList.add('hidden'); } });
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err=>console.warn('Service worker registration failed',err));

renderSaved();
