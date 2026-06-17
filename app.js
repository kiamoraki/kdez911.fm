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
        function update() {
            document.documentElement.style.setProperty('--tod-overlay', colorAt(pacificHours()));
        }
        update();
        setInterval(update, 60000);
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
    var volume = 0.8;
    var controls = []; // { btn, vol, persistent }

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
            if (c.vol) c.vol.value = Math.round(volume * 100);
        }
    }
    function play() {
        audio.src = STREAM;
        audio.volume = volume;
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
    function setVolume(v) { volume = Math.max(0, Math.min(1, v)); audio.volume = volume; syncUI(); }

    audio.addEventListener('playing', function () { playing = true; setLoading(false); syncUI(); });
    audio.addEventListener('waiting', function () { if (playing) setLoading(true); });
    audio.addEventListener('error', function () { playing = false; setLoading(false); syncUI(); });

    function bindControls(scope, persistent) {
        var btn = scope.querySelector('.radio-play');
        var vol = scope.querySelector('.radio-volume');
        if (!btn && !vol) return;
        var set = { btn: btn, vol: vol, persistent: !!persistent };
        controls.push(set);
        if (btn) btn.addEventListener('click', toggle);
        if (vol) vol.addEventListener('input', function () { setVolume(vol.value / 100); });
    }
    function dropDetachedControls() {
        controls = controls.filter(function (c) {
            if (c.persistent) return true;
            return (c.btn && document.body.contains(c.btn)) || (c.vol && document.body.contains(c.vol));
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
                    '<polygon class="icon-play" points="36,24 36,76 80,50"></polygon>' +
                    '<g class="icon-pause"><rect x="31" y="26" width="13" height="48"></rect><rect x="56" y="26" width="13" height="48"></rect></g>' +
                '</svg>' +
            '</button>' +
            '<div class="radio-volume-row">' +
                '<svg class="radio-volume-icon" viewBox="0 0 24 24" aria-hidden="true">' +
                    '<path class="spk" d="M3 9v6h4l5 4V5L7 9H3z"></path>' +
                    '<path class="vw" d="M16 8.5a4 4 0 0 1 0 7"></path>' +
                    '<path class="vw" d="M19 6a8 8 0 0 1 0 12"></path>' +
                '</svg>' +
                '<input class="radio-volume" type="range" min="0" max="100" value="80" aria-label="Volume">' +
            '</div>';
        document.body.appendChild(mini);
    }
    bindControls(mini, true);

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

        function makeMask(src) {
            var BG_W = 2000, BG_H = 1333, MASK_W = 600, MASK_H = 400;
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
                if (!data || mx < 0 || my < 0 || mx >= MASK_W || my >= MASK_H) return 0;
                return data[(my * MASK_W + mx) * 4 + 3];
            }
            function isInside(sx, sy) {
                if (!ready) return false;
                var m = mapping().toMask(sx, sy);
                return alphaAt(m.mx, m.my) > 128;
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
                        for (var x = 0; x < MASK_W; x += step)
                            if (data[(y * MASK_W + x) * 4 + 3] > 128) inside.push(x, y);
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

        var water = makeMask('SCOTT_LONDON_0733-1-2-controlNetH2O.png');   // fish jump here
        var gifMask = makeMask('SCOTT_LONDON_0733-1-2-controlNetGIF.png'); // gifs spawn here

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

        /* Fish dolphin-jumps (water area). */
        (function () {
            var layer = layerFish;
            var FISH_SRC = 'fish.svg', HEAD_RIGHT = true, MAX_FISH = 2;
            function rand(a, b) { return Math.random() * (b - a) + a; }
            var started = false, active = 0, fishAspect = 1.7;
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
            function animateJump(A, B, map) {
                var img = document.createElement('img');
                img.src = FISH_SRC; img.alt = ''; img.className = 'fish-jumper';
                var mobile = window.matchMedia('(max-width: 768px)').matches;
                var MIN_FW = mobile ? 18 : 36, MAX_FW = mobile ? 52 : 104;
                var baseY = (A.y + B.y) / 2;
                var depth = Math.max(0, Math.min(1, baseY / map.H));
                var fw = (MIN_FW + (MAX_FW - MIN_FW) * depth) * rand(0.92, 1.08);
                var fh = fw / fishAspect;
                img.style.width = fw + 'px'; img.style.height = fh + 'px';
                layer.appendChild(img); active++;
                var dist = Math.sqrt((B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y));
                var arc = Math.min(360, Math.max(120, dist * 0.5));
                var dur = rand(2300, 3300), EM = 0.16, SUB = 0.16, start = null;
                function frame(ts) {
                    if (start === null) start = ts;
                    var t = (ts - start) / dur;
                    if (t >= 1) { img.remove(); active--; return; }
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
                    else if (t > 1 - SUB) { setMask(img, maskCss('tail', (1 - t) / SUB)); }
                    else { setMask(img, 'none'); }
                    requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            }
            function jump() {
                var map = water.mapping();
                var A = water.pickInside(map);
                if (!A) return;
                var B = pickPointNear(map, A, map.W * 0.18, map.W * 0.36) || pickPointNear(map, A, map.W * 0.11, map.W * 0.20);
                if (!B) return;
                animateJump(A, B, map);
            }
            function tryJump() {
                if (active < MAX_FISH) jump();
                setTimeout(tryJump, rand(1400, 3800));
            }
            function startLoop() {
                if (started) return;
                started = true;
                setTimeout(tryJump, 600);
            }
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
    }
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
