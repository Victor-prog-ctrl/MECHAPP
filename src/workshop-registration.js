(function () {
  const SERVICE_OPTIONS = Array.from(
    new Set([
      'Mantenimiento general y preventivo',
      'Cambio de aceite y filtros',
      'Afinación y escáner computarizado',
      'Diagnóstico electrónico avanzado',
      'Diagnóstico eléctrico y electrónico',
      'Programación de módulos y sensores',
      'Reparación de frenos y ABS',
      'Servicio de frenos completos',
      'Reparación de frenos y suspensión',
      'Cambio y rotación de neumáticos',
      'Alineación y balanceo',
      'Diagnóstico de vibraciones en carretera',
      'Suspensión y dirección',
      'Reparación de motor gasolina',
      'Reparación de motor diésel',
      'Inyección electrónica',
      'Servicio de transmisión automática',
      'Reparación de caja mecánica',
      'Sistema de embrague',
      'Sistema eléctrico y alternadores',
      'Baterías e híbridos',
      'Mantención de baterías de litio e híbridas',
      'Aire acondicionado automotriz',
      'Revisión pre compra',
      'Preparación para revisión técnica',
      'Asistencia en ruta',
      'Instalación de accesorios y audio',
    ])
  ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  const form = document.querySelector('.workshop-form');
  if (!form) {
    return;
  }

  const feedback = form.querySelector('[data-workshop-feedback]');
  const submitButton = form.querySelector('button[type="submit"]');
  const serviceOptionsContainer = form.querySelector('[data-service-options]');
  const serviceTrack = serviceOptionsContainer?.querySelector('[data-service-track]');
  const serviceWrapper = serviceOptionsContainer?.querySelector('[data-service-wrapper]');
  const servicePrevButton = serviceOptionsContainer?.querySelector('[data-service-prev]');
  const serviceNextButton = serviceOptionsContainer?.querySelector('[data-service-next]');
  const selectedServicesContainer = form.querySelector('[data-selected-services]');
  const selectedServicesList = selectedServicesContainer?.querySelector('[data-selected-services-list]');
  const selectedServicesEmpty = selectedServicesContainer?.querySelector('[data-selected-services-empty]');

  function escapeSelector(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(/([\0-\x1F\x7F"#,:;<=>?@\[\]\\^`{|}~])/g, '\\$1');
  }

  function toggleSubmitting(isSubmitting) {
    if (submitButton) {
      submitButton.disabled = isSubmitting;
      submitButton.setAttribute('aria-busy', String(isSubmitting));
    }
    form.classList.toggle('is-submitting', isSubmitting);
  }

  function showFeedback(message, type) {
    if (!feedback) {
      return;
    }

    if (!message) {
      feedback.textContent = '';
      feedback.removeAttribute('data-state');
      feedback.hidden = true;
      return;
    }

    feedback.textContent = message;
    feedback.dataset.state = type;
    feedback.hidden = false;
  }

  function parseTextList(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    return [];
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      reader.readAsDataURL(file);
    });
  }

  function getServiceScrollAmount() {
    if (!serviceWrapper || !serviceTrack) {
      return 0;
    }

    const firstOption = serviceTrack.querySelector('.service-option');
    if (!firstOption) {
      return serviceWrapper.clientWidth;
    }

    const optionWidth = firstOption.getBoundingClientRect().width;
    const wrapperWidth = serviceWrapper.getBoundingClientRect().width;
    const styles = window.getComputedStyle(serviceTrack);
    const gap = [styles.getPropertyValue('column-gap'), styles.getPropertyValue('gap'), styles.getPropertyValue('row-gap')]
      .map((value) => {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      })
      .find((value) => value > 0) || 0;

    const optionWidthWithGap = optionWidth + gap;
    if (!optionWidthWithGap) {
      return wrapperWidth || 0;
    }

    const visibleCount = Math.max(1, Math.round(wrapperWidth / optionWidthWithGap));
    const amount = visibleCount * optionWidthWithGap;

    return Math.max(optionWidthWithGap, amount);
  }

  function updateServiceNavButtons() {
    if (!serviceWrapper || !serviceTrack) {
      return;
    }

    const hasContent = serviceTrack.children.length > 0;
    const maxScroll = Math.max(0, serviceWrapper.scrollWidth - serviceWrapper.clientWidth);
    const currentScroll = serviceWrapper.scrollLeft;

    if (servicePrevButton) {
      servicePrevButton.disabled = !hasContent || currentScroll <= 0;
    }

    if (serviceNextButton) {
      serviceNextButton.disabled = !hasContent || currentScroll >= maxScroll - 1;
    }
  }

  function scrollServices(direction) {
    if (!serviceWrapper) {
      return;
    }

    const amount = getServiceScrollAmount();
    if (!amount) {
      return;
    }

    serviceWrapper.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  function renderServiceOptions() {
    if (!serviceTrack) {
      return;
    }

    const fragment = document.createDocumentFragment();

    SERVICE_OPTIONS.forEach((label) => {
      const optionLabel = document.createElement('label');
      optionLabel.className = 'service-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'services';
      checkbox.value = label;

      const text = document.createElement('span');
      text.textContent = label;

      optionLabel.appendChild(checkbox);
      optionLabel.appendChild(text);
      fragment.appendChild(optionLabel);
    });

    serviceTrack.innerHTML = '';
    serviceTrack.appendChild(fragment);
    if (serviceWrapper) {
      if (typeof serviceWrapper.scrollTo === 'function') {
        serviceWrapper.scrollTo({ left: 0 });
      } else {
        serviceWrapper.scrollLeft = 0;
      }
      if (serviceWrapper.scrollLeft !== 0) {
        serviceWrapper.scrollLeft = 0;
      }
    }
    updateServiceNavButtons();
    renderSelectedServices();
  }

  function getCheckedServices() {
    if (!serviceTrack) {
      return [];
    }

    return Array.from(serviceTrack.querySelectorAll('input[name="services"]:checked'));
  }

  function renderSelectedServices() {
    if (!selectedServicesContainer || !selectedServicesList) {
      return;
    }

    const checked = getCheckedServices();
    const hasSelections = checked.length > 0;

    selectedServicesContainer.hidden = false;

    if (selectedServicesEmpty) {
      selectedServicesEmpty.hidden = hasSelections;
    }

    selectedServicesList.innerHTML = '';

    if (!hasSelections) {
      return;
    }

    const fragment = document.createDocumentFragment();

    checked.forEach((input) => {
      const item = document.createElement('span');
      item.className = 'selected-services__item';

      const text = document.createElement('span');
      text.textContent = input.value;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.removeService = input.value;
      removeButton.setAttribute('aria-label', `Quitar ${input.value} de los servicios seleccionados`);
      removeButton.textContent = 'Quitar';

      item.appendChild(text);
      item.appendChild(removeButton);
      fragment.appendChild(item);
    });

    selectedServicesList.appendChild(fragment);
  }

  renderServiceOptions();

  if (servicePrevButton) {
    servicePrevButton.addEventListener('click', () => scrollServices(-1));
  }

  if (serviceNextButton) {
    serviceNextButton.addEventListener('click', () => scrollServices(1));
  }

  if (serviceWrapper) {
    serviceWrapper.addEventListener('scroll', updateServiceNavButtons, { passive: true });
  }

  if (serviceTrack) {
    serviceTrack.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof Element && target.matches('input[name="services"]')) {
        renderSelectedServices();
      }
    });
  }

  if (selectedServicesList) {
    selectedServicesList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest('button[data-remove-service]');
      if (!button) {
        return;
      }

      const value = button.dataset.removeService;
      if (!value || !serviceTrack) {
        return;
      }

      const selector = `input[name="services"][value="${escapeSelector(value)}"]`;
      const checkbox = serviceTrack.querySelector(selector);
      if (checkbox) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  window.addEventListener('resize', updateServiceNavButtons);

  async function handleSubmit(event) {
    event.preventDefault();

    showFeedback('', '');
    toggleSubmitting(true);

    try {
      const formData = new FormData(form);
      const selectedServices = formData.getAll('services');
      const services = Array.from(new Set(parseTextList(selectedServices)));

      const payload = {
        name: formData.get('workshop-name'),
        description: formData.get('workshop-description'),
        services,
        experienceYears: formData.get('experience-years'),
        address: formData.get('address'),
        schedule: formData.get('schedule'),
        phone: formData.get('contact-phone'),
        email: formData.get('contact-email'),
        certifications: parseTextList(formData.get('certifications')),
      };

      const photoFile = formData.get('workshop-photo');
      if (photoFile instanceof File && photoFile.size > 0) {
        payload.photoDataUrl = await readFileAsDataUrl(photoFile);
      }

      if (!payload.services.length) {
        showFeedback('Selecciona al menos un servicio que ofreces.', 'error');
        return;
      }

      const response = await fetch('/api/workshops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          showFeedback('Debes iniciar sesión para registrar un taller.', 'error');
          return;
        }

        if (response.status === 403) {
          showFeedback('Solo los mecánicos pueden registrar talleres en la plataforma.', 'error');
          return;
        }

        showFeedback(result?.error || 'No pudimos guardar el taller. Inténtalo nuevamente.', 'error');
        return;
      }

      form.reset();
      renderServiceOptions();
      showFeedback('Tu taller se registró correctamente. Pronto aparecerá en el listado público.', 'success');
    } catch (error) {
      console.error(error);
      showFeedback('Ocurrió un problema al enviar el formulario. Revisa tu conexión e inténtalo de nuevo.', 'error');
    } finally {
      toggleSubmitting(false);
    }
  }

  form.addEventListener('submit', handleSubmit);
})();
