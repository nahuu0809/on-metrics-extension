# ON Metrics

Extensión de Chrome (Manifest V3) que agrega dos columnas a la **Watchlist de Obligaciones Negociables** de la plataforma de Portfolio Personal (PPI):

- **TC implícito:** el tipo de cambio que surge de comparar el precio de la ON en pesos con el de la misma ON en dólares.
- **% vs MEP:** cuánto se aleja ese tipo de cambio del dólar MEP, con colores para verlo de un vistazo.

## Cómo calcula

```
TC implícito = precio en ARS / precio en USD
% vs MEP     = TC implícito / MEP - 1
```

La extensión toma el par de cada ticker (la versión en pesos y la versión en dólares), lee los precios de la tabla y recalcula con cada actualización. El dólar MEP se consulta a DolarSi o a Rava y se guarda en caché durante un minuto, para no pedirlo en cada refresco.

## Instalación (modo desarrollador)

1. Abrí `chrome://extensions` y activá **Modo de desarrollador**.
2. **Cargar descomprimida** y elegí esta carpeta.
3. Entrá a la Watchlist de PPI (`trading.portfoliopersonal.com/Cotizaciones/WatchList`). Las columnas aparecen solas.

## Configuración

Desde el popup de la extensión:

| Opción | Detalle |
| --- | --- |
| Intervalo de actualización | En milisegundos, mínimo 4000 |
| Fuente del dólar MEP | DolarSi o Rava |
| Umbrales de color | Verde, amarillo y rojo sobre el % vs MEP (valores por defecto: -5 %, ±1 % y +5 %) |

## Archivos

| Archivo | Función |
| --- | --- |
| `manifest.json` | Permisos (`scripting`, `storage`, `activeTab`) y sitios permitidos |
| `content.js` | Lógica principal: pares de tickers, lectura de la tabla, cálculo y colores |
| `popup.html` / `popup.js` | Pantalla de configuración |

## Limitaciones

- Depende de la estructura HTML de la plataforma. Si la plataforma cambia sus clases o su tabla, hay que ajustar los selectores.
- El mapa de tickers (`tickerIdMap` en `content.js`) está escrito a mano y hay que actualizarlo cuando se agregan ONs a la lista.
- No es una recomendación de inversión: muestra un cálculo con los precios que ve en pantalla.
- Proyecto independiente, sin relación con Portfolio Personal.
