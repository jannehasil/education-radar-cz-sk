const MONTHS = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function decodeXml(value = "") {
  return String(value)
    .replaceAll("<![CDATA[", "").replaceAll("]]>", "")
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ").replaceAll("&middot;", "·")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

export function stripHtml(value = "") {
  return decodeXml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

export function parseRss(xml, group) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const rawTitle = stripHtml(xmlTag(block, "title"));
    const source = stripHtml(xmlTag(block, "source"));
    const title = source && rawTitle.endsWith(` - ${source}`)
      ? rawTitle.slice(0, -(source.length + 3)).trim() : rawTitle;
    const publishedAt = new Date(xmlTag(block, "pubDate"));
    return {
      group, title, source: source || "Google News", url: xmlTag(block, "link"),
      summary: stripHtml(xmlTag(block, "description")),
      publishedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt.toISOString(),
    };
  }).filter((item) => item.title && item.url && item.publishedAt);
}

export function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matchesWatchlist(item, watchlist) {
  const haystack = normalize(`${item.title} ${item.summary}`);
  return watchlist.some((name) => haystack.includes(normalize(name)));
}

export function isRecent(item, hours, now = new Date()) {
  if (!item.publishedAt) return false;
  const age = now.getTime() - new Date(item.publishedAt).getTime();
  return age >= -60 * 60 * 1000 && age <= hours * 60 * 60 * 1000;
}

export function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalize(item.title).replace(/\W/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pragueParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function czechLongDate(date = new Date()) {
  const p = pragueParts(date);
  return `${Number(p.day)}. ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

export function czechShortDate(date = new Date()) {
  const p = pragueParts(date);
  return `${Number(p.day)}. ${Number(p.month)}. ${p.year}`;
}

export function czechDayMonth(date = new Date()) {
  const p = pragueParts(date);
  return `${Number(p.day)}. ${Number(p.month)}.`;
}

export function pragueTime(date = new Date()) {
  const p = pragueParts(date);
  return `${p.hour}:${p.minute}`;
}

export function replaceMarker(html, name, content) {
  const start = `<!-- AUTO:${name}:START -->`;
  const end = `<!-- AUTO:${name}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) throw new Error(`V index.html chybí automatizační značka ${name}.`);
  return html.replace(pattern, `${start}\n${content}\n${end}`);
}

const CARD_COLOR = { global: "blue", europe: "mint", region: "coral" };
const CARD_PREFIX = { global: "D-G", europe: "D-E", region: "D-R" };
const GROUP_LABEL = {
  global: "Aktuální globální signál", europe: "Aktuální evropský signál",
  region: "Aktuální CZ/SK signál",
};

export function renderDailyCards(items, group) {
  if (!items.length) return "";
  const cards = items.map((item, index) => {
    const published = new Date(item.publishedAt);
    const summary = item.summary && item.summary.length > 40
      ? item.summary.slice(0, 360).replace(/\s+\S*$/, "") + "…"
      : `Nová ověřená zmínka o sledovaném hráči: ${item.title}.`;
    return `      <article class="signalCard ${CARD_COLOR[group]}"><div class="cardTop"><span class="number">${CARD_PREFIX[group]}${index + 1}</span><span class="tag">${GROUP_LABEL[group]}</span></div><time class="articleDate" datetime="${published.toISOString().slice(0, 10)}">${escapeHtml(czechShortDate(published))}</time><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(summary)}</p><div class="impact"><span>Proč je to důležité</span><p>Jde o nový signál z posledních 24 hodin zachycený v denním monitoringu sledovaných platforem.</p></div><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Zdroj: ${escapeHtml(item.source)} ↗</a></article>`;
  }).join("\n");
  return `    <div class="signalGrid autoDailySignals" aria-label="Nové zprávy za posledních 24 hodin">\n${cards}\n    </div>`;
}

export function renderSeduoMentions(items) {
  if (!items.length) {
    return `    <article class="emptyMedia"><strong>0</strong><div><h3>Bez ověřené externí mediální zmínky</h3><p>Ve veřejně dohledatelných českých a slovenských médiích jsme v tomto období nenašli nový článek ani zprávu se zmínkou o Seduo. Vlastní stránky Seduo, produktová dokumentace a katalogy kurzů se do mediálního přehledu nepočítají.</p></div></article>`;
  }
  return items.map((item) => {
    const published = new Date(item.publishedAt);
    return `    <article class="emptyMedia mediaHit"><strong>${escapeHtml(czechDayMonth(published))}</strong><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.source)}</p><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Otevřít článek ↗</a></div></article>`;
  }).join("\n");
}

export function updateFinanceCards(html, quotes = []) {
  for (const quote of quotes) {
    const pattern = new RegExp(`<article class="stockCard ([^"]+)" data-ticker="${quote.ticker}">[\\s\\S]*?<\\/article>`);
    const match = html.match(pattern);
    if (!match) continue;
    const date = new Date(`${quote.date}T12:00:00Z`);
    const price = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote.price);
    const change = `${quote.changePct >= 0 ? "+" : "−"}${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(quote.changePct))} %`;
    const changeClass = quote.changePct >= 0 ? "stockUp" : "stockDown";
    const card = match[0]
      .replace(/<time datetime="[^"]+">[\s\S]*?<\/time>/, `<time datetime="${quote.date}">závěr ${czechDayMonth(date)}</time>`)
      .replace(/<div class="stockPrice"><strong>[\s\S]*?<\/strong><span>[\s\S]*?<\/span><em class="[^"]+">[\s\S]*?<\/em><\/div>/, `<div class="stockPrice"><strong>${price}</strong><span>${escapeHtml(quote.currency)}</span><em class="${changeClass}">${change}</em></div>`);
    html = html.replace(pattern, card);
  }
  return html;
}

export function updateIndex(html, result, now = new Date()) {
  const p = pragueParts(now);
  const newCount = result.global.length + result.europe.length + result.region.length;
  const statusHeadline = newCount ? `Dnes zachyceno ${newCount} nových ověřených signálů.` : "Dnes bez nového ověřeného tržního signálu.";
  const statusText = newCount
    ? "Nové položky jsou zobrazené na začátku příslušných regionálních sekcí. Starší relevantní signály zůstávají zachované pro kontext."
    : "Monitoring za posledních 24 hodin nepřinesl významnou produktovou nebo byznysovou zprávu. Zachováváme proto poslední relevantní články s jejich původním datem.";

  html = html.replace(/<span class="dateBadge">[\s\S]*?<\/span>/, `<span class="dateBadge">Aktualizováno ${czechLongDate(now)}</span>`);
  html = html.replace(/<span class="updateText">[\s\S]*?<\/span>/, `<span class="updateText">v ${pragueTime(now)} · Europe/Prague</span>`);
  html = html.replace(/<section class="dailyStatus"[\s\S]*?<\/section>/, `<section class="dailyStatus" aria-label="Stav dnešní aktualizace"><span>Aktualizace ${Number(p.day)}. ${Number(p.month)}.</span><div><strong>${statusHeadline}</strong><p>${statusText}</p></div></section>`);
  html = html.replace(/(<section class="summary"[\s\S]*?<div><strong>3<\/strong>[\s\S]*?<div><strong>93<\/strong>[\s\S]*?<div><strong>)\d+(<\/strong><span>nových zpráv za 24 h<\/span><\/div>)/, `$1${newCount}$2`);
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  html = html.replace(/<p class="mediaDate">[\s\S]*?<\/p>/, `<p class="mediaDate">${czechShortDate(windowStart)} – ${czechShortDate(now)} · kontrolováno při aktualizaci reportu</p>`);
  html = replaceMarker(html, "GLOBAL", renderDailyCards(result.global, "global"));
  html = replaceMarker(html, "EUROPE", renderDailyCards(result.europe, "europe"));
  html = replaceMarker(html, "REGION", renderDailyCards(result.region, "region"));
  html = replaceMarker(html, "SEDUO", renderSeduoMentions(result.seduo));
  return updateFinanceCards(html, result.finance || []);
}
