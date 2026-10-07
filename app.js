/**
 * Chronos — Modern Minimalist Task Scheduler
 * Features: Complete CRUD operations, real-time schedule engine,
 * Web Audio API synthesized chimes for "almost due" & due alerts,
 * localStorage persistence, filters, search, and streamlined workflow.
 */

(function () {
  'use strict';

  // =========================================================================
  // State Management
  // =========================================================================
  const STORAGE_KEY_TASKS = 'chronos_tasks_v1';
  const STORAGE_KEY_SETTINGS = 'chronos_settings_v1';

  let tasks = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let currentSort = 'time-asc';
  let editingTaskId = null;
  let deletingTaskId = null;

  let settings = {
    soundEnabled: true,
    defaultLeadTime: 5, // minutes
    theme: 'dark'
  };

  // =========================================================================
  // Web Audio API Synthesizer (Zero external dependencies)
  // =========================================================================
  class SoundService {
    constructor() {
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    play(tone = 'modern-crystal') {
      if (!settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      switch (tone) {
        case 'modern-crystal':
          // Harmonious shimmering chord: C5, E5, G5, B5, C6 with gentle marimba envelope
          this._playChimeChord([523.25, 659.25, 783.99, 987.77, 1046.50], 0.08, 0.9);
          break;

        case 'soft-bell':
          // Warm meditative brass/bell chime with exponential decay
          this._playBell(587.33, 1.4); // D5
          setTimeout(() => this._playBell(880.00, 1.2), 120); // A5
          break;

        case 'subtle-pulse':
          // Two soft mellow marimba pulses
          this._playPulse(440, 0.0);
          this._playPulse(554.37, 0.14);
          this._playPulse(659.25, 0.28);
          break;

        case 'alert-ping':
        default:
          // Clean futuristic ping
          this._playPing(880, 0.0);
          this._playPing(1174.66, 0.08);
          break;
      }
    }

    _playChimeChord(frequencies, stagger = 0.07, duration = 0.8) {
      frequencies.forEach((freq, index) => {
        const startTime = this.ctx.currentTime + (index * stagger);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    }

    _playBell(freq, duration) {
      const startTime = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 2.02, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      oscHarmonic.start(startTime);
      osc.stop(startTime + duration);
      oscHarmonic.stop(startTime + duration);
    }

    _playPulse(freq, delay) {
      const startTime = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    }

    _playPing(freq, delay) {
      const startTime = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    }
  }

  const sound = new SoundService();

  // =========================================================================
  // Notification Service (Desktop + In-App Toast)
  // =========================================================================
  class NotificationService {
    constructor() {
      this.hasRequestedPermission = false;
    }

    requestPermission() {
      if ('Notification' in window && Notification.permission === 'default' && !this.hasRequestedPermission) {
        this.hasRequestedPermission = true;
        Notification.requestPermission().catch(() => {});
      }
    }

    notify(title, message, isAlarm = false) {
      // In-app toast
      showToast(title, message, isAlarm ? 'alarm' : 'info');

      // Native Web Notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body: message,
            icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
          });
        } catch (e) {
          // Ignore desktop notification failure
        }
      }
    }
  }

  const notifications = new NotificationService();

  // =========================================================================
  // Sample Data Seeding
  // =========================================================================
  function getSampleTasks() {
    const now = new Date();

    // Task 1: Imminent in 4 minutes so user immediately hears/sees "Almost Due" behavior
    const taskAlmostDueTime = new Date(now.getTime() + 4 * 60 * 1000);

    // Task 2: Later today in 45 minutes
    const taskLaterTime = new Date(now.getTime() + 45 * 60 * 1000);

    // Task 3: In 3 hours
    const taskAfternoonTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    return [
      {
        id: 'task_' + (Date.now() - 3000),
        title: 'Project Standup & Sprint Sync',
        datetime: taskAlmostDueTime.toISOString(),
        leadTime: 5, // Lead alert at 5 mins before (triggered right now!)
        tone: 'modern-crystal',
        priority: 'urgent',
        category: 'Work',
        notes: 'Brief sync with team on blocker resolutions & deliverables.',
        completed: false,
        preAlertTriggered: false,
        dueAlertTriggered: false,
        createdAt: new Date().toISOString()
      },
      {
        id: 'task_' + (Date.now() - 2000),
        title: 'Take Deep Focus Break & Hydrate',
        datetime: taskLaterTime.toISOString(),
        leadTime: 5,
        tone: 'soft-bell',
        priority: 'medium',
        category: 'Health',
        notes: 'Step away from screen for 10 minutes.',
        completed: false,
        preAlertTriggered: false,
        dueAlertTriggered: false,
        createdAt: new Date().toISOString()
      },
      {
        id: 'task_' + (Date.now() - 1000),
        title: 'Client Review Presentation',
        datetime: taskAfternoonTime.toISOString(),
        leadTime: 10,
        tone: 'subtle-pulse',
        priority: 'high',
        category: 'Meeting',
        notes: 'Walkthrough final prototype slides.',
        completed: false,
        preAlertTriggered: false,
        dueAlertTriggered: false,
        createdAt: new Date().toISOString()
      }
    ];
  }

  // =========================================================================
  // Storage Handling
  // =========================================================================
  function loadTasks() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TASKS);
      if (stored) {
        tasks = JSON.parse(stored);
      } else {
        tasks = getSampleTasks();
        saveTasks();
      }
    } catch (e) {
      console.warn('Failed to parse localStorage, resetting to sample tasks', e);
      tasks = getSampleTasks();
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    } catch (e) {
      console.error('Failed to save tasks to localStorage', e);
    }
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        settings = Object.assign(settings, JSON.parse(stored));
      }
    } catch (e) {
      // Ignore
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      // Ignore
    }
  }

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const liveClockEl = document.getElementById('liveClock');
  const clockTimeEl = liveClockEl.querySelector('.clock-time');
  const clockDateEl = liveClockEl.querySelector('.clock-date');

  const statTotalEl = document.getElementById('statTotal');
  const statDueSoonEl = document.getElementById('statDueSoon');
  const statTodayEl = document.getElementById('statToday');
  const statCompletedEl = document.getElementById('statCompleted');
  const badgeDueSoonEl = document.getElementById('badgeDueSoon');

  const taskListEl = document.getElementById('taskList');
  const emptyStateEl = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const sortSelect = document.getElementById('sortSelect');

  const alarmBannerEl = document.getElementById('alarmBanner');
  const alarmBannerTitleEl = document.getElementById('alarmBannerTitle');
  const alarmBannerSubEl = document.getElementById('alarmBannerSub');
  const dismissAlarmBtn = document.getElementById('dismissAlarmBtn');
  const snoozeAlarmBtn = document.getElementById('snoozeAlarmBtn');

  // Task Modal Elements
  const taskModal = document.getElementById('taskModal');
  const modalHeading = document.getElementById('modalHeading');
  const taskForm = document.getElementById('taskForm');
  const taskIdInput = document.getElementById('taskId');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskDateInput = document.getElementById('taskDate');
  const taskTimeInput = document.getElementById('taskTime');
  const taskLeadTimeSelect = document.getElementById('taskLeadTime');
  const taskSoundToneSelect = document.getElementById('taskSoundTone');
  const taskPrioritySelect = document.getElementById('taskPriority');
  const taskCategoryInput = document.getElementById('taskCategory');
  const taskNotesInput = document.getElementById('taskNotes');
  const saveBtnText = document.getElementById('saveBtnText');
  const openNewTaskBtn = document.getElementById('openNewTaskBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const emptyCreateBtn = document.getElementById('emptyCreateBtn');

  // Delete Modal Elements
  const deleteModal = document.getElementById('deleteModal');
  const deleteTaskTitleEl = document.getElementById('deleteTaskTitle');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');

  // Audio & Theme buttons
  const testAudioBtn = document.getElementById('testAudioBtn');
  const toggleSoundBtn = document.getElementById('toggleSoundBtn');
  const soundIconOn = document.getElementById('soundIconOn');
  const soundIconOff = document.getElementById('soundIconOff');
  const themeToggleBtn = document.getElementById('dockThemeBtn');

  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const resetDemoBtn = document.getElementById('resetDemoBtn');
  const toastContainer = document.getElementById('toastContainer');
  const presetChips = document.querySelectorAll('.preset-chip');

  let activeAlarmTaskId = null;

  // =========================================================================
  // Formatting Helpers
  // =========================================================================
  function padZero(num) {
    return num.toString().padStart(2, '0');
  }

  function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = padZero(date.getMonth() + 1);
    const day = padZero(date.getDate());
    const hours = padZero(date.getHours());
    const minutes = padZero(date.getMinutes());
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`
    };
  }

  function formatDisplayDateTime(isoStr) {
    const date = new Date(isoStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Today at ${timeStr}`;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeStr}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
  }

  function getCountdownInfo(targetIso) {
    const now = Date.now();
    const target = new Date(targetIso).getTime();
    const diff = target - now;

    if (isNaN(target)) return { text: 'Invalid date', state: 'normal' };

    const isPast = diff < 0;
    const absDiff = Math.abs(diff);

    const totalSeconds = Math.floor(absDiff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let timeString = '';
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      timeString = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      timeString = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      timeString = `${minutes}m ${seconds}s`;
    } else {
      timeString = `${seconds}s`;
    }

    if (isPast) {
      if (absDiff < 60000) {
        return { text: 'Due right now!', state: 'due-now' };
      }
      return { text: `${timeString} overdue`, state: 'overdue' };
    }

    // Almost due threshold (within 5 minutes or task lead time)
    if (diff <= 5 * 60 * 1000) {
      return { text: `in ${timeString}`, state: 'due-soon' };
    }

    return { text: `in ${timeString}`, state: 'upcoming' };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // Scheduler Engine (Runs every 1000ms)
  // =========================================================================
  function tickScheduler() {
    const now = new Date();

    // 1. Update Header Live Clock
    clockTimeEl.textContent = now.toLocaleTimeString([], { hour12: false });
    clockDateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

    let activeAlarmFound = null;
    let dueSoonCount = 0;
    let hasTaskStateChanged = false;

    // 2. Evaluate Each Task's Schedule Timing
    tasks.forEach(task => {
      if (task.completed) return;

      const targetMs = new Date(task.datetime).getTime();
      const diffMs = targetMs - now.getTime();
      const leadMs = (parseInt(task.leadTime, 10) || 0) * 60 * 1000;

      // Check if task is almost due (within lead time window)
      const isAlmostDue = diffMs > 0 && diffMs <= leadMs;
      const isDueOrPast = diffMs <= 0;

      if (isAlmostDue) {
        dueSoonCount++;
      }

      // Pre-Alert Trigger: Task schedule time is almost reached!
      if (isAlmostDue && !task.preAlertTriggered) {
        task.preAlertTriggered = true;
        hasTaskStateChanged = true;

        const minutesLeft = Math.ceil(diffMs / 60000);
        const title = `Almost Due (${minutesLeft}m left)`;
        const message = `"${task.title}" is scheduled at ${formatDisplayDateTime(task.datetime)}.`;

        sound.play(task.tone || 'modern-crystal');
        notifications.notify(title, message, true);

        activeAlarmFound = task;
      }

      // Due Alert Trigger: Task schedule time has arrived!
      if (isDueOrPast && !task.dueAlertTriggered) {
        task.dueAlertTriggered = true;
        hasTaskStateChanged = true;

        const title = `Task Scheduled Time Reached!`;
        const message = `"${task.title}" is due now.`;

        sound.play(task.tone || 'modern-crystal');
        notifications.notify(title, message, true);

        activeAlarmFound = task;
      }

      // If imminent or overdue right now, mark candidate for top banner
      if (!activeAlarmFound && (isAlmostDue || (isDueOrPast && Math.abs(diffMs) < 30 * 60 * 1000))) {
        activeAlarmFound = task;
      }
    });

    if (hasTaskStateChanged) {
      saveTasks();
    }

    // 3. Update Alarm Banner
    if (activeAlarmFound) {
      activeAlarmTaskId = activeAlarmFound.id;
      const targetMs = new Date(activeAlarmFound.datetime).getTime();
      const diffMs = targetMs - now.getTime();
      const isPast = diffMs <= 0;

      alarmBannerTitleEl.textContent = isPast ? 'Task Scheduled Time Reached!' : 'Task Almost Due!';
      alarmBannerSubEl.textContent = `"${activeAlarmFound.title}" — ${isPast ? 'scheduled time arrived' : `starts in ~${Math.max(1, Math.ceil(diffMs / 60000))} min`}`;
      alarmBannerEl.classList.remove('hidden');
    } else {
      activeAlarmTaskId = null;
      alarmBannerEl.classList.add('hidden');
    }

    // 4. Update Stats & Counts
    updateMetrics(dueSoonCount);

    // 5. Update Live Countdowns in Task Cards without rebuilding whole DOM
    updateLiveCardsCountdowns();
  }

  function updateMetrics(dueSoonCount) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;

    const todayStr = new Date().toDateString();
    const todayCount = tasks.filter(t => {
      const d = new Date(t.datetime);
      return d.toDateString() === todayStr;
    }).length;

    statTotalEl.textContent = total;
    statCompletedEl.textContent = completed;
    statTodayEl.textContent = todayCount;
    statDueSoonEl.textContent = dueSoonCount;

    if (dueSoonCount > 0) {
      badgeDueSoonEl.textContent = dueSoonCount;
      badgeDueSoonEl.classList.remove('hidden');
    } else {
      badgeDueSoonEl.classList.add('hidden');
    }
  }

  function updateLiveCardsCountdowns() {
    const countdownEls = taskListEl.querySelectorAll('[data-countdown-id]');
    countdownEls.forEach(el => {
      const taskId = el.getAttribute('data-countdown-id');
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (task.completed) {
        el.textContent = 'Completed';
        el.className = 'time-countdown';
        return;
      }

      const cd = getCountdownInfo(task.datetime);
      el.textContent = cd.text;

      // Update card parent status class dynamically
      const card = el.closest('.task-card');
      if (card) {
        card.classList.remove('status-due-soon', 'status-due-now', 'status-overdue', 'status-upcoming');
        if (cd.state === 'due-soon') {
          card.classList.add('status-due-soon');
          el.className = 'time-countdown countdown-due-soon';
        } else if (cd.state === 'due-now') {
          card.classList.add('status-due-now');
          el.className = 'time-countdown countdown-overdue';
        } else if (cd.state === 'overdue') {
          card.classList.add('status-overdue');
          el.className = 'time-countdown countdown-overdue';
        } else {
          card.classList.add('status-upcoming');
          el.className = 'time-countdown';
        }
      }
    });
  }

  // =========================================================================
  // Rendering Tasks (Read)
  // =========================================================================
  function renderTaskList() {
    const filtered = getFilteredTasks();

    if (filtered.length === 0) {
      taskListEl.innerHTML = '';
      emptyStateEl.classList.remove('hidden');
      return;
    }

    emptyStateEl.classList.add('hidden');

    taskListEl.innerHTML = filtered.map(task => {
      const cd = getCountdownInfo(task.datetime);
      const isCompleted = task.completed;
      let statusClass = isCompleted ? 'status-completed' : (
        cd.state === 'due-soon' ? 'status-due-soon' : (
          cd.state === 'due-now' ? 'status-due-now' : (
            cd.state === 'overdue' ? 'status-overdue' : 'status-upcoming'
          )
        )
      );

      let countdownClass = 'time-countdown';
      if (!isCompleted) {
        if (cd.state === 'due-soon') countdownClass += ' countdown-due-soon';
        if (cd.state === 'due-now' || cd.state === 'overdue') countdownClass += ' countdown-overdue';
      }

      const priorityLabel = task.priority || 'medium';
      const formattedSchedule = formatDisplayDateTime(task.datetime);

      return `
        <article class="task-card ${statusClass}" data-task-id="${task.id}">
          <!-- Complete Checkbox -->
          <div class="task-checkbox-container">
            <input
              type="checkbox"
              class="custom-checkbox task-complete-checkbox"
              data-id="${task.id}"
              ${isCompleted ? 'checked' : ''}
              title="${isCompleted ? 'Mark as incomplete' : 'Mark as complete'}"
              aria-label="Toggle task completion"
            >
          </div>

          <!-- Task Body -->
          <div class="task-content">
            <div class="task-header-line">
              <h3 class="task-title">${escapeHtml(task.title)}</h3>
              ${task.category ? `<span class="tag-badge">#${escapeHtml(task.category)}</span>` : ''}
              <span class="priority-badge priority-${priorityLabel}">${priorityLabel}</span>
            </div>

            ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ''}

            <div class="task-meta-line">
              <span class="meta-item" title="Scheduled date and time">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${formattedSchedule}
              </span>

              <span class="meta-item">
                <span class="${countdownClass}" data-countdown-id="${task.id}">
                  ${isCompleted ? 'Completed' : cd.text}
                </span>
              </span>

              ${task.leadTime && task.leadTime > 0 ? `
                <span class="meta-item" title="Audio chime alert ${task.leadTime} minutes before schedule">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                  Chime -${task.leadTime}m
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Actions Buttons (Update / Delete / Snooze) -->
          <div class="task-actions">
            ${!isCompleted ? `
              <button
                class="btn-card-action btn-snooze"
                data-id="${task.id}"
                data-action="snooze"
                title="Snooze task by +15 minutes"
                aria-label="Snooze 15 minutes"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
            ` : ''}

            <button
              class="btn-card-action btn-edit"
              data-id="${task.id}"
              data-action="edit"
              title="Edit scheduled task"
              aria-label="Edit task"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>

            <button
              class="btn-card-action btn-delete"
              data-id="${task.id}"
              data-action="delete"
              title="Delete task"
              aria-label="Delete task"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function getFilteredTasks() {
    let result = [...tasks];
    const now = new Date();

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // Status filter tabs
    switch (currentFilter) {
      case 'due-soon':
        result = result.filter(t => {
          if (t.completed) return false;
          const diff = new Date(t.datetime).getTime() - now.getTime();
          const lead = (parseInt(t.leadTime, 10) || 5) * 60 * 1000;
          return diff > 0 && diff <= lead;
        });
        break;

      case 'today':
        const todayStr = now.toDateString();
        result = result.filter(t => new Date(t.datetime).toDateString() === todayStr);
        break;

      case 'upcoming':
        result = result.filter(t => !t.completed && new Date(t.datetime).getTime() >= now.getTime());
        break;

      case 'completed':
        result = result.filter(t => t.completed);
        break;

      case 'overdue':
        result = result.filter(t => !t.completed && new Date(t.datetime).getTime() < now.getTime());
        break;

      case 'all':
      default:
        // No additional filter
        break;
    }

    // Sorting
    result.sort((a, b) => {
      if (currentSort === 'time-asc') {
        return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
      } else if (currentSort === 'time-desc') {
        return new Date(b.datetime).getTime() - new Date(a.datetime).getTime();
      } else if (currentSort === 'priority-desc') {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
      } else if (currentSort === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  // 1. CREATE / OPEN MODAL
  function openCreateModal() {
    editingTaskId = null;
    modalHeading.textContent = 'Schedule New Task';
    saveBtnText.textContent = 'Schedule Task';

    taskForm.reset();
    taskIdInput.value = '';

    // Default to +30 minutes from right now
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    const { date, time } = formatDateTimeLocal(defaultTime);
    taskDateInput.value = date;
    taskTimeInput.value = time;

    taskLeadTimeSelect.value = '5';
    taskSoundToneSelect.value = 'modern-crystal';
    taskPrioritySelect.value = 'medium';

    taskModal.classList.remove('hidden');
    taskTitleInput.focus();
  }

  // 2. EDIT / UPDATE MODAL
  function openEditModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    editingTaskId = taskId;
    modalHeading.textContent = 'Update Scheduled Task';
    saveBtnText.textContent = 'Save Changes';

    taskIdInput.value = task.id;
    taskTitleInput.value = task.title;

    const taskDateObj = new Date(task.datetime);
    const { date, time } = formatDateTimeLocal(taskDateObj);
    taskDateInput.value = date;
    taskTimeInput.value = time;

    taskLeadTimeSelect.value = task.leadTime !== undefined ? task.leadTime : 5;
    taskSoundToneSelect.value = task.tone || 'modern-crystal';
    taskPrioritySelect.value = task.priority || 'medium';
    taskCategoryInput.value = task.category || '';
    taskNotesInput.value = task.notes || '';

    taskModal.classList.remove('hidden');
    taskTitleInput.focus();
  }

  function closeModal() {
    taskModal.classList.add('hidden');
    editingTaskId = null;
  }

  // 3. SAVE (CREATE OR UPDATE)
  function handleTaskFormSubmit(e) {
    e.preventDefault();

    const title = taskTitleInput.value.trim();
    const date = taskDateInput.value;
    const time = taskTimeInput.value;

    if (!title || !date || !time) {
      showToast('Missing details', 'Please enter a valid title, date, and time.', 'info');
      return;
    }

    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const scheduledDate = new Date(year, month - 1, day, hours, minutes, 0);
    if (isNaN(scheduledDate.getTime())) {
      showToast('Invalid schedule', 'Please select a valid date and time.', 'info');
      return;
    }

    const leadTime = parseInt(taskLeadTimeSelect.value, 10);
    const tone = taskSoundToneSelect.value;
    const priority = taskPrioritySelect.value;
    const category = taskCategoryInput.value.trim();
    const notes = taskNotesInput.value.trim();

    sound.init(); // Satisfy browser user-interaction audio context unlock
    notifications.requestPermission();

    if (editingTaskId) {
      // UPDATE EXISTING TASK
      const index = tasks.findIndex(t => t.id === editingTaskId);
      if (index !== -1) {
        const oldDatetime = tasks[index].datetime;
        const newDatetime = scheduledDate.toISOString();

        // If time was updated to future, reset alert flags so user gets alerted again!
        const timeChanged = oldDatetime !== newDatetime;
        const isFuture = scheduledDate.getTime() > Date.now();

        tasks[index] = {
          ...tasks[index],
          title,
          datetime: newDatetime,
          leadTime,
          tone,
          priority,
          category,
          notes,
          preAlertTriggered: timeChanged && isFuture ? false : tasks[index].preAlertTriggered,
          dueAlertTriggered: timeChanged && isFuture ? false : tasks[index].dueAlertTriggered,
          updatedAt: new Date().toISOString()
        };

        showToast('Task Updated', `"${title}" schedule updated.`, 'info');
      }
    } else {
      // CREATE NEW TASK
      const newTask = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title,
        datetime: scheduledDate.toISOString(),
        leadTime,
        tone,
        priority,
        category,
        notes,
        completed: false,
        preAlertTriggered: false,
        dueAlertTriggered: false,
        createdAt: new Date().toISOString()
      };

      tasks.push(newTask);
      showToast('Task Scheduled', `"${title}" has been added to your schedule.`, 'info');
    }

    saveTasks();
    closeModal();
    renderTaskList();
    tickScheduler();
  }

  // 4. TOGGLE COMPLETE
  function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    saveTasks();
    renderTaskList();
    tickScheduler();

    if (task.completed) {
      sound.play('alert-ping');
      showToast('Completed', `"${task.title}" marked as complete.`, 'info');
    }
  }

  // 5. SNOOZE TASK (+15 min)
  function snoozeTask(taskId, minutes = 15) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const currentTarget = new Date(task.datetime).getTime();
    const newTarget = Math.max(Date.now(), currentTarget) + (minutes * 60 * 1000);
    task.datetime = new Date(newTarget).toISOString();
    task.preAlertTriggered = false;
    task.dueAlertTriggered = false;

    saveTasks();
    renderTaskList();
    tickScheduler();

    showToast('Task Snoozed', `"${task.title}" deferred by +${minutes} minutes.`, 'info');
  }

  // 6. DELETE TASK
  function openDeleteModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    deletingTaskId = taskId;
    deleteTaskTitleEl.textContent = `"${task.title}"`;
    deleteModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    deletingTaskId = null;
  }

  function confirmDeleteTask() {
    if (!deletingTaskId) return;

    const taskToDelete = tasks.find(t => t.id === deletingTaskId);
    const title = taskToDelete ? taskToDelete.title : 'Task';

    tasks = tasks.filter(t => t.id !== deletingTaskId);
    saveTasks();
    closeDeleteModal();
    renderTaskList();
    tickScheduler();

    showToast('Deleted', `"${title}" has been deleted.`, 'info');
  }

  function clearCompletedTasks() {
    const completedCount = tasks.filter(t => t.completed).length;
    if (completedCount === 0) {
      showToast('Nothing to clear', 'No completed tasks found.', 'info');
      return;
    }

    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    renderTaskList();
    tickScheduler();
    showToast('Cleared', `Removed ${completedCount} completed task${completedCount > 1 ? 's' : ''}.`, 'info');
  }

  function resetDemoTasks() {
    tasks = getSampleTasks();
    saveTasks();
    renderTaskList();
    tickScheduler();
    showToast('Demo Loaded', 'Sample scheduled tasks have been loaded.', 'info');
  }

  // =========================================================================
  // Toast Notifications
  // =========================================================================
  function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'alarm' ? 'toast-alarm' : ''}`;

    toast.innerHTML = `
      <div class="toast-icon">
        ${type === 'alarm' ? `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        ` : `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        `}
      </div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  // =========================================================================
  // Theme & Audio Controls
  // =========================================================================
  const THEME_STORAGE_KEY = 'intervention_theme';

  function applyTheme(theme) {
    const validTheme = (theme === 'latte' || theme === 'light') ? 'latte' : 'mocha';
    document.documentElement.setAttribute('data-theme', validTheme);
    settings.theme = validTheme;
    saveSettings();
    localStorage.setItem(THEME_STORAGE_KEY, validTheme);

    const sunIcons = document.querySelectorAll('.theme-icon-sun');
    const moonIcons = document.querySelectorAll('.theme-icon-moon');
    sunIcons.forEach(el => el.classList.toggle('hidden', validTheme !== 'latte'));
    moonIcons.forEach(el => el.classList.toggle('hidden', validTheme === 'latte'));
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'mocha';
    applyTheme(current === 'mocha' ? 'latte' : 'mocha');
  }

  function updateSoundUI() {
    if (settings.soundEnabled) {
      soundIconOn.classList.remove('hidden');
      soundIconOff.classList.add('hidden');
      toggleSoundBtn.classList.add('btn-sound-active');
      toggleSoundBtn.title = 'Sound Notifications: ON (Click to mute)';
    } else {
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
      toggleSoundBtn.classList.remove('btn-sound-active');
      toggleSoundBtn.title = 'Sound Notifications: MUTED (Click to unmute)';
    }
  }

  function toggleSound() {
    settings.soundEnabled = !settings.soundEnabled;
    saveSettings();
    updateSoundUI();
    showToast('Sound Setting', settings.soundEnabled ? 'Audio notifications enabled' : 'Audio notifications muted', 'info');
    if (settings.soundEnabled) {
      sound.play('modern-crystal');
    }
  }

  // =========================================================================
  // Event Listeners Setup
  // =========================================================================
  function setupEventListeners() {
    // Open new task modal
    openNewTaskBtn.addEventListener('click', () => {
      sound.init();
      notifications.requestPermission();
      openCreateModal();
    });
    emptyCreateBtn.addEventListener('click', () => {
      sound.init();
      notifications.requestPermission();
      openCreateModal();
    });

    // Close modals
    closeModalBtn.addEventListener('click', closeModal);
    cancelModalBtn.addEventListener('click', closeModal);

    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDeleteTask);

    // Close on backdrop click
    taskModal.addEventListener('click', (e) => {
      if (e.target === taskModal) closeModal();
    });
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });

    // Keyboard ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeDeleteModal();
      }
    });

    // Form submit
    taskForm.addEventListener('submit', handleTaskFormSubmit);

    // Quick presets in modal (+15m, +30m, +1h, tomorrow 9am)
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.getAttribute('data-preset');
        const now = new Date();
        let target = new Date();

        if (preset === '15m') {
          target = new Date(now.getTime() + 15 * 60 * 1000);
        } else if (preset === '30m') {
          target = new Date(now.getTime() + 30 * 60 * 1000);
        } else if (preset === '1h') {
          target = new Date(now.getTime() + 60 * 60 * 1000);
        } else if (preset === 'tomorrow-9') {
          target.setDate(now.getDate() + 1);
          target.setHours(9, 0, 0, 0);
        }

        const { date, time } = formatDateTimeLocal(target);
        taskDateInput.value = date;
        taskTimeInput.value = time;
      });
    });

    // Delegation for Task List Actions (Complete, Edit, Delete, Snooze)
    taskListEl.addEventListener('click', (e) => {
      const target = e.target;

      // Complete Checkbox
      if (target.classList.contains('task-complete-checkbox')) {
        const taskId = target.getAttribute('data-id');
        toggleTaskComplete(taskId);
        return;
      }

      // Card Action Buttons
      const actionBtn = target.closest('.btn-card-action');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        const taskId = actionBtn.getAttribute('data-id');

        if (action === 'edit') {
          openEditModal(taskId);
        } else if (action === 'delete') {
          openDeleteModal(taskId);
        } else if (action === 'snooze') {
          snoozeTask(taskId, 15);
        }
      }
    });

    // Filter tabs
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        renderTaskList();
      });
    });

    // Search bar
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearSearchBtn.classList.toggle('hidden', !searchQuery);
      renderTaskList();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      renderTaskList();
      searchInput.focus();
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderTaskList();
    });

    // Top Alarm Banner Actions
    dismissAlarmBtn.addEventListener('click', () => {
      alarmBannerEl.classList.add('hidden');
    });

    snoozeAlarmBtn.addEventListener('click', () => {
      if (activeAlarmTaskId) {
        snoozeTask(activeAlarmTaskId, 5);
        alarmBannerEl.classList.add('hidden');
      }
    });

    // Test Audio Button
    testAudioBtn.addEventListener('click', () => {
      sound.init();
      sound.play('modern-crystal');
      showToast('Sound Test', 'Playing crystal chime notification alert.', 'alarm');
    });

    // Sound Mute/Unmute
    toggleSoundBtn.addEventListener('click', toggleSound);

    // Theme Toggle
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Footer actions
    clearCompletedBtn.addEventListener('click', clearCompletedTasks);
    resetDemoBtn.addEventListener('click', resetDemoTasks);

    // First user interaction unlock AudioContext
    document.addEventListener('click', () => sound.init(), { once: true });
  }

  // =========================================================================
  // Initialization
  // =========================================================================
  function init() {
    loadSettings();
    loadTasks();
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || settings.theme || 'mocha';
    applyTheme(savedTheme);
    updateSoundUI();
    setupEventListeners();
    renderTaskList();
    tickScheduler();

    // If navigated with ?action=new, auto open create modal
    if (window.location.search.includes('action=new')) {
      openCreateModal();
    }

    // Start 1-second scheduler interval
    setInterval(tickScheduler, 1000);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
