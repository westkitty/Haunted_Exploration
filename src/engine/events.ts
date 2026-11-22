import type { EventDef } from './types';

export const EVENTS: EventDef[] = [
  {
    id: 'extra_place_setting',
    title: 'The Extra Place Setting',
    category: 'bargain',
    illustrationMotif: 'dining',
    preferredGeometries: ['dining', 'foyer', 'ballroom'],
    narrative:
      'A long mahogany table holds exactly one more place setting than there are explorers in the house. As you pause, the empty high-backed chair scrapes backward two inches on its own.',
    characterReactions: {
      heir: 'Eleanor recognizes the family silver monogrammed with an extra initial she has never seen.',
      archivist: 'Clara notices the napkin is folded in the 1884 mourning crease.',
    },
    choices: [
      {
        id: 'sit',
        label: 'Sit in the pulled-out chair',
        detail: 'Nerve Check (Target 8) — Accept the house’s hospitality to hear what it remembers.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'Candlelight steadies around you. Beneath the porcelain plate you uncover an ancient clue, and the house marks you as courteous.',
        failureText:
          'Ice-cold hands brush your shoulders as the chair slides inward. Panic grips your chest.',
        effectsSuccess: {
          grantRandomClue: true,
          fearDelta: -1,
          setFlag: 'honored_dinner_seat',
          attentionDelta: 4,
          logNote: 'Accepted the extra place setting and earned the house’s reluctant courtesy.',
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 6,
          setFlag: 'rattled_at_table',
        },
      },
      {
        id: 'inspect',
        label: 'Inspect the silverware and setting',
        detail: 'Insight Check (Target 7) — Examine the warm spoon and calling card without sitting.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'Scratch marks under the saucer map a useful supply niche—you recover a helpful item.',
        failureText:
          'The tarnished silver reflects a room behind you that does not match this floor.',
        effectsSuccess: {
          grantRandomItem: true,
          logNote: 'Found a hidden item beneath the extra table setting.',
        },
        effectsFailure: {
          fearDelta: 1,
          attentionDelta: 3,
        },
      },
      {
        id: 'refuse',
        label: 'Push the chair shut and step away',
        detail: 'Safe refusal — Avoid direct risk, though the house remembers the slight.',
        successText:
          'You push the oak chair flush against the table. Somewhere upstairs, a door latches firmly in reply.',
        failureText: '',
        effectsSuccess: {
          setFlag: 'refused_house_hospitality',
          attentionDelta: 5,
          pressureDelta: 3,
          logNote: 'Refused the Extra Place Setting; the mansion remembers the snub.',
        },
      },
    ],
  },
  {
    id: 'voice_behind_wall',
    title: 'The Voice Behind the Wall',
    category: 'apparition',
    illustrationMotif: 'wall',
    preferredGeometries: ['passage', 'quarters', 'library', 'cellar'],
    narrative:
      'Muffled knocking taps three times from inside the walnut paneling. A familiar voice—sounding eerily like a companion—whispers for help behind the sealed plaster.',
    characterReactions: {
      medium: 'Ezekiel hears a double cadence—two throats breathing in unison behind the lath.',
      locksmith: 'Maren taps the wainscoting and hears a hollow brass hinge behind the trim.',
    },
    choices: [
      {
        id: 'pry_panel',
        label: 'Pry open the loose wainscoting',
        detail: 'Body Check (Target 8) — Force the timber seam to see what lies inside.',
        trait: 'body',
        difficulty: 8,
        successText:
          'The panel gives way to a dusty service niche containing a useful tool and a tucked architectural note.',
        failureText:
          'Splinters tear your palm and only cold drafts rush out—followed by dry whispering laughter.',
        effectsSuccess: {
          grantRandomItem: true,
          grantRandomClue: true,
          setFlag: 'opened_whispering_wall',
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
          spawnGhost: 'wall_choir',
        },
      },
      {
        id: 'listen_closely',
        label: 'Hold still and listen to the cadence',
        detail: 'Insight Check (Target 7) — Distinguish a real passage from a mimic.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'You catch the half-second echo of a Borrower mimic and note the trick in your journal.',
        failureText:
          'The voice repeats your own name in your exact timbre, chilling your spine.',
        effectsSuccess: {
          grantClueId: 'clue_mirror_rule',
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'borrower',
        },
      },
      {
        id: 'answer_promise',
        label: 'Promise to come back with a lamp',
        detail: 'No roll — Quiets the knocking for now, but the House records your vow.',
        successText:
          'The knocking stops instantly. A soft sigh drifts through the floorboards. You sense a promise now binds you.',
        failureText: '',
        effectsSuccess: {
          setFlag: 'promised_wall_voice',
          pressureDelta: 4,
          logNote: 'Made a promise to the Voice Behind the Wall.',
        },
      },
    ],
  },
  {
    id: 'portraits_correction',
    title: "The Portrait's Correction",
    category: 'portrait',
    illustrationMotif: 'portrait',
    preferredGeometries: ['gallery', 'foyer', 'bedroom', 'parlor'],
    narrative:
      'An oil painting of the staircase flickers in the candlelight—for three seconds, it depicts YOU standing beneath a falling beam in a room you have not yet entered.',
    choices: [
      {
        id: 'study_canvas',
        label: 'Study the freshly altered brushstrokes',
        detail: 'Insight Check (Target 8) — Read the warning hidden in the pigment.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'You memorize the faulty floorboard and brass ward depicted in the painting. (+1 Insight bonus next roll & Clue)',
        failureText:
          'The painted figure turns its head to stare straight at you before drying back to cracked oil.',
        effectsSuccess: {
          grantRandomClue: true,
          statBoost: { insight: 1 },
          setFlag: 'heeded_portrait_warning',
        },
        effectsFailure: {
          fearDelta: 2,
          setFlag: 'disturbed_portrait',
        },
      },
      {
        id: 'turn_canvas',
        label: 'Turn the portrait to face the wall',
        detail: 'Nerve Check (Target 7) — Refuse its gaze.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'You flip the heavy gilt frame. Taped to the wooden backing is a tucked key-card and calm returns.',
        failureText:
          'When you let go, the frame swings heavily back upright and its wire snaps across your knuckles.',
        effectsSuccess: {
          fearDelta: -1,
          grantRandomItem: true,
          setFlag: 'turned_portrait_wall',
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
          setFlag: 'disturbed_portrait',
          attentionDelta: 6,
        },
      },
    ],
  },
  {
    id: 'breathing_wallpaper',
    title: 'The Breathing Damask',
    category: 'architectural',
    illustrationMotif: 'wall',
    narrative:
      'The burgundy flock wallpaper swells outward half an inch, holds its breath, and exhales dusty air cool as a cellar.',
    choices: [
      {
        id: 'steady_breath',
        label: 'Match your breathing and trace the seam',
        detail: 'Nerve Check (Target 8) — Resist panic to inspect what moves behind it.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The wall settles quietly beneath your palm. A brass slip drops from behind the molding.',
        failureText:
          'The rhythm speeds up until your own pulse hammers in your ears.',
        effectsSuccess: {
          grantRandomClue: true,
          pressureDelta: -4,
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 5,
        },
      },
      {
        id: 'tear_strip',
        label: 'Tear back a strip of peeling damask',
        detail: 'Body Check (Target 7) — Expose the lath and plaster underneath.',
        trait: 'body',
        difficulty: 7,
        successText:
          'Chalk dates and a warning scrawled by an earlier guest appear on the plaster.',
        failureText:
          'Choking centuries-old dust floods your lungs and alerts the house.',
        effectsSuccess: {
          grantRandomClue: true,
          attentionDelta: 4,
        },
        effectsFailure: {
          healthDelta: -1,
          attentionDelta: 7,
        },
      },
    ],
  },
  {
    id: 'omen_threshold_discovery',
    title: 'An Artifact Left Waiting',
    category: 'omen_echo',
    illustrationMotif: 'bell',
    narrative:
      'On a velvet runner in the center of the floor rests an ominous keepsake that was definitely not here a moment ago—set neatly as though offered for inspection.',
    choices: [
      {
        id: 'claim_omen',
        label: 'Take the ominous artifact',
        detail: 'Claim an Omen (+trait bonus, advances Supernatural Pressure toward The Revelation).',
        successText:
          'The moment your fingers close around it, the air pressure drops across the mansion. You feel its weight in your coat pocket.',
        failureText: '',
        effectsSuccess: {
          grantOmen: true,
          attentionDelta: 6,
        },
      },
      {
        id: 'sketch_only',
        label: 'Sketch its markings without touching it',
        detail: 'Insight Check (Target 8) — Extract a clue while minimizing disturbance.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'You record its inscription cleanly without stirring the house’s darker pulse.',
        failureText:
          'The artifact rolls toward your boot on an unlevel board, touching your heel anyway.',
        effectsSuccess: {
          grantRandomClue: true,
          pressureDelta: 4,
        },
        effectsFailure: {
          grantOmen: true,
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'lantern_wisp_invitation',
    title: 'The Pale Lantern Wisp',
    category: 'apparition',
    illustrationMotif: 'candle',
    narrative:
      'A fist-sized globe of pale spectral cyan bobs near the ceiling molding, drifting gently toward a shadowy cabinet as if beckoning you.',
    choices: [
      {
        id: 'follow_wisp',
        label: 'Follow the pale light quietly',
        detail: 'Grace Check (Target 7) — Keep pace without startling the apparition.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'The wisp hovers above a loose board, illuminating a forgotten item before fading warmly.',
        failureText:
          'It leads you straight into a slick patch of cellar condensation—you twist an ankle.',
        effectsSuccess: {
          grantRandomItem: true,
          setFlag: 'befriended_lantern_wisp',
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
          spawnGhost: 'lantern_wisp',
        },
      },
      {
        id: 'observe_wisp',
        label: 'Stand still and watch its pattern',
        detail: 'Nerve Check (Target 6) — Let the spirit show its intent.',
        trait: 'nerve',
        difficulty: 6,
        successText:
          'The wisp circles three times and reveals a quiet truth about the estate.',
        failureText:
          'Its cold glare leaves cyan afterimages dancing across your vision.',
        effectsSuccess: {
          grantRandomClue: true,
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'music_box_knows_name',
    title: 'The Music Box That Knows Your Name',
    category: 'omen_echo',
    illustrationMotif: 'music',
    preferredGeometries: ['nursery', 'music', 'bedroom'],
    narrative:
      'A tiny brass cylinder begins turning inside a mahogany box. Between the tinny lullaby notes, faint rhythmic clicks spell out your own initials in telegraph code.',
    choices: [
      {
        id: 'let_play',
        label: 'Let the melody finish undisturbed',
        detail: 'Nerve Check (Target 8) — Listen for the hidden message.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The final chord rings sweetly. A hidden compartment pops open with an Omen and calms the room.',
        failureText:
          'The melody slows to a warped crawl that digs straight into your composure.',
        effectsSuccess: {
          grantOmen: true,
          fearDelta: -1,
          setFlag: 'rescued_music_spirit',
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'mourner',
        },
      },
      {
        id: 'shut_lid',
        label: 'Snap the lid closed immediately',
        detail: 'No roll — Silences the sound, though something upstairs knocks once in disapproval.',
        successText:
          'Silence slams down over the room. Your heartbeat slows, though the house grows more watchful.',
        failureText: '',
        effectsSuccess: {
          attentionDelta: 6,
          pressureDelta: 4,
        },
      },
    ],
  },
  {
    id: 'broken_promise_echo',
    title: 'The Debt Remembered',
    category: 'apparition',
    illustrationMotif: 'door',
    requiredFlag: 'promised_wall_voice',
    narrative:
      'Every brass doorknob in the room frosts white. The voice you promised earlier speaks right beside your ear: "You brought a lamp—but you never came back."',
    choices: [
      {
        id: 'apologize_honor',
        label: 'Set down a taper and honor the debt',
        detail: 'Nerve Check (Target 8) — Appease the house’s memory with honesty.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The frost melts instantly. A grateful whisper leaves a rare clue in your journal.',
        failureText:
          'The room plunges into bitter chill as the door slams shut behind you.',
        effectsSuccess: {
          grantRandomClue: true,
          pressureDelta: -6,
          setFlag: 'redeemed_wall_promise',
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 8,
          spawnGhost: 'mourner',
        },
      },
      {
        id: 'bolster_nerve',
        label: 'Deny the voice and push onward',
        detail: 'Body Check (Target 8) — Force open the frosted latch.',
        trait: 'body',
        difficulty: 8,
        successText:
          'You wrench the latch free with numb fingers and keep moving.',
        failureText:
          'Frostbite bites your palm and dread clings to your coat.',
        effectsSuccess: {
          attentionDelta: 5,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 2,
        },
      },
    ],
  },
  {
    id: 'disturbed_portrait_returns',
    title: 'The Returning Canvas',
    category: 'portrait',
    illustrationMotif: 'portrait',
    requiredFlag: 'disturbed_portrait',
    narrative:
      'Hanging squarely on this room’s wall is the exact portrait you disturbed earlier—though you are on another wing of the house entirely. Its brass frame is still crooked.',
    choices: [
      {
        id: 'straighten_frame',
        label: 'Straighten the frame respectfully',
        detail: 'Grace Check (Target 7) — Set the painting level.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'The painted figure’s expression softens marginally; a hidden slip falls from the frame.',
        failureText:
          'A sharp static jolt snaps across your fingertips.',
        effectsSuccess: {
          fearDelta: -1,
          grantRandomClue: true,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
        },
      },
      {
        id: 'ignore_canvas',
        label: 'Keep your eyes off it and search the floor',
        detail: 'Insight Check (Target 8) — Look for how it was moved.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'Drag marks reveal a hidden wainscot catch and a dropped supply item.',
        failureText:
          'You feel watched for the rest of the turn.',
        effectsSuccess: {
          grantRandomItem: true,
        },
        effectsFailure: {
          fearDelta: 1,
          attentionDelta: 4,
        },
      },
    ],
  },
  {
    id: 'clock_stops_together',
    title: 'Synchronized Silence',
    category: 'omen_echo',
    illustrationMotif: 'clock',
    preferredGeometries: ['clockwork', 'vestibule', 'observatory'],
    narrative:
      'Every ticking clock in earshot halts on the same beat. In the sudden vacuum of sound, a single brass pendulum swings once on its own.',
    choices: [
      {
        id: 'rewind_gear',
        label: 'Wind the nearest timepiece gently',
        detail: 'Grace Check (Target 8) — Restore normal cadence.',
        trait: 'grace',
        difficulty: 8,
        successText:
          'Warm ticking resumes across the corridor, holding back the supernatural tide (-6 Pressure).',
        failureText:
          'The spring snaps inside the casing; the room feels ten degrees colder.',
        effectsSuccess: {
          pressureDelta: -6,
          fearDelta: -1,
        },
        effectsFailure: {
          pressureDelta: 8,
          fearDelta: 1,
        },
      },
      {
        id: 'claim_chime_omen',
        label: 'Pocket the loose brass chime inside',
        detail: 'Take an Omen from the stopped mechanism.',
        successText:
          'The brass piece hums faintly in your palm as the house’s attention locks onto you.',
        failureText: '',
        effectsSuccess: {
          grantOmen: true,
          attentionDelta: 5,
        },
      },
    ],
  },
  {
    id: 'footsteps_overhead',
    title: 'Footsteps Matching Yours',
    category: 'apparition',
    illustrationMotif: 'door',
    narrative:
      'Directly above the plaster ceiling, heavy boots step in exact synchronization with yours—halting whenever you halt, taking half a step more when you freeze.',
    choices: [
      {
        id: 'tap_ceiling',
        label: 'Knock three times on the wall in reply',
        detail: 'Nerve Check (Target 7) — Test whether it answers with intelligence.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'Three gentle knocks answer back—then the footsteps walk away toward a room containing a clue.',
        failureText:
          'A dozen pairs of footsteps suddenly stamp in unison above your head.',
        effectsSuccess: {
          grantRandomClue: true,
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'watcher',
        },
      },
      {
        id: 'slip_quietly',
        label: 'Move silently across the carpet',
        detail: 'Grace Check (Target 7) — Break the rhythm.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'You break step cleanly and notice a dropped item tucked beside the baseboard.',
        failureText:
          'A floorboard shrieks beneath your heel; the footsteps stop directly overhead.',
        effectsSuccess: {
          grantRandomItem: true,
        },
        effectsFailure: {
          attentionDelta: 6,
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'unopened_letter',
    title: 'The Unopened Envelope',
    category: 'clue',
    illustrationMotif: 'book',
    narrative:
      'A cream vellum envelope sealed with crimson wax lies on the mantel. It is addressed to your character by full name—dated forty years before you were born.',
    choices: [
      {
        id: 'break_seal',
        label: 'Break the wax seal and read it',
        detail: 'Insight Check (Target 7) — Decipher the hurried handwriting.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'Inside is a lucid warning from a previous explorer—you gain a Clue and +1 AP this turn.',
        failureText:
          'The ink runs wet across your thumb, repeating "DO NOT TRUST THE DOORS."',
        effectsSuccess: {
          grantRandomClue: true,
          apDelta: 1,
        },
        effectsFailure: {
          fearDelta: 1,
          pressureDelta: 5,
        },
      },
      {
        id: 'keep_sealed',
        label: 'Tuck it unopened into your coat',
        detail: 'Nerve Check (Target 6) — Refuse to be rattled.',
        trait: 'nerve',
        difficulty: 6,
        successText:
          'Your composure holds steady (-1 Fear) and you carry its clue safely.',
        failureText:
          'The wax grows uncomfortably warm through your coat lining.',
        effectsSuccess: {
          fearDelta: -1,
          grantRandomClue: true,
        },
        effectsFailure: {
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'cold_hearth_embers',
    title: 'Embers Without Wood',
    category: 'bargain',
    illustrationMotif: 'candle',
    preferredGeometries: ['foyer', 'library', 'dining', 'bedroom'],
    narrative:
      'The stone hearth glows with steady amber coals, yet there is no timber or ash inside—only pale warmth radiating into the damp air.',
    choices: [
      {
        id: 'warm_hands',
        label: 'Warm your hands by the impossible fire',
        detail: 'Nerve Check (Target 7) — Draw comfort without letting it claim you.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'Deep warmth eases your bruised shoulders (+1 Health, -2 Fear).',
        failureText:
          'The amber light turns brief spectral cyan—leaving your knuckles numb.',
        effectsSuccess: {
          healthDelta: 1,
          fearDelta: -2,
        },
        effectsFailure: {
          fearDelta: 1,
          pressureDelta: 6,
        },
      },
      {
        id: 'stir_grate',
        label: 'Poke the grate for hidden objects',
        detail: 'Body Check (Target 7) — Hook out what glints beneath the coals.',
        trait: 'body',
        difficulty: 7,
        successText:
          'You rake out an unmelted brass artifact—an Omen from the estate’s past.',
        failureText:
          'A burst of soot blinds you momentarily and scrapes your arm.',
        effectsSuccess: {
          grantOmen: true,
        },
        effectsFailure: {
          healthDelta: -1,
          attentionDelta: 4,
        },
      },
    ],
  },
  {
    id: 'mirror_blink_first',
    title: 'The Mirror That Blinks First',
    category: 'apparition',
    illustrationMotif: 'mirror',
    preferredGeometries: ['mirror', 'bedroom', 'ballroom'],
    narrative:
      'Passing a tall pier glass, you see your reflection blink—while your own eyes remain wide open. It lifts one finger to its lips.',
    choices: [
      {
        id: 'hold_gaze',
        label: 'Hold its gaze without flinching',
        detail: 'Nerve Check (Target 8) — Outlast the reflection.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The reflection yields and tilts its head toward a hidden drawer holding a silver item.',
        failureText:
          'For an instant, you feel unsure which side of the glass you are standing on.',
        effectsSuccess: {
          grantRandomItem: true,
          grantClueId: 'clue_mirror_tell',
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'borrower',
        },
      },
      {
        id: 'drape_cloth',
        label: 'Throw a dust-sheet over the glass',
        detail: 'Grace Check (Target 7) — Cover it swiftly.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'The linen settles smoothly and pressure ebbs slightly.',
        failureText:
          'The sheet slips off onto the floorboards as the mirror fogs from within.',
        effectsSuccess: {
          pressureDelta: -4,
        },
        effectsFailure: {
          fearDelta: 1,
          attentionDelta: 4,
        },
      },
    ],
  },
  {
    id: 'shifting_bookshelf',
    title: 'The Rearranging Shelf',
    category: 'clue',
    illustrationMotif: 'book',
    preferredGeometries: ['library', 'archive', 'clockwork'],
    narrative:
      'Three leather spines slide halfway out of a high shelf, spelling an acrostic across their gilt titles: W-A-T-C-H.',
    choices: [
      {
        id: 'pull_volumes',
        label: 'Pull the three volumes carefully',
        detail: 'Insight Check (Target 7) — Check the tucked margins.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'Pressed between pages are estate notes and a practical supply item.',
        failureText:
          'A heavy encyclopedia topples from the top ledge, bruising your shoulder.',
        effectsSuccess: {
          grantRandomClue: true,
          grantRandomItem: true,
        },
        effectsFailure: {
          healthDelta: -1,
          attentionDelta: 4,
        },
      },
      {
        id: 'leave_shelf',
        label: 'Note the word and back away',
        detail: 'Safe observation — Record the clue without disturbing the stack.',
        successText:
          'You jot down the acrostic and keep your composure.',
        failureText: '',
        effectsSuccess: {
          grantRandomClue: true,
        },
      },
    ],
  },
  {
    id: 'threshold_bargain',
    title: 'The Whispered Bargain',
    category: 'bargain',
    illustrationMotif: 'door',
    narrative:
      'A dry, cultured voice drifts from the doorway lintel: "Give me a drop of your certainty, and I will show you what waits behind the cellar stone."',
    choices: [
      {
        id: 'accept_bargain',
        label: 'Accept the house’s exchange',
        detail: 'Gain an Omen and a Clue, at the cost of +1 Fear and +8 House Attention.',
        successText:
          'Knowledge blooms sharply behind your eyes as the door frame creaks in satisfaction.',
        failureText: '',
        effectsSuccess: {
          grantOmen: true,
          grantRandomClue: true,
          fearDelta: 1,
          attentionDelta: 8,
          setFlag: 'bargained_with_house',
        },
      },
      {
        id: 'refuse_firmly',
        label: 'Refuse and step clear of the lintel',
        detail: 'Nerve Check (Target 7) — Keep your will intact.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'The voice recedes with polite amusement. Your nerve feels stronger (-1 Fear).',
        failureText:
          'A sudden slam rattles the transom glass, fraying your composure.',
        effectsSuccess: {
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 1,
          pressureDelta: 5,
        },
      },
    ],
  },
  {
    id: 'settling_beams',
    title: 'Groaning Joists',
    category: 'hazard',
    illustrationMotif: 'wall',
    preferredGeometries: ['cellar', 'boiler', 'flooded', 'passage'],
    narrative:
      'A deep timber groan ripples overhead as mortar dust sifts down from the ceiling beams like dry snow.',
    choices: [
      {
        id: 'dash_clear',
        label: 'Dart beneath the stone doorframe',
        detail: 'Grace Check (Target 8) — Evade falling plaster cleanly.',
        trait: 'grace',
        difficulty: 8,
        successText:
          'You roll clear just as a loose brick strikes the floor—revealing a brass cache inside the wall.',
        failureText:
          'Falling plaster clips your shoulder and bruises your ribs.',
        effectsSuccess: {
          grantRandomItem: true,
        },
        effectsFailure: {
          healthDelta: -2,
        },
      },
      {
        id: 'brace_beam',
        label: 'Shoulder the sagging timber steady',
        detail: 'Body Check (Target 8) — Hold the frame until the tremor passes.',
        trait: 'body',
        difficulty: 8,
        successText:
          'The joist settles back into its seat. You catch your breath unharmed (+1 Body confidence).',
        failureText:
          'The weight wrenches your back painfully.',
        effectsSuccess: {
          fearDelta: -1,
          pressureDelta: -3,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'weeping_curtain',
    title: 'The Moving Drapery',
    category: 'apparition',
    illustrationMotif: 'candle',
    preferredGeometries: ['conservatory', 'parlor', 'chapel', 'bedroom'],
    narrative:
      'Velvet curtains billow inward though the tall mullioned window is nailed shut. Beneath the hem, the outline of two narrow boots appears—then vanishes.',
    choices: [
      {
        id: 'speak_softly',
        label: 'Speak gently to whoever waits there',
        detail: 'Nerve Check (Target 7) — Offer peace instead of confrontation.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'The curtain stills. A mourning spirit leaves a small protective token on the sill.',
        failureText:
          'A mournful sigh sweeps across the candles, dimming the room.',
        effectsSuccess: {
          grantRandomItem: true,
          fearDelta: -1,
          setFlag: 'comforted_curtain_spirit',
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'mourner',
        },
      },
      {
        id: 'pull_curtain',
        label: 'Yank the velvet drapery aside',
        detail: 'Body Check (Target 7) — Expose the alcove immediately.',
        trait: 'body',
        difficulty: 7,
        successText:
          'Only frost on the pane—tracing out a legible architectural clue.',
        failureText:
          'The curtain rod drops across your wrist and a cold draft raises Pressure.',
        effectsSuccess: {
          grantRandomClue: true,
        },
        effectsFailure: {
          healthDelta: -1,
          pressureDelta: 6,
        },
      },
    ],
  },
  {
    id: 'abandoned_satchel',
    title: 'A Previous Explorer’s Satchel',
    category: 'clue',
    illustrationMotif: 'book',
    narrative:
      'Tucked under an overturned settee sits a cracked leather surveyor’s bag stamped 1921. Inside lie neatly bundled tools and a half-finished floor sketch.',
    choices: [
      {
        id: 'take_supplies',
        label: 'Salvage the intact supplies',
        detail: 'No roll — Recover a helpful Item and field notes.',
        successText:
          'You pack the finest tool from the satchel and copy its marginalia into your journal.',
        failureText: '',
        effectsSuccess: {
          grantRandomItem: true,
          grantRandomClue: true,
        },
      },
      {
        id: 'check_lining',
        label: 'Check the stitched false bottom',
        detail: 'Insight Check (Target 8) — Search for whatever the surveyor hid.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'Hidden beneath the canvas lining is an Omen wrapped in waxed cloth—plus a healing tonic.',
        failureText:
          'Only dry pressed moth wings and an unsettling journal page describing your own entry.',
        effectsSuccess: {
          grantOmen: true,
          grantItemId: 'laudanum_vial',
        },
        effectsFailure: {
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'phantom_bell_pull',
    title: 'The Trembling Bell-Pull',
    category: 'architectural',
    illustrationMotif: 'bell',
    narrative:
      'A braided crimson bell-pull sways taut, as if someone in the next floor up is summoning assistance urgently.',
    choices: [
      {
        id: 'tug_back',
        label: 'Pull the tassel firmly in answer',
        detail: 'Nerve Check (Target 7) — Answer the house’s call.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'A brass chime rings cleanly in the walls; a hidden dumbwaiter hatch opens with an item inside.',
        failureText:
          'The rope comes free in your hands, dropping twenty feet of cold chain that alarms the house.',
        effectsSuccess: {
          grantRandomItem: true,
        },
        effectsFailure: {
          attentionDelta: 8,
          pressureDelta: 6,
          fearDelta: 1,
        },
      },
      {
        id: 'trace_wire',
        label: 'Trace the brass conduit wire along the wall',
        detail: 'Insight Check (Target 7) — Follow where the signal travels.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'The wire reveals a disguised hinge seam—giving you a helpful clue.',
        failureText:
          'The conduit vanishes into solid mortar where no room should exist.',
        effectsSuccess: {
          grantRandomClue: true,
        },
        effectsFailure: {
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'spectral_tea_service',
    title: 'Steam From Cold Porcelain',
    category: 'bargain',
    illustrationMotif: 'dining',
    narrative:
      'A silver tea tray rests on a side table. Fresh wisps of bergamot steam curl from a bone-china cup—yet the teapot is dry as chalk.',
    choices: [
      {
        id: 'sip_tea',
        label: 'Take a cautious sip',
        detail: 'Nerve Check (Target 7) — Trust the warmth.',
        trait: 'nerve',
        difficulty: 7,
        successText:
          'Steady warmth floods your chest (+2 Health, -1 Fear).',
        failureText:
          'It tastes of river silt and cold copper—your stomach knots.',
        effectsSuccess: {
          healthDelta: 2,
          fearDelta: -1,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
        },
      },
      {
        id: 'read_leaves',
        label: 'Inspect the dry leaves at the bottom',
        detail: 'Insight Check (Target 7) — Look for etched marks inside the cup.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'Beneath the leaves is a tiny painted number and map symbol.',
        failureText:
          'The porcelain cracks cleanly in half with a sharp ring.',
        effectsSuccess: {
          grantRandomClue: true,
        },
        effectsFailure: {
          attentionDelta: 5,
        },
      },
    ],
  },
  {
    id: 'wall_choir_hymn',
    title: 'The Wall Choir',
    category: 'apparition',
    illustrationMotif: 'music',
    minPressure: 18,
    narrative:
      'Shadows lengthen along the wainscoting and begin humming a low three-part harmony. The timber vibrates beneath your boots like a cello body.',
    choices: [
      {
        id: 'hum_counter',
        label: 'Hum a steady counter-note',
        detail: 'Nerve Check (Target 8) — Harmonize rather than panic.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The shadows soften into warm amber; you gain a Clue and lower Pressure.',
        failureText:
          'The resonance rises until your teeth ache and dread overwhelms you.',
        effectsSuccess: {
          grantRandomClue: true,
          pressureDelta: -6,
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'wall_choir',
        },
      },
      {
        id: 'cover_ears',
        label: 'Press through to the far side quickly',
        detail: 'Grace Check (Target 7) — Keep moving before the chord peaks.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'You cross cleanly before the shadows gather.',
        failureText:
          'You stumble against a wainscoting rail and bruise your knee.',
        effectsSuccess: {
          apDelta: 0,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
        },
      },
    ],
  },
  {
    id: 'gaslight_surge',
    title: 'The Blue Gaslight Flare',
    category: 'hazard',
    illustrationMotif: 'candle',
    preferredGeometries: ['boiler', 'laboratory', 'foyer', 'cellar'],
    narrative:
      'Brass wall sconces hiss suddenly and flare tall with pale blue-white flame, casting stark shadows across every corner.',
    choices: [
      {
        id: 'shut_valve',
        label: 'Turn the brass wall cock off swiftly',
        detail: 'Grace Check (Target 7) — Clamp the line before the globe shatters.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'You tame the surge cleanly and recover a spare brass tool from the sconce shelf.',
        failureText:
          'Hot glass pops overhead, stinging your hand.',
        effectsSuccess: {
          grantRandomItem: true,
        },
        effectsFailure: {
          healthDelta: -1,
          attentionDelta: 4,
        },
      },
      {
        id: 'read_shadows',
        label: 'Read what the harsh blue glare reveals',
        detail: 'Insight Check (Target 8) — Spot ink invisible in warm light.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'Pale chalk markings leap out across the wallpaper—revealing a crucial Clue!',
        failureText:
          'The glare blinds you momentarily; when sight clears, an apparition lingers.',
        effectsSuccess: {
          grantRandomClue: true,
        },
        effectsFailure: {
          fearDelta: 1,
          spawnGhost: 'watcher',
        },
      },
    ],
  },
  {
    id: 'keyhole_draft',
    title: 'The Singing Keyhole',
    category: 'architectural',
    illustrationMotif: 'door',
    narrative:
      'Wind whistles through a brass keyhole in a steady two-note motif. Peering closer, you glimpse bright amber candlelight inside a room that is not on your map.',
    choices: [
      {
        id: 'peer_through',
        label: 'Put your eye to the brass keyhole',
        detail: 'Insight Check (Target 8) — Observe the impossible room beyond.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'You memorize an interior landmark and gain an Omen echo that sharpens your wits.',
        failureText:
          'An eye blinks back from the other side of the brass keyhole.',
        effectsSuccess: {
          grantRandomClue: true,
          statBoost: { insight: 1 },
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 6,
        },
      },
      {
        id: 'plug_keyhole',
        label: 'Plug the keyhole with folded paper',
        detail: 'Safe caution — Stop the eerie draft.',
        successText:
          'The whistling stops immediately and a quiet calm settles over you.',
        failureText: '',
        effectsSuccess: {
          fearDelta: -1,
        },
      },
    ],
  },
  {
    id: 'cursed_curiosity_shelf',
    title: 'The Locked Curio Box',
    category: 'omen_echo',
    illustrationMotif: 'bell',
    narrative:
      'A velvet-lined mahogany case sits unlocked on a pedestal, humming softly with trapped resonance.',
    choices: [
      {
        id: 'open_curio',
        label: 'Lift the lid and claim what rests inside',
        detail: 'Claim a potent Omen (advances Revelation chance) + recover an Item.',
        successText:
          'You claim both the ominous keepsake and a practical brass instrument beneath it.',
        failureText: '',
        effectsSuccess: {
          grantOmen: true,
          grantRandomItem: true,
          attentionDelta: 6,
        },
      },
      {
        id: 'leave_closed',
        label: 'Leave the lid shut and move on',
        detail: 'Avoid raising Supernatural Pressure.',
        successText:
          'You leave the humming box undisturbed; the house stays briefly quiet.',
        failureText: '',
        effectsSuccess: {
          pressureDelta: -3,
        },
      },
    ],
  },
  {
    id: 'watcher_in_corner',
    title: 'The Peripheral Figure',
    category: 'apparition',
    illustrationMotif: 'candle',
    narrative:
      'Out of the corner of your eye, a tall cloaked silhouette stands motionless beside the bookcase. Whenever you turn squarely toward it, only coat-rack shadows remain.',
    choices: [
      {
        id: 'observe_indirectly',
        label: 'Watch it softly in a brass reflection',
        detail: 'Insight Check (Target 8) — Study The Watcher without breaking its stillness.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'Reflected in brass, The Watcher bows slightly and points toward a concealed clue.',
        failureText:
          'When you blink, it is two paces closer than before.',
        effectsSuccess: {
          grantRandomClue: true,
          setFlag: 'observed_watcher_calmly',
        },
        effectsFailure: {
          fearDelta: 2,
          spawnGhost: 'watcher',
        },
      },
      {
        id: 'confront_corner',
        label: 'Stride directly into the corner with lantern raised',
        detail: 'Nerve Check (Target 8) — Dispel the apparition boldly.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'The shadows scatter cleanly, leaving behind a dropped brass item.',
        failureText:
          'The lantern light dims around the silhouette and cold dread washes over you.',
        effectsSuccess: {
          grantRandomItem: true,
          fearDelta: -1,
        },
        effectsFailure: {
          fearDelta: 2,
          attentionDelta: 5,
        },
      },
    ],
  },
  {
    id: 'stair_count_mismatch',
    title: 'The Thirteenth Step',
    category: 'architectural',
    illustrationMotif: 'door',
    preferredGeometries: ['staircase', 'foyer', 'vestibule'],
    narrative:
      'Counting the wooden treads beneath your boots, you realize there is one extra step that was not there five minutes ago—and its riser is slightly ajar.',
    choices: [
      {
        id: 'reach_inside_riser',
        label: 'Reach carefully into the open riser',
        detail: 'Grace Check (Target 7) — Retrieve what glints inside before it shuts.',
        trait: 'grace',
        difficulty: 7,
        successText:
          'Your fingers close around a tucked item and a folded diagram before the board snaps flush.',
        failureText:
          'The hardwood riser pinches your wrist painfully as it clicks back into place.',
        effectsSuccess: {
          grantRandomItem: true,
          grantRandomClue: true,
        },
        effectsFailure: {
          healthDelta: -1,
          fearDelta: 1,
        },
      },
      {
        id: 'step_over',
        label: 'Step cleanly over the extra tread',
        detail: 'Safe caution — Keep your footing.',
        successText:
          'You step clear; when you look back, the staircase holds its ordinary count once more.',
        failureText: '',
        effectsSuccess: {
          fearDelta: -1,
        },
      },
    ],
  },
  {
    id: 'warm_handprint_glass',
    title: 'Breath on the Windowpane',
    category: 'apparition',
    illustrationMotif: 'mirror',
    preferredGeometries: ['conservatory', 'observatory', 'chapel', 'ballroom'],
    narrative:
      'Frost feathers across the tall pane—except where five clear finger-marks melt freshly from the OUTSIDE of a second-story window.',
    choices: [
      {
        id: 'press_palm',
        label: 'Press your palm gently to the glass',
        detail: 'Nerve Check (Target 8) — Acknowledge the spirit outside.',
        trait: 'nerve',
        difficulty: 8,
        successText:
          'Warmth answers through the cold pane; symbols trace in condensation revealing an estate clue.',
        failureText:
          'A sharp crack splits the glass from corner to corner.',
        effectsSuccess: {
          grantRandomClue: true,
          pressureDelta: -4,
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 6,
        },
      },
      {
        id: 'draw_curtains',
        label: 'Draw the heavy shutters tight',
        detail: 'Body Check (Target 6) — Latch the iron bar.',
        trait: 'body',
        difficulty: 6,
        successText:
          'The oak shutters bolt cleanly, steadying the room’s light.',
        failureText:
          'The rusted hinge screams, echoing through the hall.',
        effectsSuccess: {
          fearDelta: -1,
        },
        effectsFailure: {
          attentionDelta: 5,
        },
      },
    ],
  },
  {
    id: 'forgotten_medicine_cabinet',
    title: 'The Apothecary Alcove',
    category: 'clue',
    illustrationMotif: 'book',
    preferredGeometries: ['quarters', 'laboratory', 'bedroom', 'parlor'],
    narrative:
      'Behind a loose wainscot mirror lies a neat walnut medicine cabinet stocked with stoppered phials and crisp linen wraps.',
    choices: [
      {
        id: 'mix_restorative',
        label: 'Examine labels and prepare a restorative',
        detail: 'Insight Check (Target 7) — Pick the safe tonic.',
        trait: 'insight',
        difficulty: 7,
        successText:
          'You prepare a clean tincture (+2 Health, -1 Fear) and pocket spare bandages.',
        failureText:
          'Bitter fumes sting your eyes, leaving you coughing.',
        effectsSuccess: {
          healthDelta: 2,
          fearDelta: -1,
          grantItemId: 'bandages_kit',
        },
        effectsFailure: {
          healthDelta: -1,
        },
      },
      {
        id: 'grab_salts',
        label: 'Take the sealed smelling salts only',
        detail: 'No roll — Safe and immediate.',
        successText:
          'You pocket a fresh phial of Amber Smelling Salts.',
        failureText: '',
        effectsSuccess: {
          grantItemId: 'smelling_salts',
        },
      },
    ],
  },
  {
    id: 'impossible_corridor_glimpse',
    title: 'A Door That Opens Too Far',
    category: 'architectural',
    illustrationMotif: 'door',
    isRare: true,
    narrative:
      'Opening a narrow linen closet reveals not shelves, but a moonlit colonnade stretching fifty yards into fog—far beyond the outer walls of the mansion.',
    choices: [
      {
        id: 'step_in_briefly',
        label: 'Step three paces inside to retrieve a glinting relic',
        detail: 'Nerve Check (Target 9) — Keep your bearings in impossible space.',
        trait: 'nerve',
        difficulty: 9,
        successText:
          'You step back out holding an Omen and +1 permanent Nerve from staring down the impossible.',
        failureText:
          'The doorway shrinks behind you for one terrifying breath before spitting you back out shaken.',
        effectsSuccess: {
          grantOmen: true,
          statBoost: { nerve: 1 },
          setFlag: 'walked_impossible_closet',
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 8,
        },
      },
      {
        id: 'close_closet',
        label: 'Close the closet gently and sketch its depth',
        detail: 'Safe — Gain a Clue about the mansion’s folded geometry.',
        successText:
          'When you reopen it a heartbeat later, only folded lavender sheets remain.',
        failureText: '',
        effectsSuccess: {
          grantClueId: 'clue_impossible_geometry',
        },
      },
    ],
  },
  {
    id: 'rescued_spirit_intervenes',
    title: 'A Grateful Echo',
    category: 'apparition',
    illustrationMotif: 'music',
    requiredFlag: 'rescued_music_spirit',
    narrative:
      'A faint, sweet music-box phrase drifts around your shoulders. The spirit you treated kindly earlier steadies your lantern and nudges a brass drawer open.',
    choices: [
      {
        id: 'thank_spirit',
        label: 'Accept the spirit’s assistance',
        detail: 'The house remembers kindness too: -2 Fear, +1 Health, +1 Item & -6 Pressure.',
        successText:
          'A gentle breeze brushes your cuff. You recover strength, an item, and precious time.',
        failureText: '',
        effectsSuccess: {
          healthDelta: 1,
          fearDelta: -2,
          pressureDelta: -6,
          grantRandomItem: true,
          logNote: 'A spirit you previously respected intervened to aid your expedition.',
        },
      },
    ],
  },
  {
    id: 'subterranean_heartbeat',
    title: 'The Pulse Beneath the Floor',
    category: 'omen_echo',
    illustrationMotif: 'bell',
    preferredGeometries: ['cellar', 'boiler', 'flooded', 'vault'],
    narrative:
      'Dust jumps in tiny concentric circles across the flagstones. Twice a minute, something vast beneath the foundation beats once.',
    choices: [
      {
        id: 'measure_pulse',
        label: 'Press an ear to the stone and time the pulse',
        detail: 'Insight Check (Target 8) — Learn how the Heart Beneath breathes.',
        trait: 'insight',
        difficulty: 8,
        successText:
          'You map the rhythm precisely and uncover a vital Heart Beneath clue—plus an Omen stone.',
        failureText:
          'Your own heart locks briefly into the slower subterranean beat, leaving you dizzy.',
        effectsSuccess: {
          grantClueId: 'clue_heart_bargain',
          grantOmen: true,
        },
        effectsFailure: {
          fearDelta: 2,
          pressureDelta: 7,
        },
      },
      {
        id: 'step_lightly',
        label: 'Move quietly away from the center flagstone',
        detail: 'Grace Check (Target 6) — Avoid waking it further.',
        trait: 'grace',
        difficulty: 6,
        successText:
          'You tread lightly along the masonry edge without disturbing the house.',
        failureText:
          'A boot heel strikes stone loudly; the next beat comes noticeably stronger.',
        effectsSuccess: {
          pressureDelta: -2,
        },
        effectsFailure: {
          pressureDelta: 6,
          attentionDelta: 5,
        },
      },
    ],
  },
];

export function getEventById(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
