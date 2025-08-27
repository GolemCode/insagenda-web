// Version optimisée du JS avec améliorations UX pour mobile
    
const STORAGE_KEYS = {
	icsUrl: 'insagenda.icsUrl',
	selectedCourses: 'insagenda.selectedCourses',
	eventsJson: 'insagenda.eventsJson',
	lastUpdated: 'insagenda.lastUpdated'
};

const ui = {
	mobileDateHeader: document.getElementById('mobileDateHeader'),
	prevDay: document.getElementById('prevDay'),
	nextDay: document.getElementById('nextDay'),
	mobilePrevDay: document.getElementById('mobilePrevDay'),
	mobileNextDay: document.getElementById('mobileNextDay'),
	openSettings: document.getElementById('openSettings'),
	mobileOpenSettings: document.getElementById('mobileOpenSettings'),
	toggleDrawer: document.getElementById('toggleDrawer'),
	mobileToggleDrawer: document.getElementById('mobileToggleDrawer'),
	refresh: document.getElementById('refresh'),
	mobileRefresh: document.getElementById('mobileRefresh'),
	selectAll: document.getElementById('selectAll'),
	selectNone: document.getElementById('selectNone'),
	fileImport: document.getElementById('fileImport'),
	settingsModal: document.getElementById('settingsModal'),
	icsUrlInput: document.getElementById('icsUrlInput'),
	saveUrl: document.getElementById('saveUrl'),
	drawer: document.getElementById('drawer'),
	cancelSettings: document.getElementById('cancelSettings'),
	loading: document.getElementById('loading'),
	noEvents: document.getElementById('noEvents'),
	missingUrl: document.getElementById('missingUrl'),
	errorBanner: document.getElementById('errorBanner'),
	lastUpdated: document.getElementById('lastUpdated'),
	events: document.getElementById('events'),
	filters: document.getElementById('courseFilters'),
	eventModal: document.getElementById('eventModal'),
	eventModalTitle: document.getElementById('eventModalTitle'),
	eventModalBody: document.getElementById('eventModalBody'),
	closeEventModal: document.getElementById('closeEventModal'),
	calendarModal: document.getElementById('calendarModal'),
	calendarMonthYear: document.getElementById('calendarMonthYear'),
	calendarDays: document.getElementById('calendarDays'),
	prevMonth: document.getElementById('prevMonth'),
	nextMonth: document.getElementById('nextMonth'),
	closeCalendarModal: document.getElementById('closeCalendarModal'),
	goToToday: document.getElementById('goToToday'),
	overlay: document.getElementById('overlay'),
};

let appState = {
	allEvents: [],
	uniqueCourseNames: [],
	selectedCourses: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.selectedCourses) || '[]')),
	selectedDate: new Date(),
	lastUpdated: localStorage.getItem(STORAGE_KEYS.lastUpdated) || null,
	calendarCache: {} // Cache pour optimiser le rendu du calendrier
};

/* ---------- utilitaires date / tri ---------- */

function formatHeaderDate(date) {
	return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
		.replace(/^./, c => c.toUpperCase());
}

function pad(num) { return String(num).padStart(2, '0'); }

function formatTimeRange(start, end) {
	const s = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
	const e = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
	return `${s} – ${e}`;
}

function isWeekend(date) {
	const d = date.getDay();
	return d === 0 || d === 6;
}

function sameDay(a, b) {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ---------- identification d'événements ---------- */

function extractSpecificSubGroupCodes(description) {
	if (!description) return [];
	const regex = /([A-Z]+\d*-[A-Z]+-[A-Z]+-[A-Z]+-\d+)/g;
	const out = new Set();
	for (const m of description.matchAll(regex)) out.add(m[1] || m[0]);
	return [...out];
}

function getEffectiveEventIdentifiers(event) {
	const codes = extractSpecificSubGroupCodes(event.description);
	if (codes.length > 0) return codes;
	if (event.summary && event.summary !== 'Sans titre') return [event.summary];
	return [];
}

/* ---------- parsing des dates iCal ---------- */

function parseICalDate(value, tzid) {
	if (!value) return null;
	value = value.replace(/\s+/g, '');
	// DATE only
	if (/^\d{8}$/.test(value)) {
		const year = Number(value.slice(0, 4));
		const month = Number(value.slice(4, 6)) - 1;
		const day = Number(value.slice(6, 8));
		return new Date(year, month, day, 0, 0, 0);
	}
	// DATETIME, optional Z
	const zulu = value.endsWith('Z');
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(4, 6)) - 1;
	const day = Number(value.slice(6, 8));
	const hour = Number(value.slice(9, 11));
	const minute = Number(value.slice(11, 13));
	const second = Number(value.slice(13, 15));
	if (zulu) return new Date(Date.UTC(year, month, day, hour, minute, second));
	if (tzid) {
		try {
			const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tzid, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
			const parts = dtf.formatToParts(new Date(Date.UTC(year, month, day, hour, minute, second)));
			const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
			return new Date(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
		} catch {}
	}
	return new Date(year, month, day, hour, minute, second);
}

/* ---------- unfolding + nettoyage ICS ---------- */

function unfoldICSText(text) {
	return text.replace(/\r\n[ \t]|\n[ \t]/g, '').replace(/\r\n|\r/g, '\n');
}

function unescapeICalValue(value) {
	if (!value) return "";
	return value
		.replace(/\\\\/g, '\\')
		.replace(/\\[,;]/g, match => match.slice(1))
		.replace(/\\[nN]/g, '\n')
		.replace(/\\[tT]/g, '\t')
		.trim();
}

/* ---------- parsing ICS en VEVENT ---------- */

function parseICS(ics) {
	const unfolded = unfoldICSText(ics);
	const lines = unfolded.split('\n');
	const events = [];
	let inEvent = false;
	let cur = {};
	for (let raw of lines) {
		if (raw === 'BEGIN:VEVENT') { inEvent = true; cur = {}; continue; }
		if (raw === 'END:VEVENT') {
			if (cur.DTSTART) {
				const start = parseICalDate(cur.DTSTART.value || cur.DTSTART, cur.DTSTART.tzid);
				const end = parseICalDate((cur.DTEND && (cur.DTEND.value || cur.DTEND)) || (cur.DTSTART.value || cur.DTSTART), cur.DTEND ? cur.DTEND.tzid : cur.DTSTART.tzid);
				events.push({
					summary: cur.SUMMARY || 'Sans titre',
					start,
					end,
					location: cur.LOCATION || null,
					description: cur.DESCRIPTION || null,
					professors: []
				});
			}
			inEvent = false; cur = {}; continue;
		}
		if (!inEvent) continue;

		const idx = raw.indexOf(':');
		if (idx === -1) continue;
		let key = raw.slice(0, idx);
		let value = raw.slice(idx + 1);

		let tzid;
		const semi = key.indexOf(';');
		if (semi !== -1) {
			const params = key.slice(semi + 1);
			key = key.slice(0, semi);
			const m = params.match(/TZID=([^;:]+)/i);
			if (m) tzid = m[1];
		}

		value = unescapeICalValue(value);

		if (key === 'DTSTART' || key === 'DTEND') {
			cur[key] = { value, tzid };
		} else {
			cur[key] = value;
		}
	}
	return events;
}

/* ---------- tri naturel des noms ---------- */

function naturalSortComparator(a, b) {
	const re = /(\d+)|(\D+)/g;
	const ax = a.match(re);
	const bx = b.match(re);
	const len = Math.min(ax.length, bx.length);
	for (let i = 0; i < len; i++) {
		const as = ax[i], bs = bx[i];
		if (as === bs) continue;
		const an = as.match(/^\d+$/), bn = bs.match(/^\d+$/);
		if (an && bn) {
			const diff = Number(as) - Number(bs);
			if (diff !== 0) return diff;
		} else {
			const cmp = as.localeCompare(bs, undefined, { sensitivity: 'base' });
			if (cmp !== 0) return cmp;
		}
	}
	return ax.length - bx.length;
}

function computeUniqueCourseNames(events) {
	const names = new Set();
	events.forEach(ev => {
		for (const id of getEffectiveEventIdentifiers(ev)) names.add(id);
	});
	return [...names].sort(naturalSortComparator);
}

/* ---------- UI : filtres / rendu ---------- */

function renderFilters() {
	ui.filters.innerHTML = '';
	for (const name of appState.uniqueCourseNames) {
		const id = `f-${btoa(unescape(encodeURIComponent(name))).replace(/=/g, '')}`;
		const wrapper = document.createElement('label');
		wrapper.className = 'filter-item';
		wrapper.htmlFor = id;
		wrapper.innerHTML = `<input type="checkbox" id="${id}"> <span>${name}</span>`;
		const input = wrapper.querySelector('input');
		input.checked = appState.selectedCourses.has(name);
		input.addEventListener('change', () => {
			if (input.checked) appState.selectedCourses.add(name); else appState.selectedCourses.delete(name);
			persistFilters();
			render();
		});
		ui.filters.appendChild(wrapper);
	}
}

function persistFilters() {
	localStorage.setItem(STORAGE_KEYS.selectedCourses, JSON.stringify([...appState.selectedCourses]));
}

function filterEventsForDate(events, date, selectedCourses) {
	if (!events || !date || selectedCourses.size === 0) return [];
	return events.filter(ev => {
		const ids = getEffectiveEventIdentifiers(ev);
		if (ids.length === 0) return false;
		if (!ids.some(id => [...selectedCourses].some(sel => sel.localeCompare(id, undefined, { sensitivity: 'accent' }) === 0))) return false;
		const startsBeforeOrOn = ev.start <= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
		const endsAfterOrOn = ev.end >= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
		return startsBeforeOrOn && endsAfterOrOn;
	}).sort((a, b) => a.start - b.start);
}

function renderEvent(ev) {
	const li = document.createElement('li');
	li.className = 'event';
	li.innerHTML = `
		<div class="summary">${ev.summary}</div>
		<div class="meta">
			<span>${formatTimeRange(ev.start, ev.end)}</span>
			${ev.location ? `<span>${ev.location}</span>` : ''}
		</div>
	`;
	if (ev.description && ev.description.trim().length > 0) {
		li.addEventListener('click', () => {
			ui.eventModalTitle.textContent = ev.summary;
			ui.eventModalBody.innerHTML = (ev.description || "").replace(/\n/g, "<br>");
			ui.eventModal.classList.remove('hidden');
		});
	}
	return li;
}

function render() {
	const formattedDate = formatHeaderDate(appState.selectedDate);
	ui.mobileDateHeader.textContent = formattedDate;
	
	ui.loading.classList.add('hidden');
	const filtered = filterEventsForDate(appState.allEvents, appState.selectedDate, appState.selectedCourses);
	ui.noEvents.classList.toggle('hidden', filtered.length !== 0);
	ui.events.classList.toggle('hidden', filtered.length === 0);
	ui.missingUrl.classList.add('hidden');
	ui.events.innerHTML = '';
	for (const ev of filtered) ui.events.appendChild(renderEvent(ev));
	ui.lastUpdated.classList.add('hidden');
}

/* ---------- fetch / chargement ---------- */

async function fetchAndLoad(url) {
	ui.loading.classList.remove('hidden');
	ui.errorBanner.classList.add('hidden');
	try {
		const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
		const res = await fetch(proxyUrl, { cache: 'no-store' });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

		let text = await res.text();
		if (!text) throw new Error('Réponse vide');

		const events = parseICS(text);
		appState.allEvents = events;
		appState.uniqueCourseNames = computeUniqueCourseNames(events);
		appState.lastUpdated = Date.now().toString();

		localStorage.setItem(STORAGE_KEYS.eventsJson, JSON.stringify(events.map(e => ({
			...e, start: e.start.toISOString(), end: e.end.toISOString()
		}))));
		localStorage.setItem(STORAGE_KEYS.lastUpdated, appState.lastUpdated);

		if (appState.selectedCourses.size === 0 && appState.uniqueCourseNames.length > 0) {
			appState.selectedCourses = new Set(appState.uniqueCourseNames);
			persistFilters();
		}

		// 🔥 Construire le cache une seule fois
		appState.calendarCache = buildEventsByDate(events, appState.selectedCourses);

		renderFilters();
		render();
	} catch (e) {
		console.error('Erreur ICS:', e);
		ui.errorBanner.textContent = `Erreur ICS: ${e.message || e}`;
		ui.errorBanner.classList.remove('hidden');

		appState.allEvents = [];
		appState.uniqueCourseNames = [];
		appState.selectedCourses = new Set();
		appState.calendarCache = new Map();

		localStorage.removeItem(STORAGE_KEYS.eventsJson);
		localStorage.removeItem(STORAGE_KEYS.lastUpdated);
		persistFilters();

		renderFilters();
		render();
	} finally {
		ui.loading.classList.add('hidden');
	}
}

/* ---------- navigation date ---------- */

function setSelectedDate(date) {
	appState.selectedDate = date;
	render();
}

function goToNextDay() {
	let d = new Date(appState.selectedDate);
	d.setDate(d.getDate() + 1);
	while (isWeekend(d) && filterEventsForDate(appState.allEvents, d, appState.selectedCourses).length === 0) {
		d.setDate(d.getDate() + 1);
	}
	setSelectedDate(d);
}

function goToPreviousDay() {
	let d = new Date(appState.selectedDate);
	d.setDate(d.getDate() - 1);
	while (isWeekend(d) && filterEventsForDate(appState.allEvents, d, appState.selectedCourses).length === 0) {
		d.setDate(d.getDate() - 1);
	}
	setSelectedDate(d);
}

/* ---------- calendar modal ---------- */

function openSettings() {
	ui.icsUrlInput.value = localStorage.getItem(STORAGE_KEYS.icsUrl) || '';
	ui.settingsModal.classList.remove('hidden');
}
function closeSettings() { ui.settingsModal.classList.add('hidden'); }

function saveUrl() {
	const url = ui.icsUrlInput.value.trim();
	localStorage.setItem(STORAGE_KEYS.icsUrl, url);
	closeSettings();
	if (url) fetchAndLoad(url);
}

/* ---------- init listeners (unique, non-duplicated) ---------- */

ui.prevDay.addEventListener('click', goToPreviousDay);
ui.nextDay.addEventListener('click', goToNextDay);
ui.mobilePrevDay.addEventListener('click', goToPreviousDay);
ui.mobileNextDay.addEventListener('click', goToNextDay);
ui.openSettings.addEventListener('click', openSettings);
ui.mobileOpenSettings.addEventListener('click', openSettings);
ui.cancelSettings.addEventListener('click', closeSettings);
ui.settingsModal.addEventListener('click', (e) => {
	if (e.target === ui.settingsModal) {
		closeSettings();
	}
});
ui.saveUrl.addEventListener('click', saveUrl);
ui.refresh.addEventListener('click', () => { const url = localStorage.getItem(STORAGE_KEYS.icsUrl) || ''; if (url) fetchAndLoad(url); else ui.fileImport.click(); });
ui.mobileRefresh.addEventListener('click', () => { const url = localStorage.getItem(STORAGE_KEYS.icsUrl) || ''; if (url) fetchAndLoad(url); else ui.fileImport.click(); });

// toggle drawer using click for better mobile responsiveness
ui.toggleDrawer.addEventListener('click', (e) => {
	document.body.classList.toggle('drawer-open');
	e.stopPropagation();
});

ui.mobileToggleDrawer.addEventListener('click', (e) => {
	document.body.classList.toggle('drawer-open');
	e.stopPropagation();
});

ui.overlay.addEventListener('click', () => {
	document.body.classList.remove('drawer-open');
});

// Prevent click inside drawer from reaching document (so clicks inside don't close it)
ui.drawer.addEventListener('click', (e) => e.stopPropagation());

// Single global handler: close drawer if click outside drawer and outside toggle
document.addEventListener('click', (e) => {
	if (!document.body.classList.contains('drawer-open')) return;
	
	const insideDrawer = ui.drawer.contains(e.target);
	const onToggle = ui.toggleDrawer.contains(e.target) || ui.mobileToggleDrawer.contains(e.target);
	
	if (!insideDrawer && !onToggle) {
		document.body.classList.remove('drawer-open');
		e.stopPropagation();
		e.preventDefault();
	}
});

// ESC key closes drawer
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
		document.body.classList.remove('drawer-open');
	}
});

ui.closeEventModal.addEventListener('click', () => ui.eventModal.classList.add('hidden'));
ui.eventModal.addEventListener('click', (e) => { if (e.target === ui.eventModal) ui.eventModal.classList.add('hidden'); });
ui.closeCalendarModal.addEventListener('click', () => ui.calendarModal.classList.add('hidden'));
ui.calendarModal.addEventListener('click', (e) => { if (e.target === ui.calendarModal) ui.calendarModal.classList.add('hidden'); });

ui.prevMonth.addEventListener('click', () => changeCalendarMonth(-1));
ui.nextMonth.addEventListener('click', () => changeCalendarMonth(1));
ui.goToToday.addEventListener('click', () => {
	setSelectedDate(new Date());
	ui.calendarModal.classList.add('hidden');
});

ui.selectAll.addEventListener('click', () => { appState.selectedCourses = new Set(appState.uniqueCourseNames); persistFilters(); renderFilters(); render(); });
ui.selectNone.addEventListener('click', () => { appState.selectedCourses = new Set(); persistFilters(); renderFilters(); render(); });
ui.mobileDateHeader.addEventListener('click', () => { showCalendarModal(); });

/* ---------- calendar cache ---------- */

function buildEventsByDate(events, selectedCourses) {
	const map = new Map();
	for (const ev of events) {
		const ids = getEffectiveEventIdentifiers(ev);
		if (ids.length === 0) continue;
		if (!ids.some(id => selectedCourses.has(id))) continue;

		const start = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
		const end = new Date(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate());

		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const key = d.toISOString().split("T")[0];
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(ev);
		}
	}
	return map;
}

/* ---------- calendar modal ---------- */

let currentCalendarMonth = new Date();

function showCalendarModal() {
	ui.calendarDays.innerHTML = `
		<div class="calendar-skeleton">
			${Array(42).fill().map(() => `<div class="skeleton"></div>`).join('')}
		</div>
	`;
	ui.calendarModal.classList.remove('hidden');

	setTimeout(() => {
		currentCalendarMonth = new Date(appState.selectedDate.getFullYear(), appState.selectedDate.getMonth(), 1);
		renderCalendar();
	}, 50);
}

function changeCalendarMonth(delta) {
	currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
	renderCalendar();
}

function renderCalendar() {
	const year = currentCalendarMonth.getFullYear();
	const month = currentCalendarMonth.getMonth();

	ui.calendarMonthYear.textContent = new Date(year, month).toLocaleDateString('fr-FR', {
		month: 'long',
		year: 'numeric'
	}).replace(/^./, c => c.toUpperCase());

	const firstDay = new Date(year, month, 1);
	const startDate = new Date(firstDay);
	startDate.setDate(startDate.getDate() - (firstDay.getDay() + 6) % 7); // lundi = 0

	let html = "";

	for (let i = 0; i < 42; i++) {
		const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
		const key = date.toISOString().split("T")[0];

		const classes = ["calendar-day"];
		if (date.getMonth() !== month) classes.push("other-month");
		if (sameDay(date, new Date())) classes.push("today");
		if (sameDay(date, appState.selectedDate)) classes.push("selected");
		if (appState.calendarCache.has(key)) classes.push("has-events");

		html += `<div class="${classes.join(" ")}" data-date="${key}">${date.getDate()}</div>`;
	}

	ui.calendarDays.innerHTML = html;
}

/* ---------- delegation : un seul listener ---------- */
ui.calendarDays.onclick = (e) => {
	if (e.target.classList.contains("calendar-day")) {
		const date = new Date(e.target.dataset.date);
		setSelectedDate(date);
		ui.calendarModal.classList.add("hidden");
	}
};


/* ---------- swipe globally on main ---------- */

let startX = 0, startY = 0;
const mainEl = document.querySelector('main');
if (mainEl) {
	mainEl.addEventListener('touchstart', e => {
	  const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
	}, { passive: true });

	mainEl.addEventListener('touchend', e => {
	  const t = e.changedTouches[0];
	  const dx = t.clientX - startX; const dy = t.clientY - startY;
	  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
		if (dx > 0) goToPreviousDay(); else goToNextDay();
	  }
	}, { passive: true });
}

/* ---------- bootstrap / start ---------- */

ui.mobileDateHeader.textContent = formatHeaderDate(appState.selectedDate);
const savedUrl = localStorage.getItem(STORAGE_KEYS.icsUrl) || '';
if (savedUrl) {
	ui.missingUrl.classList.add('hidden');
	fetchAndLoad(savedUrl);
} else {
	ui.missingUrl.classList.remove('hidden');
	ui.fileImport.addEventListener('change', async (e) => {
		const file = e.target.files && e.target.files[0];
		if (!file) return;
		const text = await file.text();
		const events = parseICS(text);
		appState.allEvents = events;
		appState.uniqueCourseNames = computeUniqueCourseNames(events);
		appState.lastUpdated = Date.now().toString();
		localStorage.setItem(STORAGE_KEYS.eventsJson, JSON.stringify(events.map(e => ({...e, start: e.start.toISOString(), end: e.end.toISOString()}))));
		localStorage.setItem(STORAGE_KEYS.lastUpdated, appState.lastUpdated);
		if (appState.selectedCourses.size === 0 && appState.uniqueCourseNames.length > 0) {
			appState.selectedCourses = new Set(appState.uniqueCourseNames);
			persistFilters();
		}
		renderFilters();
		render();
		ui.missingUrl.classList.add('hidden');
	});
}
render();

// PWA: register service worker
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/insagenda-web/sw.js')
			.then((registration) => {
				console.log('Service Worker enregistré avec succès:', registration);
			})
			.catch((error) => {
				console.log('Erreur lors de l\'enregistrement du Service Worker:', error);
			});
	});
}