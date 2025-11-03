(function () {
  const REVIEW_LIMIT = 50;

  function getWorkshopIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function selectElement(selector) {
    return document.querySelector(selector);
  }

  function setTextContent(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function parseDate(dateString) {
    if (!dateString) {
      return null;
    }
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatMonthYear(dateString) {
    const date = parseDate(dateString);
    if (!date) {
      return null;
    }
    return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(date);
  }

  function formatFullDate(dateString) {
    const date = parseDate(dateString);
    if (!date) {
      return null;
    }
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function createStarIcon() {
    const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    star.setAttribute('viewBox', '0 0 24 24');
    star.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 21 12 17.77 5.8 21l1-6.86L2 9.27l7.1-1.01L12 2z');
    star.appendChild(path);
    return star;
  }

  function createReviewItem(review) {
    const item = document.createElement('li');
    item.className = 'review-item';

    const header = document.createElement('header');

    const rating = document.createElement('div');
    rating.className = 'review-rating';
    rating.setAttribute('aria-label', `Calificación ${review.rating} de 5`);
    rating.appendChild(createStarIcon());

    const ratingValue = document.createElement('strong');
    ratingValue.textContent = Number(review.rating).toFixed(1);
    rating.appendChild(ratingValue);

    if (review.service) {
      const service = document.createElement('span');
      service.textContent = review.service;
      rating.appendChild(service);
    }

    header.appendChild(rating);

    const visitDate = review.visitDate || review.createdAt;
    const formattedVisitDate = formatMonthYear(visitDate);
    if (formattedVisitDate) {
      const time = document.createElement('time');
      time.dateTime = visitDate;
      time.textContent = formattedVisitDate;
      header.appendChild(time);
    }

    item.appendChild(header);

    if (review.headline) {
      const headline = document.createElement('h3');
      headline.textContent = review.headline;
      item.appendChild(headline);
    }

    const comment = document.createElement('p');
    comment.textContent = review.comment;
    item.appendChild(comment);

    const meta = document.createElement('div');
    meta.className = 'review-meta';

    const client = document.createElement('span');
    client.innerHTML = `Cliente: <strong>${review.clientName}</strong>`;
    meta.appendChild(client);

    const visitTypeLabel = review.visitType === 'domicilio' ? 'Visita a domicilio' : 'Visita en taller';
    const fullDate = formatFullDate(review.visitDate || review.createdAt);
    const visitInfo = document.createElement('span');
    visitInfo.textContent = fullDate ? `${visitTypeLabel} · ${fullDate}` : visitTypeLabel;
    meta.appendChild(visitInfo);

    item.appendChild(meta);

    return item;
  }

  function renderWorkshop(workshop, workshopId) {
    const summarySection = selectElement('[data-workshop-summary]');
    if (!summarySection) {
      return;
    }

    const photo = summarySection.querySelector('[data-workshop-photo]');
    if (photo) {
      photo.src = workshop.photo;
      photo.alt = `Foto del taller ${workshop.name}`;
    }

    const specialties = Array.isArray(workshop.specialties) ? workshop.specialties : [];
    const specialtiesTag = summarySection.querySelector('[data-workshop-specialties]');
    if (specialtiesTag) {
      specialtiesTag.textContent = specialties.length ? specialties.slice(0, 3).join(' · ') : 'Taller mecánico';
    }

    setTextContent(summarySection.querySelector('[data-workshop-name]'), workshop.name);
    setTextContent(summarySection.querySelector('[data-workshop-description]'), workshop.description);
    setTextContent(summarySection.querySelector('[data-workshop-experience]'), `${workshop.experienceYears} años`);
    setTextContent(summarySection.querySelector('[data-workshop-address]'), workshop.address);

    const hasReviews = workshop.reviewsCount > 0 && workshop.averageRating != null;
    const ratingValue = hasReviews ? `${Number(workshop.averageRating).toFixed(1)} ★` : 'Sin reseñas';
    const ratingLabel = hasReviews
      ? `${workshop.reviewsCount} ${workshop.reviewsCount === 1 ? 'reseña publicada' : 'reseñas publicadas'}`
      : 'Aún sin reseñas publicadas';

    setTextContent(summarySection.querySelector('[data-workshop-rating]'), ratingValue);
    setTextContent(summarySection.querySelector('[data-workshop-rating-count]'), ratingLabel);

    summarySection.hidden = false;

    const title = `Mechapp · Reseñas de ${workshop.name}`;
    if (document.title !== title) {
      document.title = title;
    }

    const reviewUrl = `./redactar-resena.html?id=${encodeURIComponent(workshopId)}`;
    document.querySelectorAll('[data-create-review]').forEach((link) => {
      link.href = reviewUrl;
    });

    const profileUrl = `./perfil-taller.html?id=${encodeURIComponent(workshopId)}`;
    document.querySelectorAll('[data-view-profile]').forEach((link) => {
      link.href = profileUrl;
    });
  }

  function renderReviews(reviews, workshop) {
    const reviewsSection = selectElement('[data-reviews-section]');
    if (!reviewsSection) {
      return;
    }

    const list = reviewsSection.querySelector('[data-review-list]');
    const emptyIndicator = reviewsSection.querySelector('[data-reviews-empty]');
    const countLabel = reviewsSection.querySelector('[data-review-count]');

    const totalReviews = workshop?.reviewsCount || reviews.length;
    if (countLabel) {
      countLabel.textContent = totalReviews
        ? `${totalReviews} ${totalReviews === 1 ? 'reseña publicada' : 'reseñas publicadas'}`
        : 'Aún sin reseñas publicadas';
    }

    if (list) {
      list.innerHTML = '';
    }

    if (!reviews.length) {
      if (emptyIndicator) {
        emptyIndicator.hidden = false;
      }
      reviewsSection.hidden = false;
      return;
    }

    if (emptyIndicator) {
      emptyIndicator.hidden = true;
    }

    const fragment = document.createDocumentFragment();
    reviews.forEach((review) => {
      fragment.appendChild(createReviewItem(review));
    });

    if (list) {
      list.appendChild(fragment);
    }

    reviewsSection.hidden = false;
  }

  function showEmptyState(message) {
    const summarySection = selectElement('[data-workshop-summary]');
    const reviewsSection = selectElement('[data-reviews-section]');
    const emptySection = selectElement('[data-empty-state]');

    if (summarySection) {
      summarySection.hidden = true;
    }

    if (reviewsSection) {
      reviewsSection.hidden = true;
    }

    if (emptySection) {
      if (message) {
        const paragraph = emptySection.querySelector('p');
        if (paragraph) {
          paragraph.textContent = message;
        }
      }
      emptySection.hidden = false;
    }
  }

  async function fetchWorkshop(id) {
    const response = await fetch(`/api/workshops/${encodeURIComponent(id)}`);
    if (!response.ok) {
      throw new Error('No se pudo obtener la información del taller.');
    }
    return response.json();
  }

  async function fetchReviews(id) {
    const response = await fetch(`/api/workshops/${encodeURIComponent(id)}/reviews?limit=${REVIEW_LIMIT}`);
    if (!response.ok) {
      throw new Error('No se pudieron obtener las reseñas del taller.');
    }
    return response.json();
  }

  function setupBackButton() {
    const backButton = document.querySelector('[data-go-back]');
    if (!backButton) {
      return;
    }

    backButton.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = './resenas-mecanicos.html';
    });
  }

  async function initialize() {
    const workshopId = getWorkshopIdFromQuery();
    if (!workshopId) {
      showEmptyState('Debes seleccionar un taller para ver sus reseñas.');
      return;
    }

    try {
      const [workshopData, reviewsData] = await Promise.all([fetchWorkshop(workshopId), fetchReviews(workshopId)]);
      const workshop = workshopData?.workshop;
      if (!workshop) {
        showEmptyState('El taller que buscas no existe o fue dado de baja.');
        return;
      }

      renderWorkshop(workshop, workshopId);
      const reviews = Array.isArray(reviewsData?.reviews) ? reviewsData.reviews : [];
      renderReviews(reviews, workshop);
    } catch (error) {
      console.error(error);
      showEmptyState('No pudimos cargar las reseñas del taller. Intenta nuevamente más tarde.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupBackButton();
    initialize();
  });
})();
