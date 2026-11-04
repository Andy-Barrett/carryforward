// Coordinates come only from the assigned work orders. No geocoding, device
// location or map provider is used; these distances are not road travel times.
export function dayAt(timeZone, now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function coordinate(value) {
  return value && value.ambiguous !== true &&
    typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
    ? { latitude: value.latitude, longitude: value.longitude } : null;
}

export function distanceKm(a, b) {
  a = coordinate(a); b = coordinate(b);
  if (!a || !b) return null;
  const radians = Math.PI / 180;
  const h = Math.sin((b.latitude-a.latitude)*radians/2)**2 +
    Math.cos(a.latitude*radians)*Math.cos(b.latitude*radians)*Math.sin((b.longitude-a.longitude)*radians/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

function commonShop(jobs) {
  const first = coordinate(jobs[0]?.locations?.shop);
  return first && jobs.every(j => {
    const shop = coordinate(j.locations?.shop);
    return shop && shop.latitude === first.latitude && shop.longitude === first.longitude;
  }) ? first : null;
}

export function dayLegs(jobs) {
  let previous = commonShop(jobs);
  return jobs.map(job => {
    const next = coordinate(job.locations?.site), km = distanceKm(previous, next);
    previous = next;
    return { jobId: job.id, km };
  });
}

export function suggestNearbyOrder(jobs) {
  if (jobs.length < 2) return { available: false, reason: 'Choose at least two work orders.' };
  if (jobs.some(j => !coordinate(j.locations?.site)))
    return { available: false, reason: 'Some stops have no verified coordinates. You can still put them in order yourself.' };
  let previous = commonShop(jobs);
  const remaining = [...jobs], ordered = [];
  const start = previous ? 'assigned shop' : 'your first stop';
  if (!previous) { ordered.push(remaining.shift()); previous = ordered[0].locations.site; }
  while (remaining.length) {
    // Stable ties preserve the technician's order. This is a nearby-stop
    // heuristic, not an optimal route or a claim about appointment feasibility.
    let best = 0;
    for (let i=1; i<remaining.length; i++)
      if (distanceKm(previous,remaining[i].locations.site) < distanceKm(previous,remaining[best].locations.site)-1e-9) best=i;
    const [next] = remaining.splice(best,1);
    ordered.push(next); previous=next.locations.site;
  }
  return { available: true, jobIds: ordered.map(j => j.id), start };
}
