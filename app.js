/* app.js — persistent across soft navigation. Loaded in <head> of every page,
   runs once per real document load. Owns the audio engine, the mini player bar,
   the time-of-day overlay, and the soft-navigation controller. */
(function () {
    'use strict';

    /* ---------- Time-of-day overlay tint (Pacific time) ----------
       night = dark blue, sunrise = pink, daylight = golden, sunset = lavender. */
    (function () {
        var STOPS = [
            [0.0,   18,  28,  68, 0.55],
            [5.0,   30,  40,  90, 0.50],
            [6.5,  255, 150, 175, 0.33],
            [8.0,  240, 205, 165, 0.30],
            [12.0, 226, 200, 152, 0.30],
            [17.0, 226, 200, 152, 0.30],
            [19.0, 185, 155, 215, 0.36],
            [20.5, 110, 105, 175, 0.44],
            [22.0,  18,  28,  68, 0.55],
            [24.0,  18,  28,  68, 0.55]
        ];
        function pacificHours() {
            try {
                var parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Los_Angeles', hour12: false,
                    hour: '2-digit', minute: '2-digit'
                }).formatToParts(new Date());
                var h = 0, m = 0;
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
                    if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
                }
                return h + m / 60;
            } catch (e) {
                var d = new Date();
                return d.getHours() + d.getMinutes() / 60;
            }
        }
        function lerp(a, b, t) { return a + (b - a) * t; }
        function colorAt(hr) {
            for (var i = 0; i < STOPS.length - 1; i++) {
                var a = STOPS[i], b = STOPS[i + 1];
                if (hr >= a[0] && hr <= b[0]) {
                    var t = (b[0] === a[0]) ? 0 : (hr - a[0]) / (b[0] - a[0]);
                    return 'rgba(' +
                        Math.round(lerp(a[1], b[1], t)) + ',' +
                        Math.round(lerp(a[2], b[2], t)) + ',' +
                        Math.round(lerp(a[3], b[3], t)) + ',' +
                        lerp(a[4], b[4], t).toFixed(3) + ')';
                }
            }
            return 'rgba(226,200,152,0.3)';
        }
        // --- Testing overrides via URL ---
        //   ?hour=N       force a fixed hour 0-24 (e.g. ?hour=6.5 sunrise, 19 sunset, 0 night)
        //   ?todcycle=S   loop the whole 24h every S seconds to preview the transitions
        var qs = location.search || '';
        var forcedHour = (function () { var m = qs.match(/[?&]hour=(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; })();
        var cycleSec = (function () { var m = qs.match(/[?&]todcycle=(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; })();
        var cycleStart = Date.now();
        function currentHours() {
            if (forcedHour != null) return forcedHour;
            if (cycleSec) return (((Date.now() - cycleStart) / (cycleSec * 1000)) % 1) * 24;
            return pacificHours();
        }
        function update() {
            document.documentElement.style.setProperty('--tod-overlay', colorAt(currentHours()));
        }
        update();
        setInterval(update, cycleSec ? 100 : 60000);
    })();

    /* ---------- Persistent audio engine ---------- */
    var STREAM = 'https://stream.kdez911.fm/listen/kdez911/radio.mp3';
    var audio = document.getElementById('radioAudio');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'radioAudio';
        audio.preload = 'none';
        document.body.appendChild(audio);
    }

    var playing = false;
    var controls = []; // { btn, persistent }

    function setLoading(on) {
        for (var i = 0; i < controls.length; i++) {
            if (controls[i].btn) controls[i].btn.classList.toggle('is-loading', on);
        }
    }
    function syncUI() {
        for (var i = 0; i < controls.length; i++) {
            var c = controls[i];
            if (c.btn) {
                c.btn.classList.toggle('is-playing', playing);
                c.btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
                c.btn.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' KDEZ 91.1 FM');
            }
        }
    }
    function play() {
        audio.src = STREAM;
        playing = true;
        setLoading(true);
        syncUI();
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function () { playing = false; setLoading(false); syncUI(); });
    }
    function pause() {
        audio.pause();
        audio.removeAttribute('src'); // stop buffering the live stream while paused
        audio.load();
        playing = false;
        setLoading(false);
        syncUI();
    }
    function toggle() { playing ? pause() : play(); }

    audio.addEventListener('playing', function () { playing = true; setLoading(false); syncUI(); });
    audio.addEventListener('waiting', function () { if (playing) setLoading(true); });
    audio.addEventListener('error', function () { playing = false; setLoading(false); syncUI(); });

    function bindControls(scope, persistent) {
        var btn = scope.querySelector('.radio-play');
        if (!btn) return;
        controls.push({ btn: btn, persistent: !!persistent });
        btn.addEventListener('click', toggle);
    }
    function dropDetachedControls() {
        controls = controls.filter(function (c) {
            if (c.persistent) return true;
            return c.btn && document.body.contains(c.btn);
        });
    }

    /* ---------- Mini player (persistent; shown on every page except the landing hero) ---------- */
    var mini = document.getElementById('miniPlayer');
    if (!mini) {
        mini = document.createElement('div');
        mini.id = 'miniPlayer';
        mini.innerHTML =
            '<button class="radio-play radio-play--mini" type="button" aria-label="Play KDEZ 91.1 FM" aria-pressed="false">' +
                '<svg class="radio-icon" viewBox="0 0 100 100" aria-hidden="true">' +
                    '<defs>' +
                        '<mask id="m-play-mini"><circle cx="50" cy="50" r="50" fill="white"/><polygon points="36,24 36,76 80,50" fill="black"/></mask>' +
                        '<mask id="m-pause-mini"><circle cx="50" cy="50" r="50" fill="white"/><rect x="31" y="26" width="13" height="48" fill="black"/><rect x="56" y="26" width="13" height="48" fill="black"/></mask>' +
                    '</defs>' +
                    '<circle class="icon-fill-play" cx="50" cy="50" r="50" fill="currentColor" mask="url(#m-play-mini)"/>' +
                    '<circle class="icon-fill-pause" cx="50" cy="50" r="50" fill="currentColor" mask="url(#m-pause-mini)"/>' +
                    '<circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="3"/>' +
                '</svg>' +
            '</button>';
        document.body.appendChild(mini);
    }
    bindControls(mini, true);

    /* ---------- Social icons (bottom-right, persistent) ---------- */
    if (!document.getElementById('bottomBar')) {
        var bottomBar = document.createElement('div');
        bottomBar.id = 'bottomBar';
        document.body.appendChild(bottomBar);
    }
    if (!document.getElementById('socialBar')) {
        var socialBar = document.createElement('div');
        socialBar.id = 'socialBar';
        socialBar.innerHTML =
            '<a href="mailto:radio@kdez911.fm" class="social-email">radio@kdez911.fm</a>' +
            '<a href="https://discord.gg/FewJefNrPg" target="_blank" rel="noopener" aria-label="Discord" class="social-icon">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                    '<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.024.015.048.034.063a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>' +
                    '<ellipse cx="8.5" cy="11.5" rx="1.25" ry="1.4" style="fill:var(--text-color)"/>' +
                    '<ellipse cx="15.5" cy="11.5" rx="1.25" ry="1.4" style="fill:var(--text-color)"/>' +
                '</svg>' +
            '</a>' +
            '<a href="https://www.instagram.com/kdez91.1fm" target="_blank" rel="noopener" aria-label="Instagram" class="social-icon">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                    '<rect x="2" y="2" width="20" height="20" rx="5.5" style="fill:var(--bg-color)"/>' +
                    '<circle cx="12" cy="12" r="4.4" style="fill:var(--text-color)"/>' +
                    '<circle cx="17.2" cy="6.8" r="1.2" style="fill:var(--text-color)"/>' +
                '</svg>' +
            '</a>';
        (document.getElementById('bottomBar') || document.body).appendChild(socialBar);
    }

    function updateMiniVisibility() {
        mini.classList.toggle('is-hidden', document.body.classList.contains('landing-page'));
    }

    /* ---------- Background animations: rainbow glitch + fish dolphin-jumps.
       Persistent — runs once here (outside the swapped .container), so it never
       restarts on soft-navigation. The layers live in <body>; CSS shows them on
       every page on mobile and only on the landing page on desktop. ---------- */
    (function () {
        function makeLayer(id, cls) {
            var el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.className = cls;
                el.setAttribute('aria-hidden', 'true');
                document.body.appendChild(el);
            }
            return el;
        }
        var layerGlitch = makeLayer('glitchLayer', 'glitch-layer');
        var layerFish = makeLayer('fishLayer', 'fish-layer');

        // Track the cover-sized background's actual position so the masks map to
        // wherever it sits in this viewport (mobile shifts it left). On resize.
        var bgPosX = 0.5, bgPosY = 0.5;
        function bgFrac(v, dflt) {
            if (!v) return dflt;
            v = ('' + v).split(',')[0].trim();
            if (v.charAt(v.length - 1) === '%') return parseFloat(v) / 100;
            if (v === 'left' || v === 'top') return 0;
            if (v === 'right' || v === 'bottom') return 1;
            if (v === 'center') return 0.5;
            return dflt;
        }
        function readBgPos() {
            var cs = getComputedStyle(document.body);
            bgPosX = bgFrac(cs.backgroundPositionX, 0.5);
            bgPosY = bgFrac(cs.backgroundPositionY, 0.5);
        }
        readBgPos();
        window.addEventListener('resize', readBgPos);

        function makeMask(src, invert) {
            var BG_W = 3008, BG_H = 2005, MASK_W = 600, MASK_H = 400;
            var data = null, inside = [], ready = false, cbs = [];
            function rand(a, b) { return Math.random() * (b - a) + a; }
            function mapping() {
                var W = window.innerWidth, H = window.innerHeight;
                var scale = Math.max(W / BG_W, H / BG_H);
                var dispW = BG_W * scale, dispH = BG_H * scale;
                var offX = (W - dispW) * bgPosX, offY = (H - dispH) * bgPosY;
                return {
                    W: W, H: H,
                    toScreen: function (mx, my) {
                        return { x: offX + (mx / MASK_W) * dispW, y: offY + (my / MASK_H) * dispH };
                    },
                    toMask: function (sx, sy) {
                        return { mx: ((sx - offX) / dispW) * MASK_W, my: ((sy - offY) / dispH) * MASK_H };
                    }
                };
            }
            function alphaAt(mx, my) {
                mx |= 0; my |= 0;
                if (!data || mx < 0 || my < 0 || mx >= MASK_W || my >= MASK_H) return invert ? 255 : 0;
                return data[(my * MASK_W + mx) * 4 + 3];
            }
            function isInside(sx, sy) {
                if (!ready) return false;
                var m = mapping().toMask(sx, sy);
                var a = alphaAt(m.mx, m.my);
                return invert ? a <= 128 : a > 128;
            }
            function pickInside(map) {
                if (!ready) return { x: rand(0, map.W), y: rand(0, map.H) };
                for (var t = 0; t < 80; t++) {
                    var idx = Math.floor(rand(0, inside.length / 2)) * 2;
                    var mx = inside[idx], my = inside[idx + 1];
                    var p = map.toScreen(mx, my);
                    if (p.x >= 0 && p.x <= map.W && p.y >= 0 && p.y <= map.H) {
                        return { x: p.x, y: p.y, mx: mx, my: my };
                    }
                }
                return null;
            }
            var img = new Image();
            img.onload = function () {
                try {
                    var c = document.createElement('canvas');
                    c.width = MASK_W; c.height = MASK_H;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, MASK_W, MASK_H);
                    data = ctx.getImageData(0, 0, MASK_W, MASK_H).data;
                    var step = 4;
                    for (var y = 0; y < MASK_H; y += step)
                        for (var x = 0; x < MASK_W; x += step) {
                            var a = data[(y * MASK_W + x) * 4 + 3];
                            if (invert ? a <= 128 : a > 128) inside.push(x, y);
                        }
                    ready = inside.length > 0;
                } catch (e) { ready = false; }
                for (var i = 0; i < cbs.length; i++) cbs[i]();
            };
            img.onerror = function () { ready = false; for (var i = 0; i < cbs.length; i++) cbs[i](); };
            img.src = src;
            return {
                mapping: mapping, isInside: isInside, pickInside: pickInside,
                onReady: function (cb) { if (ready) cb(); else cbs.push(cb); }
            };
        }

        var _maskSrc = 'img/KDEZ_MAIN_HORIZONTAL-mask.png';
        var water = makeMask(_maskSrc, false);   // opaque black = fish zone
        var gifMask = makeMask(_maskSrc, false); // opaque black = rainbow pixel zone

        /* Rainbow glitch (land area, never water); the field grows very gradually
           over hours and persists across navigation. */
        (function () {
            var layer = layerGlitch;
            var START_COUNT = 4, MAX_COUNT = 1000, PER_MINUTE = 1, RAMP_MS = 10000;
            var count = 0, startMs = 0;
            // Test mode: ?speed=N runs the accumulation N× faster (e.g. ?speed=120
            // reaches the ceiling in ~2.5 min). No param = real speed (1×).
            var SPEED = (function () {
                var m = (location.search || '').match(/[?&]speed=(\d+(?:\.\d+)?)/);
                return m ? Math.max(1, parseFloat(m[1])) : 1;
            })();
            function rand(min, max) { return Math.random() * (max - min) + min; }
            function targetCount() {
                var e = (Date.now() - startMs) * SPEED;
                if (e < RAMP_MS) return START_COUNT * (e / RAMP_MS);
                return Math.min(MAX_COUNT, START_COUNT + ((e - RAMP_MS) / 60000) * PER_MINUTE);
            }
            function progress() {
                return Math.max(0, Math.min(1, (targetCount() - START_COUNT) / (MAX_COUNT - START_COUNT)));
            }
            function lifespan() {
                var p = progress();
                return rand(6000 + 24000 * p, 16000 + 44000 * p);
            }
            // place a gif at its stored mask coordinate using the current mapping
            function placeGif(el) {
                if (el._mx == null) return;
                var map = gifMask.mapping();
                var s = map.toScreen(el._mx, el._my);
                var size = el._size;
                el.style.left = Math.min(Math.max(0, s.x - size / 2), Math.max(0, map.W - size)) + 'px';
                el.style.top = Math.min(Math.max(0, s.y - size / 2), Math.max(0, map.H - size)) + 'px';
            }
            function spawn() {
                if (count >= MAX_COUNT) return;
                var size = rand(1, 6);
                var map = gifMask.mapping();
                var p = null;
                for (var tries = 0; tries < 60; tries++) {
                    var cand = gifMask.pickInside(map);
                    if (cand && !water.isInside(cand.x, cand.y)) { p = cand; break; }
                }
                if (!p) return;
                count++;
                var el = document.createElement('span');
                el.className = 'glitch-gif';
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.animationDuration = rand(0.5, 1.1).toFixed(2) + 's';
                el.style.animationDelay = (-rand(0, 1100)).toFixed(0) + 'ms';
                el._mx = p.mx; el._my = p.my; el._size = size;
                placeGif(el);
                layer.appendChild(el);
                setTimeout(function () { el.remove(); count--; }, lifespan());
            }
            function topUp() {
                var target = targetCount();
                var attempts = 0;
                while (count < target && attempts < MAX_COUNT * 2) { spawn(); attempts++; }
            }
            gifMask.onReady(function () {
                water.onReady(function () {
                    startMs = Date.now();
                    setInterval(topUp, 700);
                });
            });

            // On viewport resize, re-map every existing gif to its land position
            // for the new viewport (the background re-covers, so the masks shift).
            // Debounced; runs after readBgPos has refreshed the background position.
            var resizeT;
            window.addEventListener('resize', function () {
                clearTimeout(resizeT);
                resizeT = setTimeout(function () {
                    var kids = layer.children;
                    for (var i = 0; i < kids.length; i++) placeGif(kids[i]);
                }, 150);
            });
        })();

        /* Fish dolphin-jumps (water area) + "feeding frenzy" chum mode. */
        (function () {
            var layer = layerFish;
            var FISH_SRC = 'fish.svg', HEAD_RIGHT = true;
            var MAX_FISH = 2, FRENZY_FISH = 60;
            function rand(a, b) { return Math.random() * (b - a) + a; }
            var started = false, active = 0, fishAspect = 1.7;
            var chum = [];        // rainbow pixels the fish are eating
            var frenzy = false;
            var fishImg = new Image();
            fishImg.onload = function () {
                if (fishImg.naturalWidth && fishImg.naturalHeight) fishAspect = fishImg.naturalWidth / fishImg.naturalHeight;
            };
            fishImg.src = FISH_SRC;
            water.onReady(startLoop);

            function pickPointNear(map, A, minD, maxD) {
                for (var t = 0; t < 120; t++) {
                    var p = water.pickInside(map);
                    if (!p) continue;
                    var dx = p.x - A.x, dy = p.y - A.y;
                    var d = Math.sqrt(dx * dx + dy * dy);
                    if (d >= minD && d <= maxD && Math.abs(dy) < maxD * 0.4) return p;
                }
                return null;
            }
            function maskCss(side, reveal) {
                var feather = 14, pct = reveal * 100;
                if ((side === 'head') === HEAD_RIGHT) {
                    var edge = 100 - pct;
                    return 'linear-gradient(to right, transparent 0%, transparent ' + Math.max(0, edge - feather) + '%, black ' + edge + '%, black 100%)';
                }
                return 'linear-gradient(to right, black 0%, black ' + pct + '%, transparent ' + Math.min(100, pct + feather) + '%, transparent 100%)';
            }
            function setMask(img, css) { img.style.webkitMaskImage = css; img.style.maskImage = css; }

            // Release a burst of rainbow chum scattered across the water area.
            function bucketOrigin() {
                var b = document.getElementById('chumBtn');
                if (!b) return { x: window.innerWidth * 0.15, y: window.innerHeight * 0.85 };
                var r = b.getBoundingClientRect();
                // burst from the mouth of the bucket
                return { x: r.left + r.width / 2, y: r.top + r.height * 0.22 };
            }
            function feedFrenzy() {
                var map = water.mapping();
                var o = bucketOrigin();
                var burst = [];
                for (var i = 0; i < 80; i++) {
                    var p = water.pickInside(map);
                    if (!p || p.mx == null) continue;
                    var size = rand(2, 5);
                    var el = document.createElement('span');
                    el.className = 'glitch-gif';
                    el.style.width = size + 'px';
                    el.style.height = size + 'px';
                    el.style.animationDuration = rand(0.35, 0.8).toFixed(2) + 's';
                    el.style.animationDelay = (-rand(0, 800)).toFixed(0) + 'ms';
                    el._mx = p.mx; el._my = p.my; el._size = size;
                    el.style.left = (p.x - size / 2) + 'px';
                    el.style.top = (p.y - size / 2) + 'px';
                    // start crammed inside the bucket (small), then burst out to the water target
                    el.style.transform = 'translate(' + (o.x - p.x).toFixed(1) + 'px,' + (o.y - p.y).toFixed(1) + 'px) scale(0.2)';
                    el.style.transition = 'transform ' + rand(0.5, 0.95).toFixed(2) + 's cubic-bezier(0.12,0.8,0.28,1)';
                    el.style.transitionDelay = (i * 3) + 'ms';
                    layer.appendChild(el);
                    chum.push(el);
                    burst.push(el);
                }
                // one frame later, release them — they fly from the bucket out to their spots
                requestAnimationFrame(function () {
                    for (var j = 0; j < burst.length; j++) burst[j].style.transform = 'translate(0,0) scale(1)';
                });
                frenzy = true;
                for (var k = 0; k < 8; k++) {
                    (function (delay) {
                        setTimeout(function () { if (frenzy && active < FRENZY_FISH) jump(); }, delay);
                    }(k * rand(200, 500)));
                }
            }
            // Attention teaser: if nobody clicks the bucket, give it a shake and let a
            // single pellet fly out for one fish to snap up — a hint at what CHUM does.
            function teaseOne(b) {
                b.classList.add('chum-nudge');
                setTimeout(function () { b.classList.remove('chum-nudge'); }, 700);
                var map = water.mapping();
                var o = bucketOrigin();
                var p = water.pickInside(map);
                if (!p || p.mx == null) return;
                var size = rand(8, 12);
                var el = document.createElement('span');
                el.className = 'glitch-gif';
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.animationDuration = rand(0.35, 0.8).toFixed(2) + 's';
                el.style.animationDelay = (-rand(0, 800)).toFixed(0) + 'ms';
                el._mx = p.mx; el._my = p.my; el._size = size;
                el.style.left = (p.x - size / 2) + 'px';
                el.style.top = (p.y - size / 2) + 'px';
                el.style.transform = 'translate(' + (o.x - p.x).toFixed(1) + 'px,' + (o.y - p.y).toFixed(1) + 'px) scale(0.2)';
                el.style.transition = 'transform 0.7s cubic-bezier(0.12,0.8,0.28,1)';
                layer.appendChild(el);
                requestAnimationFrame(function () { el.style.transform = 'translate(0,0) scale(1)'; });
                // a lone fish leaps up to eat the single pellet once it has settled
                setTimeout(function () {
                    var m = water.mapping();
                    var B = chumPos(el, m);
                    var A = pickPointNear(m, B, m.W * 0.06, m.W * 0.22) || water.pickInside(m);
                    if (!A) { el.remove(); return; }
                    animateJump(A, B, m, el);
                }, 700);
            }
            function chumPos(el, map) {
                var s = map.toScreen(el._mx, el._my); // keep in sync with the viewport
                el.style.left = (s.x - el._size / 2) + 'px';
                el.style.top = (s.y - el._size / 2) + 'px';
                return s;
            }

            function animateJump(A, B, map, targetEl) {
                var img = document.createElement('img');
                img.src = FISH_SRC; img.alt = ''; img.className = 'fish-jumper';
                var mobile = window.matchMedia('(max-width: 768px)').matches;
                var MIN_FW = mobile ? 12 : 24, MAX_FW = mobile ? 36 : 72;
                var baseY = (A.y + B.y) / 2;
                var depth = Math.max(0, Math.min(1, baseY / map.H));
                var fw = (MIN_FW + (MAX_FW - MIN_FW) * depth) * rand(0.92, 1.08);
                var fh = fw / fishAspect;
                img.style.width = fw + 'px'; img.style.height = fh + 'px';
                layer.appendChild(img); active++;
                var dist = Math.sqrt((B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y));
                var arc = Math.min(280, Math.max(80, dist * 0.42));
                var dur = targetEl ? rand(1500, 2400) : rand(2500, 3500); // frenzy jumps are quicker
                var EM = 0.16, SUB = 0.16, start = null, ate = false;
                var rainbow = null;
                function frame(ts) {
                    if (start === null) start = ts;
                    var t = (ts - start) / dur;
                    if (t >= 1) { if (rainbow) rainbow.remove(); img.remove(); active--; return; }
                    var x = A.x + (B.x - A.x) * t;
                    var y = (A.y + (B.y - A.y) * t) - arc * Math.sin(Math.PI * t);
                    var vx = (B.x - A.x);
                    var vy = (B.y - A.y) - arc * Math.PI * Math.cos(Math.PI * t);
                    var pos = 'translate(' + (x - fw / 2) + 'px,' + (y - fh / 2) + 'px) ';
                    if (vx >= 0) {
                        img.style.transform = pos + 'rotate(' + (Math.atan2(vy, vx) * 180 / Math.PI) + 'deg)';
                    } else {
                        img.style.transform = pos + 'rotate(' + (Math.atan2(-vy, -vx) * 180 / Math.PI) + 'deg) scaleX(-1)';
                    }
                    if (t < EM) { setMask(img, maskCss('head', t / EM)); }
                    // chum-chasers keep the nose showing until they actually eat, then
                    // submerge-fade just like normal jumps do at the end of the arc
                    else if (t > 1 - SUB && (!targetEl || ate)) { setMask(img, maskCss('tail', (1 - t) / SUB)); }
                    else { setMask(img, 'none'); }
                    // eat the chum when the fish's nose (front of the sprite, along its
                    // heading) actually reaches it — landing fallback so a fast descent
                    // can't skip past one between frames
                    if (targetEl && !ate) {
                        var vlen = Math.sqrt(vx * vx + vy * vy) || 1;
                        var noseX = x + (fw * 0.35) * (vx / vlen);
                        var noseY = y + (fw * 0.35) * (vy / vlen);
                        var dnx = noseX - B.x, dny = noseY - B.y;
                        var hitR = (targetEl._size || 10) / 2;
                        if (dnx * dnx + dny * dny < hitR * hitR || t > 0.98) {
                            targetEl.remove();
                            ate = true;
                            img.style.opacity = '0';
                            rainbow = document.createElement('div');
                            rainbow.className = 'fish-ghost';
                            rainbow.style.width = fw + 'px';
                            rainbow.style.height = fh + 'px';
                            var eatAngle = vx >= 0
                                ? (Math.atan2(vy, vx) * 180 / Math.PI)
                                : (Math.atan2(-vy, -vx) * 180 / Math.PI);
                            rainbow.style.transform = 'rotate(' + eatAngle.toFixed(1) + 'deg)' + (vx < 0 ? ' scaleX(-1)' : '');
                            rainbow.style.animationDuration = rand(0.3, 0.7).toFixed(2) + 's';
                            rainbow.style.animationDelay = (-rand(0, 800)).toFixed(0) + 'ms';
                            layer.appendChild(rainbow);
                        }
                    }
                    if (rainbow) {
                        rainbow.style.left = (x - fw / 2) + 'px';
                        rainbow.style.top  = (y - fh / 2) + 'px';
                        rainbow.style.opacity = t > 1 - SUB ? ((1 - t) / SUB).toFixed(3) : '1';
                    }
                    requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            }

            function jump() {
                var map = water.mapping();
                if (frenzy) {
                    if (!chum.length) { frenzy = false; } // all eaten — settle back to normal
                    else {
                        var idx = Math.floor(rand(0, chum.length));
                        var target = chum[idx];
                        var B = chumPos(target, map);  // land right on the chum pixel
                        var A = pickPointNear(map, B, map.W * 0.06, map.W * 0.22) || water.pickInside(map);
                        if (!A) return;                // retry next tick; target stays
                        chum.splice(idx, 1);           // claim it (removed on landing)
                        animateJump(A, B, map, target);
                        return;
                    }
                }
                var A = water.pickInside(map);
                if (!A) return;
                var B = pickPointNear(map, A, map.W * 0.28, map.W * 0.50) || pickPointNear(map, A, map.W * 0.18, map.W * 0.36);
                if (!B) return;
                animateJump(A, B, map, null);
            }
            function tryJump() {
                var cap = frenzy ? FRENZY_FISH : MAX_FISH;
                if (active < cap) jump();
                setTimeout(tryJump, frenzy ? rand(250, 600) : rand(1400, 3800));
            }
            function startLoop() {
                if (started) return;
                started = true;
                setTimeout(tryJump, 600);
            }

            // Chum button (bottom-left) — triggers a feeding frenzy.
            var btn = document.getElementById('chumBtn');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'chumBtn';
                btn.type = 'button';
                btn.innerHTML =
                    '<svg class="chum-bucket" viewBox="0 0 24 24" aria-hidden="true">' +
                        '<path class="chum-handle" d="M6 7 Q12 -1 18 7" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>' +
                        '<path class="chum-body" d="M5.1 7 L18.9 7 Q19.7 7 19.5 7.8 L17 20.7 Q16.8 21.5 16 21.5 L8 21.5 Q7.2 21.5 7 20.7 L4.5 7.8 Q4.3 7 5.1 7 Z" stroke="currentColor" stroke-width="1"/>' +
                    '</svg>' +
                    '<span class="chum-label">CHUM</span>';
                btn.setAttribute('aria-label', 'Release chum — feeding frenzy');
                (document.getElementById('bottomBar') || document.body).appendChild(btn);
            }
            btn.addEventListener('click', function () { water.onReady(feedFrenzy); });

            if (false) { // canvas removed
                (function initChumPixels() {
                    var SCALE = 200 / 24;
                    var PS = 9;
                    var COLORS = ['#ff45e6', '#6c00fb', '#df0d41', '#fa4a16', '#f8cc00', '#1ca06e', '#191eec'];
                    var M = 120;
                    var W = 200 + M * 2;
                    var dpr = Math.min(window.devicePixelRatio || 1, 2);
                    var TAU = Math.PI * 2;

                    var cv = document.createElement('canvas');
                    cv.width = W * dpr;
                    cv.height = W * dpr;
                    cv.style.cssText = 'position:absolute;top:-' + M + 'px;left:-' + M + 'px;width:' + W + 'px;height:' + W + 'px;pointer-events:none;z-index:1;';
                    btn.insertBefore(cv, btn.firstChild);

                    var ctx = cv.getContext('2d');
                    ctx.scale(dpr, dpr);
                    ctx.translate(M, M);

                    var TY = 7 * SCALE, BY = 21.5 * SCALE;
                    var TL = 4.3 * SCALE, TR = 19.7 * SCALE;
                    var BL = 7.2 * SCALE, BR = 16.8 * SCALE;
                    var BCX = (TL + TR) / 2, BCY = (TY + BY) / 2;

                    function lx(y) { return TL + (BL - TL) * (y - TY) / (BY - TY); }
                    function rx(y) { return TR + (BR - TR) * (y - TY) / (BY - TY); }
                    function inside(x, y) { return y >= TY && y <= BY && x >= lx(y) && x <= rx(y); }

                    var pixels = [];
                    for (var px = TL; px < TR - PS; px += 15) {
                        for (var py = TY + 28; py < BY - PS; py += 15) {
                            if (inside(px + PS * 0.5, py + PS * 0.5)) {
                                var sz = 4 + Math.floor(Math.random() * 11); // size 4–14
                                pixels.push({ hx: px, hy: py, x: px, y: py, vx: 0, vy: 0, color: '', size: sz, offset: Math.random() * TAU });
                            }
                        }
                    }

                    var busy = false, rafId = null, angle = 0;

                    function pixelColor(p) {
                        return COLORS[Math.floor(((angle + p.offset) / TAU * COLORS.length) % COLORS.length)];
                    }

                    function spinDraw() {
                        ctx.clearRect(-M, -M, W, W);
                        angle = (angle + 0.008) % TAU;
                        for (var i = 0; i < pixels.length; i++) {
                            var p = pixels[i];
                            ctx.fillStyle = pixelColor(p);
                            ctx.fillRect(Math.round(p.hx), Math.round(p.hy), p.size, p.size);
                        }
                        if (!busy) rafId = requestAnimationFrame(spinDraw);
                    }
                    spinDraw();

                    btn.addEventListener('click', function () {
                        if (busy) return;
                        busy = true;
                        if (rafId) cancelAnimationFrame(rafId);

                        var G = 0.38, phase = 1, t = 0;

                        for (var i = 0; i < pixels.length; i++) {
                            var p = pixels[i];
                            p.x = p.hx; p.y = p.hy;
                            p.color = pixelColor(p); // snapshot current color
                            var dx = p.hx + p.size / 2 - BCX, dy = p.hy + p.size / 2 - BCY;
                            var len = Math.sqrt(dx * dx + dy * dy) || 1;
                            var spd = 5 + Math.random() * 9;
                            p.vx = (dx / len) * spd + (Math.random() - 0.5) * 5;
                            p.vy = (dy / len) * spd - 1 - Math.random() * 5;
                        }

                        function step() {
                            ctx.clearRect(-M, -M, W, W);
                            t++;

                            if (phase === 1) {
                                var gone = true;
                                for (var i = 0; i < pixels.length; i++) {
                                    var p = pixels[i];
                                    p.x += p.vx; p.y += p.vy; p.vy += G;
                                    if (p.y < 220) gone = false;
                                    ctx.fillStyle = p.color;
                                    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
                                }
                                if (gone || t > 100) {
                                    phase = 2; t = 0;
                                    for (var i = 0; i < pixels.length; i++) {
                                        var p = pixels[i];
                                        p.x = p.hx + (Math.random() - 0.5) * 4;
                                        p.y = TY - 10 - Math.random() * 80;
                                        p.vx = 0; p.vy = 0.5;
                                    }
                                }
                            } else if (phase === 2) {
                                if (t >= 30) { phase = 3; t = 0; }
                            } else {
                                var done = true;
                                for (var i = 0; i < pixels.length; i++) {
                                    var p = pixels[i];
                                    angle = (angle + 0.008 / pixels.length) % TAU;
                                    p.color = pixelColor(p);
                                    if (p.y < p.hy) {
                                        p.vy += G * 0.7;
                                        p.y += p.vy;
                                        p.x += (p.hx - p.x) * 0.08;
                                        if (p.y >= p.hy) { p.x = p.hx; p.y = p.hy; }
                                        else done = false;
                                    }
                                    ctx.fillStyle = p.color;
                                    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
                                }
                                if (done) { busy = false; spinDraw(); return; }
                            }

                            rafId = requestAnimationFrame(step);
                        }
                        step();
                    });
                })();
            }

            // Ambient nudge: first at 5s, then sporadically (~once a minute) the bucket
            // shakes and spits out a single pellet for a fish to grab. Skips a tick while
            // a real frenzy is underway or when the bucket isn't on screen.
            function scheduleTease(delay) {
                setTimeout(function () {
                    water.onReady(function () {
                        var b = document.getElementById('chumBtn');
                        if (b && b.offsetParent !== null && !frenzy) teaseOne(b);
                    });
                    scheduleTease(rand(50000, 70000));
                }, delay);
            }
            scheduleTease(5000);
        })();
    })();

    /* ---------- Soft navigation ---------- */
    function isInternalLink(a) {
        if (!a) return false;
        if (a.target && a.target !== '' && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        var href = a.getAttribute('href');
        if (!href) return false;
        if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return false;
        if (a.origin !== location.origin) return false; // external host
        var path = a.pathname || '';
        return /\.html?$/.test(path) || path === '/';
    }

    function runTeardown() {
        var t = window.KDEZ_TEARDOWN;
        if (t && t.length) {
            for (var i = 0; i < t.length; i++) { try { t[i](); } catch (e) {} }
        }
        window.KDEZ_TEARDOWN = [];
    }

    function executeScripts(container) {
        var scripts = container.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
            var old = scripts[i];
            var s = document.createElement('script');
            for (var j = 0; j < old.attributes.length; j++) {
                s.setAttribute(old.attributes[j].name, old.attributes[j].value);
            }
            if (!old.src) s.textContent = old.textContent;
            old.parentNode.replaceChild(s, old);
        }
    }

    function markActiveNav() {
        var path = location.pathname;
        var links = document.querySelectorAll('.chaotic-menu .menu-item');
        for (var i = 0; i < links.length; i++) {
            if (links[i].pathname === path) {
                links[i].setAttribute('aria-current', 'page');
            } else {
                links[i].removeAttribute('aria-current');
            }
        }
    }

    function swapTo(html, url, push) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var next = doc.querySelector('.container');
        var cur = document.querySelector('.container');
        if (!next || !cur) { location.href = url; return; } // fallback to a hard load

        runTeardown();
        document.body.className = doc.body.className;
        document.title = doc.title;
        cur.replaceWith(next);
        executeScripts(next); // run forms / home.js in the freshly inserted content
        if (push) history.pushState({}, '', url);
        window.scrollTo(0, 0);

        dropDetachedControls();
        bindControls(next, false);
        updateMiniVisibility();
        syncUI();
        markActiveNav();
        window.dispatchEvent(new CustomEvent('kdez:nav-swapped'));
    }

    function navigate(url, push) {
        fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.text(); })
            .then(function (html) { swapTo(html, url, push); })
            .catch(function () { location.href = url; });
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest ? e.target.closest('a') : null;
        if (!a || !isInternalLink(a)) return;
        e.preventDefault();
        if (a.href === location.href) return;
        navigate(a.href, true);
    });

    window.addEventListener('popstate', function () { navigate(location.href, false); });

    /* ---------- Initial bind ---------- */
    function init() {
        var c = document.querySelector('.container');
        if (c) bindControls(c, false);
        updateMiniVisibility();
        syncUI();
        markActiveNav();
    }
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();

// Clip nav lines at the radio-player circle (homepage) or text-content left edge (subpages).
(function () {
    // Cache the homepage stop values from the first load so SPA nav back restores
    // the exact same positions rather than recomputing from a different layout state.
    var homepageCache = null; // array of { prop: value } indexed by menu-item order

    function computeHomepage(btn) {
        var br = btn.getBoundingClientRect();
        var cx = br.left + br.width / 2;
        var cy = br.top  + br.height / 2;
        var r  = br.width / 2;
        var cache = [];

        document.querySelectorAll('.menu-item').forEach(function (item, i) {
            var ir = item.getBoundingClientRect();
            var stops = {};

            function setStop(prop, lineY) {
                var dy = lineY - cy;
                if (Math.abs(dy) < r) {
                    var ix = cx - Math.sqrt(r * r - dy * dy);
                    var extend = 8 + (Math.abs(dy) / r) * 38;
                    stops[prop] = (ir.right - ix - extend).toFixed(1) + 'px';
                    item.style.setProperty(prop, stops[prop]);
                } else {
                    stops[prop] = null;
                    item.style.removeProperty(prop);
                }
            }

            if (item.classList.contains('has-line'))
                setStop('--line-stop-mid',    ir.top + ir.height / 2);
            if (item.classList.contains('has-line-bottom'))
                setStop('--line-stop-bottom', ir.bottom - 10);
            if (item.classList.contains('has-lines-tb')) {
                setStop('--line-stop-top',    ir.top    - 5);
                setStop('--line-stop-bottom', ir.bottom - 5);
            }
            cache[i] = stops;
        });

        homepageCache = cache;
    }

    function restoreHomepage() {
        document.querySelectorAll('.menu-item').forEach(function (item, i) {
            var stops = homepageCache[i];
            if (!stops) return;
            for (var prop in stops) {
                if (stops[prop] !== null) item.style.setProperty(prop, stops[prop]);
                else item.style.removeProperty(prop);
            }
        });
    }

    function clipLines() {
        var btn = document.getElementById('radioToggle');

        if (!btn) {
            // Subpages: stop lines at the left edge of the text-content box.
            var tc = document.querySelector('.content-area .text-content');
            if (!tc) return;
            var stopX = tc.getBoundingClientRect().left;
            document.querySelectorAll('.menu-item').forEach(function (item) {
                var ir = item.getBoundingClientRect();
                var val = (ir.right - stopX).toFixed(1) + 'px';
                if (item.classList.contains('has-line'))
                    item.style.setProperty('--line-stop-mid',    val);
                if (item.classList.contains('has-line-bottom'))
                    item.style.setProperty('--line-stop-bottom', val);
                if (item.classList.contains('has-lines-tb')) {
                    item.style.setProperty('--line-stop-top',    val);
                    item.style.setProperty('--line-stop-bottom', val);
                }
            });
            return;
        }

        // Homepage: restore cached values if available, else compute & cache.
        if (homepageCache) {
            restoreHomepage();
        } else {
            computeHomepage(btn);
        }
    }

    function setup() {
        clipLines();
        window.addEventListener('resize', function () {
            homepageCache = null; // invalidate so next homepage visit recomputes
            clipLines();
        });
        window.addEventListener('kdez:nav-swapped', function () { clipLines(); });
    }

    if (document.readyState !== 'loading') setup();
    else document.addEventListener('DOMContentLoaded', setup);
})();
