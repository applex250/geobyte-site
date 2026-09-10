/* GEO RSI page — local canvas plot of a normalised spectral response curve.
   Self-contained: no remote scripts, no chart library. Redraws on slider
   input, resize, and theme change. */
(function () {
  'use strict';

  var root = document.documentElement;
  var canvas = document.querySelector('.rsi-plot');
  var readout = document.querySelector('.rsi-readout-value');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var sliders = Array.prototype.slice.call(document.querySelectorAll('[data-rsi-key]'));
  var dpr = 1;
  var width = 1;
  var height = 1;

  var state = { clay: 62, fe: 28, quartz: 41, gain: 70 };
  sliders.forEach(function (s) { state[s.dataset.rsiKey] = +s.value; });

  // Wavelength axis in micrometres: VNIR through SWIR into TIR.
  var LAMBDA0 = 0.5;
  var LAMBDA1 = 12.5;
  var SAMPLES = 320;

  function gauss(x, centre, width_, depth) {
    var d = (x - centre) / width_;
    return depth * Math.exp(-d * d);
  }

  // Continuum rises across the visible/SWIR, then each absorption band is a
  // Gaussian dip scaled by its slider.
  function spectrum(x) {
    var t = (x - LAMBDA0) / (LAMBDA1 - LAMBDA0);
    var continuum = 0.34 + 0.42 * Math.pow(t, 0.62);
    continuum -= 0.05 * Math.exp(-Math.pow((x - 1.4) / 0.09, 2));   // hyroxyl
    continuum -= gauss(x, 2.2, 0.075, state.clay / 320);            // Al-OH
    continuum -= gauss(x, 2.35, 0.06, state.fe / 420);              // Fe-OH
    continuum -= gauss(x, 1.9, 0.05, state.fe / 900);               // Mg-OH shoulder
    continuum += gauss(x, 8.6, 0.9, state.quartz / 900);            // TIR restlen
    continuum *= 0.55 + state.gain / 145;
    return Math.max(0.02, Math.min(1, continuum));
  }

  // RSI: strongest shoulder-to-core ratio inside the SWIR window.
  function index() {
    var best = 0;
    [[2.2, 0.075, 'Al-OH'], [2.35, 0.06, 'Fe-OH'], [1.9, 0.05, 'Mg-OH']].forEach(function (band) {
      var core = 1;
      var shoulder = 0;
      for (var i = 0; i <= 24; i++) {
        var x = band[0] - 0.25 + (i / 24) * 0.5;
        var v = spectrum(x);
        if (Math.abs(x - band[0]) < band[1] * 0.5) core = Math.min(core, v);
        else if (Math.abs(x - band[0]) > band[1] * 1.8) shoulder = Math.max(shoulder, v);
      }
      var r = (shoulder - core) / Math.max(0.05, shoulder);
      if (r > best) best = r;
    });
    return best;
  }

  function palette() {
    var light = root.classList.contains('light');
    return light
      ? { grid: 'rgba(60,80,110,.16)', axis: 'rgba(60,80,110,.45)', curve: 'rgb(58,104,158)', fill: 'rgba(116,162,206,.20)', mark: 'rgb(128,106,84)', text: 'rgba(50,62,80,.75)' }
      : { grid: 'rgba(150,185,255,.13)', axis: 'rgba(160,195,255,.34)', curve: 'rgb(141,196,255)', fill: 'rgba(80,140,220,.16)', mark: 'rgb(255,205,150)', text: 'rgba(200,218,245,.62)' };
  }

  function resize() {
    var bounds = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, bounds.width || 640);
    height = Math.max(1, bounds.height || 420);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    var pal = palette();
    var padL = 46;
    var padR = 18;
    var padT = 22;
    var padB = 38;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;
    var xOf = function (x) { return padL + ((x - LAMBDA0) / (LAMBDA1 - LAMBDA0)) * plotW; };
    var yOf = function (v) { return padT + (1 - v) * plotH; };

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = pal.text;
    [0.25, 0.5, 0.75, 1].forEach(function (v) {
      var y = Math.round(yOf(v)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(2), padL - 8, y);
    });
    [1, 2, 4, 6, 8, 10, 12].forEach(function (x) {
      var px = Math.round(xOf(x)) + .5;
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, height - padB); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(x + 'µm', px, height - padB + 8);
    });

    ctx.strokeStyle = pal.axis;
    ctx.beginPath();
    ctx.moveTo(padL + .5, padT); ctx.lineTo(padL + .5, height - padB + .5); ctx.lineTo(width - padR, height - padB + .5);
    ctx.stroke();

    // Curve with a soft fill under it.
    var pts = [];
    for (var i = 0; i <= SAMPLES; i++) {
      var lx = LAMBDA0 + (i / SAMPLES) * (LAMBDA1 - LAMBDA0);
      pts.push([xOf(lx), yOf(spectrum(lx))]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], height - padB);
    pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    ctx.lineTo(pts[pts.length - 1][0], height - padB);
    ctx.closePath();
    ctx.fillStyle = pal.fill;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(function (p, k) { k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.strokeStyle = pal.curve;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Band markers for the three features the index watches.
    [[2.2, 'Al-OH'], [2.35, 'Fe-OH'], [8.6, 'TIR']].forEach(function (band) {
      var px = xOf(band[0]);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = pal.mark;
      ctx.globalAlpha = .55;
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, height - padB); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.mark;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(band[1], px, padT - 4);
    });

    if (readout) readout.textContent = index().toFixed(2);
  }

  sliders.forEach(function (s) {
    s.addEventListener('input', function () {
      state[s.dataset.rsiKey] = +s.value;
      draw();
    });
  });

  // The shared theme button flips a class on <html>; mirror that into the plot.
  document.addEventListener('geobyte:theme', draw);
  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  resize();
})();
