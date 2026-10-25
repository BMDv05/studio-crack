/* Studio line-art tracer — dev tool UI.
 *
 * Loads the studio photograph, traces it into organized architectural line
 * work, previews the result, and exports `studio.lines.svg` whose viewBox
 * equals the photograph's pixel dimensions (so the runtime layer aligns with
 * the <img> exactly).
 *
 * Dev-only: served by Vite in development, excluded from the production build
 * because only index.html is a build entry. See public/studio/README.md.
 */
import { traceImageData, buildSvg, STAGE_STYLE } from './trace-core.js';
import { drawTestInterior, SAMPLE_SIZE } from './sampleScene.js';

const WORK_MAX = 2000; // longest traced side, in pixels

const DEFAULT_PARAMS = {
  low: 0.09,
  high: 0.2,
  blurRadius: 1,
  detail: 1,
  minLineFactor: 0.035,
};

const STAGE_COLORS = {
  1: '#46766f',
  2: '#e6ecec',
  3: '#7fb3ab',
  4: '#cfd8d8',
  5: '#5f7c78',
};

const state = {
  img: null,
  name: 'studio',
  work: null,
  result: null,
  params: { ...DEFAULT_PARAMS },
  solo: 0,
};

const $ = (id) => document.getElementById(id);

/* ----------------------------------------------------------------- loading */

async function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not read that file as an image.'));
    img.src = url;
  });
  URL.revokeObjectURL(url);

  state.img = img;
  state.name = (file.name || 'studio').replace(/\.[^.]+$/, '');

  const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  state.work = { w, h, data: ctx.getImageData(0, 0, w, h) };
  $('meta').textContent = `${file.name} — ${img.naturalWidth}×${img.naturalHeight}px · traced at ${w}×${h}px`;
  $('export').disabled = false;
  $('copy').disabled = false;
  run();
}

/* ------------------------------------------------------------------ trace */

function run() {
  if (!state.work) return;
  $('status').textContent = 'Tracing…';
  $('status').dataset.busy = 'true';
  // Let the browser paint the status before the (synchronous) trace.
  requestAnimationFrame(() => {
    const started = performance.now();
    let result;
    try {
      result = traceImageData(state.work.data, state.params);
    } catch (err) {
      $('status').textContent = `Trace failed: ${err.message}`;
      $('status').dataset.busy = 'false';
      return;
    }
    const ms = performance.now() - started;
    state.result = result;
    paint();
    report(ms);
    $('status').textContent = `Traced in ${Math.round(ms)}ms`;
    $('status').dataset.busy = 'false';
  });
}

/* ---------------------------------------------------------------- preview */

function paint() {
  const { w, h } = state.work;
  const view = $('view');
  view.width = w;
  view.height = h;
  const ctx = view.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(state.img, 0, 0, w, h);
  ctx.fillStyle = 'rgba(13,18,18,0.62)';
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Detail first so structure reads on top.
  for (const n of [5, 4, 3, 1, 2]) {
    if (state.solo && state.solo !== n) continue;
    const items = state.result.stages[n] || [];
    if (!items.length) continue;
    ctx.strokeStyle = STAGE_COLORS[n];
    ctx.lineWidth = Math.max(1, STAGE_STYLE[n].width * 1.5);
    ctx.beginPath();
    for (const item of items) {
      if (Array.isArray(item)) {
        ctx.moveTo(item[0][0], item[0][1]);
        for (let i = 1; i < item.length; i += 1) ctx.lineTo(item[i][0], item[i][1]);
      } else {
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
      }
    }
    ctx.stroke();
  }
}

function report(ms) {
  const rows = [1, 2, 3, 4, 5].map((n) => {
    const items = state.result.stages[n] || [];
    let length = 0;
    let points = 0;
    for (const item of items) {
      if (Array.isArray(item)) {
        points += item.length;
        for (let i = 1; i < item.length; i += 1) {
          length += Math.hypot(item[i][0] - item[i - 1][0], item[i][1] - item[i - 1][1]);
        }
      } else {
        points += 2;
        length += item.length;
      }
    }
    const scale = state.img.naturalWidth / state.work.w;
    return {
      n,
      name: STAGE_STYLE[n].name,
      count: items.length,
      points,
      length: Math.round(length * scale),
    };
  });

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  $('stats').innerHTML = [
    `<span class="stat"><b>${total}</b> strokes</span>`,
    `<span class="stat"><b>${Math.round(ms)}</b> ms</span>`,
    ...rows.map((row) => (
      `<span class="stat stage" style="--c:${STAGE_COLORS[row.n]}">`
      + `<i></i>${row.n} · ${row.name}<b>${row.count}</b>`
      + `<em>${row.points} pts · ${row.length}px</em></span>`
    )),
  ].join('');

  const empty = rows.filter((row) => row.count === 0).map((row) => row.name);
  $('warn').textContent = empty.length
    ? `No strokes landed in: ${empty.join(', ')}. Loosen the thresholds or raise Detail.`
    : '';
}

/* ------------------------------------------------------------------ export */

function svgText() {
  const { result, img, work, name } = state;
  const scale = img.naturalWidth / work.w;
  const stages = {};
  for (const n of [1, 2, 3, 4, 5]) {
    stages[n] = (result.stages[n] || []).map((item) => (Array.isArray(item)
      ? item.map(([x, y]) => [x * scale, y * scale])
      : {
        x1: item.x1 * scale,
        y1: item.y1 * scale,
        x2: item.x2 * scale,
        y2: item.y2 * scale,
      }));
  }
  return buildSvg({ w: img.naturalWidth, h: img.naturalHeight, stages, source: name });
}

function exportSvg() {
  if (!state.result) return;
  const blob = new Blob([svgText()], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'studio.lines.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------------------------------------- test scene */

/* Exercises the tracer without a real photograph: the scene is drawn in code,
   so it is obviously not the studio. Used to sanity-check thresholds. */
async function loadSample() {
  const { width, height } = SAMPLE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  drawTestInterior(ctx, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  await loadFile(new File([blob], 'test-interior.png', { type: 'image/png' }));
}

/* -------------------------------------------------------------------- wire */

function bindControls() {
  for (const input of document.querySelectorAll('[data-param]')) {
    const key = input.dataset.param;
    input.value = String(state.params[key]);
    const out = document.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = String(state.params[key]);
    input.addEventListener('input', () => {
      if (out) out.textContent = Number(input.value).toFixed(key === 'blurRadius' ? 0 : 3).replace(/0+$/, '').replace(/\.$/, '');
    });
    input.addEventListener('change', () => {
      state.params[key] = Number(input.value);
      run();
    });
  }

  $('file').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    loadFile(file).catch((err) => {
      $('meta').textContent = err.message;
    });
  });

  for (const button of document.querySelectorAll('[data-solo]')) {
    button.addEventListener('click', () => {
      const value = Number(button.dataset.solo);
      state.solo = state.solo === value ? 0 : value;
      for (const b of document.querySelectorAll('[data-solo]')) {
        b.dataset.active = String(Number(b.dataset.solo) === state.solo);
      }
      if (state.result) paint();
    });
  }

  $('export').addEventListener('click', exportSvg);
  $('copy').addEventListener('click', async () => {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(svgText());
      $('status').textContent = 'SVG copied to the clipboard';
    } catch {
      $('status').textContent = 'Clipboard blocked — use Export instead';
    }
  });

  $('sample').addEventListener('click', () => {
    loadSample().catch((err) => { $('meta').textContent = err.message; });
  });

  $('reset').addEventListener('click', () => {
    state.params = { ...DEFAULT_PARAMS };
    state.solo = 0;
    for (const input of document.querySelectorAll('[data-param]')) {
      const key = input.dataset.param;
      input.value = String(state.params[key]);
      const out = document.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = String(state.params[key]);
    }
    for (const b of document.querySelectorAll('[data-solo]')) b.dataset.active = 'false';
    run();
  });

  /* Drag and drop onto the page. */
  const drop = $('drop');
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.dataset.over = 'true';
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, () => { drop.dataset.over = 'false'; });
  }
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadFile(file).catch((err) => { $('meta').textContent = err.message; });
  });
}

bindControls();
