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

export type WaterwayFeatureProps = {
  t: string;
  n?: string;
  e?: string;
};

export type WaterwayCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  WaterwayFeatureProps
>;
