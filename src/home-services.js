(function () {
  const EMPTY_MESSAGE = '<p class="featured-services__empty">Aún no hay servicios registrados.</p>';
  const ERROR_MESSAGE = '<p class="featured-services__empty">No pudimos cargar los servicios destacados.</p>';
  const DEFAULT_WORKSHOP_PHOTO = '../assets/logo-oscuro.png';

  const serviceWorkshopMap = new Map();
  let modalElement = null;
  let modalTitleElement = null;
  let modalCountElement = null;
  let modalContentElement = null;
  let previouslyFocusedElement = null;
  let escapeKeyHandler = null;

  function normalizeText(value) {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');
  }

  function createServiceCard(entry) {
    const article = document.createElement('article');
    article.className = 'featured-service-card';
    article.dataset.serviceKey = entry.key;
    article.setAttribute('role', 'button');
    article.setAttribute('tabindex', '0');

    const title = document.createElement('h3');
    title.className = 'featured-service-card__title';
    title.textContent = entry.name;
    article.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'featured-service-card__meta';
    const suffix = entry.count === 1 ? 'taller lo ofrece' : 'talleres lo ofrecen';
    meta.textContent = `${entry.count} ${suffix}`;
    article.appendChild(meta);

    article.setAttribute('aria-label', `${entry.name}. ${entry.count} ${suffix}. Ver talleres que lo ofrecen.`);

    return article;
  }

  function setNavDisabled(container, disabled) {
    if (!container) {
      return;
    }

    const buttons = container.querySelectorAll('[data-featured-prev], [data-featured-next]');
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  async function fetchWorkshops() {
    const response = await fetch('/api/workshops');
    if (!response.ok) {
      throw new Error('No se pudieron cargar los talleres');
    }
    return response.json();
  }

  function buildServiceData(workshops) {
    const map = new Map();

    workshops.forEach((workshop) => {
      const services = Array.isArray(workshop?.services) ? workshop.services : [];
      const seen = new Set();

      services.forEach((serviceName) => {
        if (!serviceName || typeof serviceName !== 'string') {
          return;
        }

        const trimmed = serviceName.trim().replace(/\s+/g, ' ');
        if (!trimmed) {
          return;
        }

        const key = normalizeText(trimmed).replace(/\s+/g, ' ');
        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);

        if (!map.has(key)) {
          map.set(key, { key, name: trimmed, count: 0, workshops: [] });
        }

        const entry = map.get(key);
        entry.count += 1;

        entry.workshops.push({
          id: workshop.id,
          name: workshop.name,
          photo: workshop.photo || DEFAULT_WORKSHOP_PHOTO,
          averageRating: workshop.averageRating,
          reviewsCount: workshop.reviewsCount,
        });
      });
    });

    const entries = Array.from(map.values());
    entries.forEach((entry) => {
      entry.workshops.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    });

    return entries.sort((a, b) => {
      if (b.count === a.count) {
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      return b.count - a.count;
    });
  }

  function closeServiceModal() {
    if (!modalElement || modalElement.hasAttribute('hidden')) {
      return;
    }

    modalElement.setAttribute('hidden', '');
    document.body.classList.remove('service-modal-open');

    if (escapeKeyHandler) {
      document.removeEventListener('keydown', escapeKeyHandler);
      escapeKeyHandler = null;
    }

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      previouslyFocusedElement.focus();
    }

    previouslyFocusedElement = null;
  }

  function ensureModalElement() {
    if (modalElement) {
      return modalElement;
    }

    const modal = document.createElement('div');
    modal.className = 'service-modal';
    modal.dataset.serviceModal = '';
    modal.setAttribute('hidden', '');

    const backdrop = document.createElement('div');
    backdrop.className = 'service-modal__backdrop';
    backdrop.dataset.serviceModalDismiss = '';
    modal.appendChild(backdrop);

    const dialog = document.createElement('div');
    dialog.className = 'service-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'service-modal-title');
    modal.appendChild(dialog);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'service-modal__close';
    closeButton.setAttribute('aria-label', 'Cerrar');
    closeButton.dataset.serviceModalDismiss = '';
    closeButton.textContent = '×';
    dialog.appendChild(closeButton);

    const heading = document.createElement('h3');
    heading.id = 'service-modal-title';
    heading.className = 'service-modal__title';
    heading.textContent = 'Talleres que ofrecen ';
    const titleSpan = document.createElement('span');
    titleSpan.dataset.serviceModalTitle = '';
    heading.appendChild(titleSpan);
    dialog.appendChild(heading);

    const count = document.createElement('p');
    count.className = 'service-modal__subtitle';
    count.id = 'service-modal-count';
    count.dataset.serviceModalCount = '';
    dialog.appendChild(count);
    dialog.setAttribute('aria-describedby', 'service-modal-count');

    const content = document.createElement('div');
    content.className = 'service-modal__content';
    content.dataset.serviceModalContent = '';
    dialog.appendChild(content);

    modalElement = modal;
    modalTitleElement = titleSpan;
    modalCountElement = count;
    modalContentElement = content;

    modal.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.serviceModalDismiss !== undefined) {
        closeServiceModal();
      }
    });

    document.body.appendChild(modal);
    return modal;
  }

  function createModalWorkshopCard(workshop) {
    const article = document.createElement('article');
    article.className = 'service-modal__workshop';

    const header = document.createElement('div');
    header.className = 'service-modal__workshop-header';

    const image = document.createElement('img');
    image.src = workshop.photo || DEFAULT_WORKSHOP_PHOTO;
    image.alt = `Imagen del taller ${workshop.name}`;
    image.loading = 'lazy';
    header.appendChild(image);

    const info = document.createElement('div');
    info.className = 'service-modal__workshop-info';

    const title = document.createElement('h4');
    title.textContent = workshop.name;
    info.appendChild(title);

    const rating = document.createElement('p');
    rating.className = 'service-modal__workshop-rating';
    const averageRating = Number.parseFloat(workshop.averageRating);
    const reviewsCount = Number.parseInt(workshop.reviewsCount, 10);
    if (Number.isFinite(averageRating) && Number.isFinite(reviewsCount) && reviewsCount > 0) {
      const average = averageRating.toFixed(1);
      const suffix = reviewsCount === 1 ? 'reseña' : 'reseñas';
      rating.innerHTML = `<strong>${average}</strong> · ${reviewsCount} ${suffix}`;
    } else {
      rating.textContent = 'Aún no tiene reseñas publicadas.';
      rating.classList.add('service-modal__workshop-rating--empty');
    }
    info.appendChild(rating);

    const actions = document.createElement('div');
    actions.className = 'service-modal__workshop-actions';
    const link = document.createElement('a');
    link.className = 'button ghost button-small';
    link.href = `./perfil-taller.html?id=${encodeURIComponent(workshop.id)}`;
    link.textContent = 'Ver perfil';
    link.setAttribute('aria-label', `Ver perfil del taller ${workshop.name}`);
    actions.appendChild(link);
    info.appendChild(actions);

    header.appendChild(info);
    article.appendChild(header);

    return article;
  }

  function openServiceModal(entry, triggerElement) {
    const modal = ensureModalElement();
    previouslyFocusedElement = triggerElement || document.activeElement;

    modalTitleElement.textContent = entry.name;
    const suffix = entry.count === 1 ? '1 taller ofrece este servicio.' : `${entry.count} talleres ofrecen este servicio.`;
    modalCountElement.textContent = suffix;

    modalContentElement.innerHTML = '';

    if (!entry.workshops.length) {
      const empty = document.createElement('p');
      empty.className = 'service-modal__empty';
      empty.textContent = 'No encontramos talleres disponibles para este servicio en este momento.';
      modalContentElement.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      entry.workshops.forEach((workshop) => {
        fragment.appendChild(createModalWorkshopCard(workshop));
      });
      modalContentElement.appendChild(fragment);
    }

    modal.removeAttribute('hidden');
    document.body.classList.add('service-modal-open');

    const closeButton = modal.querySelector('.service-modal__close');
    if (closeButton) {
      closeButton.focus();
    }

    escapeKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeServiceModal();
      }
    };
    document.addEventListener('keydown', escapeKeyHandler);
  }

  function setupServiceSelection(track) {
    if (!track || track.dataset.serviceSelectionReady) {
      return;
    }

    const handleActivation = (card) => {
      if (!card) {
        return;
      }
      const key = card.dataset.serviceKey;
      if (!key) {
        return;
      }
      const entry = serviceWorkshopMap.get(key);
      if (!entry) {
        return;
      }
      openServiceModal(entry, card);
    };

    track.addEventListener('click', (event) => {
      const card = event.target.closest('.featured-service-card');
      if (!card) {
        return;
      }
      event.preventDefault();
      handleActivation(card);
    });

    track.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const card = event.target.closest('.featured-service-card');
      if (!card) {
        return;
      }
      event.preventDefault();
      handleActivation(card);
    });

    track.dataset.serviceSelectionReady = 'true';
  }

  function getScrollAmount(track, wrapper) {
    const firstCard = track.querySelector('.featured-service-card');
    if (!firstCard) {
      return wrapper.clientWidth;
    }

    const cardWidth = firstCard.getBoundingClientRect().width;
    const styles = window.getComputedStyle(track);
    const gapValues = [styles.columnGap, styles.gap, styles.rowGap];
    const gap = gapValues
      .map((value) => {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      })
      .find((value) => value > 0) || 0;

    return cardWidth + gap;
  }

  function setupCarousel(track) {
    const container = track.closest('[data-featured-services]');
    if (!container) {
      return;
    }

    const wrapper = container.querySelector('.featured-services-track-wrapper');
    const prevButton = container.querySelector('[data-featured-prev]');
    const nextButton = container.querySelector('[data-featured-next]');

    if (!wrapper || !prevButton || !nextButton) {
      return;
    }

    const updateButtons = () => {
      const hasContent = track.children.length > 0 && !track.classList.contains('featured-services-track--empty');
      const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
      const currentScroll = wrapper.scrollLeft;
      prevButton.disabled = !hasContent || currentScroll <= 0;
      nextButton.disabled = !hasContent || currentScroll >= maxScroll - 1;
    };

    const scrollByAmount = (direction) => {
      const amount = getScrollAmount(track, wrapper);
      if (!amount) {
        return;
      }
      wrapper.scrollBy({ left: direction * amount, behavior: 'smooth' });
    };

    prevButton.addEventListener('click', () => scrollByAmount(-1));
    nextButton.addEventListener('click', () => scrollByAmount(1));
    wrapper.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);

    requestAnimationFrame(updateButtons);
  }

  async function renderFeaturedServices() {
    const track = document.querySelector('[data-featured-track]');
    if (!track) {
      return;
    }

    const container = track.closest('[data-featured-services]');
    if (container) {
      container.setAttribute('aria-busy', 'true');
    }

    try {
      const data = await fetchWorkshops();
      const workshops = Array.isArray(data?.workshops) ? data.workshops : [];
      const services = buildServiceData(workshops);

      serviceWorkshopMap.clear();

      if (!services.length) {
        track.classList.add('featured-services-track--empty');
        track.innerHTML = EMPTY_MESSAGE;
        setNavDisabled(container, true);
        return;
      }

      const fragment = document.createDocumentFragment();
      services.forEach((service) => {
        fragment.appendChild(createServiceCard(service));
        serviceWorkshopMap.set(service.key, service);
      });

      track.classList.remove('featured-services-track--empty');
      track.innerHTML = '';
      track.appendChild(fragment);
      setupCarousel(track);
      setupServiceSelection(track);
      setNavDisabled(container, false);
    } catch (error) {
      console.error(error);
      serviceWorkshopMap.clear();
      track.classList.add('featured-services-track--empty');
      track.innerHTML = ERROR_MESSAGE;
      setNavDisabled(container, true);
    } finally {
      if (container) {
        container.removeAttribute('aria-busy');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', renderFeaturedServices);
})();
