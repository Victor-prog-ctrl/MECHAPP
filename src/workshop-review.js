(function () {
  function getWorkshopIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function showFeedback(message, isError = false) {
    const feedback = document.querySelector('[data-review-feedback]');
    if (!feedback) {
      return;
    }
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.toggle('error', Boolean(isError));
  }

  function resetFeedback() {
    const feedback = document.querySelector('[data-review-feedback]');
    if (feedback) {
      feedback.hidden = true;
      feedback.classList.remove('error');
      feedback.textContent = '';
    }
  }

  function setupRatingKeyboardSupport() {
    const ratingContainer = document.querySelector('.rating-input');
    if (!ratingContainer) {
      return;
    }

    const inputs = Array.from(ratingContainer.querySelectorAll('input[name="rating"]'));
    ratingContainer.addEventListener('keydown', (event) => {
      let currentIndex = inputs.findIndex((input) => input.checked);
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      if (currentIndex === -1) {
        currentIndex = event.key === 'ArrowRight' ? 0 : inputs.length - 1;
      }
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = Math.min(inputs.length - 1, currentIndex + 1);
      } else if (event.key === 'ArrowLeft') {
        nextIndex = Math.max(0, currentIndex - 1);
      }
      const nextInput = inputs[nextIndex];
      if (nextInput) {
        nextInput.checked = true;
        nextInput.focus();
      }
    });
  }

  async function populateWorkshopSelect(defaultId) {
    const select = document.querySelector('[data-workshop-select]');
    if (!select) {
      return;
    }

    select.disabled = true;

    try {
      const response = await fetch('/api/workshops');
      if (!response.ok) {
        throw new Error('No se pudieron cargar los talleres.');
      }
      const data = await response.json();
      const workshops = Array.isArray(data?.workshops) ? data.workshops : [];

      const fragment = document.createDocumentFragment();
      workshops.forEach((workshop) => {
        const option = document.createElement('option');
        option.value = workshop.id;
        option.textContent = workshop.name;
        fragment.appendChild(option);
      });

      select.innerHTML = '<option value="">Selecciona un taller</option>';
      select.appendChild(fragment);

      if (defaultId && workshops.some((workshop) => workshop.id === defaultId)) {
        select.value = defaultId;
      }
    } catch (error) {
      console.error(error);
      showFeedback('No pudimos cargar el listado de talleres. Intenta nuevamente más tarde.', true);
    } finally {
      select.disabled = false;
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    resetFeedback();

    if (!form.checkValidity()) {
      form.reportValidity();
      showFeedback('Revisa los campos obligatorios antes de enviar tu reseña.', true);
      return;
    }

    const formData = new FormData(form);
    const workshopId = formData.get('workshop');
    if (!workshopId) {
      showFeedback('Selecciona un taller antes de enviar la reseña.', true);
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
    }

    const payload = {
      rating: formData.get('rating'),
      service: formData.get('service'),
      visitType: formData.get('visit-type'),
      visitDate: formData.get('visit-date'),
      headline: formData.get('headline'),
      comments: formData.get('comments'),
    };

    try {
      const response = await fetch(`/api/workshops/${encodeURIComponent(workshopId)}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401) {
          showFeedback('Debes iniciar sesión como cliente para compartir una reseña.', true);
          return;
        }
        const error = await response.json().catch(() => ({}));
        showFeedback(error?.error || 'No pudimos guardar tu reseña. Intenta nuevamente.', true);
        return;
      }

      const data = await response.json();
      const thanksMessage = data?.message
        ? data.message
        : '¡Gracias por compartir tu experiencia! Tu reseña quedó registrada.';
      showFeedback(thanksMessage, false);
      form.reset();
      const select = document.querySelector('[data-workshop-select]');
      if (select && workshopId) {
        select.value = workshopId;
      }

      if (workshopId) {
        const workshopDetailUrl = `./resenas-taller.html?id=${encodeURIComponent(workshopId)}`;
        window.location.href = workshopDetailUrl;
      }
    } catch (error) {
      console.error(error);
      showFeedback('No pudimos guardar tu reseña. Verifica tu conexión e inténtalo nuevamente.', true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const defaultWorkshopId = getWorkshopIdFromQuery();
    populateWorkshopSelect(defaultWorkshopId);
    setupRatingKeyboardSupport();

    const visitDateInput = document.getElementById('visit-date');
    if (visitDateInput) {
      const today = new Date();
      const formattedToday = today.toISOString().split('T')[0];
      visitDateInput.max = formattedToday;
    }

    const form = document.getElementById('review-form');
    if (form) {
      form.addEventListener('submit', submitReview);
    }
  });
})();
