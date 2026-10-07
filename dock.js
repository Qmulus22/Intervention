/**
 * Intervention — Dock Sidebar Component Script
 * Handles expanding/shrinking dock, persisting preference, and theme sync.
 */

(function () {
  'use strict';

  const DOCK_STORAGE_KEY = 'intervention_dock_expanded';
  const THEME_STORAGE_KEY = 'intervention_theme';

  function initDock() {
    const dockEl = document.getElementById('appDock');
    const toggleBtn = document.getElementById('dockToggleBtn');
    const themeBtn = document.getElementById('dockThemeBtn');

    if (!dockEl) return;

    // Restore expanded state
    const isExpanded = localStorage.getItem(DOCK_STORAGE_KEY) === 'true';
    if (isExpanded) {
      dockEl.classList.add('expanded');
    }

    // Toggle expand/shrink
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        dockEl.classList.toggle('expanded');
        const nowExpanded = dockEl.classList.contains('expanded');
        localStorage.setItem(DOCK_STORAGE_KEY, nowExpanded);
      });
    }

    // Highlight current active tool based on pathname
    const currentPath = window.location.pathname.toLowerCase();
    const navItems = dockEl.querySelectorAll('.dock-nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href) {
        const cleanHref = href.toLowerCase().replace('./', '');
        if (currentPath.endsWith(cleanHref) || 
           (cleanHref === 'scheduler.html' && currentPath.includes('scheduler')) || 
           (cleanHref === 'reformat.html' && currentPath.includes('reformat')) ||
           (cleanHref === 'vanish.html' && currentPath.includes('vanish')) ||
           (cleanHref === 'media.html' && currentPath.includes('media')) ||
           (cleanHref === 'currency.html' && currentPath.includes('currency') && !currentPath.includes('vcurrency')) ||
           (cleanHref === 'vcurrency.html' && currentPath.includes('vcurrency'))) {
          navItems.forEach(n => n.classList.remove('active'));
          item.classList.add('active');
        }
      }
    });

    // Theme Toggle inside Dock
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'mocha';
        const nextTheme = currentTheme === 'mocha' ? 'latte' : 'mocha';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        updateThemeIcons(nextTheme);
      });
    }

    // Load saved theme
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'mocha';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);
  }

  function updateThemeIcons(theme) {
    const sunIcons = document.querySelectorAll('.theme-icon-sun');
    const moonIcons = document.querySelectorAll('.theme-icon-moon');
    sunIcons.forEach(el => el.classList.toggle('hidden', theme !== 'latte'));
    moonIcons.forEach(el => el.classList.toggle('hidden', theme === 'latte'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDock);
  } else {
    initDock();
  }
})();
