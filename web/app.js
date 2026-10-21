import * as THREE from 'three';
import {OrbitControls} from './vendor/controls/OrbitControls.js';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {STEPS,REFERENCE_VIDEO,poseAt,interpolatePose,scalesAt,interpolateScales} from './disassembly.js';

function showError(title, description){
  document.getElementById('load-state').textContent='MODEL NENÍ DOSTUPNÝ';
  const message=document.getElementById('stage-message');
  message.hidden=false;message.classList.add('error');
  document.getElementById('stage-message-title').textContent=title;
  document.getElementById('stage-message-text').textContent=description;
  document.getElementById('retry').hidden=false;
}
document.getElementById('retry').addEventListener('click',()=>location.reload());

function initialize(){
const $ = (id) => document.getElementById(id);
const modelControls=[...document.querySelectorAll('button:not(#retry), input')];
modelControls.forEach(control=>control.disabled=true);
const wrap=$('canvas-wrap'), stage=$('stage');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,1,.001,20);
camera.up.set(0,0,-1);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.42;
renderer.setClearColor(0,0);
renderer.domElement.setAttribute('aria-label','3D model motoru; pro výběr dílu lze použít také seznam součástí');
renderer.domElement.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  modelControls.forEach(control=>control.disabled=true);
  showError('3D zobrazení bylo přerušeno','Obnovte zobrazení tlačítkem Zkusit znovu.');
});
wrap.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;
controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI-.08;
scene.add(new THREE.HemisphereLight(0xe2f3ee,0x5c625c,2.5));
function light(color,intensity,x,y,z){const l=new THREE.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l)}
light(0xffe6bf,3.2,-1,-2,3);light(0xd3e6ff,2.4,2,1,-2);light(0xffffff,1.5,-2,1,1);

let data=null,model=null,records=[],recordById=new Map(),selected=null,hidden=new Set(),removed=new Map(),explode=0,kitMode=false,housingMode=false,filter='all';
const homeDirection=new THREE.Vector3(.48,-1,-.42).normalize();
let autoFrame=true;
let guideMode=true,stepIndex=0,guidePose={},guideScales={},motion=null;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const housingIds=new Set(['housing_gear_side','housing_motor_side']);

function allMeshes(root){const arr=[];root.traverse(o=>{if(o.isMesh)arr.push(o)});return arr}
function vecFromBlenderMm(v){return new THREE.Vector3(v[0]/1000,v[2]/1000,-v[1]/1000)}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function recordFor(obj){while(obj){const r=recordById.get(obj.userData?.id)||recordById.get(obj.name);if(r)return r;obj=obj.parent}return null}

function installParts(){
  const missing=[];
  for(const item of data.parts){
    let node=null;
    model.traverse(o=>{if(!node && (o.userData?.id===item.id||o.name===item.id))node=o});
    if(!node){missing.push(item.id);continue}
    const r={meta:item,node,base:node.position.clone(),baseScale:node.scale.clone(),offset:vecFromBlenderMm(item.explode_blender_mm),meshes:allMeshes(node)};
    for(const mesh of r.meshes){
      if(Array.isArray(mesh.material))mesh.material=mesh.material.map(m=>m.clone());
      else mesh.material=mesh.material.clone();
      mesh.materialsOriginal=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>({opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,emissive:m.emissive?.clone(),emissiveIntensity:m.emissiveIntensity}));
      mesh.userData.partId=item.id;
    }
    records.push(r);recordById.set(item.id,r)
  }
  if(missing.length)throw Error('Chybějící díly: '+missing.join(', '));
  modelControls.forEach(control=>control.disabled=false);
  $('stage-message').hidden=true;
  $('part-count').textContent=`${records.length} DÍLŮ`;
  $('load-state').textContent=missing.length?`NAČTENO · ${missing.length} CHYBÍ`:'MODEL PŘIPRAVEN';
  setSelected(null);
  buildStepList();setGuideStep(0,false);
}

function placeParts(){
  let freePose=null,freeScales=null;
  if(!guideMode){
    const progress=explode*(STEPS.length-1),start=Math.floor(progress),end=Math.min(STEPS.length-1,start+1),t=progress-start;
    freePose=interpolatePose(poseAt(start),poseAt(end),t);freeScales=interpolateScales(poseAt(start),poseAt(end),t);
  }
  for(const r of records){
    r.node.position.copy(r.base);
    if(guideMode)r.node.position.add(vecFromBlenderMm(guidePose[r.meta.id]||[0,0,0]));
    else{
      r.node.position.add(vecFromBlenderMm(freePose[r.meta.id]||[0,0,0]));
    }
    const radial=(guideMode?guideScales:freeScales)[r.meta.id]||1;
    r.node.scale.copy(r.baseScale);r.node.scale.x*=radial;r.node.scale.z*=radial;
    const opened=guideMode?stepIndex>=2:explode*(STEPS.length-1)>=2;
    r.node.visible=!hidden.has(r.meta.id)&&!(r.meta.id==='liquid_gasket'&&opened);
  }
  if(!guideMode&&removed.size){
    // Manual inspection parks each whole part in its own empty bounding-box slot.
    // Recompute slots after a slider change so parked parts cannot meet the assembly again.
    const assembly=new THREE.Box3();
    for(const r of records)if(!removed.has(r.meta.id))assembly.union(new THREE.Box3().setFromObject(r.node));
    let cursor=assembly.isEmpty()?0:assembly.max.x;
    for(const [id,count] of removed){
      const r=recordById.get(id),box=new THREE.Box3().setFromObject(r.node);
      const center=box.getCenter(new THREE.Vector3()),width=box.getSize(new THREE.Vector3()).x;
      cursor+=.035*count;r.node.position.x+=cursor+width/2-center.x;cursor+=width;
    }
  }
}

function setAssembly(){
  placeParts();
  const currentParts=guideMode?STEPS[stepIndex].parts:[];
  for(const r of records){
    for(const mesh of r.meshes){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      materials.forEach((m,i)=>{
        const original=mesh.materialsOriginal[i];
        const translucent=housingIds.has(r.meta.id)&&(housingMode||kitMode);
        m.transparent=translucent||original.transparent;
        m.opacity=translucent ? .16 : original.opacity;
        m.depthWrite=translucent?false:original.depthWrite;
        if(m.emissive){
          m.emissive.copy(original.emissive||new THREE.Color(0));
          m.emissiveIntensity=original.emissiveIntensity||1;
          if(kitMode&&r.meta.kit){m.emissive.set('#aa6826');m.emissiveIntensity=.65}
          if(currentParts.includes(r.meta.id)){m.emissive.set('#598c75');m.emissiveIntensity=.45}
          if(selected===r){m.emissive.set('#b18a46');m.emissiveIntensity=.6}
        }
        m.needsUpdate=true;
      })
    }
  }
  $('visible-count').textContent=`${records.filter(r=>r.node.visible).length} VIDITELNÝCH`;
}

function setSelected(r){
  selected=r;
  if(!r){
    $('selected-name').textContent='Vyberte díl';
    $('selected-id').textContent='';
    $('selected-description').textContent='Klepněte na součást modelu nebo na položku v seznamu. Díl pak můžete skrýt, vrátit či zaměřit kamerou.';
    $('selected-status').textContent='Průzkum sestavy';
    $('selected-status').className='fact-pill';
    $('hide-part').disabled=$('focus-part').disabled=$('remove-part').disabled=$('restore-part').disabled=true;
    $('selected-source').hidden=true;
    $('hide-part').textContent='Skrýt';$('remove-part').textContent='Vyjmout';
  }else{
    const m=r.meta;
    $('selected-name').textContent=m.name;
    $('selected-id').textContent=m.id;
    $('selected-description').textContent=m.description;
    $('selected-status').textContent=m.verification;
    $('selected-status').className='fact-pill '+(m.verification.startsWith('ověř')?'verified':'');
    $('focus-part').disabled=false;
    $('hide-part').disabled=$('remove-part').disabled=guideMode;
    if(m.id==='liquid_gasket')$('remove-part').disabled=true;
    $('restore-part').disabled=guideMode||(!hidden.has(m.id)&&!removed.has(m.id));
    $('hide-part').textContent=hidden.has(m.id)?'Zobrazit':'Skrýt';
    $('remove-part').textContent=removed.has(m.id)?'Vyjmout dál':'Vyjmout';
    const link=$('selected-source');link.hidden=!m.source;link.href=m.source||'#';
  }
  setAssembly();renderList();
}

function renderList(){
  const q=norm($('search').value);const list=$('part-list');list.replaceChildren();
  const filtered=records.filter(r=>{
    const m=r.meta;
    return(!q||norm(m.name+' '+m.id+' '+m.category).includes(q))&&
      (filter==='all'||(filter==='kit'&&m.kit)||(filter==='hidden'&&hidden.has(m.id)))
  });
  const categories=[...new Set(records.map(r=>r.meta.category))];
  filtered.sort((a,b)=>categories.indexOf(a.meta.category)-categories.indexOf(b.meta.category));
  let category='';
  for(const r of filtered){
    const m=r.meta;
    if(m.category!==category){category=m.category;const heading=document.createElement('div');heading.className='group-heading';heading.textContent=category.toUpperCase();list.appendChild(heading)}
    const involved=guideMode&&STEPS[stepIndex].parts.includes(m.id);
    const b=document.createElement('button');b.type='button';b.className='part-item'+(selected===r?' active':'')+(hidden.has(m.id)?' hidden':'')+(m.kit?' kit':'')+(involved?' current-step':'');b.dataset.id=m.id;
    b.setAttribute('aria-pressed',String(selected===r));
    b.innerHTML='<span class="part-indicator"></span><span></span><span class="eye"></span>';
    b.children[1].textContent=m.name;b.children[2].textContent=involved?'KROK':hidden.has(m.id)?'SKRYTO':removed.has(m.id)?'VYJMUTO':'↗';
    b.addEventListener('click',()=>setSelected(r));list.appendChild(b)
  }
  if(!filtered.length){const empty=document.createElement('p');empty.style.cssText='font-size:12px;color:#8a9f9a;padding:15px 2px';empty.textContent='Žádný díl neodpovídá výběru.';list.appendChild(empty)}
}

function focus(r){
  if(!r)return;
  autoFrame=false;
  frameBox(new THREE.Box3().setFromObject(r.node));
}

function frameBox(box,direction){
  if(box.isEmpty())return;
  const center=box.getCenter(new THREE.Vector3());
  const radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.003);
  const vertical=THREE.MathUtils.degToRad(camera.fov/2);
  const horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
  const distance=radius/Math.sin(Math.min(vertical,horizontal)) * 1.18;
  const viewDir=direction||camera.position.clone().sub(controls.target).normalize();
  if(viewDir.lengthSq()===0)viewDir.copy(homeDirection);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDir,distance);
  camera.near=Math.max(.00005,radius/1000);camera.far=Math.max(5,distance+radius*30);
  controls.minDistance=Math.max(.002,radius*.15);controls.maxDistance=Math.max(3,distance*8);
  camera.updateProjectionMatrix();controls.update();
}
function fitCamera(reset=false){
  if(!model)return;
  const box=new THREE.Box3();
  for(const r of records)if(r.node.visible)box.union(new THREE.Box3().setFromObject(r.node));
  frameBox(box,reset?homeDirection:null);
}
controls.addEventListener('start',()=>{autoFrame=false});
function setExplode(value){
  if(guideMode)return;
  explode=Number(value)/100;
  $('explode').value=value;$('explode-value').textContent=`${value} %`;
  setAssembly();autoFrame=true;fitCamera();
}

function buildStepList(){
  $('step-list').replaceChildren();
  STEPS.forEach((step,index)=>{
    const item=document.createElement('li'),button=document.createElement('button');
    button.textContent=`${index===0?'Příprava':index+'.'} ${step.title}`;
    button.addEventListener('click',()=>setGuideStep(index));
    item.appendChild(button);$('step-list').appendChild(item);
  });
}
function syncGuide(){
  const step=STEPS[stepIndex],busy=Boolean(motion);
  $('guide-panel').hidden=$('guide-nav').hidden=!guideMode;
  $('free-controls').hidden=guideMode;
  $('inspection-note').hidden=!guideMode;
  $('mode-guide').setAttribute('aria-pressed',String(guideMode));
  $('mode-free').setAttribute('aria-pressed',String(!guideMode));
  $('step-count').textContent=`${stepIndex} / ${STEPS.length-1}`;
  $('step-progress').value=stepIndex;
  $('step-progress').max=STEPS.length-1;
  $('step-title').textContent=$('stage-step-title').textContent=step.title;
  $('stage-step-count').textContent=stepIndex?`KROK ${stepIndex} / ${STEPS.length-1}`:'PŘÍPRAVA · REFERENCE PW';
  $('step-text').textContent=step.text;
  $('step-tool').textContent=step.tool;
  $('step-note').textContent=step.note||'Pořadí doloženo na referenčním PW. Rozměry a dráha v modelu jsou schematické.';
  $('step-source').href=`${REFERENCE_VIDEO}&t=${step.time}s`;
  $('step-source').textContent=`Video PW · ${Math.floor(step.time/60)}:${String(step.time%60).padStart(2,'0')} ↗`;
  $('step-prev').disabled=busy||stepIndex===0;
  $('step-next').disabled=busy||stepIndex===STEPS.length-1;
  $('step-replay').disabled=busy||stepIndex===0;
  $('step-next').textContent=stepIndex===STEPS.length-1?'Sada zpřístupněna':'Další krok →';
  $('mode-free').disabled=$('mode-guide').disabled=busy;
  $('view-assembled').disabled=$('view-exploded').disabled=$('assemble').disabled=busy;
  for(let i=0;i<$('step-list').children.length;i++){
    const button=$('step-list').children[i].children[0];
    button.disabled=busy||i>stepIndex+1;
    button.setAttribute('aria-current',i===stepIndex?'step':'false');
  }
}
function setGuideStep(index,animate=true){
  if(!guideMode||motion||index<0||index>=STEPS.length||index>stepIndex+1)return;
  // A distant history selection restores a valid state directly; it does not
  // run several independently validated extraction paths simultaneously.
  if(Math.abs(index-stepIndex)>1)animate=false;
  const from=guidePose,to=poseAt(index);
  stepIndex=index;selected=null;
  // Fit both endpoints before the move so the camera stays still during extraction.
  const bounds=new THREE.Box3();
  for(const pose of [from,to]){
    guidePose=pose;guideScales=scalesAt(pose);placeParts();
    for(const r of records)if(r.node.visible)bounds.union(new THREE.Box3().setFromObject(r.node));
  }
  const moving=JSON.stringify(from)!==JSON.stringify(to);
  if(animate&&!reducedMotion&&moving){guidePose=from;guideScales=scalesAt(from);motion={from,to,start:performance.now(),duration:index===5?1600:1100};}
  else{guidePose=to;guideScales=scalesAt(to);}
  setSelected(null);syncGuide();autoFrame=true;frameBox(bounds);
}
function setMode(mode){
  if(motion)return;
  guideMode=mode;guidePose={};guideScales={};stepIndex=0;hidden.clear();removed.clear();explode=0;selected=null;
  $('explode').value=0;$('explode-value').textContent='0 %';
  kitMode=false;housingMode=false;$('kit').setAttribute('aria-pressed','false');$('housing').setAttribute('aria-pressed','false');
  $('search').value='';filter='all';
  document.querySelectorAll('.filter').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',String(b.dataset.filter==='all'))});
  syncGuide();setSelected(null);autoFrame=true;fitCamera(true);
}
$('mode-guide').addEventListener('click',()=>setMode(true));
$('mode-free').addEventListener('click',()=>setMode(false));
$('step-next').addEventListener('click',()=>setGuideStep(stepIndex+1));
$('step-prev').addEventListener('click',()=>setGuideStep(stepIndex-1));
$('step-replay').addEventListener('click',()=>{if(motion||stepIndex===0)return;guidePose=poseAt(stepIndex-1);setGuideStep(stepIndex)});

const loader=new GLTFLoader();
Promise.all([fetch('./export/parts_metadata.json').then(r=>{if(!r.ok)throw Error('Metadata '+r.status);return r.json()}),
  loader.loadAsync('./export/syncdrive_sport.glb')]).then(([meta,gltf])=>{
    data=meta;model=gltf.scene;scene.add(model);installParts();fitCamera(true);
  }).catch(err=>{console.error(err);modelControls.forEach(control=>control.disabled=true);showError('Motor se nepodařilo načíst','Spusťte web pomocí Spustit.command. Pokud už běží, zkuste načtení zopakovat.');});

$('explode').addEventListener('input',e=>setExplode(e.target.value));
$('view-assembled').addEventListener('click',()=>setMode(guideMode));
$('view-exploded').addEventListener('click',()=>{setMode(false);setExplode(100)});
$('fit-all').addEventListener('click',()=>{autoFrame=true;fitCamera()});
$('kit').addEventListener('click',()=>{kitMode=!kitMode;$('kit').setAttribute('aria-pressed',String(kitMode));setAssembly()});
$('housing').addEventListener('click',()=>{housingMode=!housingMode;$('housing').setAttribute('aria-pressed',String(housingMode));setAssembly()});
$('assemble').addEventListener('click',()=>setMode(guideMode));
$('camera-reset').addEventListener('click',()=>{autoFrame=true;fitCamera(true)});
$('hide-part').addEventListener('click',()=>{if(!selected||guideMode)return;const id=selected.meta.id;hidden.has(id)?hidden.delete(id):hidden.add(id);setSelected(selected)});
$('remove-part').addEventListener('click',()=>{if(!selected||guideMode||selected.meta.id==='liquid_gasket')return;const id=selected.meta.id;hidden.delete(id);removed.set(id,(removed.get(id)||0)+1);setSelected(selected);autoFrame=true;fitCamera()});
$('restore-part').addEventListener('click',()=>{if(!selected||guideMode)return;hidden.delete(selected.meta.id);removed.delete(selected.meta.id);setSelected(selected)});
$('focus-part').addEventListener('click',()=>{if(selected){hidden.delete(selected.meta.id);setSelected(selected);focus(selected)}});
$('search').addEventListener('input',renderList);
document.querySelectorAll('.filter').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.filter===filter));b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});renderList()})});
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!model||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){down=null;return}down=null;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const intersections=raycaster.intersectObject(model,true);
  for(const hit of intersections){const r=recordFor(hit.object);if(r&&!hidden.has(r.meta.id)&&!(housingIds.has(r.meta.id)&&(housingMode||kitMode))){setSelected(r);return}}
});
function resize(){const w=wrap.clientWidth,h=wrap.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(autoFrame)fitCamera()}}
new ResizeObserver(resize).observe(wrap);resize();
function animate(time){
  requestAnimationFrame(animate);
  if(motion){
    const t=Math.min(1,Math.max(0,((time??performance.now())-motion.start)/motion.duration));
    guidePose=interpolatePose(motion.from,motion.to,t);guideScales=interpolateScales(motion.from,motion.to,t);placeParts();
    if(t>=1){guidePose=motion.to;guideScales=scalesAt(guidePose);motion=null;placeParts();syncGuide();}
  }
  controls.update();renderer.render(scene,camera);
}animate();
}
try{initialize()}catch(error){
  console.error(error);
  showError('3D zobrazení není dostupné','Použijte prohlížeč s podporou WebGL. Zkontrolujte, zda máte zapnutou hardwarovou akceleraci.');
}
