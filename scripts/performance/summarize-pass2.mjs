import { readFile } from "node:fs/promises";
const quantile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const point = (sorted.length - 1) * fraction;
  const low = Math.floor(point);
  return sorted[low] + (sorted[Math.ceil(point)] - sorted[low]) * (point - low);
};
for (const path of process.argv.slice(2)) {
  const result = JSON.parse(await readFile(path, "utf8"));
  if (result.nodes && result.samples) {
    const nodes = new Map(result.nodes.map((node) => [node.id, node]));
    const self = new Map();
    result.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + result.timeDeltas[index] / 1000));
    console.log(JSON.stringify({path, cpu: [...self].sort((a,b) => b[1]-a[1]).slice(0,20).map(([id, ms]) => ({ ms: Math.round(ms), ...nodes.get(id).callFrame }))},null,2));
    continue;
  }
  const groups = new Map();
  for (const row of result.measurements) {
    if (row.usefulMs === undefined) continue;
    const name = row.name.replace(/-\d+$/, "");
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  console.log(JSON.stringify({ path, buildId: result.buildId, failures:result.failures, identity: result.identity, memory:result.memory, summary: [...groups].map(([name, rows]) => ({ name, count: rows.length, medianMs: quantile(rows.map((r) => r.usefulMs), 0.5), p25Ms:quantile(rows.map((r) => r.usefulMs),0.25), p75Ms:quantile(rows.map((r) => r.usefulMs),0.75), minMs:Math.min(...rows.map((r) => r.usefulMs)), maxMs:Math.max(...rows.map((r) => r.usefulMs)), scriptMs:quantile(rows.map((r) => r.scriptMs),0.5), styleMs:quantile(rows.map((r) => r.styleMs),0.5), layoutMs:quantile(rows.map((r) => r.layoutMs),0.5), longTaskMs: quantile(rows.map((r) => r.immediateLongTaskMs+r.deferredLongTaskMs),0.5) })) },null,2));
}
