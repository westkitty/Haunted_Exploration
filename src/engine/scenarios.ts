import type { GameState, ScenarioId } from './types';

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  subtitle: string;
  description: string;
  alteredRuleText: string;
  publicObjective: string;
  chosenPrivateObjective?: string;
  mimicPrivateObjective?: string;
  soloObjective: string;
  goalCount: number;
  countdownTurns: number;
  hasBetrayerInMultiplayer: boolean;
  endingExplorersWin: { title: string; epilogue: string };
  endingHouseWins: { title: string; epilogue: string };
  endingChosenWins?: { title: string; epilogue: string };
  endingPact?: { title: string; epilogue: string };
}

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  the_house_has_chosen: {
    id: 'the_house_has_chosen',
    title: 'The House Has Chosen',
    subtitle: 'One of you already holds the estate’s brass key.',
    description:
      'A distant bronze bell tolls across the rafters. Three Supernatural Anchors awaken in discovered chambers. In multiplayer, one explorer secretly becomes the House’s Chosen Representative—gaining power to shift doorways and stoke dread.',
    alteredRuleText:
      'Altered Rule: Every unopened doorway now raises Supernatural Pressure by +4, and the Chosen Representative can lock or shift corridors once per turn.',
    publicObjective:
      'Locate and disable all 3 Supernatural Anchors (marked in brass-crimson on the Dollhouse map) before the House seals permanently.',
    chosenPrivateObjective:
      'SECRET ROLE — THE CHOSEN: Prevent the explorers from disabling 3 Anchors before the Countdown reaches 0, or overwhelm them with Dread. Use Shift Doorway & Stoke Dread covertly.',
    soloObjective:
      'The House’s Shadow Emissary stalks the halls and shifts doorways each turn. Locate and disable all 3 Supernatural Anchors before the Countdown expires.',
    goalCount: 3,
    countdownTurns: 12,
    hasBetrayerInMultiplayer: true,
    endingExplorersWin: {
      title: 'The Anchors Severed',
      epilogue:
        'As the third brass anchor fractures in pale sparks, the bolted oak doors of the Grand Entrance Hall swing smoothly inward. Dawn fog spills over the marble—and the house finally loosens its grip on your names.',
    },
    endingHouseWins: {
      title: 'The House Kept Its Guests',
      epilogue:
        'The final bell dies away across the upper landing. Downstairs, the brass guest ledger turns to a fresh leaf where your names dry in permanent ink. Outside, the estate looks quietly uninhabited once more.',
    },
    endingChosenWins: {
      title: 'The New Custodian',
      epilogue:
        'The chosen explorer steps calmly into the Grand Entrance Hall as the other doors seal shut behind them. Candlelight warms the walnut paneling; the house has found its next caretaker.',
    },
  },
  the_last_midnight: {
    id: 'the_last_midnight',
    title: 'The Last Midnight',
    subtitle: 'Every clock in the mansion is marching toward the Thirteenth Hour.',
    description:
      'The night accelerates outside the mullioned windows. Three Clock Mechanisms throughout the discovered rooms have begun chiming backward toward XIII. Synchronize them before the final toll.',
    alteredRuleText:
      'Altered Rule: Ending a turn in a darkened room without a Light item (Lantern or Tapers) inflicts +1 Fear as the Thirteenth Hour closes in.',
    publicObjective:
      'Find and synchronize all 3 Clock Mechanisms (Insight or Grace check, eased by Clues or the Clockmaker’s Key) before the 13th Bell tolls.',
    soloObjective:
      'Find and synchronize all 3 Clock Mechanisms across the mansion before the Countdown strikes the 13th Hour. Keep a light source close.',
    goalCount: 3,
    countdownTurns: 11,
    hasBetrayerInMultiplayer: false,
    endingExplorersWin: {
      title: 'Morning Reclaimed',
      epilogue:
        'With the third brass gear locked onto XII, the Pendulum Vestibule shudders and releases a single clear chime. Silver daylight breaks over the conservatory glass, and the front bolt draws open.',
    },
    endingHouseWins: {
      title: 'The Thirteenth Hour',
      epilogue:
        'Thirteen slow iron strokes ring out through the timber frame. The hands on every timepiece vanish beneath frosted glass, freezing this night—and everyone within it—forever.',
    },
  },
  the_mirror_jury: {
    id: 'the_mirror_jury',
    title: 'The Mirror Jury',
    subtitle: 'Reflections have begun moving half a heartbeat too soon.',
    description:
      'Glass panes across the house silver over with frost. Spectral Borrowers walk the hallways wearing explorers’ silhouettes. Gather 3 verifiable Reflection Proofs to enact the Containment Rite—or expose a Mimic.',
    alteredRuleText:
      'Altered Rule: False accusations cost 2 Fear & 1 AP (never instant elimination). Gathering 3 Reflection Proofs guarantees a clean Containment Rite.',
    publicObjective:
      'Collect 3 Reflection Proofs from shimmering mirror-marked rooms, then perform the Containment Rite (or unmask the Mimic with evidence).',
    mimicPrivateObjective:
      'SECRET ROLE — THE REFLECTION MIMIC: Undermine evidence gathering and stall until the Jury’s Countdown expires, or drive the explorers into overwhelming Fear.',
    soloObjective:
      'A Mirror Double wearing your face haunts the halls. Gather 3 Reflection Proofs across the mansion and perform the Containment Rite before the Countdown reaches zero.',
    goalCount: 3,
    countdownTurns: 12,
    hasBetrayerInMultiplayer: true,
    endingExplorersWin: {
      title: 'The Glass Cleared',
      epilogue:
        'A crystalline tremor runs through every mirror in the mansion. The spectral doubles collapse into harmless dust motes, and your reflections once more move in faithful unison as the front doors unlatch.',
    },
    endingHouseWins: {
      title: 'Replaced Behind the Silver',
      epilogue:
        'One by one, the mirrors grow warm while the hallway turns bitterly cold. Someone wearing your coat steps cheerfully out the front door into the dawn—while you knock silently from inside the glass.',
    },
    endingChosenWins: {
      title: 'The Jury’s Verdict',
      epilogue:
        'The Mirror Double claims the threshold unchallenged. The mansion locks its gilded frames behind the remaining guests, adding new portraits to the upper gallery.',
    },
  },
  the_heart_beneath: {
    id: 'the_heart_beneath',
    title: 'The Heart Beneath the House',
    subtitle: 'Something ancient and warm has woken beneath the cellar stones.',
    description:
      'A deep rhythmic thump shakes dust from the rafters. The Sealed Heart Chamber opens in the Basement! Reach the Heart and choose its fate: Destroy it with force, Seal a Pact with an Omen, or Quiet its Memory peacefully (requires 3+ Clues).',
    alteredRuleText:
      'Altered Rule: At the end of each round, the House subtly shifts one non-critical corridor lock. Reaching the Basement Heart unlocks three distinct endings.',
    publicObjective:
      'Descend to the Basement Heart Chamber and resolve the Heart: Destroy it (Body check), Bargain with it (requires an Omen), or Quiet the Memory (requires 3+ Clues).',
    soloObjective:
      'Reach the awakened Heart Chamber in the Basement before the Countdown expires. Choose to Destroy it, Bargain with an Omen, or Quiet its Memory with 3+ Clues.',
    goalCount: 1,
    countdownTurns: 13,
    hasBetrayerInMultiplayer: false,
    endingExplorersWin: {
      title: 'The Heart Shattered',
      epilogue:
        'Iron strikes calcified brass and the subterranean pulse dies in a long, sighing tremor. Plaster cascades harmlessly as the mansion’s supernatural geometry relaxes—releasing you into the cool night air.',
    },
    endingPact: {
      title: 'The Quiet Covenant',
      epilogue:
        'Whether through an honored bargain or by naming the memory the Architect tried to keep alive, the Heart slows to a peaceful hush. The front doors unbolt reverently—and the house will remember you kindly.',
    },
    endingHouseWins: {
      title: 'Absorbed Into the Foundation',
      epilogue:
        'The slow beat rises until every corridor pulses like a living ribcage. New rooms bloom around you faster than any map can record, folding the expedition permanently into the house’s foundation.',
    },
  },
};

export function selectScenarioForState(state: GameState): ScenarioId {
  const scores: Record<ScenarioId, number> = {
    the_house_has_chosen: 1,
    the_last_midnight: 1,
    the_mirror_jury: 1,
    the_heart_beneath: 1,
  };

  // Bias by found omens & rooms discovered
  for (const roomId of state.roomOrder) {
    const r = state.rooms[roomId];
    if (r.templateId === 'clockwork_study' || r.templateId === 'attic_observatory') {
      scores.the_last_midnight += 2;
    }
    if (r.templateId === 'mirror_chamber' || r.templateId === 'portrait_gallery') {
      scores.the_mirror_jury += 2;
    }
    if (r.floor === -1 || r.templateId === 'boiler_room' || r.templateId === 'flooded_basement') {
      scores.the_heart_beneath += 2;
    }
    if (r.templateId === 'abandoned_dining_room' || r.templateId === 'candlelit_library') {
      scores.the_house_has_chosen += 2;
    }
  }

  // Omen affinity weights
  for (const omenId of state.omensFound) {
    if (omenId.includes('watch') || omenId.includes('weeping') || omenId.includes('bell')) {
      scores.the_last_midnight += 4;
    } else if (omenId.includes('glass') || omenId.includes('phonograph') || omenId.includes('ring')) {
      scores.the_mirror_jury += 4;
    } else if (omenId.includes('stethoscope') || omenId.includes('chalice') || omenId.includes('floor_four')) {
      scores.the_heart_beneath += 4;
    } else {
      scores.the_house_has_chosen += 4;
    }
  }

  // In multiplayer, slightly favor betrayal-capable scenarios if attention is high
  if (state.players.length >= 2 && state.attention.level >= 35) {
    scores.the_house_has_chosen += 2;
    scores.the_mirror_jury += 2;
  }

  const ordered = (Object.keys(scores) as ScenarioId[]).sort((a, b) => scores[b] - scores[a]);
  // Deterministic tie-breaker using rngState
  const topScore = scores[ordered[0]];
  const tied = ordered.filter((id) => scores[id] === topScore);
  return tied[Math.abs(state.rngState) % tied.length];
}
