// Sequence observed on the PW reference, not a confirmed procedure for every SyncDrive variant.
export const REFERENCE_VIDEO='https://www.youtube.com/watch?v=Me-H_Gykobc';
export const STEPS=[
  {title:'Motor na pracovním stole',text:'Začínáme jednotkou vyjmutou z kola, bez baterie, klik a převodníku.',tool:'Příprava mimo tento model',time:0,parts:[],note:'Rám, baterie, kliky, kabelové konektory a jejich demontáž nejsou modelovány. Konkrétní varianta SyncDrive Sport není potvrzena.'},
  {title:'Šrouby bočního víka',text:'V referenčním PW se nejprve vyjme šest šroubů víka.',tool:'Nástrčný klíč 8 mm · referenční PW',time:49,parts:Array.from({length:6},(_,i)=>`case_bolt_${String(i+1).padStart(2,'0')}`)},
  {title:'Oddělení víka',text:'Následuje uvolnění těsněného spoje a sejmutí víka.',tool:'Oddělení víka v určených místech',time:70,parts:['housing_gear_side'],note:'Dutina, otvory a dráha mají v tomto modelu prostorovou vůli. Styčné plochy a vodicí kolíky zůstávají zjednodušené; nejde o výrobní rozměry.'},
  {title:'Velké ocelové kolo',text:'Vyjme se velké kolo; pravé klikové ložisko zatím zůstává na jeho sestavě.',tool:'Vyjmutí podsestavy',time:133,parts:['gear_101','output_sprocket','oneway_pedal','PLY00420','PLY00427']},
  {title:'Tenká vymezovací podložka',text:'Na převodové sestavě je tenká podložka; může ulpět na ložisku víka.',tool:'Uložení podložky zvlášť',time:173,parts:['drive_shim'],note:'V původním modelu chyběla. Zdejší tloušťka a poloha jsou ilustrativní.'},
  {title:'Pouzdro a nylonový převod',text:'Nejprve se sejme pouzdro volnoběžky, potom převodová podsestava. Její ložiska zůstávají uvnitř.',tool:'Dva navazující pohyby',time:193,parts:['freewheel_bush','gear_56','gear_16','intermediate_shaft','PLY00423B','PLY00424'],note:'Pouzdro má schematický obrys. Výměna vnitřních ložisek převodu je samostatná odbočka mimo sadu PLY00700.'},
  {title:'Vnitřní plastový kryt',text:'Odsune se plastový kryt a zpřístupní se elektronika.',tool:'Sejmutí krytu',time:207,parts:['inner_cover'],note:'Kryt byl doplněn jako zjednodušený prstenec. Přesný obrys, úchyty a kabelové průchody nejsou změřené.'},
  {title:'Uvolnění řídicí desky',text:'Upevnění desky se povolí; deska se pouze nadzvedne.',tool:'Odpovídající šroubovák JIS',time:219,parts:['control_pcb'],note:'Deska zůstává připojená. Její pohyb je schematický; kabeláž a jednotlivé upevňovací šrouby nejsou modelovány.'},
  {title:'Odpojení snímače',text:'Zpřístupní se a uvolní připojení snímače momentu.',tool:'Identifikace konektoru snímače',time:277,parts:['torque_sensor'],note:'Tento krok je textový kontrolní bod. Model neukazuje detail konektoru ani jeho západky.'},
  {title:'Vyjmutí klikové hřídele',text:'Hřídel se vyjme společně s levým ložiskem a snímačem.',tool:'Vyjmutí podsestavy',time:319,parts:['crank_spindle','PLY00421','PLY00426','torque_sensor']},
  {title:'Pravé klikové ložisko',text:'Z odložené sestavy velkého kola se stáhne pravé ložisko.',tool:'Vhodný stahovák ložisek',time:337,parts:['PLY00420','PLY00427'],note:'Zobrazený odsuv nenapodobuje tlak stahováku. Kontaktní plochy nástroje nejsou modelovány.'},
  {title:'Pravý O-kroužek',text:'Pravé ložisko má jemný O-kroužek ve vnější drážce.',tool:'Kontrola drážky',time:437,parts:['PLY00427'],note:'Model nejprve schematicky roztáhne pružný kroužek přes okraj ložiska, potom jej odsune. Velikost deformace není servisní specifikace.'},
  {title:'Snímač z klikové hřídele',text:'Před levým ložiskem se z hřídele sesune snímač momentu.',tool:'Sesunutí snímače',time:758,parts:['torque_sensor'],note:'Ve videu mezitím probíhá oprava nylonového převodu. Tato odbočka je zde vynechána, protože patří mimo PLY00700.'},
  {title:'Levé klikové ložisko',text:'Stahovák sejme levé ložisko; zachycení snímače se musí vyhnout.',tool:'Vhodný stahovák ložisek',time:799,parts:['PLY00421','PLY00426']},
  {title:'Levý O-kroužek',text:'Také levé ložisko má O-kroužek ve vnější drážce.',tool:'Kontrola drážky',time:817,parts:['PLY00426'],note:'Pružný kroužek se v animaci roztáhne, aby při sejmutí nepronikal pevným okrajem ložiska. Deformace je schematická.'},
  {title:'Sada PLY00700 zpřístupněna',text:'Obě kliková ložiska a oba O-kroužky jsou oddělené.',tool:'Konec této větve rozborky',time:869,parts:['PLY00420','PLY00421','PLY00426','PLY00427'],note:'Motor není rozebraný do posledního dílu. Zpět pouze vrací vizualizaci; montážní postup, mazání, nové tekuté těsnění a utahovací momenty tím nejsou nahrazeny.'},
];

const drive=['gear_101','output_sprocket','oneway_pedal','PLY00420','PLY00427'];
const compound=['gear_56','gear_16','intermediate_shaft','PLY00423B','PLY00424'];
const crank=['crank_spindle','PLY00421','PLY00426','torque_sensor'];
// Schematic extraction along the shaft axis, followed by parking beside the assembly.
// All offsets are Blender millimetres; they are presentation distances, not measured travel.
export function poseAt(index){
  const pose={};
  const put=(ids,offset)=>ids.forEach(id=>pose[id]=[...offset]);
  const add=(ids,offset)=>ids.forEach(id=>pose[id]=(pose[id]||[0,0,0]).map((v,i)=>v+offset[i]));
  if(index>=1)put(STEPS[1].parts,[210,-130,-200]);
  if(index>=2)put(['housing_gear_side'],[265,0,-110]);
  if(index>=3)put(drive,[-120,-85,-120]);
  if(index>=4)put(['drive_shim'],[100,-95,-70]);
  if(index>=5){put(['freewheel_bush'],[110,-70,-100]);put(compound,[125,95,-80]);}
  if(index>=6)put(['inner_cover'],[-140,85,-115]);
  if(index>=7)put(['control_pcb'],[0,0,-14]);
  if(index>=9)put(crank,[-130,65,-180]);
  if(index>=10)add(['PLY00420','PLY00427'],[0,-60,-70]);
  if(index>=11)add(['PLY00427'],[55,0,-25]);
  if(index>=12)add(['torque_sensor'],[60,0,-125]);
  if(index>=13)add(['PLY00421','PLY00426'],[-30,-65,-150]);
  if(index>=14)add(['PLY00426'],[-45,0,-25]);
  return pose;
}

// Two phases keep the initial motion axial; only then is the extracted unit parked aside.
export function interpolatePose(from,to,t){
  const pose={};
  const ease=v=>v*v*(3-2*v);
  const returning=Object.keys({...from,...to}).some(id=>(to[id]?.[2]||0)>(from[id]?.[2]||0));
  const moves=id=>JSON.stringify(from[id]||[0,0,0])!==JSON.stringify(to[id]||[0,0,0]);
  const transferStage=moves('freewheel_bush')&&moves('gear_56');
  for(const id of Object.keys({...from,...to})){
    const a=from[id]||[0,0,0],b=to[id]||[0,0,0];
    let localT=t;
    if(transferStage&&(id==='freewheel_bush'||compound.includes(id))){
      const first=returning?compound.includes(id):id==='freewheel_bush';
      localT=first?Math.min(1,t*2):Math.max(0,(t-.5)*2);
    }
    const parent=id==='PLY00427'?'PLY00420':id==='PLY00426'?'PLY00421':null;
    if(parent&&moves(id)&&!moves(parent))localT=returning?Math.min(1,t/.75):Math.max(0,(t-.25)/.75);
    const axial=ease(Math.min(1,localT/.6)),lateral=ease(Math.max(0,(localT-.6)/.4));
    pose[id]=a.map((v,i)=>v+(b[i]-v)*(i===2?(returning?lateral:axial):(returning?axial:lateral)));
  }
  return pose;
}

export function scalesAt(pose){
  const scales={};
  for(const [id,parent] of [['PLY00427','PLY00420'],['PLY00426','PLY00421']]){
    const a=pose[id]||[0,0,0],b=pose[parent]||[0,0,0];
    scales[id]=a.some((v,i)=>Math.abs(v-b[i])>.001)?1.12:1;
  }
  return scales;
}
export function interpolateScales(from,to,t){
  const a=scalesAt(from),b=scalesAt(to),scales={};
  for(const id of Object.keys(a)){
    const fraction=b[id]>a[id]?Math.min(1,t/.25):Math.max(0,(t-.75)/.25);
    const ease=fraction*fraction*(3-2*fraction);
    scales[id]=a[id]+(b[id]-a[id])*ease;
  }
  return scales;
}
