const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRuleDefinitions = [
    {
        key: "length",
        message: "La contraseña debe tener al menos 8 caracteres.",
        test: (value) => value.length >= 8,
    },
    {
        key: "uppercase",
        message: "La contraseña debe incluir al menos una letra mayúscula.",
        test: (value) => /[A-ZÁÉÍÓÚÜÑ]/.test(value),
    },
    {
        key: "lowercase",
        message: "La contraseña debe incluir al menos una letra minúscula.",
        test: (value) => /[a-záéíóúüñ]/.test(value),
    },
    {
        key: "numberOrSymbol",
        message: "La contraseña debe incluir un número o símbolo.",
        test: (value) => /(\d|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s])/.test(value),
    },
];

const formConfigurations = {
    login: {
        fields: {
            email: [
                (value) => (!value ? "Ingresa tu correo electrónico." : null),
                (value) => (value && emailPattern.test(value) ? null : "Ingresa un correo electrónico válido."),
            ],
            password: [passwordValidator],
        },
    },
    register: {
        fields: {
            name: [
                (value) => (!value ? "Ingresa tu nombre completo." : null),
                (value) => (value && value.length >= 3 ? null : "Tu nombre debe tener al menos 3 caracteres."),
            ],
            email: [
                (value) => (!value ? "Ingresa tu correo electrónico." : null),
                (value) => (value && emailPattern.test(value) ? null : "Ingresa un correo electrónico válido."),
            ],
            password: [passwordValidator],
            "confirm-password": [
                (value) => (!value ? "Confirma tu contraseña." : null),
                (value, form) => {
                    const password = form.querySelector('input[name="password"]');
                    const normalizedPassword = password ? getNormalizedValue(password) : "";
                    if (password && value !== normalizedPassword) {
                        return "Las contraseñas no coinciden.";
                    }
                    return null;
                },
            ],
            "account-type": [
                (value) => (!value ? "Selecciona un tipo de cuenta." : null),
            ],
            certificate: [
                (value, form) => {
                    const accountType = form.querySelector('#account-type');
                    const isMechanic = accountType && accountType.value === "mecanico";
                    if (!isMechanic) {
                        return null;
                    }

                    const hasFile = value && value.length > 0;
                    return hasFile ? null : "Adjunta tu certificación profesional.";
                },
            ],
        },
    },
    recovery: {
        fields: {
            email: [
                (value) => (!value ? "Ingresa tu correo electrónico." : null),
                (value) => (value && emailPattern.test(value) ? null : "Ingresa un correo electrónico válido."),
            ],
        },
    },
};

function passwordValidator(value) {
    const errors = [];
    if (!value) {
        errors.push("Ingresa una contraseña.");
        return errors;
    }

    passwordRuleDefinitions.forEach((rule) => {
        if (!rule.test(value)) {
            errors.push(rule.message);
        }
    });

    return errors;
}

function normalizeErrors(result) {
    if (!result) {
        return [];
    }

    if (Array.isArray(result)) {
        return result.filter(Boolean);
    }

    return [result];
}

function getNormalizedValue(field) {
    if (!field) {
        return "";
    }

    if (field.type === "file") {
        return field.files;
    }

    if (field.type === "checkbox") {
        return field.checked;
    }

    return field.value.trim();
}

function getFieldErrors(field, config) {
    const fieldName = field?.getAttribute("name");
    const validators = (fieldName && config.fields[fieldName]) || [];
    const value = getNormalizedValue(field);
    const form = field?.form;

    return validators.flatMap((validator) => normalizeErrors(validator(value, form, field)));
}

function renderFieldErrors(field, errors, showErrors) {
    const errorId = field.getAttribute("aria-describedby");
    const errorContainer = errorId ? field.form?.querySelector(`#${errorId}`) : null;

    if (errorContainer) {
        errorContainer.textContent = showErrors ? errors.join(" ") : "";
    }

    const isInvalid = errors.length > 0;
    field.setAttribute("aria-invalid", showErrors && isInvalid ? "true" : "false");
}

function updatePasswordRules(form, passwordValue) {
    if (!form) {
        return;
    }

    const ruleItems = form.querySelectorAll("[data-password-rule]");
    if (!ruleItems.length) {
        return;
    }

    const value = (passwordValue || "").trim();

    passwordRuleDefinitions.forEach((rule) => {
        const item = form.querySelector(`[data-password-rule="${rule.key}"]`);
        if (item) {
            item.classList.toggle("valid", rule.test(value));
        }
    });
}

function setupForm(form) {
    const formType = form.dataset.form;
    const config = formConfigurations[formType];

    if (!config) {
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const fieldEntries = Object.keys(config.fields).map((name) => {
        const element = form.querySelector(`[name="${name}"]`);
        return element || null;
    });

    const fields = fieldEntries.filter(Boolean);

    const updateSubmitState = () => {
        const allValid = fields.every((field) => getFieldErrors(field, config).length === 0);
        if (submitButton) {
            submitButton.disabled = !allValid;
            submitButton.setAttribute("aria-disabled", submitButton.disabled ? "true" : "false");
        }
    };

    const validateField = (field, { force = false } = {}) => {
        if (!field) {
            return [];
        }

        const errors = getFieldErrors(field, config);
        const shouldShow = force || field.dataset.touched === "true";

        if (field.getAttribute("name") === "password") {
            const normalizedValue = getNormalizedValue(field);
            const value = typeof normalizedValue === "string" ? normalizedValue : "";
            updatePasswordRules(form, value);
        }

        renderFieldErrors(field, errors, shouldShow);
        return errors;
    };

    fields.forEach((field) => {
        field.setAttribute("aria-invalid", "false");

        const isFile = field.type === "file";
        const isSelect = field.tagName === "SELECT";
        const eventType = isFile || isSelect ? "change" : "input";

        field.addEventListener(eventType, () => {
            if (!field.dataset.touched) {
                field.dataset.touched = "true";
            }

            validateField(field, { force: field.dataset.touched === "true" });

            if (field.getAttribute("name") === "password") {
                const confirmField = form.querySelector('input[name="confirm-password"]');
                if (confirmField) {
                    validateField(confirmField, { force: confirmField.dataset.touched === "true" });
                }
            }

            updateSubmitState();
        });

        field.addEventListener("blur", () => {
            field.dataset.touched = "true";
            validateField(field, { force: true });
            updateSubmitState();
        });

        if (field.getAttribute("name") === "password") {
            const normalizedValue = getNormalizedValue(field);
            const value = typeof normalizedValue === "string" ? normalizedValue : "";
            updatePasswordRules(form, value);
        }
    });

    updateSubmitState();

    form.addEventListener("submit", (event) => {
        const invalidFields = fields.filter((field) => validateField(field, { force: true }).length > 0);

        if (invalidFields.length > 0) {
            event.preventDefault();
            invalidFields[0]?.focus();
            return;
        }

        if (formType === "login") {
            event.preventDefault();
            window.location.href = "./paginainicio.html";
        }
    });

    if (formType === "register") {
        setupRegisterExtras(form, config, fields, validateField, updateSubmitState);
    }
}

function setupRegisterExtras(form, config, fields, validateField, updateSubmitState) {
    const accountTypeField = form.querySelector("#account-type");
    const certificateFieldWrapper = form.querySelector("#certificate-field");
    const certificateInput = form.querySelector("#certificate");

    const toggleCertificate = () => {
        const isMechanic = accountTypeField?.value === "mecanico";

        certificateFieldWrapper?.classList.toggle("hidden", !isMechanic);

        if (certificateInput) {
            certificateInput.required = Boolean(isMechanic);
            if (!isMechanic) {
                certificateInput.value = "";
            }
            validateField(certificateInput, { force: certificateInput.dataset.touched === "true" });
        }

        updateSubmitState();
    };

    if (accountTypeField) {
        accountTypeField.addEventListener("change", () => {
            accountTypeField.dataset.touched = "true";
            validateField(accountTypeField, { force: true });
            toggleCertificate();
        });

        toggleCertificate();
    }

    if (certificateInput && !fields.includes(certificateInput)) {
        fields.push(certificateInput);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const forms = document.querySelectorAll("form[data-form]");
    forms.forEach((form) => setupForm(form));
});
