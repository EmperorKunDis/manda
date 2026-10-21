#!/usr/bin/env python3
"""Non-destructive GLB refinement of the preserved study; no measured CAD claims.

Input is the pre-guide snapshot. Output is a separate candidate folder. Original
Blender files remain available; author_v2.py contains the corresponding future
Blender-authoring changes and has not been rendered in this restricted runtime.
"""
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'backups/before-guided-20261019'
OUT=ROOT/'web/export/guided-candidate'
VIDEO='https://www.youtube.com/watch?v=Me-H_Gykobc'
CATALOG='https://www.ebikemotorcentre.com/yamaha-motor-parts/yamaha-pw-and-pw-se/'
blob=(SOURCE/'syncdrive_sport.glb').read_bytes()
json_len=struct.unpack_from('<I',blob,12)[0]
gltf=json.loads(blob[20:20+json_len])
bin_start=20+json_len
bin_len=struct.unpack_from('<I',blob,bin_start)[0]
binary=bytearray(blob[bin_start+8:bin_start+8+bin_len])
meta=json.loads((SOURCE/'parts_metadata.json').read_text())
parts={p['id']:p for p in meta['parts']}
nodes={n.get('name'):n for n in gltf['nodes']}
roots=gltf['scenes'][gltf.get('scene',0)]['nodes']

def world_mm(v): return [v[0]/1000,v[2]/1000,-v[1]/1000]

def rename(old,new,name):
    p=parts.pop(old);p.update(id=new,name=name,source=CATALOG,verification='ověřené katalogové označení; poloha a rozměry rekonstruovány')
    parts[new]=p
    node=nodes.pop(old);node['name']=new;node['extras']['id']=new;nodes[new]=node

rename('motor_bearing','PLY00423A','Opěrné ložisko motorové hřídele PLY00423A')
rename('intermediate_bearing','PLY00422','Ložisko mezihřídele u skříně PLY00422')
rename('oneway_motor','PLY00424','Spojkové ložisko mezihřídele PLY00424')
parts['PLY00424']['description']='Jednosměrná spojka nylonového převodu. Funkce je v modelu zastoupena jednou; rozměry a vnitřní geometrie jsou ilustrativní.'
for key in ('PLY00423A','PLY00422'):
    parts[key]['description']='Katalogizované opěrné ložisko PW/PW-SE; zdejší rozměry a umístění nejsou měřené.'

# Remove the seventh illustrative fastener from the active scene, preserving old binary data.
roots.remove(gltf['nodes'].index(nodes['case_bolt_07']))
del parts['case_bolt_07']
for i,(x,y) in enumerate(((-69,-42),(-76,9),(-57,49),(5,63),(65,13),(34,-62)),1):
    key=f'case_bolt_{i:02d}'
    nodes[key]['translation']=world_mm((x,y,-52))
    parts[key].update(name=f'Šroub víka {i}',description='Referenční PW má šest šroubů víka. Zdejší polohy a délky jsou rekonstruované; počet na konkrétním SyncDrive není potvrzen.',verification='počet doložen na PW; osazení rekonstruováno',source=VIDEO+'&t=49s',base_blender_mm=[x,y,-52],explode_blender_mm=[0,0,-60])

# Independent, continuous rings replace the floating toroidal bearing-race illustration.
steel=len(gltf['materials']);gltf['materials'].append({'name':'Schematická ocel · oprava 2026-10-19','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.48,.54,.58,1],'metallicFactor':.8,'roughnessFactor':.35}})
rubber=len(gltf['materials']);gltf['materials'].append({'name':'Schematický elastomer · oprava 2026-10-19','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.025,.033,.035,1],'metallicFactor':0,'roughnessFactor':.8}})

def primitive(vertices,material):
    normals=[]
    for offset in range(0,len(vertices),3):
        a,b,c=vertices[offset:offset+3]
        u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(x*x for x in n)) or 1
        normals.extend([[x/length for x in n]]*3)
    attributes={}
    for label,values in [('POSITION',vertices),('NORMAL',normals)]:
        while len(binary)%4:binary.append(0)
        start=len(binary)
        for v in values:binary.extend(struct.pack('<3f',*v))
        view=len(gltf['bufferViews']);gltf['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':34962})
        accessor={'bufferView':view,'componentType':5126,'count':len(values),'type':'VEC3'}
        if label=='POSITION':accessor.update(min=[min(v[i] for v in values) for i in range(3)],max=[max(v[i] for v in values) for i in range(3)])
        attributes[label]=len(gltf['accessors']);gltf['accessors'].append(accessor)
    return {'attributes':attributes,'material':material,'mode':4}

def ring(outer,inner,depth,material,center=0):
    verts=[]
    def point(r,a,h):return [r*math.cos(a)/1000,h/1000,-r*math.sin(a)/1000]
    for i in range(64):
        a=i*math.tau/64;b=(i+1)*math.tau/64;lo=center-depth/2;hi=center+depth/2
        for quad in ((point(outer,a,lo),point(outer,b,lo),point(outer,b,hi),point(outer,a,hi)),(point(inner,b,lo),point(inner,a,lo),point(inner,a,hi),point(inner,b,hi)),(point(inner,a,hi),point(outer,a,hi),point(outer,b,hi),point(inner,b,hi)),(point(outer,a,lo),point(inner,a,lo),point(inner,b,lo),point(outer,b,lo))):
            verts.extend([quad[0],quad[1],quad[2],quad[0],quad[2],quad[3]])
    return primitive(verts,material)

def torus(major,minor,material):
    verts=[]
    def point(u,v):return [(major+minor*math.cos(v))*math.cos(u)/1000,minor*math.sin(v)/1000,-(major+minor*math.cos(v))*math.sin(u)/1000]
    for i in range(64):
        for j in range(12):
            a,b=i*math.tau/64,(i+1)*math.tau/64;c,d=j*math.tau/12,(j+1)*math.tau/12
            q=[point(a,c),point(b,c),point(b,d),point(a,d)]
            verts.extend([q[0],q[1],q[2],q[0],q[2],q[3]])
    return primitive(verts,material)

def attach(node,primitives):
    mesh=len(gltf['meshes']);gltf['meshes'].append({'name':node['name']+' · schematická geometrie','primitives':primitives})
    node.pop('children',None);node['mesh']=mesh

def add_part(key,name,category,position,description,verification,source,primitives,explode=(0,0,-50)):
    p=dict(id=key,name=name,category=category,description=description,verification=verification,source=source,kit=False,base_blender_mm=list(position),explode_blender_mm=list(explode))
    parts[key]=p
    node={'name':key,'translation':world_mm(position),'extras':{'id':key}}
    attach(node,primitives);roots.append(len(gltf['nodes']));gltf['nodes'].append(node);nodes[key]=node

for bearing,oring in [('PLY00420','PLY00427'),('PLY00421','PLY00426')]:
    attach(nodes[bearing],[ring(25,22,2.7,steel,-2.15),ring(25,22,2.7,steel,2.15),ring(24,22,1.6,steel),ring(13,9.5,7,steel),ring(22,13,.4,rubber,3.1),ring(22,13,.4,rubber,-3.1)])
    nodes[oring]['translation']=list(nodes[bearing]['translation'])
    parts[oring]['base_blender_mm']=list(parts[bearing]['base_blender_mm'])
    attach(nodes[oring],[torus(24.5,.65,rubber)])
    parts[bearing]['description']='Klikové ložisko z katalogu PW/PW-SE. Vnější drážka a O-kroužek jsou znázorněny schematicky; rozměry nejsou výrobní specifikace.'

add_part('PLY00423B','Opěrné ložisko mezihřídele PLY00423B','Ložiska',(22,24,44),'Součást uložení převodové sestavy; zdejší poloha a rozměry jsou rekonstruované.','ověřené katalogové označení; poloha rekonstruována',CATALOG,[ring(13,4,7,steel)])
add_part('drive_shim','Vymezovací podložka převodu','Převody',(22,24,-25),'Podložka pozorovaná na PW. Zdejší tloušťka a poloha jsou ilustrativní.','doloženo na PW; rozměry rekonstruovány',VIDEO+'&t=173s',[ring(7,4,.7,steel)])
add_part('freewheel_bush','Pouzdro volnoběžky','Volnoběžky',(-35,0,-12),'Samostatně snímané pouzdro před nylonovou převodovou sestavou na PW. Zdejší obrys a usazení jsou schematické.','doloženo na PW; tvar schematický',VIDEO+'&t=193s',[ring(16,9.5,8,steel)])
add_part('inner_cover','Vnitřní plastový kryt','Skříň',(-35,0,-25),'Zjednodušené znázornění krytu pozorovaného na PW. Přesný obrys, úchyty a průchody kabeláže nejsou změřené.','doloženo na PW; tvar schematický',VIDEO+'&t=207s',[ring(31,21,2,rubber)])
parts['liquid_gasket'].update(name='Tekuté těsnění · značka spáry',description='Pomocné znázornění těsnicího spoje. Není samostatným vyjímatelným dílem.',verification='ověřený typ spoje; značka není samostatný díl',explode_blender_mm=[0,0,0])
for key,p in parts.items():
    nodes[key].setdefault('extras',{}).update(id=key,title_cs=p['name'],verification=p['verification'],source=p['source'],kit_ply00700=p['kit'])
meta.update(parts=list(parts.values()),sources=[*meta['sources'],VIDEO],model_revision='guided-pw-reference-2026-10-19',variant='Konkrétní SyncDrive Sport není identifikován; pořadí rozborky je reference Yamaha PW.',geometry_note='Studijní obálky a dráhy; bez záruky skutečných vůlí, lícování a kolizí.')
assert len(parts)==34 and sum(p['kit'] for p in parts.values())==4
# Ensure active roots and metadata agree, including new stable identifiers.
assert {gltf['nodes'][i]['extras']['id'] for i in roots}==set(parts)
gltf['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode()
encoded+=b' '*((-len(encoded))%4);binary.extend(b'\0'*((-len(binary))%4))
output=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'syncdrive_sport.glb').write_bytes(output)
(OUT/'parts_metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
print(f'Wrote {len(parts)} components to {OUT}; original GLB and Blender files preserved.')
