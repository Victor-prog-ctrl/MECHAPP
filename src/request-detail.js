const requestState = {
    id: null,
    data: null,
    updating: false,
};

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
        case "confirmado":
        case "completado":
            return "success";
        case "cancelado":
        case "rechazado":
            return "cancelled";
        default:
            return "pending";
    }
}

function getVisitTypeLabel(visitType) {
    return visitType === "domicilio" ? "Visita a domicilio" : "Presencial en taller";
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

function parseRequestId() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    const id = Number.parseInt(idParam || "", 10);

    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    return id;
}

function applyStatusClass(element, status) {
    if (!element) {
        return;
    }

    element.classList.remove("pending", "success", "cancelled");
    const statusClass = getStatusClass(status);
    if (statusClass) {
        element.classList.add(statusClass);
    }
}

function showSection(section) {
    const container = document.querySelector("[data-request-container]");

    if (container) {
        container.hidden = section !== "detail";
    }
}

function showErrorState({ title, message } = {}) {
    const fallbackTitle = title || "No se pudo cargar la solicitud";
    const fallbackMessage = message || "Intenta nuevamente en unos minutos. Si el problema persiste contacta a soporte.";
    const alertMessage = [fallbackTitle, fallbackMessage].filter(Boolean).join("\n\n");

    showSection("loading");

    if (alertMessage) {
        window.alert(alertMessage);
    }

    window.location.href = "./perfil.html";
}

function clearFeedback() {
    const feedback = document.querySelector("[data-request-feedback]");
    if (!feedback) {
        return;
    }

    feedback.hidden = true;
    feedback.textContent = "";
    feedback.classList.remove("success", "error");
}

function showFeedback(message, type = "info") {
    const feedback = document.querySelector("[data-request-feedback]");
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.remove("success", "error");

    if (type === "success" || type === "error") {
        feedback.classList.add(type);
    }
}

function setInitialFeedback(status) {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";

    if (normalized === "confirmado") {
        showFeedback("Esta solicitud ya fue aceptada. Comunícate con el cliente para coordinar la visita.", "success");
    } else if (normalized === "rechazado") {
        showFeedback("Esta solicitud fue rechazada. El cliente será notificado automáticamente.", "error");
    } else {
        clearFeedback();
    }
}

function updateActionButtons(status) {
    const acceptButton = document.querySelector('[data-action="accept"]');
    const rejectButton = document.querySelector('[data-action="reject"]');

    if (!acceptButton || !rejectButton) {
        return;
    }

    const normalized = typeof status === "string" ? status.toLowerCase() : "";
    const isPending = normalized === "pendiente";

    const disableButtons = requestState.updating || !isPending;

    acceptButton.disabled = disableButtons;
    rejectButton.disabled = disableButtons;

    if (isPending) {
        acceptButton.removeAttribute("aria-disabled");
        rejectButton.removeAttribute("aria-disabled");
    } else {
        acceptButton.setAttribute("aria-disabled", "true");
        rejectButton.setAttribute("aria-disabled", "true");
    }
}

function renderRequest(request, { preserveFeedback = false } = {}) {
    const container = document.querySelector("[data-request-container]");
    if (!container || !request) {
        showErrorState();
        return;
    }

    requestState.data = request;

    const service = container.querySelector("[data-request-service]");
    const statusElement = container.querySelector("[data-request-status]");
    const created = container.querySelector("[data-request-created]");
    const scheduled = container.querySelector("[data-request-scheduled]");
    const type = container.querySelector("[data-request-type]");
    const address = container.querySelector("[data-request-address]");
    const client = container.querySelector("[data-request-client]");
    const locationWrapper = container.querySelector("[data-request-location-wrapper]");
    const location = container.querySelector("[data-request-location]");
    const notesWrapper = container.querySelector("[data-request-notes-wrapper]");
    const notes = container.querySelector("[data-request-notes]");

    if (service) {
        service.textContent = request.service || "Servicio solicitado";
    }

    if (statusElement) {
        statusElement.textContent = getStatusLabel(request.status);
        applyStatusClass(statusElement, request.status);
    }

    if (created) {
        const formatted = formatDate(request.createdAt);
        created.textContent = formatted || "—";
    }

    if (scheduled) {
        const formatted = formatDateTime(request.scheduledFor);
        scheduled.textContent = formatted || "Sin fecha definida";
    }

    if (type) {
        type.textContent = getVisitTypeLabel(request.visitType);
    }

    if (address) {
        address.textContent = request.address || "Sin dirección proporcionada";
    }

    if (client) {
        const clientName = request?.client?.name || "Cliente";
        const clientEmail = request?.client?.email || "";
        client.textContent = clientEmail ? `${clientName} · ${clientEmail}` : clientName;
    }

    if (request.clientLocation && locationWrapper && location) {
        const { latitude, longitude } = request.clientLocation;
        location.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        locationWrapper.hidden = false;
    } else if (locationWrapper) {
        locationWrapper.hidden = true;
    }

    if (request.notes && notesWrapper && notes) {
        notes.textContent = request.notes;
        notesWrapper.hidden = false;
    } else if (notesWrapper) {
        notesWrapper.hidden = true;
    }

    if (!preserveFeedback) {
        setInitialFeedback(request.status);
    }

    updateActionButtons(request.status);
    showSection("detail");
}

async function fetchRequest(id) {
    const response = await fetch(`/api/appointments/requests/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
    });

    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    if (response.status === 403) {
        throw new Error("No tienes permisos para consultar esta solicitud.");
    }

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error("No se pudo obtener la solicitud.");
    }

    const data = await response.json();
    return data?.request || null;
}

async function updateRequestStatus(id, payload) {
    const response = await fetch(`/api/appointments/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
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

async function handleStatusChange(newStatus) {
    if (!requestState.id || requestState.updating) {
        return;
    }

    const payload = { status: newStatus };

    if (newStatus === "rechazado") {
        const reason = window.prompt(
            "Describe brevemente el motivo del rechazo. El cliente verá este mensaje.",
        );

        if (reason === null) {
            return;
        }

        const trimmed = reason.trim();
        if (!trimmed) {
            showFeedback("Debes ingresar un motivo para rechazar la solicitud.", "error");
            return;
        }

        payload.reason = trimmed;
    }

    requestState.updating = true;
    updateActionButtons(requestState.data?.status || "");
    showFeedback("Actualizando solicitud...", "info");

    try {
        const updatedRequest = await updateRequestStatus(requestState.id, payload);
        if (!updatedRequest) {
            throw new Error("No se pudo actualizar la solicitud.");
        }

        renderRequest(updatedRequest, { preserveFeedback: true });
        window.location.href = "./perfil.html";
    } catch (error) {
        console.error(error);
        showFeedback(
            error instanceof Error ? error.message : "No se pudo actualizar la solicitud. Intenta más tarde.",
            "error",
        );
    } finally {
        requestState.updating = false;
        updateActionButtons(requestState.data?.status || "");
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

async function initializePage() {
    showSection("loading");

    const id = parseRequestId();
    if (!id) {
        showErrorState({
            title: "Solicitud no válida",
            message: "No pudimos identificar la solicitud que quieres revisar.",
        });
        return;
    }

    requestState.id = id;

    try {
        const request = await fetchRequest(id);
        if (!request) {
            showErrorState({
                title: "No se encontró la solicitud",
                message:
                    "Es posible que haya sido eliminada o que ya no tengas acceso. Vuelve al perfil para revisar tu listado.",
            });
            return;
        }

        renderRequest(request);
    } catch (error) {
        console.error(error);
        showErrorState({
            title: "No se pudo cargar la solicitud",
            message: "Intenta nuevamente en unos minutos. Si el problema persiste contacta a soporte.",
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initializePage();

    const acceptButton = document.querySelector('[data-action="accept"]');
    const rejectButton = document.querySelector('[data-action="reject"]');
    const backButton = document.querySelector('[data-action="go-back"]');
    const logoutButton = document.getElementById("logout-button");

    if (acceptButton) {
        acceptButton.addEventListener("click", () => handleStatusChange("confirmado"));
    }

    if (rejectButton) {
        rejectButton.addEventListener("click", () => handleStatusChange("rechazado"));
    }

    if (backButton) {
        backButton.addEventListener("click", () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = "./perfil.html";
            }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
});
