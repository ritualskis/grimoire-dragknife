export function formatDistance(val: number, unit: "mm" | "in" | string = "mm"): string {
  const isInch = unit.toLowerCase().includes("in") || unit.toLowerCase().includes("g20");
  if (isInch) {
    return `${val.toFixed(3)} in`;
  }
  return `${val.toFixed(2)} mm`;
}

export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDegrees(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

export function formatNumber(val: number, decimals = 2): string {
  return val.toFixed(decimals);
}
