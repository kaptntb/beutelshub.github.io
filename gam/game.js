/* Beutelshub Mini Idle RPG Demo
   - Statisch (GitHub Pages)
   - Save in localStorage, export/import als JSON
   - Quests (Timer + Offline Progress), Kampf, Loot, Shop
*/
(() => {
  'use strict';

  const VERSION = '0.1.0-demo';
  const SAVE_KEY = 'beutelshub_demo_save_v1';

  const el = (id) => document.getElementById(id);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => Date.now();
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h <= 0) return `${mm}m ${r}s`;
    return `${h}h ${mm}m`;
  };

  const rarity = [
    { key: 'Common', w: 60, color: 'muted' },
    { key: 'Uncommon', w: 26, color: 'ok' },
    { key: 'Rare', w: 10, color: 'ok' },
    { key: 'Epic', w: 3, color: 'ok' },
    { key: 'Legendary', w: 1, color: 'ok' },
  ];

  const itemTypes = [
    { slot: 'weapon', name: 'Waffe', stat: 'atk', base: 3 },
    { slot: 'armor',  name: 'Rüstung', stat: 'arm', base: 2 },
    { slot: 'amulet', name: 'Amulett', stat: 'hp',  base: 8 },
  ];

  const enemyNames = [
    'Wald-Ratte','Keller-Kobold','Nebelschleim','Buchfresser','Schlammkrabbe',
    'Schattenspatz','Gabelork','Brombeer-Wicht','Kiesel-Golem','Laternengeist'
  ];

  const questDefs = [
    { id:'q1', name:'Kurzer Ausflug', dur: 30_000, xp: 10, gold: 12, loot: 0.25 },
    { id:'q2', name:'Schlammige Ruinen', dur: 90_000, xp: 26, gold: 28, loot: 0.45 },
    { id:'q3', name:'Turm der Uhr', dur: 180_000, xp: 52, gold: 55, loot: 0.65 },
  ];

  function weightedPick(list) {
    const sum = list.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * sum;
    for (const x of list) {
      r -= x.w;
      if (r <= 0) return x;
    }
    return list[list.length - 1];
  }

  function xpForLevel(lvl) {
    // gentle curve
    return Math.floor(40 + 20 * Math.pow(lvl, 1.25));
  }

  function makeDefaultState() {
    return {
      v: 1,
      createdAt: now(),
      lastSeen: now(),
      hero: {
        name: 'Kapt\'n',
        level: 1,
        xp: 0,
        gold: 40,
        base: { str: 3, arm: 0, hp: 40, crit: 0.06 },
        equip: { weapon: null, armor: null, amulet: null },
      },
      inv: [],
      quest: { active: null }, // { id, start, end }
      enemy: null, // { name, level, hp, maxHp, arm, atk }
      shop: { items: [], nextRefreshAt: now() + 60_000 },
      log: [],
    };
  }

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function loadState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return makeDefaultState();
    try {
      const parsed = JSON.parse(raw);
      // simple migration guard
      const st = { ...makeDefaultState(), ...parsed };
      st.hero = { ...makeDefaultState().hero, ...parsed.hero };
      st.hero.base = { ...makeDefaultState().hero.base, ...(parsed.hero?.base||{}) };
      st.hero.equip = { ...makeDefaultState().hero.equip, ...(parsed.hero?.equip||{}) };
      st.inv = Array.isArray(parsed.inv) ? parsed.inv : [];
      st.quest = { ...makeDefaultState().quest, ...(parsed.quest||{}) };
      st.shop = { ...makeDefaultState().shop, ...(parsed.shop||{}) };
      st.log = Array.isArray(parsed.log) ? parsed.log : [];
      return st;
    } catch {
      return makeDefaultState();
    }
  }

  function saveState() {
    state.lastSeen = now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function logLine(html) {
    state.log.push({ t: now(), html });
    if (state.log.length > 200) state.log = state.log.slice(0, 200);
  }

  function rollCrit(p) {
    return Math.random() < p;
  }

  function gearBonus(item) {
    if (!item) return { atk:0, arm:0, hp:0, str:0, crit:0 };
    const b = { atk:0, arm:0, hp:0, str:0, crit:0 };
    if (item.stat === 'atk') b.atk += item.value;
    if (item.stat === 'arm') b.arm += item.value;
    if (item.stat === 'hp')  b.hp  += item.value;
    if (item.stat === 'str') b.str += item.value;
    if (item.stat === 'crit') b.crit += item.value;
    return b;
  }

  function computeHero() {
    const h = state.hero;
    const lvl = h.level;
    const base = h.base;
    const eq = h.equip;

    const w = eq.weapon ? state.inv.find(x => x.id === eq.weapon) : null;
    const a = eq.armor  ? state.inv.find(x => x.id === eq.armor)  : null;
    const m = eq.amulet ? state.inv.find(x => x.id === eq.amulet) : null;

    const bw = gearBonus(w), ba = gearBonus(a), bm = gearBonus(m);
    const bonus = {
      atk: bw.atk + ba.atk + bm.atk,
      arm: bw.arm + ba.arm + bm.arm,
      hp:  bw.hp  + ba.hp  + bm.hp,
      str: bw.str + ba.str + bm.str,
      crit: bw.crit + ba.crit + bm.crit,
    };

    const str = base.str + Math.floor(lvl * 1.35) + bonus.str;
    const arm = base.arm + Math.floor(lvl * 0.7) + bonus.arm;
    const maxHp = base.hp + Math.floor(lvl * 7.5) + bonus.hp;
    const crit = clamp(base.crit + Math.min(0.20, lvl * 0.004) + bonus.crit, 0.03, 0.55);

    const atk = Math.floor(2 + str * 0.75 + bonus.atk);

    return { str, arm, maxHp, crit, atk, w, a, m };
  }

  function itemName(it) {
    const t = itemTypes.find(x => x.slot === it.slot)?.name ?? it.slot;
    return `${it.rarity} ${t}`;
  }

  function makeItem(power, forcedSlot=null) {
    const r = weightedPick(rarity);
    const t = forcedSlot ? itemTypes.find(x => x.slot === forcedSlot) : itemTypes[Math.floor(Math.random()*itemTypes.length)];
    const id = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    const mult = ({Common:1, Uncommon:1.25, Rare:1.6, Epic:2.2, Legendary:3.1})[r.key] || 1;
    const value = Math.max(1, Math.round((t.base + power) * mult));
    const price = Math.max(5, Math.round(value * 2.2));
    return {
      id,
      slot: t.slot,
      stat: t.stat,
      value,
      rarity: r.key,
      price,
      createdAt: now(),
    };
  }

  function ensureEnemy() {
    if (state.enemy) return;
    state.enemy = spawnEnemy();
  }

  function spawnEnemy() {
    const h = computeHero();
    const lvl = Math.max(1, state.hero.level + (Math.random() < 0.35 ? 1 : 0));
    const name = enemyNames[Math.floor(Math.random()*enemyNames.length)];
    const maxHp = Math.floor(28 + lvl * 9 + Math.random()*10);
    const arm = Math.floor(1 + lvl * 0.7);
    const atk = Math.floor(3 + lvl * 1.1);
    return { name, level: lvl, hp: maxHp, maxHp, arm, atk };
  }

  function dmgAfterArmor(dmg, arm) {
    // soft reduction
    const red = 1 / (1 + arm / 18);
    return Math.max(1, Math.round(dmg * red));
  }

  function levelUpIfNeeded() {
    const h = state.hero;
    let need = xpForLevel(h.level);
    while (h.xp >= need) {
      h.xp -= need;
      h.level += 1;
      need = xpForLevel(h.level);
      logLine(`<span class="ok">LEVEL UP!</span> Du bist jetzt Level ${h.level}.`);
      // tiny heal reward: add gold
      h.gold += 10 + Math.floor(h.level * 2);
    }
  }

  function addLoot(power) {
    if (state.inv.length >= 30) {
      // inventory full -> convert to gold
      const g = 12 + Math.floor(power * 2);
      state.hero.gold += g;
      logLine(`<span class="muted">Inventar voll</span> → ${g} Gold stattdessen.`);
      return;
    }
    const it = makeItem(power);
    state.inv.push(it);
    logLine(`Loot: <span class="ok">${itemName(it)}</span> (+${it.value} ${it.stat.toUpperCase()})`);
  }

  function startQuest(q) {
    const t = now();
    state.quest.active = { id: q.id, start: t, end: t + q.dur, claimed:false };
    logLine(`Quest gestartet: <span class="ok">${q.name}</span> (${fmtTime(q.dur)})`);
  }

  function cancelQuest() {
    if (!state.quest.active) return;
    logLine(`<span class="muted">Quest abgebrochen</span>.`);
    state.quest.active = null;
  }

  function claimQuest() {
    const qa = state.quest.active;
    if (!qa) return;
    const q = questDefs.find(x => x.id === qa.id);
    const h = state.hero;

    // reward
    h.gold += q.gold;
    h.xp += q.xp;

    logLine(`Quest fertig: +${q.gold} Gold, +${q.xp} XP.`);
    if (Math.random() < q.loot) addLoot(Math.floor(2 + state.hero.level * 0.6));

    levelUpIfNeeded();
    state.quest.active = null;
  }

  function tickOfflineProgress(prevSeen) {
    // If a quest finished while offline, auto-ready claim (do NOT auto-claim)
    const qa = state.quest.active;
    if (!qa) return;
    const t = now();
    if (t >= qa.end) {
      // ready to claim; nothing else
      logLine(`<span class="muted">Offline:</span> Quest ist abgeschlossen und wartet auf Belohnung.`);
    }
  }

  function fightOnce() {
    ensureEnemy();
    const h = computeHero();
    const e = state.enemy;

    let heroHp = state._heroHp ?? h.maxHp;
    let enemyHp = e.hp;

    // hero strike
    const crit = rollCrit(h.crit);
    const heroDmgBase = h.atk + Math.floor(Math.random()*4);
    const heroDmg = dmgAfterArmor(crit ? Math.floor(heroDmgBase * 1.6) : heroDmgBase, e.arm);
    enemyHp = Math.max(0, enemyHp - heroDmg);
    logLine(`Du triffst ${e.name} für <span class="${crit?'ok':''}">${heroDmg}</span>${crit?' (Krit!)':''}.`);

    // enemy strike if alive
    if (enemyHp > 0) {
      const enemyDmgBase = e.atk + Math.floor(Math.random()*3);
      const enemyDmg = dmgAfterArmor(enemyDmgBase, h.arm);
      heroHp = Math.max(0, heroHp - enemyDmg);
      logLine(`${e.name} trifft dich für <span class="bad">${enemyDmg}</span>.`);
    }

    // persist current hp
    state._heroHp = heroHp;
    e.hp = enemyHp;

    // win/lose
    if (enemyHp <= 0) {
      const xp = 12 + Math.floor(e.level * 7);
      const gold = 10 + Math.floor(e.level * 6);
      state.hero.xp += xp;
      state.hero.gold += gold;
      logLine(`<span class="ok">Sieg!</span> +${xp} XP, +${gold} Gold.`);

      if (Math.random() < 0.55) addLoot(Math.floor(2 + e.level * 0.8));

      levelUpIfNeeded();
      // heal a bit after victory
      state._heroHp = Math.min(h.maxHp, heroHp + Math.floor(h.maxHp * 0.25));
      state.enemy = spawnEnemy();
    } else if (heroHp <= 0) {
      logLine(`<span class="bad">K.O.</span> Du verlierst etwas Gold und wirst wieder zusammengeflickt.`);
      const loss = Math.min(state.hero.gold, Math.floor(15 + state.hero.level * 6));
      state.hero.gold -= loss;
      state._heroHp = h.maxHp;
      state.enemy = spawnEnemy();
    }
  }

  function shopRefresh(force=false) {
    const t = now();
    if (!force && t < state.shop.nextRefreshAt) return;
    state.shop.nextRefreshAt = t + 60_000;
    state.shop.items = [];
    const power = Math.floor(2 + state.hero.level * 0.6);
    for (let i=0;i<4;i++) state.shop.items.push(makeItem(power, itemTypes[i%itemTypes.length].slot));
    logLine(`<span class="muted">Shop refreshed</span>.`);
  }

  function buyShopItem(id) {
    const idx = state.shop.items.findIndex(x => x.id === id);
    if (idx < 0) return;
    const it = state.shop.items[idx];
    if (state.inv.length >= 30) {
      logLine(`<span class="bad">Inventar voll.</span> Verkaufe etwas oder nutze Junk verkaufen.`);
      return;
    }
    if (state.hero.gold < it.price) {
      logLine(`<span class="bad">Zu wenig Gold.</span>`);
      return;
    }
    state.hero.gold -= it.price;
    state.inv.push(it);
    state.shop.items.splice(idx, 1);
    logLine(`Gekauft: <span class="ok">${itemName(it)}</span> für ${it.price} Gold.`);
  }

  function sellItem(id) {
    const idx = state.inv.findIndex(x => x.id === id);
    if (idx < 0) return;
    const it = state.inv[idx];
    // unequip if equipped
    for (const slot of ['weapon','armor','amulet']) {
      if (state.hero.equip[slot] === id) state.hero.equip[slot] = null;
    }
    const val = Math.floor(it.price * 0.55);
    state.hero.gold += val;
    state.inv.splice(idx, 1);
    logLine(`Verkauft: <span class="muted">${itemName(it)}</span> für ${val} Gold.`);
  }

  function sellJunk() {
    const before = state.inv.length;
    const keep = [];
    let gold = 0;
    for (const it of state.inv) {
      if (it.rarity === 'Common') {
        gold += Math.floor(it.price * 0.55);
        // if equipped, keep it
        const equipped = Object.values(state.hero.equip).includes(it.id);
        if (equipped) keep.push(it);
      } else keep.push(it);
    }
    state.inv = keep;
    state.hero.gold += gold;
    logLine(`Junk verkauft: ${before - keep.length} Items → +${gold} Gold.`);
  }

  function equipItem(id) {
    const it = state.inv.find(x => x.id === id);
    if (!it) return;
    state.hero.equip[it.slot] = id;
    logLine(`Ausgerüstet: <span class="ok">${itemName(it)}</span>.`);
    // heal clamp
    const h = computeHero();
    state._heroHp = Math.min(h.maxHp, state._heroHp ?? h.maxHp);
  }

  function exportSave() {
    const data = deepClone(state);
    delete data._heroHp; // ephemeral
    const txt = JSON.stringify(data, null, 2);
    navigator.clipboard?.writeText(txt).catch(()=>{});
    const blob = new Blob([txt], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'beutelshub_demo_save.json';
    a.click();
    URL.revokeObjectURL(a.href);
    logLine(`<span class="muted">Save exportiert.</span> (auch in die Zwischenablage, wenn erlaubt)`);
  }

  function importSave(txt) {
    const parsed = JSON.parse(txt);
    localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
    state = loadState();
    // restore hero hp if missing
    state._heroHp = computeHero().maxHp;
    logLine(`<span class="ok">Save importiert.</span>`);
    saveState();
    renderAll();
  }

  // --- UI rendering
  function renderHero() {
    const h = state.hero;
    const hc = computeHero();
    const need = xpForLevel(h.level);
    el('hero-level').textContent = String(h.level);
    el('hero-gold').textContent = String(h.gold);
    el('hero-xp').textContent = `${h.xp}/${need}`;
    el('hero-str').textContent = String(hc.str);
    el('hero-arm').textContent = String(hc.arm);
    el('hero-crit').textContent = `${Math.round(hc.crit * 100)}%`;

    const hp = state._heroHp ?? hc.maxHp;
    el('hero-hp').textContent = `${hp}/${hc.maxHp}`;

    el('equip-weapon').textContent = hc.w ? itemName(hc.w) : '-';
    el('equip-armor').textContent  = hc.a ? itemName(hc.a) : '-';
    el('equip-amulet').textContent = hc.m ? itemName(hc.m) : '-';

    const nameInput = el('hero-name');
    if (document.activeElement !== nameInput) nameInput.value = h.name;
  }

  function renderEnemy() {
    ensureEnemy();
    const e = state.enemy;
    el('enemy-name').textContent = e.name;
    el('enemy-meta').textContent = `Lvl ${e.level} · HP ${e.hp}/${e.maxHp}`;
    const pct = Math.round((e.hp / e.maxHp) * 100);
    el('enemy-fill').style.width = `${pct}%`;
  }

  function renderLog() {
    const box = el('fight-log');
    box.innerHTML = state.log.slice(0, 120).reverse().map(x => `<div>${x.html}</div>`).join('');
  }

  function renderInventory() {
    const inv = el('inventory');
    el('inv-count').textContent = String(state.inv.length);

    inv.innerHTML = '';
    const equippedIds = new Set(Object.values(state.hero.equip).filter(Boolean));
    const sorted = [...state.inv].sort((a,b) => (a.slot.localeize?.(b.slot)||a.slot.localeCompare(b.slot)) || (b.price-a.price));
    for (const it of sorted) {
      const d = document.createElement('div');
      d.className = 'item';
      const equipped = equippedIds.has(it.id);
      d.innerHTML = `
        <div class="iname">${equipped ? '★ ' : ''}${itemName(it)}</div>
        <div class="imeta">+${it.value} ${it.stat.toUpperCase()} · ${it.price}g</div>
        <div class="itag">${it.slot}</div>
      `;
      d.addEventListener('click', (ev) => {
        if (ev.shiftKey) sellItem(it.id);
        else equipItem(it.id);
        saveState(); renderAll();
      });
      inv.appendChild(d);
    }
  }

  function renderShop() {
    shopRefresh(false);
    const s = el('shop');
    s.innerHTML = '';
    for (const it of state.shop.items) {
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `
        <div class="iname">${itemName(it)}</div>
        <div class="imeta">+${it.value} ${it.stat.toUpperCase()}</div>
        <div class="itag">Preis: <b>${it.price}</b> Gold</div>
      `;
      d.addEventListener('click', () => {
        buyShopItem(it.id);
        saveState(); renderAll();
      });
      s.appendChild(d);
    }
    renderShopEta();
  }

  function renderShopEta() {
    const t = now();
    const eta = state.shop.nextRefreshAt - t;
    el('shop-eta').textContent = eta > 0 ? fmtTime(eta) : 'jetzt';
  }

  function renderQuests() {
    const qbox = el('quests');
    qbox.innerHTML = '';
    for (const q of questDefs) {
      const d = document.createElement('div');
      d.className = 'quest';
      d.innerHTML = `
        <div class="qname">${q.name}</div>
        <div class="qmeta">Dauer: ${fmtTime(q.dur)} · Lootchance: ${Math.round(q.loot*100)}%</div>
        <div class="qreward">Reward: +${q.gold}g · +${q.xp}xp</div>
        <div class="row" style="margin-top:10px;">
          <button data-q="${q.id}">Start</button>
        </div>
      `;
      d.querySelector('button').addEventListener('click', () => {
        if (state.quest.active) return;
        startQuest(q);
        saveState(); renderAll();
      });
      qbox.appendChild(d);
    }
  }

  function renderQuestTimer() {
    const qa = state.quest.active;
    const fill = el('quest-fill');
    const text = el('quest-text');
    const btnClaim = el('btn-claim');
    const btnCancel = el('btn-cancel');

    if (!qa) {
      fill.style.width = '0%';
      text.textContent = 'Keine Quest aktiv.';
      btnClaim.disabled = true;
      btnCancel.disabled = true;
      return;
    }
    const q = questDefs.find(x => x.id === qa.id);
    const t = now();
    const dur = qa.end - qa.start;
    const prog = clamp((t - qa.start) / dur, 0, 1);
    fill.style.width = `${Math.round(prog * 100)}%`;

    if (t >= qa.end) {
      text.textContent = `Quest abgeschlossen: ${q.name}. Belohnung bereit!`;
      btnClaim.disabled = false;
      btnCancel.disabled = true;
    } else {
      text.textContent = `Quest läuft: ${q.name}. Rest: ${fmtTime(qa.end - t)}.`;
      btnClaim.disabled = true;
      btnCancel.disabled = false;
    }
  }

  function renderAll() {
    renderHero();
    renderEnemy();
    renderLog();
    renderInventory();
    renderShop();
    renderQuestTimer();
    el('version').textContent = VERSION;
  }

  // --- wiring
  let state = loadState();

  function init() {
    // offline progress detection
    const prev = state.lastSeen || now();
    tickOfflineProgress(prev);

    // init hero hp if missing
    const hc = computeHero();
    if (typeof state._heroHp !== 'number') state._heroHp = hc.maxHp;

    // init shop if empty
    if (!Array.isArray(state.shop.items) || state.shop.items.length === 0) shopRefresh(true);

    // init enemy
    ensureEnemy();

    // quests list
    renderQuests();

    el('btn-fight').addEventListener('click', () => {
      fightOnce();
      saveState(); renderAll();
    });
    el('btn-new-enemy').addEventListener('click', () => {
      state.enemy = spawnEnemy();
      logLine(`<span class="muted">Neuer Gegner:</span> ${state.enemy.name}`);
      saveState(); renderAll();
    });

    el('btn-claim').addEventListener('click', () => {
      claimQuest();
      saveState(); renderAll();
    });
    el('btn-cancel').addEventListener('click', () => {
      cancelQuest();
      saveState(); renderAll();
    });

    el('btn-sell-junk').addEventListener('click', () => {
      sellJunk();
      saveState(); renderAll();
    });

    el('btn-shop-refresh').addEventListener('click', () => {
      shopRefresh(true);
      saveState(); renderAll();
    });

    el('btn-rename').addEventListener('click', () => {
      const n = (el('hero-name').value || '').trim();
      if (n.length >= 1) state.hero.name = n.slice(0, 18);
      saveState(); renderAll();
    });

    el('btn-reset').addEventListener('click', () => {
      if (!confirm('Wirklich alles zurücksetzen?')) return;
      localStorage.removeItem(SAVE_KEY);
      state = makeDefaultState();
      state._heroHp = computeHero().maxHp;
      shopRefresh(true);
      ensureEnemy();
      renderQuests();
      saveState();
      renderAll();
    });

    el('btn-export').addEventListener('click', exportSave);

    const dlg = el('dlg-import');
    el('btn-import').addEventListener('click', () => {
      el('import-text').value = '';
      dlg.showModal();
    });
    el('btn-do-import').addEventListener('click', (ev) => {
      ev.preventDefault();
      try {
        importSave(el('import-text').value);
        dlg.close();
      } catch (e) {
        alert('Import fehlgeschlagen: ' + (e?.message || e));
      }
    });

    // periodic UI tick
    setInterval(() => {
      renderQuestTimer();
      renderShopEta();
      saveState();
    }, 500);

    renderAll();
    saveState();
  }

  window.addEventListener('load', init);
})();
