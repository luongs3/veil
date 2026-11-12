import './style.css';
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { firebaseConfig, RECAPTCHA_SITE_KEY, CLOUD_MODEL } from './config.js';
import { regexScan, applyRedactions, rehydrate, leakCheck } from './redact.js';
import { SAMPLES } from './samples.js';

const app = initializeApp(firebaseConfig);
if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
const ai = getAI(app, { backend: new GoogleAIBackend() });

const deviceOpts = {
  createOptions: {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  },
};
const NER_TYPES = ['PERSON', 'ORG', 'ADDRESS', 'LOCATION', 'DATE', 'PHONE', 'EMAIL', 'ID'];
const nerJsonSchema = {
  type: 'object',
  properties: { entities: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, type: { type: 'string', enum: NER_TYPES } }, required: ['text', 'type'] } } },
  required: ['entities'],
};
// Stage 1: on-device only, JSON-constrained decoding on Gemini Nano. Raw text never takes the cloud path.
const localModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: { ...deviceOpts, promptOptions: { responseConstraint: nerJsonSchema } },
});
// Stage 2: cloud only. Receives redacted text exclusively.
const cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: CLOUD_MODEL } });
// Low-stakes helper (title of an already-redacted note): true hybrid, prefer on-device, fall back to cloud.
const quickModel = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, onDeviceParams: deviceOpts, inCloudParams: { model: CLOUD_MODEL } });

const $ = (id) => document.getElementById(id);
const log = (msg, kind = '') => {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  $('log').prepend(li);
};

let deviceReady = false;
let lastRedacted = '';

async function probeDevice() {
  const badge = $('device');
  if (typeof LanguageModel === 'undefined') {
    badge.textContent = 'On-device model: not in this browser → deterministic shield only';
    badge.className = 'badge warn';
    return;
  }
  const a = await LanguageModel.availability(deviceOpts.createOptions);
  badge.textContent = `On-device Gemini Nano: ${a}`;
  badge.className = 'badge ' + (a === 'available' ? 'ok' : 'warn');
  deviceReady = a === 'available';
  $('download').hidden = !(a === 'downloadable' || a === 'downloading');
}

$('download').onclick = async () => {
  $('download').disabled = true;
  try {
    await localModel.initializeDeviceModel((p) => { $('device').textContent = `Downloading Gemini Nano… ${Math.round(p * 100)}%`; });
  } catch (e) { log(`Download failed: ${e.message}`, 'bad'); }
  await probeDevice();
};

const NER_PROMPT = (text) => `List every personal-data item (person names, street addresses, cities, organizations, dates, phone numbers, emails, ID numbers) in this text, copying each exactly as it appears.

TEXT:
${text}`;

// Drop model hits that are too generic to redact safely (bare small numbers, weekdays).
const tooGeneric = (v) => /^\d{1,4}$/.test(v) || /^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(v);

async function localNer(text) {
  if (!deviceReady) { log('Gemini Nano unavailable → regex shield only (cloud still sees no raw text)', 'warn'); return []; }
  const t0 = performance.now();
  const res = await localModel.generateContent(NER_PROMPT(text));
  let ents = [];
  try { ents = (JSON.parse(res.response.text()).entities || []).filter((e) => e.text && text.includes(e.text) && !tooGeneric(e.text.trim())); }
  catch { log('Nano returned non-JSON; regex shield only', 'warn'); }
  log(`Gemini Nano found ${ents.length} entities on-device in ${Math.round(performance.now() - t0)} ms [${res.response.inferenceSource}]`, 'dev');
  return ents;
}

async function run() {
  const raw = $('input').value.trim();
  const task = $('task').value.trim() || 'Summarize this and list the next actions.';
  if (!raw) return;
  $('go').disabled = true;
  for (const id of ['out', 'out-raw', 'sent']) $(id).textContent = '';
  $('map').innerHTML = '';
  try {
    // Stage 1 — on-device: deterministic regex shield + Gemini Nano NER, merged.
    const ents = [...regexScan(raw), ...(await localNer(raw))];
    const { redacted, map } = applyRedactions(raw, ents);
    for (const [ph, val] of Object.entries(map)) {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = ph;
      const b = document.createElement('td'); b.textContent = val;
      tr.append(a, b); $('map').append(tr);
    }
    $('stat-ent').textContent = Object.keys(map).length;

    // Leak guard — refuse the cloud call if any vault value survived redaction.
    const leaks = leakCheck(redacted, map);
    $('stat-leak').textContent = leaks.length;
    if (leaks.length) { log(`BLOCKED: ${leaks.length} value(s) still present — cloud call cancelled`, 'bad'); $('sent').textContent = redacted; return; }
    lastRedacted = redacted;
    const prompt = `${task}\nThe text uses placeholders like [PERSON_1]. Keep every placeholder exactly as written; never guess real values.\n\n${redacted}`;
    $('sent').textContent = prompt;
    log(`Vault holds ${Object.keys(map).length} values in this tab only; leak check passed`, 'dev');

    // Stage 2 — cloud: heavy reasoning on placeholders only.
    const t0 = performance.now();
    const res = await cloudModel.generateContent(prompt);
    const answer = res.response.text();
    log(`${CLOUD_MODEL} answered in ${Math.round(performance.now() - t0)} ms [${res.response.inferenceSource}]`, 'cloud');
    $('out-raw').textContent = answer;

    // Stage 3 — on-device: re-hydrate placeholders locally.
    $('out').textContent = rehydrate(answer, map);
    log('Re-hydrated locally — real values never left the device', 'dev');
  } catch (e) {
    log(`Error: ${e.message}`, 'bad');
  } finally { $('go').disabled = false; }
}

async function quickTitle() {
  if (!lastRedacted) { log('Run Veil first — the title model only ever sees redacted text', 'warn'); return; }
  const t0 = performance.now();
  try {
    const res = await quickModel.generateContent(`Give a one-line title (max 8 words, keep placeholders) for this note:\n${lastRedacted.slice(0, 1500)}`);
    log(`Title via ${res.response.inferenceSource} in ${Math.round(performance.now() - t0)} ms: "${res.response.text().trim()}"`, res.response.inferenceSource === 'on_device' ? 'dev' : 'cloud');
  } catch (e) { log(`Error: ${e.message}`, 'bad'); }
}

$('go').onclick = run;
$('quick').onclick = quickTitle;
for (const [k, s] of Object.entries(SAMPLES)) {
  const b = document.createElement('button');
  b.textContent = s.label; b.className = 'chip';
  b.onclick = () => { $('input').value = s.text; $('task').value = s.task; };
  $('samples').append(b);
  if (k === 'clinic') b.click();
}
probeDevice();
