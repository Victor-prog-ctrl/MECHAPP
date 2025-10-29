(function () {
  const form = document.querySelector('.workshop-form');
  if (!form) {
    return;
  }

  const feedback = form.querySelector('[data-workshop-feedback]');
  const submitButton = form.querySelector('button[type="submit"]');

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

  async function handleSubmit(event) {
    event.preventDefault();

    showFeedback('', '');
    toggleSubmitting(true);

    try {
      const formData = new FormData(form);

      const payload = {
        name: formData.get('workshop-name'),
        description: formData.get('workshop-description'),
        services: parseTextList(formData.get('services')),
        specialties: parseTextList(formData.get('specialties')),
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
