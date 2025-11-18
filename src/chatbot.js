(() => {
  if (window.__mechappChatbotLoaded) {
    return;
  }
  window.__mechappChatbotLoaded = true;

  const suggestedPrompts = [
    "¿Cómo agendo una visita a domicilio?",
    "Quiero registrarme como mecánico",
    "Necesito cambiar mi contraseña",
    "¿Qué zonas cubre Mechapp?",
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
          <p class="mecha-chatbot__status">Disponible · Potenciado por IA</p>
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
  const messagesEl = container.querySelector("[data-chatbot-messages]");
  const inputEl = container.querySelector("#mecha-chatbot-input");
  const sendButton = container.querySelector(".mecha-chatbot__send");

  const storageKey = "mechapp-chatbot-history";
  const chatHistory = [];

  const escapeHtml = (text = "") =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = ({ role, content, timestamp }) => {
    const wrapper = document.createElement("article");
    const variant = role === "assistant" ? "bot" : "user";
    wrapper.className = `mecha-chatbot__message mecha-chatbot__message--${variant}`;
    wrapper.innerHTML = `<span>${escapeHtml(content)}</span><span class="mecha-chatbot__time">${formatTime(
      timestamp
    )}</span>`;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const saveHistory = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(chatHistory));
    } catch (error) {
      console.warn("No fue posible guardar el historial del chatbot", error);
    }
  };

  const restoreHistory = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!Array.isArray(saved) || !saved.length) return false;

      chatHistory.push(...saved);
      saved.forEach((entry) => renderMessage(entry));
      return true;
    } catch (error) {
      console.warn("No fue posible restaurar el historial del chatbot", error);
      return false;
    }
  };

  const persistMessage = (role, content, timestamp = Date.now()) => {
    const entry = { role, content, timestamp };
    chatHistory.push(entry);
    renderMessage(entry);
    saveHistory();
  };

  const setSending = (sending) => {
    sendButton.disabled = sending;
    inputEl.disabled = sending;
    sendButton.textContent = sending ? "Enviando..." : "Enviar";
  };

  const sanitize = (input) => input.trim();

  const renderSuggestions = () => {
    if (!suggestedPrompts.length) return;

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

    const lastBotMessage = messagesEl.querySelector(".mecha-chatbot__message--bot:last-of-type");
    if (lastBotMessage) {
      lastBotMessage.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  const requestAssistantResponse = async () => {
    setSending(true);
    try {
      const payload = chatHistory.map(({ role, content }) => ({ role, content }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = sanitize(data.error || `No se pudo contactar al asistente (estado ${response.status}).`);
        throw new Error(message);
      }

      const reply = sanitize(data.reply || "");

      if (!reply) {
        throw new Error("Respuesta vacía del asistente");
      }

      persistMessage("assistant", reply);
    } catch (error) {
      console.error("Chatbot error", error);
      const fallback = error?.message
        ? `Error: ${error.message}`
        : "Hubo un problema para contactar al asistente. Intenta nuevamente en unos segundos.";
      persistMessage("assistant", fallback);
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    const raw = sanitize(inputEl.value || "");
    if (!raw) return;

    persistMessage("user", raw);
    inputEl.value = "";
    requestAssistantResponse();
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

  const startConversation = () => {
    const restored = restoreHistory();
    if (restored) return;

    const greeting =
      "¡Hola! Soy Mechapp Assist. Estoy aquí para resolver tus dudas sobre servicios, registro, mecánicos y soporte en la plataforma. Cuéntame qué necesitas y te guiaré paso a paso.";
    persistMessage("assistant", greeting);
    renderSuggestions();
  };

  startConversation();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && container.classList.contains("mecha-chatbot--open")) {
      container.classList.remove("mecha-chatbot--open");
      toggleButton.focus();
    }
  });

  window.mechappChatbotPrompt = "Conectado a /api/chat con OpenAI";
})();
