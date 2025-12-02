function formatMemberSince(dateString) {
    if (!dateString) {
        return "";
    }

    try {
        const date = new Date(dateString);
        const formatter = new Intl.DateTimeFormat("es", {
            year: "numeric",
            month: "long",
        });
        return formatter.format(date);
    } catch (error) {
        console.error("No se pudo formatear la fecha", error);
        return dateString;
    }
}

function getAccountTypeLabel(accountType) {
    if (accountType === "mecanico") {
        return "Mecánico";
    }
    return "Cliente";
}

function getVisitTypeLabel(visitType) {
    if (visitType === "domicilio") {
        return "Visita a domicilio";
    }
    return "Presencial en taller";
}

function getStatusLabel(status) {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";

    switch (normalized) {
        case "confirmado":
            return "Confirmado";
        case "completado":
            return "Completado";
        case "cancelado":
            return "Cancelado";
        case "rechazado":
            return "Rechazado";
        default:
            return "Pendiente";
    }
}

function getStatusClass(status) {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";

    switch (normalized) {
        case "completado":
        case "confirmado":
            return "success";
        case "cancelado":
        case "rechazado":
            return "cancelled";
        default:
            return "pending";
    }
}

function canRequestBeCompleted(request) {
    if (!request) {
        return false;
    }

    const normalized = typeof request.status === "string" ? request.status.toLowerCase() : "";
    if (normalized !== "confirmado") {
        return false;
    }

    if (!request.scheduledFor) {
        return true;
    }

    const scheduledDate = new Date(request.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
        return true;
    }

    return scheduledDate.getTime() <= Date.now();
}

function canClientUpdateAppointment(record) {
    if (!record) {
        return false;
    }

    const normalized = typeof record.status === "string" ? record.status.toLowerCase() : "";
    return !["cancelado", "completado", "rechazado"].includes(normalized);
}

function getPartnerLabel(record) {
    if (record?.workshop?.name) {
        return record.workshop.name;
    }
    if (record?.mechanic?.name) {
        return record.mechanic.name;
    }
    return "Taller";
}

function parseDate(dateString) {
    if (!dateString) {
        return null;
    }

    try {
        const normalized = typeof dateString === "string" ? dateString.trim() : dateString;
        const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

        if (typeof normalized === "string" && dateOnlyPattern.test(normalized)) {
            const [year, month, day] = normalized.split("-").map((part) => Number.parseInt(part, 10));
            const date = new Date(year, month - 1, day);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.error("No se pudo interpretar la fecha", error);
        return null;
    }
}

function formatDateTime(dateString) {
    const date = parseDate(dateString);
    if (!date) {
        return "";
    }

    try {
        return new Intl.DateTimeFormat("es", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
    } catch (error) {
        console.error("No se pudo formatear la fecha y hora", error);
        return String(dateString || "");
    }
}

function formatDate(dateString) {
    const date = parseDate(dateString);
    if (!date) {
        return "";
    }

    try {
        return new Intl.DateTimeFormat("es", {
            dateStyle: "long",
        }).format(date);
    } catch (error) {
        console.error("No se pudo formatear la fecha", error);
        return String(dateString || "");
    }
}

function formatDateInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseSlotValue(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = value.trim().match(/^(\d{2}):(\d{2})/);
    if (!match) {
        return null;
    }

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return null;
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getInitials(name) {
    if (!name) {
        return "";
    }

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural;
}

function readPersistedIds(storageKey) {
    if (typeof window === "undefined" || !window.localStorage) {
        return [];
    }

    try {
        const storedValue = window.localStorage.getItem(storageKey);
        if (!storedValue) {
            return [];
        }

        const parsed = JSON.parse(storedValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((value) => (value == null ? "" : String(value)))
            .filter((value) => value.length > 0);
    } catch (error) {
        console.error("No se pudieron recuperar los elementos ocultos almacenados.", error);
        return [];
    }
}

function persistIds(storageKey, values) {
    if (typeof window === "undefined" || !window.localStorage) {
        return;
    }

    try {
        const serialized = JSON.stringify(Array.from(values));
        window.localStorage.setItem(storageKey, serialized);
    } catch (error) {
        console.error("No se pudieron guardar los elementos ocultos.", error);
    }
}

function parseTextList(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/[,\n]/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
}

function formatListForTextarea(values) {
    if (!Array.isArray(values) || !values.length) {
        return "";
    }

    return values.join("\n");
}

function updateMessage(element, message, type = "info") {
    if (!element) {
        return;
    }

    const text = message ? String(message) : "";
    element.textContent = text;
    element.hidden = text.length === 0;
    element.classList.remove("info", "success", "error");

    if (text) {
        element.classList.add(type);
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!(file instanceof File)) {
            resolve("");
            return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            resolve(typeof reader.result === "string" ? reader.result : "");
        });
        reader.addEventListener("error", () => {
            reject(reader.error || new Error("No se pudo leer el archivo seleccionado."));
        });
        reader.readAsDataURL(file);
    });
}

const workshopState = {
    id: null,
    data: null,
    loaded: false,
    loading: false,
};

let currentProfile = null;
const DISMISSED_HISTORY_STORAGE_KEY = "profile.dismissedHistory";
const dismissedHistoryIds = new Set(readPersistedIds(DISMISSED_HISTORY_STORAGE_KEY));
const DEFAULT_MECHANIC_EMPTY_MESSAGE =
    "No tienes solicitudes pendientes por ahora. Cuando un cliente agende contigo aparecerá aquí.";
const DEFAULT_TIME_SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

let clientHistoryRecords = [];
let mechanicRequestRecords = [];
const completionDialogState = {
    container: null,
    confirmButton: null,
    cancelButton: null,
    detailsElement: null,
    feedbackElement: null,
    priceInput: null,
    helperElement: null,
    requestId: null,
    triggerButton: null,
    busy: false,
};

const appointmentDialogState = {
    record: null,
    container: null,
    helper: null,
    status: null,
    title: null,
    schedule: null,
    type: null,
    address: null,
    partner: null,
    reason: null,
    reschedule: null,
    cancelButton: null,
    rescheduleButton: null,
};

const rescheduleDialogState = {
    container: null,
    form: null,
    reason: null,
    date: null,
    slot: null,
    feedback: null,
    submit: null,
    helperDate: null,
    helperSlot: null,
    appointmentId: null,
    mechanicId: null,
    unavailableDays: new Set(),
};

const MIN_COMPLETION_PRICE = 20;

const cancelDialogState = {
    container: null,
    details: null,
    feedback: null,
    confirm: null,
    close: null,
};

function setCompletionDialogFeedback(message, type = "info") {
    const { feedbackElement } = completionDialogState;
    if (!feedbackElement) {
        return;
    }

    if (!message) {
        feedbackElement.textContent = "";
        feedbackElement.hidden = true;
        feedbackElement.dataset.state = "";
        return;
    }

    feedbackElement.textContent = message;
    feedbackElement.hidden = false;
    feedbackElement.dataset.state = type;
}

function setCompletionDialogBusy(busy) {
    completionDialogState.busy = busy;

    const { confirmButton, cancelButton, container, priceInput } = completionDialogState;

    if (confirmButton) {
        confirmButton.disabled = busy;
    }

    if (cancelButton) {
        cancelButton.disabled = busy;
    }

    if (priceInput) {
        priceInput.disabled = busy;
    }

    if (container) {
        if (busy) {
            container.dataset.state = "busy";
        } else {
            container.removeAttribute("data-state");
        }
    }
}

function closeCompletionDialog() {
    const { container } = completionDialogState;
    if (!container) {
        return;
    }

    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    setCompletionDialogBusy(false);
    setCompletionDialogFeedback("");

    if (completionDialogState.detailsElement) {
        completionDialogState.detailsElement.textContent = "";
        completionDialogState.detailsElement.hidden = true;
    }

    if (completionDialogState.priceInput) {
        completionDialogState.priceInput.value = "";
    }

    if (completionDialogState.helperElement) {
        completionDialogState.helperElement.textContent =
            "Ingresa el valor final cobrado al cliente (mínimo $20).";
    }

    const trigger = completionDialogState.triggerButton;
    completionDialogState.requestId = null;
    completionDialogState.triggerButton = null;

    if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
    }
}

function openCompletionDialog(request, triggerButton) {
    const { container, confirmButton, detailsElement } = completionDialogState;

    if (!container || !request) {
        return;
    }

    completionDialogState.requestId = request.id != null ? String(request.id) : null;
    completionDialogState.triggerButton = triggerButton || null;
    setCompletionDialogBusy(false);
    setCompletionDialogFeedback("");

    if (detailsElement) {
        const details = [];
        if (request.service) {
            details.push(`Servicio: ${request.service}`);
        }

        const formattedDate = formatDateTime(request.scheduledFor);
        if (formattedDate) {
            details.push(`Fecha: ${formattedDate}`);
        }

        if (details.length) {
            detailsElement.textContent = details.join(" · ");
            detailsElement.hidden = false;
        } else {
            detailsElement.textContent = "";
            detailsElement.hidden = true;
        }
    }

    container.hidden = false;
    container.setAttribute("aria-hidden", "false");

    if (typeof container.focus === "function") {
        container.focus();
    }

    if (completionDialogState.priceInput && typeof completionDialogState.priceInput.focus === "function") {
        completionDialogState.priceInput.focus();
    } else if (confirmButton && typeof confirmButton.focus === "function") {
        confirmButton.focus();
    }
}

async function updateMechanicRequestStatus(requestId, status, extra = {}) {
    if (!requestId) {
        throw new Error("Identificador de solicitud no válido.");
    }

    const response = await fetch(`/api/appointments/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status, ...extra }),
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    if (response.status === 403) {
        throw new Error("No tienes permisos para actualizar esta solicitud.");
    }

    if (response.status === 404) {
        throw new Error("No encontramos la solicitud que intentas actualizar.");
    }

    if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error || "No se pudo actualizar la solicitud.";
        throw new Error(message);
    }

    const data = await response.json();
    return data?.request || null;
}

async function refreshMechanicMetrics() {
    if (!currentProfile || currentProfile.accountType !== "mecanico") {
        return;
    }

    try {
        const updatedProfile = await fetchProfile();
        if (!updatedProfile) {
            return;
        }

        currentProfile = {
            ...currentProfile,
            ...updatedProfile,
        };

        renderCompletedAppointmentsMetric(true, updatedProfile.mechanicMetrics || null);
    } catch (error) {
        console.error("No se pudieron actualizar las métricas del mecánico", error);
    }
}

async function handleCompleteRequestConfirmation() {
    if (!completionDialogState.requestId || completionDialogState.busy) {
        return;
    }

    setCompletionDialogBusy(true);
    setCompletionDialogFeedback("Finalizando cita...", "info");

    const priceValue = completionDialogState.priceInput
        ? Number.parseFloat(completionDialogState.priceInput.value)
        : Number.NaN;

    if (!Number.isFinite(priceValue) || priceValue < MIN_COMPLETION_PRICE) {
        setCompletionDialogFeedback(
            `Ingresa un precio válido (mínimo $${MIN_COMPLETION_PRICE.toFixed(2)}) para finalizar la cita.`,
            "error",
        );
        setCompletionDialogBusy(false);
        return;
    }

    try {
        const updatedRequest = await updateMechanicRequestStatus(
            completionDialogState.requestId,
            "completado",
            { finalPrice: priceValue },
        );

        if (!updatedRequest) {
            throw new Error("No se pudo completar la cita.");
        }

        let refreshedRequests = null;
        try {
            refreshedRequests = await fetchMechanicRequests();
        } catch (requestsError) {
            console.error(requestsError);
            refreshedRequests = mechanicRequestRecords.map((item) => {
                if (!item || item.id !== updatedRequest.id) {
                    return item;
                }

                return {
                    ...item,
                    ...updatedRequest,
                };
            });
        }

        if (refreshedRequests) {
            renderMechanicRequests(refreshedRequests);
        }

        await refreshMechanicMetrics();

        setCompletionDialogFeedback("La cita se marcó como completada.", "success");

        window.setTimeout(() => {
            closeCompletionDialog();
        }, 900);
    } catch (error) {
        console.error(error);
        setCompletionDialogFeedback(
            error instanceof Error
                ? error.message
                : "No se pudo completar la cita. Inténtalo nuevamente más tarde.",
            "error",
        );
        setCompletionDialogBusy(false);
    }
}

function setupCompletionDialog() {
    const container = document.querySelector("[data-complete-dialog]");
    if (!container) {
        return;
    }

    const confirmButton = container.querySelector("[data-complete-confirm]");
    const cancelButton = container.querySelector("[data-complete-cancel]");
    const detailsElement = container.querySelector("[data-complete-details]");
    const feedbackElement = container.querySelector("[data-complete-feedback]");
    const priceInput = container.querySelector("[data-complete-price]");
    const helperElement = container.querySelector("[data-complete-helper]");

    completionDialogState.container = container;
    completionDialogState.confirmButton = confirmButton;
    completionDialogState.cancelButton = cancelButton;
    completionDialogState.detailsElement = detailsElement;
    completionDialogState.feedbackElement = feedbackElement;
    completionDialogState.priceInput = priceInput;
    completionDialogState.helperElement = helperElement;

    if (priceInput) {
        priceInput.min = String(MIN_COMPLETION_PRICE);
    }

    if (detailsElement) {
        detailsElement.hidden = true;
    }

    container.hidden = true;
    container.setAttribute("aria-hidden", "true");

    if (confirmButton) {
        confirmButton.addEventListener("click", handleCompleteRequestConfirmation);
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            if (!completionDialogState.busy) {
                closeCompletionDialog();
            }
        });
    }

    container.addEventListener("click", (event) => {
        if (event.target === container && !completionDialogState.busy) {
            closeCompletionDialog();
        }
    });

    container.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !completionDialogState.busy) {
            closeCompletionDialog();
        }
    });
}

async function fetchProfile() {
    const response = await fetch("/api/profile");
    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    if (!response.ok) {
        throw new Error("No se pudo obtener el perfil");
    }

    return response.json();
}

function renderProfile(profile) {
    const nameElement = document.querySelector("[data-profile-name]");
    const avatarElement = document.querySelector("[data-profile-avatar]");
    const roleElement = document.querySelector("[data-profile-role]");
    const emailElement = document.querySelector("[data-profile-email]");
    const memberSinceElement = document.querySelector("[data-profile-member-since]");

    if (nameElement) {
        nameElement.textContent = profile.name || "Usuario";
    }

    if (avatarElement) {
        avatarElement.textContent = getInitials(profile.name || "");
    }

    if (roleElement) {
        roleElement.textContent = getAccountTypeLabel(profile.accountType);
    }

    if (emailElement) {
        emailElement.textContent = profile.email || "";
    }

    if (memberSinceElement) {
        memberSinceElement.textContent = formatMemberSince(profile.createdAt);
    }
}

function toggleMechanicSection(visible) {
    const mechanicSection = document.querySelector("[data-mechanic-section]");
    if (!mechanicSection) {
        return;
    }
    mechanicSection.hidden = !visible;
}

function toggleAudienceSections(isMechanic) {
    const sections = document.querySelectorAll("[data-visible-for]");
    sections.forEach((section) => {
        const audience = section.dataset.visibleFor;
        if (audience === "mecanico") {
            section.hidden = !isMechanic;
        } else if (audience === "cliente") {
            section.hidden = isMechanic;
        }
    });
}

function renderMechanicRequests(requests, { errorMessage } = {}) {
    const container = document.querySelector("[data-mechanic-requests]");
    const emptyState = document.querySelector("[data-mechanic-empty]");

    if (!container) {
        return;
    }

    const normalizedRequests = Array.isArray(requests) ? requests : [];
    mechanicRequestRecords = normalizedRequests;

    const visibleRequests = normalizedRequests;

    if (!visibleRequests.length) {
        container.innerHTML = "";
        if (emptyState) {
            emptyState.textContent = errorMessage || DEFAULT_MECHANIC_EMPTY_MESSAGE;
            emptyState.hidden = false;
        }
        return;
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    const fragment = document.createDocumentFragment();

    visibleRequests.forEach((request) => {
        const article = document.createElement("article");
        article.className = "request-card";

        const header = document.createElement("div");
        header.className = "request-header";

        const title = document.createElement("h3");
        title.textContent = request.service || "Servicio solicitado";
        header.appendChild(title);

        const headerActions = document.createElement("div");
        headerActions.className = "request-header-actions";

        const status = document.createElement("span");
        status.className = "request-status";
        status.textContent = getStatusLabel(request.status);
        const statusClass = getStatusClass(request.status);
        if (statusClass) {
            status.classList.add(statusClass);
        }
        headerActions.appendChild(status);

        const dismissButton = document.createElement("button");
        dismissButton.type = "button";
        dismissButton.className = "request-dismiss";
        dismissButton.innerHTML = "<span aria-hidden=\"true\">×</span>";
        dismissButton.setAttribute("aria-label", "Ocultar solicitud de la lista");

        dismissButton.addEventListener("click", async () => {
            const requestId = request?.id != null ? String(request.id) : "";
            if (!requestId || dismissButton.disabled) {
                return;
            }

            dismissButton.disabled = true;

            try {
                await dismissMechanicRequest(requestId);
                mechanicRequestRecords = mechanicRequestRecords.filter((item) => {
                    return item?.id != null ? String(item.id) !== requestId : true;
                });
                article.remove();

                if (emptyState) {
                    const hasVisibleRequests = container.querySelector(".request-card");
                    emptyState.textContent = DEFAULT_MECHANIC_EMPTY_MESSAGE;
                    emptyState.hidden = Boolean(hasVisibleRequests);
                }
            } catch (error) {
                console.error(error);
                window.alert(
                    error instanceof Error
                        ? error.message
                        : "No se pudo ocultar la solicitud. Intenta nuevamente.",
                );
                dismissButton.disabled = false;
            }
        });

        headerActions.appendChild(dismissButton);
        header.appendChild(headerActions);

        article.appendChild(header);

        const meta = document.createElement("div");
        meta.className = "request-meta";

        const clientName = request?.client?.name || "Cliente";
        const clientEmail = request?.client?.email || "";

        const metaItems = [
            `${getVisitTypeLabel(request.visitType)}`,
            formatDateTime(request.scheduledFor),
            request.address || "Sin dirección",
            clientEmail ? `${clientName} · ${clientEmail}` : clientName,
        ];

        if (request.clientLocation && request.clientLocation.latitude !== null && request.clientLocation.longitude !== null) {
            const { latitude, longitude } = request.clientLocation;
            metaItems.push(`Ubicación aproximada: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }

        metaItems
            .filter(Boolean)
            .forEach((item) => {
                const span = document.createElement("span");
                span.textContent = item;
                meta.appendChild(span);
            });

        article.appendChild(meta);

        if (request.notes) {
            const notes = document.createElement("p");
            notes.className = "request-notes";
            notes.textContent = request.notes;
            article.appendChild(notes);
        }

        const actions = document.createElement("div");
        actions.className = "request-actions";

        const viewButton = document.createElement("a");
        viewButton.className = "button ghost";
        viewButton.textContent = "Ver más";
        viewButton.href = `./solicitud.html?id=${encodeURIComponent(request.id)}`;
        viewButton.setAttribute(
            "aria-label",
            `Ver detalles de la solicitud ${request.service || "de servicio"}`,
        );

        if (canRequestBeCompleted(request)) {
            const completeButton = document.createElement("button");
            completeButton.type = "button";
            completeButton.className = "button button--primary";
            completeButton.textContent = "Cita finalizada";
            completeButton.addEventListener("click", () => {
                openCompletionDialog(request, completeButton);
            });
            actions.appendChild(completeButton);
        }

        actions.appendChild(viewButton);
        article.appendChild(actions);

        fragment.appendChild(article);
    });

    container.innerHTML = "";
    container.appendChild(fragment);
}

function renderClientHistory(history, { errorMessage } = {}) {
    const container = document.querySelector("[data-client-history]");
    const emptyState = document.querySelector("[data-client-history-empty]");

    if (!container) {
        return;
    }

    clientHistoryRecords = Array.isArray(history) ? history : [];

    const availableHistoryIds = new Set(
        clientHistoryRecords
            .map((record) => (record?.id !== null && record?.id !== undefined ? String(record.id) : ""))
            .filter((recordId) => recordId.length > 0),
    );

    let removedStoredHistory = false;
    dismissedHistoryIds.forEach((storedId) => {
        if (!availableHistoryIds.has(storedId)) {
            dismissedHistoryIds.delete(storedId);
            removedStoredHistory = true;
        }
    });

    if (removedStoredHistory) {
        persistIds(DISMISSED_HISTORY_STORAGE_KEY, dismissedHistoryIds);
    }

    const records = clientHistoryRecords.filter((record) => {
        const recordId = record?.id;
        if (recordId === null || recordId === undefined) {
            return true;
        }

        const normalizedId = String(recordId);
        return !dismissedHistoryIds.has(normalizedId);
    });

    if (!records.length) {
        container.innerHTML = "";
        if (emptyState) {
            const hasOriginalRecords = clientHistoryRecords.length > 0;
            emptyState.textContent =
                errorMessage ||
                (hasOriginalRecords
                    ? "Has ocultado todas las visitas de tu historial en esta sesión."
                    : "Aún no tienes visitas registradas. Agenda una cita para ver tu historial.");
            emptyState.hidden = false;
        }
        return;
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    const fragment = document.createDocumentFragment();

    records.forEach((record) => {
        const article = document.createElement("article");
        article.className = "history-item";

        const info = document.createElement("div");

        const title = document.createElement("h3");
        const workshopName = record?.workshop?.name ? String(record.workshop.name).trim() : "";
        const mechanicName = record?.mechanic?.name ? String(record.mechanic.name).trim() : "";
        title.textContent = workshopName || mechanicName || "Visita al taller";
        info.appendChild(title);

        const metaParts = [];

        if (record?.service) {
            metaParts.push(String(record.service));
        }

        const formattedDate = formatDate(record?.scheduledFor);
        if (formattedDate) {
            metaParts.push(formattedDate);
        }

        if (record?.visitType) {
            metaParts.push(getVisitTypeLabel(record.visitType));
        }

        const locationDetail = record?.workshop?.address || record?.address;
        if (locationDetail) {
            metaParts.push(String(locationDetail));
        }

        if (metaParts.length) {
            const meta = document.createElement("p");
            meta.className = "item-meta";
            meta.textContent = metaParts.filter(Boolean).join(" · ");
            info.appendChild(meta);
        }

        const normalizedStatus = typeof record?.status === "string" ? record.status.toLowerCase() : "";
        const rawReason =
            typeof record?.rejectionReason === "string"
                ? record.rejectionReason
                : typeof record?.rejection_reason === "string"
                  ? record.rejection_reason
                  : typeof record?.reason === "string"
                      ? record.reason
                      : "";
        const reasonText = rawReason.trim();

        if (reasonText) {
            const reasonDetail = document.createElement("p");
            reasonDetail.className = "history-rejection-reason";
            const prefix = normalizedStatus === "rechazado" ? "Motivo del rechazo" : "Mensaje del taller";
            reasonDetail.textContent = `${prefix}: ${reasonText}`;
            info.appendChild(reasonDetail);
        }

        if (record?.rescheduleReason) {
            const rescheduleDetail = document.createElement("p");
            rescheduleDetail.className = "history-reschedule";
            rescheduleDetail.textContent = `Solicitud de cambio: ${record.rescheduleReason}`;
            info.appendChild(rescheduleDetail);
        }

        article.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const statusWrapper = document.createElement("div");
        statusWrapper.className = "history-status";

        const statusBadge = document.createElement("span");
        const statusClass = getStatusClass(record?.status);
        statusBadge.className = `status ${statusClass}`;
        statusBadge.textContent = getStatusLabel(record?.status);
        statusWrapper.appendChild(statusBadge);

        actions.appendChild(statusWrapper);

        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "button ghost";
        viewButton.textContent = "Ver más";
        viewButton.addEventListener("click", () => {
            openAppointmentDialog(record);
        });
        actions.appendChild(viewButton);

        const recordId = record?.id;
        if (recordId !== null && recordId !== undefined) {
            const normalizedId = String(recordId);
            const dismissButton = document.createElement("button");
            dismissButton.type = "button";
            dismissButton.className = "history-dismiss";
            dismissButton.innerHTML = '<span aria-hidden="true">×</span>';
            dismissButton.setAttribute("aria-label", "Ocultar visita del historial");
            dismissButton.addEventListener("click", () => {
                dismissedHistoryIds.add(normalizedId);
                persistIds(DISMISSED_HISTORY_STORAGE_KEY, dismissedHistoryIds);
                renderClientHistory(clientHistoryRecords);
            });
            actions.appendChild(dismissButton);
        }

        article.appendChild(actions);

        fragment.appendChild(article);
    });

    container.innerHTML = "";
    container.appendChild(fragment);
}

function updateHistoryRecord(updatedRecord) {
    const recordId = updatedRecord?.id;
    if (recordId === null || recordId === undefined) {
        return;
    }

    const normalizedId = String(recordId);
    let replaced = false;

    clientHistoryRecords = clientHistoryRecords.map((record) => {
        const currentId = record?.id !== null && record?.id !== undefined ? String(record.id) : "";
        if (currentId && currentId === normalizedId) {
            replaced = true;
            return { ...record, ...updatedRecord };
        }
        return record;
    });

    if (!replaced) {
        clientHistoryRecords = [updatedRecord, ...clientHistoryRecords];
    }

    renderClientHistory(clientHistoryRecords);
}

function toggleAppointmentDialog(visible) {
    if (!appointmentDialogState.container) {
        return;
    }
    appointmentDialogState.container.hidden = !visible;
    if (!visible) {
        appointmentDialogState.record = null;
    }
}

function toggleCancelDialog(visible) {
    if (!cancelDialogState.container) {
        return;
    }
    cancelDialogState.container.hidden = !visible;
    if (!visible && cancelDialogState.feedback) {
        cancelDialogState.feedback.hidden = true;
    }
}

function toggleRescheduleDialog(visible) {
    if (!rescheduleDialogState.container) {
        return;
    }
    rescheduleDialogState.container.hidden = !visible;
    if (!visible && rescheduleDialogState.feedback) {
        rescheduleDialogState.feedback.hidden = true;
        rescheduleDialogState.feedback.textContent = "";
    }
}

function populateAppointmentDialog(record) {
    if (!record || !appointmentDialogState.container) {
        return;
    }

    appointmentDialogState.record = record;

    if (appointmentDialogState.title) {
        const workshopName = record?.workshop?.name || "";
        const mechanicName = record?.mechanic?.name || "";
        appointmentDialogState.title.textContent = record.service || workshopName || mechanicName || "Detalle de la cita";
    }

    if (appointmentDialogState.status) {
        const statusText = getStatusLabel(record.status);
        appointmentDialogState.status.textContent = statusText;
        appointmentDialogState.status.className = `status ${getStatusClass(record.status)}`;
    }

    if (appointmentDialogState.schedule) {
        appointmentDialogState.schedule.textContent = formatDateTime(record.scheduledFor) || "Sin fecha definida";
    }

    if (appointmentDialogState.type) {
        appointmentDialogState.type.textContent = getVisitTypeLabel(record.visitType);
    }

    if (appointmentDialogState.address) {
        appointmentDialogState.address.textContent = record.address || "Sin dirección";
    }

    if (appointmentDialogState.partner) {
        appointmentDialogState.partner.textContent = getPartnerLabel(record);
    }

    if (appointmentDialogState.reason) {
        appointmentDialogState.reason.hidden = !record?.rejectionReason;
        appointmentDialogState.reason.textContent = record?.rejectionReason
            ? `Mensaje del taller: ${record.rejectionReason}`
            : "";
    }

    if (appointmentDialogState.reschedule) {
        const hasReschedule = Boolean(record?.rescheduleReason || record?.rescheduleRequestedAt);
        appointmentDialogState.reschedule.hidden = !hasReschedule;
        appointmentDialogState.reschedule.textContent = hasReschedule
            ? `Solicitud de reagendamiento: ${record.rescheduleReason}`
            : "";
    }

    const canModify = canClientUpdateAppointment(record);
    if (appointmentDialogState.helper) {
        appointmentDialogState.helper.hidden = canModify;
        appointmentDialogState.helper.textContent = canModify
            ? ""
            : "Las citas finalizadas, canceladas o rechazadas ya no se pueden modificar.";
    }

    if (appointmentDialogState.cancelButton) {
        appointmentDialogState.cancelButton.disabled = !canModify;
    }

    if (appointmentDialogState.rescheduleButton) {
        const hasMechanic = record?.mechanic?.id || record?.workshop?.id;
        appointmentDialogState.rescheduleButton.disabled = !canModify || !hasMechanic;
    }
}

function openAppointmentDialog(record) {
    populateAppointmentDialog(record);
    toggleAppointmentDialog(true);
}

function handleAppointmentDialogClose() {
    toggleAppointmentDialog(false);
}

async function handleCancelAppointment() {
    const record = appointmentDialogState.record;
    const appointmentId = record?.id;

    if (!cancelDialogState.details || !appointmentId) {
        return;
    }

    if (cancelDialogState.feedback) {
        cancelDialogState.feedback.hidden = true;
        cancelDialogState.feedback.textContent = "";
    }
    cancelDialogState.details.textContent = formatDateTime(record?.scheduledFor)
        ? `${record?.service || "Cita"} · ${formatDateTime(record?.scheduledFor)}`
        : record?.service || "Cita";

    toggleCancelDialog(true);
}

function setCancelFeedback(message, tone = "info") {
    if (!cancelDialogState.feedback) {
        return;
    }
    cancelDialogState.feedback.textContent = message || "";
    cancelDialogState.feedback.hidden = !message;
    cancelDialogState.feedback.dataset.state = tone;
}

async function confirmCancelAppointment() {
    const appointmentId = appointmentDialogState.record?.id;
    if (!appointmentId || !cancelDialogState.confirm) {
        return;
    }

    cancelDialogState.confirm.disabled = true;
    setCancelFeedback("Cancelando cita...", "info");

    try {
        const updated = await cancelAppointmentRequest(appointmentId);
        if (updated) {
            updateHistoryRecord(updated);
            populateAppointmentDialog(updated);
            setCancelFeedback("Tu cita se canceló correctamente.", "success");
            setTimeout(() => {
                toggleCancelDialog(false);
                toggleAppointmentDialog(false);
            }, 600);
        }
    } catch (error) {
        console.error(error);
        setCancelFeedback(
            error instanceof Error ? error.message : "No pudimos cancelar tu cita. Inténtalo nuevamente.",
            "error",
        );
    } finally {
        cancelDialogState.confirm.disabled = false;
    }
}

function setRescheduleFeedback(message, tone = "info") {
    if (!rescheduleDialogState.feedback) {
        return;
    }
    rescheduleDialogState.feedback.textContent = message || "";
    rescheduleDialogState.feedback.hidden = !message;
    rescheduleDialogState.feedback.dataset.state = tone;
}

function resetRescheduleForm() {
    if (rescheduleDialogState.reason) {
        rescheduleDialogState.reason.value = "";
    }
    if (rescheduleDialogState.date) {
        rescheduleDialogState.date.value = "";
    }
    if (rescheduleDialogState.slot) {
        rescheduleDialogState.slot.innerHTML = '<option value="">Selecciona una hora</option>';
    }
}

async function loadUnavailableDays(mechanicId) {
    if (!mechanicId) {
        return new Set();
    }

    const params = new URLSearchParams({ mechanicId: String(mechanicId) });
    const response = await fetch(`/api/appointments/unavailable-days?${params.toString()}`, {
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return new Set();
    }

    if (!response.ok) {
        throw new Error("No pudimos cargar el calendario del mecánico.");
    }

    const data = await response.json();
    const unavailable = Array.isArray(data?.unavailableDays) ? data.unavailableDays : [];
    return new Set(unavailable);
}

async function loadUnavailableSlots({ mechanicId, date }) {
    if (!mechanicId || !date) {
        return new Set();
    }

    const params = new URLSearchParams({ mechanicId: String(mechanicId), date });
    const response = await fetch(`/api/appointments/unavailable-slots?${params.toString()}`, {
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return new Set();
    }

    if (!response.ok) {
        throw new Error("No pudimos obtener los horarios disponibles.");
    }

    const data = await response.json();
    const unavailableSlots = Array.isArray(data?.unavailableSlots) ? data.unavailableSlots : [];
    const normalized = unavailableSlots
        .map((slot) => parseSlotValue(typeof slot === "string" ? slot.slice(0, 5) : ""))
        .filter(Boolean);
    return new Set(normalized);
}

async function updateRescheduleSlots() {
    if (!rescheduleDialogState.date || !rescheduleDialogState.slot) {
        return;
    }

    const selectedDateValue = rescheduleDialogState.date.value;
    if (!selectedDateValue) {
        rescheduleDialogState.slot.innerHTML = '<option value="">Selecciona una hora</option>';
        setRescheduleFeedback("Selecciona una fecha para ver los horarios disponibles.", "info");
        return;
    }

    const parsedDate = parseDate(selectedDateValue);
    if (!(parsedDate instanceof Date)) {
        setRescheduleFeedback("Selecciona una fecha válida.", "error");
        return;
    }

    const weekday = parsedDate.getDay();
    if (weekday === 0 || weekday === 6) {
        setRescheduleFeedback("El taller atiende de lunes a viernes. Selecciona otro día.", "error");
        rescheduleDialogState.slot.innerHTML = '<option value="">Sin horarios</option>';
        return;
    }

    const dateKey = formatDateInputValue(parsedDate);
    if (rescheduleDialogState.unavailableDays.has(dateKey)) {
        setRescheduleFeedback("Este día ya no tiene cupos disponibles. Elige otra fecha.", "error");
        rescheduleDialogState.slot.innerHTML = '<option value="">Sin horarios</option>';
        return;
    }

    setRescheduleFeedback("Cargando horarios disponibles...", "info");

    try {
        const unavailableSlots = await loadUnavailableSlots({
            mechanicId: rescheduleDialogState.mechanicId,
            date: dateKey,
        });
        const availableSlots = DEFAULT_TIME_SLOTS.filter((slot) => !unavailableSlots.has(slot));

        if (!availableSlots.length) {
            rescheduleDialogState.slot.innerHTML = '<option value="">Sin horarios</option>';
            setRescheduleFeedback("No quedan horarios para este día. Elige otra fecha.", "error");
            return;
        }

        const fragment = document.createDocumentFragment();
        fragment.appendChild(new Option("Selecciona una hora", ""));
        availableSlots.forEach((slot) => {
            fragment.appendChild(new Option(slot, slot));
        });
        rescheduleDialogState.slot.innerHTML = "";
        rescheduleDialogState.slot.appendChild(fragment);
        setRescheduleFeedback("Selecciona la hora que más te acomode.", "info");
    } catch (error) {
        console.error(error);
        setRescheduleFeedback(
            error instanceof Error ? error.message : "No pudimos cargar los horarios. Intenta nuevamente.",
            "error",
        );
    }
}

async function openRescheduleDialog() {
    const record = appointmentDialogState.record;
    const mechanicId = record?.mechanic?.id;

    if (!record || !mechanicId) {
        return;
    }

    rescheduleDialogState.appointmentId = record.id || null;
    rescheduleDialogState.mechanicId = mechanicId;
    rescheduleDialogState.unavailableDays = new Set();

    if (rescheduleDialogState.reason) {
        rescheduleDialogState.reason.value = record?.rescheduleReason || "";
    }

    if (rescheduleDialogState.date) {
        const today = new Date();
        const minValue = formatDateInputValue(today);
        rescheduleDialogState.date.min = minValue;
        rescheduleDialogState.date.value = "";
    }

    if (rescheduleDialogState.slot) {
        rescheduleDialogState.slot.innerHTML = '<option value="">Selecciona una hora</option>';
    }

    setRescheduleFeedback("Cargando disponibilidad...", "info");
    toggleRescheduleDialog(true);

    try {
        rescheduleDialogState.unavailableDays = await loadUnavailableDays(mechanicId);
        setRescheduleFeedback("Selecciona la fecha y hora que prefieras.", "info");
    } catch (error) {
        console.error(error);
        setRescheduleFeedback(
            error instanceof Error ? error.message : "No pudimos cargar la disponibilidad. Inténtalo más tarde.",
            "error",
        );
    }
}

async function handleRescheduleSubmit(event) {
    event.preventDefault();

    const appointmentId = rescheduleDialogState.appointmentId;
    if (!appointmentId || !rescheduleDialogState.form) {
        return;
    }

    const reason = rescheduleDialogState.reason?.value.trim() || "";
    const dateValue = rescheduleDialogState.date?.value || "";
    const slotValue = rescheduleDialogState.slot?.value || "";

    if (!reason) {
        setRescheduleFeedback("Describe el motivo del reagendamiento.", "error");
        rescheduleDialogState.reason?.focus();
        return;
    }

    if (!dateValue) {
        setRescheduleFeedback("Selecciona la nueva fecha para tu cita.", "error");
        rescheduleDialogState.date?.focus();
        return;
    }

    if (!slotValue) {
        setRescheduleFeedback("Elige la hora disponible que prefieras.", "error");
        rescheduleDialogState.slot?.focus();
        return;
    }

    const submitButton = rescheduleDialogState.submit;
    if (submitButton) {
        submitButton.disabled = true;
    }
    setRescheduleFeedback("Enviando solicitud de reagendamiento...", "info");

    try {
        const updated = await rescheduleAppointmentRequest(appointmentId, {
            reason,
            date: dateValue,
            slot: slotValue,
        });

        if (updated) {
            updateHistoryRecord(updated);
            populateAppointmentDialog(updated);
            setRescheduleFeedback(
                "Tu solicitud fue enviada. Deberás esperar la confirmación del mecánico.",
                "success",
            );
            setTimeout(() => {
                toggleRescheduleDialog(false);
            }, 800);
        }
    } catch (error) {
        console.error(error);
        setRescheduleFeedback(
            error instanceof Error
                ? error.message
                : "No pudimos enviar tu solicitud de reagendamiento. Inténtalo nuevamente.",
            "error",
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

function renderCompletedAppointmentsMetric(isMechanic, metrics) {
    const card = document.querySelector("[data-profile-completed-appointments-card]");
    if (!card) {
        return;
    }

    const valueElement = card.querySelector("[data-profile-completed-appointments-value]");
    const captionElement = card.querySelector("[data-profile-completed-appointments-caption]");

    if (!isMechanic) {
        if (valueElement) {
            valueElement.textContent = "0";
        }
        if (captionElement) {
            captionElement.textContent = "En los últimos 12 meses";
        }
        card.removeAttribute("aria-label");
        return;
    }

    const completedLast12Months = Number(metrics?.completedAppointmentsLast12Months ?? 0);
    const completedTotal = Number(metrics?.completedAppointmentsTotal ?? completedLast12Months);

    if (valueElement) {
        valueElement.textContent = String(completedLast12Months);
    }

    if (captionElement) {
        captionElement.textContent =
            completedTotal > completedLast12Months
                ? `En los últimos 12 meses · ${completedTotal} en total`
                : "En los últimos 12 meses";
    }

    card.setAttribute(
        "aria-label",
        completedTotal > completedLast12Months
            ? `Citas completadas en los últimos 12 meses: ${completedLast12Months}. Total histórico: ${completedTotal}.`
            : `Citas completadas en los últimos 12 meses: ${completedLast12Months}.`,
    );
}

function renderAverageRatingMetric(workshop) {
    const card = document.querySelector("[data-profile-average-rating-card]");
    if (!card) {
        return;
    }

    const valueElement = card.querySelector("[data-profile-average-rating-value]");
    const captionElement = card.querySelector("[data-profile-average-rating-caption]");
    const defaultMessage =
        "Registra tu taller para comenzar a recibir reseñas de tus clientes.";

    if (!workshop) {
        if (valueElement) {
            valueElement.textContent = "–";
        }
        if (captionElement) {
            captionElement.textContent = defaultMessage;
        }
        card.dataset.state = "empty";
        card.setAttribute("aria-label", "Sin calificaciones registradas");
        return;
    }

    const reviewsCount = Number(workshop.reviewsCount || 0);
    const hasReviews = reviewsCount > 0 && typeof workshop.averageRating === "number";

    if (valueElement) {
        valueElement.textContent = hasReviews ? workshop.averageRating.toFixed(1) : "–";
    }

    if (captionElement) {
        captionElement.textContent = hasReviews
            ? `Basado en ${reviewsCount} ${pluralize(
                  reviewsCount,
                  "reseña",
                  "reseñas",
              )}`
            : "Aún no tienes reseñas publicadas. Pide a tus clientes que compartan su experiencia.";
    }

    card.dataset.state = hasReviews ? "rated" : "empty";
    card.setAttribute(
        "aria-label",
        hasReviews
            ? `Calificación promedio ${workshop.averageRating.toFixed(1)} de 5`
            : "Sin calificaciones registradas",
    );
}

function populateWorkshopOverview(elements, workshop) {
    const { container, photo, name, summary, specialties, experience } = elements;

    if (!container) {
        return;
    }

    if (!workshop) {
        container.hidden = true;
        if (photo) {
            photo.hidden = true;
        }
        return;
    }

    container.hidden = false;

    if (photo) {
        if (workshop.photo) {
            photo.src = workshop.photo;
            photo.alt = `Foto del taller ${workshop.name || ""}`;
            photo.hidden = false;
        } else {
            photo.hidden = true;
        }
    }

    if (name) {
        name.textContent = workshop.name || "Mi taller";
    }

    if (summary) {
        summary.textContent = workshop.shortDescription || workshop.description || "";
    }

    if (specialties) {
        const list = Array.isArray(workshop.specialties) && workshop.specialties.length
            ? workshop.specialties.join(", ")
            : "Sin especialidades registradas";
        specialties.textContent = list;
    }

    if (experience) {
        const years = Number(workshop.experienceYears || 0);
        experience.textContent = years > 0 ? `${years} ${pluralize(years, "año", "años")}` : "No especificado";
    }
}

function populateWorkshopForm(form, workshop) {
    if (!form || !workshop) {
        return;
    }

    const fieldValues = {
        "workshop-name": workshop.name || "",
        "workshop-summary": workshop.shortDescription || "",
        "workshop-description": workshop.description || "",
        "workshop-services": formatListForTextarea(workshop.services),
        "workshop-specialties": formatListForTextarea(workshop.specialties),
        "workshop-certifications": formatListForTextarea(workshop.certifications),
        "experience-years": workshop.experienceYears ? String(workshop.experienceYears) : "",
        "workshop-address": workshop.address || "",
        "workshop-schedule": workshop.schedule || "",
        "workshop-phone": workshop.phone || "",
        "workshop-email": workshop.email || "",
    };

    Object.entries(fieldValues).forEach(([name, value]) => {
        const field = form.elements.namedItem(name);
        if (field && typeof field === "object" && "value" in field) {
            field.value = value ?? "";
        }
    });

    const photoInput = form.querySelector('input[name="workshop-photo"]');
    if (photoInput) {
        photoInput.value = "";
    }

    form.hidden = false;
}

function setupWorkshopManagement(profile) {
    const manageButton = document.querySelector("[data-workshop-manage-button]");
    const panel = document.querySelector("[data-workshop-panel]");

    if (!manageButton || !panel) {
        return;
    }

    const isMechanic = profile.accountType === "mecanico";
    if (!isMechanic) {
        manageButton.remove();
        panel.remove();
        return;
    }

    manageButton.hidden = false;
    panel.hidden = true;
    panel.classList.add("is-collapsed");
    manageButton.setAttribute("aria-expanded", "false");
    manageButton.setAttribute("aria-controls", "workshop-management");

    workshopState.id = profile?.mechanicWorkshop?.id || null;
    workshopState.data = null;
    workshopState.loaded = false;
    workshopState.loading = false;

    const closeButton = panel.querySelector("[data-workshop-close]");
    const statusElement = panel.querySelector("[data-workshop-status]");
    const emptyStateElement = panel.querySelector("[data-workshop-empty]");
    const form = panel.querySelector("[data-workshop-form]");
    const feedbackElement = panel.querySelector("[data-workshop-feedback]");
    const submitButton = panel.querySelector("[data-workshop-submit]");
    const deleteSection = panel.querySelector("[data-workshop-delete-section]");
    const deleteButton = panel.querySelector("[data-workshop-delete]");
    const deleteFeedback = panel.querySelector("[data-workshop-delete-feedback]");

    const overviewElements = {
        container: panel.querySelector("[data-workshop-overview]") || null,
        photo: panel.querySelector("[data-workshop-photo]") || null,
        name: panel.querySelector("[data-workshop-name]") || null,
        summary: panel.querySelector("[data-workshop-summary]") || null,
        specialties: panel.querySelector("[data-workshop-specialties]") || null,
        experience: panel.querySelector("[data-workshop-experience]") || null,
    };

    if (profile?.mechanicWorkshop) {
        populateWorkshopOverview(overviewElements, profile.mechanicWorkshop);
    }

    function showEmptyState(message) {
        if (emptyStateElement) {
            emptyStateElement.innerHTML = message;
            emptyStateElement.hidden = false;
        }

        if (form) {
            form.hidden = true;
        }

        populateWorkshopOverview(overviewElements, null);
        if (deleteSection) {
            deleteSection.hidden = true;
        }
        if (deleteButton) {
            deleteButton.disabled = true;
        }
        if (deleteFeedback) {
            updateMessage(deleteFeedback, "", "info");
        }
    }

    function hideEmptyState() {
        if (emptyStateElement) {
            emptyStateElement.hidden = true;
        }
    }

    async function loadWorkshop() {
        if (workshopState.loading || workshopState.loaded) {
            return;
        }

        if (!workshopState.id) {
            showEmptyState(
                'Todavía no has registrado un taller. <a href="./registro-taller.html">Regístralo ahora</a> para compartir tu información con los clientes.',
            );
            updateMessage(statusElement, "", "info");
            workshopState.loaded = true;
            return;
        }

        workshopState.loading = true;
        updateMessage(statusElement, "Cargando información del taller...", "info");
        hideEmptyState();

        if (form) {
            form.hidden = true;
        }

        try {
            const response = await fetch(`/api/workshops/${encodeURIComponent(workshopState.id)}`);

            if (response.status === 401) {
                window.location.href = "./login.html";
                return;
            }

            if (response.status === 403) {
                updateMessage(
                    statusElement,
                    "No tienes permisos para editar este taller. Contacta a soporte si crees que es un error.",
                    "error",
                );
                showEmptyState(
                    "No tienes permisos para editar este taller. Contacta a soporte si necesitas ayuda.",
                );
                workshopState.loaded = true;
                return;
            }

            if (response.status === 404) {
                updateMessage(statusElement, "", "info");
                showEmptyState(
                    'No encontramos los datos de tu taller. Puedes <a href="./registro-taller.html">registrarlo nuevamente</a> para que aparezca en la plataforma.',
                );
                workshopState.id = null;
                workshopState.loaded = true;
                return;
            }

            if (!response.ok) {
                throw new Error("No se pudo obtener la información del taller.");
            }

            const data = await response.json();
            const workshop = data?.workshop || null;

            if (!workshop) {
                throw new Error("No se pudo obtener la información del taller.");
            }

            workshopState.data = workshop;
            workshopState.loaded = true;
            updateMessage(statusElement, "", "info");
            hideEmptyState();
            populateWorkshopOverview(overviewElements, workshop);
            populateWorkshopForm(form, workshop);
            if (deleteSection) {
                deleteSection.hidden = false;
            }
            if (deleteButton) {
                deleteButton.disabled = false;
            }

            if (feedbackElement) {
                updateMessage(feedbackElement, "", "info");
            }
        } catch (error) {
            console.error(error);
            workshopState.loaded = false;
            updateMessage(
                statusElement,
                "No pudimos cargar los datos del taller. Intenta nuevamente más tarde.",
                "error",
            );
        } finally {
            workshopState.loading = false;
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!form || !submitButton) {
            return;
        }

        if (!workshopState.id) {
            updateMessage(
                feedbackElement,
                "Necesitas registrar un taller antes de poder actualizar sus datos.",
                "error",
            );
            return;
        }

        const formData = new FormData(form);
        const payload = {
            name: String(formData.get("workshop-name") || "").trim(),
            shortDescription: String(formData.get("workshop-summary") || "").trim(),
            description: String(formData.get("workshop-description") || "").trim(),
            services: parseTextList(formData.get("workshop-services")),
            specialties: parseTextList(formData.get("workshop-specialties")),
            certifications: parseTextList(formData.get("workshop-certifications")),
            experienceYears: String(formData.get("experience-years") || "").trim(),
            address: String(formData.get("workshop-address") || "").trim(),
            schedule: String(formData.get("workshop-schedule") || "").trim(),
            phone: String(formData.get("workshop-phone") || "").trim(),
            email: String(formData.get("workshop-email") || "").trim().toLowerCase(),
        };

        if (!payload.name) {
            updateMessage(feedbackElement, "Ingresa el nombre del taller.", "error");
            const nameField = form.elements.namedItem("workshop-name");
            if (nameField && typeof nameField === "object" && typeof nameField.focus === "function") {
                nameField.focus();
            }
            return;
        }

        if (!payload.description) {
            updateMessage(feedbackElement, "Describe tu taller para continuar.", "error");
            const descriptionField = form.elements.namedItem("workshop-description");
            if (descriptionField && typeof descriptionField === "object" && typeof descriptionField.focus === "function") {
                descriptionField.focus();
            }
            return;
        }

        if (!payload.address) {
            updateMessage(feedbackElement, "Ingresa la dirección del taller.", "error");
            const addressField = form.elements.namedItem("workshop-address");
            if (addressField && typeof addressField === "object" && typeof addressField.focus === "function") {
                addressField.focus();
            }
            return;
        }

        if (!payload.services.length) {
            updateMessage(
                feedbackElement,
                "Especifica al menos un servicio destacado que ofrezcas.",
                "error",
            );
            const servicesField = form.elements.namedItem("workshop-services");
            if (servicesField && typeof servicesField === "object" && typeof servicesField.focus === "function") {
                servicesField.focus();
            }
            return;
        }

        const parsedExperience = Number.parseInt(payload.experienceYears, 10);
        payload.experienceYears = Number.isInteger(parsedExperience) && parsedExperience >= 0 ? parsedExperience : 0;

        const photoFile = formData.get("workshop-photo");
        if (photoFile instanceof File && photoFile.size > 0) {
            try {
                payload.photoDataUrl = await readFileAsDataUrl(photoFile);
            } catch (error) {
                console.error(error);
                updateMessage(
                    feedbackElement,
                    "No se pudo leer la imagen seleccionada. Intenta con un archivo diferente.",
                    "error",
                );
                return;
            }
        }

        updateMessage(feedbackElement, "Guardando cambios...", "info");
        submitButton.disabled = true;

        try {
            const response = await fetch(`/api/workshops/${encodeURIComponent(workshopState.id)}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.status === 401) {
                window.location.href = "./login.html";
                return;
            }

            if (response.status === 403) {
                updateMessage(
                    feedbackElement,
                    "No tienes permisos para editar este taller. Contacta a soporte si necesitas ayuda.",
                    "error",
                );
                return;
            }

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                updateMessage(
                    feedbackElement,
                    result?.error || "No pudimos guardar los cambios. Inténtalo nuevamente.",
                    "error",
                );
                return;
            }

            const updatedWorkshop = result?.workshop || null;

            if (updatedWorkshop) {
                workshopState.data = updatedWorkshop;
                workshopState.loaded = true;
                populateWorkshopOverview(overviewElements, updatedWorkshop);
                populateWorkshopForm(form, updatedWorkshop);
                updateMessage(
                    feedbackElement,
                    result?.message || "Los cambios se guardaron correctamente.",
                    "success",
                );

                if (currentProfile) {
                    const summary = currentProfile.mechanicWorkshop || {};
                    currentProfile.mechanicWorkshop = {
                        ...summary,
                        id: updatedWorkshop.id,
                        name: updatedWorkshop.name,
                        shortDescription: updatedWorkshop.shortDescription,
                        reviewsCount: Number(updatedWorkshop.reviewsCount || 0),
                        averageRating:
                            typeof updatedWorkshop.averageRating === "number"
                                ? Number(updatedWorkshop.averageRating)
                                : null,
                    };
                    renderAverageRatingMetric(currentProfile.mechanicWorkshop);
                }
            } else {
                updateMessage(
                    feedbackElement,
                    result?.message || "Los cambios se guardaron correctamente.",
                    "success",
                );
            }
        } catch (error) {
            console.error(error);
            updateMessage(
                feedbackElement,
                "Ocurrió un problema al guardar la información. Revisa tu conexión e inténtalo nuevamente.",
                "error",
            );
        } finally {
            submitButton.disabled = false;
            const photoInput = form.querySelector('input[name="workshop-photo"]');
            if (photoInput) {
                photoInput.value = "";
            }
        }
    }

    async function handleDelete() {
        if (!workshopState.id) {
            return;
        }

        const confirmation = window.confirm(
            "¿Estás seguro de eliminar tu taller? Se borrarán todos tus datos y dejará de aparecer en la página.",
        );

        if (!confirmation) {
            return;
        }

        if (deleteFeedback) {
            updateMessage(deleteFeedback, "Eliminando tu taller...", "info");
        }
        if (deleteButton) {
            deleteButton.disabled = true;
        }

        try {
            const response = await fetch(`/api/workshops/${encodeURIComponent(workshopState.id)}`, {
                method: "DELETE",
            });

            if (response.status === 401) {
                window.location.href = "./login.html";
                return;
            }

            const result = await response.json().catch(() => ({}));

            if (response.status === 403) {
                updateMessage(
                    deleteFeedback,
                    result?.error || "No tienes permisos para eliminar este taller.",
                    "error",
                );
                return;
            }

            if (response.status === 404) {
                updateMessage(deleteFeedback, "No encontramos tu taller. Quizás ya fue eliminado.", "error");
                return;
            }

            if (!response.ok) {
                updateMessage(
                    deleteFeedback,
                    result?.error || "No pudimos eliminar tu taller. Intenta nuevamente más tarde.",
                    "error",
                );
                return;
            }

            workshopState.id = null;
            workshopState.data = null;
            workshopState.loaded = false;
            populateWorkshopOverview(overviewElements, null);

            if (form) {
                form.reset();
                form.hidden = true;
            }

            showEmptyState(
                'Tu taller fue eliminado. Puedes <a href="./registro-taller.html">crear uno nuevo</a> cuando quieras.',
            );

            if (deleteSection) {
                deleteSection.hidden = true;
            }

            if (feedbackElement) {
                updateMessage(feedbackElement, "", "info");
            }

            if (deleteFeedback) {
                updateMessage(
                    deleteFeedback,
                    result?.message || "Taller eliminado correctamente.",
                    "success",
                );
            }

            if (currentProfile) {
                currentProfile.mechanicWorkshop = null;
                renderAverageRatingMetric(null);
            }
        } catch (error) {
            console.error(error);
            if (deleteFeedback) {
                updateMessage(
                    deleteFeedback,
                    "No se pudo eliminar el taller por un error inesperado. Inténtalo nuevamente.",
                    "error",
                );
            }
        } finally {
            if (deleteButton) {
                deleteButton.disabled = false;
            }
        }
    }

    function openPanel() {
        panel.hidden = false;
        panel.classList.remove("is-collapsed");
        manageButton.setAttribute("aria-expanded", "true");
        if (closeButton) {
            closeButton.hidden = false;
        }
        void loadWorkshop();
    }

    function closePanel() {
        panel.hidden = true;
        panel.classList.add("is-collapsed");
        manageButton.setAttribute("aria-expanded", "false");
        if (closeButton) {
            closeButton.hidden = true;
        }
        if (typeof manageButton.focus === "function") {
            manageButton.focus();
        }
    }

    manageButton.addEventListener("click", () => {
        if (panel.hidden) {
            openPanel();
        } else {
            closePanel();
        }
    });

    if (closeButton) {
        closeButton.hidden = true;
        closeButton.addEventListener("click", closePanel);
    }

    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePanel();
        }
    });

    if (form) {
        form.addEventListener("submit", handleSubmit);
    }

    if (deleteButton) {
        deleteButton.addEventListener("click", handleDelete);
    }
}

async function fetchMechanicRequests() {
    const response = await fetch("/api/appointments/requests", {
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return [];
    }

    if (response.status === 403) {
        return [];
    }

    if (!response.ok) {
        throw new Error("No se pudieron obtener las solicitudes de citas.");
    }

    const data = await response.json();
    return Array.isArray(data?.requests) ? data.requests : [];
}

async function dismissMechanicRequest(requestId) {
    if (!requestId) {
        throw new Error("Identificador de solicitud no válido.");
    }

    const response = await fetch(`/api/appointments/requests/${encodeURIComponent(requestId)}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return false;
    }

    if (response.status === 403) {
        throw new Error("No tienes permisos para ocultar esta solicitud.");
    }

    if (response.status === 404) {
        throw new Error("No encontramos la solicitud que intentas ocultar.");
    }

    if (!response.ok) {
        throw new Error("No se pudo ocultar la solicitud. Intenta nuevamente.");
    }

    return true;
}

async function fetchClientHistory() {
    const response = await fetch("/api/profile/history", {
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return [];
    }

    if (response.status === 403) {
        return [];
    }

    if (!response.ok) {
        throw new Error("No se pudo obtener el historial de visitas.");
    }

    const data = await response.json();
    return Array.isArray(data?.history) ? data.history : [];
}

async function cancelAppointmentRequest(appointmentId) {
    const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 404) {
        throw new Error(data.error || "No encontramos la cita que intentas cancelar.");
    }

    if (!response.ok) {
        throw new Error(data.error || "No se pudo cancelar la cita.");
    }

    return data?.appointment || null;
}

async function rescheduleAppointmentRequest(appointmentId, payload) {
    const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 404) {
        throw new Error(data.error || "No encontramos la cita que intentas reagendar.");
    }

    if (!response.ok) {
        throw new Error(data.error || "No se pudo reagendar la cita.");
    }

    return data?.appointment || null;
}

function applyRoleUpgradeStatus(status, elements) {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";
    const { statusElement, helperElement, triggerButton } = elements;
    const statusClasses = ["is-pending", "is-error", "is-success"];

    if (statusElement) {
        statusElement.classList.remove(...statusClasses);
    }

    if (helperElement) {
        helperElement.hidden = normalized === "pendiente";
    }

    let message =
        "Comparte tu certificado o formulario y te ayudaremos a cambiar a cuenta de mecánico.";
    let statusClass = "";
    let buttonLabel = "Cambiar de rol";
    let buttonDisabled = false;

    switch (normalized) {
        case "pendiente":
            message = "Ya recibimos tu solicitud. Un administrador la está revisando.";
            statusClass = "is-pending";
            buttonLabel = "Solicitud en revisión";
            buttonDisabled = true;
            break;
        case "rechazado":
            message =
                "Tu solicitud anterior fue rechazada. Adjunta un nuevo documento para revisarla nuevamente.";
            statusClass = "is-error";
            buttonLabel = "Enviar nuevamente";
            break;
        default:
            break;
    }

    if (triggerButton) {
        triggerButton.disabled = buttonDisabled;
        triggerButton.textContent = buttonLabel;
    }

    if (statusElement) {
        statusElement.textContent = message;
        if (statusClass) {
            statusElement.classList.add(statusClass);
        }
    }
}

function setupRoleUpgradeFlow(profile) {
    const section = document.querySelector("[data-role-upgrade]");
    const triggerButton = section?.querySelector("[data-role-upgrade-trigger]");
    const statusElement = section?.querySelector("[data-role-upgrade-status]");
    const helperElement = section?.querySelector("[data-role-upgrade-helper]");
    const dialog = document.querySelector("[data-role-upgrade-dialog]");
    const form = dialog?.querySelector("[data-role-upgrade-form]");
    const fileInput = form?.querySelector('input[name="upgrade-certificate"]');
    const notesInput = form?.querySelector('textarea[name="upgrade-notes"]');
    const feedbackElement = form?.querySelector("[data-role-upgrade-feedback]");
    const submitButton = form?.querySelector("[data-role-upgrade-submit]");
    const closeButtons = dialog?.querySelectorAll("[data-role-upgrade-close]");

    if (profile?.accountType !== "cliente") {
        if (section) {
            section.hidden = true;
        }
        return;
    }

    if (!section || !triggerButton || !dialog || !form || !fileInput || !feedbackElement || !submitButton) {
        return;
    }

    const currentStatus = typeof profile?.certificateStatus === "string" ? profile.certificateStatus : "";
    applyRoleUpgradeStatus(currentStatus, { statusElement, helperElement, triggerButton });

    const dialogState = { open: false };

    function openDialog() {
        dialog.hidden = false;
        dialogState.open = true;
        updateMessage(feedbackElement, "", "info");
        dialog.focus();
    }

    function closeDialog() {
        dialog.hidden = true;
        dialogState.open = false;
        form.reset();
        updateMessage(feedbackElement, "", "info");
        triggerButton.focus();
    }

    triggerButton.addEventListener("click", () => {
        if (triggerButton.disabled) {
            return;
        }
        openDialog();
    });

    closeButtons?.forEach((button) => {
        button.addEventListener("click", closeDialog);
    });

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            closeDialog();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && dialogState.open) {
            closeDialog();
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const certificateFile = fileInput.files?.[0];
        if (!(certificateFile instanceof File)) {
            updateMessage(
                feedbackElement,
                "Adjunta tu certificado en formato PDF o imagen para continuar.",
                "error",
            );
            fileInput.focus();
            return;
        }

        submitButton.disabled = true;
        updateMessage(feedbackElement, "Enviando solicitud...", "info");

        let certificateDataUrl = "";
        try {
            certificateDataUrl = await readFileAsDataUrl(certificateFile);
        } catch (error) {
            console.error(error);
            updateMessage(
                feedbackElement,
                "No pudimos leer el documento seleccionado. Intenta con otro archivo.",
                "error",
            );
            submitButton.disabled = false;
            return;
        }

        const payload = {
            certificate: { dataUrl: certificateDataUrl },
            notes: String(notesInput?.value || "").trim(),
        };

        try {
            const response = await fetch("/api/profile/request-mechanic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (response.status === 401) {
                window.location.href = "./login.html";
                return;
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || "No se pudo enviar tu solicitud.");
            }

            applyRoleUpgradeStatus("pendiente", { statusElement, helperElement, triggerButton });
            updateMessage(
                feedbackElement,
                data.message ||
                    "Recibimos tu solicitud. Te llevaremos al inicio de sesión para continuar el cambio de rol.",
                "success",
            );

            setTimeout(() => {
                window.location.href = "./login.html";
            }, 1500);
        } catch (error) {
            console.error(error);
            updateMessage(
                feedbackElement,
                error.message || "No se pudo enviar tu solicitud. Inténtalo nuevamente.",
                "error",
            );
        } finally {
            submitButton.disabled = false;
        }
    });
}

async function setupProfilePage() {
    try {
        setupAppointmentDialogs();
        const profile = await fetchProfile();
        if (!profile) {
            return;
        }

        currentProfile = profile;
        renderProfile(profile);

        const isMechanic = profile.accountType === "mecanico";
        toggleMechanicSection(isMechanic);
        toggleAudienceSections(isMechanic);
        renderCompletedAppointmentsMetric(isMechanic, profile.mechanicMetrics || null);
        renderAverageRatingMetric(isMechanic ? profile.mechanicWorkshop || null : null);
        setupWorkshopManagement(profile);

        if (isMechanic) {
            try {
                const requests = await fetchMechanicRequests();
                renderMechanicRequests(requests);
            } catch (error) {
                console.error(error);
                renderMechanicRequests([], {
                    errorMessage: "No se pudieron cargar las solicitudes. Intenta nuevamente más tarde.",
                });
            }
        } else {
            renderMechanicRequests([]);
            setupRoleUpgradeFlow(profile);
            try {
                const history = await fetchClientHistory();
                renderClientHistory(history);
            } catch (error) {
                console.error(error);
                renderClientHistory([], {
                    errorMessage: "No se pudo cargar tu historial de visitas. Intenta nuevamente más tarde.",
                });
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function handleLogout() {
    const confirmed = window.confirm("¿Estás seguro de que deseas cerrar sesión?");
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/api/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            throw new Error("No se pudo cerrar sesión");
        }

        window.location.href = "./login.html";
    } catch (error) {
        console.error(error);
        alert("No se pudo cerrar sesión. Intenta de nuevo.");
    }
}

function setupAppointmentDialogs() {
    const dialog = document.querySelector("[data-appointment-dialog]");
    appointmentDialogState.container = dialog;
    appointmentDialogState.helper = dialog?.querySelector("[data-appointment-helper]") || null;
    appointmentDialogState.status = dialog?.querySelector("[data-appointment-status]") || null;
    appointmentDialogState.title = dialog?.querySelector("[data-appointment-title]") || null;
    appointmentDialogState.schedule = dialog?.querySelector("[data-appointment-schedule]") || null;
    appointmentDialogState.type = dialog?.querySelector("[data-appointment-type]") || null;
    appointmentDialogState.address = dialog?.querySelector("[data-appointment-address]") || null;
    appointmentDialogState.partner = dialog?.querySelector("[data-appointment-partner]") || null;
    appointmentDialogState.reason = dialog?.querySelector("[data-appointment-reason]") || null;
    appointmentDialogState.reschedule = dialog?.querySelector("[data-appointment-reschedule-note]") || null;
    appointmentDialogState.cancelButton = dialog?.querySelector("[data-appointment-cancel]") || null;
    appointmentDialogState.rescheduleButton = dialog?.querySelector("[data-appointment-reschedule]") || null;

    dialog?.querySelectorAll("[data-appointment-close]")?.forEach((button) => {
        button.addEventListener("click", handleAppointmentDialogClose);
    });

    appointmentDialogState.cancelButton?.addEventListener("click", handleCancelAppointment);
    appointmentDialogState.rescheduleButton?.addEventListener("click", openRescheduleDialog);

    const cancelDialog = document.querySelector("[data-cancel-dialog]");
    cancelDialogState.container = cancelDialog;
    cancelDialogState.details = cancelDialog?.querySelector("[data-cancel-details]") || null;
    cancelDialogState.feedback = cancelDialog?.querySelector("[data-cancel-feedback]") || null;
    cancelDialogState.confirm = cancelDialog?.querySelector("[data-cancel-confirm]") || null;
    cancelDialogState.close = cancelDialog?.querySelector("[data-cancel-close]") || null;

    cancelDialogState.confirm?.addEventListener("click", confirmCancelAppointment);
    cancelDialogState.close?.addEventListener("click", () => toggleCancelDialog(false));

    const rescheduleDialog = document.querySelector("[data-reschedule-dialog]");
    rescheduleDialogState.container = rescheduleDialog;
    rescheduleDialogState.form = rescheduleDialog?.querySelector("[data-reschedule-form]") || null;
    rescheduleDialogState.reason = rescheduleDialog?.querySelector("[data-reschedule-reason]") || null;
    rescheduleDialogState.date = rescheduleDialog?.querySelector("[data-reschedule-date]") || null;
    rescheduleDialogState.slot = rescheduleDialog?.querySelector("[data-reschedule-slot]") || null;
    rescheduleDialogState.feedback = rescheduleDialog?.querySelector("[data-reschedule-feedback]") || null;
    rescheduleDialogState.submit = rescheduleDialog?.querySelector("[data-reschedule-submit]") || null;
    rescheduleDialogState.helperDate = rescheduleDialog?.querySelector("[data-reschedule-date-helper]") || null;
    rescheduleDialogState.helperSlot = rescheduleDialog?.querySelector("[data-reschedule-slot-helper]") || null;

    rescheduleDialog?.querySelectorAll("[data-reschedule-close]")?.forEach((button) => {
        button.addEventListener("click", () => {
            resetRescheduleForm();
            toggleRescheduleDialog(false);
        });
    });

    rescheduleDialogState.form?.addEventListener("submit", handleRescheduleSubmit);
    rescheduleDialogState.date?.addEventListener("change", updateRescheduleSlots);
}

document.addEventListener("DOMContentLoaded", () => {
    setupCompletionDialog();
    setupProfilePage();

    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
});
