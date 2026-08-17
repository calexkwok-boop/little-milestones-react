// Hand-off between App.jsx (where an entry gets saved) and TripsMapScreen
// (where manual pins live) for one specific case: a user tapped "Write a
// letter" from a manual placeholder pin, then actually wrote it. Once that
// entry exists it becomes a real, auto-detected trip — the manual pin is
// now redundant and should turn into that trip rather than sit alongside
// it as a separate, empty "places you haven't pinned yet" card.
//
// The two screens can't share React state directly (TripsMapScreen is
// unmounted the moment compose opens), so the request is queued here by
// entry id and resolved later, whenever TripsMapScreen next has a trip
// list that actually contains that entry.
const QUEUE_KEY = 'patina-trip-pending-pin-conversions';

// Conversions older than this were probably abandoned (entry never got a
// location, or something else went wrong) -- don't retry forever.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function writeQueue(list) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
}

export function queuePinConversion({ manualPinId, x, y, entryId }) {
  const queue = readQueue();
  queue.push({ manualPinId, x, y, entryId, queuedAt: Date.now() });
  writeQueue(queue);
}

// Called by TripsMapScreen with its current auto-detected trips. Returns
// the resolved conversions (so the caller can update its manual pins and
// pin overrides) and rewrites the queue to drop anything resolved or expired.
export function resolvePendingPinConversions(autoTrips) {
  const queue = readQueue();
  if (queue.length === 0) return [];

  const resolved = [];
  const remaining = queue.filter(item => {
    if (Date.now() - item.queuedAt > MAX_AGE_MS) return false;
    const trip = autoTrips.find(t => t.entries.some(e => e.id === item.entryId));
    if (!trip) return true;
    resolved.push({ ...item, tripId: trip.id });
    return false;
  });

  if (resolved.length > 0 || remaining.length !== queue.length) writeQueue(remaining);
  return resolved;
}
