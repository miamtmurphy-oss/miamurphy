/* Escape the Audio Maze - maze generation, feature placement and the
   audio "field" (breadth-first distances that make sound travel along
   corridors instead of straight through walls). */

window.MazeGen = (function () {

  // Directions: 0 north, 1 east, 2 south, 3 west.
  var DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  var DIR_NAMES = ['North', 'East', 'South', 'West'];
  var REL_WORDS = ['ahead', 'right', 'behind', 'left'];

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function key(x, y) { return x + ',' + y; }

  function makeGrid(w, h) {
    var g = [];
    for (var y = 0; y < h; y++) {
      g.push([]);
      for (var x = 0; x < w; x++) g[y].push(0);
    }
    return g;
  }

  /* Recursive-backtracker carve on an odd-sized grid. */
  function carve(w, h, rnd) {
    var grid = makeGrid(w, h);
    var stack = [{ x: 1, y: 1 }];
    grid[1][1] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var options = [];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d].x * 2, ny = cur.y + DIRS[d].y * 2;
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[ny][nx] === 0) {
          options.push({ x: nx, y: ny, d: d });
        }
      }
      if (!options.length) { stack.pop(); continue; }
      var pick = options[Math.floor(rnd() * options.length)];
      grid[cur.y + DIRS[pick.d].y][cur.x + DIRS[pick.d].x] = 1;
      grid[pick.y][pick.x] = 1;
      stack.push({ x: pick.x, y: pick.y });
    }
    return grid;
  }

  /* Knock out extra walls so the maze has loops and misleading routes. */
  function braid(grid, rnd, amount) {
    var w = grid[0].length, h = grid.length;
    var candidates = [];
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        if (grid[y][x] !== 0) continue;
        var horiz = grid[y][x - 1] === 1 && grid[y][x + 1] === 1;
        var vert = grid[y - 1][x] === 1 && grid[y + 1][x] === 1;
        if (horiz !== vert) candidates.push({ x: x, y: y });
      }
    }
    var count = Math.floor(candidates.length * amount);
    for (var i = 0; i < count; i++) {
      var c = candidates.splice(Math.floor(rnd() * candidates.length), 1)[0];
      if (!c) break;
      grid[c.y][c.x] = 1;
    }
  }

  function openCells(grid) {
    var list = [];
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[0].length; x++) if (grid[y][x] === 1) list.push({ x: x, y: y });
    }
    return list;
  }

  function neighbours(grid, x, y) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      var nx = x + DIRS[d].x, ny = y + DIRS[d].y;
      if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length && grid[ny][nx] === 1) {
        out.push({ x: nx, y: ny, d: d });
      }
    }
    return out;
  }

  /* BFS from a cell. Returns a map of "x,y" -> { dist, first } where
     `first` is the absolute direction of the first step along the route.
     Blocked cells (closed doors / sealed passages) stop the sound. */
  function field(state, sx, sy, maxDepth) {
    var grid = state.grid;
    var out = Object.create(null);
    out[key(sx, sy)] = { dist: 0, first: -1 };
    var queue = [{ x: sx, y: sy, dist: 0, first: -1 }];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      if (cur.dist >= maxDepth) continue;
      var ns = neighbours(grid, cur.x, cur.y);
      for (var i = 0; i < ns.length; i++) {
        var n = ns[i];
        var k = key(n.x, n.y);
        if (out[k]) continue;
        var node = { dist: cur.dist + 1, first: cur.first === -1 ? n.d : cur.first };
        out[k] = node;
        // A sealed cell can be heard but not heard *through*.
        if (isBlocked(state, n.x, n.y)) continue;
        queue.push({ x: n.x, y: n.y, dist: node.dist, first: node.first });
      }
    }
    return out;
  }

  function isBlocked(state, x, y) {
    var fs = state.features[key(x, y)];
    if (!fs) return false;
    for (var i = 0; i < fs.length; i++) {
      if (fs[i].type === 'door' && fs[i].locked) return true;
      if (fs[i].type === 'secret' && !fs[i].open) return true;
    }
    return false;
  }

  function featuresAt(state, x, y) {
    return state.features[key(x, y)] || [];
  }

  function addFeature(state, x, y, feature) {
    var k = key(x, y);
    if (!state.features[k]) state.features[k] = [];
    state.features[k].push(feature);
    feature.x = x; feature.y = y;
    return feature;
  }

  function removeFeature(state, feature) {
    var k = key(feature.x, feature.y);
    var list = state.features[k];
    if (!list) return;
    var i = list.indexOf(feature);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) delete state.features[k];
  }

  function deadEnds(grid) {
    return openCells(grid).filter(function (c) {
      return neighbours(grid, c.x, c.y).length === 1;
    });
  }

  function farthest(state, from) {
    var f = field(state, from.x, from.y, 9999);
    var best = from, bestD = -1;
    for (var k in f) {
      if (f[k].dist > bestD) {
        bestD = f[k].dist;
        var p = k.split(',');
        best = { x: +p[0], y: +p[1] };
      }
    }
    return { cell: best, dist: bestD, field: f };
  }

  /* Landmarks that can act as the "the exit sounds like..." beacon. */
  var BEACONS = [
    { type: 'wind', noun: 'wind', clue: 'Clue: the exit is near fresh air.' },
    { type: 'drip', noun: 'dripping', clue: 'Clue: the exit is near steady dripping.' },
    { type: 'machine', noun: 'machinery', clue: 'Clue: the exit is near humming machinery.' },
    { type: 'chime', noun: 'chimes', clue: 'Clue: the exit is near ringing chimes.' }
  ];

  var DECOYS = ['water', 'drip', 'wind', 'machine', 'chime'];

  var SURFACES = ['Stone', 'Metal', 'Wooden', 'Sandy', 'Tiled'];

  function pickFrom(list, rnd) {
    return list[Math.floor(rnd() * list.length)];
  }

  function takeSpot(pool, rnd, avoidField, minDist) {
    for (var attempt = 0; attempt < 60 && pool.length; attempt++) {
      var i = Math.floor(rnd() * pool.length);
      var c = pool[i];
      if (avoidField) {
        var node = avoidField[key(c.x, c.y)];
        if (!node || node.dist < minDist) continue;
      }
      pool.splice(i, 1);
      return c;
    }
    return pool.length ? pool.splice(Math.floor(rnd() * pool.length), 1)[0] : null;
  }

  /* Build a complete, playable maze state. */
  function build(config, seed) {
    var rnd = mulberry32(seed);
    var size = config.size;
    var grid = carve(size, size, rnd);
    if (config.braid > 0) braid(grid, rnd, config.braid);

    var state = {
      grid: grid,
      size: size,
      features: Object.create(null),
      surfaces: Object.create(null),
      seed: seed
    };

    var cells = openCells(grid);
    cells.forEach(function (c) {
      state.surfaces[key(c.x, c.y)] = pickFrom(SURFACES, rnd);
    });

    // Start: a dead end, so the first room is unambiguous.
    var ends = deadEnds(grid);
    var start = ends.length ? pickFrom(ends, rnd) : cells[0];
    state.start = { x: start.x, y: start.y, facing: Math.floor(rnd() * 4) };

    // Exit: the cell farthest from the start.
    var far = farthest(state, start);
    var startField = far.field;
    state.exitCell = far.cell;
    var exit = addFeature(state, far.cell.x, far.cell.y, {
      type: 'exit', locked: true
    });
    addFeature(state, far.cell.x, far.cell.y, { type: 'aura', landmark: true, range: 4 });

    // The beacon landmark sits on or beside the exit and is named in the clue.
    var beacon = pickFrom(BEACONS, rnd);
    var beaconNeighbours = neighbours(grid, far.cell.x, far.cell.y);
    var beaconCell = beaconNeighbours.length ? pickFrom(beaconNeighbours, rnd) : far.cell;
    addFeature(state, beaconCell.x, beaconCell.y, {
      type: beacon.type, landmark: true, range: config.beaconRange, beacon: true
    });
    state.beacon = beacon;
    exit.needed = config.keys;

    // Pool of spots for everything else: never the start, never the exit.
    var pool = cells.filter(function (c) {
      return !(c.x === start.x && c.y === start.y) &&
             !(c.x === far.cell.x && c.y === far.cell.y);
    });

    // Decoy landmarks, kept away from the exit so they genuinely mislead.
    var exitField = field(state, far.cell.x, far.cell.y, 9999);
    var decoyTypes = DECOYS.filter(function (t) { return t !== beacon.type; });
    for (var i = 0; i < config.decoys; i++) {
      var spot = takeSpot(pool, rnd, exitField, Math.max(4, Math.floor(size / 3)));
      if (!spot) break;
      addFeature(state, spot.x, spot.y, {
        type: pickFrom(decoyTypes, rnd), landmark: true, range: config.decoyRange
      });
    }

    // Keys at dead ends where possible: rewarding to hunt down.
    var endPool = ends.filter(function (c) {
      return !(c.x === start.x && c.y === start.y) && !(c.x === far.cell.x && c.y === far.cell.y);
    });

    // Reserve a dead end for the secret room before keys claim them all,
    // but never the last one: keys deserve dead ends too.
    var secretCell = null;
    if (config.secret && endPool.length > config.keys) {
      secretCell = endPool.splice(Math.floor(rnd() * endPool.length), 1)[0];
    }

    for (var k = 0; k < config.keys; k++) {
      var kc = endPool.length ? endPool.splice(Math.floor(rnd() * endPool.length), 1)[0]
                              : takeSpot(pool, rnd, startField, 3);
      if (!kc) break;
      addFeature(state, kc.x, kc.y, { type: 'key', landmark: true, emits: 'jingle', range: 3.5 });
      pool = pool.filter(function (c) { return !(c.x === kc.x && c.y === kc.y); });
    }

    // Switch: powers the doors and opens the secret passage. It is placed
    // before any door so it can never end up sealed behind one.
    state.switchFeature = null;
    var sc = takeSpot(pool, rnd, startField, 2);
    if (sc) {
      state.switchFeature = addFeature(state, sc.x, sc.y, {
        type: 'switch', on: false, landmark: true, emits: 'hum', range: 3
      });
      pool = pool.filter(function (c) { return !(c.x === sc.x && c.y === sc.y); });
    }

    // Locked doors across straight corridors. Every placement is verified:
    // with all doors locked the switch must still be reachable, otherwise the
    // run would be unwinnable.
    var corridorPool = pool.filter(function (c) {
      var n = neighbours(grid, c.x, c.y);
      if (n.length !== 2) return false;
      return (n[0].d + 2) % 4 === n[1].d; // straight-through corridor
    });
    state.doors = [];
    if (state.switchFeature) {
      var switchKey = key(state.switchFeature.x, state.switchFeature.y);
      for (var d = 0; d < config.doors; d++) {
        var placed = false;
        while (corridorPool.length && !placed) {
          var dc = corridorPool.splice(Math.floor(rnd() * corridorPool.length), 1)[0];
          var door = addFeature(state, dc.x, dc.y, {
            type: 'door', locked: true, landmark: true, emits: 'rattle', range: 3
          });
          if (field(state, start.x, start.y, 9999)[switchKey]) {
            state.doors.push(door);
            pool = pool.filter(function (c) { return !(c.x === dc.x && c.y === dc.y); });
            placed = true;
          } else {
            removeFeature(state, door);
          }
        }
        if (!placed) break;
      }
    }

    // Secret room: a sealed dead end holding treasure. Sealing a dead end can
    // never cut off any other part of the maze.
    state.secret = null;
    if (config.secret) {
      var secretEnds = deadEnds(grid).filter(function (c) {
        if (c.x === start.x && c.y === start.y) return false;
        if (c.x === far.cell.x && c.y === far.cell.y) return false;
        return featuresAt(state, c.x, c.y).length === 0;
      });
      if (secretCell && !featuresAt(state, secretCell.x, secretCell.y).length) {
        secretEnds = [secretCell];
      }
      if (secretEnds.length) {
        var room = pickFrom(secretEnds, rnd);
        addFeature(state, room.x, room.y, { type: 'secret', open: false });
        addFeature(state, room.x, room.y, {
          type: 'treasure', landmark: true, emits: 'chime', range: 2.5, points: 400
        });
        state.surfaces[key(room.x, room.y)] = 'Hidden';
        state.secret = { x: room.x, y: room.y };
        pool = pool.filter(function (c) { return !(c.x === room.x && c.y === room.y); });
      }
    }

    // Bonus items.
    for (var b = 0; b < config.bonuses; b++) {
      var bc = takeSpot(pool, rnd, startField, 2);
      if (!bc) break;
      addFeature(state, bc.x, bc.y, {
        type: 'bonus', landmark: true, emits: 'chime', range: 2.5, points: 150
      });
    }

    // Traps. They hiss quietly when you are beside them.
    for (var t = 0; t < config.traps; t++) {
      var tc = takeSpot(pool, rnd, startField, 3);
      if (!tc) break;
      addFeature(state, tc.x, tc.y, { type: 'trap', landmark: true, emits: 'hiss', range: 1.9 });
    }

    // Stalker starts far away from the player.
    state.stalker = null;
    if (config.stalker) {
      var sp = cells.filter(function (c) {
        var n = startField[key(c.x, c.y)];
        return n && n.dist > Math.max(6, size / 2);
      });
      var home = sp.length ? pickFrom(sp, rnd) : far.cell;
      state.stalker = { x: home.x, y: home.y, speed: config.stalkerSpeed };
    }

    return state;
  }

  return {
    DIRS: DIRS,
    DIR_NAMES: DIR_NAMES,
    REL_WORDS: REL_WORDS,
    build: build,
    field: field,
    key: key,
    neighbours: neighbours,
    featuresAt: featuresAt,
    addFeature: addFeature,
    removeFeature: removeFeature,
    isBlocked: isBlocked,
    mulberry32: mulberry32
  };
})();
