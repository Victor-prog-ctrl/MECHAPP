(function () {
  const AVERAGE_PLACEHOLDER = '–';

  function selectElement(selector) {
    return document.querySelector(selector);
  }

  function formatAverage(average) {
    if (average === null || average === undefined) {
      return AVERAGE_PLACEHOLDER;
    }
    return Number(average).toFixed(1);
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural;
  }

  function formatDate(dateString) {
    if (!dateString) {
      return null;
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(date);
  }

  function createServiceTags(workshop) {
    const container = document.createElement('div');
    container.className = 'service-tags';
    container.setAttribute('aria-label', 'Servicios ofrecidos');

    const services = new Set();
    if (Array.isArray(workshop.specialties)) {
      workshop.specialties.slice(0, 3).forEach((specialty) => services.add(specialty));
    }
    if (workshop.latestReview?.service) {
      services.add(workshop.latestReview.service);
    }

    if (!services.size) {
      const span = document.createElement('span');
      span.textContent = 'Servicios no registrados.';
      container.appendChild(span);
      return container;
    }

    services.forEach((service) => {
      const span = document.createElement('span');
      span.textContent = service;
      container.appendChild(span);
    });
    return container;
  }

  function createRatingElement(workshop) {
    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating';

    const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    star.setAttribute('viewBox', '0 0 24 24');
    star.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 21 12 17.77 5.8 21l1-6.86L2 9.27l7.1-1.01L12 2z');
    star.appendChild(path);
    ratingContainer.appendChild(star);

    const hasReviews = workshop.reviewsCount > 0 && workshop.averageRating != null;
    const ratingValue = document.createElement('span');
    ratingValue.textContent = hasReviews ? formatAverage(workshop.averageRating) : 'Sin reseñas';
    ratingContainer.appendChild(ratingValue);

    if (hasReviews) {
      const count = document.createElement('span');
      count.setAttribute('aria-hidden', 'true');
      count.textContent = `(${workshop.reviewsCount} ${pluralize(workshop.reviewsCount, 'reseña', 'reseñas')})`;
      ratingContainer.appendChild(count);
      ratingContainer.setAttribute('aria-label', `Calificación ${formatAverage(workshop.averageRating)} de 5`);
    } else {
      ratingContainer.setAttribute('aria-label', 'Taller sin reseñas publicadas');
    }

    return ratingContainer;
  }

  function createReviewCard(workshop) {
    const article = document.createElement('article');
    article.className = 'review-card';

    const header = document.createElement('header');
    header.className = 'review-header';

    const image = document.createElement('img');
    image.src = workshop.photo || '../assets/logo-oscuro.png';
    image.alt = `Foto del taller ${workshop.name}`;
    image.loading = 'lazy';
    header.appendChild(image);

    const identity = document.createElement('div');
    identity.className = 'identity';

    const title = document.createElement('h3');
    title.textContent = workshop.name;
    identity.appendChild(title);

    identity.appendChild(createRatingElement(workshop));
    header.appendChild(identity);
    article.appendChild(header);

    article.appendChild(createServiceTags(workshop));

    const comment = document.createElement('p');
    comment.className = 'review-comment';
    if (workshop.latestReview) {
      const headline = workshop.latestReview.headline ? `${workshop.latestReview.headline}. ` : '';
      comment.textContent = `${headline}${workshop.latestReview.comment}`;
    } else {
      comment.textContent = 'Este taller aún no tiene reseñas publicadas. Comparte tu experiencia para ayudar a otros conductores.';
      comment.classList.add('review-comment--empty');
    }
    article.appendChild(comment);

    const footer = document.createElement('footer');
    footer.className = 'review-footer';

    if (workshop.latestReview) {
      const client = document.createElement('span');
      client.innerHTML = `Cliente: <strong>${workshop.latestReview.clientName}</strong>`;
      footer.appendChild(client);

      const visitDate = workshop.latestReview.visitDate || workshop.latestReview.createdAt;
      const formattedDate = formatDate(visitDate);
      if (formattedDate) {
        const time = document.createElement('time');
        time.dateTime = visitDate;
        time.textContent = formattedDate;
        footer.appendChild(time);
      }
    } else {
      const invite = document.createElement('span');
      invite.textContent = 'Sé la primera persona en dejar una reseña.';
      footer.appendChild(invite);
    }

    article.appendChild(footer);

    const actions = document.createElement('div');
    actions.className = 'review-actions';

    const viewReviewsButton = document.createElement('a');
    viewReviewsButton.className = 'button ghost button-small';
    viewReviewsButton.href = `./resenas-taller.html?id=${encodeURIComponent(workshop.id)}`;
    viewReviewsButton.textContent = 'Ver reseñas';
    viewReviewsButton.setAttribute('aria-label', `Ver todas las reseñas de ${workshop.name}`);

    actions.appendChild(viewReviewsButton);
    article.appendChild(actions);

    return article;
  }

  async function fetchWorkshops() {
    const response = await fetch('/api/workshops');
    if (!response.ok) {
      throw new Error('No se pudieron cargar las reseñas.');
    }
    return response.json();
  }

  function renderStats(stats) {
    const averageEl = selectElement('[data-reviews-average]');
    const reviewsEl = selectElement('[data-reviews-count]');
    const clientsEl = selectElement('[data-verified-clients]');
    const specialtiesEl = selectElement('[data-specialties-count]');

    if (averageEl) {
      averageEl.textContent = stats && stats.averageRating != null ? formatAverage(stats.averageRating) : AVERAGE_PLACEHOLDER;
    }
    if (reviewsEl) {
      reviewsEl.textContent = stats ? stats.totalReviews || 0 : 0;
    }
    if (clientsEl) {
      clientsEl.textContent = stats ? stats.verifiedClients || 0 : 0;
    }
    if (specialtiesEl) {
      specialtiesEl.textContent = stats ? stats.uniqueSpecialties || 0 : 0;
    }
  }

  async function renderReviews() {
    const grid = selectElement('[data-review-grid]');
    const emptyIndicator = selectElement('[data-review-empty]');

    if (!grid) {
      return;
    }

    grid.setAttribute('aria-busy', 'true');

    try {
      const data = await fetchWorkshops();
      const workshops = Array.isArray(data?.workshops) ? data.workshops : [];
      renderStats(data?.stats);

      grid.innerHTML = '';

      const fragment = document.createDocumentFragment();
      let totalReviews = 0;

      workshops.forEach((workshop) => {
        totalReviews += workshop.reviewsCount || 0;
        fragment.appendChild(createReviewCard(workshop));
      });

      if (!workshops.length) {
        if (emptyIndicator) {
          emptyIndicator.hidden = false;
          grid.appendChild(emptyIndicator);
        }
        return;
      }

      if (!totalReviews && emptyIndicator) {
        emptyIndicator.hidden = false;
        grid.appendChild(emptyIndicator);
      } else if (emptyIndicator) {
        emptyIndicator.hidden = true;
      }

      grid.appendChild(fragment);
    } catch (error) {
      console.error(error);
      if (emptyIndicator) {
        emptyIndicator.hidden = false;
        emptyIndicator.textContent = 'No pudimos cargar las reseñas. Intenta nuevamente más tarde.';
      }
    } finally {
      grid.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('DOMContentLoaded', renderReviews);
})();
