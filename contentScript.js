// contentScript.js
// Scans the page for menu cards, overlays a score badge, and shows a panel with details.

(function(){
  const SELECTORS = [
    // DoorDash (cards & item rows)
    '[data-anchor-id="MenuItemCard"]',
    'div[aria-label*="menu item" i]',
    'a[href*="/store/"][role="link"]:not([href*="/cart"])',
    // UberEats
    'div[data-testid*="menuItem" i]',
    'a[href*="/store/"][data-testid*="storeItem" i]'
  ];

  // Lightweight keyword banks for heuristics
  const BAD_WORDS = ['fried','battered','breaded','crispy','double fried','shake','milkshake','soda','cola','fries','bacon','sausage','pepperoni','hot dog','bologna','salami','ham','smoked','cured','bbq','teriyaki','donut','cookie','brownie','cake','pancake','buttercream','cheese sauce','alfredo'];
  const GOOD_WORDS = ['grilled','baked','roasted','steamed','broiled','whole wheat','whole-grain','whole grain','brown rice','quinoa','veggie','vegetable','salad','greens','kale','spinach','tofu','bean','lentil','legume','chickpea','turkey','chicken breast','salmon'];
  const WHOLE_GRAINS = ['whole wheat','whole-grain','whole grain','brown rice','quinoa','oats'];

  const number = (v) => (isFinite(+v) ? +v : undefined);
  const clamp = (x, a=0, b=100) => Math.max(a, Math.min(b, x));
  const scale = (val, min, max) => {
    if (val == null) return 0;
    if (val <= min) return 0; if (val >= max) return 1;
    return (val - min) / (max - min);
  };
  const hasAny = (text, arr) => arr.some(w => text.includes(w));

  // Color interpolation (0=red, 50=yellow, 100=green)
  function scoreToColor(score){
    const s = clamp(score,0,100);
    // simple HCL-ish via HSV: red(0)→yellow(60)→green(120)
    const hue = (s <= 50) ? (s/50)*60 : 60 + ((s-50)/50)*60; // 0..120
    return `hsl(${hue} 80% 45%)`;
  }

  function quickVerdict(score){
    if (score >= 75) return 'Healthy';
    if (score >= 55) return 'Decent';
    if (score >= 35) return 'Caution';
    return 'Unhealthy';
  }

  // Parse possible inline nutrition text on cards/details
  function extractNutritionFromText(text){
    const t = text.replace(/\s+/g,' ').toLowerCase();
    const cal = /cal(?:ories)?\s*[:\-]?\s*(\d{2,4})/.exec(t)?.[1];
    const sat = /saturated\s*f(?:at)?\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*g/.exec(t)?.[1];
    const tf  = /trans\s*f(?:at)?\s*[:\-]?\s*(\d(?:\.\d+)?)\s*g/.exec(t)?.[1];
    const sod = /sodium\s*[:\-]?\s*(\d{2,4})\s*mg/.exec(t)?.[1];
    const sug = /(added\s*)?sugars?\s*[:\-]?\s*(\d{1,3})\s*g/.exec(t)?.[2];
    const fib = /fiber\s*[:\-]?\s*(\d{1,2})\s*g/.exec(t)?.[1];
    const pro = /protein\s*[:\-]?\s*(\d{1,2})\s*g/.exec(t)?.[1];
    return {
      calories: number(cal),
      satFat_g: number(sat),
      transFat_g: number(tf),
      sodium_mg: number(sod),
      addedSugars_g: number(sug),
      fiber_g: number(fib),
      protein_g: number(pro)
    };
  }

  // Heuristic estimate when missing
  function estimateNutritionByName(name){
    const n = name.toLowerCase();
    // VERY rough buckets
    if (/salad/.test(n)) return { calories: 350, satFat_g: 4, sodium_mg: 700, addedSugars_g: 6, fiber_g: 5, protein_g: 18 };
    if (/burger|double|cheese|bacon/.test(n)) return { calories: 850, satFat_g: 12, sodium_mg: 1600, addedSugars_g: 10, fiber_g: 3, protein_g: 35 };
    if (/wrap|sandwich|sub/.test(n)) return { calories: 600, satFat_g: 6, sodium_mg: 1300, addedSugars_g: 6, fiber_g: 4, protein_g: 28 };
    if (/pizza/.test(n)) return { calories: 700, satFat_g: 8, sodium_mg: 1500, addedSugars_g: 8, fiber_g: 3, protein_g: 25 };
    if (/fries|chips/.test(n)) return { calories: 450, satFat_g: 4, sodium_mg: 600, addedSugars_g: 2, fiber_g: 4, protein_g: 6 };
    if (/bowl|rice|grain/.test(n)) return { calories: 650, satFat_g: 6, sodium_mg: 1100, addedSugars_g: 6, fiber_g: 6, protein_g: 25 };
    if (/shake|smoothie|soda|cola|sweet tea/.test(n)) return { calories: 400, satFat_g: 5, sodium_mg: 150, addedSugars_g: 50, fiber_g: 1, protein_g: 8 };
    if (/taco|burrito|quesadilla/.test(n)) return { calories: 700, satFat_g: 9, sodium_mg: 1400, addedSugars_g: 6, fiber_g: 6, protein_g: 30 };
    return { calories: 600, satFat_g: 7, sodium_mg: 1200, addedSugars_g: 8, fiber_g: 4, protein_g: 22 };
  }

  function keywordSignals(name, ingredients=""){
    const txt = (name + " " + ingredients).toLowerCase();
    const isBad = BAD_WORDS.filter(w => txt.includes(w));
    const isGood = GOOD_WORDS.filter(w => txt.includes(w));
    const wholeGrain = WHOLE_GRAINS.some(w => txt.includes(w));
    const hasVeg = /(salad|greens|kale|spinach|veggie|vegetable|broccoli|tomato|lettuce|cabbage|bell pepper|onion|avocado)/.test(txt);
    const leanProtein = /(chicken breast|turkey|tofu|beans|lentils|salmon|cod|tilapia)/.test(txt) && !/fried|battered|crispy/.test(txt);
    const beverage = /(soda|cola|shake|milkshake|smoothie|sweet tea)/.test(txt);
    return { isBad, isGood, wholeGrain, hasVeg, leanProtein, beverage };
  }

  // Core scoring model (0-100)
  function scoreFood(item, settings){
    const { name = 'Item', ingredients = '', facts = {} } = item;
    const s = settings || { sugarSensitivity:1.0, sodiumSensitivity:1.0, vegetarianEmphasis:false };

    const inferred = Object.values(facts).some(v => v != null) ? facts : estimateNutritionByName(name);
    const { calories, satFat_g, transFat_g, sodium_mg, addedSugars_g, fiber_g, protein_g } = inferred;

    const k = keywordSignals(name, ingredients);

    // Negative points
    let neg = 0;
    neg += scale(calories, 400, 1200) * 25; // caloric load
    neg += scale(satFat_g, 5, 22) * 20;     // sat fat
    neg += scale(sodium_mg, 600, 2400) * 20 * (s.sodiumSensitivity||1);
    neg += scale(addedSugars_g, 10, 50) * 20 * (s.sugarSensitivity||1);
    if (transFat_g != null && transFat_g >= 0.5) neg += 10;

    // Processing & methods
    const badSeverity = Math.min(k.isBad.length * 0.15, 0.6); // up to 0.6 severity
    neg += badSeverity * 15; // up to +9
    if (k.beverage && (addedSugars_g == null || addedSugars_g > 20)) neg += 6; // sweet drink bump

    // Positive points
    let pos = 0;
    pos += scale(fiber_g, 3, 10) * 15;   // fiber
    pos += scale(protein_g, 10, 30) * 10; // protein
    if (k.wholeGrain) pos += 5;
    if (k.hasVeg) pos += 5;
    if (k.leanProtein) pos += 5;
    if (k.isGood.length) pos += 3; // grilled/steamed/etc.
    if (s.vegetarianEmphasis && /(tofu|bean|lentil|chickpea|veggie)/.test((name+ingredients).toLowerCase())) pos += 3;

    let score = clamp(60 + pos - neg, 0, 100);
    return {
      score,
      verdict: quickVerdict(score),
      color: scoreToColor(score),
      contributions: { neg: neg.toFixed(1), pos: pos.toFixed(1) },
      used: inferred,
      signals: k
    };
  }

  function buildBadge(result){
    const el = document.createElement('div');
    el.className = 'hm-badge';
    el.innerHTML = `
      <span class="hm-dot" style="background:${result.color}"></span>
      <span class="hm-score">${Math.round(result.score)}</span>
      <span class="hm-quick">${result.verdict}</span>
      <button class="hm-open" type="button">Details</button>
    `;
    return el;
  }

  function openPanel(data, result){
    let panel = document.querySelector('.hm-panel');
    if (!panel){
      panel = document.createElement('aside');
      panel.className = 'hm-panel';
      panel.innerHTML = `
        <header>
          <h3>HealthyMenu Score</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <button data-action="settings">Settings</button>
            <button data-action="close">Close</button>
          </div>
        </header>
        <div class="hm-section">
          <div style="font-weight:600;font-size:15px;">${data.name || 'Item'}</div>
          <div class="hm-kicker">${result.verdict} • Score ${Math.round(result.score)}/100</div>
          <div class="hm-scale">
            <div class="hm-pointer" style="left:${result.score}%"></div>
          </div>
          <div class="hm-legend"><span>Unhealthy</span><span>Decent</span><span>Healthy</span></div>
        </div>
        <div class="hm-section">
          <div class="hm-grid">
            <div>Calories: <b>${data.facts.calories ?? '—'}</b></div>
            <div>Saturated fat (g): <b>${data.facts.satFat_g ?? '—'}</b></div>
            <div>Sodium (mg): <b>${data.facts.sodium_mg ?? '—'}</b></div>
            <div>Added sugars (g): <b>${data.facts.addedSugars_g ?? '—'}</b></div>
            <div>Fiber (g): <b>${data.facts.fiber_g ?? '—'}</b></div>
            <div>Protein (g): <b>${data.facts.protein_g ?? '—'}</b></div>
          </div>
          <div class="hm-kicker">Signals:
            ${result.signals.isGood.length ? `<span class="hm-chip hm-good">${result.signals.isGood.join(', ')}</span>` : ''}
            ${result.signals.isBad.length ? `<span class="hm-chip hm-bad">${result.signals.isBad.join(', ')}</span>` : ''}
            ${result.signals.wholeGrain ? '<span class="hm-chip hm-good">whole grain</span>' : ''}
            ${result.signals.hasVeg ? '<span class="hm-chip hm-good">vegetables</span>' : ''}
            ${result.signals.leanProtein ? '<span class="hm-chip hm-good">lean protein</span>' : ''}
          </div>
        </div>
        <div class="hm-section">
          <details>
            <summary class="hm-small">Refine data (enter nutrition facts if you have them)</summary>
            <div class="hm-form" style="margin-top:8px;">
              <div class="row">
                <label>Calories <input data-k="calories" type="number" placeholder="e.g., 720"></label>
                <label>Saturated fat (g) <input data-k="satFat_g" type="number" step="0.1"></label>
              </div>
              <div class="row">
                <label>Sodium (mg) <input data-k="sodium_mg" type="number"></label>
                <label>Added sugars (g) <input data-k="addedSugars_g" type="number" step="0.1"></label>
              </div>
              <div class="row">
                <label>Fiber (g) <input data-k="fiber_g" type="number" step="0.1"></label>
                <label>Protein (g) <input data-k="protein_g" type="number" step="0.1"></label>
              </div>
              <label>Ingredients <textarea data-k="ingredients" rows="3" placeholder="comma-separated"></textarea></label>
              <button type="button" data-action="recalc">Recalculate</button>
            </div>
            <div class="hm-note">If you don’t know exact values, enter the best info you have. The score updates instantly.</div>
          </details>
        </div>
        <div class="hm-section hm-small hm-muted">Educational tool, not medical advice.</div>
      `;
      document.documentElement.appendChild(panel);
      panel.querySelector('button[data-action="close"]').addEventListener('click', () => panel.classList.remove('open'));
      panel.querySelector('button[data-action="settings"]').addEventListener('click', () => openSettings());
      panel.querySelector('button[data-action="recalc"]').addEventListener('click', async () => {
        const inputs = panel.querySelectorAll('[data-k]');
        const updates = {};
        inputs.forEach(i => {
          const key = i.getAttribute('data-k');
          if (key === 'ingredients') updates.ingredients = i.value;
          else if (i.value !== '') updates[key] = Number(i.value);
        });
        const settings = await getSettings();
        const newFacts = { ...data.facts, ...updates };
        const fresh = scoreFood({ name: data.name, ingredients: updates.ingredients ?? data.ingredients, facts: newFacts }, settings);
        // Re-render
        panel.remove();
        openPanel({ name: data.name, ingredients: updates.ingredients ?? data.ingredients, facts: newFacts }, fresh);
      });
    }
    panel.classList.add('open');
  }

  async function getSettings(){
    return new Promise((res)=>{
      chrome.runtime.sendMessage({ type: 'getSettings' }, (reply) => res(reply?.settings || { sugarSensitivity:1, sodiumSensitivity:1, vegetarianEmphasis:false }));
    });
  }

  function openSettings(){
    const panel = document.querySelector('.hm-panel');
    if (!panel) return;
    const container = document.createElement('div');
    container.className = 'hm-section';
    container.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;">Settings</div>
      <div class="hm-form">
        <label>Sugar sensitivity
          <select data-s="sugarSensitivity">
            <option value="0.8">Lower</option>
            <option value="1" selected>Normal</option>
            <option value="1.2">Higher</option>
            <option value="1.5">Strict</option>
          </select>
        </label>
        <label>Sodium sensitivity
          <select data-s="sodiumSensitivity">
            <option value="0.8">Lower</option>
            <option value="1" selected>Normal</option>
            <option value="1.2">Higher</option>
            <option value="1.5">Strict</option>
          </select>
        </label>
        <label class="hm-chip"><input type="checkbox" data-s="vegetarianEmphasis" /> Prefer vegetarian options</label>
        <button type="button" data-action="save">Save</button>
      </div>
    `;
    panel.appendChild(container);
    chrome.runtime.sendMessage({ type: 'getSettings' }, ({ settings }) => {
      container.querySelector('[data-s="sugarSensitivity"]').value = String(settings?.sugarSensitivity ?? 1);
      container.querySelector('[data-s="sodiumSensitivity"]').value = String(settings?.sodiumSensitivity ?? 1);
      container.querySelector('[data-s="vegetarianEmphasis"]').checked = !!settings?.vegetarianEmphasis;
    });
    container.querySelector('[data-action="save"]').addEventListener('click', () => {
      const payload = {
        sugarSensitivity: Number(container.querySelector('[data-s="sugarSensitivity"]').value),
        sodiumSensitivity: Number(container.querySelector('[data-s="sodiumSensitivity"]').value),
        vegetarianEmphasis: container.querySelector('[data-s="vegetarianEmphasis"]').checked
      };
      chrome.runtime.sendMessage({ type: 'saveSettings', settings: payload }, () => {
        container.innerHTML = '<div class="hm-good">Saved! Close and rescore to apply.</div>';
      });
    });
  }

  function findMenuCards(){
    const nodes = new Set();
    SELECTORS.forEach(sel => document.querySelectorAll(sel).forEach(n => nodes.add(n)));
    return Array.from(nodes);
  }

  async function processCard(card){
    if (card.classList?.contains('hm-processed')) return;
    card.classList?.add('hm-processed');

    // Attempt to locate name and any nutrition snippet in the card
    const name = (card.getAttribute('aria-label') || card.textContent || '').trim().split('\n')[0].slice(0, 120);
    if (!name) return;

    const text = card.textContent || '';
    const facts = extractNutritionFromText(text);
    const settings = await getSettings();
    const result = scoreFood({ name, facts }, settings);

    // Insert badge
    const badge = buildBadge(result);
    // Ensure the card is positioned relative for absolute badge placement
    const style = window.getComputedStyle(card);
    if (style.position === 'static') card.style.position = 'relative';
    card.appendChild(badge);

    badge.querySelector('.hm-open').addEventListener('click', () => {
      openPanel({ name, facts, ingredients: '' }, result);
    });
  }

  function run(){
    findMenuCards().forEach(processCard);
  }

  // Observe SPA changes
  const mo = new MutationObserver(() => run());
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: false });
  // Initial
  run();
})();
