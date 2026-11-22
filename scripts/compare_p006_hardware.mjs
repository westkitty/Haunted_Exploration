import assert from 'node:assert/strict';
import fs from 'node:fs';

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error('Usage: bun scripts/compare_p006_hardware.mjs baseline.json candidate.json');
  process.exit(2);
}
const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
function hardware(record, label) {
  assert.equal(record.captureStatus, 'hardware-baseline-captured', label + ': capture status insufficient');
  assert.equal(record.workloadSignature?.mode, 'hardware-webgl', label + ': scene not hardware WebGL');
  assert.equal(record.workloadSignature?.benchmarkMode, 'hardware', label + ': test used software flags');
  assert.ok(record.workloadSignature?.gpuEvidence?.renderer, label + ': GPU evidence absent');
  assert.equal(record.phases?.length, 5, label + ': expected five benchmark phases');
  assert.ok(record.phases.every(x => x.adequateSamples && x.frameIntervals.count >= 60), label + ': insufficient samples');
}
hardware(base, 'baseline');
hardware(candidate, 'candidate');
const identityFields = [
  'project','scenarioId','scenarioVersion','browser','userAgent','platform','viewport',
  'devicePixelRatio','mode','postprocessing','canvas','quality','device',
  'realDevice','osPlatform','osRelease','osArchitecture','cpuModel','cpus',
  'network','phaseDurationMs','seed','gpuEvidence',
];
const b = base.workloadSignature, c = candidate.workloadSignature;
const conflicts = identityFields.filter(k => JSON.stringify(b[k]) !== JSON.stringify(c[k]));
if (conflicts.length) {
  console.error('INCOMPARABLE — different workload or device:', conflicts.join(', '));
  process.exit(2);
}
const num = v => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'n/a';
const change = (from,to) => from > 0 ? 100 * (to-from) / from : null;
console.log('MATCHED GPU:', b.gpuEvidence.renderer);
console.log('BASELINE SHA:',base.buildSha,'CANDIDATE SHA:',candidate.buildSha);
console.log('Phase | baseline p50 ms | candidate p50 ms | p95 change % | p99 change % | draw-call change');
for(let i=0;i<5;i++){
  const p=base.phases[i], q=candidate.phases[i];
  assert.equal(p.label,q.label,'Scenario phase labels changed');
  console.log([p.label,num(p.frameIntervals.p50Ms),num(q.frameIntervals.p50Ms),
    num(change(p.frameIntervals.p95Ms,q.frameIntervals.p95Ms)),
    num(change(p.frameIntervals.p99Ms,q.frameIntervals.p99Ms)),
    q.renderer.calls-p.renderer.calls].join(' | '));
}
console.log('Baseline resource delta:',JSON.stringify(base.recovered.second));
console.log('Candidate resource delta:',JSON.stringify(candidate.recovered.second));
const regressions=['geometries','textures','programs'].filter(k=>{
  const x=base.recovered.second[k],y=candidate.recovered.second[k];
  return typeof x==='number' && typeof y==='number' && y>x;
});
if(regressions.length) console.log('WATCH: more retained renderer resources:',regressions.join(', '));
console.log('COMPARABLE — not an automatic optimization or release PASS.');
console.log('Repeat on identical hardware where possible; manually compare screenshots and require green game CI.');
