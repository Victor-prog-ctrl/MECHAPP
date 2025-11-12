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

function canRequestBeCompleted(status) {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";
    return normalized === "pendiente" || normalized === "confirmado";
}

function formatDateTime(dateString) {
    if (!dateString) {
        return "";
    }

    try {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("es", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
    } catch (error) {
        console.error("No se pudo formatear la fecha y hora", error);
        return dateString;
    }
}

function formatDate(dateString) {
    if (!dateString) {
        return "";
    }

    try {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("es", {
            dateStyle: "long",
        }).format(date);
    } catch (error) {
        console.error("No se pudo formatear la fecha", error);
        return dateString;
    }
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
const dismissedRequestIds = new Set();
const dismissedHistoryIds = new Set();
const DEFAULT_MECHANIC_EMPTY_MESSAGE =
    "No tienes solicitudes pendientes por ahora. Cuando un cliente agende contigo aparecerá aquí.";

let clientHistoryRecords = [];
let mechanicRequestRecords = [];
const completionDialogState = {
    container: null,
    confirmButton: null,
    cancelButton: null,
    detailsElement: null,
    feedbackElement: null,
    requestId: null,
    triggerButton: null,
    busy: false,
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

    const { confirmButton, cancelButton, container } = completionDialogState;

    if (confirmButton) {
        confirmButton.disabled = busy;
    }

    if (cancelButton) {
        cancelButton.disabled = busy;
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

    if (confirmButton && typeof confirmButton.focus === "function") {
        confirmButton.focus();
    }
}

async function updateMechanicRequestStatus(requestId, status) {
    if (!requestId) {
        throw new Error("Identificador de solicitud no válido.");
    }

    const response = await fetch(`/api/appointments/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
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
        throw new Error("No se pudo actualizar la solicitud.");
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

    try {
        const updatedRequest = await updateMechanicRequestStatus(
            completionDialogState.requestId,
            "completado",
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

    completionDialogState.container = container;
    completionDialogState.confirmButton = confirmButton;
    completionDialogState.cancelButton = cancelButton;
    completionDialogState.detailsElement = detailsElement;
    completionDialogState.feedbackElement = feedbackElement;

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

    const visibleRequests = normalizedRequests.filter((request) => {
        const requestId = request?.id != null ? String(request.id) : "";
        return requestId ? !dismissedRequestIds.has(requestId) : true;
    });

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

        dismissButton.addEventListener("click", () => {
            const requestId = request?.id != null ? String(request.id) : "";
            if (requestId) {
                dismissedRequestIds.add(requestId);
            }

            article.remove();

            if (emptyState) {
                const hasVisibleRequests = container.querySelector(".request-card");
                emptyState.textContent = DEFAULT_MECHANIC_EMPTY_MESSAGE;
                emptyState.hidden = Boolean(hasVisibleRequests);
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

        if (canRequestBeCompleted(request.status)) {
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

        article.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const statusBadge = document.createElement("span");
        const statusClass = getStatusClass(record?.status);
        statusBadge.className = `status ${statusClass}`;
        statusBadge.textContent = getStatusLabel(record?.status);
        actions.appendChild(statusBadge);

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

async function setupProfilePage() {
    try {
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

function showSubscriptionFeedback(element, message, type = "success") {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.hidden = false;
    element.classList.remove("success", "error");
    element.classList.add(type);
}

function setupSubscriptionForm() {
    const form = document.querySelector(".subscription-form");
    if (!form) {
        return;
    }

    const feedbackElement = form.querySelector("[data-subscription-feedback]");
    const submitButton = form.querySelector('button[type="submit"]');
    const emailInput = form.querySelector('input[type="email"]');

    if (!submitButton || !emailInput) {
        console.warn("El formulario de suscripción no tiene los elementos esperados.");
        return;
    }
    const { emailjsServiceId: serviceId, emailjsTemplateId: templateId, emailjsPublicKey: publicKey } =
        form.dataset;

    if (!window.emailjs) {
        console.error("La librería de EmailJS no está disponible. Verifica que el script se esté cargando correctamente.");
        showSubscriptionFeedback(
            feedbackElement,
            "No se pudo cargar el servicio de suscripción. Intenta nuevamente en unos minutos.",
            "error",
        );
        return;
    }

    if (!serviceId || !templateId || !publicKey) {
        console.warn(
            "Faltan credenciales de EmailJS. Asegúrate de definir data-emailjs-service-id, data-emailjs-template-id y data-emailjs-public-key en el formulario.",
        );
        return;
    }

    emailjs.init({ publicKey });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!emailInput || !form.reportValidity()) {
            return;
        }

        submitButton.disabled = true;
        showSubscriptionFeedback(feedbackElement, "Enviando tu suscripción...", "success");

        try {
            await emailjs.send(serviceId, templateId, {
                subscriber_email: emailInput.value,
            });

            showSubscriptionFeedback(
                feedbackElement,
                "¡Listo! Revisa tu bandeja de entrada para confirmar la suscripción.",
                "success",
            );
            form.reset();
            emailInput.focus();
        } catch (error) {
            console.error("No se pudo enviar la suscripción", error);
            showSubscriptionFeedback(
                feedbackElement,
                "No se pudo completar la suscripción. Inténtalo nuevamente más tarde.",
                "error",
            );
        } finally {
            submitButton.disabled = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupCompletionDialog();
    setupProfilePage();
    setupSubscriptionForm();

    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
});
