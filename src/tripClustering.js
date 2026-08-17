// Shared trip-detection logic used by both the monthly Recap reel
// (reelShared.jsx) and the Trips map (TripsMapScreen.jsx) -- kept in one
// place so "what counts as the same trip" and "where home is" can't drift
// between the two, the same reasoning reelShared.jsx itself was split out
// for (see its own top-of-file comment).

const TRIP_DISTANCE_MILES = 25;

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "Home" is the coordinate cluster with the most neighbors within
// TRIP_DISTANCE_MILES of each other -- the place entries most often happen,
// not necessarily a literal saved address.
export function findHomePoint(entries) {
  const pts = entries.filter(e => e.locationLat != null && e.locationLng != null);
  if (pts.length < 2) return null;
  let best = null, bestCount = 0;
  pts.forEach(p => {
    const count = pts.filter(q => haversine(p.locationLat, p.locationLng, q.locationLat, q.locationLng) <= TRIP_DISTANCE_MILES).length;
    if (count > bestCount) { bestCount = count; best = p; }
  });
  if (!best || bestCount < 2) return null;
  return { lat: best.locationLat, lng: best.locationLng };
}

// Groups every entry more than TRIP_DISTANCE_MILES from home into trips --
// two far-from-home entries within TRIP_DISTANCE_MILES of each other are
// the same trip, further apart they're separate ones. Returns raw entry
// clusters; callers build their own display shape on top of them (the reel
// wants one representative photo, the Trips map wants every photo).
export function clusterIntoTrips(entries, homePt) {
  if (!homePt) return [];
  const tripEntries = entries.filter(e =>
    e.locationLat != null && e.locationLng != null &&
    haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > TRIP_DISTANCE_MILES
  );
  if (tripEntries.length === 0) return [];

  const clusters = [];
  for (const e of tripEntries) {
    const cluster = clusters.find(c => c.some(o => haversine(o.locationLat, o.locationLng, e.locationLat, e.locationLng) <= TRIP_DISTANCE_MILES));
    if (cluster) cluster.push(e);
    else clusters.push([e]);
  }
  return clusters;
}

// Maps a real lat/lng onto the illustrated travel-map.png (998x558) as a
// percentage position -- calibrated against known city coordinates (NYC,
// London, Tokyo, Sydney, Reykjavik, Cape Town, Rio, LA) rather than derived
// from a formal projection, since the art is hand-drawn, not a strict
// equirectangular render. Good to within a city's width, not survey-grade --
// fine for "roughly where we went," which is all a 40px pin target needs.
const MAP_BOUNDS = { lngMin: -169, lngMax: 191, latMin: -58, latMax: 78 };
export function latLngToMapPercent(lat, lng) {
  const x = (lng - MAP_BOUNDS.lngMin) / (MAP_BOUNDS.lngMax - MAP_BOUNDS.lngMin) * 100;
  const y = (MAP_BOUNDS.latMax - lat) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin) * 100;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}
