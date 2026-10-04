import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile, open } from 'node:fs/promises';
const output = 'output/playwright/performance';
const args = process.argv.slice(2);
const phase3c = args.includes('--phase3c');
const [prefix, sha, ...labels] = args.filter((arg) => arg !== '--phase3c');
assert.match(prefix, /^[\w-]+$/); assert.match(sha, /^[a-f0-9]{40}$/); assert.ok(labels.length);
for (const label of labels) {
  assert.match(label, /^[\w-]+$/);
  for (const file of (await readdir(output)).filter((file) => /^pass3[bc]-/.test(file) && file.endsWith('-checks.json'))) {
    const state = JSON.parse(await readFile(`${output}/${file}`, 'utf8'));
    assert.ok(state.cleanup || !state.ownedComments?.length, `Unrestored fixture in ${file}; stop before another launch`);
  }
  const name = `${prefix}-${label}`;
  const log = await open(`${output}/${name}.log`, 'wx');
  console.log(JSON.stringify({ launch: name, sha, at: new Date().toISOString() }));
  const child = spawn(process.execPath, ['scripts/performance/measure-min614.mjs', '--electron', '--mutation-journeys', ...(phase3c ? ['--phase3c'] : [])], {
    env: { ...process.env, MINDDY_PERF_LABEL: name, MINDDY_PERF_BUILD_SHA: sha }, stdio: ['ignore', log.fd, log.fd],
  });
  const code = await new Promise((resolve) => child.once('exit', resolve)); await log.close();
  const checks = JSON.parse(await readFile(`${output}/${name}-checks.json`, 'utf8'));
  assert.ok(checks.cleanup, `Cleanup failed in ${name}; stop before another launch`);
  assert.equal(code, 0, `Runner failed in ${name}; preserve it and diagnose before resuming`);
}
