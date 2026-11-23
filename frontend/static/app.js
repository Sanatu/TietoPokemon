"use strict";

const API_URL = "http://localhost:8000";

const TYPE_COLORS = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad",
};
const DEFAULT_ACCENT = "#dba05d";

const STAT_LABELS = {
  hp: "HP", attack: "Attack", defense: "Defense",
  "special-attack": "Sp. Atk", "special-defense": "Sp. Def", speed: "Speed",
};
const SPRITE_LABELS = {
  front_default: "Front", back_default: "Back",
  front_shiny: "Shiny front", back_shiny: "Shiny back",
  front_female: "Female front", back_female: "Female back",
  front_shiny_female: "Shiny female front", back_shiny_female: "Shiny female back",
};
const METHOD_LABELS = { "level-up": "Level up", machine: "TM / HM", egg: "Egg", tutor: "Tutor" };
const METHOD_ORDER = ["level-up", "machine", "egg", "tutor"];
const QUICK_PICKS = ["pikachu", "charizard", "mewtwo", "eevee", "gengar", "snorlax"];

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const list = document.querySelector("#suggestions");
const randomBtn = document.querySelector("#random-btn");
const result = document.querySelector("#result");

let names = [];
let nameSet = new Set();
let suggestions = [];
let activeIndex = -1;
let searchSeq = 0;
let lastQuery = "";

/* ---------- helpers ---------- */

// Tiny DOM builder. Strings are appended as text nodes, so API data is never parsed as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "vars") for (const [k, v] of Object.entries(value)) node.style.setProperty(k, v);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// "special-attack" -> "Special Attack" (same length as input, so indexes still line up)
const pretty = (name) =>
  name.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

const normalize = (q) => q.trim().toLowerCase().replace(/\s+/g, "-");

const setAccent = (color) => document.documentElement.style.setProperty("--accent", color);

/* ---------- name list + autocomplete ---------- */

async function loadNames() {
  try {
    const res = await fetch(`${API_URL}/pokemon-names`);
    if (!res.ok) throw new Error(res.status);
    names = await res.json();
    nameSet = new Set(names);
  } catch {
    names = [];   // autocomplete just stays off; search still works
    nameSet = new Set();
  }
}

function rank(q) {
  const starts = [];
  const contains = [];
  for (const n of names) {
    if (n.startsWith(q)) starts.push(n);
    else if (n.includes(q)) contains.push(n);
  }
  return starts.concat(contains);
}

// "Did you mean" helper: progressively shorten the query until some names start with it.
function similar(q) {
  for (let len = q.length; len >= 2; len--) {
    const prefix = q.slice(0, len);
    const hits = names.filter((n) => n.startsWith(prefix));
    if (hits.length) return hits.slice(0, 6);
  }
  return [];
}

function highlight(name, q) {
  const label = pretty(name);
  const i = name.indexOf(q);
  if (i < 0) return label;
  return [label.slice(0, i), el("mark", {}, label.slice(i, i + q.length)), label.slice(i + q.length)];
}

function setOpen(open) {
  list.hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  if (!open) input.removeAttribute("aria-activedescendant");
}

function setActive(i) {
  activeIndex = i;
  [...list.children].forEach((li, idx) => {
    const on = idx === i;
    li.classList.toggle("active", on);
    li.setAttribute("aria-selected", String(on));
    if (on) {
      input.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    }
  });
}

function updateSuggestions() {
  const q = normalize(input.value);
  suggestions = q ? rank(q).slice(0, 8) : [];
  activeIndex = -1;
  list.replaceChildren(
    ...suggestions.map((name, i) =>
      el("li", {
        id: `sug-${i}`,
        class: "sug",
        role: "option",
        "aria-selected": "false",
        onmousedown: (e) => { e.preventDefault(); choose(name); },
      }, highlight(name, q))
    )
  );
  setOpen(suggestions.length > 0);
}

function choose(name) {
  input.value = name;
  setOpen(false);
  search(name);
}

input.addEventListener("input", updateSuggestions);
input.addEventListener("focus", () => { if (input.value.trim()) updateSuggestions(); });
input.addEventListener("keydown", (e) => {
  const n = suggestions.length;
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
    e.preventDefault();
    if (list.hidden) setOpen(true);
    const down = e.key === "ArrowDown";
    setActive(activeIndex === -1 ? (down ? 0 : n - 1) : (activeIndex + (down ? 1 : -1) + n) % n);
  } else if (e.key === "Enter" && activeIndex >= 0 && !list.hidden) {
    e.preventDefault();
    choose(suggestions[activeIndex]);
  } else if (e.key === "Escape") {
    setOpen(false);
  }
});
document.addEventListener("click", (e) => { if (!e.target.closest(".combo")) setOpen(false); });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  setOpen(false);
  search(input.value);
});

randomBtn.addEventListener("click", () => {
  const pool = names.length ? names : QUICK_PICKS;
  choose(pool[Math.floor(Math.random() * pool.length)]);
});

/* ---------- search ---------- */

async function search(raw) {
  const query = normalize(raw);
  if (!query) return;
  lastQuery = raw;
  const seq = ++searchSeq;

  // Names are already loaded: unknown names never need to leave the browser.
  if (nameSet.size && !nameSet.has(query)) return showNotFound(raw.trim());

  showSkeleton();
  try {
    const res = await fetch(`${API_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (seq !== searchSeq) return;               // a newer search superseded this one
    if (res.status === 404) return showNotFound(raw.trim());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (seq !== searchSeq) return;
    renderPokemon(data);
    history.replaceState(null, "", `#${encodeURIComponent(data.name)}`);
  } catch {
    if (seq === searchSeq) showError();
  }
}

/* ---------- states ---------- */

function chipButtons(pokemonNames) {
  return el("div", { class: "chips" },
    pokemonNames.map((n) => el("button", { class: "chip", type: "button", onclick: () => choose(n) }, pretty(n))));
}

function showEmpty() {
  setAccent(DEFAULT_ACCENT);
  result.replaceChildren(
    el("div", { class: "state" },
      el("div", { class: "state-icon" }, "◓"),
      el("h2", {}, "Search the Pokédex"),
      el("p", {}, "Type a name above, or try one of these:"),
      chipButtons(QUICK_PICKS))
  );
}

function showSkeleton() {
  result.replaceChildren(
    el("div", { class: "skeleton", "aria-label": "Loading" },
      el("div", { class: "sk hero-sk" }),
      el("div", { class: "sk-row" }, el("div", { class: "sk block" }), el("div", { class: "sk block" })))
  );
}

function showNotFound(query) {
  setAccent(DEFAULT_ACCENT);
  document.title = "Pokédex";
  const near = similar(normalize(query));
  result.replaceChildren(
    el("div", { class: "state" },
      el("div", { class: "state-icon" }, "?"),
      el("h2", {}, `No Pokémon found for “${query}”`),
      el("p", {}, near.length ? "Did you mean one of these?" : "Check the spelling, or try one of these:"),
      chipButtons(near.length ? near : QUICK_PICKS))
  );
}

function showError() {
  setAccent(DEFAULT_ACCENT);
  result.replaceChildren(
    el("div", { class: "state" },
      el("div", { class: "state-icon" }, "!"),
      el("h2", {}, "Couldn't reach the server"),
      el("p", {}, "Make sure the backend is running, then try again."),
      el("button", { class: "btn primary", type: "button", onclick: () => search(lastQuery) }, "Retry"))
  );
}

/* ---------- rendering a Pokémon ---------- */

function card(title, cls, ...content) {
  return el("section", { class: `card ${cls}`.trim() }, el("h2", { class: "card-title" }, title), ...content);
}

function statColor(v) {
  if (v < 50) return "#ef5350";
  if (v < 80) return "#ff9f43";
  if (v < 100) return "#f7d02c";
  if (v < 130) return "#7ac74c";
  return "#2dd4bf";
}

function renderPokemon(p) {
  const types = [...p.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  const accent = TYPE_COLORS[types[0]] ?? DEFAULT_ACCENT;
  setAccent(accent);
  document.title = `${pretty(p.name)} · Pokédex`;

  const root = el("article", { class: "pokemon" },
    heroCard(p, types),
    el("div", { class: "layout" },
      statsCard(p),
      el("div", { class: "stack" }, abilitiesCard(p), spritesCard(p)),
      movesCard(p),
      extrasCard(p)));
  result.replaceChildren(root);
}

function heroCard(p, types) {
  const title = pretty(p.name);
  const art = p.sprites?.other?.["official-artwork"] ?? {};
  const normal = art.front_default ?? p.sprites?.front_default ?? null;
  const shiny = art.front_shiny ?? p.sprites?.front_shiny ?? null;

  const img = normal
    ? el("img", { class: "hero-img", src: normal, alt: `${title} artwork` })
    : el("div", { class: "hero-img placeholder", role: "img", "aria-label": "No artwork available" }, "?");

  const actions = el("div", { class: "actions" });
  if (normal && shiny) {
    let isShiny = false;
    const btn = el("button", {
      class: "btn ghost sm", type: "button", "aria-pressed": "false",
      onclick: () => {
        isShiny = !isShiny;
        img.src = isShiny ? shiny : normal;
        btn.setAttribute("aria-pressed", String(isShiny));
        btn.classList.toggle("on", isShiny);
      },
    }, "✨ Shiny");
    actions.append(btn);
  }
  const cry = p.cries?.latest ?? p.cries?.legacy;
  if (cry) {
    actions.append(el("button", {
      class: "btn ghost sm", type: "button",
      onclick: () => { const a = new Audio(cry); a.volume = 0.5; a.play().catch(() => {}); },
    }, "🔊 Cry"));
  }

  const fact = (label, value) =>
    el("div", { class: "fact" }, el("div", { class: "fact-label" }, label), el("div", { class: "fact-value" }, value));

  const id = String(p.id).padStart(4, "0");
  return el("section", { class: "hero" },
    el("div", { class: "hero-art" }, el("span", { class: "bignum", "aria-hidden": "true" }, id), img),
    el("div", { class: "hero-info" },
      el("div", {}, el("div", { class: "dex" }, `#${id}`), el("h1", {}, title)),
      el("div", { class: "types" },
        types.map((t) => el("span", { class: "type", vars: { "--c": TYPE_COLORS[t] ?? "#888" } }, pretty(t)))),
      el("div", { class: "facts" },
        fact("Height", `${(p.height / 10).toFixed(1)} m`),
        fact("Weight", `${(p.weight / 10).toFixed(1)} kg`),
        fact("Base XP", p.base_experience != null ? String(p.base_experience) : "—")),
      actions));
}

function statsCard(p) {
  const total = p.stats.reduce((sum, s) => sum + s.base_stat, 0);
  const rows = p.stats.map((s) => {
    const pct = Math.min(100, (s.base_stat / 200) * 100);
    return el("div", { class: "stat-row" },
      el("span", { class: "stat-name" }, STAT_LABELS[s.stat.name] ?? pretty(s.stat.name)),
      el("span", { class: "stat-value" }, String(s.base_stat)),
      el("div", { class: "bar" },
        el("div", { class: "bar-fill", vars: { "--w": `${pct}%`, "--c": statColor(s.base_stat) } })));
  });

  const evs = p.stats.filter((s) => s.effort > 0)
    .map((s) => `+${s.effort} ${STAT_LABELS[s.stat.name] ?? pretty(s.stat.name)}`);

  return card("Base stats", "",
    rows,
    el("div", { class: "stat-total" }, el("span", {}, "Total"), el("span", {}, String(total))),
    evs.length ? el("p", { class: "ev-note" }, `EV yield: ${evs.join(", ")}`) : null);
}

function abilitiesCard(p) {
  const abilities = [...p.abilities].sort((a, b) => a.slot - b.slot);
  return card("Abilities", "",
    abilities.length
      ? el("div", { class: "ability-list" },
          abilities.map((a) =>
            el("div", { class: "ability" }, pretty(a.ability.name), a.is_hidden ? el("span", { class: "tag" }, "Hidden") : null)))
      : el("p", { class: "muted" }, "No abilities recorded."));
}

function spritesCard(p) {
  const tiles = Object.entries(SPRITE_LABELS)
    .filter(([key]) => typeof p.sprites?.[key] === "string")
    .map(([key, label]) =>
      el("div", { class: "sprite" }, el("img", { src: p.sprites[key], alt: label, loading: "lazy" }), el("span", {}, label)));
  return card("Sprites", "",
    tiles.length ? el("div", { class: "sprite-grid" }, tiles) : el("p", { class: "muted" }, "No sprites available."));
}

function groupMoves(moves) {
  const byMethod = {};
  for (const m of moves) {
    const seen = new Map();   // method -> level; later (newer) games overwrite earlier ones
    for (const d of m.version_group_details) seen.set(d.move_learn_method.name, d.level_learned_at);
    for (const [method, level] of seen) (byMethod[method] ??= []).push({ name: m.move.name, level });
  }
  for (const [method, items] of Object.entries(byMethod)) {
    items.sort(method === "level-up"
      ? (a, b) => a.level - b.level || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
  }
  return byMethod;
}

function movesCard(p) {
  const byMethod = groupMoves(p.moves);
  const order = (m) => (METHOD_ORDER.includes(m) ? METHOD_ORDER.indexOf(m) : METHOD_ORDER.length);
  const methods = Object.keys(byMethod).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  if (!methods.length) return card("Moves", "wide", el("p", { class: "muted" }, "No moves recorded."));

  let active = methods[0];
  let filter = "";
  const tabs = el("div", { class: "tabs", role: "tablist" });
  const chips = el("div", { class: "chips scroll" });
  const filterInput = el("input", {
    class: "mini-input", type: "search", placeholder: "Filter moves…", "aria-label": "Filter moves",
    oninput: (e) => { filter = normalize(e.target.value); paint(); },
  });

  function paint() {
    tabs.replaceChildren(...methods.map((m) =>
      el("button", {
        class: `tab${m === active ? " active" : ""}`, type: "button", role: "tab",
        "aria-selected": String(m === active),
        onclick: () => { active = m; paint(); },
      }, METHOD_LABELS[m] ?? pretty(m), el("span", { class: "count" }, String(byMethod[m].length)))));

    const items = byMethod[active].filter((x) => x.name.includes(filter));
    chips.replaceChildren(...(items.length
      ? items.map((x) => el("span", { class: "chip" },
          active === "level-up" ? el("b", { class: "lvl" }, x.level > 0 ? `Lv ${x.level}` : "Evo") : null,
          pretty(x.name)))
      : [el("span", { class: "muted" }, "No moves match.")]));
  }
  paint();

  return card(`Moves (${p.moves.length})`, "wide", el("div", { class: "moves-head" }, tabs, filterInput), chips);
}

function extrasCard(p) {
  const section = (title, items, emptyText) =>
    el("div", {},
      el("h3", { class: "sub-title" }, title),
      items.length
        ? el("div", { class: "chips" }, items.map((n) => el("span", { class: "chip" }, pretty(n))))
        : el("span", { class: "muted" }, emptyText));

  return card("More", "wide",
    el("div", { class: "cols-3" },
      section("Held items", p.held_items.map((h) => h.item.name), "None in the wild"),
      section("Game appearances", p.game_indices.map((g) => g.version.name), "No data for this Pokémon"),
      section("Forms", p.forms.map((f) => f.name), "No other forms")));
}

/* ---------- init ---------- */

(async function init() {
  showEmpty();
  loadNames();   // fire and forget; autocomplete turns on once it arrives
  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial) {
    input.value = initial;
    await search(initial);
  }
})();
