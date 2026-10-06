/* Escape the Audio Maze - game logic, perception and announcements.
   Design rule: nothing essential is visual, and nothing essential is
   audio-only. Every sound has a short text equivalent. */

(function () {
  'use strict';

  var M = window.MazeGen;
  var A = window.MazeAudio;
  var DIRS = M.DIRS, DIR_NAMES = M.DIR_NAMES, REL = M.REL_WORDS;

  /* ------------------------------------------------------------------ */
  /* configuration                                                       */
  /* ------------------------------------------------------------------ */

  var DIFFICULTY = {
    explorer: {
      label: 'Explorer',
      size: 9, time: 300, lives: 5, keys: 1, doors: 1, traps: 2, bonuses: 3,
      decoys: 2, braid: 0, verbosity: 2, secret: true, stalker: false,
      stalkerSpeed: 0, beaconRange: 7, decoyRange: 5, surpriseChance: 0.05
    },
    adventurer: {
      label: 'Adventurer',
      size: 13, time: 240, lives: 3, keys: 2, doors: 2, traps: 5, bonuses: 4,
      decoys: 3, braid: 0.06, verbosity: 1, secret: true, stalker: true,
      stalkerSpeed: 2600, beaconRange: 6, decoyRange: 5, surpriseChance: 0.04
    },
    master: {
      label: 'Audio Master',
      size: 17, time: 180, lives: 3, keys: 2, doors: 3, traps: 8, bonuses: 5,
      decoys: 4, braid: 0.14, verbosity: 0, secret: true, stalker: true,
      stalkerSpeed: 1700, beaconRange: 5, decoyRange: 5, surpriseChance: 0.03
    }
  };

  // How loud each sound type is at point-blank range.
  var TYPE_VOLUME = {
    water: 0.50, wind: 0.50, machine: 0.45, drip: 0.60, chime: 0.50,
    jingle: 0.50, rattle: 0.45, hiss: 0.38, aura: 0.42, hum: 0.40,
    footsteps: 0.65
  };

  var LANDMARK_WORD = {
    water: 'Water', wind: 'Wind', machine: 'Machinery', drip: 'Dripping',
    chime: 'Chimes', jingle: 'Key', rattle: 'Door', hiss: 'Hiss',
    aura: 'Open air', hum: 'Switch'
  };

  var SHAPES = ['', 'dead end', 'corridor', 'junction', 'crossroads'];

  var SURPRISES = [
    { fx: 'duck', text: 'A duck quacks. Not a clue.' },
    { fx: 'boing', text: 'A distant boing. Not a clue.' },
    { fx: 'sneeze', text: 'Something sneezes. Not a clue.' }
  ];

  /* ------------------------------------------------------------------ */
  /* elements                                                            */
  /* ------------------------------------------------------------------ */

  var el = {};
  ['menu', 'game', 'app', 'app-headline', 'setup', 'start-btn', 'how-btn',
   'how-dialog', 'how-close', 'over-dialog', 'over-h', 'over-body', 'over-stats',
   'again-btn', 'next-btn', 'menu-btn', 'live-polite', 'live-assertive', 'log',
   's-time', 's-score', 's-lives', 's-keys', 's-facing', 's-level', 'records', 'test-btn', 'test-result',
   'volume', 'volume-out', 'rate', 'rate-out', 'showmap', 'map', 'map-panel'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* ------------------------------------------------------------------ */
  /* announcements                                                       */
  /* ------------------------------------------------------------------ */

  var settings = {
    narration: 'live',   // live | speech | both | off
    rate: 1.6,
    volume: 0.75,
    showMap: false
  };

  var liveToggle = false;

  function announce(text, urgent) {
    if (!text) return;
    log(text);
    if (settings.narration === 'live' || settings.narration === 'both') {
      var node = urgent ? el['live-assertive'] : el['live-polite'];
      // Alternate a trailing space so repeated text is still announced.
      liveToggle = !liveToggle;
      node.textContent = text + (liveToggle ? ' ' : '');
    }
    if (settings.narration === 'speech' || settings.narration === 'both') {
      speak(text);
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = settings.rate;
    window.speechSynthesis.speak(u);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function log(text) {
    var li = document.createElement('li');
    li.textContent = text;
    el.log.insertBefore(li, el.log.firstChild);
    while (el.log.children.length > 60) el.log.removeChild(el.log.lastChild);
  }

  /* ------------------------------------------------------------------ */
  /* game state                                                          */
  /* ------------------------------------------------------------------ */

  var G = null;       // active run
  var loopId = null;

  function newRun(difficultyName, level, carriedScore) {
    var base = DIFFICULTY[difficultyName];
    var cfg = {};
    for (var k in base) cfg[k] = base[k];

    // Increasing difficulty across levels within a run.
    var step = level - 1;
    cfg.size = Math.min(25, cfg.size + step * 2);
    if (cfg.size % 2 === 0) cfg.size += 1;
    cfg.time = Math.max(70, cfg.time - step * 20);
    cfg.traps += step;
    cfg.decoys += step;
    cfg.bonuses += step;
    if (step > 0 && !cfg.stalker) cfg.stalker = true;
    if (!cfg.stalkerSpeed) cfg.stalkerSpeed = 3000;
    cfg.stalkerSpeed = Math.max(900, cfg.stalkerSpeed - step * 250);

    var seed = (Math.random() * 1e9) | 0;
    var maze = M.build(cfg, seed);

    G = {
      difficulty: difficultyName,
      cfg: cfg,
      maze: maze,
      level: level,
      x: maze.start.x,
      y: maze.start.y,
      facing: maze.start.facing,
      keys: 0,
      keysNeeded: cfg.keys,
      lives: cfg.lives,
      score: carriedScore || 0,
      timeLeft: cfg.time,
      elapsed: 0,
      powered: maze.doors.length === 0,
      paused: false,
      over: false,
      lastClue: maze.beacon.clue,
      warned: {},
      emitterIds: [],
      stalkerClock: 0
    };

    indexEmitters();
    return G;
  }

  // Give every sound-producing feature a stable emitter id.
  function indexEmitters() {
    A.clearEmitters();
    G.emitterIds = [];
    var f = G.maze.features;
    var n = 0;
    for (var k in f) {
      // A sealed secret room stays silent until its passage opens.
      var sealed = f[k].some(function (feature) {
        return feature.type === 'secret' && !feature.open;
      });
      f[k].forEach(function (feature) {
        if (!feature.landmark || sealed) return;
        feature.emitterId = 'e' + (n++);
        feature.emitType = feature.emits || feature.type;
        A.addEmitter(feature.emitterId, feature.emitType);
        G.emitterIds.push(feature.emitterId);
      });
    }
    if (G.maze.stalker) {
      A.addEmitter('stalker', 'footsteps');
      G.emitterIds.push('stalker');
    }
  }

  /* ------------------------------------------------------------------ */
  /* perception                                                          */
  /* ------------------------------------------------------------------ */

  function relativeOf(absDir) {
    return (absDir - G.facing + 4) % 4;
  }

  function panFor(rel) {
    if (rel === 1) return 0.85;
    if (rel === 3) return -0.85;
    return 0;
  }

  function currentField() {
    return M.field(G.maze, G.x, G.y, 12);
  }

  // Push the player's position into the audio engine.
  function updateAudio(f) {
    var featuresMap = G.maze.features;
    for (var k in featuresMap) {
      var parts = k.split(',');
      var node = f[k];
      featuresMap[k].forEach(function (feature) {
        if (!feature.emitterId) return;
        var range = feature.range || 4;
        if (!node || node.dist > range) {
          A.updateEmitter(feature.emitterId, 0, 0, false);
          return;
        }
        var falloff = Math.max(0, 1 - node.dist / (range + 0.5));
        var vol = Math.pow(falloff, 1.3) * (TYPE_VOLUME[feature.emitType] || 0.4);
        var rel = node.first === -1 ? 0 : relativeOf(node.first);
        if (rel === 2) vol *= 0.55;
        A.updateEmitter(feature.emitterId, vol, panFor(rel), rel === 2);
      });
    }
    var s = G.maze.stalker;
    if (s) {
      var sn = f[M.key(s.x, s.y)];
      if (!sn || sn.dist > 7) A.updateEmitter('stalker', 0, 0, false);
      else {
        var rel2 = sn.first === -1 ? 0 : relativeOf(sn.first);
        var v = Math.pow(Math.max(0, 1 - sn.dist / 7.5), 1.2) * TYPE_VOLUME.footsteps;
        A.updateEmitter('stalker', v, panFor(rel2), rel2 === 2);
      }
    }
  }

  function openNeighbours() {
    return M.neighbours(G.maze.grid, G.x, G.y).filter(function (n) {
      var fs = M.featuresAt(G.maze, n.x, n.y);
      for (var i = 0; i < fs.length; i++) {
        if (fs[i].type === 'secret' && !fs[i].open) return false;
      }
      return true;
    });
  }

  function shapeWord(count, ns) {
    if (count === 1) return 'dead end';
    if (count === 2) {
      return (ns[0].d + 2) % 4 === ns[1].d ? 'corridor' : 'corner';
    }
    return SHAPES[count] || 'chamber';
  }

  function listWords(words) {
    if (words.length === 1) return words[0];
    if (words.length === 2) return words[0] + ' and ' + words[1];
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }

  /* Build the short description read after a move. `full` is the L key. */
  function describe(full, f) {
    var v = full ? 3 : G.cfg.verbosity;
    var parts = [];
    var ns = openNeighbours();
    var surface = G.maze.surfaces[M.key(G.x, G.y)] || 'Stone';
    var shape = shapeWord(ns.length, ns);

    if (v >= 2) parts.push(surface + ' ' + shape + '.');
    else parts.push(shape.charAt(0).toUpperCase() + shape.slice(1) + '.');

    // Things in this cell.
    M.featuresAt(G.maze, G.x, G.y).forEach(function (feature) {
      if (feature.type === 'key') parts.push(v >= 2 ? 'Key here. Enter to take.' : 'Key here.');
      else if (feature.type === 'bonus') parts.push('Bonus here.');
      else if (feature.type === 'treasure') parts.push('Treasure here.');
      else if (feature.type === 'switch') parts.push(feature.on ? 'Switch, already on.' : 'Switch here.');
      else if (feature.type === 'exit') parts.push('Exit door here.');
    });

    // Adjacent doors, exit and (on easier levels) traps.
    ns.forEach(function (n) {
      var word = REL[relativeOf(n.d)];
      M.featuresAt(G.maze, n.x, n.y).forEach(function (feature) {
        if (feature.type === 'door') {
          parts.push((feature.locked ? 'Locked door ' : 'Open door ') + word + '.');
        } else if (feature.type === 'exit') {
          parts.push('Exit ' + word + '.');
        } else if (feature.type === 'trap' && v >= 2) {
          parts.push('Trap ' + word + '.');
        }
      });
    });

    // Where you can walk.
    if (v >= 1 && ns.length > 1) {
      var dirs = ns.map(function (n) { return REL[relativeOf(n.d)]; });
      parts.push('Open: ' + listWords(dirs) + '.');
    }

    // Nearest landmarks, described in words as well as heard.
    var limit = v >= 3 ? 3 : (v === 2 ? 2 : (v === 1 ? 1 : 0));
    if (limit > 0) {
      nearestLandmarks(f, limit).forEach(function (item) { parts.push(item); });
    }

    return parts.join(' ');
  }

  function nearestLandmarks(f, limit) {
    var found = [];
    var featuresMap = G.maze.features;
    for (var k in featuresMap) {
      var node = f[k];
      if (!node || node.dist === 0) continue;
      featuresMap[k].forEach(function (feature) {
        if (!feature.landmark || !feature.emitterId) return;
        if (feature.type === 'door' || feature.type === 'trap') return; // already covered
        var range = feature.range || 4;
        if (node.dist > range) return;
        var word = LANDMARK_WORD[feature.emitType];
        if (!word) return;
        found.push({
          dist: node.dist,
          text: word + ' ' + REL[node.first === -1 ? 0 : relativeOf(node.first)] + '.'
        });
      });
    }
    found.sort(function (a, b) { return a.dist - b.dist; });
    var seen = {}, out = [];
    found.forEach(function (item) {
      if (out.length >= limit || seen[item.text]) return;
      seen[item.text] = true;
      out.push(item.text);
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */

  function step(forward) {
    var d = forward ? G.facing : (G.facing + 2) % 4;
    var nx = G.x + DIRS[d].x, ny = G.y + DIRS[d].y;
    var grid = G.maze.grid;

    if (!grid[ny] || grid[ny][nx] !== 1) {
      A.fx('bump');
      announce('Wall.');
      return;
    }
    var blocking = null;
    M.featuresAt(G.maze, nx, ny).forEach(function (feature) {
      if (feature.type === 'door' && feature.locked) blocking = 'door';
      if (feature.type === 'secret' && !feature.open) blocking = 'wall';
    });
    if (blocking === 'door') {
      A.fx('locked');
      announce(G.powered ? 'Locked door. Enter to open.' : 'Locked door. Find the switch.');
      return;
    }
    if (blocking === 'wall') {
      A.fx('bump');
      announce('Wall.');
      return;
    }

    G.x = nx; G.y = ny;
    A.fx('step');

    var sprung = false;
    M.featuresAt(G.maze, G.x, G.y).slice().forEach(function (feature) {
      if (feature.type === 'trap') { springTrap(feature); sprung = true; }
    });
    if (sprung) { refresh(); return; }

    if (G.maze.stalker && G.maze.stalker.x === G.x && G.maze.stalker.y === G.y) {
      caught();
      return;
    }

    var f = currentField();
    updateAudio(f);
    announce(describe(false, f));
    maybeSurprise();
    renderMap();
    updateStatus();
  }

  function turn(delta) {
    G.facing = (G.facing + delta + 4) % 4;
    A.fx('tick', delta > 0 ? 0.6 : -0.6);
    var f = currentField();
    updateAudio(f);
    announce(DIR_NAMES[G.facing] + '.');
    updateStatus();
    renderMap();
  }

  function interact() {
    var here = M.featuresAt(G.maze, G.x, G.y).slice();
    var handled = false;

    here.forEach(function (feature) {
      if (handled) return;
      if (feature.type === 'key') {
        G.keys++;
        G.score += 100;
        A.fx('key');
        A.removeEmitter(feature.emitterId);
        M.removeFeature(G.maze, feature);
        setClue('Key taken. ' + G.keys + ' of ' + G.keysNeeded + '.');
        announce('Key taken. ' + G.keys + ' of ' + G.keysNeeded + '.', true);
        handled = true;
      } else if (feature.type === 'bonus' || feature.type === 'treasure') {
        G.score += feature.points;
        A.fx('bonus');
        A.removeEmitter(feature.emitterId);
        M.removeFeature(G.maze, feature);
        announce((feature.type === 'treasure' ? 'Treasure! ' : 'Bonus. ') + 'Plus ' + feature.points + '.');
        handled = true;
      } else if (feature.type === 'switch') {
        if (feature.on) { announce('Switch already on.'); handled = true; return; }
        activateSwitch(feature);
        handled = true;
      } else if (feature.type === 'exit') {
        tryExit();
        handled = true;
      }
    });

    if (handled) { refresh(); return; }

    // Nothing here: try whatever is directly ahead.
    var nx = G.x + DIRS[G.facing].x, ny = G.y + DIRS[G.facing].y;
    M.featuresAt(G.maze, nx, ny).forEach(function (feature) {
      if (handled) return;
      if (feature.type === 'exit') { tryExit(); handled = true; }
      else if (feature.type === 'trap') {
        // You heard the hiss and worked out the direction: disarm it.
        A.removeEmitter(feature.emitterId);
        M.removeFeature(G.maze, feature);
        G.score += 75;
        A.fx('unlock');
        setClue('Trap disarmed.');
        announce('Trap disarmed. Plus 75.', true);
        handled = true;
      }
      else if (feature.type === 'door') {
        if (!feature.locked) { announce('Door already open.'); handled = true; return; }
        if (G.powered) {
          feature.locked = false;
          A.fx('unlock');
          A.fx('door');
          G.score += 50;
          announce('Door open.');
        } else {
          A.fx('locked');
          announce('Locked. Find the switch.');
        }
        handled = true;
      }
    });

    if (!handled) announce('Nothing here.');
    refresh();
  }

  function activateSwitch(feature) {
    feature.on = true;
    G.powered = true;
    G.score += 75;
    A.fx('switchOn');
    feature.landmark = false;

    var msg = 'Switch on.';
    if (G.maze.doors.length) msg += ' Doors can be opened.';
    if (G.maze.secret) {
      M.featuresAt(G.maze, G.maze.secret.x, G.maze.secret.y).forEach(function (s) {
        if (s.type === 'secret') s.open = true;
      });
      A.fx('rumble');
      msg += ' A passage opened somewhere.';
    }
    // Rebuild emitters so the newly opened room starts making noise.
    indexEmitters();
    setClue(msg);
    announce(msg, true);
  }

  function tryExit() {
    if (G.keys >= G.keysNeeded) {
      win();
    } else {
      A.fx('locked');
      var need = G.keysNeeded - G.keys;
      announce('Exit locked. Need ' + need + ' more key' + (need === 1 ? '' : 's') + '.', true);
    }
  }

  function springTrap(feature) {
    A.fx('trap');
    A.removeEmitter(feature.emitterId);
    M.removeFeature(G.maze, feature);
    G.lives--;
    G.score = Math.max(0, G.score - 100);
    G.timeLeft = Math.max(0, G.timeLeft - 10);
    if (G.lives <= 0) { lose('You ran out of lives.'); return; }
    setClue('Trap sprung. Lives ' + G.lives + '.');
    announce('Trap! Minus 10 seconds. Lives ' + G.lives + '.', true);
  }

  function caught() {
    A.fx('trap');
    G.lives--;
    G.score = Math.max(0, G.score - 50);
    if (G.lives <= 0) { lose('The thing in the maze caught you.'); return; }
    // Send the stalker back to a far corner so the player gets breathing room.
    relocateStalker();
    setClue('Caught. Lives ' + G.lives + '.');
    announce('Caught! Lives ' + G.lives + '.', true);
    refresh();
  }

  function relocateStalker() {
    var f = M.field(G.maze, G.x, G.y, 9999);
    var best = null, bestD = -1;
    for (var k in f) {
      if (f[k].dist > bestD) { bestD = f[k].dist; best = k; }
    }
    if (best) {
      var p = best.split(',');
      G.maze.stalker.x = +p[0];
      G.maze.stalker.y = +p[1];
    }
  }

  function maybeSurprise() {
    if (Math.random() > G.cfg.surpriseChance) return;
    var s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    A.fx(s.fx, Math.random() * 2 - 1);
    announce(s.text);
  }

  function setClue(text) { G.lastClue = text; }

  function refresh() {
    if (!G || G.over) return;
    var f = currentField();
    updateAudio(f);
    updateStatus();
    renderMap();
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                                */
  /* ------------------------------------------------------------------ */

  var URGENT_MARKS = [60, 30, 15, 10, 5, 4, 3, 2, 1];

  function startLoop() {
    stopLoop();
    var last = Date.now();
    loopId = setInterval(function () {
      var dt = Date.now() - last;
      last = Date.now();
      if (!G || G.over || G.paused) return;

      G.timeLeft -= dt / 1000;
      G.elapsed += dt / 1000;

      var whole = Math.ceil(G.timeLeft);
      URGENT_MARKS.forEach(function (mark) {
        if (whole === mark && !G.warned[mark]) {
          G.warned[mark] = true;
          A.fx(mark <= 10 ? 'tick' : 'urgent');
          announce(mark + (mark === 1 ? ' second.' : ' seconds.'), true);
        }
      });

      if (G.timeLeft <= 0) { G.timeLeft = 0; lose('Time ran out.'); return; }

      // Stalker movement.
      if (G.maze.stalker) {
        G.stalkerClock += dt;
        if (G.stalkerClock >= G.cfg.stalkerSpeed) {
          G.stalkerClock = 0;
          moveStalker();
        }
      }
      updateStatus();
    }, 200);
  }

  function stopLoop() {
    if (loopId) { clearInterval(loopId); loopId = null; }
  }

  function moveStalker() {
    var s = G.maze.stalker;
    var f = M.field(G.maze, s.x, s.y, 40);
    var pk = M.key(G.x, G.y);
    var node = f[pk];
    if (!node || node.dist === 0) { caught(); return; }
    // Walk one cell along the route towards the player.
    var back = M.field(G.maze, G.x, G.y, 40);
    var options = M.neighbours(G.maze.grid, s.x, s.y).filter(function (n) {
      return !M.isBlocked(G.maze, n.x, n.y) && back[M.key(n.x, n.y)];
    });
    if (!options.length) return;
    options.sort(function (a, b) {
      return back[M.key(a.x, a.y)].dist - back[M.key(b.x, b.y)].dist;
    });
    var next = options[0];
    s.x = next.x; s.y = next.y;
    if (s.x === G.x && s.y === G.y) { caught(); return; }
    updateAudio(currentField());
  }

  /* ------------------------------------------------------------------ */
  /* win / lose                                                          */
  /* ------------------------------------------------------------------ */

  function win() {
    G.over = true;
    stopLoop();
    A.clearEmitters();
    A.fx('win');

    var timeBonus = Math.round(G.timeLeft * 5);
    var levelBonus = G.level * 200;
    G.score += 1000 + timeBonus + levelBonus;
    var seconds = Math.round(G.elapsed);

    var summary = 'You escaped! Time ' + formatTime(seconds) + '. Score ' + G.score + '.';
    announce(summary, true);

    var record = saveRecord(G.difficulty, seconds, G.score, G.level);
    showOver('You escaped!', summary, [
      'Completion time: ' + formatTime(seconds),
      'Time bonus: ' + timeBonus,
      'Level bonus: ' + levelBonus,
      'Total score: ' + G.score,
      'Lives left: ' + G.lives,
      'Best time on ' + DIFFICULTY[G.difficulty].label + ': ' + formatTime(record.bestTime),
      'Best score on ' + DIFFICULTY[G.difficulty].label + ': ' + record.bestScore
    ], true);
  }

  function lose(reason) {
    G.over = true;
    stopLoop();
    A.clearEmitters();
    A.fx('lose');

    var summary = 'You did not escape. ' + reason + ' Score ' + G.score + '.';
    announce(summary, true);
    showOver('Run over', summary, [
      'Reason: ' + reason,
      'Score: ' + G.score,
      'Level reached: ' + G.level,
      'Time survived: ' + formatTime(Math.round(G.elapsed))
    ], false);
  }

  function showOver(heading, body, stats, won) {
    el['over-h'].textContent = heading;
    el['over-body'].textContent = body + ' Press Enter to play again.';
    el['over-stats'].innerHTML = '';
    stats.forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      el['over-stats'].appendChild(li);
    });
    el['next-btn'].hidden = !won;
    if (!el['over-dialog'].open) el['over-dialog'].showModal();
    (won ? el['next-btn'] : el['again-btn']).focus();
  }

  function formatTime(seconds) {
    if (seconds === null || seconds === undefined) return 'none yet';
    var m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ------------------------------------------------------------------ */
  /* records                                                             */
  /* ------------------------------------------------------------------ */

  var STORE = 'escape-audio-maze-records';

  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
    catch (e) { return {}; }
  }

  function saveRecord(difficulty, seconds, score, level) {
    var all = loadRecords();
    var r = all[difficulty] || { bestTime: null, bestScore: 0, bestLevel: 0 };
    if (r.bestTime === null || seconds < r.bestTime) r.bestTime = seconds;
    if (score > r.bestScore) r.bestScore = score;
    if (level > r.bestLevel) r.bestLevel = level;
    all[difficulty] = r;
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* storage off */ }
    renderRecords();
    return r;
  }

  function renderRecords() {
    var all = loadRecords();
    el.records.innerHTML = '';
    Object.keys(DIFFICULTY).forEach(function (d) {
      var r = all[d];
      var li = document.createElement('li');
      li.textContent = DIFFICULTY[d].label + ': ' +
        (r ? 'best time ' + formatTime(r.bestTime) + ', best score ' + r.bestScore +
             ', level ' + r.bestLevel
           : 'no runs yet');
      el.records.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ */
  /* status and map                                                      */
  /* ------------------------------------------------------------------ */

  function updateStatus() {
    if (!G) return;
    el['s-time'].textContent = formatTime(Math.ceil(G.timeLeft));
    el['s-score'].textContent = G.score;
    el['s-lives'].textContent = G.lives;
    el['s-keys'].textContent = G.keys + ' of ' + G.keysNeeded;
    el['s-facing'].textContent = DIR_NAMES[G.facing];
    el['s-level'].textContent = G.level;
    el['app-headline'].textContent = G.paused
      ? 'Paused'
      : DIR_NAMES[G.facing] + ' - ' + formatTime(Math.ceil(G.timeLeft)) + ' left';
  }

  var MAP_CHARS = {
    exit: 'E', key: 'K', door: 'D', switch: 'S', trap: 'X',
    bonus: 'b', treasure: 'T', secret: '?'
  };

  function renderMap() {
    if (!settings.showMap || !G) return;
    var rows = [];
    for (var y = 0; y < G.maze.size; y++) {
      var line = '';
      for (var x = 0; x < G.maze.size; x++) {
        if (G.x === x && G.y === y) { line += '@'; continue; }
        if (G.maze.stalker && G.maze.stalker.x === x && G.maze.stalker.y === y) { line += '!'; continue; }
        if (G.maze.grid[y][x] === 0) { line += '#'; continue; }
        var ch = '.';
        M.featuresAt(G.maze, x, y).forEach(function (f) {
          if (MAP_CHARS[f.type]) ch = MAP_CHARS[f.type];
        });
        line += ch;
      }
      rows.push(line);
    }
    el.map.textContent = rows.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* input                                                               */
  /* ------------------------------------------------------------------ */

  var HELP = 'Arrows move and turn. Enter takes items, opens doors, and disarms a trap you are facing. ' +
             'L listen. S status. R repeat clue. M speech on or off. Escape pauses.';

  function onKey(e) {
    if (!G || G.over) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.key;

    if (k === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (k === 'h' || k === 'H') { e.preventDefault(); announce(HELP); return; }
    if (k === 'm' || k === 'M') { e.preventDefault(); toggleNarration(); return; }

    if (G.paused) {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); togglePause(); }
      return;
    }

    switch (k) {
      case 'ArrowUp': e.preventDefault(); step(true); break;
      case 'ArrowDown': e.preventDefault(); step(false); break;
      case 'ArrowLeft': e.preventDefault(); turn(-1); break;
      case 'ArrowRight': e.preventDefault(); turn(1); break;
      case 'Enter': e.preventDefault(); interact(); break;
      case 'r': case 'R': e.preventDefault(); announce(G.lastClue, true); break;
      case 'l': case 'L': e.preventDefault(); announce(describe(true, currentField())); break;
      case 's': case 'S': e.preventDefault(); announce(statusLine()); break;
      default: break;
    }
  }

  function statusLine() {
    return formatTime(Math.ceil(G.timeLeft)) + ' left. Score ' + G.score +
           '. Lives ' + G.lives + '. Keys ' + G.keys + ' of ' + G.keysNeeded +
           '. Facing ' + DIR_NAMES[G.facing] + '.';
  }

  function togglePause() {
    G.paused = !G.paused;
    A.setEnabled(!G.paused);
    if (G.paused) stopSpeech();
    announce(G.paused ? 'Paused. Escape to resume.' : 'Resumed. ' + describe(false, currentField()), true);
    updateStatus();
  }

  function toggleNarration() {
    if (settings.narration === 'speech' || settings.narration === 'both') {
      settings.narration = 'live';
      stopSpeech();
      announce('Built-in speech off. Screen reader messages only.');
    } else {
      settings.narration = 'speech';
      announce('Built-in speech on.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                              */
  /* ------------------------------------------------------------------ */

  function readSettings() {
    var form = el.setup;
    settings.narration = form.elements.narration.value;
    settings.rate = parseFloat(el.rate.value);
    settings.volume = parseInt(el.volume.value, 10) / 100;
    settings.showMap = el.showmap.checked;
    el['map-panel'].hidden = !settings.showMap;
  }

  function startGame(difficulty, level, carried) {
    readSettings();
    A.init();
    A.resume();
    A.setVolume(settings.volume);
    A.setEnabled(true);

    el.menu.hidden = true;
    el.game.hidden = false;
    el.log.innerHTML = '';

    newRun(difficulty, level, carried);

    var f = currentField();
    updateAudio(f);
    updateStatus();
    renderMap();

    el.app.focus();

    var intro = DIFFICULTY[difficulty].label + ', level ' + level + '. ' +
      G.maze.beacon.clue + ' ' +
      'Find ' + G.keysNeeded + ' key' + (G.keysNeeded === 1 ? '' : 's') + '. ' +
      formatTime(G.cfg.time) + ' on the clock.';
    setClue(G.maze.beacon.clue + ' Keys needed: ' + G.keysNeeded + '.');
    announce(intro, true);
    // Give the intro room to be read before the first room description.
    setTimeout(function () {
      if (G && !G.over) announce(describe(false, currentField()));
    }, 1200);

    startLoop();
  }

  function backToMenu() {
    stopLoop();
    stopSpeech();
    A.clearEmitters();
    if (el['over-dialog'].open) el['over-dialog'].close();
    G = null;
    el.game.hidden = true;
    el.menu.hidden = false;
    renderRecords();
    el['start-btn'].focus();
  }

  el.setup.addEventListener('submit', function (e) {
    e.preventDefault();
    var difficulty = el.setup.elements.difficulty.value;
    startGame(difficulty, 1, 0);
  });

  el.app.addEventListener('keydown', onKey);

  el['volume'].addEventListener('input', function () {
    el['volume-out'].textContent = el.volume.value + '%';
    settings.volume = parseInt(el.volume.value, 10) / 100;
    A.setVolume(settings.volume);
  });

  el['rate'].addEventListener('input', function () {
    el['rate-out'].textContent = parseFloat(el.rate.value).toFixed(1) + '\u00D7';
    settings.rate = parseFloat(el.rate.value);
  });

  el['showmap'].addEventListener('change', function () {
    settings.showMap = el.showmap.checked;
    el['map-panel'].hidden = !settings.showMap;
    renderMap();
  });

  // Lets anyone confirm, before starting, that their chosen mode actually
  // reaches them. The chime also separates "no audio at all" from "no speech".
  el['test-btn'].addEventListener('click', function () {
    readSettings();
    A.init();
    A.resume();
    A.setVolume(settings.volume);
    A.setEnabled(true);
    A.fx('bonus');

    var explain = {
      live: 'A chime should have played, and a screen reader should have read a test message. ' +
            'Heard the chime but no voice? You are not running a screen reader: choose "Built-in speech only".',
      speech: 'A chime should have played, followed by a spoken test message. ' +
              'Heard the chime but no voice? Your browser has no speech voice installed.',
      both: 'A chime should have played, and the message should have arrived by both speech and screen reader.',
      off: 'Narration is off, so you should have heard the chime only. ' +
           'Messages will still appear in the Transcript while you play.'
    };
    el['test-result'].textContent = explain[settings.narration];
    announce('Test message. Announcements are working.');
  });

  el['how-btn'].addEventListener('click', function () { el['how-dialog'].showModal(); });
  el['how-close'].addEventListener('click', function () { el['how-dialog'].close(); });
  el['how-dialog'].addEventListener('close', function () { el['how-btn'].focus(); });

  el['again-btn'].addEventListener('click', function () {
    var d = G ? G.difficulty : el.setup.elements.difficulty.value;
    el['over-dialog'].close();
    startGame(d, 1, 0);
  });

  el['next-btn'].addEventListener('click', function () {
    var d = G.difficulty, level = G.level + 1, carried = G.score;
    el['over-dialog'].close();
    startGame(d, level, carried);
  });

  el['menu-btn'].addEventListener('click', backToMenu);

  // Keep the dialog a deliberate choice rather than an accidental dismissal.
  el['over-dialog'].addEventListener('cancel', function (e) {
    e.preventDefault();
    announce('Choose play again, next level, or back to menu.', true);
  });

  if (!A.supported()) {
    announce('Web Audio is unavailable in this browser. The game still works using text messages.');
  }

  // Small hook used by the automated playthrough test.
  window.EscapeAudioMaze = { state: function () { return G; } };

  // One canonical controls list, mirrored into the in-game panel so the two
  // can never fall out of step.
  (function mirrorControls() {
    var source = document.getElementById('controls-list');
    var target = document.getElementById('keys-list');
    if (!source || !target) return;
    target.innerHTML = source.innerHTML;
  })();

  renderRecords();
  el['volume-out'].textContent = el.volume.value + '%';
  el['rate-out'].textContent = parseFloat(el.rate.value).toFixed(1) + '\u00D7';
})();
