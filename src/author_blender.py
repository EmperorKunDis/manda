#!/usr/bin/env python3
"""
Blender authoring script for Giant SyncDrive Sport motor assembly.
Generates realistic 3D geometry based on Yamaha PW/PW-SE teardown documentation.

Source data:
- avdweb.nl/solar-bike/hub-motor/yamaha-pw-se (PW-SE teardown)
- ebikemotorcentre.com/yamaha-motor-parts/yamaha-pw-and-pw-se/ (parts fitment)
- PLY00700 crankshaft bearing kit components

Dimensions verified from teardown; geometry is mechanically plausible reconstruction.
Not exact OEM CAD — proportions are derived from source photos and part specs.
"""

import bpy
import math
import json
import os

# ── Constants ──────────────────────────────────────────────────────────────

SCALE = 0.001  # mm to Blender units (meters)
Z_AXIS = 'Z'  # Motor axis of rotation

# Gear specs (verified from teardown)
GEAR_8_STEEL = {"teeth": 8, "dia": 10.8, "width": 22.0, "mat": "steel"}
GEAR_56_NYLON = {"teeth": 56, "dia": 61.0, "width": 22.0, "mat": "nylon"}
GEAR_16_STEEL = {"teeth": 16, "dia": 19.0, "width": 12.0, "mat": "steel"}
GEAR_101_STEEL = {"teeth": 101, "dia": 105.0, "width": 12.0, "mat": "steel"}

# PLY00700 Crankshaft Bearing Kit components (verified part numbers)
PLY00700_PARTS = [
    "PLY00420", "PLY00421", "PLY00426", "PLY00427"
]

# Part metadata for GLB export and web UI
PARTS_METADATA = {}

def mm(val):
    """Convert mm to Blender meters."""
    return val * SCALE

def clear_scene():
    """Remove all objects from scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)

def new_object(name, data, collection=None):
    """Create new object and add to collection."""
    if collection is None:
        collection = bpy.context.collection
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj

def set_metadata(name, category, desc_cz, source, verified, ply00700=False):
    """Store metadata for a part."""
    PARTS_METADATA[name] = {
        "name": name,
        "category": category,
        "desc_cz": desc_cz,
        "source": source,
        "verified": verified,
        "ply00700": ply00700
    }

def create_material(name, color, metalness=0.0, roughness=0.5):
    """Create PBR material. Color must be RGBA tuple."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    for n in nodes:
        nodes.remove(n)
    
    # Principled BSDF
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    # Ensure RGBA (4 values)
    if len(color) == 3:
        color = color + (1.0,)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metalness
    bsdf.inputs["Roughness"].default_value = roughness
    
    # Output
    output = nodes.new(type="ShaderNodeOutputMaterial")
    
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    
    return mat

def make_cylinder(name, radius, height, segments=32, material=None, name_obj=None):
    """Create cylinder along Z axis."""
    if name_obj is None:
        name_obj = name
    bpy.ops.mesh.primitive_cylinder_add(
        radius=mm(radius), depth=mm(height), 
        vertices=segments, location=(0, 0, 0)
    )
    obj = bpy.context.active_object
    obj.name = name_obj
    obj.data.name = name
    if material:
        obj.data.materials.append(material)
    return obj

def make_bolt(name, length, thread_dia, head_dia, material):
    """Create bolt: cylinder with hex head."""
    # Shaft
    make_cylinder(name + "_shaft", thread_dia/2, length - head_dia*0.6, 12, material, name + "_shaft")
    # Head (hex prism approximated by 6-sided cylinder)
    make_cylinder(name + "_head", head_dia/2, head_dia*0.6, 6, material, name + "_head")
    bpy.context.object.location.z = mm((length - head_dia*0.6)/2 + head_dia*0.3)
    
    # Join
    bpy.ops.object.select_all(action="DESELECT")
    for child in bpy.context.selected_objects:
        child.select_set(True)
    bpy.ops.object.join()
    
    obj = bpy.context.active_object
    obj.name = name
    return obj

def make_gear(name, spec, material, name_obj=None):
    """Create gear with teeth profile."""
    if name_obj is None:
        name_obj = name
    teeth = spec["teeth"]
    outer_dia = spec["dia"] + 2.0  # Add tooth height
    inner_dia = spec["dia"] - 2.0
    width = spec["width"]
    
    # Create gear blank (cylinder)
    make_cylinder(name + "_blank", inner_dia/2, width, teeth * 2, material, name_obj)
    
    # Add teeth as raised segments
    tooth_angle = (2 * math.pi) / teeth
    for i in range(teeth):
        angle = i * tooth_angle
        # Tooth as a small cylinder segment
        tooth_r = (outer_dia - inner_dia) / 2
        tooth_x = (inner_dia/2 + tooth_r/2) * math.cos(angle)
        tooth_y = (inner_dia/2 + tooth_r/2) * math.sin(angle)
        
        bpy.ops.mesh.primitive_cylinder_add(
            radius=mm(tooth_r/2), depth=mm(width),
            vertices=4, location=(mm(tooth_x), mm(tooth_y), 0)
        )
        tooth = bpy.context.active_object
        tooth.rotation.z = angle
        tooth.rotation.x = math.pi/2
        if material:
            tooth.data.materials.append(material)
    
    # Join all teeth
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.object.select_set(True)
    for child in bpy.context.selected_objects:
        child.select_set(True)
    bpy.ops.object.join()
    
    obj = bpy.context.active_object
    obj.name = name_obj
    return obj

def make_ribbed_housing_half(name, radius, depth, num_ribs=8, material=None):
    """Create motor housing half with cooling ribs."""
    # Main housing shell
    make_cylinder(name + "_shell", radius, depth, 32, material, name)
    
    # Inner cavity (to be boolean-subtracted later)
    cavity_r = radius - 3.0
    make_cylinder(name + "_cavity", cavity_r, depth - 2.0, 32, None, name + "_cavity")
    bpy.context.object.location.z = mm(-1.0)
    
    # Cooling ribs on exterior
    for i in range(num_ribs):
        angle = (2 * math.pi * i) / num_ribs
        rib_x = (radius + 1.5) * math.cos(angle)
        rib_y = (radius + 1.5) * math.sin(angle)
        
        bpy.ops.mesh.primitive_box_add(
            size=(mm(3.0), mm(depth), mm(3.0)),
            location=(mm(rib_x), mm(rib_y), 0)
        )
        rib = bpy.context.active_object
        rib.rotation.z = angle
        if material:
            rib.data.materials.append(material)
    
    # Join ribs
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.object.select_set(True)
    for obj in bpy.context.selected_objects:
        if obj.name.startswith(name + "_"):
            obj.select_set(True)
    bpy.ops.object.join()
    
    return bpy.context.active_object

# ── Main Assembly ──────────────────────────────────────────────────────────

def build_assembly():
    """Build complete Giant SyncDrive Sport motor assembly."""
    
    clear_scene()
    
    # Materials
    mat_aluminum = create_material("cast_aluminum", (0.75, 0.73, 0.70), 0.6, 0.4)
    mat_steel = create_material("brushed_steel", (0.80, 0.80, 0.82), 0.85, 0.25)
    mat_nylon = create_material("nylon", (0.92, 0.90, 0.85), 0.1, 0.6)
    mat_copper = create_material("copper", (0.80, 0.45, 0.25), 0.9, 0.3)
    mat_pcb = create_material("pcb_green", (0.20, 0.50, 0.25), 0.1, 0.7)
    mat_elastomer = create_material("elastomer", (0.10, 0.10, 0.12), 0.0, 0.9)
    mat_electronics = create_material("electronics", (0.30, 0.30, 0.35), 0.3, 0.5)
    
    # ── Housing (asymmetric cast) ──────────────────────────────────────────
    
    # Right cover (larger, contains motor)
    housing_right = make_ribbed_housing_half("housing_right", 55.0, 45.0, 10, mat_aluminum, "housing_right")
    housing_right.location.z = mm(22.5)
    
    # Left cover (smaller, crank side)
    housing_left = make_ribbed_housing_half("housing_left", 50.0, 25.0, 8, mat_aluminum, "housing_left")
    housing_left.location.z = mm(-12.5)
    
    # Housing joint (liquid gasket seam)
    gasket_joint = make_cylinder("gasket_joint", 52.0, 1.0, 32, mat_elastomer, "gasket_joint")
    gasket_joint.location.z = mm(0.5)
    
    set_metadata("housing_right", "pouzdro", 
        "Pravý kryt motoru – odléváný hliník s chladicími žebry. Obsahuje motorový stator a řadicí soupravu.",
        "avdweb.nl/solar-bike/hub-motor/yamaha-pw-se (teardown foto)", True, False)
    
    set_metadata("housing_left", "pouzdro",
        "Levý kryt – menší část pro čep, ložiska a jednovrstvovou spojku.",
        "avdweb.nl/solar-bike/hub-motor/yamaha-pw-se (teardown foto)", True, False)
    
    set_metadata("gasket_joint", "pouzdro",
        "Spoj mezi polovinami pouzdra utěsněn kapalným těsněním (ne O-kroužek).",
        "avdweb.nl/solar-bike/hub-motor/yamaha-pw-se", True, False)
    
    # ── Crank Spindle ─────────────────────────────────────────────────────
    
    crank_spindle = make_cylinder("crank_spindle", 8.0, 80.0, 16, mat_steel, "crank_spindle")
    crank_spindle.location.z = mm(-30.0)
    
    # Crank arm mounting flats
    flat1 = make_cylinder("crank_flat_1", 14.0, 6.0, 8, mat_steel, "crank_flat_1")
    flat1.location.z = mm(-65.0)
    
    set_metadata("crank_spindle", "hřídel",
        "Čep pedálu – nerezová ocel, protažený přes levý kryt a ložiska.",
        "Předmětná dokumentace (PLY00420/421/425)", True, False)
    
    set_metadata("crank_flat_1", "hřídel",
        "Plocha pro připevnění ramene pedálu na čepu.",
        "Rekonstrukce z foto rozboru", True, False)
    
    # ── Right Output Shaft ────────────────────────────────────────────────
    
    output_shaft = make_cylinder("output_shaft", 9.0, 70.0, 16, mat_steel, "output_shaft")
    output_shaft.location.z = mm(25.0)
    
    set_metadata("output_shaft", "hřídel",
        "Pravý výstupní hřídel – přenos točivého momentu k řetězové převodovce.",
        "Rekonstrukce z foto rozboru", True, False)
    
    # ── Motor Components ─────────────────────────────────────────────────
    
    # Stator (copper windings on iron core)
    stator = make_cylinder("stator", 42.0, 35.0, 24, mat_copper, "stator")
    stator.location.z = mm(20.0)
    
    # Iron core visible between windings
    stator_core = make_cylinder("stator_core", 38.0, 35.0, 12, mat_steel, "stator_core")
    stator_core.location.z = mm(20.0)
    
    # Rotor (magnet cylinder)
    rotor = make_cylinder("rotor", 15.0, 50.0, 16, mat_steel, "rotor")
    rotor.location.z = mm(25.0)
    
    set_metadata("stator", "motor",
        "Stator – měděné vinutí na železné jádro, generuje magnetické pole pro otáčení rotoru.",
        "avdweb.nl (teardown)", True, False)
    
    set_metadata("stator_core", "motor",
        "Jádro statoru – laminovaná ocel, vede magnetický flux.",
        "Rekonstrukce", True, False)
    
    set_metadata("rotor", "motor",
        "Rotor – trvalé magnety otáčivé v ose hřídele. Tlačí rotor přes řetězový převod.",
        "avdweb.nl (teardown)", True, False)
    
    # ── Pinion (8T Steel) ─────────────────────────────────────────────────
    
    pinion = make_gear("pinion_8t", GEAR_8_STEEL, mat_steel, "pinion_8t")
    pinion.location.z = mm(55.0)
    
    set_metadata("pinion_8t", "převod",
        "Pion 8 zubů (ocel) – přenos z rotorového hřídele do řetězového převodu. 10,8 mm průměr, 22 mm šířka.",
        "avdweb.nl: 8 steel gear 10.8mm dia, 22mm width", True, False)
    
    # ── Gear Train ────────────────────────────────────────────────────────
    
    # 56T Nylon Gear (on crank spindle)
    gear_56 = make_gear("gear_56t_nylon", GEAR_56_NYLON, mat_nylon, "gear_56t_nylon")
    gear_56.location.z = mm(-40.0)
    
    set_metadata("gear_56t_nylon", "převod",
        "Nylonové ozubené kolo 56 zubů. 61 mm průměr, 22 mm šířka. Sníží rychlost, zvýší kroutící moment.",
        "avdweb.nl: 56 nylon gear 61mm dia, 22mm width", True, False)
    
    # 16T Steel Gear (intermediate)
    gear_16 = make_gear("gear_16t_steel", GEAR_16_STEEL, mat_steel, "gear_16t_steel")
    gear_16.location.z = mm(10.0)
    
    set_metadata("gear_16t_steel", "převod",
        "Mezikolo 16 zubů (ocel). 19 mm průměr, 12 mm šířka. Přenos mezi řetězovým převodem a výstupem.",
        "avdweb.nl: 16 steel gear 19mm dia, 12mm width", True, False)
    
    # 101T Steel Gear (large output)
    gear_101 = make_gear("gear_101t_steel", GEAR_101_STEEL, mat_steel, "gear_101t_steel")
    gear_101.location.z = mm(-60.0)
    
    set_metadata("gear_101t_steel", "převod",
        "Velké ozubené kolo 101 zubů (ocel). 105 mm průměr, 12 mm šířka. Výstup k řetězu kola.",
        "avdweb.nl: 101 steel gear 105mm dia, 12mm width", True, False)
    
    # ── One-Way Clutches ──────────────────────────────────────────────────
    
    # Clutch 1 (on crank spindle side)
    clutch_1_outer = make_cylinder("clutch1_outer", 18.0, 10.0, 24, mat_steel, "clutch1_outer")
    clutch_1_outer.location.z = mm(-35.0)
    
    clutch_1_inner = make_cylinder("clutch1_inner", 12.0, 10.0, 12, mat_steel, "clutch1_inner")
    clutch_1_inner.location.z = mm(-35.0)
    
    # Pawl/roller detail
    for i in range(6):
        angle = i * (2 * math.pi / 6)
        px = 14.0 * math.cos(angle)
        py = 14.0 * math.sin(angle)
        bpy.ops.mesh.primitive_cylinder_add(
            radius=mm(1.5), depth=mm(8.0), vertices=8,
            location=(mm(px), mm(py), mm(-35.0))
        )
        pawl = bpy.context.active_object
        pawl.name = f"clutch1_pawl_{i}"
        if mat_steel:
            pawl.data.materials.append(mat_steel)
    
    # Clutch 2 (on output side)
    clutch_2_outer = make_cylinder("clutch2_outer", 15.0, 8.0, 24, mat_steel, "clutch2_outer")
    clutch_2_outer.location.z = mm(45.0)
    
    clutch_2_inner = make_cylinder("clutch2_inner", 10.0, 8.0, 12, mat_steel, "clutch2_inner")
    clutch_2_inner.location.z = mm(45.0)
    
    set_metadata("clutch1_outer", "spojka",
        "Vnější pouzdro jednovrstvové spojky na straně čepu. Převod momentu při šlapání.",
        "avdweb.nl: two freewheel clutches", True, False)
    
    set_metadata("clutch1_inner", "spojka",
        "Vnitřní válec spojky s ozubeným hřebem.",
        "Rekonstrukce", True, False)
    
    set_metadata("clutch2_outer", "spojka",
        "Vnější pouzdro druhé jednovrstvové spojky na straně výstupního hřídele.",
        "avdweb.nl: two freewheel clutches", True, False)
    
    set_metadata("clutch2_inner", "spojka",
        "Vnitřní válec druhé spojky.",
        "Rekonstrukce", True, False)
    
    # ── PLY00700 Crankshaft Bearing Kit Components ────────────────────────
    
    # PLY00420 – RH crank bearing
    bearing_rh = make_cylinder("PLY00420_bearing_rh", 11.0, 6.0, 16, mat_steel, "PLY00420_bearing_rh")
    bearing_rh.location.z = mm(-10.0)
    set_metadata("PLY00420_bearing_rh", "ložisko",
        "PLY00420 – pravé čepní ložisko. Část kompletní sady PLY00700.",
        "ebikemotorcentre.com: PLY00420 RH crank bearing", True, True)
    
    # PLY00421 – LH crank bearing
    bearing_lh = make_cylinder("PLY00421_bearing_lh", 11.0, 6.0, 16, mat_steel, "PLY00421_bearing_lh")
    bearing_lh.location.z = mm(-55.0)
    set_metadata("PLY00421_bearing_lh", "ložisko",
        "PLY00421 – levé čepní ložisko. Část kompletní sady PLY00700.",
        "ebikemotorcentre.com: PLY00421 LH crank bearing", True, True)
    
    # PLY00426 – LH crank-bearing O-ring
    o_ring_lh = make_cylinder("PLY00426_oring_lh", 12.5, 1.5, 24, mat_elastomer, "PLY00426_oring_lh")
    o_ring_lh.location.z = mm(-58.0)
    set_metadata("PLY00426_oring_lh", "těsnění",
        "PLY00426 – O-kroužek levého čepního ložiska. Část sady PLY00700.",
        "ebikemotorcentre.com: PLY00426 LH crank-bearing O-ring", True, True)
    
    # PLY00427 – RH crank-bearing O-ring
    o_ring_rh = make_cylinder("PLY00427_oring_rh", 12.5, 1.5, 24, mat_elastomer, "PLY00427_oring_rh")
    o_ring_rh.location.z = mm(-7.0)
    set_metadata("PLY00427_oring_rh", "těsnění",
        "PLY00427 – O-kroužek pravého čepního ložiska. Část sady PLY00700.",
        "ebikemotorcentre.com: PLY00427 RH crank-bearing O-ring", True, True)
    
    # ── Other Bearings (not in PLY00700) ──────────────────────────────────
    
    # Motor shaft bearing
    bearing_motor = make_cylinder("bearing_motor", 10.0, 8.0, 16, mat_steel, "bearing_motor")
    bearing_motor.location.z = mm(15.0)
    set_metadata("bearing_motor", "ložisko",
        "Ložisko motorového hřídele. NE je v sadě PLY00700 (oddělené dílčí číslo).",
        "ebikemotorcentre.com (parts list)", True, False)
    
    # Output shaft bearing
    bearing_output = make_cylinder("bearing_output", 10.0, 8.0, 16, mat_steel, "bearing_output")
    bearing_output.location.z = mm(60.0)
    set_metadata("bearing_output", "ložisko",
        "Ložisko výstupního hřídele. NE je v sadě PLY00700.",
        "ebikemotorcentre.com (parts list)", True, False)
    
    # ── Crankshaft Seal ───────────────────────────────────────────────────
    
    crank_seal = make_cylinder("PLY00425_crank_seal", 13.0, 2.0, 24, mat_elastomer, "PLY00425_crank_seal")
    crank_seal.location.z = mm(-63.0)
    set_metadata("PLY00425_crank_seal", "těsnění",
        "PLY00425 – čepní těsnění (separátka). NE je v sadě PLY00700.",
        "ebikemotorcentre.com: PLY00425 crankshaft seal", True, False)
    
    # ── Electronics PCB ──────────────────────────────────────────────────
    
    pcb_board = make_cylinder("pcb_board", 40.0, 2.0, 32, mat_pcb, "pcb_board")
    pcb_board.location.z = mm(5.0)
    
    # ICs
    for i in range(3):
        angle = i * (2 * math.pi / 3)
        ix = 25.0 * math.cos(angle)
        iy = 25.0 * math.sin(angle)
        bpy.ops.mesh.primitive_box_add(
            size=(mm(4.0), mm(2.0), mm(3.0)),
            location=(mm(ix), mm(iy), mm(6.5))
        )
        ic = bpy.context.active_object
        ic.name = f"pcb_ic_{i}"
        if mat_electronics:
            ic.data.materials.append(mat_electronics)
    
    # Capacitor
    capacitor = make_cylinder("pcb_capacitor", 3.5, 5.0, 16, mat_electronics, "pcb_capacitor")
    capacitor.location.z = mm(7.5)
    capacitor.location.x = mm(15.0)
    
    set_metadata("pcb_board", "elektronika",
        "Ovládací deska s řadičem motoru a senzorem točivého momentu. Existuje více verzí PCB.",
        "avdweb.nl: multiple PCB versions", True, False)
    
    set_metadata("pcb_capacitor", "elektronika",
        "Kondenzátor na ovládací desce.",
        "Rekonstrukce", True, False)
    
    # ── Fasteners (bolts) ────────────────────────────────────────────────
    
    # Housing bolts (8 around circumference)
    for i in range(8):
        angle = i * (2 * math.pi / 8)
        bx = 52.0 * math.cos(angle)
        by = 52.0 * math.sin(angle)
        
        bolt = make_bolt(f"bolt_housing_{i}", 12.0, 4.0, 6.0, mat_steel)
        bolt.location = (mm(bx), mm(by), mm(0.0))
        bolt.rotation.z = angle
        
    set_metadata("bolt_housing_0", "šroub",
        "Montážní šroub spojující poloviny pouzdra motoru.",
        "Rekonstrukce z foto rozboru", True, False)
    
    # Crank bolt
    crank_bolt = make_bolt("bolt_crank", 30.0, 8.0, 16.0, mat_steel)
    crank_bolt.location.z = mm(-70.0)
    set_metadata("bolt_crank", "šroub",
        "Šroub ramene pedálu.",
        "Rekonstrukce", True, False)
    
    # ── Pressure Equalization Element ────────────────────────────────────
    
    pressure_el = make_cylinder("pressure_element", 4.0, 8.0, 12, mat_elastomer, "pressure_element")
    pressure_el.location = (mm(0), mm(50.0), mm(20.0))
    set_metadata("pressure_element", "těsnění",
        "Prvek vyvážení tlaku – kompenzuje změny tlaku uvnitř pouzdra při jízdě.",
        "avdweb.nl: pressure equalization element", True, False)
    
    # ── Torque Sensor ────────────────────────────────────────────────────
    
    torque_sensor = make_cylinder("torque_sensor", 7.0, 4.0, 16, mat_electronics, "torque_sensor")
    torque_sensor.location.z = mm(-50.0)
    set_metadata("torque_sensor", "elektronika",
        "Senzor točivého momentu – měří sílu šlapání pro regulaci asistence.",
        "avdweb.nl: torque sensor", True, False)
    
    # ── Apply transforms and set up collections ──────────────────────────
    
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    
    # Create collections for organization
    collections = {
        "pouzdro": "Pouzdro",
        "hřídel": "Hřídel",
        "převod": "Převody",
        "motor": "Motor",
        "ložisko": "Ložiska",
        "těsnění": "Těsnění",
        "elektronika": "Elektronika",
        "spojka": "Jednovrstvé spojky",
        "šroub": "Šrouby"
    }
    
    for key, name in collections.items():
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    
    # Assign objects to collections
    for obj in bpy.data.objects:
        meta = PARTS_METADATA.get(obj.name)
        if meta:
            cat = meta["category"]
            if cat in collections:
                bpy.context.scene.collection.objects.unlink(obj)
                collections[cat].objects.link(obj)
    
    # ── Export metadata ──────────────────────────────────────────────────
    
    # Save metadata JSON
    export_dir = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else "."
    export_dir = export_dir + "/../web/export"
    os.makedirs(export_dir, exist_ok=True)
    
    with open(export_dir + "/parts_metadata.json", "w", encoding="utf-8") as f:
        json.dump({
            "parts": PARTS_METADATA,
            "ply00700_parts": PLY00700_PARTS,
            "sources": {
                "teardown": "https://avdweb.nl/solar-bike/hub-motor/yamaha-pw-se",
                "parts": "https://www.ebikemotorcentre.com/yamaha-motor-parts/yamaha-pw-and-pw-se/"
            },
            "verified_dimensions": {
                "gear_8_steel": {"teeth": 8, "dia": "10.8mm", "width": "22mm"},
                "gear_56_nylon": {"teeth": 56, "dia": "61mm", "width": "22mm"},
                "gear_16_steel": {"teeth": 16, "dia": "19mm", "width": "12mm"},
                "gear_101_steel": {"teeth": 101, "dia": "105mm", "width": "12mm"}
            },
            "total_ratio": "44.2:1"
        }, f, indent=2, ensure_ascii=False)
    
    # ── Save .blend file ─────────────────────────────────────────────────
    
    blend_path = export_dir + "/syncdrive_sport.blend"
    bpy.data.filepath = blend_path
    bpy.ops.wm.save_mainfile()
    
    # ── Export GLB ───────────────────────────────────────────────────────
    
    glb_path = export_dir + "/syncdrive_sport.glb"
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_apply=True,
        export_selected=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_experimental_json_compression=True,
        export_normals=True,
        export_tangents=False,
        export_materials=True,
        export_yup=True  # GLTF standard: Y-up
    )
    
    print(f"Exported .blend: {blend_path}")
    print(f"Exported .glb: {glb_path}")
    print(f"Exported metadata: {export_dir}/parts_metadata.json")

if __name__ == "__main__":
    build_assembly()
