import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
const [prefix, sha, ...launches] = process.argv.slice(2);
assert.match(prefix, /^[\w-]+$/); assert.match(sha, /^[a-f0-9]{40}$/); assert.ok(launches.length);
for (const launch of launches) {
  assert.match(launch, /^[\w-]+$/);
  const label = `${prefix}-${launch}`, path = `output/playwright/performance/${label}`;
  const log = await open(`${path}.log`, 'wx');
  console.log(JSON.stringify({ label, sha, startedAt: new Date().toISOString() }));
  const child = spawn(process.execPath, ['scripts/performance/measure-min614.mjs', '--electron', '--navigation-journeys'], { env: { ...process.env, MINDDY_PERF_LABEL: label, MINDDY_PERF_BUILD_SHA: sha }, stdio: ['ignore', log.fd, log.fd] });
  const code = await new Promise((resolve) => child.once('exit', resolve)); await log.close();
  const report = JSON.parse(await readFile(`${path}-navigation.json`, 'utf8'));
  assert.ok(report.cleanup, 'Stop until restoration is verified');
  assert.equal(code, 0, `Preserve and diagnose failed launch ${label}`);
  console.log(JSON.stringify({ label, samples: report.samples.length, cleanup: report.cleanup }));
}
