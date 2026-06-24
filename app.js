// ==================== Supabase Client ====================

let supabaseClient = null;
let currentUserId = null;
let isSupabaseReady = false;

async function initSupabase() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    setSyncStatus('config-needed', 'Please configure Supabase in supabase-config.js');
    return;
  }

  try {
    supabaseClient = supabase.createClient(cfg.url, cfg.anonKey);

    // Try to restore existing session first (avoids creating new users on every refresh)
    var { data: existing } = await supabaseClient.auth.getSession();
    var session = existing.session;

    if (!session) {
      var result = await supabaseClient.auth.signInAnonymously();
      if (result.error) throw result.error;
      session = result.data.session;
      if (!session) throw new Error('No session returned');
    }

    currentUserId = session.user.id;
    isSupabaseReady = true;
    setSyncStatus('connected', 'Synced to cloud');
    return true;
  } catch (err) {
    console.error('Supabase init error:', err);
  if (err instanceof ReferenceError && err.message.includes("supabase")) {
    setSyncStatus("error", "Supabase SDK not loaded — check CDN");
    supabaseClient = null;
    return;
  }
    setSyncStatus('error', 'Cloud sync unavailable — using local storage');
    supabaseClient = null;
    return false;
  }
}

// ==================== State ====================

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
const modalCancel = document.getElementById('modalCancel');
const modalClose = document.getElementById('modalClose');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Sync status
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');

function setSyncStatus(state, text) {
  syncDot.className = 'sync-dot ' + state;
  syncText.textContent = text;
}

// ==================== Helpers ====================

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(dateStr, timeStr) {
  const d = new Date(dateStr + (timeStr ? `T${timeStr}` : 'T00:00'));
  const opts = { year: 'numeric', month: 'long', day: 'numeric' };
  let str = d.toLocaleDateString('en-US', opts);
  if (timeStr) {
    const t = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    str += ' at ' + t;
  }
  return str;
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== Supabase CRUD ====================

async function fetchEventsFromSupabase() {
  if (!supabaseClient || !currentUserId) return null;
  const { data, error } = await supabaseClient
    .from('events')
    .select('id, name, date, time')
    .eq('user_id', currentUserId);
  if (error) { console.error('Supabase fetch error:', error); return null; }
  return data;
}

async function insertEventToSupabase(ev) {
  if (!supabaseClient || !currentUserId) return false;
  const { error } = await supabaseClient
    .from('events')
    .insert({ id: ev.id, user_id: currentUserId, name: ev.name, date: ev.date, time: ev.time });
  if (error) { console.error('Supabase insert error:', error); return false; }
  return true;
}

async function deleteEventFromSupabase(id) {
  if (!supabaseClient || !currentUserId) return false;
  const { error } = await supabaseClient
    .from('events')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUserId);
  if (error) { console.error('Supabase delete error:', error); return false; }
  return true;
}

// ==================== Local Storage Fallback ====================

function loadLocalEvents() {
  try { return JSON.parse(localStorage.getItem('daycount-events') || '[]'); } catch { return []; }
}

function saveLocalEvents(data) {
  localStorage.setItem('daycount-events', JSON.stringify(data));
}

// ==================== Data Loading ====================

async function loadEvents() {
  if (isSupabaseReady) {
    const data = await fetchEventsFromSupabase();
    if (data !== null) {
      events = data;
      saveLocalEvents(data); // local cache
      return;
    }
  }

  // Fallback to local
  events = loadLocalEvents();
  if (!isSupabaseReady && events.length > 0) {
    setSyncStatus('offline', 'Offline — data saved locally only');
  }
}

// ==================== CRUD ====================

async function addEvent(name, date, time) {
  if (events.some(e => e.name.toLowerCase() === name.toLowerCase())) {
    showToast('An event with this name already exists', 'error');
    return false;
  }

  const ev = { id: generateId(), name, date, time };

  if (isSupabaseReady && supabaseClient) {
    const ok = await insertEventToSupabase(ev);
    if (ok) {
      events.push(ev);
      render();
      showToast('"' + name + '" added!');
      return true;
    }
  }

  // Fallback: local only
  events.push(ev);
  saveLocalEvents(events);
  render();
  showToast('"' + name + '" added (local only)');
  return true;
}

async function deleteEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;

  if (isSupabaseReady && supabaseClient) {
    await deleteEventFromSupabase(id);
  }

  events = events.filter(e => e.id !== id);
  saveLocalEvents(events);
  render();
  showToast('"' + ev.name + '" removed', 'error');
}

// ==================== Toast ====================

function showToast(message, type) {
  type = type || 'success';
  toastMsg.textContent = message;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(function () {
    toast.classList.remove('show');
  }, 2500);
}

// ==================== Render ====================

function render() {
  if (!events.length) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  var sorted = events.slice().sort(function (a, b) {
    var aTarget = new Date(a.date + (a.time ? 'T' + a.time : 'T00:00'));
    var bTarget = new Date(b.date + (b.time ? 'T' + b.time : 'T00:00'));
    if (sortMode === 'nearest') {
      var now = new Date();
      return Math.abs(aTarget - now) - Math.abs(bTarget - now);
    }
    if (sortMode === 'soonest') return aTarget - bTarget;
    if (sortMode === 'latest') return bTarget - aTarget;
    return 0;
  });

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var ev = sorted[i];
    var cd = getFullCountdown(ev.date, ev.time);
    var status = getStatus(ev.date, ev.time, cd.days);

    var bigNumber, label;
    if (status === 'today') {
      bigNumber = ev.time ? '\uD83C\uDF89' : '\u2728';
      label = ev.time ? 'Happening today!' : 'Today!';
    } else if (status === 'upcoming') {
      bigNumber = cd.days;
      label = cd.days === 1 ? 'day to go' : 'days to go';
    } else {
      bigNumber = cd.days;
      label = cd.days === 1 ? 'day ago' : 'days ago';
    }

    var showLive = status === 'upcoming' && cd.days <= 30;

    html += '<div class="event-card ' + status + '" data-id="' + ev.id + '">';
    html += '<div class="event-card-header">';
    html += '<div class="event-name">' + escapeHtml(ev.name) + '</div>';
    html += '<div class="event-actions">';
    html += '<button class="btn btn-danger delete-btn" data-id="' + ev.id + '" title="Delete event">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    html += '</button></div></div>';

    html += '<div class="event-date">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
    html += formatDate(ev.date, ev.time) + '</div>';

    html += '<div class="countdown-main">';
    html += '<div class="count-number">' + bigNumber + '</div>';
    html += '<div class="count-label">' + label + '</div></div>';

    if (status === 'today') {
      html += '<div class="event-badge today"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Happening Now</div>';
    } else if (status === 'upcoming') {
      html += '<div class="event-badge upcoming"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Upcoming</div>';
    } else {
      html += '<div class="event-badge past"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Passed</div>';
    }

    if (showLive) {
      html += '<div class="live-countdown" data-id="' + ev.id + '" data-date="' + ev.date + '" data-time="' + (ev.time || '') + '">';
      html += '<div class="countdown-unit"><div class="countdown-value" data-unit="hours">' + String(cd.hours).padStart(2, '0') + '</div><div class="countdown-label">Hours</div></div>';
      html += '<div class="countdown-unit"><div class="countdown-value" data-unit="minutes">' + String(cd.minutes).padStart(2, '0') + '</div><div class="countdown-label">Min</div></div>';
      html += '<div class="countdown-unit"><div class="countdown-value" data-unit="seconds">' + String(cd.seconds).padStart(2, '0') + '</div><div class="countdown-label">Sec</div></div>';
      html += '</div>';
    }

    html += '</div>';
  }

  grid.innerHTML = html;

  // Bind delete events
  document.querySelectorAll('.delete-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteEvent(btn.dataset.id);
    });
  });
}

// ==================== Live Countdown Tick ====================

function startLiveTick() {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(function () {
    document.querySelectorAll('.live-countdown').forEach(function (container) {
      var id = container.dataset.id;
      var date = container.dataset.date;
      var time = container.dataset.time;
      var cd = getFullCountdown(date, time);
      var status = getStatus(date, time, cd.days);

      if (status !== 'upcoming' || cd.days > 30) {
        render();
        return;
      }

      var card = container.closest('.event-card');
      var mainNum = card ? card.querySelector('.count-number') : null;
      var mainLabel = card ? card.querySelector('.count-label') : null;
      if (mainNum) mainNum.textContent = cd.days;
      if (mainLabel) mainLabel.textContent = cd.days === 1 ? 'day to go' : 'days to go';

      var h = container.querySelector('[data-unit="hours"]');
      var m = container.querySelector('[data-unit="minutes"]');
      var s = container.querySelector('[data-unit="seconds"]');
      if (h) h.textContent = String(cd.hours).padStart(2, '0');
      if (m) m.textContent = String(cd.minutes).padStart(2, '0');
      if (s) s.textContent = String(cd.seconds).padStart(2, '0');
    });
  }, 1000);
}

// ==================== Modal ====================

function openModal() {
  modalTitle.textContent = 'New Event';
  eventNameInput.value = '';
  eventDateInput.value = new Date().toISOString().split('T')[0];
  eventTimeInput.value = '';
  modalOverlay.classList.add('active');
  setTimeout(function () { eventNameInput.focus(); }, 100);
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalForm.reset();
}

addEventBtn.addEventListener('click', openModal);
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', function (e) {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && !modalOverlay.classList.contains('active') && !e.ctrlKey && !e.metaKey) {
    openModal();
  }
});

modalForm.addEventListener('submit', function (e) {
  e.preventDefault();
  var name = eventNameInput.value.trim();
  var date = eventDateInput.value;
  var time = eventTimeInput.value;
  if (!name) { showToast('Please enter an event name', 'error'); return; }
  if (!date) { showToast('Please select a date', 'error'); return; }
  addEvent(name, date, time).then(function (ok) {
    if (ok) closeModal();
  });
});

// ==================== Sort ====================

document.querySelectorAll('.sort-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.sort-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    sortMode = btn.dataset.sort;
    render();
  });
});

// ==================== Init ====================

(async function init() {
  await initSupabase();
  await loadEvents();
  render();
  startLiveTick();
  // status already set by initSupabase/loadEvents
})();
