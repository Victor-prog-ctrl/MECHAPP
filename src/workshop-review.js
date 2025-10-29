(function () {
  function getWorkshopIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function populateWorkshopSelect(defaultId) {
    const select = document.querySelector('[data-workshop-select]');
    if (!select || !window.Mechapp?.workshops?.getSummary) {
      return;
    }

    const summary = window.Mechapp.workshops.getSummary();
    const fragment = document.createDocumentFragment();
    summary.forEach((workshop) => {
      const option = document.createElement('option');
      option.value = workshop.id;
      option.textContent = workshop.name;
      fragment.appendChild(option);
    });

    select.appendChild(fragment);

    if (defaultId && summary.some((workshop) => workshop.id === defaultId)) {
      select.value = defaultId;
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

  function handleSubmit(event) {
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
    const workshop = window.Mechapp?.workshops?.findById(workshopId);

    showFeedback(
      `¡Gracias por compartir tu experiencia con ${workshop?.name || 'el taller seleccionado'}! ` +
        'Tu reseña será revisada y publicada una vez validada.',
      false
    );
    form.reset();
    const select = document.querySelector('[data-workshop-select]');
    if (select && workshopId) {
      select.value = workshopId;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const defaultWorkshopId = getWorkshopIdFromQuery();
    populateWorkshopSelect(defaultWorkshopId);
    setupRatingKeyboardSupport();

    const form = document.getElementById('review-form');
    if (form) {
      form.addEventListener('submit', handleSubmit);
    }
  });
})();
