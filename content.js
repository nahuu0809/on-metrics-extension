// content.js
// Inyecta TC Implicito y % vs MEP en la watchlist de PPI.

const logger = {
  info: (msg, data = "") => console.log(`[ON Metrics] ${msg}`, data),
  error: (msg, err = "") => console.error(`[ON Metrics ERROR] ${msg}`, err),
  warn: (msg, data = "") => console.warn(`[ON Metrics WARN] ${msg}`, data),
};

const tickerIdMap = {
  DNC3O: { idO: 885959, idD: 885104 },
  DNC5O: { idO: 894119, idD: 894114 },
  DNC7O: { idO: 897483, idD: 897479 },
  IRCPO: { idO: 904910, idD: 904909 },
  MGCQO: { idO: 910258, idD: 910256 },
  MTCGO: { idO: 822531, idD: 822527 },
  NPCCO: { idO: 911135, idD: 911136 },
  PN36O: { idO: 898345, idD: 898367 },
  PN41O: { idO: 911275, idD: 911105 },
  RC1CO: { idO: 910261, idD: 910264 },
  SBC1O: { idO: 911622, idD: 911282 },
  TLCPO: { idO: 907714, idD: 907720 },
  TLCQO: { idO: 908692, idD: 908491 },
  VSCPO: { idO: 889172, idD: 889186 },
  VSCRO: { idO: 896542, idD: 896547 },
  YM34O: { idO: 901820, idD: 901809 },
  YM37O: { idO: 906298, idD: 906207 },
  YM38O: { idO: 909341, idD: 900070 },
  YM39O: { idO: 909340, idD: 909348 },
  YMCIO: { idO: 815179, idD: 815187 },
  YMCJO: { idO: 815181, idD: 815175 },
  YMCXO: { idO: 895657, idD: 895654 },
  ZZC1O: { idO: 903083, idD: 903069 },
};

const pairByTicker = buildPairByTicker(tickerIdMap);

let config = {
  pollingInterval: 5000,
  mepSource: "dolar_si",
  colorThresholds: {
    green: -0.05,
    yellowMin: -0.01,
    yellowMax: 0.01,
    red: 0.05,
  },
};

let pollingTimer = null;
let lastMepPrice = null;
let activeUpdatePromise = null;
let lastMepFetchTs = 0;
let lastUpdateTs = 0;
let scheduledUpdateTimer = null;
let isApplyingDomUpdates = false;

const pairPriceCache = new Map();
// Evita consultar MEP en cada refresh de tabla.
const MEP_CACHE_TTL_MS = 60000;
// Protege contra rafagas de observer + polling.
const MIN_UPDATE_GAP_MS = 4000;

const TC_IMPLICITO_HEADER = `
<th id="th_tc_implicito" tabindex="0" aria-label="TC Implicito sortable"
    class="sortable Table_column__iZfEe" style="text-align: right;"
    data-column-text="TC Implicito" data-field="tc_implicito">
    <div class="d-flex flex-row align-items-center text-center justify-content-end">
        TC Implicito
    </div>
</th>`;

const VS_MEP_HEADER = `
<th id="th_vs_mep" tabindex="0" aria-label="% vs MEP sortable"
    class="sortable Table_column__iZfEe" style="text-align: right;"
    data-column-text="% vs MEP" data-field="vs_mep">
    <div class="d-flex flex-row align-items-center text-center justify-content-end">
        % vs MEP
    </div>
</th>`;

function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

function cleanAndParsePrice(text) {
  if (!text) return NaN;
  const cleaned = text
    .trim()
    .replace("US$", "")
    .replace("AR$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number.parseFloat(cleaned);
}

function formatPrice(price) {
  if (typeof price !== "number" || Number.isNaN(price)) return "N/A";
  return price
    .toFixed(2)
    .replace(".", "TEMP")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    .replace("TEMP", ",");
}

function formatPercentage(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(2).replace(".", ",")}%`;
}

function getColorStyle(vsMep) {
  if (vsMep <= config.colorThresholds.green) {
    return "background-color: rgb(155, 255, 149); padding: 2px 4px; border-radius: 4px;";
  }
  if (vsMep < config.colorThresholds.yellowMin) {
    return "background-color: rgb(173, 255, 169); padding: 2px 4px; border-radius: 4px;";
  }
  if (vsMep <= config.colorThresholds.yellowMax) {
    return "background-color: rgb(255, 222, 124); padding: 2px 4px; border-radius: 4px;";
  }
  if (vsMep < config.colorThresholds.red) {
    return "background-color: rgb(255, 204, 153); padding: 2px 4px; border-radius: 4px;";
  }
  return "background-color: rgb(255, 153, 153); padding: 2px 4px; border-radius: 4px;";
}

function buildPairByTicker(mapByO) {
  const pairMap = {};
  Object.keys(mapByO).forEach((tickerO) => {
    const tickerD = tickerO.replace(/O$/, "D");
    const pair = { tickerO, tickerD };
    pairMap[tickerO] = pair;
    pairMap[tickerD] = pair;
  });
  return pairMap;
}

function normalizeTicker(rawText) {
  if (!rawText) return null;
  const match = rawText.toUpperCase().match(/[A-Z0-9]+[OD]\b/);
  return match ? match[0] : null;
}

function getWatchlistTable() {
  return document.querySelector(".react-bootstrap-table table") || document.querySelector("table");
}

function getTableHeaderRow(tableEl) {
  if (!tableEl) return null;
  return tableEl.querySelector("thead tr");
}

function getTableRows(tableEl) {
  if (!tableEl) return [];
  return Array.from(tableEl.querySelectorAll("tbody tr"));
}

function getTickerElement(row) {
  return row.querySelector('a[id^="info_"] button[id^="title_"]') || row.querySelector("button[id^='title_']");
}

function getPriceCell(row) {
  return row.querySelector("td:nth-child(2)");
}

function addTableHeaders(tableEl) {
  if (document.getElementById("th_tc_implicito")) return;
  const headerRow = getTableHeaderRow(tableEl);
  if (!headerRow) return;
  headerRow.insertAdjacentHTML("beforeend", TC_IMPLICITO_HEADER + VS_MEP_HEADER);
}

function addExtraCellsToRow(row, metricValues) {
  const {
    ticker,
    tcImplicitoValue,
    vsMepValue,
    tcImplicitoDisplay,
    vsMepDisplay,
    vsMepStyle,
    title,
  } = metricValues;

  let tcImplicitoCell = row.querySelector(".tc-implicito-cell");
  let vsMepCell = row.querySelector(".vs-mep-cell");

  if (tcImplicitoCell && vsMepCell) {
    tcImplicitoCell.dataset.sort = String(tcImplicitoValue);
    vsMepCell.dataset.sort = String(vsMepValue);
    tcImplicitoCell.title = title;
    vsMepCell.title = title;
    tcImplicitoCell.style.cssText = "text-align: right;";
    vsMepCell.style.cssText = `text-align: right; ${vsMepStyle}`;
    tcImplicitoCell.textContent = tcImplicitoDisplay;
    vsMepCell.textContent = vsMepDisplay;
    return;
  }

  logger.info(`Injecting cells for: ${ticker}`);

  row.insertAdjacentHTML(
    "beforeend",
    `<td class="extra-metric tc-implicito-cell" title="${title}" data-sort="${tcImplicitoValue}" data-field="tc_implicito" style="text-align: right;">${tcImplicitoDisplay}</td>` +
      `<td class="extra-metric vs-mep-cell" title="${title}" data-sort="${vsMepValue}" data-field="vs_mep" style="text-align: right; ${vsMepStyle}">${vsMepDisplay}</td>`
  );
}

function extractRowSnapshot(row) {
  const tickerEl = getTickerElement(row);
  const priceEl = getPriceCell(row);
  if (!tickerEl || !priceEl) return null;

  const ticker = normalizeTicker(tickerEl.textContent);
  const price = cleanAndParsePrice(priceEl.textContent);
  if (!ticker || Number.isNaN(price) || price <= 0) return null;

  return { row, ticker, price };
}

function buildPricesFromRows(rows) {
  const pairPrices = new Map();

  rows.forEach((row) => {
    const snapshot = extractRowSnapshot(row);
    if (!snapshot) return;

    const { ticker, price } = snapshot;
    const pair = pairByTicker[ticker];
    if (!pair) return;

    const current = pairPrices.get(pair.tickerO) || {
      tickerO: pair.tickerO,
      tickerD: pair.tickerD,
      priceO: null,
      priceD: null,
    };

    if (ticker.endsWith("O")) current.priceO = price;
    if (ticker.endsWith("D")) current.priceD = price;
    pairPrices.set(pair.tickerO, current);
  });

  // Si en el render actual falta una pata O o D, reutiliza la ultima conocida.
  pairPrices.forEach((value, key) => {
    const cached = pairPriceCache.get(key);
    if (cached) {
      if (value.priceO == null && cached.priceO != null) value.priceO = cached.priceO;
      if (value.priceD == null && cached.priceD != null) value.priceD = cached.priceD;
    }
    if (value.priceO != null || value.priceD != null) {
      pairPriceCache.set(key, value);
    }
  });

  return pairPrices;
}

function resolveValueByPath(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

function extractFirstNumber(payload, paths) {
  for (const path of paths) {
    const value = resolveValueByPath(payload, path);
    if (value == null) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = cleanAndParsePrice(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMepFromDolarsi() {
  const payload = await fetchJsonWithTimeout("https://www.dolarsi.com/api/api.php?type=valoresprincipales");
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Dolarsi payload");
  }

  const mepEntry = payload.find((item) => {
    const casa = item?.casa || {};
    const name = String(casa.nombre || "").toLowerCase();
    return name.includes("bolsa") || name.includes("mep");
  });

  if (!mepEntry?.casa) {
    throw new Error("Could not find MEP in Dolarsi response");
  }

  const mep = extractFirstNumber(mepEntry, ["casa.venta", "casa.compra"]);
  if (mep == null) {
    throw new Error("Invalid MEP values in Dolarsi response");
  }
  return mep;
}

async function fetchMepFromRava() {
  const candidates = [
    "https://www.rava.com/perfil/DOLAR%20MEP",
    "https://www.rava.com/api/profile",
  ];

  for (const url of candidates) {
    try {
      const payload = await fetchJsonWithTimeout(url, 4000);
      const mep = extractFirstNumber(payload, [
        "ultimoPrecio",
        "cotizacion.ultimoPrecio",
        "precio",
        "price",
        "data.ultimoPrecio",
        "data.precio",
      ]);
      if (mep != null) return mep;
    } catch (err) {
      logger.warn(`Rava candidate failed: ${url}`, err?.message || err);
    }
  }

  throw new Error("Could not parse Rava MEP response");
}

async function fetchMepPrice() {
  const now = Date.now();
  // Cache temporal para no sobrecargar fuentes externas.
  if (lastMepPrice != null && now - lastMepFetchTs < MEP_CACHE_TTL_MS) {
    return lastMepPrice;
  }

  const fetchBySource = {
    dolar_si: fetchMepFromDolarsi,
    rava: fetchMepFromRava,
  };

  const selectedFetch = fetchBySource[config.mepSource] || fetchMepFromDolarsi;

  try {
    const mep = await selectedFetch();
    if (!Number.isFinite(mep) || mep <= 0) {
      throw new Error(`Invalid MEP value: ${mep}`);
    }
    lastMepFetchTs = Date.now();
    return mep;
  } catch (err) {
    logger.warn(`Failed to fetch MEP from ${config.mepSource}`, err?.message || err);
    if (lastMepPrice != null) {
      logger.warn("Using last known MEP price due to fetch failure", lastMepPrice);
      return lastMepPrice;
    }
    throw err;
  }
}

function getPairPricesForTicker(ticker, pairPrices) {
  const pair = pairByTicker[ticker];
  if (!pair) return null;
  return pairPrices.get(pair.tickerO) || null;
}

function parseBrokerData(row, mepValue, pairPrices) {
  const snapshot = extractRowSnapshot(row);
  if (!snapshot) return;

  const { ticker } = snapshot;
  const pair = getPairPricesForTicker(ticker, pairPrices);
  if (!pair) return;

  const p_o = pair.priceO;
  const p_d = pair.priceD;
  if (typeof p_o !== "number" || typeof p_d !== "number" || p_o <= 0 || p_d <= 0) {
    return;
  }

  const tcImplicitoValue = p_o / p_d;
  const vsMepValue = tcImplicitoValue / mepValue - 1;

  const tcImplicitoDisplay = formatPrice(tcImplicitoValue);
  const vsMepDisplay = formatPercentage(vsMepValue);
  const vsMepStyle = getColorStyle(vsMepValue);
  const title = `Precio ARS: ${formatPrice(p_o)}
Precio USD: ${formatPrice(p_d)}
TC Implicito: ${formatPrice(tcImplicitoValue)}
MEP: ${formatPrice(mepValue)}
% vs MEP: ${vsMepDisplay}
Actualizado: ${new Date().toLocaleTimeString()}`;

  addExtraCellsToRow(row, {
    ticker,
    tcImplicitoValue: Number(tcImplicitoValue.toFixed(2)),
    vsMepValue: Number(vsMepValue.toFixed(4)),
    tcImplicitoDisplay,
    vsMepDisplay,
    vsMepStyle,
    title,
  });
}

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get("config", (data) => resolve(data.config || config));
  });
}

async function updateMetrics() {
  // Serializa ejecuciones para que nunca corran dos updates en paralelo.
  if (activeUpdatePromise) return activeUpdatePromise;

  activeUpdatePromise = (async () => {
    config = await loadConfig();

    let mepPrice;
    try {
      mepPrice = await fetchMepPrice();
    } catch (err) {
      logger.error("Could not fetch MEP price from configured sources.", err);
      return;
    }

    lastMepPrice = mepPrice;
    logger.info(`MEP Price: ${formatPrice(mepPrice)} from ${config.mepSource}`);

    const table = getWatchlistTable();
    if (!table) {
      logger.warn("Watchlist table not found.");
      return;
    }

    // Marca para que el observer ignore mutaciones propias.
    isApplyingDomUpdates = true;
    try {
      addTableHeaders(table);
      const rows = getTableRows(table);
      const pairPrices = buildPricesFromRows(rows);
      rows.forEach((row) => parseBrokerData(row, mepPrice, pairPrices));
    } finally {
      isApplyingDomUpdates = false;
    }
    lastUpdateTs = Date.now();
  })();

  try {
    await activeUpdatePromise;
  } finally {
    activeUpdatePromise = null;
  }
}

function requestUpdate(reason = "manual", force = false) {
  // Si la pestana no esta visible, evitamos trabajo y requests innecesarios.
  if (document.visibilityState === "hidden") {
    return;
  }

  if (scheduledUpdateTimer) {
    clearTimeout(scheduledUpdateTimer);
    scheduledUpdateTimer = null;
  }

  const elapsed = Date.now() - lastUpdateTs;
  const waitMs = force ? 0 : Math.max(0, MIN_UPDATE_GAP_MS - elapsed);

  scheduledUpdateTimer = setTimeout(() => {
    scheduledUpdateTimer = null;
    logger.info(`Running update (${reason})`);
    updateMetrics();
  }, waitMs);
}

function startPolling() {
  if (pollingTimer) stopPolling();
  // Nunca permitir polling mas agresivo que el limite global.
  const interval = Math.max(config.pollingInterval, MIN_UPDATE_GAP_MS);
  pollingTimer = setInterval(() => requestUpdate("polling"), interval);
  logger.info(`Polling started with interval: ${interval}ms`);
}

function stopPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
  logger.info("Polling stopped.");
}

const debouncedUpdate = debounce(() => requestUpdate("mutation"), 1200);

const observer = new MutationObserver((mutations) => {
  // Ignora los cambios generados por la propia extension al inyectar celdas.
  if (isApplyingDomUpdates) return;

  const relevantChange = mutations.some((mutation) => {
    if (mutation.type !== "childList") return false;
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    const onlyOwnNodes = changedNodes.length > 0 && changedNodes.every((node) => {
      if (!(node instanceof Element)) return true;
      if (node.id === "th_tc_implicito" || node.id === "th_vs_mep") return true;
      if (node.classList.contains("extra-metric")) return true;
      if (node.querySelector(".extra-metric")) return true;
      return false;
    });
    if (!onlyOwnNodes && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) return true;
    const target = mutation.target;
    return target instanceof Element && target.closest(".react-bootstrap-table") != null;
  });
  if (relevantChange) debouncedUpdate();
});

function startObserver() {
  const container = document.querySelector(".react-bootstrap-table") || document.body;
  observer.observe(container, { childList: true, subtree: true });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.config) return;
  logger.info("Config changed, restarting polling.");
  pairPriceCache.clear();
  lastMepFetchTs = 0;
  stopPolling();
  startPolling();
  requestUpdate("config-change", true);
});

async function init() {
  if (!chrome.runtime || !chrome.runtime.id) {
    logger.error("Extension context invalidated.");
    return;
  }
  logger.info("ON Metrics initializing...");
  startObserver();
  await updateMetrics();
  startPolling();
  logger.info("ON Metrics initialized successfully.");
}

init();
