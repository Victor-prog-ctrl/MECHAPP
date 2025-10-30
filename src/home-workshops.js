(function () {
  function createWorkshopCard(workshop) {
    const article = document.createElement('article');
    article.className = 'workshop-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'workshop-card__image';
    const image = document.createElement('img');
    image.src = workshop.photo;
    image.alt = `Imagen del taller ${workshop.name}`;
    image.loading = 'lazy';
    imageWrapper.appendChild(image);
    article.appendChild(imageWrapper);

    const body = document.createElement('div');
    body.className = 'workshop-card__body';

    const heading = document.createElement('h3');
    heading.textContent = workshop.name;
    body.appendChild(heading);

    const description = document.createElement('p');
    description.textContent = workshop.shortDescription;
    body.appendChild(description);

    const specialties = document.createElement('ul');
    specialties.className = 'workshop-card__specialties';
    (workshop.specialties || []).slice(0, 3).forEach((specialty) => {
      const item = document.createElement('li');
      item.textContent = specialty;
      specialties.appendChild(item);
    });
    body.appendChild(specialties);

    const rating = document.createElement('p');
    rating.className = 'workshop-card__rating';
    if (workshop.reviewsCount && workshop.averageRating != null) {
      const average = Number(workshop.averageRating).toFixed(1);
      const suffix = workshop.reviewsCount === 1 ? 'reseña' : 'reseñas';
      rating.innerHTML = `<strong>${average}</strong> · ${workshop.reviewsCount} ${suffix}`;
    } else {
      rating.textContent = 'Aún no tiene reseñas';
      rating.classList.add('workshop-card__rating--empty');
    }
    body.appendChild(rating);

    const actions = document.createElement('div');
    actions.className = 'workshop-card__actions';
    const profileLink = document.createElement('a');
    profileLink.className = 'button ghost';
    profileLink.href = `./perfil-taller.html?id=${encodeURIComponent(workshop.id)}`;
    profileLink.textContent = 'Ver más';
    profileLink.setAttribute('aria-label', `Ver perfil del taller ${workshop.name}`);
    actions.appendChild(profileLink);
    body.appendChild(actions);

    article.appendChild(body);
    return article;
  }

  async function fetchWorkshops() {
    const response = await fetch('/api/workshops');
    if (!response.ok) {
      throw new Error('No se pudieron cargar los talleres.');
    }
    return response.json();
  }

  function setupCarousel(container) {
    const carousel = container.closest('.workshops-carousel');
    if (!carousel) {
      return;
    }

    const wrapper = carousel.querySelector('.workshops-track-wrapper');
    const prevButton = carousel.querySelector('[data-carousel-prev]');
    const nextButton = carousel.querySelector('[data-carousel-next]');

    if (!wrapper || !prevButton || !nextButton) {
      return;
    }

    if (!carousel.dataset.carouselReady) {
      const handlePrev = () => {
        wrapper.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
      };
      const handleNext = () => {
        wrapper.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
      };

      prevButton.addEventListener('click', handlePrev);
      nextButton.addEventListener('click', handleNext);

      wrapper.addEventListener('scroll', updateButtons, { passive: true });
      window.addEventListener('resize', updateButtons);

      carousel.dataset.carouselReady = 'true';
    }

    function getScrollAmount() {
      const firstCard = container.querySelector('.workshop-card');
      if (!firstCard) {
        return wrapper.clientWidth;
      }

      const cardWidth = firstCard.getBoundingClientRect().width;
      const styles = window.getComputedStyle(container);
      const gapValues = [styles.columnGap, styles.gap, styles.rowGap];
      const gap = gapValues
        .map((value) => {
          const parsed = Number.parseFloat(value);
          return Number.isNaN(parsed) ? 0 : parsed;
        })
        .find((value) => value > 0) || 0;

      return cardWidth + gap;
    }

    function updateButtons() {
      const maxScrollLeft = wrapper.scrollWidth - wrapper.clientWidth - 1;
      prevButton.disabled = wrapper.scrollLeft <= 0;
      nextButton.disabled = wrapper.scrollLeft >= maxScrollLeft;
    }

    const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    wrapper.scrollLeft = Math.min(wrapper.scrollLeft, maxScroll);
    requestAnimationFrame(updateButtons);
  }

  async function renderHomeWorkshops() {
    const container = document.querySelector('[data-home-workshops]');
    if (!container) {
      return;
    }

    container.setAttribute('aria-busy', 'true');

    try {
      const data = await fetchWorkshops();
      const workshops = Array.isArray(data?.workshops) ? data.workshops : [];

      if (!workshops.length) {
        container.innerHTML = '<p class="workshop-card__empty">Aún no hay talleres registrados.</p>';
        return;
      }

      const fragment = document.createDocumentFragment();
      workshops.forEach((workshop) => {
        fragment.appendChild(createWorkshopCard(workshop));
      });
      container.innerHTML = '';
      container.appendChild(fragment);
      setupCarousel(container);
    } catch (error) {
      console.error(error);
      container.innerHTML = '<p class="workshop-card__empty">No pudimos mostrar los talleres en este momento.</p>';
    } finally {
      container.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('DOMContentLoaded', renderHomeWorkshops);
})();
