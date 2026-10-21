// Coherent schematic assembly with actual cavities, shaft bores and explicit clearance regions.
// These dimensions resolve the study's overlaps; they are not measured OEM CAD dimensions.
import fs from 'node:fs/promises';
import {Shape,Path,ExtrudeGeometry,TorusGeometry,Matrix4} from '../web/vendor/three.core.js';
const root=new URL('../',import.meta.url),source=new URL('backups/before-clearance-20261019/',root);
const b=await fs.readFile(new URL('syncdrive_sport.glb',source));
const jlen=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+jlen));
const binOffset=20+jlen,original=b.subarray(binOffset+8,binOffset+8+b.readUInt32LE(binOffset));
let buffers=[original],bytes=original.length;
const metadata=JSON.parse(await fs.readFile(new URL('parts_metadata.json',source),'utf8'));
const records=new Map(metadata.parts.map(p=>[p.id,p]));
const nodes=new Map(g.scenes[g.scene||0].nodes.map(i=>[g.nodes[i].extras.id,g.nodes[i]]));
const axes={crank:[-30,0],transfer:[28,24],motor:[48,-6]};
const toGL=v=>[v[0]/1000,v[2]/1000,-v[1]/1000];
const circle=(r,c=[0,0],n=128)=>Array.from({length:n},(_,i)=>[c[0]+r*Math.cos(i*2*Math.PI/n),c[1]+r*Math.sin(i*2*Math.PI/n)]);
const rectangle=(w,h,c=[0,0])=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(p=>[p[0]+c[0],p[1]+c[1]]);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points){const p=points.toSorted((a,b)=>a[0]-b[0]||a[1]-b[1]);const lo=[],hi=[];for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q)}for(const q of p.toReversed()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=0)hi.pop();hi.push(q)}return [...lo.slice(0,-1),...hi.slice(0,-1)]}
function offset(poly,d){return poly.map((p,i)=>{const prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length];const normal=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);return [dy/length,-dx/length]};const a=normal(prev,p),c=normal(p,next),den=1+a[0]*c[0]+a[1]*c[1];return [p[0]+d*(a[0]+c[0])/den,p[1]+d*(a[1]+c[1])/den]})}
function perimeterPoints(poly,n){const edges=poly.map((p,i)=>Math.hypot(p[0]-poly[(i+1)%poly.length][0],p[1]-poly[(i+1)%poly.length][1]));const length=edges.reduce((a,b)=>a+b,0);return Array.from({length:n},(_,i)=>{let distance=length*(i+.28)/n,k=0;while(distance>edges[k])distance-=edges[k++];const t=distance/edges[k],a=poly[k],b=poly[(k+1)%poly.length];return a.map((v,j)=>v+(b[j]-v)*t)})}
const interior=hull([...circle(58,axes.crank),...circle(36,axes.transfer),...circle(29,axes.motor),...rectangle(58,32,[18,-45])]);
const exterior=offset(interior,12),boltCenters=perimeterPoints(offset(interior,6),6);
const material=(name,color,metal=.6,rough=.4)=>{g.materials.push({name,doubleSided:false,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:metal,roughnessFactor:rough}});return g.materials.length-1};
const cast=material('Opravený dutý odlitek',[.12,.15,.17],.65,.42),steel=material('Obrobená ocel',[.46,.53,.58],.85,.3),dark=material('Tmavá ocel',[.13,.17,.19],.75,.36),rubber=material('Elastomer',[.025,.032,.035],0,.78),nylon=material('Polyamid',[.77,.73,.60],0,.48),pcb=material('Deska elektroniky',[.045,.22,.13],0,.56),copper=material('Vinutí',[.59,.22,.075],.65,.4);
function attribute(array,components,label){if(bytes%4){const pad=Buffer.alloc(4-bytes%4);buffers.push(pad);bytes+=pad.length}const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),start=bytes;buffers.push(data);bytes+=data.length;const view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:start,byteLength:data.length,target:34962});const accessor={bufferView:view,componentType:5126,count:array.length/components,type:components===3?'VEC3':'VEC2'};if(label==='POSITION'){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i+=3)for(let k=0;k<3;k++){accessor.min[k]=Math.min(accessor.min[k],array[i+k]);accessor.max[k]=Math.max(accessor.max[k],array[i+k])}}g.accessors.push(accessor);return g.accessors.length-1}
function primitive(geometry,mat){geometry.applyMatrix4(new Matrix4().makeRotationX(-Math.PI/2));if(geometry.index)geometry=geometry.toNonIndexed();return {attributes:{POSITION:attribute(geometry.attributes.position.array,3,'POSITION'),NORMAL:attribute(geometry.attributes.normal.array,3,'NORMAL')},material:mat,mode:4}}
function region(outer,holes,z0,z1,mat){const shape=new Shape();shape.setFromPoints(outer.map(p=>({x:p[0]/1000,y:p[1]/1000})));for(const contour of holes){const path=new Path();path.setFromPoints(contour.map(p=>({x:p[0]/1000,y:p[1]/1000})));shape.holes.push(path)}const mesh=new ExtrudeGeometry(shape,{depth:(z1-z0)/1000,bevelEnabled:false,curveSegments:64,steps:1});mesh.translate(0,0,z0/1000);return {primitive:primitive(mesh,mat),proxy:{outer,holes,z:[z0,z1]}}}
const ring=(ro,ri,z0,z1,mat=steel,c=[0,0])=>{if(!(ro>ri&&ri>=0&&z1>z0))throw Error('Invalid annular solid '+[ro,ri,z0,z1]);return region(circle(ro,c),ri?[circle(ri,c)]:[],z0,z1,mat)};
const box=(w,h,z0,z1,mat,c=[0,0])=>region(rectangle(w,h,c),[],z0,z1,mat);
function part(id,position,shapes){const node=nodes.get(id),record=records.get(id);if(!node)throw Error(id);node.translation=toGL(position);delete node.children;delete node.scale;delete node.rotation;delete node.matrix;node.mesh=g.meshes.length;g.meshes.push({name:id+' · prostorově opraveno',primitives:shapes.map(s=>s.primitive)});node.extras.collision_regions=shapes.flatMap(s=>s.proxies||[s.proxy]);node.extras.clearance_position_mm=position;record.base_blender_mm=position;}
function oRing(id,axis,z){const geometry=new TorusGeometry(.0243,.0006,16,128);geometry.translate(0,0,z/1000);const proxies=[];for(let i=0;i<16;i++){const a=-.6+i*1.2/16,c=a+1.2/16,near=a<=0&&c>=0?0:Math.min(Math.abs(a),Math.abs(c)),r=Math.sqrt(Math.max(0,.36-near*near));proxies.push({outer:circle(24.3+r),holes:[circle(24.3-r)],z:[z+a,z+c]})}part(id,[...axis,0],[{primitive:primitive(geometry,rubber),proxies}]);}
function bearing(id,axis,z,ro=23,ri=10.5,width=7,groove=false){
 const shapes=[],race=Math.min(3,(ro-ri)*.25);
 if(groove)shapes.push(ring(ro,ro-race,z-width/2,z-.8),ring(ro,ro-race,z+.8,z+width/2),ring(ro-1.4,ro-race,z-.8,z+.8));
 else shapes.push(ring(ro,ro-race,z-width/2,z+width/2));
 shapes.push(ring(ri+race,ri,z-width/2,z+width/2),ring(ro-race-.2,ri+race+.2,z-width/2+.2,z-width/2+.6,rubber),ring(ro-race-.2,ri+race+.2,z+width/2-.6,z+width/2-.2,rubber));
 part(id,[...axis,0],shapes);
}
// Real cavities and bores replace the old capped sidewall geometry.
const boltHoles=boltCenters.map(c=>circle(2.5,c));
part('housing_gear_side',[0,0,0],[region(exterior,[interior,...boltHoles],-27,-.25,cast),region(exterior,[circle(11,axes.crank),...boltHoles],-30,-27,cast),ring(28,25.5,-27,-17,cast,axes.crank)]);
const body=[region(exterior,[interior,...boltHoles],.25,80,cast),region(exterior,[circle(16,axes.crank),circle(3.2,[5,-15])],80,83,cast),ring(28,25.5,65,80,cast,axes.crank),ring(20,15.5,80,84,cast,axes.crank),ring(12,8.5,70,80,cast,axes.motor),ring(11,8.5,38,46,cast,axes.transfer),box(8,30,39,46,cast,[28,49])];
for(const c of [[-1,-51],[37,-51],[-1,-39],[37,-39]])body.push(ring(2.8,0,50,80,cast,c));
for(const angle of [Math.PI*.25,Math.PI*.95,Math.PI*1.62]){const d=[Math.cos(angle),Math.sin(angle)];let p=exterior.reduce((best,q)=>q[0]*d[0]+q[1]*d[1]>best[0]*d[0]+best[1]*d[1]?q:best,exterior[0]);body.push(ring(10,4,60,68,cast,[p[0]+8*d[0],p[1]+8*d[1]]));}
part('housing_motor_side',[0,0,0],body);
part('liquid_gasket',[0,0,0],[region(offset(interior,11.8),[offset(interior,.2),...boltHoles],-.2,.2,rubber)]);
// Shafts and annular hubs leave continuous clearance for each other.
part('crank_spindle',[...axes.crank,0],[ring(8.5,0,-43,85),ring(7.8,0,-49,-43,dark),ring(7.8,0,85,91,dark)]);
part('output_sprocket',[...axes.crank,0],[ring(10.2,9.3,-38,-1,dark)]);
records.get('output_sprocket').name='Výstupní pouzdro velkého kola';records.get('output_sprocket').description='Schematické výstupní pouzdro; vnější převodník a jeho unašeč jsou před zahájením průvodce sejmuté.';
function gear(id,axis,z,teeth,diameter,width,bore,mat){const outer=Array.from({length:teeth*4},(_,i)=>{const radius=i%4===1||i%4===2?diameter/2:diameter/2-Math.min(1.5,diameter*.055);const a=i*Math.PI*2/(teeth*4);return [radius*Math.cos(a),radius*Math.sin(a)]});part(id,[...axis,0],[region(outer,[circle(bore)],z-width/2,z+width/2,mat)]);}
gear('gear_101',axes.crank,-8,101,105,12,18,steel);
gear('gear_16',axes.transfer,-8,16,19,12,3.5,steel);
gear('gear_56',axes.transfer,15,56,61,22,10.7,nylon);
gear('gear_8',axes.motor,15,8,10.8,22,3.0,steel);
part('intermediate_shaft',[...axes.transfer,0],[ring(3.2,0,-22,45)]);
part('oneway_pedal',[...axes.crank,0],[ring(17,10.5,-12,-4,dark)]);
part('PLY00424',[...axes.transfer,0],[ring(10.5,4,8,22,dark)]);
bearing('PLY00420',axes.crank,-21,25,10.5,7,true);bearing('PLY00421',axes.crank,71,25,9.5,7,true);
// The groove radius is 23.6 mm and the O-ring inner envelope 23.7 mm.
oRing('PLY00427',axes.crank,-21);oRing('PLY00426',axes.crank,71);
bearing('PLY00422',axes.transfer,42,8,3.5,6);bearing('PLY00423B',axes.transfer,33,8,3.5,6);bearing('PLY00423A',axes.motor,74,8,3.0,6);
part('drive_shim',[...axes.transfer,0],[ring(7,3.5,-20.3,-19.7)]);
part('freewheel_bush',[...axes.crank,0],[ring(12,9.5,26,34)]);
part('inner_cover',[...axes.crank,0],[ring(28,10,44,46,rubber)]);
part('torque_sensor',[...axes.crank,0],[ring(19,9.4,55.5,60.5,dark)]);
part('PLY00425',[...axes.crank,0],[ring(15,9.1,81,82.5,rubber)]);
part('control_pcb',[18,-45,0],[box(46,20,48,50,pcb),box(10,7,43,47,rubber,[-12,-3]),box(12,9,43.5,47,rubber,[3,1]),box(6,5,44,47,rubber,[15,-3])]);
const stator=[ring(24,21,42,68,dark)];for(let i=0;i<12;i++){const a=i*Math.PI*2/12,c=[18*Math.cos(a),18*Math.sin(a)];stator.push(ring(2.5,0,44,66,copper,c));}part('motor_stator',[...axes.motor,0],stator);
part('motor_rotor',[...axes.motor,0],[ring(12,2.5,44,66,dark),ring(2.5,0,4,78,steel)]);
part('pressure_vent',[5,-15,0],[ring(3,0,83,83.6,rubber)]);
for(let i=0;i<6;i++){const id=`case_bolt_${String(i+1).padStart(2,'0')}`,hex=circle(4.62,[0,0],6);part(id,[...boltCenters[i],0],[region(hex,[circle(2.0,[0,0],6)],-35,-32.8,dark),region(hex,[],-32.8,-32,steel),ring(2.7,0,-32,-30),ring(1.9,0,-32,12,dark)]);}
for(const [id,node] of nodes){node.extras.title_cs=records.get(id).name;node.extras.clearance_revision='clearance-layout-v1';records.get(id).geometry='prostorově opravená studijní geometrie; nikoli změřený OEM díl';}
metadata.model_revision='clearance-layout-v1';metadata.geometry_note='Dutiny, otvory, rozdělení axiálních rovin a dráhy jsou prostorově zkontrolované v této studijní geometrii; rozměry mimo čtyři převody nejsou OEM specifikace.';
metadata.clearance_layout={axes,interior,exterior,boltCenters,units:'mm'};
// Keep only the geometry used by the 34 rebuilt roots. The original is in the snapshot.
const packedSource=Buffer.concat(buffers),active=[...nodes.values()],activeMeshes=active.map(node=>g.meshes[node.mesh]);
const usedAccessors=[...new Set(activeMeshes.flatMap(mesh=>mesh.primitives.flatMap(p=>Object.values(p.attributes))))];
const usedViews=[...new Set(usedAccessors.map(i=>g.accessors[i].bufferView))],usedMaterials=[...new Set(activeMeshes.flatMap(mesh=>mesh.primitives.map(p=>p.material)))];
const viewMap=new Map(usedViews.map((v,i)=>[v,i])),accessorMap=new Map(usedAccessors.map((v,i)=>[v,i])),materialMap=new Map(usedMaterials.map((v,i)=>[v,i]));
const compactChunks=[];let compactLength=0;
const compactViews=usedViews.map(i=>{const v=g.bufferViews[i];if(compactLength%4){const pad=Buffer.alloc(4-compactLength%4);compactChunks.push(pad);compactLength+=pad.length}const offset=compactLength;compactChunks.push(packedSource.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));compactLength+=v.byteLength;return {...v,buffer:0,byteOffset:offset}});
g.accessors=usedAccessors.map(i=>({...g.accessors[i],bufferView:viewMap.get(g.accessors[i].bufferView)}));g.bufferViews=compactViews;g.materials=usedMaterials.map(i=>g.materials[i]);
g.meshes=activeMeshes.map(mesh=>({...mesh,primitives:mesh.primitives.map(p=>({...p,material:materialMap.get(p.material),attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,value])=>[key,accessorMap.get(value)]))}))}));
g.nodes=active.map((node,i)=>({...node,mesh:i}));g.scenes=[{name:'PW study · prostorově opravená sestava',nodes:active.map((_,i)=>i)}];g.scene=0;g.buffers=[{byteLength:compactLength}];
let binary=Buffer.concat(compactChunks);if(binary.length%4)binary=Buffer.concat([binary,Buffer.alloc(4-binary.length%4)]);
let json=Buffer.from(JSON.stringify(g));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);const jc=Buffer.alloc(8);jc.writeUInt32LE(json.length);jc.writeUInt32LE(0x4e4f534a,4);const bc=Buffer.alloc(8);bc.writeUInt32LE(binary.length);bc.writeUInt32LE(0x004e4942,4);
const out=new URL('web/export/clearance-candidate/',root);await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('syncdrive_sport.glb',out),Buffer.concat([header,jc,json,bc,binary]));await fs.writeFile(new URL('parts_metadata.json',out),JSON.stringify(metadata,null,2));console.log('Generated all 34 parts with cavities, bores and validation regions.');
