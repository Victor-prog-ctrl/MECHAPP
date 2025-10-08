form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!submitButton) return;

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (handleUnauthorized(response)) return;

    let data = {};
    try { data = await response.json(); } catch { /* continuar con mensaje genérico */ }

    if (!response.ok) {
      const errorMessage = data.error || "No se pudo guardar el cambio. Intenta de nuevo.";
      showFeedback(feedbackElement, errorMessage, "error");
      return;
    }

    showFeedback(feedbackElement, data.message || "Cambios guardados correctamente.", "success");
    if (updateType === "password") form.reset();

    
    window.location.replace("./perfil.html");
    return;
  } catch (error) {
    console.error(error);
    showFeedback(
      feedbackElement,
      "No se pudo completar la solicitud. Verifica tu conexión e inténtalo nuevamente.",
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
});
