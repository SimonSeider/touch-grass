export function timeOfDay(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60
    + date.getSeconds() / 3600 + date.getMilliseconds() / 3_600_000;
  const angle = (hour - 6) / 24 * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle) * 0.8;
  const z = Math.sin(angle) * 0.6;
  return { hour, x, y, z };
}

export function nightAmount(sunY: number) {
  const t = Math.max(0, Math.min(1, (sunY + 0.22) / 0.24));
  return 1 - t * t * (3 - 2 * t);
}
