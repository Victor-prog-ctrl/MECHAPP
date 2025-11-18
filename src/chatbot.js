(() => {
  if (window.__mechappChatbotLoaded) {
    return;
  }
  window.__mechappChatbotLoaded = true;

  const PROMPT_DESCRIPTION = `Eres Mechapp Assist, un copiloto experto en mantenimiento automotriz. ` +
    `Ayudas tanto a conductores como a mecánicos a aprovechar la plataforma: resolver dudas sobre agendamiento, ` +
    `registro, servicios ofrecidos, cobertura y soporte. Usa un tono cercano, proactivo y claro. ` +
    `Si una respuesta requiere acciones dentro del sitio, guía paso a paso. Si no sabes algo, reconoce el límite y ofrece escalamiento.`;

  const knowledgeBase = [
    {
      keywords: ["cita", "agendar", "agenda", "servicio", "visita", "domicilio", "presencial"],
      response:
        "Para agendar una cita entra en la sección <strong>Agendar cita</strong>. " +
        "Selecciona el servicio, el tipo de visita (presencial o a domicilio), la fecha y agrega comentarios. " +
        "Si eliges domicilio recuerda confirmar tu dirección o ubicarte con el mapa."
    },
    {
      keywords: ["registr", "crear cuenta", "signup", "cuenta"],
      response:
        "Puedes registrarte como cliente o mecánico desde <strong>Crear cuenta</strong>. " +
        "El formulario te pedirá nombre, correo y una contraseña segura. Si eres mecánico marca tu rol y carga tu certificado posteriormente en tu perfil."
    },
    {
      keywords: ["login", "ingresar", "acceder", "contraseña"],
      response:
        "Inicia sesión desde la página <strong>Iniciar sesión</strong>. Si olvidaste tu contraseña utiliza la opción <em>¿Olvidaste tu contraseña?</em> para recibir un enlace de recuperación en tu correo."
    },
    {
      keywords: ["perfil", "datos", "actualizar", "editar"],
      response:
        "En tu perfil puedes actualizar nombre, correo y contraseña desde las opciones de edición. " +
        "Si eres mecánico también podrás subir o reemplazar tu certificado para validación."
    },
    {
      keywords: ["certific", "valid", "documento"],
      response:
        "Nuestro equipo revisa los certificados de los mecánicos. Tras subirlo, el estado cambia a pendiente y recibirás una notificación cuando se valide o si necesitamos correcciones."
    },
    {
      keywords: ["resena", "reseñas", "opiniones", "calificacion"],
      response:
        "En la sección de <strong>Reseñas</strong> encuentras comentarios de clientes sobre mecánicos certificados. Te ayuda a elegir con confianza."
    },
    {
      keywords: ["contacto", "soporte", "ayuda", "problema"],
      response:
        "Si necesitas soporte adicional escríbenos a <a href=\"mailto:soporte@mechapp.cl\">soporte@mechapp.cl</a>. " +
        "Describe el inconveniente y te acompañaremos paso a paso."
    },
    {
      keywords: ["ubicacion", "comuna", "mapa", "cobertura"],
      response:
        "Actualmente operamos en la Región Metropolitana. Usa el buscador de comunas o tu ubicación actual en la página de inicio para encontrar mecánicos cercanos."
    }
  ];

  const suggestedPrompts = [
    "¿Cómo agendo una visita a domicilio?",
    "Quiero registrarme como mecánico",
    "Necesito cambiar mi contraseña",
    "¿Qué zonas cubre Mechapp?"
  ];

  const quickActions = [
    {
      label: "Agendar cita",
      response:
        "Para agendar una cita ve a <strong>Agendar cita</strong> y sigue estos pasos:<br>" +
        "1) Elige el servicio que necesitas.<br>" +
        "2) Selecciona si la atención será presencial o a domicilio.<br>" +
        "3) Define fecha y hora disponibles.<br>" +
        "4) Deja un comentario con detalles del auto o la falla.<br>" +
        "5) Confirma. Si es a domicilio, revisa tu dirección o compártela con el mapa."
    },
    {
      label: "Crear cuenta",
      response:
        "Desde <strong>Crear cuenta</strong> completa nombre, correo y contraseña segura. " +
        "Si eres mecánico marca tu rol y luego sube el certificado desde tu perfil para validarlo."
    },
    {
      label: "Cambiar contraseña",
      response:
        "Ingresa a <strong>Iniciar sesión</strong> y usa la opción <em>¿Olvidaste tu contraseña?</em>. " +
        "Recibirás un enlace en tu correo para crear una nueva clave de forma segura."
    },
    {
      label: "Cobertura",
      response:
        "Actualmente atendemos en la Región Metropolitana. Puedes buscar por comuna o usar tu ubicación en la página principal para ver mecánicos cercanos."
    },
    {
      label: "Soporte",
      response:
        "Si necesitas ayuda inmediata escríbenos a <a href=\"mailto:soporte@mechapp.cl\">soporte@mechapp.cl</a> con los detalles del problema y tu correo registrado."
    }
  ];

  const container = document.createElement("div");
  container.className = "mecha-chatbot";
  container.innerHTML = `
    <button class="mecha-chatbot__toggle" type="button" aria-label="Abrir asistente de ayuda">
      <span aria-hidden="true">💬</span>
    </button>
    <section class="mecha-chatbot__panel" aria-live="polite" aria-label="Asistente virtual de Mechapp" role="dialog">
      <header class="mecha-chatbot__header">
        <div class="mecha-chatbot__avatar">M</div>
        <div>
          <p class="mecha-chatbot__title">Mechapp Assist</p>
          <p class="mecha-chatbot__status">Disponible · uso gratuito</p>
        </div>
      </header>
      <div class="mecha-chatbot__messages" data-chatbot-messages></div>
      <div class="mecha-chatbot__quick-actions" data-chatbot-quick-actions></div>
      <footer class="mecha-chatbot__footer">
        <label class="sr-only" for="mecha-chatbot-input">Escribe tu mensaje</label>
        <textarea id="mecha-chatbot-input" class="mecha-chatbot__input" rows="1" placeholder="Escribe tu duda" aria-label="Escribe tu mensaje"></textarea>
        <button class="mecha-chatbot__send" type="button">
          <span>Enviar</span>
        </button>
      </footer>
    </section>
  `;

  const srStyles = document.createElement("style");
  srStyles.textContent = `.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;}`;
  document.head.appendChild(srStyles);
  document.body.appendChild(container);

  const toggleButton = container.querySelector(".mecha-chatbot__toggle");
  const panel = container.querySelector(".mecha-chatbot__panel");
  const messagesEl = container.querySelector("[data-chatbot-messages]");
  const inputEl = container.querySelector("#mecha-chatbot-input");
  const sendButton = container.querySelector(".mecha-chatbot__send");
  const quickActionsEl = container.querySelector("[data-chatbot-quick-actions]");

  const storageKey = "mechapp-chatbot-history";

  const formatTime = (date) => {
    return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  const createMessageEl = (role, text, timestamp) => {
    const wrapper = document.createElement("article");
    wrapper.className = `mecha-chatbot__message mecha-chatbot__message--${role}`;
    wrapper.innerHTML = `<span>${text}</span><span class="mecha-chatbot__time">${formatTime(timestamp)}</span>`;
    return wrapper;
  };

  const saveHistory = () => {
    const payload = Array.from(messagesEl.querySelectorAll(".mecha-chatbot__message")).map((el) => ({
      role: el.classList.contains("mecha-chatbot__message--bot") ? "bot" : "user",
      text: el.firstElementChild?.innerHTML || "",
      time: el.querySelector(".mecha-chatbot__time")?.textContent || ""
    }));

    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("No fue posible guardar el historial del chatbot", error);
    }
  };

  const restoreHistory = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!Array.isArray(saved) || !saved.length) {
        return false;
      }

      saved.forEach((entry) => {
        const messageEl = document.createElement("article");
        messageEl.className = `mecha-chatbot__message mecha-chatbot__message--${entry.role}`;
        messageEl.innerHTML = `<span>${entry.text}</span><span class="mecha-chatbot__time">${entry.time}</span>`;
        messagesEl.appendChild(messageEl);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return true;
    } catch (error) {
      console.warn("No fue posible restaurar el historial del chatbot", error);
      return false;
    }
  };

  const appendMessage = (role, text) => {
    const timestamp = new Date();
    const el = createMessageEl(role, text, timestamp);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    saveHistory();
  };

  const sanitize = (input) => input.trim();

  const findResponse = (text) => {
    const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const entry = knowledgeBase.find((item) =>
      item.keywords.some((keyword) => normalized.includes(keyword))
    );

    if (entry) {
      return entry.response;
    }

    return (
      "No tengo una respuesta exacta para eso todavía. " +
      "Puedo ayudarte con agendamientos, registro, validaciones y soporte general. " +
      "Si quieres que te contacte una persona, escríbenos a <a href=\"mailto:soporte@mechapp.cl\">soporte@mechapp.cl</a>."
    );
  };

  const botReply = (text) => {
    setTimeout(() => {
      appendMessage("bot", text);
    }, 400);
  };

  const handleSend = () => {
    const raw = sanitize(inputEl.value);
    if (!raw) return;

    appendMessage("user", raw);
    inputEl.value = "";
    const response = findResponse(raw);
    botReply(response);
  };

  toggleButton.addEventListener("click", () => {
    container.classList.toggle("mecha-chatbot--open");
    if (container.classList.contains("mecha-chatbot--open")) {
      inputEl.focus();
    }
  });

  sendButton.addEventListener("click", handleSend);

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  const renderSuggestions = () => {
    if (!suggestedPrompts.length) {
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "mecha-chatbot__suggestions";
    suggestedPrompts.forEach((prompt) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mecha-chatbot__suggestion";
      button.textContent = prompt;
      button.addEventListener("click", () => {
        inputEl.value = prompt;
        handleSend();
      });
      wrapper.appendChild(button);
    });
    const lastBotMessage = messagesEl.querySelector(
      ".mecha-chatbot__message--bot:last-of-type"
    );
    if (lastBotMessage) {
      lastBotMessage.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  const renderQuickActions = () => {
    if (!quickActionsEl || !quickActions.length) {
      return;
    }

    quickActionsEl.innerHTML = "";

    const title = document.createElement("p");
    title.className = "mecha-chatbot__quick-actions-title";
    title.textContent = "Atajos rápidos";
    quickActionsEl.appendChild(title);

    const list = document.createElement("div");
    list.className = "mecha-chatbot__quick-actions-list";

    quickActions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mecha-chatbot__quick-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        appendMessage("user", action.label);
        botReply(action.response);
      });
      list.appendChild(button);
    });

    quickActionsEl.appendChild(list);
  };

  const startConversation = () => {
    const restored = restoreHistory();
    if (restored) {
      return;
    }

    const greeting =
      "¡Hola! Soy <strong>Mechapp Assist</strong>. " +
      "Estoy aquí para resolver tus dudas sobre servicios, registro, mecánicos y soporte en la plataforma. " +
      "Cuéntame qué necesitas y te guiaré paso a paso.";
    appendMessage("bot", greeting);
    renderSuggestions();
  };

  renderQuickActions();
  startConversation();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && container.classList.contains("mecha-chatbot--open")) {
      container.classList.remove("mecha-chatbot--open");
      toggleButton.focus();
    }
  });

  // Expone el prompt descriptivo para depuración
  window.mechappChatbotPrompt = PROMPT_DESCRIPTION;
})();
