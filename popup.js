// popup.js
// Maneja la configuracion de la extension.

const defaultConfig = {
  pollingInterval: 5000,
  mepSource: "dolar_si",
  colorThresholds: {
    green: -0.05,
    yellowMin: -0.01,
    yellowMax: 0.01,
    red: 0.05,
  },
};

function showStatus(message, success) {
  const statusEl = document.getElementById("statusMessage");
  statusEl.textContent = message;
  statusEl.style.color = success ? "green" : "red";
  statusEl.style.display = "block";
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 3000);
}

function validateInterval() {
  // Alineado con MIN_UPDATE_GAP_MS del content script.
  const interval = Number.parseInt(document.getElementById("interval").value, 10);
  return !Number.isNaN(interval) && interval >= 4000;
}

function validateThresholds() {
  const green = Number.parseFloat(document.getElementById("green").value);
  const yellowMin = Number.parseFloat(document.getElementById("yellowMin").value);
  const yellowMax = Number.parseFloat(document.getElementById("yellowMax").value);
  const red = Number.parseFloat(document.getElementById("red").value);
  return green < yellowMin && yellowMin < yellowMax && yellowMax < red;
}

function loadConfig() {
  // Carga persisted config; si no existe, usa defaults.
  chrome.storage.local.get("config", (data) => {
    const config = data.config || defaultConfig;
    document.getElementById("interval").value = config.pollingInterval;
    document.getElementById("mepSource").value = config.mepSource;
    document.getElementById("green").value = config.colorThresholds.green;
    document.getElementById("yellowMin").value = config.colorThresholds.yellowMin;
    document.getElementById("yellowMax").value = config.colorThresholds.yellowMax;
    document.getElementById("red").value = config.colorThresholds.red;
  });
}

function saveConfig() {
  if (!validateInterval()) {
    showStatus("Intervalo invalido (minimo 4000ms).", false);
    return;
  }

  if (!validateThresholds()) {
    showStatus("Umbrales invalidos. Orden requerido: verde < amarillo min < amarillo max < rojo.", false);
    return;
  }

  const config = {
    pollingInterval: Number.parseInt(document.getElementById("interval").value, 10),
    mepSource: document.getElementById("mepSource").value,
    colorThresholds: {
      green: Number.parseFloat(document.getElementById("green").value),
      yellowMin: Number.parseFloat(document.getElementById("yellowMin").value),
      yellowMax: Number.parseFloat(document.getElementById("yellowMax").value),
      red: Number.parseFloat(document.getElementById("red").value),
    },
  };

  chrome.storage.local.set({ config }, () => {
    // Al guardar en storage, el content script recibe el evento onChanged
    // y reinicia polling sin necesidad de recargar toda la extension.
    if (chrome.runtime.lastError) {
      showStatus(`Error al guardar: ${chrome.runtime.lastError.message}`, false);
      return;
    }
    showStatus("Configuracion guardada. Recarga la watchlist para aplicar cambios.", true);
    setTimeout(() => window.close(), 1200);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  document.getElementById("saveButton").addEventListener("click", saveConfig);
  document.addEventListener("keypress", (event) => {
    if (event.key === "Enter") saveConfig();
  });
});
