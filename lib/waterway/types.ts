export type LevelStatus = "critical" | "warning" | "normal" | "low" | "offline";

export type DataSource = "bma" | "thaiwater";

export type LevelStation = {
  id: string;
  source: DataSource;
  code: string | null;
  name: string;
  nameEn: string | null;
  waterway: string | null;
  district: string | null;
  province: string;
  lat: number;
  lng: number;
  level: number | null;
  levelOut: number | null;
  previous: number | null;
  warning: number | null;
  critical: number | null;
  warningOut: number | null;
  criticalOut: number | null;
  bankLeft: number | null;
  bankRight: number | null;
  bankMin: number | null;
  bedLevel: number | null;
  maxToday: number | null;
  maxYesterday: number | null;
  status: LevelStatus;
  statusText: string;
  headroom: number | null;
  agencyStatus: string | null;
  updatedAt: string | null;
  agency: string;
  isGate: boolean;
  url: string | null;
  graphStationId: number | null;
};

export type PumpUnit = {
  no: number;
  running: boolean;
  tripped: boolean;
};

export type PumpState = "running" | "standby" | "offline";

export type PumpStation = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  district: string;
  side: string | null;
  lat: number;
  lng: number;
  pumpCount: number;
  capacityCms: number | null;
  units: PumpUnit[];
  state: PumpState;
  waterLevel: number | null;
  rtuOnline: boolean;
  plcOnline: boolean;
  doorOpen: boolean;
  lampAlarm: boolean;
  paAlarm: boolean;
  updatedAt: string | null;
  url: string | null;
};

export type FlowStation = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  waterway: string | null;
  district: string;
  lat: number;
  lng: number;
  discharge: number | null;
  level: number | null;
  velocity: number | null;
  area: number | null;
  warning: number | null;
  critical: number | null;
  statusText: string;
  online: boolean;
  updatedAt: string | null;
  url: string | null;
};

export type BmaPayload = {
  fetchedAt: string;
  levels: LevelStation[];
  pumps: PumpStation[];
  flows: FlowStation[];
};

export type ThaiwaterPayload = {
  fetchedAt: string;
  levels: LevelStation[];
};

export type GraphPoint = {
  time: string;
  value: number | null;
};

export type RiverKey =
  | "ping"
  | "wang"
  | "yom"
  | "nan"
  | "sakaekrang"
  | "chaophraya"
  | "noi"
  | "lopburi"
  | "pasak"
  | "thachin"
  | "maeklong"
  | "bangpakong";

// ThaiWater situation_level: 1 น้ำน้อยวิกฤต · 2 น้ำน้อย · 3 ปกติ · 4 น้ำมาก · 5 ล้นตลิ่ง
export type Situation = 1 | 2 | 3 | 4 | 5;

export type CentralStation = {
  id: string;
  code: string | null;
  name: string;
  province: string;
  district: string | null;
  basin: string | null;
  river: string | null;
  riverKey: RiverKey | null;
  lat: number;
  lng: number;
  level: number | null;
  previous: number | null;
  bankMin: number | null;
  groundLevel: number | null;
  bankPercent: number | null;
  discharge: number | null;
  situation: Situation | null;
  /** Last reading is older than STALE_AFTER_MS — the gauge is probably down, so the value is not trusted. */
  stale: boolean;
  isKey: boolean;
  updatedAt: string | null;
  agency: string;
  graphStationId: number | null;
};

export type DamStation = {
  id: string;
  name: string;
  nameEn: string | null;
  province: string;
  basin: string | null;
  riverKey: RiverKey | null;
  lat: number;
  lng: number;
  storage: number | null;
  storagePercent: number | null;
  usable: number | null;
  usablePercent: number | null;
  inflow: number | null;
  released: number | null;
  spilled: number | null;
  maxStorage: number | null;
  normalStorage: number | null;
  date: string | null;
  cctvUrl: string | null;
};

export type CentralPayload = {
  fetchedAt: string;
  damsFetchedAt: string | null;
  stations: CentralStation[];
  dams: DamStation[];
};

export type RiverFeatureProps = { r: RiverKey; n: string };

export type RiverCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RiverFeatureProps>;

export type TrendDirection = "rising" | "falling" | "stable";

export type TrendStation = {
  id: string;
  name: string;
  waterway: string | null;
  district: string | null;
  province: string;
  source: DataSource;
  level: number | null;
  delta: number;
  rateHour: number;
  direction: TrendDirection;
};

export type TrendResponse = {
  fetchedAt: string;
  windowHours: number;
  counts: { rising: number; falling: number; stable: number; noData: number };
  topRising: TrendStation[];
  topFalling: TrendStation[];
  overall: { t: string; avg: number }[];
};

export type WaterwayFeatureProps = {
  t: string;
  n?: string;
  e?: string;
};

export type WaterwayCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  WaterwayFeatureProps
>;
