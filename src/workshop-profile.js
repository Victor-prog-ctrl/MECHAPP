(function () {
  function getWorkshopIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function populateText(selector, value) {
    const el = document.querySelector(selector);
    if (el) {
      el.textContent = value;
    }
  }

  function populateLink(selector, value, hrefPrefix) {
    const el = document.querySelector(selector);
    if (!el) {
      return;
    }
    el.classList.remove('disabled');
    if (!value) {
      el.textContent = 'No disponible';
      el.removeAttribute('href');
      el.classList.add('disabled');
      return;
    }
    el.textContent = value;
    if (hrefPrefix) {
      el.href = `${hrefPrefix}${value.replace(/\s+/g, '')}`;
    } else {
      el.href = `mailto:${value}`;
    }
  }

  function createListItems(containerSelector, items) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (!items?.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Información no disponible.';
      container.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      fragment.appendChild(li);
    });
    container.appendChild(fragment);
  }

  function renderWorkshop(workshop) {
    const photo = document.querySelector('[data-workshop-photo]');
    if (photo) {
      photo.src = workshop.photo;
      photo.alt = `Foto del taller ${workshop.name}`;
    }

    populateText('[data-workshop-name]', workshop.name);
    populateText('[data-workshop-description]', workshop.description);

    const specialtiesTag = document.querySelector('[data-workshop-specialties]');
    if (specialtiesTag) {
      specialtiesTag.textContent = workshop.specialties?.slice(0, 2).join(' · ') || 'Taller mecánico';
    }

    populateText('[data-workshop-experience]', `${workshop.experienceYears} años`);

    const ratingValue =
      workshop.reviewsCount && workshop.averageRating != null
        ? `${Number(workshop.averageRating).toFixed(1)} ★`
        : 'Sin calificación';
    const reviewsLabel = !workshop.reviewsCount
      ? '(Aún sin reseñas)'
      : `(${workshop.reviewsCount} ${workshop.reviewsCount === 1 ? 'reseña verificada' : 'reseñas verificadas'})`;

    populateText('[data-workshop-rating]', ratingValue);
    populateText('[data-workshop-rating-count]', reviewsLabel);
    populateText('[data-workshop-schedule]', workshop.schedule);
    populateText('[data-workshop-address]', workshop.address);
    populateLink('[data-workshop-phone]', workshop.phone, 'tel:');
    populateLink('[data-workshop-email]', workshop.email, 'mailto:');

    createListItems('[data-workshop-specialties-list]', workshop.specialties);
    createListItems('[data-workshop-services]', workshop.services);
    createListItems('[data-workshop-certifications]', workshop.certifications);

    const reviewButton = document.querySelector('[data-review-button]');
    if (reviewButton) {
      reviewButton.href = `./redactar-resena.html?id=${encodeURIComponent(workshop.id)}`;
    }

    const reviewsUrl = `./resenas-taller.html?id=${encodeURIComponent(workshop.id)}`;
    const viewReviewsButton = document.querySelector('[data-view-reviews]');
    if (viewReviewsButton) {
      viewReviewsButton.href = reviewsUrl;
    }

    const viewReviewsNav = document.querySelector('[data-view-reviews-nav]');
    if (viewReviewsNav) {
      viewReviewsNav.href = reviewsUrl;
    }
  }

  function showEmptyState() {
    window.location.href = './paginainicio.html';
  }

  async function updateScheduleButtonVisibility() {
    const scheduleButton = document.querySelector('[data-schedule-button]');
    if (!scheduleButton) {
      return;
    }

    try {
      const response = await fetch('/api/profile', { credentials: 'same-origin' });
      if (response.ok) {
        const profile = await response.json();
        if (profile?.accountType === 'mecanico') {
          scheduleButton.remove();
          return;
        }
      }
    } catch (error) {
      console.error('No se pudo determinar el rol del usuario', error);
    }

    scheduleButton.removeAttribute('hidden');
  }

  async function fetchWorkshop(id) {
    const response = await fetch(`/api/workshops/${encodeURIComponent(id)}`);
    if (!response.ok) {
      throw new Error('No se pudo obtener la información del taller.');
    }
    return response.json();
  }

  async function initializeWorkshopProfile() {
    const workshopId = getWorkshopIdFromQuery();
    if (!workshopId) {
      showEmptyState();
      return;
    }

    try {
      const data = await fetchWorkshop(workshopId);
      if (!data?.workshop) {
        showEmptyState();
        return;
      }

      renderWorkshop(data.workshop);
    } catch (error) {
      console.error(error);
      showEmptyState();
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await updateScheduleButtonVisibility();
    initializeWorkshopProfile();
  });
})();
