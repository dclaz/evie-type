/* Evie's typing game — no libraries, no network, runs from file://
   Flow: tap to start -> word appears -> child types it -> party -> next word. */

(function () {
  "use strict";

  var KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  var PRAISE = [
    "Yay!",
    "You did it!",
    "Amazing!",
    "Great job!",
    "Woohoo!",
    "Super star!",
    "Well done!"
  ];

  var elGame = document.getElementById("game");
  var elStart = document.getElementById("start");
  var elStartBtn = document.getElementById("start-btn");
  var elPicture = document.getElementById("picture");
  var elWord = document.getElementById("word");
  var elKeyboard = document.getElementById("keyboard");
  var elFlash = document.getElementById("flash");
  var canvas = document.getElementById("confetti");
  var ctx = canvas.getContext("2d");

  var keyEls = {};        // letter -> button
  var letterEls = [];     // spans of the current word
  var current = null;     // { word, emoji }
  var index = 0;          // next letter position
  var celebrating = false;
  var started = false;
  var bag = [];           // shuffled queue so words don't repeat too soon
  var timers = [];

  /* ---------------- audio ---------------- */

  var audio = null;

  function initAudio() {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { return; }
    try {
      audio = new Ctor();
    } catch (e) {
      audio = null;
    }
  }

  function tone(freq, startAt, dur, peak, type) {
    if (!audio) { return; }
    var t0 = audio.currentTime + startAt;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function resumeAudio() {
    if (audio && audio.state === "suspended" && audio.resume) {
      audio.resume().catch(function () { /* ignore */ });
    }
  }

  function soundCorrect() {
    tone(660, 0, 0.16, 0.16, "triangle");
    tone(990, 0.06, 0.18, 0.10, "sine");
  }

  // Soft, friendly "boing" — never sounds like an error buzzer.
  function soundBounce() {
    if (!audio) { return; }
    var t0 = audio.currentTime;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(190, t0 + 0.14);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  function soundChime() {
    var notes = [523.25, 659.25, 783.99, 1046.5];   // C E G C
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], i * 0.11, 0.55, 0.15, "triangle");
    }
    tone(1318.5, 0.5, 0.7, 0.10, "sine");
  }

  /* ---------------- speech ---------------- */

  function speak(text, rate, pitch) {
    if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
      return;
    }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.rate = rate || 0.9;
      u.pitch = pitch || 1.3;
      u.volume = 1;
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is a bonus, never fatal */ }
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- confetti ---------------- */

  var particles = [];
  var rafId = 0;
  var CONFETTI_COLORS = ["#ffb3d9", "#ffd9a0", "#bfe6ff", "#c7f5cf",
                         "#e2c9ff", "#fff3a8"];

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burstConfetti() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var origins = [
      { x: w * 0.5, y: h * 0.45 },
      { x: w * 0.12, y: h * 0.75 },
      { x: w * 0.88, y: h * 0.75 }
    ];
    particles = [];
    for (var o = 0; o < origins.length; o++) {
      var n = o === 0 ? 90 : 45;
      for (var i = 0; i < n; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 4 + Math.random() * 9;
        particles.push({
          x: origins[o].x,
          y: origins[o].y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 5,
          size: 6 + Math.random() * 9,
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          spin: (Math.random() - 0.5) * 0.35,
          rot: Math.random() * Math.PI,
          life: 0,
          ttl: 90 + Math.random() * 30      // ~1.5-2.0s at 60fps
        });
      }
    }
    if (!rafId) { rafId = window.requestAnimationFrame(drawConfetti); }
  }

  function drawConfetti() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    var alive = 0;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.life > p.ttl) { continue; }
      alive++;
      p.life++;
      p.vy += 0.28;                 // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      var fade = 1 - Math.max(0, (p.life - p.ttl * 0.7) / (p.ttl * 0.3));
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (alive > 0) {
      rafId = window.requestAnimationFrame(drawConfetti);
    } else {
      rafId = 0;
      particles = [];
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function clearConfetti() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    particles = [];
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  /* ---------------- keyboard ---------------- */

  function buildKeyboard() {
    for (var r = 0; r < KEY_ROWS.length; r++) {
      var row = document.createElement("div");
      row.className = "krow";
      var letters = KEY_ROWS[r];
      for (var i = 0; i < letters.length; i++) {
        var ch = letters.charAt(i);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "key";
        btn.textContent = ch;
        btn.setAttribute("data-key", ch);
        btn.setAttribute("aria-label", ch);
        btn.addEventListener("pointerdown", onVirtualKey);
        row.appendChild(btn);
        keyEls[ch] = btn;
      }
      elKeyboard.appendChild(row);
    }
  }

  function onVirtualKey(e) {
    e.preventDefault();
    var ch = e.currentTarget.getAttribute("data-key");
    handleLetter(ch);
  }

  function highlightKey(ch) {
    for (var k in keyEls) {
      if (Object.prototype.hasOwnProperty.call(keyEls, k)) {
        keyEls[k].classList.toggle("hot", k === ch);
      }
    }
  }

  function flashKey(ch) {
    var btn = keyEls[ch];
    if (!btn) { return; }
    btn.classList.add("press");
    later(function () { btn.classList.remove("press"); }, 130);
  }

  /* ---------------- word flow ---------------- */

  function later(fn, ms) {
    var id = window.setTimeout(function () {
      timers.splice(timers.indexOf(id), 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) { window.clearTimeout(timers[i]); }
    timers = [];
  }

  function nextFromBag() {
    if (!bag.length) {
      bag = WORDS.slice();
      for (var i = bag.length - 1; i > 0; i--) {          // Fisher-Yates
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
      // Avoid an immediate repeat across bag refills.
      if (current && bag[0].word === current.word && bag.length > 1) {
        bag.push(bag.shift());
      }
    }
    return bag.shift();
  }

  function loadWord() {
    celebrating = false;
    current = nextFromBag();
    index = 0;

    elPicture.textContent = current.emoji;
    elPicture.classList.remove("celebrate");

    elWord.textContent = "";
    letterEls = [];
    for (var i = 0; i < current.word.length; i++) {
      var span = document.createElement("span");
      span.className = "letter";
      span.textContent = current.word.charAt(i);
      elWord.appendChild(span);
      letterEls.push(span);
    }
    refreshTarget();

    // Just the word — letter names are never spoken; typing answers with
    // the chime alone.
    speak(current.word, 0.85, 1.3);
  }

  function refreshTarget() {
    for (var i = 0; i < letterEls.length; i++) {
      letterEls[i].classList.toggle("next", i === index);
    }
    highlightKey(index < current.word.length ? current.word.charAt(index) : null);
  }

  function handleLetter(ch) {
    if (!started || celebrating || !current) { return; }
    resumeAudio();
    flashKey(ch);

    if (ch === current.word.charAt(index)) {
      var span = letterEls[index];
      span.classList.remove("next");
      span.classList.add("done", "pop");
      soundCorrect();
      index++;
      if (index >= current.word.length) {
        highlightKey(null);
        celebrate();
      } else {
        refreshTarget();
      }
    } else {
      // Never labelled wrong — just a friendly little bounce.
      elWord.classList.remove("nudge");
      void elWord.offsetWidth;               // restart the animation
      elWord.classList.add("nudge");
      soundBounce();
    }
  }

  function celebrate() {
    celebrating = true;

    burstConfetti();
    elPicture.classList.add("celebrate");
    elFlash.classList.add("sweep");
    for (var i = 0; i < letterEls.length; i++) {
      letterEls[i].classList.remove("pop");
      letterEls[i].classList.add("cheer");
    }

    soundChime();
    stopSpeech();
    speak(current.word, 0.85, 1.3);
    later(function () {
      speak(PRAISE[(Math.random() * PRAISE.length) | 0], 0.95, 1.5);
    }, 700);

    // Tear every effect down, then bring in the next word.
    later(function () {
      clearConfetti();
      elFlash.classList.remove("sweep");
      elPicture.classList.remove("celebrate");
      for (var j = 0; j < letterEls.length; j++) {
        letterEls[j].classList.remove("cheer", "done", "pop");
      }
      elWord.classList.remove("nudge");
      later(loadWord, 450);
    }, 2200);
  }

  /* ---------------- start ---------------- */

  function start() {
    if (started) { return; }
    started = true;
    initAudio();
    resumeAudio();
    stopSpeech();
    speak("Let's play!", 0.9, 1.4);
    elStart.classList.add("hidden");
    elGame.classList.remove("hidden");
    later(loadWord, 600);
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    if (!started) {
      if (e.key === " " || e.key === "Enter") { start(); }
      return;
    }
    var k = e.key;
    if (typeof k === "string" && k.length === 1) {
      var ch = k.toLowerCase();
      if (ch >= "a" && ch <= "z") {
        e.preventDefault();
        handleLetter(ch);
      }
    }
  });

  elStartBtn.addEventListener("click", start);
  window.addEventListener("resize", sizeCanvas);
  window.addEventListener("beforeunload", function () {
    clearTimers();
    stopSpeech();
  });

  sizeCanvas();
  buildKeyboard();

  // Exposed only so the page can be driven by an automated smoke test.
  window.__game = {
    press: handleLetter,
    state: function () {
      return {
        started: started,
        celebrating: celebrating,
        word: current ? current.word : null,
        index: index,
        hotKey: (function () {
          for (var k in keyEls) {
            if (keyEls[k].classList.contains("hot")) { return k; }
          }
          return null;
        }()),
        particles: particles.length
      };
    }
  };
}());
