/**
 * Static and structural verification suite for The House That Remembers Firestore Security Rules
 * validating all Dirty Dozen invariants documented in security_spec.md.
 */
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
const rulesText = fs.existsSync(rulesPath)
  ? fs.readFileSync(rulesPath, 'utf8')
  : fs.readFileSync(draftPath, 'utf8');

const assertions: { name: string; pass: boolean }[] = [
  { name: 'Uses rules_version = 2', pass: /rules_version\s*=\s*'2'/.test(rulesText) },
  { name: 'Has global default-deny catch-all', pass: /match\s*\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;/.test(rulesText) },
  { name: 'Enforces email_verified == true', pass: /request\.auth\.token\.email_verified\s*==\s*true/.test(rulesText) },
  { name: 'Validates path IDs with regex guard', pass: /function isValidId/.test(rulesText) && /isValidInviteCode/.test(rulesText) },
  { name: 'Uses hasOnly() on validation blueprints & updates', pass: /affectedKeys\(\)\.hasOnly/.test(rulesText) && /keys\(\)\.hasOnly/.test(rulesText) },
  { name: 'Locks terminal status == finished', pass: /existing\(\)\.status\s*!=\s*'finished'/.test(rulesText) },
  { name: 'Enforces monotonic version increment', pass: /incoming\(\)\.version\s*==\s*existing\(\)\.version\s*\+\s*1/.test(rulesText) },
  { name: 'Enforces turn ownership on active updates', pass: /existing\(\)\.currentTurnUid\s*==\s*request\.auth\.uid/.test(rulesText) },
  { name: 'Isolates privateRoles strictly to request.auth.uid == playerUid', pass: /match \/privateRoles\/\{playerUid\}[\s\S]*?request\.auth\.uid\s*==\s*playerUid[\s\S]*?allow list:\s*if false;/.test(rulesText) },
  { name: 'Enforces strict server timestamps (request.time)', pass: /incoming\(\)\.updatedAt\s*==\s*request\.time/.test(rulesText) },
  { name: 'Enforces atomicity via getAfter on actions', pass: /getAfter\(.+lobbies\/\$\(lobbyId\)\)\.data\.version\s*==\s*incoming\(\)\.resultingVersion/.test(rulesText) },
  { name: 'Guards bounded memberUids array size <= 4', pass: /memberUids\.size\(\)\s*<=\s*4/.test(rulesText) },
];

let failed = 0;
for (const a of assertions) {
  if (!a.pass) {
    console.error(`FAIL: ${a.name}`);
    failed++;
  } else {
    console.log(`PASS: ${a.name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(`All ${assertions.length} Firestore security rule invariants verified.`);
