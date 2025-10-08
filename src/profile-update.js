async function fetchProfileOrRedirect() {
    const response = await fetch("/api/profile");

    if (response.status === 401) {
        window.location.href = "./login.html";
        return null;
    }

    if (!response.ok) {
        throw new Error("No se pudo obtener la información del perfil.");
    }

    return response.json();
}

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
            } else if (updateType === "email") {
                const emailInput = form.querySelector('input[name="email"]');
                if (emailInput) {
                    emailInput.value = profile.email || "";
                }
            }
        } catch (error) {
            console.error(error);
            showFeedback(feedbackElement, "No se pudo cargar la información del perfil.", "error");
            return;
        }
    }

 
    let redirecting = false;



    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!submitButton) {
            return;
        }

        let endpoint = "";
        let payload = {};

        switch (updateType) {
            case "name": {
                const nameInput = form.querySelector('input[name="name"]');
                const trimmedName = String(nameInput?.value || "").trim();

                if (!trimmedName) {
                    showFeedback(feedbackElement, "Ingresa un nombre válido.", "error");
                    nameInput?.focus();
                    return;
                }

                endpoint = "/api/profile/name";
                payload = { name: trimmedName };
                break;
            }
            case "email": {
                const emailInput = form.querySelector('input[name="email"]');
                const normalizedEmail = String(emailInput?.value || "").trim().toLowerCase();
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
                    showFeedback(feedbackElement, "Ingresa un correo electrónico válido.", "error");
                    emailInput?.focus();
                    return;
                }

                endpoint = "/api/profile/email";
                payload = { email: normalizedEmail };
                break;
            }
            case "password": {
                const currentPasswordInput = form.querySelector('input[name="currentPassword"]');
                const newPasswordInput = form.querySelector('input[name="newPassword"]');
                const confirmPasswordInput = form.querySelector('input[name="confirmPassword"]');

                const currentPassword = String(currentPasswordInput?.value || "");
                const newPassword = String(newPasswordInput?.value || "");
                const confirmPassword = String(confirmPasswordInput?.value || "");

                if (!currentPassword) {
                    showFeedback(feedbackElement, "Ingresa tu contraseña actual.", "error");
                    currentPasswordInput?.focus();
                    return;
                }

                if (newPassword.length < 8) {
                    showFeedback(feedbackElement, "La nueva contraseña debe tener al menos 8 caracteres.", "error");
                    newPasswordInput?.focus();
                    return;
                }

                if (newPassword !== confirmPassword) {
                    showFeedback(feedbackElement, "La confirmación no coincide con la nueva contraseña.", "error");
                    confirmPasswordInput?.focus();
                    return;
                }

                endpoint = "/api/profile/password";
                payload = { currentPassword, newPassword };
                break;
            }
            default:
                console.warn("Tipo de actualización no soportado:", updateType);
                return;
        }

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
                // Ignorar errores de parseo y usar mensajes genéricos.
            }

            if (!response.ok) {
                const errorMessage = data.error || "No se pudo guardar el cambio. Intenta de nuevo.";
                showFeedback(feedbackElement, errorMessage, "error");
                return;
            }

            showFeedback(feedbackElement, data.message || "Cambios guardados correctamente.", "success");

            if (updateType === "password") {
                form.reset();
            }

<<<<<<< HEAD
 
=======

            redirecting = true;
            setTimeout(() => {
                window.location.replace("./perfil.html");
            }, 0);
            return;
        } catch (error) {
            console.error(error);

            if (redirecting && (error?.name === "AbortError" || error?.message === "Failed to fetch" || error?.message === "The user aborted a request.")) {
                return;
            }


>>>>>>> 790dec9f7b2ecfe6cb146c67ee00453ea7f68275
            window.location.replace("./perfil.html");

            setTimeout(() => {
                window.location.href = "./perfil.html";
            }, 1500);
<<<<<<< HEAD
 
=======

>>>>>>> 790dec9f7b2ecfe6cb146c67ee00453ea7f68275
        } catch (error) {
            console.error(error);

            showFeedback(feedbackElement, "No se pudo completar la solicitud. Verifica tu conexión e inténtalo nuevamente.", "error");
        } finally {
            submitButton.disabled = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initializeForm();
});
