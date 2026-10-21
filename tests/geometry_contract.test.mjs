import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=new URL('../web/export/syncdrive_sport.glb',import.meta.url),b=await fs.readFile(url),length=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+length)),binary=b.subarray(28+length);
const tolerance=.02;
function classify(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],c=poly[j],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=tolerance)return 0;if((a[1]>p[1])!==(c[1]>p[1])&&p[0]<(c[0]-a[0])*(p[1]-a[1])/(c[1]-a[1])+a[0])inside=!inside}return inside?1:-1}
function covers(r,p){return p[2]>=r.z[0]-tolerance&&p[2]<=r.z[1]+tolerance&&classify(p,r.outer)>=0&&r.holes.every(h=>classify(p,h)<=0)}
let samples=0,triangles=0;
for(const index of g.scenes[g.scene||0].nodes){const node=g.nodes[index];assert(!node.rotation&&!node.scale&&!node.matrix&&!node.children,'contract expects explicit rebuilt root geometry');
 for(const primitive of g.meshes[node.mesh].primitives){assert(!primitive.indices);const a=g.accessors[primitive.attributes.POSITION],v=g.bufferViews[a.bufferView],array=new Float32Array(binary.buffer,binary.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*3);
  for(let i=0;i<array.length;i+=9){const points=[];for(let j=0;j<9;j+=3)points.push([array[i+j]*1000,-array[i+j+2]*1000,array[i+j+1]*1000]);const centroid=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/3);
   for(const p of [...points,centroid]){assert(node.extras.collision_regions.some(r=>covers(r,p)),node.name+' mesh extends outside checked regions at '+JSON.stringify(p));samples++}triangles++;
  }
 }
}
console.log(`PASS: ${samples} vertices/centroids from ${triangles} actual GLB triangles lie within the checked solid regions (tolerance ${tolerance} mm).`);
