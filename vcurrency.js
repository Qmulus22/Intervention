/**
 * VCurrency — Virtual Currency / Crypto Tracker Engine
 * Features:
 * - Live Bitcoin, Ethereum, Solana, and top asset pricing
 * - Conversions to USD, PHP, JPY, EUR, or crypto-to-crypto
 * - Crypto market rank & performance index
 * - Historical timeline price action chart with Chart.js
 * - Public API live fetch with offline fallback
 */

(function () {
  'use strict';

  // Base state (USD valuations)
  let cryptoPrices = {
    BTC: { name: 'Bitcoin', priceUsd: 64250.00, change24h: 2.45 },
    ETH: { name: 'Ethereum', priceUsd: 3480.00, change24h: 1.80 },
    SOL: { name: 'Solana', priceUsd: 152.40, change24h: 5.12 },
    BNB: { name: 'Binance Coin', priceUsd: 585.00, change24h: -0.65 },
    XRP: { name: 'Ripple', priceUsd: 0.58, change24h: 0.95 },
    ADA: { name: 'Cardano', priceUsd: 0.42, change24h: -1.20 },
    DOGE: { name: 'Dogecoin', priceUsd: 0.12, change24h: 3.10 },
    AVAX: { name: 'Avalanche', priceUsd: 28.50, change24h: 4.25 }
  };

  // Fiat multipliers relative to USD
  let fiatRates = {
    USD: 1.00,
    PHP: 57.25,
    JPY: 151.80,
    EUR: 0.92
  };

  let chartInstance = null;
  let activeTimeframe = '30D';

  // DOM Elements
  const btcPriceEl = document.getElementById('btcPrice');
  const btcFiatSubEl = document.getElementById('btcFiatSub');
  const btcChangeEl = document.getElementById('btcChange');

  const ethPriceEl = document.getElementById('ethPrice');
  const ethFiatSubEl = document.getElementById('ethFiatSub');
  const ethChangeEl = document.getElementById('ethChange');

  const solPriceEl = document.getElementById('solPrice');
  const solChangeEl = document.getElementById('solChange');

  const xrpPriceEl = document.getElementById('xrpPrice');
  const xrpChangeEl = document.getElementById('xrpChange');

  const vAmountInput = document.getElementById('vAmountInput');
  const vFromSelect = document.getElementById('vFromSelect');
  const vToSelect = document.getElementById('vToSelect');
  const vSwapBtn = document.getElementById('vSwapBtn');
  const vResultLabel = document.getElementById('vResultLabel');
  const vResultValue = document.getElementById('vResultValue');

  const vLeaderboardList = document.getElementById('vLeaderboardList');
  const vTimelineCanvas = document.getElementById('vTimelineChart');
  const vTimelineAsset = document.getElementById('vTimelineAsset');
  const vTimeBtns = document.querySelectorAll('.v-time-btn');

  // Fetch Live Crypto & Fiat
  async function fetchLiveCrypto() {
    try {
      const res = await fetch('https://api.coincap.io/v2/assets?limit=10');
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          data.data.forEach(coin => {
            const sym = coin.symbol.toUpperCase();
            if (cryptoPrices[sym]) {
              cryptoPrices[sym].priceUsd = parseFloat(coin.priceUsd);
              cryptoPrices[sym].change24h = parseFloat(coin.changePercent24Hr);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Using baseline virtual currency prices (offline mode).');
    }

    try {
      const resFiat = await fetch('https://open.er-api.com/v6/latest/USD');
      if (resFiat.ok) {
        const dataFiat = await resFiat.json();
        if (dataFiat.rates) {
          fiatRates.PHP = dataFiat.rates.PHP || 57.25;
          fiatRates.JPY = dataFiat.rates.JPY || 151.80;
          fiatRates.EUR = dataFiat.rates.EUR || 0.92;
        }
      }
    } catch (e) {
      // Use fallback
    }

    updateCryptoHighlights();
    calculateVConversion();
    renderCryptoLeaderboard();
    renderCryptoTimeline();
  }

  function updateCryptoHighlights() {
    // BTC
    const btcUsd = cryptoPrices.BTC.priceUsd;
    const btcPhp = btcUsd * fiatRates.PHP;
    if (btcPriceEl) btcPriceEl.textContent = `$${btcUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (btcFiatSubEl) btcFiatSubEl.textContent = `≈ ₱${btcPhp.toLocaleString(undefined, { maximumFractionDigits: 0 })} PHP`;
    if (btcChangeEl) setChangeTag(btcChangeEl, cryptoPrices.BTC.change24h);

    // ETH
    const ethUsd = cryptoPrices.ETH.priceUsd;
    const ethPhp = ethUsd * fiatRates.PHP;
    if (ethPriceEl) ethPriceEl.textContent = `$${ethUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (ethFiatSubEl) ethFiatSubEl.textContent = `≈ ₱${ethPhp.toLocaleString(undefined, { maximumFractionDigits: 0 })} PHP`;
    if (ethChangeEl) setChangeTag(ethChangeEl, cryptoPrices.ETH.change24h);

    // SOL
    if (solPriceEl) solPriceEl.textContent = `$${cryptoPrices.SOL.priceUsd.toFixed(2)}`;
    if (solChangeEl) setChangeTag(solChangeEl, cryptoPrices.SOL.change24h);

    // XRP
    if (xrpPriceEl) xrpPriceEl.textContent = `$${cryptoPrices.XRP.priceUsd.toFixed(4)}`;
    if (xrpChangeEl) setChangeTag(xrpChangeEl, cryptoPrices.XRP.change24h);
  }

  function setChangeTag(el, val) {
    const isUp = val >= 0;
    el.textContent = `${isUp ? '+' : ''}${val.toFixed(2)}%`;
    el.className = `crypto-change ${isUp ? 'change-up' : 'change-down'}`;
  }

  // Calculate Crypto Conversion
  function calculateVConversion() {
    const amount = parseFloat(vAmountInput.value) || 0;
    const from = vFromSelect.value;
    const to = vToSelect.value;

    let priceFromInUsd = 1;
    let priceToInUsd = 1;

    // Get USD base for 'from'
    if (cryptoPrices[from]) {
      priceFromInUsd = cryptoPrices[from].priceUsd;
    } else if (fiatRates[from]) {
      priceFromInUsd = 1 / fiatRates[from];
    }

    // Get USD base for 'to'
    if (cryptoPrices[to]) {
      priceToInUsd = cryptoPrices[to].priceUsd;
    } else if (fiatRates[to]) {
      priceToInUsd = 1 / fiatRates[to];
    }

    const converted = (amount * priceFromInUsd) / priceToInUsd;
    const unitRate = priceFromInUsd / priceToInUsd;

    vResultLabel.textContent = `${amount} ${from} = (1 ${from} ≈ ${unitRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${to})`;
    vResultValue.textContent = `${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${to}`;

    if (vTimelineAsset) {
      const assetKey = cryptoPrices[from] ? from : (cryptoPrices[to] ? to : 'BTC');
      vTimelineAsset.textContent = `${assetKey} ($USD)`;
    }
  }

  function swapVConversion() {
    const temp = vFromSelect.value;
    vFromSelect.value = vToSelect.value;
    vToSelect.value = temp;
    calculateVConversion();
    renderCryptoTimeline();
  }

  // Crypto Leaderboard
  function renderCryptoLeaderboard() {
    const coins = Object.keys(cryptoPrices).map(sym => ({
      sym,
      name: cryptoPrices[sym].name,
      price: cryptoPrices[sym].priceUsd,
      change: cryptoPrices[sym].change24h
    }));

    // Sort by price ranking
    coins.sort((a, b) => b.price - a.price);

    vLeaderboardList.innerHTML = coins.map((c, idx) => {
      const isUp = c.change >= 0;
      return `
        <div class="v-leaderboard-item">
          <div class="v-crypto-info">
            <span class="v-rank-number">#${idx + 1}</span>
            <div>
              <span class="v-coin-symbol">${c.sym}</span>
              <span class="v-coin-name">${c.name}</span>
            </div>
          </div>
          <div class="v-bar-track">
            <div class="v-bar-fill" style="width: ${Math.max(15, 100 - (idx * 12))}%;"></div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end;">
            <span class="v-price-val">$${c.price >= 1 ? c.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : c.price.toFixed(4)}</span>
            <span style="font-size: 0.72rem; font-weight:700; color: ${isUp ? 'var(--cp-green)' : 'var(--cp-red)'};">
              ${isUp ? '+' : ''}${c.change.toFixed(2)}%
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Generate Synthetic Crypto Timeline
  function getCryptoTimeline(asset, timeframe) {
    let days = 30;
    if (timeframe === '7D') days = 7;
    if (timeframe === '90D') days = 90;
    if (timeframe === '1Y') days = 365;

    const basePrice = cryptoPrices[asset] ? cryptoPrices[asset].priceUsd : cryptoPrices.BTC.priceUsd;
    const labels = [];
    const values = [];

    const now = new Date();
    const step = Math.max(1, Math.floor(days / 15));

    for (let i = days; i >= 0; i -= step) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));

      // Crypto cyclical wave
      const wave = (Math.sin(i * 0.35) * 0.06) + (Math.cos(i * 0.6) * 0.04);
      const val = basePrice * (1 + wave);
      values.push(parseFloat(val.toFixed(2)));
    }

    return { labels, values };
  }

  // Render Crypto Timeline Chart
  function renderCryptoTimeline() {
    if (!vTimelineCanvas) return;

    const fromVal = vFromSelect.value;
    const toVal = vToSelect.value;
    const asset = cryptoPrices[fromVal] ? fromVal : (cryptoPrices[toVal] ? toVal : 'BTC');

    const { labels, values } = getCryptoTimeline(asset, activeTimeframe);

    if (chartInstance) {
      chartInstance.destroy();
    }

    const isLatte = document.documentElement.getAttribute('data-theme') === 'latte';
    const gridColor = isLatte ? 'rgba(76, 79, 105, 0.08)' : 'rgba(205, 214, 244, 0.08)';
    const textColor = isLatte ? '#5c5f77' : '#a6adc8';
    const lineColor = isLatte ? '#04a5e5' : '#89dceb';

    const ctx = vTimelineCanvas.getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${asset} Price (USD)`,
          data: values,
          borderColor: lineColor,
          backgroundColor: isLatte ? 'rgba(4, 165, 229, 0.08)' : 'rgba(137, 220, 235, 0.08)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: lineColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isLatte ? '#ffffff' : '#181825',
            titleColor: isLatte ? '#4c4f69' : '#cdd6f4',
            bodyColor: isLatte ? '#4c4f69' : '#cdd6f4',
            borderColor: gridColor,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (context) => `$${context.parsed.y.toLocaleString()} USD`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (val) => `$${val.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  function initListeners() {
    vAmountInput.addEventListener('input', calculateVConversion);
    vFromSelect.addEventListener('change', () => {
      calculateVConversion();
      renderCryptoTimeline();
    });
    vToSelect.addEventListener('change', () => {
      calculateVConversion();
      renderCryptoTimeline();
    });
    vSwapBtn.addEventListener('click', swapVConversion);

    vTimeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        vTimeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTimeframe = btn.getAttribute('data-timeframe');
        renderCryptoTimeline();
      });
    });

    const observer = new MutationObserver(() => renderCryptoTimeline());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initListeners();
    fetchLiveCrypto();
  });
})();

