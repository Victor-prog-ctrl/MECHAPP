const WORKSHOPS = [
    {
        id: "automaster-centro",
        name: "AutoMasters · Centro",
        address: "Av. Libertador Bernardo O'Higgins 1234, Santiago",
        lat: -33.4489,
        lng: -70.6693,
        services: ["Mantenimiento general", "Diagnóstico electrónico"],
    },
    {
        id: "taller-ruiz",
        name: "Taller Ruiz",
        address: "Av. Providencia 1456, Providencia",
        lat: -33.4329,
        lng: -70.6344,
        services: ["Alineación y balanceo", "Suspensión"],
    },
    {
        id: "electroauto-norte",
        name: "ElectroAuto Norte",
        address: "Av. Recoleta 2888, Recoleta",
        lat: -33.398,
        lng: -70.6413,
        services: ["Diagnóstico eléctrico", "Baterías"],
    },
    {
        id: "torque-sur",
        name: "Torque Sur",
        address: "Gran Avenida José Miguel Carrera 7200, San Miguel",
        lat: -33.4987,
        lng: -70.6472,
        services: ["Frenos", "Cambio de aceite"],
    },
    {
        id: "motores-vita",
        name: "Motores Vitacura",
        address: "Av. Vitacura 5201, Vitacura",
        lat: -33.3935,
        lng: -70.5965,
        services: ["Reparaciones complejas", "Diagnóstico computarizado"],
    },
    {
        id: "andina-maipu",
        name: "Servicio Mecánico Andina",
        address: "Av. Pajaritos 3200, Maipú",
        lat: -33.493,
        lng: -70.7577,
        services: ["Mecánica rápida", "Neumáticos"],
    },
];

const LOCATION_DEFAULT_MESSAGE =
    "Activa la ubicación para sugerirte talleres cercanos o completar una visita a domicilio.";

const locationState = {
    coords: null,
};

const calendarState = {
    today: null,
    startOfTodayMonth: null,
    currentMonth: null,
    selectedDate: null,
    unavailableDates: new Set(),
    mechanicId: null,
};

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

        const isOutside = cellDate.getMonth() !== month.getMonth();
        if (isOutside) {
            button.classList.add("is-outside");
            button.disabled = true;
        }

        const isPast = calendarState.today && cellDate < calendarState.today;
        if (isPast) {
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

function formatDistance(kilometers) {
    if (!Number.isFinite(kilometers)) {
        return "";
    }
    if (kilometers < 1) {
        return `${Math.round(kilometers * 1000)} m`;
    }
    return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function haversineDistance(coordA, coordB) {
    const R = 6371; // km
    const dLat = toRadians(coordB.lat - coordA.lat);
    const dLng = toRadians(coordB.lng - coordA.lng);
    const lat1 = toRadians(coordA.lat);
    const lat2 = toRadians(coordB.lat);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getWorkshopsSortedByDistance(position) {
    if (!position) {
        return [...WORKSHOPS].sort((a, b) => a.name.localeCompare(b.name));
    }

    return WORKSHOPS.map((workshop) => ({
        ...workshop,
        distance: haversineDistance(position, workshop),
    })).sort((a, b) => a.distance - b.distance);
}

function updateLocationStatus(message, variant) {
    const statusElement = document.getElementById("location-status");
    if (!statusElement) {
        return;
    }

    statusElement.textContent = message;
    statusElement.classList.remove("error", "success");
    if (variant) {
        statusElement.classList.add(variant);
    }
}

function updateHiddenLocationInputs(coords) {
    const latInput = document.getElementById("client-latitude");
    const lngInput = document.getElementById("client-longitude");

    if (latInput) {
        latInput.value = coords?.lat ?? "";
    }
    if (lngInput) {
        lngInput.value = coords?.lng ?? "";
    }
}

function renderWorkshopSuggestions(position) {
    const container = document.getElementById("workshop-suggestions");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!WORKSHOPS.length) {
        return;
    }

    const suggestions = getWorkshopsSortedByDistance(position).slice(0, 4);

    if (!position) {
        const message = document.createElement("p");
        message.className = "location-status";
        message.textContent = "Podrás ver talleres cercanos cuando compartas tu ubicación.";
        container.appendChild(message);
    }

    suggestions.forEach((workshop) => {
        const article = document.createElement("article");
        article.className = "workshop-option";

        const title = document.createElement("strong");
        title.textContent = workshop.name;
        article.appendChild(title);

        const address = document.createElement("p");
        address.textContent = workshop.address;
        article.appendChild(address);

        const extra = document.createElement("small");
        extra.textContent = position
            ? `A ${formatDistance(workshop.distance)} de tu ubicación`
            : workshop.services.join(" · ");
        article.appendChild(extra);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "button ghost";
        button.textContent = "Usar este taller";
        const value = `${workshop.name} · ${workshop.address}`;
        button.dataset.workshopValue = value;
        button.addEventListener("click", () => {
            selectWorkshopValue(value);
        });
        article.appendChild(button);

        container.appendChild(article);
    });
}

function updateWorkshopSelect(position) {
    const select = document.getElementById("workshop-select");
    if (!select) {
        return;
    }

    const previousValue = select.value;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona un taller cercano";
    select.appendChild(placeholder);

    const items = getWorkshopsSortedByDistance(position);
    items.forEach((workshop) => {
        const option = document.createElement("option");
        option.value = `${workshop.name} · ${workshop.address}`;
        option.textContent = position
            ? `${workshop.name} · ${formatDistance(workshop.distance)}`
            : `${workshop.name}`;
        option.dataset.address = workshop.address;
        option.dataset.workshopId = workshop.id;
        if (previousValue && previousValue === option.value) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function selectWorkshopValue(value) {
    const select = document.getElementById("workshop-select");
    const manualInput = document.getElementById("workshop-manual");

    if (!select || !manualInput) {
        return;
    }

    const option = Array.from(select.options).find((opt) => opt.value === value);
    if (option) {
        select.value = option.value;
        manualInput.value = "";
        manualInput.dispatchEvent(new Event("input"));
    } else {
        select.value = "";
        manualInput.value = value;
    }
}

function setVisitPanelsVisibility(visitType) {
    const presencialPanel = document.querySelector("[data-presencial-panel]");
    const domicilioPanel = document.querySelector("[data-domicilio-panel]");
    const domicilioAddress = document.getElementById("domicile-address");

    if (presencialPanel) {
        presencialPanel.hidden = visitType !== "presencial";
    }
    if (domicilioPanel) {
        domicilioPanel.hidden = visitType !== "domicilio";
    }
    if (domicilioAddress) {
        domicilioAddress.required = visitType === "domicilio";
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

        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = mechanics.length
            ? "Selecciona un mecánico disponible"
            : "No hay mecánicos disponibles en este momento";
        select.appendChild(placeholder);

        mechanics.forEach((mechanic) => {
            const option = document.createElement("option");
            option.value = String(mechanic.id);
            option.textContent = mechanic.name || mechanic.email;
            select.appendChild(option);
        });

        const selectedMechanicId = Number.parseInt(select.value, 10);
        if (Number.isInteger(selectedMechanicId) && selectedMechanicId > 0) {
            fetchUnavailableDates(selectedMechanicId);
        } else {
            fetchUnavailableDates(null);
        }

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
        if (helper) {
            helper.textContent =
                "No pudimos cargar los mecánicos disponibles. Intenta nuevamente en unos minutos.";
        }
    }
}

function requestUserLocation() {
    const detectButton = document.getElementById("detect-location");
    if (!navigator.geolocation) {
        updateLocationStatus("Tu navegador no soporta geolocalización.", "error");
        return;
    }

    if (detectButton) {
        detectButton.disabled = true;
    }
    updateLocationStatus("Solicitando tu ubicación...", null);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const coords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            locationState.coords = coords;
            updateHiddenLocationInputs(coords);
            updateLocationStatus("¡Ubicación detectada!", "success");
            updateWorkshopSelect(coords);
            renderWorkshopSuggestions(coords);
            if (detectButton) {
                detectButton.disabled = false;
            }
        },
        (error) => {
            console.error("No se pudo obtener la ubicación", error);
            let message = "No se pudo obtener tu ubicación.";
            if (error.code === error.PERMISSION_DENIED) {
                message = "No pudimos acceder a tu ubicación. Verifica los permisos en tu navegador.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                message = "La información de ubicación no está disponible en este momento.";
            } else if (error.code === error.TIMEOUT) {
                message = "La solicitud de ubicación tardó demasiado. Intenta nuevamente.";
            }
            updateLocationStatus(message, "error");
            if (detectButton) {
                detectButton.disabled = false;
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 12000,
        },
    );
}

function clearLocation() {
    locationState.coords = null;
    updateHiddenLocationInputs(null);
    updateLocationStatus(LOCATION_DEFAULT_MESSAGE, null);
    updateWorkshopSelect(null);
    renderWorkshopSuggestions(null);
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

function setupWorkshopInputs() {
    const select = document.getElementById("workshop-select");
    const manualInput = document.getElementById("workshop-manual");

    if (select) {
        select.addEventListener("change", () => {
            if (select.value && manualInput) {
                manualInput.value = "";
            }
        });
    }

    if (manualInput) {
        manualInput.addEventListener("input", () => {
            if (manualInput.value && select) {
                select.value = "";
            }
        });
    }
}

function setupMechanicAvailabilityListener() {
    const select = document.getElementById("mechanic-select");
    if (!select) {
        return;
    }

    select.addEventListener("change", () => {
        const mechanicId = Number.parseInt(select.value, 10);
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
        const workshopValue = normalizeText(formData.get("workshop"));
        const manualValue = normalizeText(formData.get("workshop-manual"));
        locationDetail = workshopValue || manualValue;
        if (!locationDetail) {
            showFormFeedback("Selecciona un taller o ingresa la dirección donde se realizará el servicio.", "error");
            return;
        }
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
            clientLatitude: locationState.coords?.lat ?? null,
            clientLongitude: locationState.coords?.lng ?? null,
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

        if (locationState.coords) {
            updateHiddenLocationInputs(locationState.coords);
        }
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
    setupWorkshopInputs();
    setupCalendar();
    setupMechanicAvailabilityListener();
    updateWorkshopSelect(null);
    renderWorkshopSuggestions(null);
    setupAuthVisibilityControls();
    fetchMechanics();

    const form = document.getElementById("appointment-form");
    if (form) {
        form.addEventListener("submit", submitAppointment);
    }

    const detectButton = document.getElementById("detect-location");
    if (detectButton) {
        detectButton.addEventListener("click", requestUserLocation);
    }

    const clearButton = document.getElementById("clear-location");
    if (clearButton) {
        clearButton.addEventListener("click", clearLocation);
    }

    updateLocationStatus(LOCATION_DEFAULT_MESSAGE, null);
    fetchUnavailableDates(null);
}

document.addEventListener("DOMContentLoaded", initializeAppointmentPage);
