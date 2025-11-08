const calendarState = {
    today: null,
    startOfTodayMonth: null,
    currentMonth: null,
    selectedDate: null,
    unavailableDates: new Set(),
    mechanicId: null,
};

const mechanicRegistry = new Map();

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

        const weekday = cellDate.getDay();
        const isWeekend = weekday === 0 || weekday === 6;

        const isOutside = cellDate.getMonth() !== month.getMonth();
        if (isOutside) {
            button.classList.add("is-outside");
            button.disabled = true;
        }

        const isPast = calendarState.today && cellDate < calendarState.today;
        if (isPast) {
            button.disabled = true;
        }

        if (isWeekend) {
            button.classList.add("is-unavailable");
            button.disabled = true;
        }

        if (calendarState.today && isSameDate(cellDate, calendarState.today)) {
            button.classList.add("is-today");
        }

        if (calendarState.unavailableDates.has(cellKey)) {
            button.classList.add("is-unavailable");
            button.disabled = true;
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

function updateScheduledForValue() {
    const scheduledInput = document.getElementById("scheduled-for");
    const dateInput = document.getElementById("visit-date");
    const timeInput = document.getElementById("visit-time");
    if (!scheduledInput) {
        return;
    }

    const date = calendarState.selectedDate;
    const timeValue = timeInput?.value || "";

    if (dateInput) {
        dateInput.value = date ? formatDateKey(date) : "";
    }

    if (!date) {
        scheduledInput.value = "";
        updateCalendarHelper("Selecciona un día disponible para tu visita.");
        return;
    }

    if (!timeValue) {
        scheduledInput.value = "";
        updateCalendarHelper(
            `Seleccionaste el ${date.toLocaleDateString("es-CL", {
                weekday: "long",
                day: "numeric",
                month: "long",
            })}. Ahora elige una hora disponible.`,
        );
        return;
    }

    const combined = `${formatDateKey(date)}T${timeValue}`;
    scheduledInput.value = combined;

    updateCalendarHelper(
        `Seleccionaste el ${date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}.`,
    );
}

function selectCalendarDate(dateKey) {
    const parsed = parseDateKey(dateKey);
    if (!parsed) {
        return;
    }
    if (calendarState.today && parsed < calendarState.today) {
        return;
    }
    if (calendarState.unavailableDates.has(formatDateKey(parsed))) {
        return;
    }
    calendarState.selectedDate = parsed;
    updateScheduledForValue();
    renderCalendar();
}

async function fetchUnavailableDates(mechanicId) {
    const requestedId = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;
    calendarState.mechanicId = requestedId;

    if (!requestedId) {
        calendarState.unavailableDates = new Set();
        calendarState.selectedDate = null;
        updateScheduledForValue();
        renderCalendar();
        updateCalendarHelper("Selecciona un mecánico para ver la disponibilidad.");
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

        updateCalendarHelper("Selecciona un día disponible para tu visita.");
    } catch (error) {
        console.error(error);
        if (calendarState.mechanicId !== requestedId) {
            return;
        }
        calendarState.unavailableDates = new Set();
        updateCalendarHelper("No pudimos cargar la disponibilidad. Intenta nuevamente más tarde.");
        renderCalendar();
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

    const timeInput = document.getElementById("visit-time");
    if (timeInput) {
        timeInput.addEventListener("change", updateScheduledForValue);
        timeInput.addEventListener("input", updateScheduledForValue);
    }

    updateCalendarHelper("Selecciona un mecánico para ver la disponibilidad.");
}

function setVisitPanelsVisibility(visitType) {
    const domicilioPanel = document.querySelector("[data-domicilio-panel]");
    const domicilioAddress = document.getElementById("domicile-address");

    if (domicilioPanel) {
        domicilioPanel.hidden = visitType !== "domicilio";
    }
    if (domicilioAddress) {
        domicilioAddress.required = visitType === "domicilio";
    }
}

function updateMechanicWorkshopInfo(mechanicId) {
    const field = document.getElementById("mechanic-workshop-field");
    const text = document.getElementById("mechanic-workshop-text");
    const hiddenInput = document.getElementById("workshop-detail");

    if (!field || !text || !hiddenInput) {
        return;
    }

    const validId = Number.isInteger(mechanicId) && mechanicId > 0 ? mechanicId : null;

    if (!validId) {
        field.hidden = true;
        text.textContent = "";
        hiddenInput.value = "";
        return;
    }

    const record = mechanicRegistry.get(validId) || {};
    const workshop = record.workshop || null;

    if (workshop && workshop.name) {
        const description = workshop.address
            ? `${workshop.name} · ${workshop.address}`
            : workshop.name;
        text.textContent = description;
        hiddenInput.value = description;
        field.hidden = false;
    } else {
        text.textContent =
            "Este mecánico aún no ha registrado un taller. Agenda una visita a domicilio si quieres.";
        hiddenInput.value = "";
        field.hidden = false;
    }
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

        if (!select) {
            return;
        }

        const previousValue = select.value;
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = mechanics.length
            ? "Selecciona un mecánico disponible"
            : "No hay mecánicos disponibles en este momento";
        select.appendChild(placeholder);

        mechanicRegistry.clear();
        mechanics.forEach((mechanic) => {
            const option = document.createElement("option");
            option.value = String(mechanic.id);
            option.textContent = mechanic.name || mechanic.email;
            if (previousValue && previousValue === option.value) {
                option.selected = true;
            }
            select.appendChild(option);

            const workshopInfo = mechanic?.workshop && typeof mechanic.workshop === "object"
                ? {
                      id: mechanic.workshop.id || null,
                      name: mechanic.workshop.name || "",
                      address: mechanic.workshop.address || "",
                  }
                : null;

            mechanicRegistry.set(Number(mechanic.id), {
                name: mechanic.name || mechanic.email || "",
                workshop: workshopInfo,
            });
        });

        const selectedMechanicId = Number.parseInt(select.value, 10);
        if (Number.isInteger(selectedMechanicId) && selectedMechanicId > 0) {
            fetchUnavailableDates(selectedMechanicId);
        } else {
            fetchUnavailableDates(null);
        }

        updateMechanicWorkshopInfo(Number.isInteger(selectedMechanicId) ? selectedMechanicId : null);

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
        updateMechanicWorkshopInfo(null);
        if (helper) {
            helper.textContent =
                "No pudimos cargar los mecánicos disponibles. Intenta nuevamente en unos minutos.";
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
    const mechanicId = Number(formData.get("mechanic"));
    const notes = normalizeText(formData.get("notes"));

    if (!service) {
        showFormFeedback("Indica el servicio requerido.", "error");
        return;
    }

    if (!scheduledValue) {
        showFormFeedback("Selecciona un día y una hora disponibles para la visita.", "error");
        return;
    }

    if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
        showFormFeedback("Selecciona un mecánico disponible.", "error");
        return;
    }

    const scheduledDate = new Date(scheduledValue);
    if (Number.isNaN(scheduledDate.getTime())) {
        showFormFeedback("La fecha seleccionada no es válida.", "error");
        return;
    }

    let locationDetail = "";
    if (visitType === "presencial") {
        const workshopDetail = normalizeText(formData.get("workshop-detail"));
        if (!workshopDetail) {
            showFormFeedback(
                "El mecánico seleccionado aún no tiene un taller disponible. Selecciona visita a domicilio o elige otro mecánico.",
                "error",
            );
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
            scheduledFor: scheduledDate.toISOString(),
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

    const state = {
        isAuthenticated: false,
        isMechanic: false,
    };

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

    const applyVisibility = () => {
        const { isAuthenticated, isMechanic } = state;
        unauthenticatedOnly.forEach((el) => setVisibility(el, !isAuthenticated));
        authenticatedOnly.forEach((el) => setVisibility(el, isAuthenticated));
        mechanicOnly.forEach((el) => setVisibility(el, isAuthenticated && isMechanic));
        userOnly.forEach((el) => setVisibility(el, isAuthenticated && !isMechanic));
    };

    applyVisibility();

    fetch("/api/profile")
        .then((response) => {
            if (!response.ok) {
                throw new Error("No autenticado");
            }
            return response.json();
        })
        .then((profile) => {
            state.isAuthenticated = true;
            state.isMechanic = profile?.accountType === "mecanico";
            applyVisibility();
        })
        .catch(() => {
            state.isAuthenticated = false;
            state.isMechanic = false;
            applyVisibility();
        });
}

function initializeAppointmentPage() {
    setVisitPanelsVisibility("presencial");
    setupVisitTypeRadios();
    setupCalendar();
    setupMechanicAvailabilityListener();
    setupAuthVisibilityControls();
    updateMechanicWorkshopInfo(null);
    fetchMechanics();

    const form = document.getElementById("appointment-form");
    if (form) {
        form.addEventListener("submit", submitAppointment);
    }
    fetchUnavailableDates(null);
}

document.addEventListener("DOMContentLoaded", initializeAppointmentPage);
