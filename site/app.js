import {
  parseUsd,
  formatUsd,
  parseUnits,
  formatUnits,
  divRound,
  defineCurrency,
  pointsForPayout,
  pointsToUsd,
  usdToPoints,
  giftCardCost,
  checkCashout,
  activeBonusBps,
  applyReversal,
  inflationCheck,
  ROUNDING_MODES,
} from './src/index.js';

const DAY0 = Date.UTC(2026, 10, 12) / 1000;
const BASE = {
  payout: '0.85', rate: '1000', share: '60', decimals: '0', rounding: 'floor',
  bonusOn: true, bonus: '10', from: '18:00', to: '20:00', at: '18:30',
  revBalance: '400', negative: true,
  face: '5', fee: '0', minimum: '5', balance: '4500', redemption: '',
};
const PRESETS = [
  { label: 'README example', set: {}, hint: '$0.85 at 1,000 points per $1, a 60% share and a 10% bonus: 0.85 x 1000 x 60% x 110% = 561 points.' },
  { label: 'Small step, $0.019', set: { payout: '0.019', share: '50', bonusOn: false }, hint: 'The exact reward is 9.5 points. Floor credits 9 and never pays more than the share; half-up would credit 10.' },
  { label: 'Bonus above revenue', set: { payout: '0.50', share: '50', bonus: '150' }, hint: 'A 150% bonus on a 50% share hands users 125% of the payout. The inflation check flags it.' },
  { label: 'Dollars, 3 decimals', set: { payout: '0.75', rate: '1', share: '50', decimals: '3', bonusOn: false, revBalance: '0.2', minimum: '1', balance: '4.7' }, hint: 'Rate 1 with 3 decimals pays users in dollars: $0.75 at a 50% share is 0.375.' },
  { label: 'Moonetix docs, 275', set: { payout: '0.50', share: '50', rounding: 'half-up' }, hint: 'The Moonetix rewards docs example: $0.50 x 1000 x 50% x 110% = 275, halves rounded up.' },
  { label: 'Cheap shop rate', set: { payout: '1', rate: '100', share: '90', bonusOn: false, redemption: '80', face: '5', minimum: '5', balance: '300' }, hint: 'Earning at 100 points per $1 but redeeming at 80 makes points worth more on the way out than they cost on the way in.' },
];
const FIELDS = Object.keys(BASE);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function group(text) {
  const neg = text.startsWith('-');
  const [w, f] = (neg ? text.slice(1) : text).split('.');
  return (neg ? '-' : '') + w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
}

function usd(micros) {
  const t = formatUsd(micros);
  const [w, f = ''] = t.replace('-', '').split('.');
  return `${t.startsWith('-') ? '-' : ''}$${group(w)}.${f.padEnd(2, '0')}`;
}

function show(v) {
  if (typeof v === 'bigint') return `${v}n`;
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null || typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(show).join(', ')}]`;
  return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(', ')} }`;
}

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const TIME_LABELS = { from: 'Daily from', to: 'Until', at: 'Offer completed at' };

function checkTimes(v) {
  const bad = [];
  for (const k of Object.keys(TIME_LABELS)) {
    const ok = !v.bonusOn || TIME.test(v[k]);
    $(k).setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok) bad.push(TIME_LABELS[k]);
  }
  const box = $('time-err');
  box.textContent = bad.length ? `${bad.join(', ')}: enter a 24-hour time such as 18:30.` : '';
  box.hidden = bad.length === 0;
  if (bad.length) throw new RangeError(`${bad.join(', ')} must be a 24-hour time such as 18:30`);
}

function secs(hhmm) {
  const m = TIME.exec(hhmm);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

function read() {
  const v = {};
  for (const k of FIELDS) {
    const el = $(k);
    v[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  return v;
}

function fill(values) {
  for (const k of FIELDS) {
    const el = $(k);
    if (el.type === 'checkbox') el.checked = values[k];
    else el.value = values[k];
  }
}

function err(e) {
  return `<p class="err" role="alert">${esc(e.message)}</p>`;
}

function row(k, v, cls = '') {
  return `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
}

function compute(heroName) {
  const v = read();
  const calls = [];
  const call = (text, fn) => {
    const r = fn();
    calls.push(`${text}\n  -> ${show(r)}`);
    return r;
  };
  const decimals = Number(v.decimals);
  const pts = (u) => group(formatUnits(u, decimals));
  const word = (u) => (pts(u) === '1' ? 'point' : 'points');

  let payout;
  let currency;
  let config;
  let bonusBps = 0;
  let bonusText = 'None';
  let credited;
  try {
    payout = call(`parseUsd(${show(v.payout)})`, () => parseUsd(v.payout));
    const shareBps = Number(call(`parseUnits(${show(v.share)}, 2)`, () => parseUnits(v.share, 2)));
    config = { rate: v.rate, userShareBps: shareBps, decimals, rounding: v.rounding };
    if (v.redemption !== '') config.redemptionRate = v.redemption;
    currency = call(`defineCurrency(${show(config)})`, () => defineCurrency(config));
    checkTimes(v);
    if (v.bonusOn) {
      const windowBps = Number(call(`parseUnits(${show(v.bonus)}, 2)`, () => parseUnits(v.bonus, 2)));
      const start = DAY0 + secs(v.from);
      let end = DAY0 + secs(v.to);
      if (end <= start) end += 86400;
      const windows = [{ bonusBps: windowBps, start, end, repeat: 'daily' }];
      const at = DAY0 + 86400 + secs(v.at);
      bonusBps = call(`activeBonusBps(${show(windows)}, ${at})`, () => activeBonusBps(windows, at));
      bonusText = bonusBps > 0
        ? `+${formatUnits(bonusBps, 2)}%, active at ${v.at} UTC`
        : `None, the ${v.from} to ${v.to} UTC window is not active at ${v.at}`;
    }
    credited = call(`pointsForPayout(${show(payout)}, currency, { bonusBps: ${bonusBps} })`, () => pointsForPayout(payout, currency, { bonusBps }));
  } catch (e) {
    $('receipt-tag').innerHTML = '<span class="tag bad">input error</span>';
    $('receipt').innerHTML = `${err(e)}<p class="small muted fix">Correct the input to see the result. The message above comes from the library.</p>`;
    for (const id of ['credit', 'rev', 'cash', 'infl']) $(id).innerHTML = '<p class="muted">Waiting for valid inputs.</p>';
    renderWhy(v, null, 0);
    $('calls').textContent = calls.join('\n\n');
    return;
  }

  const modes = ROUNDING_MODES.map((m) => {
    const p = pointsForPayout(payout, { ...config, rounding: m }, { bonusBps });
    return `<li class="${m === currency.rounding ? 'on' : ''}"><span>${m}</span><b>${pts(p)}</b></li>`;
  }).join('');
  let fine = null;
  try {
    fine = call(`pointsForPayout(${show(payout)}, { ...config, decimals: 6, rounding: "floor" }, { bonusBps: ${bonusBps} })`, () => pointsForPayout(payout, { ...config, decimals: 6, rounding: 'floor' }, { bonusBps }));
  } catch {
    fine = null;
  }
  const value = call(`pointsToUsd(${show(credited)}, currency)`, () => pointsToUsd(credited, currency));
  let over = false;
  let split = '<p class="small muted">A payout of $0.00 leaves nothing to split.</p>';
  if (payout > 0n) {
    const userBps = call(`divRound(${show(value)} * 10000n, ${show(payout)})`, () => divRound(value * 10000n, payout));
    over = value > payout;
    const rest = over ? value - payout : payout - value;
    const keep = over ? `You add <b>${usd(rest)}</b> of your own` : `You keep <b>${usd(rest)}</b> (${formatUnits(10000n - userBps, 2)}%)`;
    split = `
      <div class="split${over ? ' over' : ''}" aria-hidden="true"><span class="split-user" data-w="${over ? 100 : Number(userBps) / 100}"></span><span class="split-keep"></span></div>
      <ul class="split-key">
        <li><span class="sw sw-user" aria-hidden="true"></span><span>Users get <b>${usd(value)}</b> (${formatUnits(userBps, 2)}%)</span></li>
        <li>${over ? '' : '<span class="sw sw-keep" aria-hidden="true"></span>'}<span>${keep}</span></li>
      </ul>`;
  }
  $('receipt-tag').innerHTML = over ? '<span class="tag bad">exceeds revenue</span>' : '';
  const receipt = `
    <p class="big total"><b>${pts(credited)}</b> <span>${word(credited)} credited</span></p>
    <p class="worth">Worth <b>${usd(value)}</b> at cash-out.</p>
    <dl class="kv slip">
      ${row('Offer payout', usd(payout))}
      ${row('User share', `${formatUnits(currency.userShareBps, 2)}%`)}
      ${row('Bonus', esc(bonusText))}
    </dl>
    <h4>Split of this ${usd(payout)} payout</h4>
    ${split}`;
  $('receipt').innerHTML = receipt;
  if (heroName) {
    $('hero-name').textContent = heroName;
    $('hero-preview').innerHTML = receipt;
  }
  for (const el of document.querySelectorAll('.split [data-w]')) el.style.width = `${el.dataset.w}%`;

  $('credit').innerHTML = `
    <dl class="kv">
      ${row('Formula', `${esc(v.payout)} x ${esc(currency.rate)} x ${formatUnits(currency.userShareBps, 2)}% x ${formatUnits(10000 + bonusBps, 2)}%`)}
      ${row('Before rounding (6 decimals)', fine === null ? 'Too large to show' : `<span class="mono">${group(formatUnits(fine, 6))}</span>`)}
      ${row(`Credited, ${esc(currency.rounding)}`, `<b>${pts(credited)}</b> ${word(credited)}`)}
    </dl>
    <p class="small muted">The same credit in each rounding mode:</p>
    <ul class="modes">${modes}</ul>`;

  renderWhy(v, fine, bonusBps);

  try {
    const balance = call(`parseUnits(${show(v.revBalance)}, ${decimals})`, () => parseUnits(v.revBalance, decimals));
    const args = { balance, credited, allowNegativeBalance: v.negative };
    const r = call(`applyReversal(${show(args)})`, () => applyReversal(args));
    $('rev').innerHTML = `
      <dl class="kv">
        ${row('Taken back', `<b>${pts(r.reversed)}</b> ${word(r.reversed)}, exactly what was credited`)}
        ${row('Balance', `${pts(balance)} to <b class="${r.newBalance < 0n ? 'neg' : ''}">${pts(r.newBalance)}</b>`)}
        ${row('Uncollected', `${pts(r.uncollected)}${r.uncollected > 0n ? ' <span class="tag warn">loss to record</span>' : ''}`)}
      </dl>
      <p class="small muted">${v.negative ? 'A negative balance keeps the books exact and blocks the next cash-out until it is earned back.' : 'The balance stops at zero and the rest is returned as uncollected.'}</p>`;
  } catch (e) {
    $('rev').innerHTML = err(e);
  }

  let cost = null;
  let face = null;
  try {
    face = call(`parseUsd(${show(v.face)})`, () => parseUsd(v.face));
    const feeBps = Number(call(`parseUnits(${show(v.fee)}, 2)`, () => parseUnits(v.fee, 2)));
    cost = call(`giftCardCost(${show(face)}, currency, { feeBps: ${feeBps} })`, () => giftCardCost(face, currency, { feeBps }));
    const minUsd = call(`parseUsd(${show(v.minimum)})`, () => parseUsd(v.minimum));
    const minimum = call(`usdToPoints(${show(minUsd)}, currency)`, () => usdToPoints(minUsd, currency));
    const before = call(`parseUnits(${show(v.balance)}, ${decimals})`, () => parseUnits(v.balance, decimals));
    const balance = before + credited;
    const args = { balance, cost, minimum };
    const c = call(`checkCashout(${show(args)})`, () => checkCashout(args));
    const verdict = c.ok
      ? '<span class="tag good">can cash out</span>'
      : `<span class="tag warn">${c.reason === 'below_minimum' ? 'below the minimum' : `needs ${pts(c.shortfall)} more`}</span>`;
    $('cash').innerHTML = `
      <p class="big"><b>${pts(cost)}</b> <span>${word(cost)} for a ${usd(face)} reward</span></p>
      <dl class="kv">
        ${row('Minimum cash-out', `${pts(minimum)} ${word(minimum)} (${usd(minUsd)})`)}
        ${row('Balance after this offer', `${pts(before)} + ${pts(credited)} = ${pts(balance)}`)}
        ${row('Check', verdict)}
      </dl>
      <p class="small muted">Prices round up and values round down, so a reward is never sold below its cost.</p>`;
  } catch (e) {
    $('cash').innerHTML = err(e);
  }

  try {
    const plain = call(`inflationCheck(currency, { bonusBps: ${bonusBps} })`, () => inflationCheck(currency, { bonusBps }));
    let card = null;
    if (cost !== null && cost > 0n) {
      const opts = { bonusBps, giftCard: { faceMicros: face, cost } };
      card = call(`inflationCheck(currency, ${show(opts)})`, () => inflationCheck(currency, opts));
    }
    const line = (label, r) => `<tr><th scope="row">${label}</th><td class="r">${usd(r.valuePer1000PointsMicros)}</td><td class="r">${usd(r.revenuePer1000PointsMicros)}</td><td class="r">${formatUnits(r.effectiveUserShareBps, 2)}%${r.exceedsRevenue ? ' <span class="tag bad">exceeds revenue</span>' : ''}</td></tr>`;
    $('infl').innerHTML = `
      <table><thead><tr><th scope="col">1,000 points</th><th scope="col" class="r">Value</th><th scope="col" class="r">Payout behind</th><th scope="col" class="r">Share</th></tr></thead>
      <tbody>${line('At cash-out rate', plain)}${card ? line('As this reward', card) : ''}</tbody></table>
      <p class="small muted">Above 100% you pay users more than the offers earned.</p>`;
  } catch (e) {
    $('infl').innerHTML = err(e);
  }

  $('calls').textContent = calls.join('\n\n');
}

function renderWhy(v, fine, bonusBps) {
  const demo = pointsForPayout(parseUsd('0.29'), { rate: '100', userShareBps: 10000 });
  const float = 0.29 * 100;
  const short = Number(demo) - Math.floor(float);
  $('why-float-tag').innerHTML = short > 0 ? `<span class="tag bad">${short} point${short === 1 ? '' : 's'} short</span>` : '';
  $('why-int-tag').innerHTML = '<span class="tag good">exact</span>';
  $('why-float').innerHTML = `
    <p class="cmp-v">${float}</p>
    <p class="cmp-code"><code>0.29 * 100</code></p>
    <p class="small">Floating point cannot store most decimal amounts exactly, so a floor credits ${Math.floor(float)} points for a 29-point offer. A reversal recomputed the same way can take back a different number than was credited.</p>`;
  $('why-int').innerHTML = `
    <p class="cmp-v">${show(demo)}</p>
    <p class="cmp-code"><code>pointsForPayout(parseUsd('0.29'), { rate: '100', userShareBps: 10000 })</code></p>
    <p class="small">This kit holds money as integer micro-dollars (<code>parseUsd('0.29')</code> is <code>${show(parseUsd('0.29'))}</code>) and points as integer units, multiplies everything as one BigInt product and rounds once.</p>`;
  if (fine === null) {
    $('why-mine').textContent = '';
    return;
  }
  const f = parseFloat(v.payout) * parseFloat(v.rate) * (parseFloat(v.share) / 100) * (1 + bonusBps / 10000);
  $('why-mine').innerHTML = `Your inputs as one floating point expression: <code>${esc(String(f))}</code>. Exact, from the library: <code>${group(formatUnits(fine, 6))}</code>.`;
}

const TICK = '<svg class="ic tick" aria-hidden="true" focusable="false"><use href="#i-check"/></svg>';

function markPreset(i) {
  for (const b of $('presets').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.i === String(i)));
}

$('presets').innerHTML = PRESETS.map((p, i) => `<button class="btn" type="button" data-i="${i}" aria-pressed="${i === 0}">${TICK}${esc(p.label)}</button>`).join('');
$('presets').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-i]');
  if (!b) return;
  const p = PRESETS[Number(b.dataset.i)];
  fill({ ...BASE, ...p.set });
  $('hint').textContent = p.hint;
  markPreset(b.dataset.i);
  compute();
});
$('form').addEventListener('input', () => {
  $('hint').textContent = 'Custom inputs. Pick an example to reset them.';
  markPreset(-1);
  compute();
});
$('form').addEventListener('submit', (ev) => ev.preventDefault());

fill(BASE);
$('hint').textContent = PRESETS[0].hint;
compute(PRESETS[0].label);
