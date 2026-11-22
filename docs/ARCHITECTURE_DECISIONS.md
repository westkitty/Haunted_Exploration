# ADR-001: Third-generation Haunted Exploration consolidation

Decision date: 2026-11-22. Status: accepted for implementation; narrative canon not resolved.

## Intent
Create a third haunted mansion game on westkitty/Haunted_Exploration without changing or merging the histories of the two existing prototypes.

## Technical authority
- **Sole source of gameplay truth:** src/engine/types.ts GameState, actionResolver.ts resolveGameAction, mansionGenerator.ts, rooms.ts, scenarios.ts, events.ts, ghosts.ts, itemsAndOmens.ts.
- **Single renderer and frame loop owner:** src/three/MansionSceneManager.ts; roomBuilder.ts and textures.ts provide owned scene resources and lifecycle.
- **UI owner:** src/App.tsx and src/components/*.tsx, not a transplanted src/Stage.tsx or Haunted main.tsx.
- **Audio owner:** src/audio/AudioDirector.ts.
- **Solo persistence:** src/engine/saveManager.ts with versioned SaveFileV1; imports must be validated and staged before user confirmation.
- **Multiplayer:** server.ts and src/multiplayer/* preserved as experimental code only. P005/P007 require authenticated server authority and proper private-role isolation before public use. Disable bundled inherited Firebase project config.

## Decision table
| Reference | Decision | Rationale |
| --- | --- | --- |
| Agy engine, scene, UI, audio and catalogs | KEEP / PRIMARY | More complete rules and scenario architecture; one state/renderer owner |
| Haunted save validation and import-confirm safeguards | ADAPT | Stronger validation and cancel semantics, different schemas |
| Haunted focused seed, nested-graph and storage-denial test cases | ADAPT | Fill validation gaps without copying old engine |
| Haunted shortcut / touch and accessibility patterns | EVALUATE / SELECTIVE | Add only gaps not already present in Agy |
| Haunted character roster (Ada, Mara, Elias, Iona, Silas, Theo) | DEFER | Conflicts with Agy roster and IDs; requires narrative decision |
| Haunted WebP portrait assets | DEFER | Character identity and image provenance decision required |
| Haunted full Stage.tsx, game.ts, style.css and localStorage saves | REJECT wholesale transfer | Duplicate authority, incompatible schemas and styles |
| Agy cloud Firestore/WS multiplayer for public service | DEFER / UNSAFE | Authenticated action service not proven; private role and state authority concerns |

## Presentation and performance
Keep authoritative game state separate from Three.js object transforms; preserve the existing scene manager lifecycle. Measure before changing render architecture. Reduced motion, captions, keyboard/touch accessibility and safe recovery are protected.

## Canon
Keep Agy's six character IDs temporarily for technical continuity, not as a definitive creative retcon. Do not silently rename characters or combine family histories. No Haunted save import unless a separate converter with fixtures is approved.

## Baseline and rollback
Base target repo initialized at 070f059b3a05610a68ea6dcdc98143d030005957. Implement only on integration/agy-haunted-p001-p003, verify its head before each mutation, and preserve standalone source repos.
