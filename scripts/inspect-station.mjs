const keyword = process.argv.slice(2);
const res = await fetch("https://weather.bangkok.go.th/water/PageMap/GoogleMap", {
  method: "POST",
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "payload=aegis",
});
const raw = await res.json();
const hit = raw.filter((r) =>
  keyword.every((k) => `${r.water_name} ${r.river_name} ${r.district_name}`.includes(k)),
);
console.log("BMA raw matches:", hit.length);
for (const r of hit) {
  console.log(JSON.stringify({
    id: r.water_id, code: r.water_code, name: r.water_name, river: r.river_name,
    district: r.district_name, lat: r.latitude, lng: r.longitude,
    wl_in: r.wl_in, wl_out01: r.wl_out01, warning: r.warning, critical: r.critical,
    left_bank: r.left_bank, right_bank: r.right_bank, status: r.txtStatus,
    statusFlag: r.status, adjust: r.adjust, minsAgo: r.datediffnow, at: r.site_timestampEN,
    max_in_day: r.max_in_day, max_in_yesterday: r.max_in_yesterday,
    wl_level: r.wl_level, wl_pos: r.wl_pos_name, gates: r.water_gate_count,
    url: r.water_url,
  }));
}

const hii = await (
  await fetch("https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)" },
  })
).json();
const near = hii.waterlevel_data.data.filter((r) => {
  const n = `${r.station.tele_station_name.th}`;
  return keyword.some((k) => n.includes(k));
});
console.log("ThaiWater matches:", near.length);
for (const r of near) {
  console.log(JSON.stringify({
    name: r.station.tele_station_name.th, code: r.station.tele_station_oldcode,
    lat: r.station.tele_station_lat, lng: r.station.tele_station_long,
    msl: r.waterlevel_msl, prev: r.waterlevel_msl_previous, at: r.waterlevel_datetime,
    min_bank: r.station.min_bank, ground: r.station.ground_level,
    left: r.station.left_bank, right: r.station.right_bank,
    situation: r.situation_level, diff: r.diff_wl_bank, text: r.diff_wl_bank_text,
    agency: r.agency.agency_shortname.th,
  }));
}
