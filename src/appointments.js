const calendarState = {
    today: null,
    startOfTodayMonth: null,
    currentMonth: null,
    selectedDate: null,
    unavailableDates: new Set(),
    mechanicId: null,
};

const DEFAULT_SCHEDULE_CONFIG = { days: [1, 2, 3, 4, 5], start: "10:00", end: "18:00" };

function parseTimeToMinutes(value) {
    if (typeof value !== "string") {
        return null;
    }
    const [hoursStr, minutesStr] = value.split(":");
    const hours = Number.parseInt(hoursStr, 10);
    const minutes = Number.parseInt(minutesStr, 10);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return null;
    }
    return hours * 60 + minutes;
}

function formatMinutesToTime(minutes) {
    if (!Number.isFinite(minutes)) {
        return "";
    }
    const hours = Math.floor(minutes / 60);
    const remainder = Math.max(0, minutes - hours * 60);
    return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function normalizeScheduleConfig(config) {
    const dayList = Array.isArray(config?.days) ? config.days : DEFAULT_SCHEDULE_CONFIG.days;
    const days = Array.from(
        new Set(
            dayList
                .map((day) => Number.parseInt(day, 10))
                .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        ),
    ).sort((a, b) => a - b);

    const startMinutes = parseTimeToMinutes(config?.start);
    const endMinutes = parseTimeToMinutes(config?.end);

    const defaultStart = parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.start);
    const defaultEnd = parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.end);

    const start = Number.isFinite(startMinutes) ? startMinutes : defaultStart;
    const end = Number.isFinite(endMinutes) ? endMinutes : defaultEnd;

    const effectiveStart = Math.min(start, end - 60);
    const effectiveEnd = Math.max(end, start + 60);

    return {
        days: days.length ? days : [...DEFAULT_SCHEDULE_CONFIG.days],
        start: formatMinutesToTime(effectiveStart),
        end: formatMinutesToTime(effectiveEnd),
    };
}

function buildSlotsFromSchedule(config = DEFAULT_SCHEDULE_CONFIG) {
    const normalized = normalizeScheduleConfig(config);
    const start = parseTimeToMinutes(normalized.start);
    const end = parseTimeToMinutes(normalized.end);
    const slots = [];
    for (let minutes = start; minutes <= end; minutes += 60) {
        slots.push(formatMinutesToTime(minutes));
    }
    return slots;
}

const DEFAULT_TIME_SLOTS = buildSlotsFromSchedule(DEFAULT_SCHEDULE_CONFIG);

const authState = {
    isAuthenticated: false,
    isMechanic: false,
};

let applyAuthVisibility = null;

const mechanicRegistry = new Map();
const workshopRegistry = new Map();
const mechanicState = {
    all: [],
};

const availabilityState = {
    totalSlots: DEFAULT_TIME_SLOTS.length,
    requestId: 0,
    selectedSlot: null,
    unavailableSlots: new Set(),
    timeSlots: DEFAULT_TIME_SLOTS,
    scheduleConfig: DEFAULT_SCHEDULE_CONFIG,
};

function getTimeSlots() {
    return availabilityState.timeSlots && availabilityState.timeSlots.length
        ? availabilityState.timeSlots
        : DEFAULT_TIME_SLOTS;
}

function initializeCalendarState() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    calendarState.today = today;
    calendarState.startOfTodayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    calendarState.currentMonth = new Date(calendarState.startOfTodayMonth);
    calendarState.selectedDate = null;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
    if (typeof value !== "string") {
        return null;
    }
    const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }
    const result = new Date(year, month - 1, day);
    if (Number.isNaN(result.getTime())) {
        return null;
    }
    return result;
}

function formatDateTimeValue(date, slot) {
    if (!(date instanceof Date) || typeof slot !== "string") {
        return "";
    }
    const [hours, minutes] = slot.split(":").map((part) => Number.parseInt(part, 10));
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hours)}:${pad(minutes)}:00`;
}

function formatSlotLabel(slot) {
    return `${slot} hrs`;
}

function parseSlotValue(value) {
    if (typeof value !== "string") {
        return null;
    }
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
        return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return null;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isFullDay(unavailableSet) {
    return unavailableSet.size >= getTimeSlots().length;
}

function parseDateTimeInput(value) {
    if (typeof value !== "string") {
        return null;
    }
    const [datePart, timePart] = value.split(/T|\s+/);
    const parsedDate = parseDateKey(datePart);
    const slot = parseSlotValue((timePart || "").slice(0, 5));
    if (!(parsedDate instanceof Date) || !slot) {
        return null;
    }
    return { date: parsedDate, slot };
}

function getSelectedVisitType() {
    const selected = document.querySelector('input[name="visit-type"]:checked');
    return selected?.value || "presencial";
}

function getSelectedWorkshopId() {
    const select = document.getElementById("workshop-select");
    if (!select) {
        return null;
    }
    const value = select.value;
    return value ? String(value) : null;
}

function getSelectedMechanicId() {
    const select = document.getElementById("mechanic-select");
    const mechanicId = Number.parseInt(select?.value || "", 10);
    return Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;
}

function formatWorkshopDescription(workshop) {
    if (!workshop || !workshop.name) {
        return "";
    }
    if (workshop.address) {
        return `${workshop.name} · ${workshop.address}`;
    }
    return workshop.name;
}

function isAllowedDay(date) {
    if (!(date instanceof Date)) {
        return false;
    }
    const schedule = normalizeScheduleConfig(availabilityState.scheduleConfig || DEFAULT_SCHEDULE_CONFIG);
    return schedule.days.includes(date.getDay());
}

function syncScheduleWithSelection() {
    const mechanicId = getSelectedMechanicId();
    const workshopId = getSelectedWorkshopId();
    const visitType = getSelectedVisitType();

    const mechanicWorkshop = mechanicId ? mechanicRegistry.get(mechanicId)?.workshop : null;
    const workshop = visitType === "presencial" && workshopId ? workshopRegistry.get(workshopId) : null;
    const source = mechanicWorkshop || workshop;

    const normalizedConfig = normalizeScheduleConfig(source?.scheduleConfig || DEFAULT_SCHEDULE_CONFIG);
    const providedSlots = Array.isArray(source?.timeSlots)
        ? source.timeSlots.map((slot) => parseSlotValue(slot)).filter(Boolean)
        : [];
    const slots = providedSlots.length ? providedSlots : buildSlotsFromSchedule(normalizedConfig);

    availabilityState.scheduleConfig = normalizedConfig;
    availabilityState.timeSlots = slots;
    availabilityState.totalSlots = slots.length;
    availabilityState.unavailableSlots = new Set();
    availabilityState.selectedSlot = null;
    calendarState.unavailableDates = new Set();
    calendarState.selectedDate = null;

    const referenceMonth = calendarState.currentMonth || calendarState.startOfTodayMonth || new Date();
    renderCalendar(referenceMonth);
    renderTimeSlots();
    updateScheduledForValue();
}

function getCalendarElements() {
    return {
        container: document.getElementById("visit-calendar"),
        monthLabel: document.querySelector("#visit-calendar [data-calendar-month]") || null,
        prevButton: document.querySelector("#visit-calendar [data-calendar-prev]") || null,
        nextButton: document.querySelector("#visit-calendar [data-calendar-next]") || null,
        weekdays: document.querySelector("#visit-calendar [data-calendar-weekdays]") || null,
        grid: document.querySelector("#visit-calendar [data-calendar-grid]") || null,
    };
}

function ensureCalendarStructure() {
    const container = document.getElementById("visit-calendar");
    if (!container || container.dataset.enhanced === "true") {
        return;
    }

    container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "calendar-header";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "calendar-nav";
    prevButton.dataset.calendarPrev = "";
    prevButton.setAttribute("aria-label", "Mes anterior");
    prevButton.innerHTML = "&#x2039;";
    header.appendChild(prevButton);

    const monthLabel = document.createElement("div");
    monthLabel.className = "calendar-month";
    monthLabel.dataset.calendarMonth = "";
    header.appendChild(monthLabel);

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "calendar-nav";
    nextButton.dataset.calendarNext = "";
    nextButton.setAttribute("aria-label", "Mes siguiente");
    nextButton.innerHTML = "&#x203a;";
    header.appendChild(nextButton);

    container.appendChild(header);

    const weekdays = document.createElement("div");
    weekdays.className = "calendar-weekdays";
    weekdays.dataset.calendarWeekdays = "";
    container.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "calendar-grid";
    grid.dataset.calendarGrid = "";
    grid.setAttribute("role", "grid");
    container.appendChild(grid);

    container.dataset.enhanced = "true";
}

function renderCalendarWeekdays() {
    const { weekdays } = getCalendarElements();
    if (!weekdays || weekdays.childElementCount > 0) {
        return;
    }

    const labels = ["L", "M", "X", "J", "V", "S", "D"];
    labels.forEach((label) => {
        const cell = document.createElement("div");
        cell.className = "calendar-weekday";
        cell.textContent = label;
        weekdays.appendChild(cell);
    });
}

function isSameDate(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function renderCalendar() {
    const { monthLabel, prevButton, nextButton, grid } = getCalendarElements();
    if (!monthLabel || !prevButton || !nextButton || !grid) {
        return;
    }

    const month = calendarState.currentMonth;
    if (!(month instanceof Date)) {
        return;
    }

    const formatter = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
    monthLabel.textContent = formatter.format(month);

    if (calendarState.startOfTodayMonth) {
        prevButton.disabled = calendarState.currentMonth <= calendarState.startOfTodayMonth;
    }

    grid.innerHTML = "";

    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const startWeekday = (startOfMonth.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
    const gridStart = new Date(startOfMonth);
    gridStart.setDate(startOfMonth.getDate() - startWeekday);

    for (let index = 0; index < 42; index += 1) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + index);
        const cellKey = formatDateKey(cellDate);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-day";
        button.textContent = String(cellDate.getDate());
        button.dataset.date = cellKey;
        button.setAttribute("aria-label", cellDate.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }));

        const isOutside = cellDate.getMonth() !== month.getMonth();
        if (isOutside) {
            button.classList.add("is-outside");
            button.disabled = true;
        }

        const isPast = calendarState.today && cellDate < calendarState.today;
        if (isPast) {
            button.disabled = true;
        }

        if (!isAllowedDay(cellDate)) {
            button.classList.add("is-unavailable");
            button.disabled = true;
        }

        if (calendarState.today && isSameDate(cellDate, calendarState.today)) {
            button.classList.add("is-today");
        }

        if (calendarState.unavailableDates.has(cellKey)) {
            button.classList.add("is-unavailable");
            button.disabled = true;
            button.title = "Este día ya está lleno";
            const ariaLabel = button.getAttribute("aria-label") || "";
            button.setAttribute("aria-label", `${ariaLabel} (sin horarios disponibles)`);
        }

        if (calendarState.selectedDate && isSameDate(cellDate, calendarState.selectedDate)) {
            button.classList.add("is-selected");
        }

        grid.appendChild(button);
    }

    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    nextButton.disabled = false;
    if (calendarState.today) {
        const limit = new Date(calendarState.today);
        limit.setMonth(limit.getMonth() + 6);
        limit.setDate(1);
        if (nextMonth > limit) {
            nextButton.disabled = true;
        }
    }
}

function updateCalendarHelper(message) {
    const helper = document.getElementById("calendar-helper");
    if (!helper) {
        return;
    }
    helper.textContent = message;
}

function setAvailabilityMessage(message, { tone = "info" } = {}) {
    const element = document.getElementById("calendar-availability");
    if (!element) {
        return;
    }
    element.textContent = message || "";
    element.hidden = !message;
    element.classList.remove("is-error");
    if (tone === "error") {
        element.classList.add("is-error");
    }
}

function updateSlotHelper(message) {
    const helper = document.getElementById("slot-helper");
    if (helper) {
        helper.textContent = message;
    }
}

function updateScheduledForValue() {
    const scheduledInput = document.getElementById("scheduled-for");
    const dateInput = document.getElementById("visit-date");
    if (!scheduledInput) {
        return;
    }

    const date = calendarState.selectedDate;
    const slot = availabilityState.selectedSlot;

    if (dateInput) {
        dateInput.value = date ? formatDateKey(date) : "";
    }

    if (!date) {
        scheduledInput.value = "";
        availabilityState.selectedSlot = null;
        updateCalendarHelper("Selecciona un día disponible para tu visita.");
        updateSlotHelper("Selecciona un día para ver los horarios disponibles.");
        setAvailabilityMessage("");
        return;
    }

    if (!slot) {
        scheduledInput.value = "";
        updateCalendarHelper(`Seleccionaste el ${date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}.`);
        updateSlotHelper("Elige una hora disponible para confirmar tu cita.");
        return;
    }

    const combined = formatDateTimeValue(date, slot);
    scheduledInput.value = combined;

    updateCalendarHelper(`Seleccionaste el ${date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} a las ${slot} hrs.`);
    updateSlotHelper("Puedes cambiar la hora si necesitas otro horario.");
}


function renderTimeSlots() {
    const container = document.getElementById("time-slot-list");
    const date = calendarState.selectedDate;
    const unavailable = availabilityState.unavailableSlots instanceof Set
        ? availabilityState.unavailableSlots
        : new Set();

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!(date instanceof Date)) {
        updateSlotHelper("Selecciona un día para ver los horarios disponibles.");
        return;
    }

    const dayIsFull = isFullDay(unavailable);
    const slots = getTimeSlots();
    if (!slots.includes(availabilityState.selectedSlot || "")) {
        availabilityState.selectedSlot = null;
        updateScheduledForValue();
    }

    slots.forEach((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot-button";
        button.textContent = formatSlotLabel(slot);
        button.dataset.slot = slot;

        const isUnavailable = unavailable.has(slot) || dayIsFull;
        if (availabilityState.selectedSlot === slot) {
            button.classList.add("is-selected");
        }
        if (isUnavailable) {
            button.classList.add("is-unavailable");
            button.disabled = true;
            button.title = dayIsFull ? "Este día ya está lleno" : "Horario no disponible";
        }

        container.appendChild(button);
    });

    if (dayIsFull) {
        updateSlotHelper("Este día ya está lleno. Elige otra fecha.");
    } else if (availabilityState.selectedSlot) {
        updateSlotHelper("Puedes cambiar la hora si necesitas otro horario.");
    } else {
        updateSlotHelper("Elige una hora disponible para confirmar tu cita.");
    }
}

function resetSlotSelection() {
    availabilityState.selectedSlot = null;
    availabilityState.unavailableSlots = new Set();
    renderTimeSlots();
    updateScheduledForValue();
}

function refreshDayAvailability() {
    const mechanicId = getSelectedMechanicId();
    const date = calendarState.selectedDate;
    const validMechanic = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;

    if (!(date instanceof Date) || !validMechanic) {
        resetSlotSelection();
        setAvailabilityMessage("");
        return;
    }

    fetchDayAvailability({ mechanicId: validMechanic, date });
}

async function fetchDayAvailability({ mechanicId, date }) {
    const parsedDate = date instanceof Date ? date : null;
    const validMechanic = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;

    if (!parsedDate || !validMechanic) {
        resetSlotSelection();
        setAvailabilityMessage("");
        return;
    }

    const dateKey = formatDateKey(parsedDate);
    const requestId = availabilityState.requestId + 1;
    availabilityState.requestId = requestId;

    setAvailabilityMessage("Cargando horarios disponibles...");

    try {
        const params = new URLSearchParams({ mechanicId: String(validMechanic), date: dateKey });
        const response = await fetch(`/api/appointments/unavailable-slots?${params.toString()}`, {
            credentials: "same-origin",
        });

        if (response.status === 401) {
            window.location.href = "./login.html";
            return;
        }

        if (!response.ok) {
            throw new Error("No se pudieron obtener los horarios disponibles.");
        }

        const data = await response.json();

        if (availabilityState.requestId !== requestId) {
            return;
        }

        const unavailableSlots = Array.isArray(data?.unavailableSlots) ? data.unavailableSlots : [];
        const normalizedUnavailable = new Set(
            unavailableSlots
                .map((value) => parseSlotValue(value))
                .filter((value) => typeof value === "string"),
        );

        const reservedCount = normalizedUnavailable.size;
        const capacityFromServer = Number.parseInt(data?.totalSlots, 10);
        const totalSlots = Number.isInteger(capacityFromServer) && capacityFromServer > 0
            ? capacityFromServer
            : getTimeSlots().length;

        availabilityState.totalSlots = totalSlots;
        availabilityState.unavailableSlots = normalizedUnavailable;
        availabilityState.selectedSlot = null;

        const remaining = Math.max(totalSlots - reservedCount, 0);

        if (isFullDay(normalizedUnavailable)) {
            calendarState.unavailableDates.add(dateKey);
            calendarState.selectedDate = null;
            renderCalendar();
            resetSlotSelection();
            updateCalendarHelper("Este día ya está lleno. Elige otra fecha.");
            setAvailabilityMessage("Este día ya está lleno.", { tone: "error" });
            return;
        }

        renderTimeSlots();
        updateScheduledForValue();

        if (remaining > 0) {
            setAvailabilityMessage("");
            updateCalendarHelper(
                `Seleccionaste el ${parsedDate.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}. Elige una hora.`,
            );
            return;
        }

        setAvailabilityMessage("No quedan horarios para este día.", { tone: "error" });
    } catch (error) {
        console.error(error);
        if (availabilityState.requestId !== requestId) {
            return;
        }
        resetSlotSelection();
        setAvailabilityMessage("No pudimos cargar los horarios disponibles. Intenta nuevamente.", { tone: "error" });
    }
}

function selectCalendarDate(dateKey) {
    const parsed = parseDateKey(dateKey);
    if (!parsed) {
        return;
    }
    const weekday = parsed.getDay();
    if (weekday === 0 || weekday === 6) {
        return;
    }
    if (calendarState.today && parsed < calendarState.today) {
        return;
    }
    if (calendarState.unavailableDates.has(formatDateKey(parsed))) {
        return;
    }
    calendarState.selectedDate = parsed;
    availabilityState.selectedSlot = null;
    availabilityState.unavailableSlots = new Set();
    renderTimeSlots();
    updateScheduledForValue();
    renderCalendar();
    refreshDayAvailability();
}

async function fetchUnavailableDates(mechanicId) {
    const requestedId = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;
    calendarState.mechanicId = requestedId;

    if (!requestedId) {
        calendarState.unavailableDates = new Set();
        calendarState.selectedDate = null;
        resetSlotSelection();
        updateScheduledForValue();
        renderCalendar();
        updateCalendarHelper("Selecciona un mecánico para ver la disponibilidad.");
        refreshDayAvailability();
        return;
    }

    updateCalendarHelper("Cargando disponibilidad...");

    try {
        const params = new URLSearchParams({ mechanicId: String(requestedId) });
        const response = await fetch(`/api/appointments/unavailable-days?${params.toString()}`, {
            credentials: "same-origin",
        });

        if (response.status === 401) {
            window.location.href = "./login.html";
            return;
        }

        if (!response.ok) {
            throw new Error("No pudimos obtener la disponibilidad actualizada.");
        }

        const data = await response.json();
        const unavailable = Array.isArray(data?.unavailableDays) ? data.unavailableDays : [];
        if (calendarState.mechanicId !== requestedId) {
            return;
        }
        calendarState.unavailableDates = new Set(unavailable);

        if (
            calendarState.selectedDate &&
            calendarState.unavailableDates.has(formatDateKey(calendarState.selectedDate))
        ) {
            calendarState.selectedDate = null;
        }

        renderCalendar();
        updateScheduledForValue();
        renderTimeSlots();

        refreshDayAvailability();
        updateCalendarHelper("Selecciona un día disponible para tu visita.");
    } catch (error) {
        console.error(error);
        if (calendarState.mechanicId !== requestedId) {
            return;
        }
        calendarState.unavailableDates = new Set();
        updateCalendarHelper("No pudimos cargar la disponibilidad. Intenta nuevamente más tarde.");
        renderCalendar();
        refreshDayAvailability();
    }
}

function setupCalendar() {
    ensureCalendarStructure();
    initializeCalendarState();
    renderCalendarWeekdays();
    renderCalendar();

    const { prevButton, nextButton, grid } = getCalendarElements();
    if (prevButton) {
        prevButton.addEventListener("click", () => {
            const previous = new Date(calendarState.currentMonth);
            previous.setMonth(previous.getMonth() - 1);
            if (calendarState.startOfTodayMonth && previous < calendarState.startOfTodayMonth) {
                return;
            }
            calendarState.currentMonth = previous;
            renderCalendar();
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", () => {
            const next = new Date(calendarState.currentMonth);
            next.setMonth(next.getMonth() + 1);
            calendarState.currentMonth = next;
            renderCalendar();
        });
    }

    if (grid) {
        grid.addEventListener("click", (event) => {
            const target = event.target;
            if (target instanceof HTMLButtonElement && target.dataset.date && !target.disabled) {
                selectCalendarDate(target.dataset.date);
            }
        });
    }

    updateCalendarHelper("Selecciona un mecánico para ver la disponibilidad.");
    setAvailabilityMessage("");
    renderTimeSlots();
}

function setVisitPanelsVisibility(visitType) {
    const domicilioPanel = document.querySelector("[data-domicilio-panel]");
    const domicilioAddress = document.getElementById("domicile-address");
    const workshopField = document.getElementById("workshop-select-field");
    const workshopSelect = document.getElementById("workshop-select");

    if (domicilioPanel) {
        domicilioPanel.hidden = visitType !== "domicilio";
    }
    if (domicilioAddress) {
        domicilioAddress.required = visitType === "domicilio";
    }

    if (workshopField) {
        workshopField.hidden = visitType !== "presencial";
    }
    if (workshopSelect) {
        workshopSelect.required = visitType === "presencial";
        if (visitType !== "presencial") {
            workshopSelect.value = "";
            updateWorkshopDetailInput(null);
        }
    }

    applyMechanicFilters({ preserveSelection: visitType === "presencial" });
    syncScheduleWithSelection();
}

function updateMechanicWorkshopInfo(mechanicId) {
    const field = document.getElementById("mechanic-workshop-field");
    const text = document.getElementById("mechanic-workshop-text");
    const hiddenInput = document.getElementById("workshop-detail");

    if (!field || !text || !hiddenInput) {
        return;
    }

    const visitType = getSelectedVisitType();
    const selectedWorkshopId = getSelectedWorkshopId();
    const validId = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;

    let workshop = null;
    if (validId) {
        const record = mechanicRegistry.get(validId) || {};
        workshop = record.workshop || null;
    }

    if (!workshop && selectedWorkshopId) {
        workshop = workshopRegistry.get(selectedWorkshopId) || null;
    }

    const description = formatWorkshopDescription(workshop);

    if (description) {
        text.textContent = description;
        hiddenInput.value = description;
        field.hidden = false;
        return;
    }

    if (validId) {
        text.textContent =
            "Este mecánico aún no ha registrado un taller. Agenda una visita a domicilio si quieres.";
        hiddenInput.value = "";
        field.hidden = visitType === "presencial";
        return;
    }

    text.textContent = "";
    hiddenInput.value = "";
    field.hidden = true;
}

function updateWorkshopDetailInput(workshopId) {
    const hiddenInput = document.getElementById("workshop-detail");
    if (!hiddenInput) {
        return;
    }
    const workshop = workshopId ? workshopRegistry.get(workshopId) : null;
    hiddenInput.value = formatWorkshopDescription(workshop);
}

function updateMechanicHelperMessage(visitType, workshopId, mechanicsCount) {
    const helper = document.getElementById("mechanic-helper");
    if (!helper) {
        return;
    }

    if (visitType === "presencial" && !workshopId) {
        helper.textContent = "Selecciona un taller para ver los mecánicos disponibles.";
        return;
    }

    if (visitType === "presencial" && workshopId && mechanicsCount === 0) {
        helper.textContent = "No hay mecánicos registrados en este taller.";
        return;
    }

    if (mechanicsCount === 0) {
        helper.textContent = "Aún no hay mecánicos validados disponibles.";
        return;
    }

    helper.textContent = "Solo se muestran mecánicos validados.";
}

function renderMechanicOptions({ mechanics, visitType, workshopId, preserveSelection }) {
    const select = document.getElementById("mechanic-select");
    if (!select) {
        return;
    }

    const previousValue = preserveSelection ? select.value : "";
    select.innerHTML = "";

    let placeholderText = "Selecciona un mecánico disponible";
    if (visitType === "presencial" && !workshopId) {
        placeholderText = "Selecciona un taller para ver mecánicos disponibles";
    } else if (visitType === "presencial" && workshopId && mechanics.length === 0) {
        placeholderText = "No hay mecánicos registrados en este taller";
    } else if (!mechanics.length) {
        placeholderText = "No hay mecánicos disponibles en este momento";
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderText;
    select.appendChild(placeholder);

    mechanics.forEach((mechanic) => {
        const option = document.createElement("option");
        option.value = String(mechanic.id);
        option.textContent = mechanic.name || mechanic.email;
        if (previousValue && previousValue === option.value) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    const selectedValue = select.value && select.querySelector(`option[value="${select.value}"]`) ? select.value : "";
    select.value = selectedValue;

    const mechanicId = Number.parseInt(select.value, 10);
    if (Number.isInteger(mechanicId) && mechanicId > 0) {
        fetchUnavailableDates(mechanicId);
        updateMechanicWorkshopInfo(mechanicId);
    } else {
        fetchUnavailableDates(null);
        updateMechanicWorkshopInfo(null);
    }

    syncScheduleWithSelection();

    updateMechanicHelperMessage(visitType, workshopId, mechanics.length);
}

function applyMechanicFilters({ preserveSelection = false } = {}) {
    const visitType = getSelectedVisitType();
    const workshopId = visitType === "presencial" ? getSelectedWorkshopId() : null;

    let mechanics = mechanicState.all;
    if (visitType === "presencial") {
        mechanics = workshopId
            ? mechanics.filter((mechanic) => mechanic?.workshop?.id === workshopId)
            : [];
    }

    renderMechanicOptions({
        mechanics,
        visitType,
        workshopId,
        preserveSelection,
    });
}

async function fetchMechanics() {
    const select = document.getElementById("mechanic-select");
    const helper = document.getElementById("mechanic-helper");

    if (select) {
        select.innerHTML = "";
        const loadingOption = document.createElement("option");
        loadingOption.value = "";
        loadingOption.textContent = "Cargando mecánicos disponibles...";
        select.appendChild(loadingOption);
    }

    try {
        const response = await fetch("/api/mechanics", { credentials: "same-origin" });
        if (response.status === 401) {
            window.location.href = "./login.html";
            return;
        }

        if (!response.ok) {
            throw new Error("No se pudo obtener la lista de mecánicos.");
        }

        const data = await response.json();
        const mechanics = Array.isArray(data?.mechanics) ? data.mechanics : [];

        mechanicRegistry.clear();
        mechanicState.all = mechanics.map((mechanic) => {
            const workshopInfo = mechanic?.workshop && typeof mechanic.workshop === "object"
                ? {
                      id: mechanic.workshop.id ? String(mechanic.workshop.id) : null,
                      name: mechanic.workshop.name || "",
                      address: mechanic.workshop.address || "",
                      schedule: mechanic.workshop.schedule || "",
                      scheduleConfig: mechanic.workshop.scheduleConfig || DEFAULT_SCHEDULE_CONFIG,
                      timeSlots: Array.isArray(mechanic.workshop.timeSlots)
                          ? mechanic.workshop.timeSlots.map((slot) => parseSlotValue(slot)).filter(Boolean)
                          : [],
                  }
                : null;

            mechanicRegistry.set(Number(mechanic.id), {
                name: mechanic.name || mechanic.email || "",
                workshop: workshopInfo,
            });

            return {
                id: mechanic.id,
                name: mechanic.name || mechanic.email || "",
                email: mechanic.email,
                workshop: workshopInfo,
            };
        });

        applyMechanicFilters({ preserveSelection: true });

        if (helper && !mechanics.length) {
            helper.textContent = "Aún no hay mecánicos validados disponibles.";
        }
    } catch (error) {
        console.error(error);
        if (select) {
            select.innerHTML = "";
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No se pudieron cargar los mecánicos";
            select.appendChild(option);
        }
        mechanicRegistry.clear();
        mechanicState.all = [];
        updateMechanicWorkshopInfo(null);
        fetchUnavailableDates(null);
        if (helper) {
            helper.textContent =
                "No pudimos cargar los mecánicos disponibles. Intenta nuevamente en unos minutos.";
        }
    }
}

async function fetchWorkshops() {
    const select = document.getElementById("workshop-select");
    const helper = document.getElementById("workshop-helper");

    if (select) {
        select.innerHTML = "";
        const loadingOption = document.createElement("option");
        loadingOption.value = "";
        loadingOption.textContent = "Cargando talleres registrados...";
        select.appendChild(loadingOption);
    }

    try {
        const response = await fetch("/api/workshops");
        if (!response.ok) {
            throw new Error("No se pudo obtener la lista de talleres.");
        }

        const data = await response.json();
        const workshops = Array.isArray(data?.workshops) ? data.workshops : [];

        if (!select) {
            return;
        }

        const previousValue = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = workshops.length
            ? "Selecciona un taller registrado"
            : "Aún no hay talleres registrados";
        select.appendChild(placeholder);

        workshopRegistry.clear();
        workshops.forEach((workshop) => {
            const normalizedId = workshop.id ? String(workshop.id) : null;
            const normalizedSlots = Array.isArray(workshop.timeSlots)
                ? workshop.timeSlots.map((slot) => parseSlotValue(slot)).filter(Boolean)
                : [];
            const normalizedWorkshop = {
                id: normalizedId,
                name: workshop.name || "",
                address: workshop.address || "",
                schedule: workshop.schedule || "",
                scheduleConfig: workshop.scheduleConfig || DEFAULT_SCHEDULE_CONFIG,
                timeSlots: normalizedSlots.length ? normalizedSlots : buildSlotsFromSchedule(workshop.scheduleConfig),
            };

            if (normalizedId) {
                workshopRegistry.set(normalizedId, normalizedWorkshop);
            }

            const option = document.createElement("option");
            option.value = normalizedId || "";
            option.textContent = workshop.name || workshop.id;
            if (previousValue && previousValue === option.value) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        updateWorkshopDetailInput(getSelectedWorkshopId());
        applyMechanicFilters({ preserveSelection: true });

        if (helper) {
            helper.textContent = workshops.length
                ? "Elige un taller para ver los mecánicos disponibles."
                : "Aún no hay talleres registrados.";
        }
    } catch (error) {
        console.error(error);
        if (select) {
            select.innerHTML = "";
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No se pudieron cargar los talleres";
            select.appendChild(option);
        }
        updateWorkshopDetailInput(null);
        if (helper) {
            helper.textContent = "No pudimos cargar los talleres registrados. Intenta más tarde.";
        }
    }
}

function showFormFeedback(message, variant) {
    const feedback = document.getElementById("form-feedback");
    if (!feedback) {
        return;
    }
    feedback.textContent = message;
    feedback.classList.remove("success", "error");
    if (variant) {
        feedback.classList.add(variant);
    }
}

function normalizeText(value) {
    return (value || "").trim();
}

function setupTimeSlotSelector() {
    const container = document.getElementById("time-slot-list");
    if (!container) {
        return;
    }

    container.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement) || !target.dataset.slot || target.disabled) {
            return;
        }

        const parsedSlot = parseSlotValue(target.dataset.slot);
        if (!parsedSlot) {
            return;
        }

        availabilityState.selectedSlot = parsedSlot;
        renderTimeSlots();
        updateScheduledForValue();
    });
}

function setupMechanicAvailabilityListener() {
    const select = document.getElementById("mechanic-select");
    if (!select) {
        return;
    }

    select.addEventListener("change", () => {
        const mechanicId = Number.parseInt(select.value, 10);
        updateMechanicWorkshopInfo(Number.isInteger(mechanicId) ? mechanicId : null);
        if (Number.isInteger(mechanicId) && mechanicId > 0) {
            fetchUnavailableDates(mechanicId);
        } else {
            fetchUnavailableDates(null);
        }
        syncScheduleWithSelection();
    });
}

function setupVisitTypeRadios() {
    const radios = document.querySelectorAll('input[name="visit-type"]');
    if (!radios.length) {
        return;
    }

    radios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (radio.checked) {
                setVisitPanelsVisibility(radio.value);
            }
        });
    });
}

function setupWorkshopSelection() {
    const select = document.getElementById("workshop-select");
    if (!select) {
        return;
    }

    select.addEventListener("change", () => {
        const workshopId = getSelectedWorkshopId();
        updateWorkshopDetailInput(workshopId);
        applyMechanicFilters({ preserveSelection: false });
        syncScheduleWithSelection();
    });
}

async function submitAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
        return;
    }

    const formData = new FormData(form);
    const service = normalizeText(formData.get("service"));
    const scheduledValue = normalizeText(formData.get("scheduled-for"));
    const visitType = normalizeText(formData.get("visit-type")) || "presencial";
    const workshopId = normalizeText(formData.get("workshop"));
    const mechanicId = Number(formData.get("mechanic"));
    const notes = normalizeText(formData.get("notes"));

    if (!service) {
        showFormFeedback("Indica el servicio requerido.", "error");
        return;
    }

    if (!scheduledValue) {
        showFormFeedback("Selecciona un día y horario disponible para la visita.", "error");
        return;
    }

    if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
        showFormFeedback("Selecciona un mecánico disponible.", "error");
        return;
    }

    const parsedSchedule = parseDateTimeInput(scheduledValue);
    if (!parsedSchedule) {
        showFormFeedback("La fecha u horario seleccionado no es válido.", "error");
        return;
    }

    const { date: scheduledDate, slot: scheduledSlot } = parsedSchedule;

    let locationDetail = "";
    if (visitType === "presencial") {
        if (!workshopId) {
            showFormFeedback("Selecciona un taller para la visita presencial.", "error");
            return;
        }

        const mechanicRecord = mechanicRegistry.get(mechanicId);
        const mechanicWorkshopId = mechanicRecord?.workshop?.id || null;
        if (!mechanicWorkshopId) {
            showFormFeedback(
                "El mecánico seleccionado aún no tiene un taller disponible para visitas presenciales.",
                "error",
            );
            return;
        }

        if (mechanicWorkshopId !== workshopId) {
            showFormFeedback("El mecánico seleccionado pertenece a otro taller.", "error");
            return;
        }

        const workshopDetail =
            normalizeText(formData.get("workshop-detail")) || formatWorkshopDescription(workshopRegistry.get(workshopId));
        if (!workshopDetail) {
            showFormFeedback("No pudimos identificar los datos del taller seleccionado.", "error");
            return;
        }

        locationDetail = workshopDetail;
    } else {
        locationDetail = normalizeText(formData.get("domicile-address"));
        if (!locationDetail) {
            showFormFeedback("Indica la dirección para la visita a domicilio.", "error");
            return;
        }
    }

    showFormFeedback("Enviando tu solicitud...", null);

    try {
        const payload = {
            mechanicId,
            service,
            visitType,
            scheduledFor: formatDateTimeValue(scheduledDate, scheduledSlot),
            notes,
            address: locationDetail,
        };

        const response = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
        });

        if (response.status === 401) {
            window.location.href = "./login.html";
            return;
        }

        if (!response.ok) {
            let errorMessage = "No pudimos agendar la cita. Inténtalo nuevamente.";
            try {
                const errorData = await response.json();
                if (typeof errorData?.error === "string" && errorData.error.trim()) {
                    errorMessage = errorData.error.trim();
                }
            } catch (parseError) {
                console.error("No se pudo interpretar la respuesta", parseError);
            }
            throw new Error(errorMessage);
        }

        form.reset();
        setVisitPanelsVisibility("presencial");
        calendarState.selectedDate = null;
        resetSlotSelection();
        if (calendarState.startOfTodayMonth) {
            calendarState.currentMonth = new Date(calendarState.startOfTodayMonth);
        }
        renderCalendar();
        updateScheduledForValue();

        const mechanicSelect = document.getElementById("mechanic-select");
        const currentMechanicId = mechanicSelect ? Number.parseInt(mechanicSelect.value, 10) : null;
        if (Number.isInteger(currentMechanicId) && currentMechanicId > 0) {
            fetchUnavailableDates(currentMechanicId);
        } else {
            fetchUnavailableDates(null);
        }
        updateMechanicWorkshopInfo(Number.isInteger(currentMechanicId) ? currentMechanicId : null);
        showFormFeedback("¡Solicitud enviada! Te contactaremos para confirmar la cita.", "success");
        window.location.href = "./paginainicio.html";
    } catch (error) {
        console.error(error);
        showFormFeedback(error.message || "No pudimos agendar la cita. Inténtalo nuevamente.", "error");
    }
}

function setupAuthVisibilityControls() {
    const visibilityTargets = document.querySelectorAll("[data-auth-visibility], [data-visible-for]");
    if (!visibilityTargets.length) {
        return;
    }

    const unauthenticatedOnly = document.querySelectorAll('[data-auth-visibility="unauthenticated"]');
    const authenticatedOnly = document.querySelectorAll('[data-auth-visibility="authenticated"]');
    const mechanicOnly = document.querySelectorAll('[data-visible-for="mecanico"]');
    const userOnly = document.querySelectorAll('[data-visible-for="usuario"]');

    const setVisibility = (element, visible) => {
        if (visible) {
            element.removeAttribute("hidden");
        } else {
            element.setAttribute("hidden", "");
        }
    };

    applyAuthVisibility = () => {
        const { isAuthenticated, isMechanic } = authState;
        unauthenticatedOnly.forEach((el) => setVisibility(el, !isAuthenticated));
        authenticatedOnly.forEach((el) => setVisibility(el, isAuthenticated));
        mechanicOnly.forEach((el) => setVisibility(el, isAuthenticated && isMechanic));
        userOnly.forEach((el) => setVisibility(el, isAuthenticated && !isMechanic));
    };

    applyAuthVisibility();
}

function setAuthState(updates) {
    authState.isAuthenticated = Boolean(updates?.isAuthenticated);
    authState.isMechanic = Boolean(updates?.isMechanic);
    if (typeof applyAuthVisibility === "function") {
        applyAuthVisibility();
    }
}

async function ensureAuthenticatedUser() {
    try {
        const response = await fetch("/api/profile", { credentials: "same-origin" });
        if (!response.ok) {
            throw new Error("No autenticado");
        }
        const profile = await response.json();
        setAuthState({
            isAuthenticated: true,
            isMechanic: profile?.accountType === "mecanico",
        });
        if (authState.isMechanic) {
            throw new Error("Los mecánicos no pueden agendar citas.");
        }
        return true;
    } catch (error) {
        setAuthState({ isAuthenticated: false, isMechanic: false });
        const redirectTarget = encodeURIComponent("./agendar-cita.html");
        window.location.href = `./login.html?redirect=${redirectTarget}`;
        return false;
    }
}

async function initializeAppointmentPage() {
    setupAuthVisibilityControls();

    const isAuthenticated = await ensureAuthenticatedUser();
    if (!isAuthenticated) {
        return;
    }

    setVisitPanelsVisibility("presencial");
    setupVisitTypeRadios();
    setupWorkshopSelection();
    setupCalendar();
    setupTimeSlotSelector();
    setupMechanicAvailabilityListener();
    updateMechanicWorkshopInfo(null);
    fetchWorkshops();
    fetchMechanics();

    const form = document.getElementById("appointment-form");
    if (form) {
        form.addEventListener("submit", submitAppointment);
    }
    fetchUnavailableDates(null);
}

document.addEventListener("DOMContentLoaded", initializeAppointmentPage);
