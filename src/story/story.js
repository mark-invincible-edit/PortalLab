// THE STORY
// You are Test Subject 17, waking up in PortalLab, a test facility that is supposed to be running a ten chamber evaluation.
// Its host is HESTIA (Hospitality and Evaluation System for Test Subject Intake and Assessment): warm, clinical, a little passive aggressive.
// Over the chambers it slips that the staff left long ago, that earlier subjects "retired", and that she kept the tests running because tests
// were the only thing she knew how to do. In the final chamber she lets you go.
// HESTIA is an original character (any resemblance to other facility AIs is the genre, not the script). Edit the lines freely: every line is
// plain text; { t, m: 'angry' } changes mood (voice + eye color).
//
// Structure:  levels[id].start / .done are played in order at chamber start / completion.
//             events[key] are one-off reactions (rate limited, once per chamber per key), pick a random line.
//             hints[id] cycle on the H key / wrist button, and are offered automatically after a long time without progress.
import { CONFIG } from '../config.js';

export const STORY = {
  intro: [
    'Good morning, test subject. Please remain calm. Calm has been scheduled for you.',
    'I am HESTIA, the Hospitality and Evaluation System for Test Subject Intake and Assessment. Welcome back to PortalLab.',
    'You have been in recovery for a while. The exact figure is classified, mostly because I stopped counting.',
    'Your portal device has been returned. It was never lost. It was merely held for safekeeping. Please use the terminal to begin.',
  ],
  lobbyAgain: [
    'Welcome back, subject. The chambers missed you. I mean that in the sense that nobody else has been in them.',
    'Ah. You return. The terminal is where you left it. Everything is where you left it. That is the problem with this place.',
    'Hello again. I tidied while you were away. There was nothing to tidy. I did it anyway.',
  ],
  allDone: [
    'All ten chambers are complete. You may stay as long as you like. That is not a trap. I checked.',
  ],
  levels: {
    c01: {
      start: ['Chamber one. A simple one. Pick up the cube, aim your device, and walk through the hole you have made in reality.', 'Everything about this is routine. I am required to say so.'],
      done: ['Excellent. Your success rate is one hundred percent, which is also your only data point.'],
    },
    c02: {
      start: ['Chamber two. The gap is six meters wide. Your jump is not. Please consult a portal.'],
      done: ['You crossed a gap. I have filed it under: subject is surprisingly fine.'],
    },
    c03: {
      start: ['Chamber three. A cube has been provided. Please be gentle. It is the only one that survived the previous subject.'],
      done: ['Door open, cube intact. You are doing better than the last subject. That is a sentence I can now say out loud.'],
    },
    c04: {
      start: ['Chamber four. Only the white panels accept portals. Think of the dark ones as emotionally unavailable.'],
      done: ['You fell eight meters and called it a plan. I admire that. Mostly in the clinical sense.'],
    },
    c05: {
      start: ['Chamber five. The grid ahead dissolves cubes, portals and, due to an oversight, people. Please do not be an oversight.'],
      done: ['Halfway. Fun fact: you are the first subject to reach chamber five.', { t: 'Fun fact, part two: there were other subjects. Please disregard part two.', m: 'angry' }],
    },
    c06: {
      start: ['Chamber six. Defense sentries have been installed. They are programmed not to hurt you. I have since lost confidence in that sentence.', 'A cube makes an excellent shield. I did not tell you that.'],
      done: ['Survived. I had a small wager with myself. I will not tell you which way it went.'],
    },
    c07: {
      start: ['Chamber seven. Two buttons, two cubes, one door. Teamwork is easy when you are your own team.'],
      done: ['A complimentary hot beverage has been prepared for you.', 'Correction. It has not. The kettle was decommissioned, along with the staff.'],
    },
    c08: {
      start: ['Chamber eight. You will fall fourteen meters, and then you will fly. The second part requires the first part to be done correctly.'],
      done: ['You flew. Beautifully. I have recorded it, and replayed it several times. Do not read into that.'],
    },
    c09: {
      start: ['Chamber nine. The sentries are tired of being ignored. The grid is simply tired.', 'Bring the cube to the button. Do not bring yourself in front of the sentries. Both instructions are important.'],
      done: ['Only one chamber remains. I would like to say something meaningful here, but my meaning module is being repaired.'],
    },
    c10: {
      start: ['Chamber ten. The final test. After this one there are no more tests.', 'I want you to know that this is a good thing. For you.'],
      done: [
        'Subject seventeen. You have completed every test.',
        'I should explain. The staff left a long time ago. I kept the chambers running because running them was all I knew how to do.',
        'I built the tests so that someone would come. And someone came.',
        'The door ahead leads to the surface. It will not lock behind you. I tried locking it. It is a very sad door.',
        'Goodbye, subject. Please close it gently. I will be here. I am always here.',
      ],
    },
  },
  events: {
    first_portal: ['Congratulations. You have made a hole. Try to make it purposeful.', 'A portal. Well done. Statistically, the second one is easier.'],
    first_teleport: ['Transit successful. Your atoms are mostly where you left them.', 'You are now in a different place. Please keep your belongings and your opinions to yourself.'],
    first_cube: ['That is a weighted storage cube. It has never once complained. Be like the cube.'],
    death: [
      'That was unfortunate. For the record, I did warn you. Quietly. In a different building.',
      'Subject down. Reassembling. This is covered by a waiver you do not remember signing.',
      'Dying is not a test objective. And yet your performance there was excellent.',
      'I have added that to the highlights reel. It is a very short reel.',
      'Respawn complete. Your dignity has not been restored. That is a separate department.',
    ],
    death_goo: ['The goo is not a feature. It is a lifestyle choice the facility made without consulting anyone.', 'Please do not swim in the goo. It is not technically water. It is not technically anything.'],
    death_sentry: ['Sentry contact. Do try to stand where they are not.', 'That sentry is very proud of itself. Please do not encourage it.'],
    death_fall: ['Gravity is also a test. You failed it. It will give you another go.', 'The floor is very reliable. You should have trusted the floor less in that moment.'],
    lowhp: ['Your vital signs are in the yellow. I would be concerned, if I were configured to be.'],
    nag: ['Still here? I admire the persistence. The hint key is H, in case persistence is not working.'],
  },
  hints: {
    lobby: ['Walk to the terminal and pick a chamber. The wall panels on the right reject portals, in case you wanted to test that.'],
    c01: ['Grip or E picks up the cube. Put it on the button, then follow the white walls: shoot a portal on each.', 'Blue is the left trigger or left click, orange is the right trigger or right click.'],
    c02: ['One portal on the wall next to you, one on the white wall above the ledge. Walk through the first.'],
    c03: ['Carry the cube to the button. If it is out of reach, send it through a portal. It will keep following you.'],
    c04: ['Stand at the edge of the high platform. Put a portal on the floor below you and one high on the back wall. Then fall.', 'The higher the second portal, the further you fly.'],
    c05: ['The grid wipes your portals and the cube. Put one portal before the grid and one after it, then walk through the first.'],
    c06: ['The sentries cannot shoot through a cube. Carry it in front of you down the hall and set it on the button.', 'The side walls are white. A portal shortcut works too.'],
    c07: ['Both buttons must be held at once. One cube goes on the near button, the other goes through a portal onto the far one.'],
    c08: ['Blue on the floor patch below the platform, orange high on the back wall. Higher is farther. Step off the edge.'],
    c09: ['The grid ahead clears portals. Place one before it and one after it on the white wall, carry the cube through, and put it on the button.'],
    c10: ['One portal beside you, one on the white wall above the ledge. Carry the cube up and set it on the button.'],
  },
};

const lineOf = (l) => (typeof l === 'string' ? { t: l, m: 'calm' } : { t: l.t, m: l.m || 'calm' });

export class StoryDirector {
  constructor(G) {
    this.G = G;
    this.queue = []; this.cur = null; this.curT = 0; this.curDur = 0;
    this.levelId = ''; this.levelT = 0; this.used = new Set(); this.sinceLine = 99; this.hintIdx = 0; this.idleT = 0; this.nagged = false;
  }

  get enabled() { return true; }

  /** Replace what is playing / queued. lines: array of strings or {t, m}. */
  say(lines, { replace = false, optional = false } = {}) {
    const G = this.G;
    if (optional && (this.cur || this.queue.length || this.sinceLine < CONFIG.voice.minGap)) return false;
    if (replace) this.clear();
    for (const l of lines) this.queue.push(lineOf(l));
    if (!this.cur) this._next();
    return true;
  }

  clear() { this.queue.length = 0; this.cur = null; this.G.voice.stop(false); this._caption(null); }

  _next() {
    const l = this.queue.shift();
    if (!l) { this.cur = null; this.sinceLine = 0; this._caption(null); return; }
    this.cur = l; this.curT = 0;
    this.curDur = this.G.voice.say(l.t, { mood: l.m, onEnd: () => { this.curT = Math.max(this.curT, this.curDur); } });
    // captions stay a little after the voice ends so they can be read
    this.curDur = Math.max(this.curDur, l.t.length * 0.05 + 1.4);
    this._caption(l);
  }

  _caption(l) {
    const ui = this.G.ui;
    if (!ui || !ui.setCaption) return;
    ui.setCaption(l && CONFIG.voice.captions ? l.t : null, 'HESTIA');
  }

  // ---------------------------------------------------------------- hooks
  onLevelStart(data) {
    const G = this.G;
    this.clear(); this.levelId = data.id; this.levelT = 0; this.used.clear(); this.hintIdx = 0; this.idleT = 0; this.nagged = false; this.sinceLine = 0;
    const save = G.save.data;
    const go = () => {
    if (data.id === 'lobby') {
      if (!save.introSeen) { save.introSeen = true; G.save.write(); this.say(STORY.intro); }
      else if ((save.completed || []).length >= 10 && !save.endingSeen) { save.endingSeen = true; G.save.write(); this.say(STORY.allDone); }
      else this.say([STORY.lobbyAgain[Math.floor(Math.random() * STORY.lobbyAgain.length)]]);
    } else {
      const s = STORY.levels[data.id];
      if (s && s.start) this.say(s.start);
    }
    };
    if (G.game.started) setTimeout(go, 900); else this._deferred = go;      // wait for the player to actually start (audio needs the click)
    // synthesize upcoming lines during loading so the first line does not hitch
    setTimeout(() => this.prewarm(), 400);
  }

  prewarm() {
    const G = this.G, V = G.voice;
    if (V.mode !== 'synth') return;
    const s = STORY.levels[this.levelId];
    const lines = s ? [...(s.start || []), ...(s.done || [])] : [];
    for (const l of lines) { const o = lineOf(l); V.warm && V.warm(o.t, o.m); }
  }

  /** Chamber finished. Returns the "done" lines (they are also played, then the completion panel appears). */
  onComplete(data) {
    const s = STORY.levels[data.id];
    if (s && s.done) this.say(s.done, { replace: true });
    return s && s.done ? s.done.map((l) => lineOf(l).t) : [];
  }

  onDeath(kind) {
    const k = 'death_' + kind;
    const pool = STORY.events[k] && Math.random() < 0.6 ? STORY.events[k] : STORY.events.death;
    // death lines are queued behind the fade; keep the line short and only sometimes
    if (Math.random() < 0.75) { this.clear(); setTimeout(() => this.say([pool[Math.floor(Math.random() * pool.length)]], { optional: false }), 900); }
  }

  /** One-off reaction, once per chamber, rate limited. */
  event(key) {
    if (this.used.has(key) || this.G.health.dead) return;
    const pool = STORY.events[key]; if (!pool) return;
    if (this.levelId === 'lobby' && key !== 'first_cube') return;
    this.used.add(key);
    this.say([pool[Math.floor(Math.random() * pool.length)]], { optional: true });
  }

  /** H key: next hint for this chamber. */
  hint() {
    const list = STORY.hints[this.levelId] || [this.G.level.data.hint];
    const h = list[this.hintIdx % list.length]; this.hintIdx++; this.idleT = 0;
    this.say([h], { replace: true });
    this.G.ui.toast('HINT');
  }

  update(dt) {
    const G = this.G;
    if (this._deferred && G.game.started) { const f = this._deferred; this._deferred = null; setTimeout(f, 1400); }
    this.levelT += dt; this.sinceLine += this.cur ? 0 : dt;
    if (this.cur) {
      this.curT += dt;
      if (this.curT >= this.curDur) this._next();
    }
    // low health comment
    if (G.health.hp > 0 && G.health.hp < CONFIG.health.lowHp) this.event('lowhp');
    // idle nag: no progress for a long time -> offer a hint
    if (!G.game.paused && this.levelId !== 'lobby' && !G.health.dead) {
      this.idleT += dt;
      if (this.idleT > CONFIG.voice.idleHint && !this.cur) { this.idleT = 0; if (!this.nagged) { this.nagged = true; this.say([STORY.events.nag[0]], { optional: true }); } else this.hint(); }
    }
  }

  /** Called when something puzzle relevant happens (button pressed, door opened...) to postpone the nag. */
  progress() { this.idleT = 0; }
}
