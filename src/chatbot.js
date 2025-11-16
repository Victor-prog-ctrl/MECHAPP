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

  const guidedOptions = [
    {
      id: "agendar",
      label: "Agendar una cita",
      prompt: "Quiero agendar una cita paso a paso",
      summary: "Escoge servicio, tipo de visita y fecha",
      steps: [
        "Ingresa a la sección <strong>Agendar cita</strong> desde el menú superior.",
        "Elige el servicio que necesitas y selecciona si la visita será presencial o a domicilio.",
        "Selecciona la fecha y hora disponibles que mejor te acomoden.",
        "Agrega comentarios para el mecánico (por ejemplo, síntomas del vehículo o referencias).",
        "Confirma los datos y envía la solicitud. Recibirás la confirmación en tu correo."
      ]
    },
    {
      id: "registro-cliente",
      label: "Crear cuenta de cliente",
      prompt: "Necesito registrarme como cliente",
      summary: "Completa tus datos básicos",
      steps: [
        "Haz clic en <strong>Crear cuenta</strong> y selecciona la opción Cliente.",
        "Ingresa tu nombre y apellido tal como quieres que aparezcan en tu perfil.",
        "Añade tu correo electrónico y define una contraseña segura (mínimo 8 caracteres).",
        "Acepta los términos y condiciones y envía el formulario.",
        "Verifica tu bandeja de entrada para activar la cuenta si se solicita."
      ]
    },
    {
      id: "registro-mecanico",
      label: "Registro de mecánico",
      prompt: "Quiero registrarme como mecánico",
      summary: "Incluye tu certificación",
      steps: [
        "En <strong>Crear cuenta</strong> selecciona la opción Mecánico.",
        "Completa tus datos personales y de contacto.",
        "Configura una contraseña segura y acepta los términos.",
        "Una vez dentro de la plataforma, dirígete a tu perfil y sube el certificado que avala tu especialidad.",
        "Espera la validación del equipo; te avisaremos por correo cuando esté aprobada."
      ]
    },
    {
      id: "soporte",
      label: "Solicitar soporte",
      prompt: "Necesito ayuda del equipo",
      summary: "Contacta a soporte",
      steps: [
        "Describe el problema o consulta en el chat para que intentemos resolverlo al instante.",
        "Si necesitas seguimiento humano, escribe a <a href=\"mailto:soporte@mechapp.cl\">soporte@mechapp.cl</a>.",
        "Incluye capturas o datos relevantes (correo de registro, patente, hora del incidente).",
        "El equipo responderá a tu correo con los pasos siguientes.",
        "Puedes complementar la solicitud desde tu perfil si es necesario."
      ]
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
    return el;
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

    return null;
  };

  const botReply = (text, { onRender } = {}) => {
    setTimeout(() => {
      const messageElement = appendMessage("bot", text);
      if (typeof onRender === "function") {
        onRender(messageElement);
      }
    }, 400);
  };

  const showBotLoading = (text = "Buscando información en internet...") => {
    const loadingMessage = createMessageEl("bot", text, new Date());
    loadingMessage.dataset.loading = "true";
    messagesEl.appendChild(loadingMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return loadingMessage;
  };

  const removeBotLoading = (element) => {
    if (element && messagesEl.contains(element)) {
      messagesEl.removeChild(element);
    }
  };

  const fallbackMessage =
    "No encontré una respuesta exacta todavía. " +
    "Puedo ayudarte con agendamientos, registro, validaciones y soporte general. " +
    "Si quieres que te contacte una persona, escríbenos a <a href=\"mailto:soporte@mechapp.cl\">soporte@mechapp.cl</a>.";

  const fetchInternetKnowledge = async (question) => {
    const trimmed = question.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      return null;
    }

    const query = encodeURIComponent(trimmed.slice(0, 80));
    const url =
      `https://es.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&namespace=0&search=${query}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const titles = Array.isArray(data?.[1]) ? data[1] : [];
      const descriptions = Array.isArray(data?.[2]) ? data[2] : [];
      const links = Array.isArray(data?.[3]) ? data[3] : [];

      if (!titles.length || !descriptions.length) {
        return null;
      }

      const [title] = titles;
      const [description] = descriptions;
      const [link] = links;

      if (!description) {
        return null;
      }

      const safeTitle = title || "Más información";
      const safeDescription = description;
      const safeLink = link ? `<br><a href="${link}" target="_blank" rel="noopener">Leer más en Wikipedia</a>` : "";

      return (
        `Encontré esto en internet sobre <strong>${safeTitle}</strong>:<br>` +
        `${safeDescription}${safeLink}`
      );
    } catch (error) {
      console.warn("No fue posible obtener información externa", error);
      return null;
    }
  };

  let isProcessing = false;

  const handleSend = async () => {
    const raw = sanitize(inputEl.value);
    if (!raw || isProcessing) return;

    isProcessing = true;
    sendButton.disabled = true;

    appendMessage("user", raw);
    inputEl.value = "";

    const response = findResponse(raw);
    if (response) {
      botReply(response, { onRender: showGuidedOptions });
      isProcessing = false;
      sendButton.disabled = false;
      inputEl.focus();
      return;
    }

    const loadingMessage = showBotLoading();
    try {
      const internetResponse = await fetchInternetKnowledge(raw);
      removeBotLoading(loadingMessage);
      botReply(internetResponse || fallbackMessage, { onRender: showGuidedOptions });
    } catch (error) {
      console.warn("No fue posible completar la búsqueda externa", error);
      removeBotLoading(loadingMessage);
      botReply(fallbackMessage, { onRender: showGuidedOptions });
    } finally {
      isProcessing = false;
      sendButton.disabled = false;
      inputEl.focus();
    }
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

  const buildStepsMarkup = (steps) => {
    if (!Array.isArray(steps) || !steps.length) {
      return "";
    }
    const items = steps.map((step) => `<li>${step}</li>`).join("");
    return `<ol class="mecha-chatbot__steps">${items}</ol>`;
  };

  const createClickboxes = () => {
    const wrapper = document.createElement("div");
    wrapper.className = "mecha-chatbot__clickboxes";
    guidedOptions.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mecha-chatbot__clickbox";
      button.innerHTML = `<strong>${option.label}</strong><span>${option.summary}</span>`;
      button.addEventListener("click", () => {
        if (isProcessing) return;
        appendMessage("user", option.prompt);
        const response =
          `<p><strong>${option.label}</strong></p>` +
          buildStepsMarkup(option.steps) +
          `<p>¿Necesitas otra guía? Elige nuevamente una opción.</p>`;
        botReply(response, { onRender: showGuidedOptions });
      });
      wrapper.appendChild(button);
    });
    return wrapper;
  };

  const showGuidedOptions = (messageEl) => {
    const target =
      messageEl || messagesEl.querySelector(".mecha-chatbot__message--bot:last-of-type");
    if (!target) {
      return;
    }
    const existing = target.querySelector(".mecha-chatbot__clickboxes");
    if (existing) {
      existing.remove();
    }
    target.appendChild(createClickboxes());
    messagesEl.scrollTop = messagesEl.scrollHeight;
    saveHistory();
  };

  const startConversation = () => {
    const restored = restoreHistory();
    if (restored) {
      showGuidedOptions();
      return;
    }

    const greeting =
      "¡Hola! Soy <strong>Mechapp Assist</strong>. " +
      "Estoy aquí para resolver tus dudas sobre servicios, registro, mecánicos y soporte en la plataforma. " +
      "Cuéntame qué necesitas y te guiaré paso a paso. " +
      "Si lo requieres, también puedo buscar datos públicos en internet para complementar la respuesta.";
    const greetingMessage = appendMessage("bot", greeting);
    showGuidedOptions(greetingMessage);
  };

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
