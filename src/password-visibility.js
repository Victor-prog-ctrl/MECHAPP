document.addEventListener("DOMContentLoaded", () => {
    const passwordContainers = document.querySelectorAll(".password-input");

    passwordContainers.forEach((container) => {
        const input = container.querySelector("[data-password-input]");
        const toggleButton = container.querySelector("[data-password-toggle]");

        if (!input || !toggleButton) {
            return;
        }

        const updateState = () => {
            const isVisible = input.type === "text";
            toggleButton.setAttribute("aria-pressed", isVisible ? "true" : "false");
            toggleButton.setAttribute("aria-label", isVisible ? "Ocultar contraseña" : "Mostrar contraseña");
            toggleButton.classList.toggle("is-visible", isVisible);
        };

        toggleButton.addEventListener("click", () => {
            input.type = input.type === "password" ? "text" : "password";
            updateState();
            if (typeof input.focus === "function") {
                input.focus();
            }
        });

        toggleButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
        });

        updateState();
    });
});
