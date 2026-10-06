/* Escape the Audio Maze - synthesized spatial audio engine.
   No external assets: everything is generated with the Web Audio API.
   Positioning uses a stereo panner plus a "muffle" lowpass so that sounds
   behind the player are darker and quieter than sounds ahead. */

window.MazeAudio = (function () {
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var emitters = Object.create(null);
  var schedulerId = null;
  var enabled = true;
  var volume = 0.75;

  function supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  function init() {
    if (ctx || !supported()) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(2);
      schedulerId = setInterval(tick, 90);
    } catch (e) {
      // No audio device or blocked context: the game stays fully playable
      // through its text messages.
      ctx = null;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function makeNoise(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(enabled ? v : 0, now(), 0.05);
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? volume : 0, now(), 0.05);
  }

  function panNode() {
    if (ctx.createStereoPanner) return ctx.createStereoPanner();
    // Fallback for browsers without StereoPannerNode.
    var p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.setPan = null;
    return p;
  }

  function setPan(node, value) {
    if (node.pan) node.pan.setTargetAtTime(value, now(), 0.08);
    else if (node.setPosition) node.setPosition(value, 0, 1 - Math.abs(value));
  }

  function noiseSource() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  /* ---------------- emitters ---------------- */

  // Continuous emitters drone forever; periodic emitters fire short events.
  var CONTINUOUS = {
    water: function (dest) {
      var s = noiseSource();
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 350;
      s.connect(bp); bp.connect(hp); hp.connect(dest);
      s.start();
      return [s];
    },
    wind: function (dest) {
      var s = noiseSource();
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      var swell = ctx.createGain();
      swell.gain.value = 0.7;
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      var lfoAmp = ctx.createGain();
      lfoAmp.gain.value = 0.45;
      lfo.connect(lfoAmp); lfoAmp.connect(swell.gain);
      s.connect(lp); lp.connect(swell); swell.connect(dest);
      s.start(); lfo.start();
      return [s, lfo];
    },
    machine: function (dest) {
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 58;
      var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 29;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      var g = ctx.createGain(); g.gain.value = 0.5;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
      o1.start(); o2.start();
      return [o1, o2];
    },
    hiss: function (dest) {
      var s = noiseSource();
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 5200;
      var g = ctx.createGain(); g.gain.value = 0.55;
      s.connect(hp); hp.connect(g); g.connect(dest);
      s.start();
      return [s];
    },
    aura: function (dest) {
      // The exit's "freedom hum": a warm, consonant drone.
      var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 196;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 294;
      var g = ctx.createGain(); g.gain.value = 0.35;
      o1.connect(g); o2.connect(g); g.connect(dest);
      o1.start(); o2.start();
      return [o1, o2];
    }
  };

  var PERIODIC = {
    drip: { min: 0.9, max: 2.4, play: function (dest, t) { ping(dest, t, 1400, 0.22, 'sine', 0.5); } },
    chime: { min: 1.8, max: 3.2, play: function (dest, t) { ping(dest, t, 1760, 0.5, 'triangle', 0.3); ping(dest, t + 0.14, 2637, 0.4, 'triangle', 0.22); } },
    jingle: { min: 1.4, max: 2.6, play: function (dest, t) {
      for (var i = 0; i < 4; i++) ping(dest, t + i * 0.055, 2200 + Math.random() * 1600, 0.16, 'triangle', 0.16);
    } },
    creak: { min: 2.6, max: 5.0, play: function (dest, t) {
      var o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, t);
      o.frequency.linearRampToValueAtTime(190, t + 0.55);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.75);
    } },
    rattle: { min: 2.2, max: 4.4, play: function (dest, t) {
      for (var i = 0; i < 5; i++) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf;
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + i * 120; bp.Q.value = 6;
        var g = ctx.createGain();
        var st = t + i * 0.045;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.18, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
        s.connect(bp); bp.connect(g); g.connect(dest);
        s.start(st, Math.random()); s.stop(st + 0.12);
      }
    } },
    footsteps: { min: 0.55, max: 0.85, play: function (dest, t) { thud(dest, t, 0.26, 180); } },
    hum: { min: 1.1, max: 1.1, play: function (dest, t) { ping(dest, t, 330, 0.5, 'square', 0.12); } }
  };

  function ping(dest, t, freq, dur, type, amp) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function thud(dest, t, amp, freq) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq || 150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    var nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 700;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(amp * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(nf); nf.connect(ng); ng.connect(dest);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.3);
    n.start(t, Math.random()); n.stop(t + 0.16);
  }

  function addEmitter(id, type) {
    if (!ctx || emitters[id]) return;
    var muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 9000;
    var pan = panNode();
    var gain = ctx.createGain();
    gain.gain.value = 0;
    muffle.connect(pan); pan.connect(gain); gain.connect(master);

    var em = { type: type, muffle: muffle, pan: pan, gain: gain, nodes: [], next: 0, target: 0 };
    if (CONTINUOUS[type]) em.nodes = CONTINUOUS[type](muffle);
    else if (PERIODIC[type]) em.periodic = PERIODIC[type];
    emitters[id] = em;
  }

  // vol 0..1, pan -1..1, muffled true when the source is behind the player.
  function updateEmitter(id, vol, panValue, muffled) {
    var em = emitters[id];
    if (!em) return;
    em.target = vol;
    em.gain.gain.setTargetAtTime(vol, now(), 0.12);
    setPan(em.pan, panValue);
    em.muffle.frequency.setTargetAtTime(muffled ? 480 : 9000, now(), 0.12);
  }

  function removeEmitter(id) {
    var em = emitters[id];
    if (!em) return;
    try { em.nodes.forEach(function (n) { n.stop(); }); } catch (e) { /* already stopped */ }
    try { em.gain.disconnect(); } catch (e) { /* detached */ }
    delete emitters[id];
  }

  function clearEmitters() {
    Object.keys(emitters).forEach(removeEmitter);
  }

  function tick() {
    if (!ctx) return;
    var t = now();
    for (var id in emitters) {
      var em = emitters[id];
      if (!em.periodic || em.target <= 0.012) continue;
      if (em.next === 0) em.next = t + Math.random() * 0.6;
      if (em.next <= t + 0.1) {
        em.periodic.play(em.muffle, em.next);
        var p = em.periodic;
        em.next += p.min + Math.random() * (p.max - p.min);
      }
    }
  }

  /* ---------------- one-shot effects ---------------- */

  function fx(name, panValue) {
    if (!ctx) return;
    var pan = panNode();
    var g = ctx.createGain();
    g.gain.value = 1;
    pan.connect(g); g.connect(master);
    setPan(pan, panValue || 0);
    var t = now() + 0.01;
    (FX[name] || FX.step)(pan, t);
  }

  var FX = {
    step: function (d, t) { thud(d, t, 0.2, 165); },
    bump: function (d, t) {
      thud(d, t, 0.45, 95);
      ping(d, t, 70, 0.3, 'triangle', 0.18);
    },
    door: function (d, t) { PERIODIC.creak.play(d, t); },
    locked: function (d, t) { PERIODIC.rattle.play(d, t); },
    unlock: function (d, t) {
      ping(d, t, 520, 0.18, 'square', 0.22);
      ping(d, t + 0.12, 780, 0.3, 'square', 0.22);
    },
    key: function (d, t) {
      PERIODIC.jingle.play(d, t);
      ping(d, t + 0.25, 1320, 0.5, 'triangle', 0.25);
    },
    bonus: function (d, t) {
      [1047, 1319, 1568].forEach(function (f, i) { ping(d, t + i * 0.08, f, 0.35, 'triangle', 0.26); });
    },
    trap: function (d, t) {
      var o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.55);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(d);
      o.start(t); o.stop(t + 0.65);
      thud(d, t, 0.5, 110);
    },
    switchOn: function (d, t) {
      ping(d, t, 220, 0.1, 'square', 0.3);
      ping(d, t + 0.1, 440, 0.6, 'sine', 0.28);
    },
    rumble: function (d, t) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      s.connect(lp); lp.connect(g); g.connect(d);
      s.start(t, Math.random()); s.stop(t + 1.7);
    },
    tick: function (d, t) { ping(d, t, 1200, 0.07, 'square', 0.12); },
    urgent: function (d, t) {
      ping(d, t, 880, 0.12, 'square', 0.3);
      ping(d, t + 0.18, 880, 0.12, 'square', 0.3);
    },
    win: function (d, t) {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        ping(d, t + i * 0.13, f, 0.6, 'triangle', 0.3);
      });
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 262;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + 2.5);
    },
    lose: function (d, t) {
      [392, 349, 294, 196].forEach(function (f, i) {
        ping(d, t + i * 0.22, f, 0.7, 'sawtooth', 0.22);
      });
    },
    duck: function (d, t) {
      var o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t);
      o.frequency.linearRampToValueAtTime(220, t + 0.18);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      o.connect(bp); bp.connect(g); g.connect(d);
      o.start(t); o.stop(t + 0.25);
    },
    boing: function (d, t) {
      var o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(600, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.45);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(d);
      o.start(t); o.stop(t + 0.55);
    },
    sneeze: function (d, t) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      s.connect(bp); bp.connect(g); g.connect(d);
      s.start(t, Math.random()); s.stop(t + 0.5);
    }
  };

  function shutdown() {
    clearEmitters();
    if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
  }

  return {
    supported: supported,
    init: init,
    resume: resume,
    setVolume: setVolume,
    setEnabled: setEnabled,
    addEmitter: addEmitter,
    updateEmitter: updateEmitter,
    removeEmitter: removeEmitter,
    clearEmitters: clearEmitters,
    fx: fx,
    shutdown: shutdown
  };
})();
