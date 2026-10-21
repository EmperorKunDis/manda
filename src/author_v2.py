#!/usr/bin/env python3
"""Editable, source-labelled PW/PW-SE family mechanical study.

Coordinates and all unquoted dimensions outside the four gear specifications
are visual reconstruction, not measured OEM geometry.
"""
import bpy
import json
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
# Legacy authoring study: never overwrite the clearance-checked web model.
OUT = os.environ.get('MANDA_MODEL_OUT', os.path.join(ROOT, 'web', 'export', 'blender-candidate'))
MM = .001
SOURCE_TEARDOWN = 'https://avdweb.nl/solar-bike/hub-motor/yamaha-pw-se'
SOURCE_PARTS = 'https://www.ebikemotorcentre.com/yamaha-motor-parts/yamaha-pw-and-pw-se/'
SOURCE_VIDEO = 'https://www.youtube.com/watch?v=Me-H_Gykobc'
PARTS = []

for existing in list(bpy.data.objects):
    bpy.data.objects.remove(existing, do_unlink=True)
for old_scene in list(bpy.data.scenes):
    if old_scene != bpy.context.scene:
        bpy.data.scenes.remove(old_scene)
bpy.context.scene.name='SyncDrive Sport — studijní rekonstrukce'

def mat(name, rgba, metallic=0, roughness=.5):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*rgba,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgba,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=roughness
    return m

cast=mat('01 · tmavý vnější odlitek',(.22,.26,.28),.54,.51)
inside_cast=mat('01b · obrobený hliník uvnitř',(.56,.60,.62),.66,.42)
edge=mat('02 · opracované hrany',(.75,.78,.79),.79,.28)
steel=mat('03 · ocel',(.57,.62,.65),.9,.28)
darksteel=mat('04 · kalená ocel',(.20,.24,.27),.86,.32)
nylon=mat('05 · přírodní polyamid',(.86,.83,.72),.04,.57)
copper=mat('06 · měděné vinutí',(.67,.29,.12),.78,.29)
pcb=mat('07 · deska plošných spojů',(.09,.31,.23),.16,.43)
black=mat('08 · elastomer',(.055,.065,.07),.0,.82)
chip=mat('09 · pouzdra elektroniky',(.10,.13,.15),.25,.55)
gold=mat('10 · kontakty',(.72,.52,.14),.81,.25)
magnet=mat('11 · rotorové magnety',(.28,.33,.39),.78,.34)

def part(id, title, category, function, verification='rekonstrukce', source=SOURCE_TEARDOWN, kit=False, loc=(0,0,0), explode=(0,0,0)):
    root=bpy.data.objects.new(id,None)
    bpy.context.collection.objects.link(root)
    root.location=Vector(loc)*MM
    root.empty_display_type='PLAIN_AXES'
    root.empty_display_size=.005
    root['id']=id; root['title_cs']=title
    root['verification']=verification; root['source']=source
    root['kit_ply00700']=kit
    PARTS.append(dict(id=id,name=title,category=category,description=function,verification=verification,source=source,kit=kit,
                      base_blender_mm=list(loc),explode_blender_mm=list(explode)))
    return root

def adopt(obj,root,material,name=None,bevel=0):
    if name: obj.name=name
    obj.parent=root
    if material: obj.data.materials.append(material)
    if bevel:
        mod=obj.modifiers.new('měkká hrana','BEVEL');mod.width=bevel*MM;mod.segments=2
        obj.modifiers.new('vážené normály','WEIGHTED_NORMAL')
    return obj

def cylinder(root,name,radius,depth,material,at=(0,0,0),verts=64,bevel=.35):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius*MM,depth=depth*MM,location=Vector(at)*MM)
    return adopt(bpy.context.object,root,material,name,bevel)

def cube(root,name,size,material,at=(0,0,0),bevel=.4):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(at)*MM)
    o=bpy.context.object;o.dimensions=Vector(size)*MM
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return adopt(o,root,material,name,bevel)

def torus(root,name,major,minor,material,at=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major*MM,minor_radius=minor*MM,major_segments=64,minor_segments=10,location=Vector(at)*MM)
    return adopt(bpy.context.object,root,material,name)

def ring_cylinder(root,name,outer,inner,depth,material,at=(0,0,0)):
    n=64; verts=[]
    for z,r in ((-depth/2,outer),(-depth/2,inner),(depth/2,outer),(depth/2,inner)):
        for i in range(n):
            a=2*math.pi*i/n
            verts.append(((at[0]+r*math.cos(a))*MM,(at[1]+r*math.sin(a))*MM,(at[2]+z)*MM))
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend(((i,j,2*n+j,2*n+i),(n+i,3*n+i,3*n+j,n+j),
                      (2*n+i,2*n+j,3*n+j,3*n+i),(j,i,n+i,n+j)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return adopt(obj,root,material,bevel=.35)

def bore(obj,x,y,r,depth=180):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r*MM,depth=depth*MM,location=(x*MM,y*MM,0))
    cutter=bpy.context.object
    cutter.name='temporary bore cutter'
    mod=obj.modifiers.new('through opening','BOOLEAN')
    mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

def gear(root,name,teeth,diameter,width,bore,material,at=(0,0,0)):
    # Explicit radial teeth and true center opening. Source diameter is a
    # reference value; tooth profile, root radius and bore are reconstructed.
    n=teeth*4; tip=diameter*.5; root_r=tip-max(.8,diameter/70)
    inn=bore*.5; z0=(at[2]-width/2)*MM;z1=(at[2]+width/2)*MM
    verts=[]
    for z in (z0,z1):
        for i in range(n):
            angle=2*math.pi*i/n
            r=tip if i%4 in (1,2) else root_r
            verts.append(((at[0]+r*math.cos(angle))*MM,(at[1]+r*math.sin(angle))*MM,z))
        for i in range(n):
            angle=2*math.pi*i/n
            verts.append(((at[0]+inn*math.cos(angle))*MM,(at[1]+inn*math.sin(angle))*MM,z))
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend(((i,j,2*n+j,2*n+i),
                      (n+j,n+i,3*n+i,3*n+j),
                      (2*n+i,2*n+j,3*n+j,3*n+i),
                      (j,i,n+i,n+j)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    adopt(obj,root,material)
    for poly in mesh.polygons: poly.use_smooth=True
    obj.modifiers.new('vážené normály','WEIGHTED_NORMAL')
    return obj

def bearing(root,name,outer,inner,width,at=(0,0,0)):
    # A continuous annular bearing, not disconnected floating toroidal races.
    # Dimensions remain illustrative; the bore clears the represented shaft.
    span=outer-inner
    ring_cylinder(root,name+' / vnější kroužek',outer,outer-span*.24,width,steel,at)
    ring_cylinder(root,name+' / vnitřní kroužek',inner+span*.24,inner,width,edge,at)
    for side in (-1,1):
        ring_cylinder(root,name+' / krytí '+str(side),outer-span*.22,inner+span*.22,.5,black,(at[0],at[1],at[2]+side*(width/2-.3)))
    torus(root,name+' / znázornění vnější drážky',outer,.45,darksteel,at)

def outline_shell(root,name,side):
    # Asymmetric union-like silhouette, viewed from the gear side: crank on
    # left, compound train upper-right, motor lower-right. Three mount ears.
    points=[(-82,-18),(-76,-44),(-52,-59),(-24,-57),(-7,-64),(25,-69),(57,-54),(76,-30),(76,-6),(69,13),(57,30),(45,47),(19,66),(-6,69),(-22,60),(-42,56),(-62,43),(-77,22)]
    # Dense interpolated outline softens the cast rim without misrepresenting
    # it as a precise traced OEM profile.
    smooth=[]
    for i,p in enumerate(points):
        q=points[(i+1)%len(points)];prev=points[(i-1)%len(points)];nxt=points[(i+2)%len(points)]
        for t in (0,.25,.5,.75):
            t2=t*t;t3=t2*t
            x=.5*((2*p[0])+(-prev[0]+q[0])*t+(2*prev[0]-5*p[0]+4*q[0]-nxt[0])*t2+(-prev[0]+3*p[0]-3*q[0]+nxt[0])*t3)
            y=.5*((2*p[1])+(-prev[1]+q[1])*t+(2*prev[1]-5*p[1]+4*q[1]-nxt[1])*t2+(-prev[1]+3*p[1]-3*q[1]+nxt[1])*t3)
            smooth.append((x,y))
    n=len(smooth); outer=smooth;inner=[(x*.91,y*.89) for x,y in outer]
    closed_z=side*48; mouth_z=0
    # Root stays at origin, so shell can move as one selectable GLB node.
    verts=[]
    for z,loop in ((closed_z,outer),(mouth_z,outer),(mouth_z,inner),(closed_z-side*3,inner)):
        verts += [(x*MM,y*MM,z*MM) for x,y in loop]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,n+j,n+i),(n+i,n+j,2*n+j,2*n+i),(2*n+i,2*n+j,3*n+j,3*n+i)]
    faces.append(tuple(reversed(tuple(range(n)))))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name+' / dutý odlitek',mesh);bpy.context.collection.objects.link(obj)
    adopt(obj,root,cast,bevel=.75)
    obj.data.materials.append(inside_cast)
    for i,face in enumerate(obj.data.polygons):
        if i%3 == 2: face.material_index=1
    bore(obj,-35,0,10.5)
    # External circular bosses and ribs, visually distinct from the shell.
    for k,(x,y,r) in enumerate(((-35,0,20),(39,-8,26),(22,24,14))):
        ring_cylinder(root,f'{name} / pouzdro ložiska {k+1}',r,max(4,r*.48),3,edge,(x,y,closed_z+side*2))
        torus(root,f'{name} / obráběný lem {k+1}',r+2,1.2,darksteel,(x,y,closed_z+side*3.5))
    for k,(x,y) in enumerate(((-62,46),(15,69),(72,-45))):
        ring_cylinder(root,f'{name} / montážní ucho {k+1}',9,3,8,cast,(x,y,closed_z))
        torus(root,f'{name} / otvor ucha {k+1}',4,1.2,darksteel,(x,y,closed_z+side*4))
    for k,ang in enumerate(range(0,360,45)):
        x=39+29*math.cos(math.radians(ang));y=-8+29*math.sin(math.radians(ang))
        rib=cube(root,f'{name} / výztuha {k+1}',(18,2,2),edge,(x,y,closed_z+side*2),.25)
        rib.rotation_euler[2]=math.radians(ang)

def fastener(root,name,at,axis=1):
    cylinder(root,name+' / dřík',2.2,14,darksteel,(at[0],at[1],at[2]-axis*5),verts=16,bevel=.2)
    cylinder(root,name+' / šestihran',4.3,2.8,steel,at,verts=6,bevel=.22)
    cube(root,name+' / drážka',(4,.7,.4),darksteel,(at[0],at[1],at[2]+axis*1.5),0)

# --- Assembly axes. Verified gear dimensions; their positions are a study. ---
CRANK=(-35,0);INTERMEDIATE=(22,24);MOTOR=(39,-8)

p=part('housing_gear_side','Kryt na straně převodů','Skříň','Odlitá polovina chrání převody a vytváří uložení hřídelí; tvar a žebra jsou studijní rekonstrukcí.',loc=(0,0,0),explode=(0,0,-56))
outline_shell(p,'kryt převodů',-1)
p=part('housing_motor_side','Kryt na straně motoru','Skříň','Druhá polovina odlitku se třemi montážními uchy; asymetrický obrys vychází z fotografií.',loc=(0,0,0),explode=(0,0,82))
outline_shell(p,'kryt motoru',1)
p=part('liquid_gasket','Tekuté těsnění · znázornění spáry','Skříň','Pomocná značka těsnicí vrstvy; nejde o samostatné vyjímatelné těsnění. Po otevření skříně se tekuté těsnění obnovuje.',verification='ověřený typ spoje; značka není samostatný díl',loc=(0,0,0),explode=(0,0,0))
curve=bpy.data.curves.new('těsnicí spára','CURVE');curve.dimensions='3D';curve.bevel_depth=.45*MM;curve.bevel_resolution=2
spline=curve.splines.new('POLY');outline=((-78,-16),(-69,39),(-18,65),(40,53),(71,-29),(28,-65),(-44,-58))
spline.points.add(len(outline)-1)
for point,(x,y) in zip(spline.points,outline):point.co=(x*MM,y*MM,0,1)
spline.use_cyclic_u=True
obj=bpy.data.objects.new('značka spáry',curve);bpy.context.collection.objects.link(obj);adopt(obj,p,black)
bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)

p=part('crank_spindle','Kliková hřídel','Hřídele','Průchozí osa šlapání; délka a profil jsou vizuální rekonstrukcí.',loc=(*CRANK,0),explode=(-18,0,-11))
cylinder(p,'dutá osa',9,119,steel,(0,0,0),bevel=.5)
for side in (-1,1):
    cylinder(p,f'koncový vícehran {side}',7.5,13,darksteel,(0,0,side*62),verts=8,bevel=.4)
    torus(p,f'drážka osy {side}',10,1.4,edge,(0,0,side*49))

p=part('output_sprocket','Výstupní unašeč převodníku','Hřídele','Přenáší výsledný moment na vnější převodník; profil je rekonstrukcí.',loc=(*CRANK,0),explode=(-26,0,27))
cylinder(p,'unašeč / náboj',17,14,darksteel,(0,0,41))
for i in range(8):
    a=2*math.pi*i/8
    cube(p,f'unašeč / drážka {i+1}',(8,5,8),steel,(22*math.cos(a),22*math.sin(a),48),.6)

# Four sourced gear measurements, with modeled reconstructed involute-like teeth.
p=part('gear_101','Velké ocelové kolo · 101 zubů','Převody','Čtvrtý převod na klikové ose. Počet zubů, průměr 105 mm a šířka 12 mm jsou uvedeny v rozboru.',verification='ověřený počet zubů a obálkové rozměry; profil rekonstruován',loc=(*CRANK,0),explode=(-30,-5,-12))
gear(p,'101 zubů',101,105,12,19,steel)
cylinder(p,'náboj kola',15,17,darksteel,(0,0,0))
for i in range(6):
    a=2*math.pi*i/6
    torus(p,f'odlehčení kola {i+1}',5,.7,darksteel,(28*math.cos(a),28*math.sin(a),6.3))
p=part('gear_16','Ocelové mezikolo · 16 zubů','Převody','Třetí převod na společné mezihřídeli s nylonovým kolem; rozbor uvádí 19 mm × 12 mm.',verification='ověřený počet zubů a obálkové rozměry; profil rekonstruován',loc=(*INTERMEDIATE,0),explode=(20,22,-10))
gear(p,'16 zubů',16,19,12,8,steel)
p=part('gear_56','Nylonové kolo · 56 zubů','Převody','Druhý převod na mezihřídeli; rozbor uvádí 61 mm × 22 mm.',verification='ověřený počet zubů a obálkové rozměry; profil rekonstruován',loc=(*INTERMEDIATE,22),explode=(30,35,26))
gear(p,'56 zubů',56,61,22,9,nylon)
cylinder(p,'ocelový náboj nylonového kola',9,24,darksteel)
p=part('intermediate_shaft','Mezihřídel','Hřídele','Nese nylonové kolo a ocelový 16zubý pastorek; umístění odvozeno z rozboru.',loc=(*INTERMEDIATE,0),explode=(24,34,12))
cylinder(p,'mezihřídel',4.2,67,steel,(0,0,13))
for z in (-12,37): torus(p,f'pojistný kroužek {z}',6,.7,darksteel,(0,0,z))
p=part('gear_8','Ocelový pastorek motoru · 8 zubů','Převody','První převod na motorové ose; rozbor uvádí 10,8 mm × 22 mm.',verification='ověřený počet zubů a obálkové rozměry; profil rekonstruován',loc=(*MOTOR,22),explode=(42,-27,29))
gear(p,'8 zubů',8,10.8,22,3.5,steel)

p=part('motor_stator','Stator elektromotoru','Motor','Pevná část motoru s feromagnetickým jádrem a měděným vinutím; počet cívek je ilustrativní.',loc=(*MOTOR,35),explode=(58,-34,59))
ring_cylinder(p,'laminované jádro',24,14,23,darksteel)
for i in range(12):
    a=i*2*math.pi/12
    o=cube(p,f'měděná cívka {i+1}',(7,5,20),copper,(19*math.cos(a),19*math.sin(a),0),1)
    o.rotation_euler[2]=a
for z in (-9,9): torus(p,f'čelní vinutí {z}',20,2.2,copper,(0,0,z))
p=part('motor_rotor','Rotor a motorová hřídel','Motor','Rotující část a magnetický plášť pohánějí 8zubý pastorek; vnitřní konstrukce je rekonstruovaná.',loc=(*MOTOR,33),explode=(47,-31,40))
cylinder(p,'rotorové jádro',13,27,magnet)
cylinder(p,'motorová hřídel',2.5,35,steel,(0,0,-7))
for i in range(8):
    a=i*2*math.pi/8
    o=cube(p,f'magnetický segment {i+1}',(5,4,21),darksteel,(11.5*math.cos(a),11.5*math.sin(a),0),.4)
    o.rotation_euler[2]=a

p=part('oneway_pedal','Volnoběžka šlapání','Volnoběžky','Jedna ze dvou volnoběžek umožňuje šlapat bez otáčení motoru; konkrétní klec je rekonstruovaná.',verification='ověřená funkce dvojice; geometrie rekonstruována',loc=(*CRANK,15),explode=(-20,-20,26))
torus(p,'vnější kroužek',17,2.8,darksteel);torus(p,'vnitřní kroužek',11,2.2,steel)
for i in range(8):
    a=i*2*math.pi/8
    cylinder(p,f'váleček {i+1}',1.6,7,edge,(14*math.cos(a),14*math.sin(a),0),verts=12)
# The one-way function inside the compound drive is represented once, by PLY00424.

for id,title,loc,outer,inner,src,kit in (
    ('PLY00421','Levé klikové ložisko PLY00421',(*CRANK,-35),25,10,SOURCE_PARTS,True),
    ('PLY00420','Pravé klikové ložisko PLY00420',(*CRANK,36),25,10,SOURCE_PARTS,True),
    ('PLY00423A','Opěrné ložisko motorové hřídele PLY00423A',(*MOTOR,44),13,3.5,SOURCE_PARTS,False),
    ('PLY00422','Ložisko mezihřídele u skříně PLY00422',(*INTERMEDIATE,-17),14,4,SOURCE_PARTS,False),
    ('PLY00423B','Opěrné ložisko mezihřídele PLY00423B',(*INTERMEDIATE,44),13,4,SOURCE_PARTS,False),
    ('PLY00424','Spojkové ložisko mezihřídele PLY00424',(*INTERMEDIATE,-8),16,6,SOURCE_PARTS,False),
):
    p=part(id,title,'Ložiska','Katalogizované ložisko pohonné jednotky PW/PW-SE. Zdejší poloha a rozměry jsou studijní rekonstrukcí.'+(' Jednosměrná spojka uvnitř nylonové převodové sestavy.' if id=='PLY00424' else ''),verification='ověřené katalogové označení; poloha rekonstruována',source=src,kit=kit,loc=loc,explode=(loc[0]*.45,loc[1]*.45,(-40 if loc[2]<0 else 48)))
    bearing(p,'ložisko',outer,inner,7)
for id,title,z in (('PLY00426','Levý O-kroužek klikového ložiska PLY00426',-39),('PLY00427','Pravý O-kroužek klikového ložiska PLY00427',40)):
    p=part(id,title,'Těsnění','O-kroužek u příslušného klikového ložiska; profil a osazení jsou rekonstruované.',verification='ověřené označení dílu',source=SOURCE_PARTS,kit=True,loc=(*CRANK,z),explode=(-19,0,-49 if z<0 else 52))
    torus(p,'O-kroužek',23,1.1,black)
p=part('PLY00425','Těsnění klikové osy PLY00425','Těsnění','Samostatně katalogizované těsnění klikové osy. Přesné členství v sadě PLY00700 ze zveřejněného popisu nepotvrzeno.',verification='ověřený katalogový díl; členství v sadě neověřeno',source=SOURCE_PARTS,kit=False,loc=(*CRANK,-44),explode=(-16,0,-57))
torus(p,'těsnicí břit',14,2.2,black)

p=part('torque_sensor','Snímač krouticího momentu','Elektronika','Sleduje sílu jezdce na klikové ose; vnější umístění a konstrukce jsou studijní.',verification='ověřená přítomnost; geometrie rekonstruována',loc=(*CRANK,-18),explode=(-32,-15,-28))
torus(p,'snímací prstenec',20,2.1,chip);torus(p,'kontakt',16,.8,gold,(0,0,2))
p=part('control_pcb','Řídicí deska elektroniky','Elektronika','Deska řídí napájení motoru a snímá vstupy. PW-SE existuje ve více elektricky nekompatibilních revizích; osazení je ilustrativní.',verification='ověřená funkce a více revizí; osazení rekonstruováno',loc=(28,-48,8),explode=(35,-54,23))
cube(p,'substrát PCB',(47,26,1.7),pcb)
for i,(x,y,sx,sy) in enumerate(((-14,-5,8,6),(0,0,12,10),(14,4,8,6),(-11,7,4,4),(13,-7,5,5))):
    cube(p,f'čip nebo výkonový prvek {i+1}',(sx,sy,2.4),chip,(x,y,2.1),.35)
for i in range(24):
    x=-20+(i%8)*5.7;y=-9+(i//8)*7
    cube(p,f'kontakt {i+1}',(1.2,2,.15),gold,(x,y,1.0),0)
for i in range(3):
    cube(p,f'konektor {i+1}',(6,5,5),black,(-18+i*16,-15,3),.5)

p=part('pressure_vent','Odvětrávací membrána','Těsnění','Membrána pro vyrovnání tlaku a omezení kondenzace; přesný výrobek a poloha nejsou doloženy.',verification='ověřená přítomnost; poloha rekonstruována',loc=(57,28,52),explode=(42,26,71))
cylinder(p,'membrána',4,1,black,verts=32);torus(p,'rámeček',4.5,.7,edge)

p=part('drive_shim','Vymezovací podložka převodu','Převody','Podložka doložená na PW ve videu 2:53. Obrys, rozměry a zdejší usazení jsou ilustrativní.',verification='doloženo na PW; rozměry rekonstruovány',source=SOURCE_VIDEO+'&t=173s',loc=(*INTERMEDIATE,-25),explode=(0,0,-48))
ring_cylinder(p,'tenká podložka',7,4,.7,steel)
p=part('freewheel_bush','Pouzdro volnoběžky','Volnoběžky','Samostatně snímané pouzdro před nylonovou převodovou sestavou na PW. Obrys a usazení jsou schematické.',verification='doloženo na PW; tvar schematický',source=SOURCE_VIDEO+'&t=193s',loc=(*CRANK,-12),explode=(0,0,-75))
ring_cylinder(p,'schematické pouzdro',16,9.5,8,steel)
p=part('inner_cover','Vnitřní plastový kryt','Skříň','Doložen na PW ve videu 3:27. Model používá zjednodušený prstenec; přesný obrys, úchyty a průchody kabeláže nejsou změřené.',verification='doloženo na PW; tvar schematický',source=SOURCE_VIDEO+'&t=207s',loc=(*CRANK,-25),explode=(0,0,-65))
ring_cylinder(p,'schematický plastový prstenec',31,21,2,chip)

for i,(x,y) in enumerate(((-69,-42),(-76,9),(-57,49),(5,63),(65,13),(34,-62))):
    p=part(f'case_bolt_{i+1:02d}',f'Šroub víka {i+1}','Spojovací díly','Šest šroubů víka odpovídá referenčnímu PW ve videu 0:49. Přesné rozmístění a délka jsou rekonstruované; počet na konkrétním SyncDrive není potvrzen.',verification='počet doložen na PW; osazení rekonstruováno',source=SOURCE_VIDEO+'&t=49s',loc=(x,y,-52),explode=(0,0,-60))
    fastener(p,'šroub skříně',(0,0,0),-1)

os.makedirs(OUT,exist_ok=True)
# Save study with separate editable objects and hierarchy.
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.show_region_ui=False
            space.overlay.show_overlays=False
            space.shading.type='SOLID'
            space.shading.color_type='MATERIAL'
            space.region_3d.view_location=(0,0,0)
            space.region_3d.view_distance=.36
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'syncdrive_sport.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'syncdrive_sport.glb'),export_format='GLB',export_yup=True,export_apply=False,export_extras=True)
with open(os.path.join(OUT,'parts_metadata.json'),'w',encoding='utf8') as f:
    json.dump({'title':'Giant SyncDrive Sport / Yamaha PW-PW-SE — studijní rekonstrukce',
               'basis':'Ověřené katalogové vztahy a parametry jsou odlišeny od rekonstruované geometrie.',
               'sources':[SOURCE_TEARDOWN,SOURCE_PARTS,SOURCE_VIDEO],
               'kit_ply00700_note':'Veřejný popis uvádí kliková ložiska a O-kroužky. Členství PLY00425 není potvrzeno.',
               'parts':PARTS},f,ensure_ascii=False,indent=2)
print('EXPORTED',len(PARTS),'parts to',OUT)
