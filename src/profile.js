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
    switch (status) {
        case "confirmado":
            return "Confirmado";
        case "completado":
            return "Completado";
        case "cancelado":
            return "Cancelado";
        default:
            return "Pendiente";
    }
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

function renderMechanicRequests(requests, { errorMessage } = {}) {
    const container = document.querySelector("[data-mechanic-requests]");
    const emptyState = document.querySelector("[data-mechanic-empty]");

    if (!container) {
        return;
    }

    const normalizedRequests = Array.isArray(requests) ? requests : [];

    if (!normalizedRequests.length) {
        container.innerHTML = "";
        if (emptyState) {
            emptyState.textContent = errorMessage ||
                "No tienes solicitudes pendientes por ahora. Cuando un cliente agende contigo aparecerá aquí.";
            emptyState.hidden = false;
        }
        return;
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    const fragment = document.createDocumentFragment();

    normalizedRequests.forEach((request) => {
        const article = document.createElement("article");
        article.className = "request-card";

        const header = document.createElement("div");
        header.className = "request-header";

        const title = document.createElement("h3");
        title.textContent = request.service || "Servicio solicitado";
        header.appendChild(title);

        const status = document.createElement("span");
        status.className = "request-status";
        status.textContent = getStatusLabel(request.status);
        header.appendChild(status);

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

        fragment.appendChild(article);
    });

    container.innerHTML = "";
    container.appendChild(fragment);
}

async function fetchMechanicRequests() {
    const response = await fetch("/api/appointments/requests");

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

async function setupProfilePage() {
    try {
        const profile = await fetchProfile();
        if (!profile) {
            return;
        }

        renderProfile(profile);

        const isMechanic = profile.accountType === "mecanico";
        toggleMechanicSection(isMechanic);

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
        }
    } catch (error) {
        console.error(error);
    }
}

async function handleLogout() {
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
    setupProfilePage();
    setupSubscriptionForm();

    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
});
