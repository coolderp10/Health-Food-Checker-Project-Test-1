// popup.js

const clamp = (x, a=0, b=100) => Math.max(a, Math.min(b, x));
const scale = (val, min, max) => {
  if (val == null) return 0;
  if (val <= min) return 0; if (val >= max) return 1;
  return (val - min) / (max - min);
};
function scoreToColor(score){
  const s = clamp(score,0,100);
  const hue = (s <= 50) ? (s/50)*60 : 60 + ((s-50)/50)*60; // 0..120
  return `hsl(${hue} 80% 45%)`;
}
function quickVerdict(score){
  if (score >= 75) return 'Healthy';
  if (score >= 55) return 'Decent';
  if (score >= 35) return 'Caution';
  return 'Unhealthy';
}

function parseLabel(text){
  const t = (text||'').replace(/\s+/g,' ').toLowerCase();
  const getNum = (re) => Number((re.exec(t)||[])[1]);
  const cal = getNum(/cal(?:ories)?\s*[:\-]?\s*(\d{2,4})/);
  const sat = getNum(/saturated\s*f(?:at)?\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*g/);
  const tf  = getNum(/trans\s*f(?:at)?\s*[:\-]?\s*(\d(?:\.\d+)?)\s*g/);
  const sod = getNum(/sodium\s*[:\-]?\s*(\d{2,4})\s*mg/);
  const sug = getNum(/(?:added\s*)?sugars?\s*[:\-]?\s*(\d{1,3})\s*g/);
  const fib = getNum(/fiber\s*[:\-]?\s*(\d{1,2})\s*g/);
  const pro = getNum(/protein\s*[:\-]?\s*(\d{1,2})\s*g/);
  return { calories: cal||undefined, satFat_g: sat||undefined, transFat_g: tf||undefined, sodium_mg: sod||undefined, addedSugars_g: sug||undefined, fiber_g: fib||undefined, protein_g: pro||undefined };
}

function scoreFood(facts, settings){
  const s = settings || { sugarSensitivity:1.0, sodiumSensitivity:1.0, vegetarianEmphasis:false };
  const { calories, satFat_g, transFat_g, sodium_mg, addedSugars_g, fiber_g, protein_g } = facts;
  let neg = 0;
  neg += scale(calories, 400, 1200) * 25;
  neg += scale(satFat_g, 5, 22) * 20;
  neg += scale(sodium_mg, 600, 2400) * 20 * (s.sodiumSensitivity||1);
  neg += scale(addedSugars_g, 10, 50) * 20 * (s.sugarSensitivity||1);
  if (transFat_g != null && transFat_g >= 0.5) neg += 10;

  let pos = 0;
  pos += scale(fiber_g, 3, 10) * 15;
  pos += scale(protein_g, 10, 30) * 10;

  const score = clamp(60 + pos - neg, 0, 100);
  return { score, pos: pos.toFixed(1), neg: neg.toFixed(1) };
}

function showResult(res){
  const out = document.getElementById('out');
  out.style.display = 'block';
  document.getElementById('headline').textContent = `Score ${Math.round(res.score)}/100`;
  document.getElementById('ptr').style.left = `${res.score}%`;
  document.getElementById('verdict').textContent = quickVerdict(res.score);
  document.getElementById('color').textContent = scoreToColor(res.score);
  document.getElementById('color').style.color = scoreToColor(res.score);
  document.getElementById('breakdown').textContent = `Positives: ${res.pos} • Negatives: ${res.neg}`;
}

// Preferences
function getSettings(){
  return new Promise((res)=> chrome.runtime.sendMessage({ type: 'getSettings' }, (r) => res(r?.settings || { sugarSensitivity:1, sodiumSensitivity:1, vegetarianEmphasis:false })));
}
function saveSettings(s){
  return new Promise((res)=> chrome.runtime.sendMessage({ type: 'saveSettings', settings: s }, () => res(true)));
}

// Events
window.addEventListener('DOMContentLoaded', async () => {
  // Load prefs
  const settings = await getSettings();
  document.getElementById('sugSens').value = String(settings.sugarSensitivity);
  document.getElementById('sodSens').value = String(settings.sodiumSensitivity);
  document.getElementById('vegEmph').checked = !!settings.vegetarianEmphasis;

  document.getElementById('savePrefs').addEventListener('click', async () => {
    const s = {
      sugarSensitivity: Number(document.getElementById('sugSens').value),
      sodiumSensitivity: Number(document.getElementById('sodSens').value),
      vegetarianEmphasis: document.getElementById('vegEmph').checked
    };
    await saveSettings(s);
    const out = document.getElementById('out');
    out.style.display = 'block';
    document.getElementById('headline').textContent = 'Preferences saved';
    document.getElementById('ptr').style.left = '50%';
    document.getElementById('verdict').textContent = '';
    document.getElementById('color').textContent = '';
    document.getElementById('breakdown').textContent = '';
  });

  document.getElementById('parse').addEventListener('click', () => {
    const parsed = parseLabel(document.getElementById('label').value);
    if (parsed.calories != null) document.getElementById('cal').value = parsed.calories;
    if (parsed.satFat_g != null) document.getElementById('sat').value = parsed.satFat_g;
    if (parsed.sodium_mg != null) document.getElementById('sod').value = parsed.sodium_mg;
    if (parsed.addedSugars_g != null) document.getElementById('sug').value = parsed.addedSugars_g;
    if (parsed.fiber_g != null) document.getElementById('fib').value = parsed.fiber_g;
    if (parsed.protein_g != null) document.getElementById('pro').value = parsed.protein_g;
  });

  document.getElementById('score').addEventListener('click', async () => {
    const facts = {
      calories: Number(document.getElementById('cal').value) || undefined,
      satFat_g: Number(document.getElementById('sat').value) || undefined,
      sodium_mg: Number(document.getElementById('sod').value) || undefined,
      addedSugars_g: Number(document.getElementById('sug').value) || undefined,
      fiber_g: Number(document.getElementById('fib').value) || undefined,
      protein_g: Number(document.getElementById('pro').value) || undefined
    };
    const sett = await getSettings();
    const res = scoreFood(facts, sett);
    showResult(res);
  });
});
