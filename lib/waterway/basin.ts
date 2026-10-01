import type { RiverKey } from "./types";

// ThaiWater basin names whose water ends up at Bangkok or the central-region river mouths.
export const CENTRAL_BASINS = new Set([
  "ลุ่มน้ำปิง",
  "ลุ่มน้ำวัง",
  "ลุ่มน้ำยม",
  "ลุ่มน้ำน่าน",
  "ลุ่มน้ำสะแกกรัง",
  "ลุ่มน้ำเจ้าพระยา",
  "ลุ่มน้ำป่าสัก",
  "ลุ่มน้ำท่าจีน",
  "ลุ่มน้ำแม่กลอง",
  "ลุ่มน้ำบางปะกง",
]);

export const RIVER_META: Record<RiverKey, { label: string; weight: number }> = {
  ping: { label: "แม่น้ำปิง", weight: 3 },
  wang: { label: "แม่น้ำวัง", weight: 2.5 },
  yom: { label: "แม่น้ำยม", weight: 2.5 },
  nan: { label: "แม่น้ำน่าน", weight: 3 },
  sakaekrang: { label: "แม่น้ำสะแกกรัง", weight: 2 },
  chaophraya: { label: "แม่น้ำเจ้าพระยา", weight: 4.5 },
  noi: { label: "แม่น้ำน้อย", weight: 2 },
  lopburi: { label: "แม่น้ำลพบุรี", weight: 2 },
  pasak: { label: "แม่น้ำป่าสัก", weight: 3 },
  thachin: { label: "แม่น้ำท่าจีน", weight: 3 },
  maeklong: { label: "แม่น้ำแม่กลอง", weight: 3 },
  bangpakong: { label: "แม่น้ำบางปะกง", weight: 3 },
};

const RIVER_BY_NAME: Record<string, RiverKey> = {
  แม่น้ำปิง: "ping",
  แม่น้ำวัง: "wang",
  แม่น้ำยม: "yom",
  แม่น้ำน่าน: "nan",
  แม่น้ำสะแกกรัง: "sakaekrang",
  แม่น้ำเจ้าพระยา: "chaophraya",
  แม่น้ำน้อย: "noi",
  แม่น้ำลพบุรี: "lopburi",
  แม่น้ำป่าสัก: "pasak",
  แม่น้ำท่าจีน: "thachin",
  แม่น้ำสุพรรณ: "thachin",
  แม่น้ำสุพรรณบุรี: "thachin",
  แม่น้ำนครชัยศรี: "thachin",
  แม่น้ำแม่กลอง: "maeklong",
  แม่น้ำแควใหญ่: "maeklong",
  แม่น้ำแควน้อย: "maeklong",
  แม่น้ำบางปะกง: "bangpakong",
  แม่น้ำปราจีนบุรี: "bangpakong",
  แม่น้ำนครนายก: "bangpakong",
  คลองพระปรง: "bangpakong",
  แควหนุมาน: "bangpakong",
};

export function riverKeyOf(name: string | null | undefined): RiverKey | null {
  return name ? (RIVER_BY_NAME[name.trim()] ?? null) : null;
}

const DAM_RIVER: Record<string, RiverKey> = {
  ลุ่มน้ำปิง: "ping",
  ลุ่มน้ำวัง: "wang",
  ลุ่มน้ำยม: "yom",
  ลุ่มน้ำน่าน: "nan",
  ลุ่มน้ำสะแกกรัง: "sakaekrang",
  ลุ่มน้ำป่าสัก: "pasak",
  ลุ่มน้ำท่าจีน: "thachin",
  ลุ่มน้ำแม่กลอง: "maeklong",
  ลุ่มน้ำบางปะกง: "bangpakong",
};

export function damRiverKey(basin: string | null | undefined): RiverKey | null {
  return basin ? (DAM_RIVER[basin] ?? null) : null;
}

// North-to-sea route shown in the sidebar. Station codes are ThaiWater "oldcode"s,
// dam ids are ThaiWater dam ids; any that are missing upstream are simply skipped.
export type SchematicBranch = {
  river: RiverKey;
  label: string;
  dams?: string[];
  stations: string[];
};

export type SchematicReach = {
  id: string;
  label: string;
  note: string;
  branches: SchematicBranch[];
};

export const SCHEMATIC: SchematicReach[] = [
  {
    id: "north",
    label: "ต้นน้ำภาคเหนือ",
    note: "ปิง วัง ยม น่าน ไหลลงสู่นครสวรรค์",
    branches: [
      { river: "ping", label: "ปิง", dams: ["dam-23", "dam-38", "dam-1"], stations: ["P.1", "P.2A", "P.7A", "P.17"] },
      { river: "wang", label: "วัง (ลงปิง)", dams: ["dam-35", "dam-34"], stations: ["W.1C", "W.4A"] },
      { river: "yom", label: "ยม (ลงน่าน)", dams: ["dam-230"], stations: ["Y.20", "Y.4", "Y.16", "Y.5"] },
      { river: "nan", label: "น่าน", dams: ["dam-12", "dam-36"], stations: ["N.1", "N.60", "N.5A", "N.7A", "N.67"] },
    ],
  },
  {
    id: "nakhonsawan",
    label: "ปากน้ำโพ นครสวรรค์",
    note: "ปิงรวมน่านเป็นแม่น้ำเจ้าพระยา",
    branches: [
      { river: "chaophraya", label: "เจ้าพระยา", stations: ["C.2"] },
      { river: "sakaekrang", label: "สะแกกรัง", dams: ["dam-18"], stations: ["Ct.19", "Ct.2A"] },
    ],
  },
  {
    id: "chaophrayadam",
    label: "เขื่อนเจ้าพระยา ชัยนาท",
    note: "จุดควบคุมน้ำก่อนเข้าภาคกลางตอนล่าง",
    branches: [
      { river: "chaophraya", label: "เจ้าพระยา", stations: ["C.13", "C.3", "C.7A"] },
      { river: "noi", label: "น้อย", stations: ["C.36"] },
      { river: "thachin", label: "ท่าจีน/สุพรรณ", dams: ["dam-17"], stations: ["THA004", "T.13"] },
    ],
  },
  {
    id: "ayutthaya",
    label: "พระนครศรีอยุธยา",
    note: "ป่าสักไหลรวมเจ้าพระยา",
    branches: [
      { river: "pasak", label: "ป่าสัก", dams: ["dam-11"], stations: ["S.28", "S.26", "S.5"] },
      { river: "chaophraya", label: "เจ้าพระยา", stations: ["C.35", "CPY012"] },
    ],
  },
  {
    id: "metro",
    label: "ปทุมธานี · นนทบุรี · กรุงเทพฯ",
    note: "ระดับน้ำขึ้นลงตามน้ำทะเลหนุน",
    branches: [
      { river: "chaophraya", label: "เจ้าพระยา", stations: ["CPY014", "C.12", "CPY015"] },
      { river: "thachin", label: "ท่าจีน (นครปฐม)", stations: ["T.1", "T.14"] },
    ],
  },
  {
    id: "mouth",
    label: "ปากแม่น้ำ ออกอ่าวไทย",
    note: "สมุทรปราการ · สมุทรสาคร · สมุทรสงคราม",
    branches: [
      { river: "chaophraya", label: "เจ้าพระยา · สมุทรปราการ", stations: ["BKC003", "BKC004"] },
      { river: "thachin", label: "ท่าจีน · สมุทรสาคร", stations: ["THA009"] },
      { river: "maeklong", label: "แม่กลอง · สมุทรสงคราม", dams: ["dam-14", "dam-15"], stations: ["K.55A", "MKG006"] },
    ],
  },
];

export const CENTRAL_BOUNDS: [[number, number], [number, number]] = [
  [13.2, 98.3],
  [19.95, 102.4],
];
