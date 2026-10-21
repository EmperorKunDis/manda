import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const source=await readFile(new URL('web/disassembly.js',base),'utf8');
const {STEPS,poseAt,interpolatePose}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const meta=JSON.parse(await readFile(new URL('web/export/parts_metadata.json',base),'utf8'));
const ids=new Set(meta.parts.map(p=>p.id));
const offset=(pose,id)=>pose[id]||[0,0,0];

test('every guided part exists in the active GLB and metadata',async()=>{
 const b=await readFile(new URL('web/export/syncdrive_sport.glb',base));
 assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);
 const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 const roots=gltf.scenes[gltf.scene||0].nodes.map(i=>gltf.nodes[i]);
 assert.deepEqual(new Set(roots.map(n=>n.extras.id)),ids);
 assert.equal(ids.size,34);assert(!ids.has('case_bolt_07'));
 for(const step of STEPS)for(const id of step.parts)assert(ids.has(id),id);
 for(let i=0;i<STEPS.length;i++)for(const id of Object.keys(poseAt(i)))assert(ids.has(id),id);
 assert.equal(meta.parts.filter(p=>p.kit).length,4);
 for(const [a,c] of [['PLY00420','PLY00427'],['PLY00421','PLY00426']])assert.deepEqual(roots.find(n=>n.name===a).translation,roots.find(n=>n.name===c).translation,'O-ring must share its bearing axis and groove plane');
});

test('subassemblies stay together until the dependent service operation',()=>{
 assert.equal(STEPS[1].parts.length,6);
 const drive=['gear_101','output_sprocket','oneway_pedal','PLY00420','PLY00427'];
 const compound=['gear_56','gear_16','intermediate_shaft','PLY00423B','PLY00424'];
 const crank=['crank_spindle','PLY00421','PLY00426','torque_sensor'];
 for(let i=0;i<10;i++)for(const id of drive)assert.deepEqual(offset(poseAt(i),id),offset(poseAt(i),drive[0]));
 for(let i=0;i<STEPS.length;i++)for(const id of compound)assert.deepEqual(offset(poseAt(i),id),offset(poseAt(i),compound[0]));
 for(let i=0;i<12;i++)for(const id of crank)assert.deepEqual(offset(poseAt(i),id),offset(poseAt(i),crank[0]));
 assert.notDeepEqual(poseAt(10).PLY00420,poseAt(10).gear_101);
 assert.notDeepEqual(poseAt(11).PLY00427,poseAt(11).PLY00420);
 assert.notDeepEqual(poseAt(12).torque_sensor,poseAt(12).crank_spindle);
 assert.notDeepEqual(poseAt(13).PLY00421,poseAt(13).crank_spindle);
 assert.notDeepEqual(poseAt(14).PLY00426,poseAt(14).PLY00421);
});

test('the bearing-kit branch does not dismantle the electric motor or fixed case bearings',()=>{
 for(let i=0;i<STEPS.length;i++)for(const id of ['motor_stator','motor_rotor','gear_8','housing_motor_side','pressure_vent','PLY00422','PLY00423A'])assert.deepEqual(offset(poseAt(i),id),[0,0,0]);
});

test('transitions extract axially before parking, with exact reversible endpoints',()=>{
 for(let i=1;i<STEPS.length;i++)for(const [from,to] of [[poseAt(i-1),poseAt(i)],[poseAt(i),poseAt(i-1)]]){
  for(const id of Object.keys({...from,...to})){
   assert.deepEqual(interpolatePose(from,to,0)[id],offset(from,id));
   assert.deepEqual(interpolatePose(from,to,1)[id],offset(to,id));
  }
 }
 const from=poseAt(2),to=poseAt(3),half=interpolatePose(from,to,.5);
 assert.equal(half.gear_101[0],0);assert.equal(half.gear_101[1],0);assert(half.gear_101[2]<0);
 const back=interpolatePose(to,from,.5);assert.equal(back.gear_101[2],to.gear_101[2]);
 const transfer=interpolatePose(poseAt(4),poseAt(5),.4);
 assert(transfer.freewheel_bush[2]<0);assert.deepEqual(transfer.gear_56,[0,0,0],'bush comes off before compound gear moves');
});

test('all steps link to the reference and state the model limits',()=>{
 assert.equal(STEPS.length,16);
 assert(STEPS[0].note.includes('varianta'));
 assert(STEPS[8].note.includes('konektoru'));
 assert(STEPS.at(-1).note.includes('montážní'));
 assert(meta.variant.includes('není identifikován'));
});
