// Independent CPU renders of the actual GLB triangles; does not stand in for browser UI QA.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import {Vector3,PerspectiveCamera,Box3} from '../web/vendor/three.core.js';
import {STEPS,poseAt,scalesAt} from '../web/disassembly.js';
const root=new URL('../',import.meta.url),b=await fs.readFile(new URL('web/export/clearance-candidate/syncdrive_sport.glb',root));
const length=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+length)),binary=b.subarray(28+length);
function values(id){const a=g.accessors[id],v=g.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0);return new Float32Array(binary.buffer,binary.byteOffset+start,a.count*3)}
const roots=g.scenes[g.scene||0].nodes.map(i=>g.nodes[i]);
const W=1200,H=920;
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const crc=data=>{let c=0xffffffff;for(const x of data)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),check=Buffer.alloc(4);len.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,check])}
async function render(name,step,dir){
 const pose=poseAt(step),scales=scalesAt(pose),tris=[],bounds=new Box3();
 for(const node of roots){const id=node.extras.id;if(id==='liquid_gasket'&&step>=2)continue;const shift=pose[id]||[0,0,0],scale=scales[id]||1,translation=node.translation||[0,0,0];
  for(const primitive of g.meshes[node.mesh].primitives){const positions=values(primitive.attributes.POSITION),normals=values(primitive.attributes.NORMAL),color=g.materials[primitive.material].pbrMetallicRoughness.baseColorFactor;
   for(let i=0;i<positions.length;i+=9){const points=[];for(let k=0;k<9;k+=3){const p=new Vector3(positions[i+k]*scale+translation[0]+shift[0]/1000,positions[i+k+1]+translation[1]+shift[2]/1000,positions[i+k+2]*scale+translation[2]-shift[1]/1000);bounds.expandByPoint(p);points.push(p)}tris.push({points,normal:new Vector3(normals[i],normals[i+1],normals[i+2]),color})}
  }
 }
 const center=bounds.getCenter(new Vector3()),radius=bounds.getSize(new Vector3()).length()/2,cam=new PerspectiveCamera(40,W/H,.0001,10);cam.up.set(0,0,-1);cam.position.copy(center).addScaledVector(new Vector3(...dir).normalize(),radius/Math.sin(Math.PI/9)*1.05);cam.lookAt(center);cam.updateMatrixWorld();
 const depth=new Float64Array(W*H);depth.fill(Infinity);const pixels=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*3,t=Math.max(0,1-Math.hypot((x-W/2)/W,(y-H/2)/H));pixels[i]=14+Math.round(12*t);pixels[i+1]=24+Math.round(15*t);pixels[i+2]=27+Math.round(15*t)}
 const light=new Vector3(-.4,-.7,-.5).normalize(),view=cam.position.clone().sub(center).normalize();
 for(const tri of tris){const p=tri.points.map(p=>p.clone().project(cam)).map(p=>[(p.x+1)*W/2,(1-p.y)*H/2,p.z]);const [a,c,d]=p;const den=(c[1]-d[1])*(a[0]-d[0])+(d[0]-c[0])*(a[1]-d[1]);if(Math.abs(den)<1e-10)continue;
  const minX=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),maxX=Math.min(W-1,Math.ceil(Math.max(...p.map(v=>v[0])))),minY=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),maxY=Math.min(H-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
  const diffuse=.28+.6*Math.max(0,tri.normal.dot(light))+.2*Math.max(0,tri.normal.dot(view));const rgb=tri.color.slice(0,3).map(v=>Math.min(255,Math.round(255*Math.pow(Math.max(0,v*diffuse),1/2.2))));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const u=((c[1]-d[1])*(x+.5-d[0])+(d[0]-c[0])*(y+.5-d[1]))/den,v=((d[1]-a[1])*(x+.5-d[0])+(a[0]-d[0])*(y+.5-d[1]))/den,w=1-u-v;if(u<0||v<0||w<0)continue;const z=u*a[2]+v*c[2]+w*d[2],index=y*W+x;if(z<depth[index]){depth[index]=z;pixels.set(rgb,index*3)}}
 }
 const raw=Buffer.alloc(H*(W*3+1));for(let y=0;y<H;y++)pixels.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 const out=new URL('web/export/qa-clearance/',root);await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL(name+'.png',out),png);console.log(name,STEPS[step].title,tris.length+' triangles');
}
await render('assembled-front',0,[.48,-1,-.42]);
await render('assembled-back',0,[-.6,1,-.3]);
await render('open-cover',2,[.38,-1,-.35]);
await render('open-gears',3,[.15,-1,-.3]);
await render('extracted-kit',15,[.35,-1,-.6]);
