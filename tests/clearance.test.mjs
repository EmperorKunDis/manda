import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const modelPath=process.env.MANDA_CLEARANCE_MODEL||'web/export/syncdrive_sport.glb';
const file=await fs.readFile(new URL(modelPath,root));const g=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
const source=await fs.readFile(new URL('web/disassembly.js',root),'utf8');
const {STEPS,poseAt,interpolatePose,scalesAt,interpolateScales}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const epsilon=.015;
function bounds(poly){return [Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]}
const parts=g.scenes[g.scene||0].nodes.map(i=>g.nodes[i]).map(node=>({id:node.extras.id,base:node.extras.clearance_position_mm,regions:node.extras.collision_regions.map(r=>({...r,bounds:bounds(r.outer)}))}));
assert.equal(parts.length,34);assert(parts.every(p=>p.base&&p.regions.length));
function inConvex(p,poly){for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(cross<=epsilon*Math.hypot(b[0]-a[0],b[1]-a[1]))return false}return true}
function inPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<epsilon)return false;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function contains(region,p){return inPoly(p,region.outer)&&!region.holes.some(h=>inPoly(p,h))}
function worldRegion(r,base,offset,scale){const move=[base[0]+offset[0],base[1]+offset[1]],map=poly=>poly.map(p=>[p[0]*scale+move[0],p[1]*scale+move[1]]);return {outer:map(r.outer),holes:r.holes.map(map),bounds:[r.bounds[0]*scale+move[0],r.bounds[1]*scale+move[1],r.bounds[2]*scale+move[0],r.bounds[3]*scale+move[1]],z:[r.z[0]+base[2]+offset[2],r.z[1]+base[2]+offset[2]]}}
function boundsOverlap(a,b){return Math.min(a[2],b[2])-Math.max(a[0],b[0])>epsilon&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>epsilon}
function insideHole(a,b){const q=b.bounds,corners=[[q[0],q[1]],[q[0],q[3]],[q[2],q[1]],[q[2],q[3]]];return a.holes.some(h=>corners.every(p=>inConvex(p,h))||b.outer.every(p=>inConvex(p,h)))}
function overlaps(a,b){
 if(Math.min(a.z[1],b.z[1])-Math.max(a.z[0],b.z[0])<=epsilon||!boundsOverlap(a.bounds,b.bounds))return false;
 if(insideHole(a,b)||insideHole(b,a))return false;
 for(const [one,two] of [[a,b],[b,a]])for(const contour of [one.outer,...one.holes])for(const p of contour)if(contains(two,p))return true;
 // Proper contour crossings catch thin overlaps without an enclosed vertex.
 for(const pa of [a.outer,...a.holes])for(const pb of [b.outer,...b.holes])for(let i=0;i<pa.length;i++)for(let j=0;j<pb.length;j++){
  const p=pa[i],q=pa[(i+1)%pa.length],r=pb[j],s=pb[(j+1)%pb.length],u=[q[0]-p[0],q[1]-p[1]],v=[s[0]-r[0],s[1]-r[1]],den=u[0]*v[1]-u[1]*v[0];if(Math.abs(den)<1e-9)continue;
  const d=[r[0]-p[0],r[1]-p[1]],t=(d[0]*v[1]-d[1]*v[0])/den,k=(d[0]*u[1]-d[1]*u[0])/den;
  if(t>0&&t<1&&k>0&&k<1){const hit=[p[0]+u[0]*t,p[1]+u[1]*t];for(const [x,y] of [[.04,.04],[-.04,.04],[.04,-.04],[-.04,-.04]]){const c=[hit[0]+x,hit[1]+y];if(contains(a,c)&&contains(b,c))return true}}
 }
 // Identical/coincident regions have no proper crossings.
 for(const one of [a,b]){const p=one.outer[0],q=one.outer[1],len=Math.hypot(q[0]-p[0],q[1]-p[1]);const c=[(p[0]+q[0])/2-(q[1]-p[1])*.04/len,(p[1]+q[1])/2+(q[0]-p[0])*.04/len];if(contains(a,c)&&contains(b,c))return true}
 return false;
}
const failures=new Map();let states=0;
let sweptIntervals=0;
function convexHull(points){const sorted=points.toSorted((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],hi=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(const p of sorted){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p)}for(const p of sorted.toReversed()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p)}return [...lo.slice(0,-1),...hi.slice(0,-1)]}
function inspectSweep(from,to,t0,t1,label,step){
 const poses=[interpolatePose(from,to,t0),interpolatePose(from,to,t1)],scales=[interpolateScales(from,to,t0),interpolateScales(from,to,t1)];
 const active=parts.filter(p=>!(p.id==='liquid_gasket'&&step>=2)).map(p=>({...p,world:p.regions.map(r=>worldRegion(r,p.base,poses[0][p.id]||[0,0,0],scales[0][p.id]||1))}));
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  let a=active[i],b=active[j];const key=[a.id,b.id].sort().join(' / ');if(failures.has(key))continue;
  if(scales[0][b.id]!==scales[1][b.id])[a,b]=[b,a];
  const b0=poses[0][b.id]||[0,0,0],b1=poses[1][b.id]||[0,0,0],a0=poses[0][a.id]||[0,0,0],a1=poses[1][a.id]||[0,0,0];
  const relative=a1.map((v,k)=>v-(b1[k]-b0[k])),lateral=Math.hypot(relative[0]-a0[0],relative[1]-a0[1])>.0001;
  outer:for(let k=0;k<a.regions.length;k++){
   const start=a.world[k],end=worldRegion(a.regions[k],a.base,relative,scales[1][a.id]||1),growing=(scales[1][a.id]||1)>(scales[0][a.id]||1);
   const swept={outer:lateral?convexHull([...start.outer,...end.outer]):growing?end.outer:start.outer,holes:lateral?[]:growing?start.holes:end.holes,bounds:[Math.min(start.bounds[0],end.bounds[0]),Math.min(start.bounds[1],end.bounds[1]),Math.max(start.bounds[2],end.bounds[2]),Math.max(start.bounds[3],end.bounds[3])],z:[Math.min(start.z[0],end.z[0]),Math.max(start.z[1],end.z[1])]};
   for(const fixed of b.world)if(overlaps(swept,fixed)){failures.set(key,label);break outer;}
  }
 }
 sweptIntervals++;
}
function inspect(pose,scale,label,step){
 const active=parts.filter(p=>!(p.id==='liquid_gasket'&&step>=2)).map(p=>({...p,world:p.regions.map(r=>worldRegion(r,p.base,pose[p.id]||[0,0,0],scale[p.id]||1))}));
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j],key=[a.id,b.id].sort().join(' / ');if(failures.has(key))continue;
  outer:for(const x of a.world)for(const y of b.world)if(overlaps(x,y)){failures.set(key,label);break outer;}
 }
 states++;
}
inspect({},scalesAt({}),'assembled',0);
if(process.env.MANDA_SCAN_ASSEMBLED!=='1')for(let i=1;i<STEPS.length;i++)for(const [from,to,direction,step] of [[poseAt(i-1),poseAt(i),'forward',i],[poseAt(i),poseAt(i-1),'backward',i-1]])for(let sample=0;sample<=40;sample++){
 const t=sample/40;inspect(interpolatePose(from,to,t),interpolateScales(from,to,t),`${direction} step ${i} t=${t}`,step);
}
// Phase boundaries separate axial, lateral, sequential-pods and elastic-ring moves.
const phases=[0,.25,.3,.45,.5,.6,.7,.75,.8,1];
if(process.env.MANDA_SCAN_ASSEMBLED!=='1')for(let i=1;i<STEPS.length;i++)for(const [from,to,direction,step] of [[poseAt(i-1),poseAt(i),'forward',i],[poseAt(i),poseAt(i-1),'backward',i-1]])for(let k=1;k<phases.length;k++)inspectSweep(from,to,phases[k-1],phases[k],`continuous ${direction} step ${i} t=${phases[k-1]}..${phases[k]}`,step);
const report={model:modelPath,model_sha256:createHash('sha256').update(file).digest('hex'),motion_sha256:createHash('sha256').update(source).digest('hex'),states,swept_intervals:sweptIntervals,pair_tolerance_mm:epsilon,method:'Positive volume intersection of polygon-with-holes extrusion regions, plus conservative swept envelopes at motion phase boundaries; torus represented by conservative axial slices. All separate component pairs; same-component solids excluded.',collisions:[...failures].map(([parts,firstSeen])=>({parts,firstSeen}))};
await fs.writeFile(new URL('web/export/clearance-report.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));assert.equal(failures.size,0,'interpenetrating components remain');
