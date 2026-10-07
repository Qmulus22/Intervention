/**
 * Intervention — Home Hub Script
 * Displays live stats on speed dial cards, manages live clock, exchange rate teasers, and theme.
 */

(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'intervention_theme';
  const TASKS_STORAGE_KEY = 'chronos_tasks_v1';

  function initHome() {
    initTheme();
    initClock();
    updateSchedulerCardStats();
    loadLiveTeasers();
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'mocha';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);

    const themeToggleBtn = document.getElementById('homeThemeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'mocha';
        const next = current === 'mocha' ? 'latte' : 'mocha';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_STORAGE_KEY, next);
        updateThemeIcons(next);
      });
    }
  }

  function updateThemeIcons(theme) {
    const sunIcons = document.querySelectorAll('.theme-icon-sun');
    const moonIcons = document.querySelectorAll('.theme-icon-moon');
    sunIcons.forEach(el => el.classList.toggle('hidden', theme !== 'latte'));
    moonIcons.forEach(el => el.classList.toggle('hidden', theme === 'latte'));
  }

  // Live Clock
  function initClock() {
    const timeEl = document.getElementById('homeClockTime');
    const dateEl = document.getElementById('homeClockDate');

    function update() {
      const now = new Date();
      if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour12: false });
      if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }

    update();
    setInterval(update, 1000);
  }

  // Live Stats on Chrono Scheduler Card
  function updateSchedulerCardStats() {
    const taskCountBadge = document.getElementById('schedulerTaskCountBadge');
    const taskStatusText = document.getElementById('schedulerStatusText');

    try {
      const raw = localStorage.getItem(TASKS_STORAGE_KEY);
      if (raw) {
        const tasks = JSON.parse(raw);
        const active = tasks.filter(t => !t.completed);
        const now = Date.now();
        const dueSoon = active.filter(t => {
          const diff = new Date(t.datetime).getTime() - now;
          return diff > 0 && diff <= 5 * 60 * 1000;
        });

        if (taskCountBadge) {
          taskCountBadge.textContent = `${active.length} Active Tasks`;
        }
        if (taskStatusText) {
          if (dueSoon.length > 0) {
            taskStatusText.innerHTML = `<span class="status-dot" style="background-color: var(--cp-peach);"></span> ${dueSoon.length} task${dueSoon.length > 1 ? 's' : ''} almost due`;
          } else if (active.length > 0) {
            taskStatusText.innerHTML = `<span class="status-dot"></span> Next schedule active`;
          } else {
            taskStatusText.innerHTML = `<span class="status-dot"></span> Ready to schedule`;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // Fetch or estimate live rates for Currency & VCurrency cards
  async function loadLiveTeasers() {
    const currencyStatusText = document.getElementById('currencyStatusText');
    const vcurrencyStatusText = document.getElementById('vcurrencyStatusText');

    // Default fallbacks
    if (currencyStatusText) {
      currencyStatusText.innerHTML = `<span class="status-dot" style="background-color: var(--cp-green);"></span> 1 JPY ≈ 0.38 PHP`;
    }
    if (vcurrencyStatusText) {
      vcurrencyStatusText.innerHTML = `<span class="status-dot" style="background-color: var(--cp-sky);"></span> BTC ≈ $64,250`;
    }

    // Attempt real rates
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data.rates && data.rates.JPY && data.rates.PHP) {
          const jpyToPhp = (data.rates.PHP / data.rates.JPY).toFixed(4);
          if (currencyStatusText) {
            currencyStatusText.innerHTML = `<span class="status-dot" style="background-color: var(--cp-green);"></span> 1 JPY = ₱${jpyToPhp} PHP`;
          }
        }
      }
    } catch (e) {
      // Keep fallback
    }

    try {
      const resCrypto = await fetch('https://api.coincap.io/v2/assets/bitcoin');
      if (resCrypto.ok) {
        const dataCrypto = await resCrypto.json();
        if (dataCrypto.data && dataCrypto.data.priceUsd) {
          const btcPrice = parseFloat(dataCrypto.data.priceUsd).toLocaleString('en-US', { maximumFractionDigits: 0 });
          if (vcurrencyStatusText) {
            vcurrencyStatusText.innerHTML = `<span class="status-dot" style="background-color: var(--cp-sky);"></span> BTC = $${btcPrice}`;
          }
        }
      }
    } catch (e) {
      // Keep fallback
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHome);
  } else {
    initHome();
  }
})();
