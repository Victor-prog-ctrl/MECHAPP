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

async function setupProfilePage() {
    try {
        const profile = await fetchProfile();
        if (!profile) {
            return;
        }

        renderProfile(profile);
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
