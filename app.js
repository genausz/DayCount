// State
let events = [];
let sortMode = 'nearest';
let updateInterval = null;

// DOM refs
const grid = document.getElementById('eventsGrid');
const emptyState = document.getElementById('emptyState');
const modalOverlay = document.getElementById('modalOverlay');
const modalForm = document.getElementById('modalForm');
const modalTitle = document.getElementById('modalTitle');
const eventNameInput = document.getElementById('eventName');
const eventDateInput = document.getElementById('eventDate');
const eventTimeInput = document.getElementById('eventTime');
const addEventBtn = document.getElementById('addEventBtn');
const addEventFab = document.getElementById('addEventFab');
const modalCancel = document.getElementById('modalCancel');
const modalClose = document.getElementById('modalClose');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const toastIcon = document.getElementById('toastIcon');

// Sort buttons
const sortBtns = document.querySelectorAll('.sort-btn');

// Helpers
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatDate(dateStr, timeStr) {
  const d = new Date(dateStr + (timeStr ? `T${timeStr}` : 'T00:00'));
  const opts = { year: 'numeric', month: 'long', day: 'numeric' };
  let str = d.toLocaleDateString('en-US', opts);
  if (timeStr) {
    const t = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    str += ` at ${t}`;
  }
  return str;
}

function getDaysDiff(dateStr, timeStr) {
  const now = new Date();
  const target = new Date(dateStr + (timeStr ? `T${timeStr}` : 'T00:00'));
  const diff = target.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return { days, diff, target };
}

function getFullCountdown(dateStr, timeStr) {
  const now = new Date();
  const target = new Date(dateStr + (timeStr ? `T${timeStr}` : 'T00:00'));
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((abs % (1000 * 60)) / 1000);
  return { diff, days, hours, minutes, seconds, target };
}

function getStatus(dateStr, timeStr, days) {
  const now = new Date();
  const target = new Date(dateStr + (timeStr ? `T${timeStr}` : 'T00:00'));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  if (timeStr) {
    if (days > 0) return 'upcoming';
    if (days === 0 && now < target) return 'today';
    return 'past';
  }

  if (targetDay > today) return 'upcoming';
  if (targetDay.getTime() === today.getTime()) return 'today';
  return 'past';
}

// Storage
function loadEvents() {
  try {
    const data = localStorage.getItem('daycount-events');
    events = data ? JSON.parse(data) : [];
  } catch {
    events = [];
  }
}

function saveEvents() {
  localStorage.setItem('daycount-events', JSON.stringify(events));
}

// Toast
function showToast(message, type = 'success') {
  toastMsg.textContent = message;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Render
function render() {
  if (!events.length) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const sorted = [...events].sort((a, b) => {
    const aTarget = new Date(a.date + (a.time ? `T${a.time}` : 'T00:00'));
    const bTarget = new Date(b.date + (b.time ? `T${b.time}` : 'T00:00'));
    if (sortMode === 'nearest') {
      const now = new Date();
      const aAbs = Math.abs(aTarget - now);
      const bAbs = Math.abs(bTarget - now);
      return aAbs - bAbs;
    }
    if (sortMode === 'soonest') return aTarget - bTarget;
    if (sortMode === 'latest') return bTarget - aTarget;
    return 0;
  });

  let html = '';
  for (const ev of sorted) {
    const { days, diff } = getDaysDiff(ev.date, ev.time);
    const status = getStatus(ev.date, ev.time, days);
    const countdown = getFullCountdown(ev.date, ev.time);

    let bigNumber, label;
    if (status === 'today') {
      if (ev.time) {
        bigNumber = '🎉';
        label = 'Happening today!';
      } else {
        bigNumber = '✨';
        label = 'Today!';
      }
    } else if (status === 'upcoming') {
      bigNumber = countdown.days;
      label = countdown.days === 1 ? 'day to go' : 'days to go';
    } else {
      bigNumber = countdown.days;
      label = countdown.days === 1 ? 'day ago' : 'days ago';
    }

    const showLive = status === 'upcoming' && countdown.days <= 30;

    const badgeLabels = { upcoming: 'Upcoming', today: 'Today!', past: 'Past' };

    html += `
      <div class="event-card ${status}" data-id="${ev.id}">
        <div class="event-card-header">
          <div class="event-name">${escapeHtml(ev.name)}</div>
          <div class="event-actions">
            <button class="btn btn-danger delete-btn" data-id="${ev.id}" title="Delete event">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="event-date">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          ${formatDate(ev.date, ev.time)}
        </div>
        <div class="countdown-main">
          <div class="count-number">${bigNumber}</div>
          <div class="count-label">${label}</div>
        </div>
        ${status === 'today' ? `
          <div class="event-badge today">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Happening Now
          </div>
        ` : status === 'upcoming' ? `
          <div class="event-badge upcoming">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Upcoming
          </div>
        ` : `
          <div class="event-badge past">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Passed
          </div>
        `}
        ${showLive ? `
          <div class="live-countdown" data-id="${ev.id}" data-date="${ev.date}" data-time="${ev.time || ''}">
            <div class="countdown-unit">
              <div class="countdown-value" data-unit="hours">${String(countdown.hours).padStart(2, '0')}</div>
              <div class="countdown-label">Hours</div>
            </div>
            <div class="countdown-unit">
              <div class="countdown-value" data-unit="minutes">${String(countdown.minutes).padStart(2, '0')}</div>
              <div class="countdown-label">Min</div>
            </div>
            <div class="countdown-unit">
              <div class="countdown-value" data-unit="seconds">${String(countdown.seconds).padStart(2, '0')}</div>
              <div class="countdown-label">Sec</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  grid.innerHTML = html;

  // Bind delete events
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteEvent(id);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Live countdown tick
function startLiveTick() {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => {
    document.querySelectorAll('.live-countdown').forEach(container => {
      const id = container.dataset.id;
      const date = container.dataset.date;
      const time = container.dataset.time;
      const cd = getFullCountdown(date, time);
      const status = getStatus(date, time, cd.days);

      // If event just ticked past transition, re-render
      if (status !== 'upcoming' || cd.days > 30) {
        render();
        return;
      }

      // Update matching card
      const card = container.closest('.event-card');
      const mainNum = card?.querySelector('.count-number');
      const mainLabel = card?.querySelector('.count-label');
      if (mainNum) mainNum.textContent = cd.days;
      if (mainLabel) mainLabel.textContent = cd.days === 1 ? 'day to go' : 'days to go';

      container.querySelector('[data-unit="hours"]').textContent = String(cd.hours).padStart(2, '0');
      container.querySelector('[data-unit="minutes"]').textContent = String(cd.minutes).padStart(2, '0');
      container.querySelector('[data-unit="seconds"]').textContent = String(cd.seconds).padStart(2, '0');
    });
  }, 1000);
}

// CRUD
function addEvent(name, date, time) {
  if (events.some(e => e.name.toLowerCase() === name.toLowerCase())) {
    showToast('An event with this name already exists', 'error');
    return false;
  }
  events.push({ id: generateId(), name, date, time });
  saveEvents();
  render();
  showToast(`"${name}" added!`);
  return true;
}

function deleteEvent(id) {
  const ev = events.find(e => e.id === id);
  events = events.filter(e => e.id !== id);
  saveEvents();
  render();
  if (ev) showToast(`"${ev.name}" removed`, 'error');
}

// Modal
function openModal() {
  modalTitle.textContent = 'New Event';
  eventNameInput.value = '';
  eventDateInput.value = new Date().toISOString().split('T')[0];
  eventTimeInput.value = '';
  modalOverlay.classList.add('active');
  setTimeout(() => eventNameInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalForm.reset();
}

addEventBtn.addEventListener('click', openModal);
addEventFab.addEventListener('click', openModal);
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && !modalOverlay.classList.contains('active') && !e.ctrlKey && !e.metaKey) {
    openModal();
  }
});

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = eventNameInput.value.trim();
  const date = eventDateInput.value;
  const time = eventTimeInput.value;
  if (!name) {
    showToast('Please enter an event name', 'error');
    return;
  }
  if (!date) {
    showToast('Please select a date', 'error');
    return;
  }
  if (addEvent(name, date, time)) {
    closeModal();
  }
});

// Sort
sortBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    sortBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sortMode = btn.dataset.sort;
    render();
  });
});

// Init
loadEvents();
render();
startLiveTick();
