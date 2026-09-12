/* Local particle and interaction layer.
   This file is self-contained: no remote JavaScript, renderer, or particle
   service is used. The hero is an original multi-layer particle field. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var q = function (selector, parent) { return (parent || document).querySelector(selector); };
  var qa = function (selector, parent) { return Array.prototype.slice.call((parent || document).querySelectorAll(selector)); };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function smoothstep(value) { value = clamp(value, 0, 1); return value * value * (3 - 2 * value); }
  function random(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- theme (light / dark) ---------- */
  // The source-site CSS resolves semantic colours from `.light`/`.dark`
  // classes: `:root:not(.light)` and `:where(.dark)` are dark, and
  // `:where(.light)` is light. Because those rules match any element, the
  // body's own `dark` class must be removed before `html.light` can win.
  var currentTheme = 'dark';
  try {
    var savedTheme = localStorage.getItem('geobyte-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') currentTheme = savedTheme;
  } catch (e) {}

  // The SSR markup scopes a few components to dark mode with their own
  // `.dark` class (the header bar is one). :where(.dark) matches any element,
  // so those containers re-declare the dark palette even when html is light
  // — capture them up front and keep their scope in sync with the theme.
  var darkScoped = qa('.dark').filter(function (el) { return el !== document.body; });

  function applyTheme(theme, persist) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    root.classList.toggle('light', currentTheme === 'light');
    if (document.body) {
      document.body.classList.toggle('dark', currentTheme !== 'light');
      document.body.classList.toggle('light', currentTheme === 'light');
    }
    darkScoped.forEach(function (el) {
      el.classList.toggle('dark', currentTheme !== 'light');
      el.classList.toggle('light', currentTheme === 'light');
    });
    var label = currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
    qa('.local-theme-btn').forEach(function (button) {
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(currentTheme === 'light'));
    });
    if (persist) { try { localStorage.setItem('geobyte-theme', currentTheme); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('geobyte:theme', { detail: { theme: currentTheme } }));
  }
  applyTheme(currentTheme, false);

  // Mirror the header toggle into the mobile navigation drawer so the theme
  // is reachable on small screens too.
  var headerThemeButton = q('.local-theme-btn');
  var mobileNav = q('#mobileNav');
  if (headerThemeButton && mobileNav) {
    var drawerLinks = q('[data-testid="mobile-nav-scroll-region"] ul', mobileNav);
    if (drawerLinks) {
      var themeRow = document.createElement('div');
      themeRow.className = 'local-mobile-theme-row';
      var mobileClone = headerThemeButton.cloneNode(true);
      mobileClone.removeAttribute('id');
      themeRow.appendChild(mobileClone);
      drawerLinks.insertAdjacentElement('afterend', themeRow);
      applyTheme(currentTheme, false);
    }
  }

  // Delegated so header and mobile-nav buttons share one handler.
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('.local-theme-btn');
    if (!trigger) return;
    applyTheme(currentTheme === 'light' ? 'dark' : 'light', true);
  });

  var menuButton = q('#menuBtn');
  var mobileNav = q('#mobileNav');
  if (menuButton && mobileNav) {
    menuButton.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('open');
      mobileNav.setAttribute('aria-hidden', String(!open));
      menuButton.setAttribute('aria-expanded', String(open));
    });
    qa('a', mobileNav).forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
        menuButton.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- shape construction ---------- */
  function cubic(t, p0, p1, p2, p3) {
    var mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    };
  }

  // A continuous, deliberately asymmetric trajectory so the number reads as
  // an energetic spiral rather than a font glyph.
  function sixPath(t) {
    var split = .405;
    if (t < split) {
      return cubic(t / split,
        { x: .50, y: -.88 }, { x: .05, y: -1.12 },
        { x: -.59, y: -.40 }, { x: -.37, y: .13 }
      );
    }
    var centerX = .08;
    var centerY = .33;
    var radius = .48;
    var startAngle = Math.atan2(.13 - centerY, -.37 - centerX);
    var angle = startAngle - (t - split) / (1 - split) * Math.PI * 2.12;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  }

  function sixTangent(t) {
    var before = sixPath(clamp(t - .002, 0, 1));
    var after = sixPath(clamp(t + .002, 0, 1));
    var dx = after.x - before.x;
    var dy = after.y - before.y;
    var length = Math.max(.0001, Math.hypot(dx, dy));
    return { x: dx / length, y: dy / length, nx: -dy / length, ny: dx / length };
  }

  function knotPath(t, lane) {
    var angle = t * Math.PI * 2;
    var petal = .12 * Math.sin(angle * 3 + lane * Math.PI * 2);
    var radius = .62 + petal;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .88 };
  }

  function cursorPath(t, lane) {
    // Pointer perimeter, sampled continuously. It only needs to be a clear
    // scroll-cue shape, not a branded mark.
    var vertices = [
      { x: -.28, y: -.72 }, { x: .20, y: -.12 }, { x: .00, y: -.12 },
      { x: .23, y: .39 }, { x: .04, y: .48 }, { x: -.19, y: -.03 }
    ];
    var scaled = t * vertices.length;
    var index = Math.floor(scaled) % vertices.length;
    var next = vertices[(index + 1) % vertices.length];
    var current = vertices[index];
    var local = scaled - Math.floor(scaled);
    var x = current.x + (next.x - current.x) * local;
    var y = current.y + (next.y - current.y) * local;
    return { x: x + (lane - .5) * .085, y: y + (lane - .5) * .085 };
  }

  function normalGaussian(rand) {
    var a = Math.max(.0001, rand());
    var b = rand();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(Math.PI * 2 * b);
  }

  function makeSixField(count, seed) {
    var rand = random(seed);
    var points = [];
    for (var i = 0; i < count; i++) {
      var type = i / count;
      var t = rand();
      var base = sixPath(t);
      var tangent = sixTangent(t);
      var distribution = rand();
      var spread;
      var layer;

      if (distribution < .54) {
        spread = normalGaussian(rand) * (.014 + rand() * .034);
        layer = 'core';
      } else if (distribution < .86) {
        spread = normalGaussian(rand) * (.042 + rand() * .085);
        layer = 'cloud';
      } else {
        spread = normalGaussian(rand) * (.12 + rand() * .20);
        layer = 'dust';
      }

      // Each point follows the continuous six but has its own longitudinal
      // slip. This gives the flow volume rather than a dotted contour.
      var along = normalGaussian(rand) * (layer === 'core' ? .008 : .026);
      var x = base.x + tangent.nx * spread + tangent.x * along;
      var y = base.y + tangent.ny * spread + tangent.y * along;
      var target = knotPath(t, rand());
      var hueRoll = rand();
      points.push({
        x: x, y: y, z: normalGaussian(rand) * (layer === 'dust' ? .28 : .16),
        tx: target.x, ty: target.y,
        t: t, nx: tangent.nx, ny: tangent.ny, ax: tangent.x, ay: tangent.y,
        phase: rand() * Math.PI * 2, speed: .45 + rand() * .95,
        size: layer === 'core' ? .55 + Math.pow(rand(), 1.8) * 1.7 : .25 + Math.pow(rand(), 1.65) * 1.25,
        brightness: layer === 'core' ? .72 + rand() * .28 : layer === 'cloud' ? .34 + rand() * .48 : .13 + rand() * .34,
        hue: hueRoll > .93 ? 2 : hueRoll > .76 ? 1 : 0,
        layer: layer,
        repel: .7 + rand() * .9
      });
    }
    return points;
  }

  /* ---------- real-world coastline polygons (lon,lat pairs) ----------
     Approximate mainland outlines for the seven continents plus major
     islands, so the particle globe reads as Earth, not an abstract ball. */
  var LAND_POLYS = [
    // North America (mainland, incl. Central America)
    [-166,68.5,-156,71.3,-141,69.7,-130,70.2,-120,69.5,-110,68.5,-102,68.3,-96,68.6,-90,67,-85,64.5,-82,62.5,-78,62,-73,62.2,-68,60.5,-64,59.3,-60,55.8,-56,52.3,-60,50,-66,49,-64,45.8,-70,43.6,-74,40.3,-76,37.2,-76,34.6,-80.5,32,-80.2,26.9,-81.2,25.2,-84,30,-90,29.2,-96,28.4,-97.6,24.2,-95,18.8,-90,19.2,-87.2,21.4,-88.5,15.8,-84,10,-79.5,9.4,-77.2,8.6,-80,7.3,-83,8.6,-85.5,10.2,-87.5,13,-91.5,14.2,-95.5,15.8,-97.5,16.5,-101,18.2,-105.4,20.4,-110,24.5,-113.2,28,-117.2,32.6,-121,35.4,-124.2,40.2,-124.6,46.4,-123,48.4,-127,51,-131.5,54.4,-136.5,58.4,-141.5,60.6,-146.5,61,-152.5,59.6,-158.5,56.6,-164.5,55.2,-160.5,58.8,-165.5,61.2,-166.5,64.5],
    // South America
    [-77.2,8.6,-75.2,11,-71.5,12.4,-68,11.4,-63,10.7,-60,9.3,-55,5.8,-51,4.2,-50,.5,-44.5,-2.8,-38.5,-4.2,-34.9,-6.5,-35.5,-9.5,-39,-13.5,-39.2,-17.8,-40.8,-22,-48.3,-25.8,-48.7,-28.6,-53.4,-34,-57.6,-38.3,-62.2,-38.9,-62.3,-41,-65.3,-45,-65.8,-47.5,-68.6,-52.2,-66.5,-53.5,-65.8,-54.8,-67.3,-55.9,-70.2,-55.4,-72.2,-56.0,-74.2,-55.4,-73.2,-52.2,-73.6,-49.5,-73.4,-44,-72.8,-40,-71.8,-33.5,-70.4,-26,-70.3,-18.4,-75.5,-14.6,-78.9,-8,-81.2,-6,-80.4,-2.4,-80,1.5,-77.8,4,-77.4,6.6],
    // Africa
    [-5.9,35.8,3,36.9,10.2,37.3,11.1,33.6,15.2,32.4,20.1,30.9,25.2,31.7,30,31.5,32.6,31.2,34.2,28.5,35.6,23.5,37.2,21,38.6,18.2,41.2,14.7,43.4,11.6,47.6,11.2,51.2,11.8,50.5,8.5,46.5,4.5,43.5,1.8,41,-2,39.4,-6.5,40.2,-10.5,39.2,-15.5,36.6,-18.2,35.2,-22.2,33.2,-26.2,30.8,-30,27,-33.5,22,-34.8,18.8,-34.6,18.2,-33.9,17.5,-32,16.4,-28.8,14.4,-24,11.9,-18.3,13.4,-12.4,12,-6.2,9.2,-1.2,9.6,3.6,6.6,4.3,2.2,6.3,-2.8,5.1,-8,4.4,-13,7.6,-17,14.8,-16.4,19.6,-17.2,21,-15,25.2,-13,27.8,-9.8,31.2,-6,35.2],
    // Eurasia (Europe + Asia as one continuous landmass)
    [-9.6,38.7,-8.8,41.9,-9.4,43.1,-4.2,43.6,-1.5,43.8,-1.2,46.2,-2.6,47.4,.2,49.4,1.6,50.9,3.6,51.4,4.8,52.9,7,53.6,8.6,55.4,9.6,57.7,10.8,56.2,10.2,54.6,12.6,54.5,14.2,53.9,17,54.8,19.6,54.5,20.9,55.7,21.1,57,23.6,56.9,23.9,59.1,26.6,59.7,29.8,59.9,27.8,60.5,22.6,60.4,21.4,62.9,24.7,65.6,21.9,64.9,18.6,62.6,17.4,61,18.8,59.6,16.6,58.2,14.2,55.6,12.9,55.5,11.2,58.4,10.6,59.6,7.2,58.1,5.4,59.6,5.2,62,8.2,63.4,11.2,65.1,14.2,67.6,17.2,68.9,21.2,70.2,25.2,71.1,29.2,70.6,31.2,69.8,33.2,69.6,37.2,68.2,37,66.6,34.6,65.2,37.2,64.6,40.2,64.8,44.2,66.3,44.6,68.2,48.6,68,53.6,68.8,60.2,69.5,66.2,69,70.2,68.4,72.2,71.8,78.2,72.4,82.2,73.2,87.2,75.4,95.2,76.2,102.2,77.4,106.2,77,112.2,76,114.2,73.8,123.2,73.4,130.2,72.4,139.2,73.2,146.2,72.2,152.2,71,160.2,70.2,168.2,69.8,176.2,68.4,179,66.6,176.5,65.2,172.2,64.6,170.6,63,173.2,62.8,178.2,62.6,173.2,61.4,166.2,60.4,163.2,58.4,162.2,56.4,160.4,53,156.7,50.9,155.6,53.2,155.8,56,156.6,58.6,152.2,59.4,147.2,59.4,141.6,58.6,137.2,54.6,140.6,52.4,140.8,49.6,137.6,47.6,134.6,45.2,132.2,43.6,130.6,42.4,129.4,38.8,129.4,36.2,127.6,34.4,126.4,36.1,126.6,37.7,125.4,38.8,124.4,39.8,122.2,39.6,121.6,38.9,117.8,38.8,119.2,34.9,121.6,32.4,121.9,31,120.2,27.6,116.8,23.4,113.2,22,110.4,20.4,108.2,18.6,106.8,15.6,109.3,12.9,106.8,10.4,104.8,10.1,103.6,10.6,100.6,13.4,99.6,10.6,100.4,7.1,103.5,1.4,101.2,4.6,98.6,9.6,97.6,15.6,94.6,17.6,91.6,22.6,89.6,21.9,86.9,20.4,83.6,17.6,80.3,15.8,80.2,12.9,79.9,10.3,77.4,8.1,76.1,11.6,73.2,17.6,72.6,21.6,69.2,22.4,68.2,23.7,66.8,25.2,61.8,25.2,57.2,25.7,56.8,27.2,53.8,26.6,51.6,28.1,48.9,29.9,47.9,29.5,50.2,26.6,51.8,24.6,54.8,24.3,56.4,22.6,58.5,20.5,57.5,18.2,52.8,16.9,49,14.5,45.1,12.9,43.3,12.7,41.6,16.1,39,20.9,36.6,26.1,34.8,28.3,32.6,29.9,32.3,31.3,34.4,31.6,35.8,35.6,36.1,36.6,32.1,36.4,29.1,36.6,27.3,37.1,26.3,38.5,24.1,38.1,23.5,37.8,22.1,37.2,21.5,38.3,19.5,40.2,19.1,41.9,17.5,43,15.2,44.4,13.6,45.6,12.3,44.2,14,42.3,15.8,41.9,18.4,40.3,17,40.2,16.5,38.4,15.9,38.1,15.7,40,14.5,41,12,41.9,10.2,43.9,7.5,43.7,5.5,43.2,3.2,42.4,.5,40.5,-.3,38.5,-2.1,36.8,-5.4,36.1,-7.4,37.2,-9,37.6],
    // Australia (Oceania mainland)
    [113.6,-22,114.2,-26.4,115.6,-31.4,115,-34.2,118.2,-35,124.2,-33,129.2,-32,132.2,-32.2,135.6,-35,138.2,-35.6,140.2,-38,144.2,-38.6,146.6,-39,148.2,-37.6,150.2,-36,152.2,-33.2,153.6,-28.6,153.2,-25.6,151.2,-24.2,149.2,-20.2,146.2,-18.6,145.2,-15.2,143.2,-13.2,142.2,-11,140.2,-17.2,136.2,-15.6,135.2,-12.6,132.2,-11.4,130.2,-12.6,128.2,-15,125.2,-14.6,122.2,-17.2,118.2,-20.2,114.2,-21.6],
    // Greenland
    [-45.2,60,-42.2,61.2,-40.2,63.6,-38.2,65.6,-32.2,68.6,-25.2,70.6,-22.2,72.6,-25.2,75.2,-20.2,76.6,-22.2,78.6,-30.2,80,-38.2,80.4,-45.2,80,-52.2,79,-58.2,76.2,-62.2,73,-60.2,70.2,-56.2,67.2,-53.2,64.2,-50.2,61.6,-47.2,60.2],
    // Baffin Island
    [-80,63.2,-76,66.5,-72,68.5,-66,68.3,-62,66.8,-64,64.5,-68,63,-73,62.8,-77.5,61.5],
    // British Isles
    [-5.6,50,-3.2,51.2,1.4,51.3,1.7,52.6,-1.2,53.6,-2.4,56,-3.2,58.6,-5.2,58.4,-6.2,56,-4.8,54.6,-3.2,53.6,-4.6,53.2,-5.4,51.6],
    [-10.2,51.6,-6.3,52.2,-6.1,54.1,-7.6,55.3,-10.1,54.2,-9.8,53],
    // Iceland
    [-24.2,65.2,-22.2,66.5,-18.2,66.5,-14.2,65.6,-15.2,64.2,-18.2,63.5,-21.2,63.9],
    // Japan
    [130.2,31.2,132.2,33.6,135.2,34.2,137.2,34.8,140.2,35.4,141.2,38.2,141.6,41.2,143.2,42.2,145.2,44.2,142.2,45.4,140.2,42.2,139.6,38.2,137.2,34.6,133.2,33.6],
    // Maritime Southeast Asia
    [95.4,5.6,97.6,3.6,100.2,.2,103.2,-3,106.2,-6.2,104.2,-6.2,101.2,-3.2,98.2,1.2,95.4,4.2],
    [105.2,-5.6,108.5,-5.8,111.5,-6.0,114.6,-7.4,115.0,-8.2,113.5,-8.6,110.5,-8.2,107.5,-7.4,105.5,-6.8],
    [109.2,1.4,111.2,3.2,115.2,5.2,117.6,6.6,119.2,5.2,118.2,2.2,116.2,-1.2,114.2,-3.4,110.6,-3.2,109.2,.2],
    [119.2,.8,120.6,1.4,121.6,.2,121.2,-2.2,120.6,-3.6,119.6,-5.5,118.6,-5.2,119.2,-2.6],
    [131.2,-.8,134.2,-1.2,136.2,-2.2,138.2,-2.6,141.2,-2.9,145.2,-4.6,148.2,-6.2,150.2,-7.6,147.2,-8.2,143.2,-8.6,139.2,-8.2,135.2,-4.6,132.2,-3.2,131.2,-2.2],
    // Philippines
    [120.2,18.6,122.2,18.2,122.2,16.2,124.2,13.2,123.6,12.6,121.2,14.2,120.2,16.2],
    [122.2,8.2,124.2,9.2,126.2,8.6,126.6,7.2,125.2,5.8,123.2,6.6],
    // Madagascar, Sri Lanka, Tasmania, Taiwan, Cuba, Hispaniola, Novaya Zemlya, New Zealand
    [49.4,-12.2,50.3,-15.6,49.8,-19.2,47.2,-24.8,45.1,-25.4,43.6,-21.4,44.2,-17.2,46.4,-13.8],
    [80.2,9.6,81.6,8.6,81.8,6.6,80.6,6.1,79.9,8.2],
    [145.2,-40.8,148.2,-40.8,148.2,-43.2,146.2,-43.6,144.8,-42.2],
    [120.2,25.2,121.6,25.2,121.2,22.6,120.3,22.7],
    [-84.6,22.6,-80.2,23.2,-77.2,20.7,-75.2,20.2,-79.2,21.6,-84.2,21.9],
    [-74.2,18.6,-71.2,19.9,-68.6,18.6,-72.2,18.2],
    [53.2,70.9,55.2,73.2,57.2,75.5,55.2,76.6,53.2,74.2,52.2,72.2],
    [172.8,-34.5,175.8,-37.6,178.2,-38.6,176.6,-40.2,175.2,-41.4,174.6,-39.6],
    [172.8,-40.6,174.2,-41.6,173.2,-43.2,171.2,-44.6,168.2,-46.6,166.6,-45.6,170.2,-43.2,171.6,-41.6],
    // Sakhalin
    [142,54.2,143.5,53.2,142.8,50.5,141.8,47.8,142,46.2,143,46.5,143.2,49.5,142.5,52.5],
    // Newfoundland
    [-59,47.5,-56,48.5,-53.5,49.5,-53,48,-55.5,46.8,-58,47],
    // Vancouver Island
    [-128.2,50.5,-126.5,50.8,-124.5,49,-125,48.2,-127.5,49],
    // Svalbard
    [10.5,76.5,15.5,77.5,20.5,78.5,22.5,80,18.5,80.2,14.5,79.5,11.5,78.2],
    // Sicily
    [12.4,38.2,15.2,38.2,15.1,36.7,12.5,37.6],
    // Sardinia
    [8.2,41.2,9.8,41.2,9.6,38.9,8.4,38.9],
    // Crete
    [23.5,35.2,26.2,35.2,25.5,34.8,23.8,34.8],
    // Falklands
    [-61.2,-51.5,-58.5,-51.2,-57.8,-52.2,-60.5,-52.2],
    // Aleutians (western chain)
    [-178.5,51.8,-176.5,52,-174.5,52.2,-172.5,52.8,-170.5,53.2,-168.5,53.5,-170.5,53.8,-173.5,53.5,-176.5,53,-178.5,52.5]
  ];
  // Inland seas and bays carved back out of the landmass outlines.
  var LAND_HOLES = [
    // Hudson Bay
    [-94.5,58.8,-92,62.5,-86,64.3,-82.5,63.8,-80.5,60.4,-82.5,56.5,-88,55.4,-92.5,56.6],
    // Baltic
    [12.6,54.5,20,54.9,21.2,56.6,23.5,59.2,27,60.1,24.5,63.2,20.2,63.6,17.2,61,18.6,58.4,13.2,55.6],
    // Black Sea
    [28.6,41.6,31,42.4,33.6,42,36.2,41.3,39.6,41.1,41.4,41.4,41.4,43.1,36.6,44.6,35,44.6,31.2,46.2,29.6,45.6,28.6,44],
    // Caspian
    [50.2,44.6,52.6,45.4,53.2,42.2,50.2,38.2,49.2,37.2,48.6,40.2,47.2,43.2],
    // Persian Gulf
    [48.5,30.2,50.5,29,52.5,27,55,25.5,56.5,25,54.5,24.2,51.5,25,49,27.5,47.8,29.2],
    // Red Sea
    [34.5,28,35.5,27,37,24,38.5,20,40,16,42,13,43.2,12.2,41.5,13.5,39.5,17,37.5,21.5,35.5,26,34,27.8],
    // Mediterranean water between Africa and Europe (does not eat Sicily/Crete)
    [0,34.5,5,35.5,10,35.8,15,36.2,20,35.5,25,35.2,30,34.5,34,33.5,32,32.5,25,33.2,18,33.5,10,33.8,4,33.5,0,33.8],
    // Great Lakes
    [-92,46.8,-88,48.2,-84.5,46.5,-82.5,45.5,-79,43.2,-76.5,43.5,-79.5,41.8,-83,41.5,-86,41.8,-88,43.5,-90.5,45.5],
    // Sea of Okhotsk
    [143.5,59,148.5,59.5,153.5,59,156.5,57,155,54.5,151.5,55.5,147.5,57],
    // Gulf of Carpentaria
    [136,-16,138.5,-15.5,140.5,-16.5,141,-17.5,139.5,-17.5,137.5,-17],
    // White Sea
    [32.5,66.5,35.5,66.2,37,65,36,64.2,33.5,64.5,32,65.5],
    // Adriatic
    [12.5,45.5,14.5,44.8,16.5,43.5,18.5,42,19.5,41.5,18,42.5,16,43.8,14,44.8,12.8,45.5]
  ];

  function inPoly(lon, lat, flat) {
    var inside = false;
    for (var i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
      var xi = flat[i], yi = flat[i + 1], xj = flat[j], yj = flat[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function isIce(lonDeg, latDeg) {
    return latDeg < -61 || (latDeg > 66.5 && lonDeg > -62 && lonDeg < -20);
  }

  function isDesert(lonDeg, latDeg) {
    return (latDeg > 15 && latDeg < 33 && lonDeg > -16 && lonDeg < 58) ||
      (latDeg > -32 && latDeg < -13 && lonDeg > 115 && lonDeg < 153) ||
      (latDeg > 36 && latDeg < 47 && lonDeg > 52 && lonDeg < 78);
  }

  function isLand(lonDeg, latDeg) {
    if (latDeg < -61) {
      // Antarctica: encircling ice coast with Weddell / Ross embayments and
      // the peninsula reaching toward South America.
      var wobble = 1.3 * Math.sin(lonDeg * Math.PI / 180 * 3.1) +
        0.8 * Math.sin(lonDeg * Math.PI / 180 * 7.3 + .8);
      var edge = -68.5 + wobble;
      if (lonDeg > -42 && lonDeg < -12) edge -= 4.2 * Math.sin((lonDeg + 42) / 30 * Math.PI);
      var lonWrap = lonDeg > 150 ? lonDeg - 360 : lonDeg;
      if (lonWrap > 150 || lonWrap < -150) {
        var t = (lonWrap + 190) / 40;
        if (t > 0 && t < 1) edge -= 5.5 * Math.sin(t * Math.PI);
      }
      if (latDeg < edge) return true;
      if (lonDeg > -72 && lonDeg < -54 && latDeg > -74 && latDeg < -62.5) return true;
      return false;
    }
    for (var h = 0; h < LAND_HOLES.length; h++) if (inPoly(lonDeg, latDeg, LAND_HOLES[h])) return false;
    for (var p = 0; p < LAND_POLYS.length; p++) if (inPoly(lonDeg, latDeg, LAND_POLYS[p])) return true;
    return false;
  }

  // Shoreline probe: land next to water reads as coast and gets a brighter pass.
  function isCoast(lonDeg, latDeg) {
    if (!isLand(lonDeg, latDeg)) return false;
    var d = 1.2;
    return !isLand(lonDeg + d, latDeg) || !isLand(lonDeg - d, latDeg) ||
      !isLand(lonDeg, latDeg + d) || !isLand(lonDeg, latDeg - d);
  }

  // Four-ocean basin id for water particles: 0 Pacific, 1 Atlantic, 2 Indian, 3 polar.
  function oceanBasin(lonDeg, latDeg) {
    if (latDeg > 66 || latDeg < -55) return 3;
    if (lonDeg >= 100 || lonDeg <= -70) return 0;
    if (lonDeg > 20 && lonDeg < 100 && latDeg < 30) return 2;
    return 1;
  }

  /* Approximate real elevation, normalized to roughly [-0.35, 1].
     Soft elliptical blobs stand in for major ranges / plateaus; max-blend
     so overlapping cordilleras form continuous ridges instead of discs. */
  var TERRAIN_BLOBS = [
    // Himalaya + Tibetan Plateau
    { lon: 85, lat: 31, rx: 20, ry: 10, h: 1.0 },
    { lon: 78, lat: 34, rx: 12, ry: 7, h: .95 },
    { lon: 95, lat: 30, rx: 12, ry: 8, h: .8 },
    { lon: 86.5, lat: 28.5, rx: 5, ry: 3, h: 1.0 },
    // Karakoram / Pamir / Tian Shan / Altai
    { lon: 72, lat: 38, rx: 8, ry: 5, h: .9 },
    { lon: 82, lat: 42, rx: 12, ry: 5, h: .7 },
    { lon: 90, lat: 48, rx: 10, ry: 5, h: .55 },
    // Zagros + Caucasus + Elburz
    { lon: 50, lat: 32, rx: 9, ry: 4, h: .7 },
    { lon: 44, lat: 42.5, rx: 6, ry: 3, h: .75 },
    // Andes (one long arc)
    { lon: -70, lat: -20, rx: 6, ry: 18, h: .95 },
    { lon: -71, lat: 5, rx: 5, ry: 10, h: .85 },
    { lon: -69, lat: -38, rx: 4, ry: 12, h: .8 },
    // Rockies + Cascades + Sierra Nevada
    { lon: -115, lat: 42, rx: 8, ry: 16, h: .7 },
    { lon: -120, lat: 46, rx: 5, ry: 10, h: .75 },
    { lon: -118, lat: 38, rx: 4, ry: 6, h: .65 },
    // Alps + Carpathians + Apennines
    { lon: 8, lat: 46, rx: 7, ry: 3, h: .7 },
    { lon: 25, lat: 47, rx: 6, ry: 3, h: .55 },
    { lon: 13, lat: 43, rx: 4, ry: 4, h: .45 },
    // Scandinavian mountains
    { lon: 10, lat: 63, rx: 7, ry: 10, h: .5 },
    // Atlas
    { lon: -5, lat: 32, rx: 10, ry: 3, h: .55 },
    // East African highlands / Ethiopian plateau / Drakensberg
    { lon: 38, lat: 8, rx: 6, ry: 8, h: .75 },
    { lon: 34, lat: -5, rx: 4, ry: 8, h: .55 },
    { lon: 28, lat: -28, rx: 5, ry: 4, h: .45 },
    // Urals
    { lon: 60, lat: 62, rx: 4, ry: 12, h: .4 },
    // Deccan / Western Ghats
    { lon: 75, lat: 16, rx: 5, ry: 6, h: .45 },
    // Brazilian highlands / Guiana / Andes foothills
    { lon: -45, lat: -15, rx: 10, ry: 8, h: .4 },
    { lon: -60, lat: 3, rx: 8, ry: 5, h: .35 },
    // Mexican highlands / Sierra Madre
    { lon: -102, lat: 23, rx: 8, ry: 6, h: .5 },
    // Great Dividing Range
    { lon: 148, lat: -26, rx: 5, ry: 12, h: .5 },
    // Southern Alps NZ
    { lon: 171, lat: -43.5, rx: 3, ry: 3, h: .6 },
    // Papua New Guinea highlands
    { lon: 143, lat: -5, rx: 10, ry: 3, h: .7 },
    // Appalachian / Blue Ridge (low)
    { lon: -78, lat: 38, rx: 6, ry: 8, h: .35 },
    // Yellowstone / Wasatch
    { lon: -110, lat: 42, rx: 5, ry: 4, h: .55 },
    // Kamchatka
    { lon: 158, lat: 55, rx: 4, ry: 6, h: .5 },
    // Hida / Japanese Alps
    { lon: 138, lat: 36, rx: 3, ry: 3, h: .45 },
    // Greenland ice sheet (bulge)
    { lon: -42, lat: 74, rx: 14, ry: 9, h: .7 },
    // Antarctic plateau
    { lon: 0, lat: -82, rx: 120, ry: 12, h: .55 },
    // mid-ocean ridges (subtle)
    { lon: -30, lat: 0, rx: 8, ry: 40, h: .18 },
    { lon: 70, lat: -20, rx: 6, ry: 25, h: .15 }
  ];

  function terrainElevation(lonDeg, latDeg) {
    var best = -0.28;
    for (var b = 0; b < TERRAIN_BLOBS.length; b++) {
      var blob = TERRAIN_BLOBS[b];
      // Shortest great-circle-ish longitudinal delta
      var dLon = lonDeg - blob.lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      var nx = dLon / blob.rx;
      var ny = (latDeg - blob.lat) / blob.ry;
      var d2 = nx * nx + ny * ny;
      if (d2 < 1) {
        // Smooth falloff; keep a ridge spine brighter near the axis
        var fall = 1 - d2;
        fall = fall * fall;
        var elev = blob.h * fall;
        if (elev > best) best = elev;
      }
    }
    // Land floor vs deep ocean: base plate relief so continents aren't flat discs
    if (best < 0) best *= .85;
    return best;
  }

  // Radial scale from sea level: 1 = nominal sphere, >1 mountains, <1 basins.
  function terrainRadiusScale(lonDeg, latDeg, land) {
    var elev = terrainElevation(lonDeg, latDeg);
    if (land) {
      // Continents sit on a raised crustal plate; ranges rise further.
      // Flat interiors (Sahara, Amazon, plains) stay just above sea level.
      var h = elev > .08 ? elev : .08 + elev * .08;
      return 1.015 + Math.max(h, .05) * .07;
    }
    // Ocean: abyssal plains sink slightly; ridges rise a little
    return 1 + elev * .035;
  }

  /* Climate / biome placement for land particle colour.
     hue 0 ocean · 1 ice · 2 desert gold · 3 forest green.
     Desert and forest blobs + latitude bands approximate each continent's
     real pattern (Sahara, Arabian, Outback, Atacama, Amazon, Congo, taiga…). */
  var ARID_BLOBS = [
    { lon: 10, lat: 22, rx: 30, ry: 10 }, // Sahara
    { lon: 22, lat: 24, rx: 12, ry: 7 },
    { lon: 46, lat: 22, rx: 14, ry: 8 }, // Arabian
    { lon: 54, lat: 32, rx: 12, ry: 6 }, // Iranian plateau
    { lon: 72, lat: 27, rx: 7, ry: 5 }, // Thar
    { lon: 90, lat: 42, rx: 18, ry: 7 }, // Gobi / Taklamakan
    { lon: 75, lat: 40, rx: 10, ry: 5 }, // Taklamakan
    { lon: 134, lat: -24, rx: 20, ry: 14 }, // Australian outback
    { lon: 21, lat: -22, rx: 10, ry: 9 }, // Kalahari / Namib
    { lon: 15, lat: -22, rx: 6, ry: 8 }, // Namib
    { lon: -70, lat: -23, rx: 3.5, ry: 10 }, // Atacama
    { lon: -69, lat: -46, rx: 4, ry: 8 }, // Patagonian steppe
    { lon: -114, lat: 36, rx: 10, ry: 9 }, // Great Basin / Sonoran / Chihuahuan
    { lon: -105, lat: 25, rx: 8, ry: 5 }, // Mexican dry belt
    { lon: 42, lat: 9, rx: 6, ry: 5 }, // Danakil / Horn
    { lon: 88, lat: 45, rx: 8, ry: 5 }, // Mongolian steppe edge
    { lon: 100, lat: 50, rx: 12, ry: 6 }, // Siberian dry steppe
    { lon: -100, lat: 40, rx: 10, ry: 10 }, // Great Plains
    { lon: -108, lat: 32, rx: 8, ry: 6 } // Chihuahuan fringe
  ];

  var FOREST_BLOBS = [
    { lon: -62, lat: -5, rx: 20, ry: 14 }, // Amazon
    { lon: 18, lat: 0, rx: 12, ry: 10 }, // Congo
    { lon: 105, lat: 2, rx: 14, ry: 12 }, // SE Asia / Sumatra–Borneo–Java
    { lon: 114, lat: 0, rx: 10, ry: 10 }, // Borneo core
    { lon: 120, lat: 8, rx: 8, ry: 8 }, // Philippines
    { lon: -85, lat: 50, rx: 20, ry: 14 }, // Canadian / Great Lakes forest
    { lon: -80, lat: 36, rx: 12, ry: 10 }, // SE US forests
    { lon: 8, lat: 55, rx: 14, ry: 8 }, // Western European woodlands
    { lon: 90, lat: 60, rx: 25, ry: 12 }, // Siberian taiga
    { lon: 55, lat: 60, rx: 18, ry: 12 }, // Ural / W Siberia taiga
    { lon: 110, lat: 30, rx: 18, ry: 12 }, // Southern China / Yangtze
    { lon: 90, lat: 15, rx: 12, ry: 10 }, // Bay of Bengal / Myanmar
    { lon: -50, lat: -18, rx: 14, ry: 16 }, // Brazilian Atlantic forest
    { lon: -55, lat: -10, rx: 14, ry: 12 }, // Atlantic forest fringe
    { lon: 22, lat: -5, rx: 10, ry: 10 }, // Zambezi / miombo
    { lon: 38, lat: -8, rx: 6, ry: 8 }, // East African montane wet
    { lon: 145, lat: -6, rx: 10, ry: 5 }, // New Guinea forests
    { lon: 135, lat: 35, rx: 8, ry: 8 }, // Japanese / Korean forest
    { lon: 10, lat: 12, rx: 10, ry: 4 } // Sahel southern wet fringe
  ];

  function blobField(blobs, lonDeg, latDeg) {
    var best = 0;
    for (var b = 0; b < blobs.length; b++) {
      var blob = blobs[b];
      var dLon = lonDeg - blob.lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      var nx = dLon / blob.rx;
      var ny = (latDeg - blob.lat) / blob.ry;
      var d2 = nx * nx + ny * ny;
      if (d2 < 1) {
        var v = 1 - d2;
        v *= v;
        if (v > best) best = v;
      }
    }
    return best;
  }

  function climateHue(lonDeg, latDeg, rand) {
    if (isIce(lonDeg, latDeg)) return 1;
    // Snow peaks only where high elevation is NOT a hot desert (Atacama/Himalaya)
    var elev = terrainElevation(lonDeg, latDeg);
    var arid0 = blobField(ARID_BLOBS, lonDeg, latDeg);
    if (elev > .88 && arid0 < .35) return rand() < .55 ? 1 : 2;

    var absLat = Math.abs(latDeg);
    // Latitude climate baseline (wetness 0–1)
    var baseWet;
    if (absLat < 12) baseWet = .78; // ITCZ rain belt
    else if (absLat < 28) baseWet = .22; // subtropical high
    else if (absLat < 48) baseWet = .60; // temperate
    else if (absLat < 66) baseWet = .50; // boreal
    else baseWet = .24; // polar dry

    // East-Pacific / west-coast deserts already in ARID_BLOBS; keep wet
    // subtropical east coasts (Brazil, SE US, SE China) greener.
    if (lonDeg > -60 && lonDeg < -35 && absLat > 10 && absLat < 30) baseWet = Math.max(baseWet, .48);
    if (lonDeg > -100 && lonDeg < -70 && absLat > 25 && absLat < 40) baseWet = Math.max(baseWet, .58);
    if (lonDeg > 105 && lonDeg < 125 && absLat > 18 && absLat < 35) baseWet = Math.max(baseWet, .58);
    if (lonDeg > 70 && lonDeg < 92 && absLat > 8 && absLat < 28) baseWet = Math.max(baseWet, .62); // Indian monsoon
    if (lonDeg > -95 && lonDeg < -75 && absLat > 30 && absLat < 38) baseWet = Math.max(baseWet, .55); // SE US

    var arid = blobField(ARID_BLOBS, lonDeg, latDeg);
    var forest = blobField(FOREST_BLOBS, lonDeg, latDeg);
    var wet = clamp(baseWet + forest * .50 - arid * .70, 0, 1);

    // Mediterranean / Californian / Chilean coasts: dry-summer fringe
    var medLat = absLat > 30 && absLat < 42;
    if (medLat && arid < .2 && wet > .25) wet = Math.min(wet, .48);

    var r = rand();
    // Only true desert vs green — no olive/savanna band (that hue looked wrong).
    if (wet < .30) return 2;
    if (wet < .48) return r < .42 ? 2 : 3;
    return 3;
  }

  function makeEarthField(count, seed) {
    var rand = random(seed);
    var points = [];
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    // Ocean brightness by basin so the four oceans read as distinct bodies:
    // Pacific darkest, Atlantic mid, Indian slightly warmer-bright, polar palest.
    var oceanBright = [.09, .13, .16, .18];
    var oceanSize = [.92, 1.0, 1.05, 1.08];
    // Base layer: uniform Fibonacci sphere carrying oceans, the graticule and
    // dim land, so continents sit as bright masses on darker water.
    for (var i = 0; i < count; i++) {
      var y = 1 - 2 * ((i + .5) / count);
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var lon = (i * goldenAngle) % (Math.PI * 2);
      var lat = Math.asin(y);
      var lonDeg = lon * 180 / Math.PI - 180;
      var latDeg = lat * 180 / Math.PI;
      var land = isLand(lonDeg, latDeg);
      var coast = land && isCoast(lonDeg, latDeg);
      var wire = !land && (Math.abs(Math.sin(lat * 9)) < .02 || Math.abs(Math.sin(lon * 8 + lat * 2)) < .013);
      var roll = rand();
      var layer = land ? (coast || roll > .48 ? 'cloud' : 'dust') : wire ? 'cloud' : 'dust';
      var hue = !land ? 0 : climateHue(lonDeg, latDeg, rand);
      var basin = land ? -1 : oceanBasin(lonDeg, latDeg);
      var scatterAngle = lon + (rand() - .5) * 2.4;
      var scatterRadius = .35 + rand() * .75;
      var px = Math.cos(lon) * r, pz = Math.sin(lon) * r;
      // Bake real elevation into the rest position so the globe silhouette
      // and surface depth follow mountain ranges instead of a perfect sphere.
      var rs = terrainRadiusScale(lonDeg, latDeg, land);
      var elevN = land ? clamp((rs - 1.015) / .07, 0, 1) : 0;
      var size;
      var brightness;
      if (land) {
        size = coast ? .58 + rand() * 1.1 : .5 + rand() * 1.1;
        brightness = (coast ? .55 + roll * .3 : .42 + roll * .34) * (1 + elevN * .2);
        size *= 1 + elevN * .18;
      } else if (wire) {
        size = .38 + rand() * .85;
        brightness = .28 + rand() * .28;
      } else {
        size = (.3 + rand() * .9) * oceanSize[basin];
        brightness = oceanBright[basin] + rand() * .16;
      }
      points.push({
        x: px * .76 * rs, y: y * .76 * rs, z: pz * .76 * rs,
        tx: Math.cos(scatterAngle) * scatterRadius, ty: (rand() - .5) * 1.1,
        nx: -px, ny: -y, ax: -pz, ay: px,
        phase: rand() * Math.PI * 2, speed: .35 + rand() * .85,
        size: size,
        brightness: brightness,
        hue: hue, layer: layer, repel: .6 + rand(), globe: true,
        elev: elevN
      });
    }
    // Highlight layer: extra bright particles restricted to land, so the
    // continents stand out sharply against the dark oceans. Coastlines get a
    // denser pass so the seven-continent silhouette reads at a glance.
    var extra = Math.round(count * .6);
    var added = 0, guard = 0;
    while (added < extra && guard < extra * 70) {
      guard++;
      var zr = rand() * 2 - 1;
      var az = rand() * Math.PI * 2;
      var rr = Math.sqrt(Math.max(0, 1 - zr * zr));
      var lon2 = az * 180 / Math.PI - 180;
      var lat2 = Math.asin(zr) * 180 / Math.PI;
      if (!isLand(lon2, lat2)) continue;
      var coast2 = isCoast(lon2, lat2);
      var hue2 = climateHue(lon2, lat2, rand);
      var scatterAngle2 = az + (rand() - .5) * 2.4;
      var scatterRadius2 = .35 + rand() * .75;
      var rs2 = terrainRadiusScale(lon2, lat2, true);
      var elevN2 = clamp((rs2 - 1.015) / .07, 0, 1);
      // Prefer highlight weight on high ranges: drop some lowland samples.
      if (elevN2 < .25 && rand() > .35) continue;
      points.push({
        x: Math.cos(az) * rr * .76 * rs2, y: zr * .76 * rs2, z: Math.sin(az) * rr * .76 * rs2,
        tx: Math.cos(scatterAngle2) * scatterRadius2, ty: (rand() - .5) * 1.1,
        nx: -Math.cos(az) * rr, ny: -zr, ax: -Math.sin(az) * rr, ay: Math.cos(az) * rr,
        phase: rand() * Math.PI * 2, speed: .35 + rand() * .85,
        size: (coast2 ? .72 + Math.pow(rand(), 1.5) * 1.55 : .62 + Math.pow(rand(), 1.6) * 1.55) * (1 + elevN2 * .2),
        brightness: (coast2 ? .82 + rand() * .18 : .72 + rand() * .26) * (1 + elevN2 * .16),
        hue: hue2, layer: 'core', repel: .6 + rand(), globe: true,
        elev: elevN2
      });
      added++;
    }
    return points;
  }

  function makeCueField(count, type, seed) {
    var rand = random(seed);
    var points = [];
    for (var i = 0; i < count; i++) {
      var t = i / count;
      var lane = rand();
      var shape = type === 'cursor' ? cursorPath(t, lane) : knotPath(t, lane);
      var target = type === 'cursor' ? knotPath(t, lane) : cursorPath(t, lane);
      points.push({
        x: shape.x + normalGaussian(rand) * .025, y: shape.y + normalGaussian(rand) * .025,
        z: normalGaussian(rand) * .11, tx: target.x, ty: target.y,
        t: t, nx: 0, ny: 0, ax: 0, ay: 0,
        phase: rand() * Math.PI * 2, speed: .45 + rand() * .8,
        size: .35 + rand() * 1.05, brightness: .38 + rand() * .5,
        hue: rand() > .85 ? 1 : 0, layer: rand() > .72 ? 'cloud' : 'core', repel: .6 + rand()
      });
    }
    return points;
  }

  /* ---------- Canvas renderer ---------- */
  function ParticleField(host, options) {
    this.host = host;
    this.options = options || {};
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'local-particle-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.points = [];
    this.stars = [];
    // Up = north, down = south, left = west, right = east. A zero pitch keeps
    // the poles exactly vertical on screen; east-west orientation is fixed by
    // the projection itself (positive longitude maps to screen right).
    this.rotation = this.options.startRotation || 0;
    this.pitch = 0;
    this.targetRotation = this.options.startRotation || 0;
    this.targetPitch = 0;
    this.progress = 0;
    this.targetProgress = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.lastFrame = 0;
    this.active = true;
    this.bornAt = 0;
    this.pointer = { active: false, px: 0, py: 0 };
    this.ripples = [];
    this.press = null;
    this.sprite = this.createSprites();
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
    this.bindInput();
    this.resize();
    this.buildPoints();
    window.addEventListener('resize', this.resize, { passive: true });
  }

  ParticleField.prototype.createSprites = function () {
    // Palette: ocean · ice · desert gold · forest green (original four hues).
    return {
      dark: this.buildSprites([
        [118, 170, 255],
        [237, 246, 255],
        [255, 218, 182],
        [126, 216, 178]
      ]),
      light: this.buildSprites([
        [138, 180, 218],
        [166, 192, 216],
        [210, 182, 140],
        [116, 168, 134]
      ])
    };
  };

  ParticleField.prototype.buildSprites = function (colors) {
    return colors.map(function (color) {
      var surface = document.createElement('canvas');
      surface.width = 48;
      surface.height = 48;
      var context = surface.getContext('2d');
      var gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
      gradient.addColorStop(0, 'rgba(' + color.join(',') + ',.90)');
      gradient.addColorStop(.10, 'rgba(' + color.join(',') + ',.54)');
      gradient.addColorStop(.35, 'rgba(' + color.join(',') + ',.12)');
      gradient.addColorStop(1, 'rgba(' + color.join(',') + ',0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 48, 48);
      return surface;
    });
  };

  ParticleField.prototype.resize = function () {
    var bounds = this.host.getBoundingClientRect();
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  ParticleField.prototype.buildPoints = function () {
    var count = this.options.count || (this.width < 700 ? 1600 : 3200);
    this.points = this.options.kind === 'earth'
      ? makeEarthField(count, this.options.seed || 33)
      : this.options.kind === 'six'
        ? makeSixField(count, this.options.seed || 19)
        : makeCueField(count, this.options.kind || 'knot', this.options.seed || 61);
    var startRand = random((this.options.seed || 1) + 800);
    for (var pointIndex = 0; pointIndex < this.points.length; pointIndex++) {
      var point = this.points[pointIndex];
      point.startX = point.x + (startRand() - .5) * (point.layer === 'dust' ? 1.25 : .8);
      point.startY = point.y + (startRand() - .5) * (point.layer === 'dust' ? 1.25 : .8);
    }
    this.bornAt = performance.now();
    var rand = random((this.options.seed || 1) + 1600);
    this.stars = [];
    for (var i = 0; i < 150; i++) this.stars.push({ x: rand(), y: rand(), size: .25 + rand() * 1.05, phase: rand() * Math.PI * 2 });
  };

  ParticleField.prototype.addRipple = function (x, y) {
    if (reduceMotion || this.options.kind !== 'earth') return;
    var shortSide = Math.min(this.width, this.height);
    this.ripples.push({
      x: x, y: y, born: performance.now(), duration: 1120,
      maxRadius: shortSide * .34
    });
    // Keep rapid clicks responsive without accumulating stale waves.
    if (this.ripples.length > 3) this.ripples.shift();
  };

  ParticleField.prototype.bindInput = function () {
    var self = this;
    this.host.addEventListener('pointermove', function (event) {
      var rect = self.host.getBoundingClientRect();
      // Track the cursor in canvas pixels. Repulsion is applied in screen space
      // after projection, so it stays pinned to the pointer while the globe
      // rotates underneath.
      self.pointer.active = true;
      self.pointer.px = event.clientX - rect.left;
      self.pointer.py = event.clientY - rect.top;
      if (!self.dragging) return;
      if (self.press && Math.hypot(event.clientX - self.press.x, event.clientY - self.press.y) > 8) self.press.moved = true;
      self.targetRotation += (event.clientX - self.lastX) * .006;
      // The Earth is rendered with an inverted screen-Y projection so north
      // stays above south. Invert drag pitch as well, making the globe follow
      // the pointer naturally: drag up -> globe moves up, drag down -> down.
      self.targetPitch = clamp(self.targetPitch - (event.clientY - self.lastY) * .0035, -.82, .82);
      self.lastX = event.clientX;
      self.lastY = event.clientY;
    });
    this.host.addEventListener('pointerleave', function () {
      self.pointer.active = false;
      self.dragging = false;
      self.host.classList.remove('is-dragging');
    });
    this.host.addEventListener('pointerdown', function (event) {
      self.press = { x: event.clientX - self.host.getBoundingClientRect().left, y: event.clientY - self.host.getBoundingClientRect().top, moved: false, born: performance.now() };
      self.dragging = true;
      self.lastX = event.clientX;
      self.lastY = event.clientY;
      self.host.classList.add('is-dragging');
      try { self.host.setPointerCapture(event.pointerId); } catch (e) {}
    });
    ['pointerup', 'pointercancel'].forEach(function (eventName) {
      self.host.addEventListener(eventName, function () {
        if (eventName === 'pointerup' && self.options.kind === 'earth' && self.press && !self.press.moved && performance.now() - self.press.born < 700) {
          // Only clicks on the globe surface create a wave; empty Hero space
          // remains quiet. The generous edge allowance includes particle halos.
          var clickDx = self.press.x - self.width * .5;
          var clickDy = self.press.y - self.height * .5;
          var globeHitRadius = Math.min(self.width, self.height) * .42;
          if (Math.hypot(clickDx, clickDy) < globeHitRadius) self.addRipple(self.press.x, self.press.y);
        }
        self.press = null;
        self.dragging = false;
        self.host.classList.remove('is-dragging');
      });
    });
    this.host.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { self.targetRotation -= .17; event.preventDefault(); }
      if (event.key === 'ArrowRight') { self.targetRotation += .17; event.preventDefault(); }
      if (event.key === 'ArrowUp') { self.targetPitch = clamp(self.targetPitch - .12, -.82, .82); event.preventDefault(); }
      if (event.key === 'ArrowDown') { self.targetPitch = clamp(self.targetPitch + .12, -.82, .82); event.preventDefault(); }
    });
  };

  ParticleField.prototype.setProgress = function (value) { this.targetProgress = clamp(value, 0, 1); };

  ParticleField.prototype.resolvePoint = function (point, time, morph) {
    var baseX = point.x + (point.tx - point.x) * morph;
    var baseY = point.y + (point.ty - point.y) * morph;
    var radius = Math.max(.001, Math.hypot(baseX, baseY));
    var angle = Math.atan2(baseY, baseX);
    var layerAmount = point.layer === 'dust' ? .075 : (point.layer === 'cloud' ? .042 : .022);
    var localPhase = time * .00115 * point.speed + point.phase;
    var tangential = Math.sin(localPhase) * layerAmount;
    var radial = Math.cos(localPhase * .73) * layerAmount * .42;
    var spin = time * .000018 * point.speed;
    var animatedAngle = angle + spin + Math.sin(localPhase * .37) * .018;
    var animatedRadius = radius + radial;
    var x = Math.cos(animatedAngle) * animatedRadius - Math.sin(animatedAngle) * tangential;
    var y = Math.sin(animatedAngle) * animatedRadius + Math.cos(animatedAngle) * tangential;

    if (point.globe) {
      // Keep the geographic sphere rigid while particles flicker and breathe.
      // Scroll only loosens the outer dust; the Earth itself does not morph.
      var pulse = Math.sin(localPhase * 1.5) * (point.layer === 'dust' ? .014 : .004);
      x = point.x * (1 + pulse);
      y = point.y * (1 + pulse);
      if (point.layer === 'dust' && morph > 0) {
        x += point.nx * morph * .18 * Math.sin(point.phase);
        y += point.ny * morph * .18 * Math.cos(point.phase);
      }
    }

    // NOTE: cursor repulsion is intentionally NOT applied in model space. It
    // happens in screen space during render, after 3D rotation and projection,
    // so the push always sits exactly under the pointer no matter how the
    // globe spins or the user drags it.

    // The field starts dispersed and assembles over 1.8s. Reduced motion
    // renders a settled field instead of an assembling one.
    var assembly = reduceMotion ? 1 : smoothstep(clamp((time - this.bornAt) / 1800, 0, 1));
    if (point.startX !== undefined) {
      x = point.startX + (x - point.startX) * assembly;
      y = point.startY + (y - point.startY) * assembly;
    }
    return { x: x, y: y, flow: Math.sin(localPhase), drift: Math.cos(localPhase * .81) };
  };

  ParticleField.prototype.setActive = function (value) {
    if (this.active === value) return;
    this.active = value;
    if (value && !reduceMotion) { this.lastFrame = 0; requestAnimationFrame(this.render); }
  };

  ParticleField.prototype.render = function (time) {
    if (!this.active) return;
    // 30 fps is visually smooth for drifting particles and avoids work spikes.
    if (!reduceMotion && time - this.lastFrame < 31) { requestAnimationFrame(this.render); return; }
    var dt = Math.min(.05, ((time - this.lastFrame) || 16) / 1000);
    this.lastFrame = time;
    var ctx = this.ctx;
    var width = this.width;
    var height = this.height;
    this.progress += (this.targetProgress - this.progress) * .046;
    if (!this.dragging) this.targetRotation += dt * .022;
    this.rotation += (this.targetRotation - this.rotation) * .085;
    this.pitch += (this.targetPitch - this.pitch) * .085;

    ctx.clearRect(0, 0, width, height);
    // Theme is read every frame so a toggle takes effect instantly without
    // rebuilding any field state.
    var lightMode = root.classList.contains('light');
    if (!lightMode) {
      // The dark theme is light emitted into space, so it needs an atmospheric
      // bloom and a starfield. On white paper both would read as grey haze.
      var backdrop = ctx.createRadialGradient(width * .5, height * .52, 0, width * .5, height * .52, Math.max(width, height) * .72);
      backdrop.addColorStop(0, 'rgba(22,34,62,.60)');
      backdrop.addColorStop(.46, 'rgba(6,11,21,.26)');
      backdrop.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, width, height);

      for (var starIndex = 0; starIndex < this.stars.length; starIndex++) {
        var star = this.stars[starIndex];
        var starAlpha = .10 + .30 * (Math.sin(time * .001 + star.phase) * .5 + .5);
        ctx.fillStyle = 'rgba(170,200,255,' + starAlpha.toFixed(3) + ')';
        ctx.fillRect(star.x * width, star.y * height, star.size, star.size);
      }
    }

    var centerX = width / 2;
    var centerY = height / 2;
    var scale = this.options.kind === 'six' ? height * .50 : this.options.kind === 'earth' ? Math.min(width, height) * .43 : Math.min(width, height) * .30;
    var cosRotation = Math.cos(this.rotation);
    var sinRotation = Math.sin(this.rotation);
    var cosPitch = Math.cos(this.pitch);
    var sinPitch = Math.sin(this.pitch);
    var morph = smoothstep(this.progress);
    var flowTime = time * .00046;
    var coreFacingCache = this.coreFacingCache || (this.coreFacingCache = new Float32Array(this.points.length));
    var activeRipples = [];
    for (var rippleIndex = this.ripples.length - 1; rippleIndex >= 0; rippleIndex--) {
      var ripple = this.ripples[rippleIndex];
      var rippleAge = (time - ripple.born) / ripple.duration;
      if (rippleAge >= 1) {
        this.ripples.splice(rippleIndex, 1);
        continue;
      }
      rippleAge = clamp(rippleAge, 0, 1);
      activeRipples.push({
        ripple: ripple,
        age: rippleAge,
        radius: ripple.maxRadius * (1 - Math.pow(1 - rippleAge, 2)),
        fade: 1 - rippleAge
      });
    }

    // A click creates a larger, short-lived water ring in screen space. It is
    // drawn beneath the particles and also displaces particles as it passes.
    ctx.globalCompositeOperation = lightMode ? 'source-over' : 'lighter';
    for (var rippleDrawIndex = 0; rippleDrawIndex < activeRipples.length; rippleDrawIndex++) {
      var visualRipple = activeRipples[rippleDrawIndex];
      var visual = visualRipple.ripple;
      var ringRadius = visualRipple.radius;
      var ringFade = visualRipple.fade;
      var ringWidth = Math.max(16, Math.min(32, Math.min(width, height) * .032));
      ctx.globalAlpha = ringFade * .30;
      ctx.strokeStyle = lightMode ? 'rgba(116,158,200,1)' : 'rgba(141,201,255,1)';
      ctx.lineWidth = Math.max(1, Math.min(2.2, ringWidth * .055));
      ctx.beginPath();
      ctx.arc(visual.x, visual.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      if (ringRadius > 18) {
        ctx.globalAlpha = ringFade * .13;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(visual.x, visual.y, Math.max(1, ringRadius - ringWidth * .85), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = ringFade * .34;
      ctx.fillStyle = lightMode ? 'rgba(96,140,188,1)' : 'rgba(190,225,255,1)';
      ctx.beginPath();
      ctx.arc(visual.x, visual.y, Math.max(1.2, 3.2 * ringFade), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    // Bloom and short trails: only every cloud/dust point gets a halo, but all
    // core points do. The layer separation keeps the effect detailed and fast.
    for (var i = 0; i < this.points.length; i++) {
      var point = this.points[i];
      var resolved = this.resolvePoint(point, time, morph);
      var x = resolved.x;
      var y = resolved.y;
      var flow = resolved.flow;
      var drift = resolved.drift;
      var z = point.z * cosRotation + x * sinRotation;
      var rotatedX = x * cosRotation - point.z * sinRotation;
      var rotatedY = y * cosPitch - z * sinPitch;
      var depth = 1 / (1 + (z * cosPitch + y * sinPitch) * .17);
      var px = centerX + rotatedX * scale * depth;
      // Geographic latitude is positive northward, while Canvas Y grows
      // downward. Flip only the Earth projection so north is above south.
      var py = centerY + (point.globe ? -rotatedY : rotatedY) * scale * depth;
      var twinkle = .75 + .25 * (Math.sin(time * .00155 * point.speed + point.phase) * .5 + .5);
      // The light theme needs a higher far-side floor; near-invisible specks
      // on white paper just look like dust.
      var globeFacing = point.globe ? clamp((1 - z / .82) * .58, lightMode ? .22 : .07, 1) : 1;
      coreFacingCache[i] = globeFacing;
      var alpha = clamp(point.brightness * twinkle * (.28 + depth * .72) * globeFacing, .02, 1);
      var size = Math.max(.4, point.size * depth);

      // Screen-space cursor repulsion, applied AFTER rotation and projection:
      // the push is always exactly under the pointer, independent of spin.
      if (this.pointer.active) {
        var repelX = px - this.pointer.px;
        var repelY = py - this.pointer.py;
        var repelDist = Math.hypot(repelX, repelY);
        // Keep the pointer interaction local: at normal desktop scale this
        // radius covers roughly ten nearby particles instead of a broad dent.
        var repelRadius = Math.max(13, Math.min(18, scale * .05));
        if (repelDist < repelRadius && repelDist > .001) {
          var repelInfluence = 1 - repelDist / repelRadius;
          var repelForce = repelInfluence * repelInfluence * scale * .022 * (point.repel || 1);
          px += repelX / repelDist * repelForce;
          py += repelY / repelDist * repelForce;
        }
      }

      // Each expanding ring pushes particles radially as it crosses them.
      // This stays in projected screen space, so a click produces a natural
      // water-wave response without disturbing the globe's geographic layout.
      for (var rippleIndex = 0; rippleIndex < activeRipples.length; rippleIndex++) {
        var passingRipple = activeRipples[rippleIndex];
        var waveX = px - passingRipple.ripple.x;
        var waveY = py - passingRipple.ripple.y;
        var waveDistance = Math.hypot(waveX, waveY);
        if (waveDistance < .001) continue;
        var waveWidth = Math.max(18, Math.min(34, Math.min(width, height) * .035));
        var waveOffset = Math.abs(waveDistance - passingRipple.radius);
        if (waveOffset < waveWidth) {
          var waveInfluence = 1 - waveOffset / waveWidth;
          waveInfluence *= waveInfluence * passingRipple.fade;
          var waveForce = scale * .065 * waveInfluence * (point.repel || 1);
          px += waveX / waveDistance * waveForce;
          py += waveY / waveDistance * waveForce;
        }
      }
      point.spx = px;
      point.spy = py;
      point.sdepth = depth;

      if (lightMode) {
        // Tight chromatic ink bleed instead of the dark theme's wide bloom:
        // land highlights and graticule only, so extra density never turns to
        // grey mud the way large soft halos did.
        if (point.layer === 'core' || (i % 4 === 0 && point.layer === 'cloud')) {
          ctx.globalAlpha = Math.min(.18, alpha * (point.layer === 'core' ? .18 : .09));
          var lightBloom = size * (point.layer === 'core' ? 3.0 : 2.2);
          ctx.drawImage(this.sprite.light[point.hue], px - lightBloom, py - lightBloom, lightBloom * 2, lightBloom * 2);
        }
      } else if (point.layer === 'core' || (i % 4 === 0 && point.layer === 'cloud')) {
        var haloRadius = size * (point.layer === 'core' ? 7.1 : 4.6);
        ctx.globalAlpha = Math.min(.52, alpha * (point.layer === 'core' ? .54 : .28));
        ctx.drawImage(this.sprite.dark[point.hue], px - haloRadius, py - haloRadius, haloRadius * 2, haloRadius * 2);
      }
      if (point.layer !== 'dust' && i % 29 === 0 && !lightMode) {
        ctx.globalAlpha = Math.min(.14, alpha * .22);
        ctx.strokeStyle = lightMode ? 'rgba(70,105,170,1)' : 'rgba(170,207,255,1)';
        ctx.lineWidth = Math.max(.3, size * .18);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.cos(Math.atan2(y, x) + Math.PI / 2) * flow * scale * .032, py - Math.sin(Math.atan2(y, x) + Math.PI / 2) * flow * scale * .032);
        ctx.stroke();
      }
    }

    // Crisp particle cores reuse the projected screen positions from the bloom
    // pass, so halos and cores stay perfectly registered under cursor pushes
    // and the globe's rotation.
    ctx.globalAlpha = 1;
    for (var coreIndex = 0; coreIndex < this.points.length; coreIndex++) {
      var core = this.points[coreIndex];
      var xScreen = core.spx;
      var yScreen = core.spy;
      var coreDepth = core.sdepth;
      var coreFacing = core.globe ? coreFacingCache[coreIndex] : 1;
      var coreAlpha = lightMode
        // Real-Earth hues carry no black, so weight comes from alpha: less
        // white shows through, which raises apparent colour rather than making
        // the globe look like charcoal.
        ? clamp(core.brightness * (.66 + coreDepth * .5) * coreFacing, core.layer === 'dust' ? .44 : .68, 1)
        : clamp(core.brightness * (.34 + coreDepth * .66) * coreFacing, .05, 1);
      var coreSize = lightMode
        ? Math.max(.9, core.size * coreDepth * (core.layer === 'core' ? 1.7 : core.layer === 'cloud' ? 1.3 : 1.85))
        : Math.max(.45, core.size * coreDepth * 1.16);
      var colors = lightMode
        // hue 0 ocean · 1 ice · 2 desert · 3 land green — none of them black
        ? ['116,162,206', '148,178,208', '198,166,118', '96,158,120']
        : ['176,211,255', '244,250,255', '255,222,195', '158,224,190'];
      ctx.fillStyle = 'rgba(' + colors[core.hue] + ',' + coreAlpha.toFixed(3) + ')';
      ctx.fillRect(xScreen - coreSize / 2, yScreen - coreSize / 2, coreSize, coreSize);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.host.style.setProperty('--local-field-rotation', this.rotation.toFixed(3) + 'rad');
    if (!reduceMotion) requestAnimationFrame(this.render);
  };

  /* ---------- install Hero and scroll-cue fields ---------- */
  var hero = q('main > div[data-astra-experience="true"] > div > article > section');
  var heroLayout = hero && q('.AstraHero-module___Ja0lG__layout', hero);
  var heroField;
  if (hero && heroLayout) {
    hero.classList.add('local-particle-hero');
    var heroHost = document.createElement('div');
    heroHost.className = 'local-particle-host local-hero-host local-earth-host';
    heroHost.tabIndex = 0;
    heroHost.setAttribute('role', 'img');
    heroHost.setAttribute('aria-label', 'Drag or use arrow keys to rotate the particle Earth');
    heroLayout.appendChild(heroHost);
    var heroChrome = document.createElement('div');
    heroChrome.className = 'local-hero-chrome';
    heroChrome.setAttribute('aria-hidden', 'true');
    heroChrome.innerHTML = '<span class="local-hero-label local-hero-label-left">GEO</span><span class="local-hero-label local-hero-label-right">BYTE</span><span class="local-scroll-hint">Scroll to explore</span>';
    heroLayout.appendChild(heroChrome);
    // The GEO RSI capsule lives in the hero's lower-right corner. It is a real
    // link, so it still navigates without JavaScript; the transition below
    // only upgrades the click.
    var rsiCta = document.createElement('a');
    rsiCta.className = 'local-geo-rsi-cta';
    rsiCta.href = 'geo-rsi.html';
    rsiCta.setAttribute('data-geo-rsi-cover', '');
    // Destination bottom-right control on GEO RSI (the Lab pill in the rail).
    rsiCta.setAttribute('data-geo-rsi-anchor', '.harness-back');
    rsiCta.innerHTML = '<span class="local-geo-rsi-cta-label">GEO RSI</span><span aria-hidden="true" class="local-geo-rsi-cta-arrow">&rarr;</span>';
    heroLayout.appendChild(rsiCta);
    // The Hero is 100% canvas-driven. There is no static image beneath it.
    // Face 105°E at load (China centered). front-center longitude = 90° - R.
    function buildHeroField() {
      if (heroField) return;
      heroField = new ParticleField(heroHost, { kind: 'earth', count: 3400, seed: 28, startRotation: -0.26 });
      requestAnimationFrame(heroField.render);
    }
    // clip-path animates on the main thread, so an arrival transition gets it
    // first: placing ~5k particles mid-contraction is what dropped frames.
    // When deferred, sync scroll state too — updateScroll() is only safe once
    // the rest of this script (cueFields, revealTargets) has initialised.
    function startHeroAfterCover() {
      buildHeroField();
      updateScroll();
    }
    if (document.getElementById('geobyte-cover')) {
      document.addEventListener('geobyte:cover-done', startHeroAfterCover, { once: true });
      window.setTimeout(startHeroAfterCover, 1800);
    } else {
      buildHeroField();
    }
  }
  // Earliest point where a return-trip anchor (the capsule) is guaranteed to
  // exist, ahead of the cheaper scroll-cue fields.
  requestAnimationFrame(revealFromCover);

  var cueFields = [];
  qa('[data-astra-scroll-cue]').forEach(function (cue, index) {
    var parent = cue.parentElement;
    if (!parent) return;
    var host = document.createElement('div');
    host.className = 'local-particle-host local-cue-host';
    host.tabIndex = 0;
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', index === 0 ? 'Drag or use arrow keys to rotate the cursor particle field' : 'Drag or use arrow keys to rotate the blossom particle field');
    parent.insertBefore(host, cue);
    cue.style.display = 'none';
    var field = new ParticleField(host, { kind: index === 0 ? 'cursor' : 'knot', count: 540, seed: index + 90 });
    cueFields.push({ field: field, parent: parent });
    requestAnimationFrame(field.render);
  });

  /* ---------- GEO RSI page transition ---------- */
  // A viewport-sized panel is clipped down to the capsule rectangle and the
  // clip is animated open — “all four edges expand”. clip-path is a
  // paint-only property, so unlike animating left/top/width/height it never
  // triggers layout, and its `round` keyword interpolates the capsule radius
  // so the panel also *contracts* as a capsule, not as a square.
  //
  // Motion design:
  //   Both pages use a bottom-right control as the spatial anchor:
  //     Geobyte  → .local-geo-rsi-cta  (GEO RSI capsule)
  //     GEO RSI  → .harness-back       (Lab pill)
  //   expand  520ms  floods from that pill
  //   contract 430ms settles into the destination pill
  //   a soft radial core tracks the pill centre so the panel never looks
  //   like a flat colour wipe
  var COVER_KEY = 'geobyte-page-cover';
  var COVER_MS = 520;
  var COVER_OUT_MS = 430;
  var COVER_EASE = 'cubic-bezier(.22, .61, .24, 1)';
  var COVER_EASE_OUT = 'cubic-bezier(.32, .72, .16, 1)';
  var COVER_ORIGIN = '.local-geo-rsi-cta, .harness-back';
  var navigating = false;

  function clipTo(rect, radius) {
    return 'inset(' + Math.round(rect.top) + 'px '
      + Math.round(window.innerWidth - rect.right) + 'px '
      + Math.round(window.innerHeight - rect.bottom) + 'px '
      + Math.round(rect.left) + 'px round ' + radius + ')';
  }
  function clipFull() { return 'inset(0px 0px 0px 0px round 0px)'; }

  function makeCover(color, clip) {
    var panel = document.createElement('div');
    panel.className = 'local-page-cover';
    panel.style.background = color;
    panel.style.clipPath = clip;
    panel.style.webkitClipPath = clip;
    // Soft bloom from the capsule centre so the wipe has depth, not a hard fill.
    var glow = document.createElement('div');
    glow.className = 'local-page-cover-glow';
    panel.appendChild(glow);
    document.body.appendChild(panel);
    return panel;
  }

  function primeCoverGlow(panel, rect) {
    var glow = panel.querySelector('.local-page-cover-glow');
    if (!glow || !rect) return;
    var cx = Math.round(rect.left + rect.width / 2);
    var cy = Math.round(rect.top + rect.height / 2);
    var radius = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(window.innerWidth - cx, cy),
      Math.hypot(cx, window.innerHeight - cy),
      Math.hypot(window.innerWidth - cx, window.innerHeight - cy)
    );
    glow.style.left = cx + 'px';
    glow.style.top = cy + 'px';
    glow.style.width = glow.style.height = Math.ceil(radius * 2) + 'px';
    glow.style.transform = 'translate(-50%, -50%) scale(0.08)';
    glow.style.opacity = '0.85';
  }

  function runClip(panel, clip, ms, ease, expanding) {
    panel.style.transition = 'clip-path ' + ms + 'ms ' + ease;
    panel.style.webkitTransition = '-webkit-clip-path ' + ms + 'ms ' + ease;
    panel.style.clipPath = clip;
    panel.style.webkitClipPath = clip;
    var glow = panel.querySelector('.local-page-cover-glow');
    if (glow) {
      // Scale the soft core with the clip: expand blooms out, contract pulls in.
      glow.style.transition = 'transform ' + ms + 'ms ' + ease + ', opacity ' + Math.round(ms * .7) + 'ms linear';
      if (expanding) {
        glow.style.transform = 'translate(-50%, -50%) scale(1)';
        glow.style.opacity = '0.55';
      } else {
        glow.style.transform = 'translate(-50%, -50%) scale(0.12)';
        glow.style.opacity = '0.95';
      }
    }
  }

  // Resolve on the real transitionend so the navigation starts the moment the
  // screen is covered; the timer is only a safety net for interrupted frames.
  function afterClip(panel, ms, run) {
    var settled = false;
    var timer = window.setTimeout(finish, ms + 180);
    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
      run();
    }
    function onEnd(event) {
      if (event.propertyName === 'clip-path' || event.propertyName === '-webkit-clip-path') finish();
    }
    panel.addEventListener('transitionend', onEnd);
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-geo-rsi-cover]');
    if (!link) return;
    if (navigating || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    var href = link.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    // Always launch from this page’s bottom-right cover control (not the
    // clicked hit-target), so both directions share the same spatial path.
    var origin = document.querySelector(COVER_ORIGIN) || link;
    var style = getComputedStyle(origin);
    var rect = origin.getBoundingClientRect();
    try {
      sessionStorage.setItem(COVER_KEY, JSON.stringify({
        color: style.backgroundColor,
        anchor: link.getAttribute('data-geo-rsi-anchor'),
        from: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
        at: Date.now()
      }));
    } catch (e) {}
    // Warm the document while the clip animates so the covered window is as
    // short as possible (blocked under file://, hence the guard).
    try { if (/^\.{0,2}\//.test(href)) fetch(href, { credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
    if (reduceMotion) { window.location.href = href; return; }

    navigating = true;
    // Nudge the capsule into place for a beat so the expansion origin is crisp.
    link.classList.add('is-leaving');
    var panel = makeCover(style.backgroundColor, clipTo(rect, style.borderTopLeftRadius));
    primeCoverGlow(panel, rect);
    void panel.offsetWidth;
    // Double rAF: ensure the start clip is committed before the end state.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        runClip(panel, clipFull(), COVER_MS, COVER_EASE, true);
        afterClip(panel, COVER_MS, function () { window.location.href = href; });
      });
    });
  });

  function revealFromCover() {
    var raw;
    try { raw = sessionStorage.getItem(COVER_KEY); sessionStorage.removeItem(COVER_KEY); } catch (e) { return; }
    if (!raw || reduceMotion) {
      // Nothing to animate: hand the pre-painted panel back to the page.
      var stray = document.getElementById('geobyte-cover');
      if (stray) { stray.remove(); document.dispatchEvent(new CustomEvent('geobyte:cover-done')); }
      return;
    }
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || !data.color || Date.now() - (data.at || 0) > 4000) {
      var stale = document.getElementById('geobyte-cover');
      if (stale) { stale.remove(); document.dispatchEvent(new CustomEvent('geobyte:cover-done')); }
      return;
    }
    var anchor = data.anchor && document.querySelector(data.anchor);
    // Reuse the panel the boot script already painted, so there is no gap
    // between first paint and the contraction.
    var panel = document.getElementById('geobyte-cover');
    if (panel) {
      panel.className = 'local-page-cover';
      panel.style.background = data.color;
      panel.style.clipPath = clipFull();
      panel.style.webkitClipPath = clipFull();
      var glow = document.createElement('div');
      glow.className = 'local-page-cover-glow';
      panel.appendChild(glow);
      // Bloom was centred on the outgoing capsule; pull it toward the badge
      // for the return so the two pages feel spatially continuous.
      var from = data.from || { x: window.innerWidth * .5, y: window.innerHeight * .5 };
      primeCoverGlow(panel, { left: from.x - 1, top: from.y - 1, width: 2, height: 2 });
    } else {
      panel = makeCover(data.color, clipFull());
    }
    // Content can already fade in beneath the cover while it contracts.
    // Do not lock scrolling: overflow:hidden hides the scrollbar and shifts
    // layout by the gutter, which reads as a hitch during the transition.
    document.documentElement.classList.add('local-nav-arriving');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (anchor) {
          runClip(panel, clipTo(anchor.getBoundingClientRect(), getComputedStyle(anchor).borderTopLeftRadius), COVER_OUT_MS, COVER_EASE_OUT, false);
          afterClip(panel, COVER_OUT_MS, function () {
            panel.style.transition = 'opacity 160ms cubic-bezier(.22, 1, .36, 1)';
            panel.style.opacity = '0';
            window.setTimeout(function () {
              panel.remove();
              document.documentElement.classList.remove('local-nav-arriving');
              document.dispatchEvent(new CustomEvent('geobyte:cover-done'));
            }, 170);
          });
        } else {
          panel.style.transition = 'opacity 220ms cubic-bezier(.22, 1, .36, 1)';
          panel.style.opacity = '0';
          window.setTimeout(function () {
            panel.remove();
            document.documentElement.classList.remove('local-nav-arriving');
            document.dispatchEvent(new CustomEvent('geobyte:cover-done'));
          }, 230);
        }
      });
    });
  }

  /* ---------- scrolling, reveals, and activity ---------- */
  var header = q('header');
  var revealTargets = qa('figure, [data-testid="citations"], main section:not(:first-child)');
  revealTargets.forEach(function (target) { target.classList.add('local-reveal'); });
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) entry.target.classList.add('local-visible'); });
    }, { threshold: .08 });
    revealTargets.forEach(function (target) { revealObserver.observe(target); });
  } else revealTargets.forEach(function (target) { target.classList.add('local-visible'); });

  function updateScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    var vh = window.innerHeight;
    var max = Math.max(1, document.documentElement.scrollHeight - vh);
    root.style.setProperty('--local-scroll-progress', (y / max).toFixed(4));
    if (header) header.classList.toggle('local-scrolled', y > 8);

    if (hero && heroField) {
      var heroRect = hero.getBoundingClientRect();
      var heroProgress = clamp(-heroRect.top / Math.max(vh * .85, 1), 0, 1);
      root.style.setProperty('--astra-copy-opacity', (1 - heroProgress).toFixed(3));
      root.style.setProperty('--astra-title-parallax-y', (-heroProgress * 42).toFixed(1) + 'px');
      heroField.setProgress(heroProgress);
      heroField.setActive(heroRect.bottom > -80 && heroRect.top < vh + 80);
    }

    cueFields.forEach(function (item) {
      var rect = item.parent.getBoundingClientRect();
      var cueProgress = clamp((vh * .78 - rect.top) / Math.max(rect.height + vh * .25, 1), 0, 1);
      item.field.setProgress(cueProgress);
      item.field.setActive(rect.bottom > -100 && rect.top < vh + 100);
    });
  }
  addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  var search = q('[aria-label="Search Geobyte"], [aria-label="Search"]');
  if (search) search.addEventListener('click', function () {
    var query = window.prompt('Search this page');
    if (!query) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if ((node.nodeValue || '').toLowerCase().indexOf(query.toLowerCase()) !== -1) {
        node.parentElement.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }
    }
  });

  root.dataset.localEffects = 'ready';
})();
