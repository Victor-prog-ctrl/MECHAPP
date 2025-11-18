const UPDATE_ENDPOINTS = {
    name: "/api/profile/name",
    email: "/api/profile/email",
    password: "/api/profile/password",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULES = [
    {
        key: "length",
        test: (value) => value.length >= 8,
    },
    {
        key: "complexity",
        test: (value) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) && /(\d|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s])/.test(value),
    },
];

function showFeedback(element, message, type = "info") {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.classList.remove("success", "error", "info");
    element.classList.add(type);
    element.hidden = false;
}

function clearFeedback(element) {
    if (!element) {
        return;
    }

    element.textContent = "";
    element.classList.remove("success", "error", "info");
    element.classList.add("info");
    element.hidden = true;
}

function handleUnauthorized(response) {
    if (response.status === 401) {
        window.location.href = "./login.html";
        return true;
    }
    return false;
}

async function fetchProfileOrRedirect() {
    try {
        const response = await fetch("/api/profile");

        if (handleUnauthorized(response)) {
            return null;
        }

        if (!response.ok) {
            throw new Error("No se pudo obtener la información del perfil.");
        }

        return response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function getNamePayload(form, feedbackElement) {
    const nameInput = form.querySelector('input[name="name"]');
    const trimmedName = String(nameInput?.value || "").trim();

    if (!trimmedName) {
        showFeedback(feedbackElement, "Ingresa un nombre válido.", "error");
        nameInput?.focus();
        return null;
    }

    return { endpoint: UPDATE_ENDPOINTS.name, payload: { name: trimmedName } };
}

function getEmailPayload(form, feedbackElement) {
    const emailInput = form.querySelector('input[name="email"]');
    const normalizedEmail = String(emailInput?.value || "").trim().toLowerCase();

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
        showFeedback(feedbackElement, "Ingresa un correo electrónico válido.", "error");
        emailInput?.focus();
        return null;
    }

    return { endpoint: UPDATE_ENDPOINTS.email, payload: { email: normalizedEmail } };
}

function getPasswordPayload(form, feedbackElement) {
    const currentPasswordInput = form.querySelector('input[name="currentPassword"]');
    const newPasswordInput = form.querySelector('input[name="newPassword"]');
    const confirmPasswordInput = form.querySelector('input[name="confirmPassword"]');

    const currentPassword = String(currentPasswordInput?.value || "");
    const newPassword = String(newPasswordInput?.value || "");
    const confirmPassword = String(confirmPasswordInput?.value || "");

    if (!currentPassword) {
        showFeedback(feedbackElement, "Ingresa tu contraseña actual.", "error");
        currentPasswordInput?.focus();
        return null;
    }

    if (newPassword.length < 8) {
        showFeedback(feedbackElement, "La nueva contraseña debe tener al menos 8 caracteres.", "error");
        newPasswordInput?.focus();
        return null;
    }

    if (newPassword !== confirmPassword) {
        showFeedback(feedbackElement, "La confirmación no coincide con la nueva contraseña.", "error");
        confirmPasswordInput?.focus();
        return null;
    }

    return {
        endpoint: UPDATE_ENDPOINTS.password,
        payload: { currentPassword, newPassword },
    };
}

function updatePasswordRuleStates(form, passwordValue) {
    if (!form) {
        return;
    }

    const value = String(passwordValue || "").trim();
    const hasValue = value.length > 0;

    PASSWORD_RULES.forEach((rule) => {
        const item = form.querySelector(`[data-password-rule="${rule.key}"]`);
        if (!item) {
            return;
        }

        const isValid = rule.test(value);
        item.classList.toggle("valid", isValid);
        item.classList.toggle("invalid", !isValid && hasValue);
        item.classList.toggle("pending", !hasValue);
    });
}

function setupPasswordRuleValidation(form) {
    const newPasswordInput = form?.querySelector('input[name="newPassword"]');

    if (!newPasswordInput) {
        return;
    }

    const updateRules = () => updatePasswordRuleStates(form, newPasswordInput.value || "");

    newPasswordInput.addEventListener("input", updateRules);
    newPasswordInput.addEventListener("blur", updateRules);

    updateRules();
}

function getRequestData(form, updateType, feedbackElement) {
    switch (updateType) {
        case "name":
            return getNamePayload(form, feedbackElement);
        case "email":
            return getEmailPayload(form, feedbackElement);
        case "password":
            return getPasswordPayload(form, feedbackElement);
        default:
            console.warn("Tipo de actualización no soportado:", updateType);
            return null;
    }
}

async function handleSubmit(event, options) {
    event.preventDefault();

    const { form, updateType, feedbackElement, submitButton, redirect } = options;

    if (!submitButton) {
        return;
    }

    const requestData = getRequestData(form, updateType, feedbackElement);
    if (!requestData) {
        return;
    }

    const { endpoint, payload } = requestData;

    try {
        submitButton.disabled = true;
        showFeedback(feedbackElement, "Guardando cambios...", "info");

        const response = await fetch(endpoint, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (handleUnauthorized(response)) {
            return;
        }

        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            // Ignorar errores de parseo y continuar con mensajes genéricos.
        }

        if (!response.ok) {
            const errorMessage = data.error || "No se pudo guardar el cambio. Intenta de nuevo.";
            showFeedback(feedbackElement, errorMessage, "error");
            return;
        }

        showFeedback(feedbackElement, data.message || "Cambios guardados correctamente.", "success");

        if (updateType === "password") {
            form.reset();
            updatePasswordRuleStates(form, "");
        }

        redirect();
    } catch (error) {
        console.error(error);
        showFeedback(
            feedbackElement,
            "No se pudo completar la solicitud. Verifica tu conexión e inténtalo nuevamente.",
            "error",
        );
    } finally {
        submitButton.disabled = false;
    }
}

function setupRedirect() {
    let redirecting = false;

    return () => {
        if (redirecting) {
            return;
        }

        redirecting = true;
        setTimeout(() => {
            window.location.replace("./perfil.html");
        }, 1500);
    };
}

async function initializeForm() {
    const form = document.querySelector("[data-update-form]");

    if (!form) {
        return;
    }

    const updateType = form.dataset.updateType;
    const feedbackElement = document.querySelector("[data-feedback]");
    const submitButton = form.querySelector('button[type="submit"]');

    clearFeedback(feedbackElement);

    if (updateType === "name" || updateType === "email") {
        try {
            const profile = await fetchProfileOrRedirect();
            if (!profile) {
                return;
            }

            if (updateType === "name") {
                const nameInput = form.querySelector('input[name="name"]');
                if (nameInput) {
                    nameInput.value = profile.name || "";
                }
            }

            if (updateType === "email") {
                const emailInput = form.querySelector('input[name="email"]');
                if (emailInput) {
                    emailInput.value = profile.email || "";
                }
            }
        } catch (error) {
            showFeedback(feedbackElement, "No se pudo cargar la información del perfil.", "error");
            return;
        }
    }

    if (updateType === "password") {
        setupPasswordRuleValidation(form);
    }

    const redirect = setupRedirect();

    form.addEventListener("submit", (event) =>
        handleSubmit(event, {
            form,
            updateType,
            feedbackElement,
            submitButton,
            redirect,
        }),
    );
}

document.addEventListener("DOMContentLoaded", () => {
    initializeForm();
});
