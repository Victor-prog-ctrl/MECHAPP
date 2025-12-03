const statusClassMap = {
  pendiente: 'status-pendiente',
  validado: 'status-validado',
  rechazado: 'status-rechazado',
};

const MAX_VISIBLE_COMMISSIONS = 3;

const dashboardState = {
  users: [],
  pendingCommissions: [],
  workshops: [],
  workshopStats: null,
};

function formatDate(dateString) {
  if (!dateString) return '—';

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch (error) {
    console.error('No se pudo formatear la fecha de registro', error);
    return dateString;
  }
}

function formatCurrency(amount) {
  const numericValue = Number.parseFloat(amount);
  if (!Number.isFinite(numericValue)) {
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch (error) {
    console.error('No se pudo formatear el monto', error);
    return `$${numericValue.toFixed(2)}`;
  }
}

async function fetchWithHandling(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });

  if (response.status === 401) {
    window.location.href = './login.html';
    return null;
  }

  if (response.status === 403) {
    window.location.href = './paginainicio.html';
    return null;
  }

  if (!response.ok) {
    let message = 'Ocurrió un error.';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (error) {
      console.error('No se pudo interpretar la respuesta', error);
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchProfile() {
  return fetchWithHandling('/api/profile');
}

async function fetchUsers() {
  const data = await fetchWithHandling('/api/admin/users');
  return data?.users ?? [];
}

async function fetchPendingCommissions() {
  const data = await fetchWithHandling('/api/admin/commissions/pending');
  return data?.pending ?? [];
}

async function fetchWorkshops() {
  const data = await fetchWithHandling('/api/admin/workshops');
  return { workshops: data?.workshops ?? [], stats: data?.stats ?? null };
}

function updateStatusIndicator(indicator, status) {
  indicator.className = 'status-indicator';
  if (statusClassMap[status]) {
    indicator.classList.add(statusClassMap[status]);
  }
}

function createStatCard({ title, value, footnote }) {
  const container = document.createElement('article');
  container.className = 'stat-card';

  const titleElement = document.createElement('p');
  titleElement.className = 'stat-title';
  titleElement.textContent = title;

  const valueElement = document.createElement('p');
  valueElement.className = 'stat-value';
  valueElement.textContent = value;

  const footnoteElement = document.createElement('p');
  footnoteElement.className = 'stat-footnote';
  footnoteElement.textContent = footnote;

  container.append(titleElement, valueElement, footnoteElement);
  return container;
}

function renderStats(users, workshopStats = null) {
  const statsContainer = document.getElementById('dashboard-stats');
  if (!statsContainer) return;

  const totalUsers = users.length;
  const totalMechanics = users.filter((user) => user.account_type === 'mecanico').length;
  const totalAdmins = users.filter((user) => user.account_type === 'admin').length;
  const validatedCertificates = users.filter((user) => user.certificate_status === 'validado').length;
  const pendingCertificates = users.filter((user) => user.certificate_status === 'pendiente').length;

  const stats = [
    {
      title: 'Usuarios registrados',
      value: totalUsers,
      footnote: `${totalMechanics} mecánicos · ${totalAdmins} administradores`,
    },
    {
      title: 'Certificados validados',
      value: validatedCertificates,
      footnote: `${pendingCertificates} pendientes de revisión`,
    },
  ];

  if (workshopStats) {
    const totalWorkshops = workshopStats.totalWorkshops || 0;
    const specialties = workshopStats.uniqueSpecialties || 0;
    const totalReviews = workshopStats.totalReviews || 0;

    stats.push({
      title: 'Talleres registrados',
      value: totalWorkshops,
      footnote: `${specialties} especialidades · ${totalReviews} reseñas`,
    });
  }

  statsContainer.replaceChildren(...stats.map(createStatCard));
}

function renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  const emptyState = document.getElementById('users-empty-state');
  const template = document.getElementById('user-row-template');

  if (!tbody || !template) return;

  if (!users.length) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const rows = users.map((user) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('[data-user-row]');
    const nameCell = fragment.querySelector('[data-user-name]');
    const emailCell = fragment.querySelector('[data-user-email]');
    const accountSelect = fragment.querySelector('[data-account-select]');
    const certificateSelect = fragment.querySelector('[data-certificate-select]');
    const certificateIndicator = fragment.querySelector('[data-certificate-indicator]');
    const viewCertificateButton = fragment.querySelector('[data-action="view-certificate"]');
    const dateCell = fragment.querySelector('[data-user-date]');

    if (row) row.dataset.userId = user.id;
    if (nameCell) nameCell.textContent = user.name || 'Sin nombre';
    if (emailCell) emailCell.textContent = user.email;

    if (accountSelect) {
      accountSelect.value = user.account_type;
      accountSelect.dataset.originalValue = user.account_type;
      accountSelect.setAttribute('aria-label', `Tipo de cuenta de ${user.name}`);
    }

    if (certificateSelect) {
      certificateSelect.value = user.certificate_status || 'pendiente';
      certificateSelect.dataset.originalValue = user.certificate_status || 'pendiente';
      certificateSelect.setAttribute('aria-label', `Estado del certificado de ${user.name}`);
    }

    if (certificateIndicator) {
      updateStatusIndicator(certificateIndicator, user.certificate_status || 'pendiente');
    }

    if (viewCertificateButton) {
      const hasCertificate = Boolean(user.certificate_uploaded);
      viewCertificateButton.hidden = !hasCertificate;

      if (hasCertificate) {
        viewCertificateButton.dataset.certificateUrl = `/api/admin/users/${user.id}/certificate-file`;
        viewCertificateButton.setAttribute(
          'aria-label',
          `Ver certificado de ${user.name || 'usuario'}`,
        );
      } else {
        delete viewCertificateButton.dataset.certificateUrl;
      }
    }

    if (dateCell) {
      dateCell.textContent = formatDate(user.created_at);
    }

    return fragment;
  });

  tbody.replaceChildren(...rows);
}

function applyFilters(users) {
  const accountFilter = document.getElementById('filter-account-type');
  const certificateFilter = document.getElementById('filter-certificate-status');

  const selectedAccount = accountFilter?.value || 'todos';
  const selectedCertificate = certificateFilter?.value || 'todos';

  return users.filter((user) => {
    const matchesAccount =
      selectedAccount === 'todos' || user.account_type === selectedAccount;
    const matchesCertificate =
      selectedCertificate === 'todos' || user.certificate_status === selectedCertificate;
    return matchesAccount && matchesCertificate;
  });
}

function groupCommissionsByMechanic(commissions) {
  if (!Array.isArray(commissions)) return [];

  const grouped = new Map();

  commissions.forEach((commission) => {
    const mechanicId = commission.mechanicId || commission.mechanic_id;
    const current = grouped.get(mechanicId) || {
      mechanicId,
      mechanicName: commission.mechanicName || 'Mecánico',
      mechanicEmail: commission.mechanicEmail || '',
      commissions: [],
    };

    current.commissions.push(commission);
    grouped.set(mechanicId, current);
  });

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    pendingCount: entry.commissions.length,
    totalAmount: entry.commissions.reduce(
      (sum, item) => sum + (Number.parseFloat(item.commissionAmount) || 0),
      0
    ),
  }));
}

function renderPendingCommissions(commissions) {
  const tbody = document.getElementById('pending-commissions-body');
  const emptyState = document.getElementById('pending-commissions-empty');
  const summary = document.getElementById('pending-commissions-summary');

  if (!tbody) return;

  const grouped = groupCommissionsByMechanic(commissions).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );

  if (!grouped.length) {
    tbody.replaceChildren();
    if (emptyState) emptyState.hidden = false;
    if (summary) summary.textContent = 'Sin comisiones pendientes.';
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const rows = grouped.map((group) => {
    const row = document.createElement('tr');
    row.dataset.mechanicId = group.mechanicId;

    const mechanicCell = document.createElement('td');
    const mechanicMeta = document.createElement('div');
    mechanicMeta.className = 'user-meta';

    const mechanicName = document.createElement('span');
    mechanicName.className = 'user-meta__name';
    mechanicName.textContent = group.mechanicName || 'Mecánico';

    const mechanicEmail = document.createElement('span');
    mechanicEmail.className = 'user-meta__email';
    mechanicEmail.textContent = group.mechanicEmail || '';

    mechanicMeta.append(mechanicName, mechanicEmail);
    mechanicCell.append(mechanicMeta);

    const pendingCell = document.createElement('td');
    pendingCell.textContent = group.pendingCount;

    const amountCell = document.createElement('td');
    amountCell.textContent = formatCurrency(group.totalAmount);

    const detailCell = document.createElement('td');
    const commissionList = document.createElement('ul');
    commissionList.className = 'pending-list';

    group.commissions.forEach((item, index) => {
      const appointmentLabel = item.appointmentId
        ? `Cita #${item.appointmentId}`
        : 'Cita';
      const serviceLabel = item.service || 'Servicio';
      const amountLabel = formatCurrency(item.commissionAmount || 0);
      const dateLabel = item.scheduledFor ? formatDate(item.scheduledFor) : 'Fecha pendiente';

      const listItem = document.createElement('li');
      listItem.textContent = `${appointmentLabel} · ${serviceLabel} · ${amountLabel} (${dateLabel})`;

      if (index >= MAX_VISIBLE_COMMISSIONS) {
        listItem.hidden = true;
        listItem.dataset.extraCommission = 'true';
      }

      commissionList.append(listItem);
    });

    detailCell.append(commissionList);

    if (group.pendingCount > MAX_VISIBLE_COMMISSIONS) {
      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'link-button';
      toggleButton.dataset.action = 'toggle-commissions';
      toggleButton.dataset.totalCount = String(group.pendingCount);
      toggleButton.textContent = `Ver todas (${group.pendingCount})`;
      detailCell.append(toggleButton);
    }

    row.append(mechanicCell, pendingCell, amountCell, detailCell);

    return row;
  });

  tbody.replaceChildren(...rows);

  if (summary) {
    const mechanicsCount = grouped.length;
    summary.textContent = `${mechanicsCount} mecánico${
      mechanicsCount === 1 ? '' : 's'
    } con comisiones pendientes.`;
  }
}

function renderWorkshops(workshops) {
  const tbody = document.getElementById('workshops-table-body');
  const emptyState = document.getElementById('workshops-empty-state');

  if (!tbody) return;

  if (!workshops.length) {
    tbody.replaceChildren();
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const rows = workshops.map((workshop) => {
    const row = document.createElement('tr');
    row.dataset.workshopId = workshop.id;

    const workshopCell = document.createElement('td');
    const workshopMeta = document.createElement('div');
    workshopMeta.className = 'user-meta';

    const workshopName = document.createElement('span');
    workshopName.className = 'user-meta__name';
    workshopName.textContent = workshop.name;

    const workshopSlug = document.createElement('span');
    workshopSlug.className = 'user-meta__email';
    workshopSlug.textContent = `ID: ${workshop.id}`;

    workshopMeta.append(workshopName, workshopSlug);
    workshopCell.append(workshopMeta);

    const ownerCell = document.createElement('td');
    const ownerMeta = document.createElement('div');
    ownerMeta.className = 'user-meta';

    const ownerName = document.createElement('span');
    ownerName.className = 'user-meta__name';
    ownerName.textContent = workshop.ownerName;

    const ownerEmail = document.createElement('span');
    ownerEmail.className = 'user-meta__email';
    ownerEmail.textContent = workshop.ownerEmail;

    ownerMeta.append(ownerName, ownerEmail);
    ownerCell.append(ownerMeta);

    const contactCell = document.createElement('td');
    const address = document.createElement('p');
    address.className = 'table-subtext';
    address.textContent = workshop.address || 'Dirección no registrada';

    const phoneEmail = document.createElement('p');
    phoneEmail.className = 'table-subtext';
    const phoneLabel = workshop.phone ? `Tel: ${workshop.phone}` : null;
    const emailLabel = workshop.email || null;
    phoneEmail.textContent = [phoneLabel, emailLabel].filter(Boolean).join(' · ') || 'Sin contacto';

    contactCell.append(address, phoneEmail);

    const specialtiesCell = document.createElement('td');
    specialtiesCell.className = 'table-subtext';
    const specialties = Array.isArray(workshop.specialties) ? workshop.specialties : [];
    specialtiesCell.textContent = specialties.length
      ? specialties.slice(0, 3).join(', ') + (specialties.length > 3 ? '…' : '')
      : 'Sin especialidades declaradas';

    const reviewsCell = document.createElement('td');
    reviewsCell.className = 'table-subtext';
    const ratingLabel = workshop.averageRating ? `${workshop.averageRating} ★` : 'Sin calificación';
    const reviewsLabel = `${workshop.reviewsCount || 0} reseña${
      workshop.reviewsCount === 1 ? '' : 's'
    }`;
    reviewsCell.textContent = `${ratingLabel} · ${reviewsLabel}`;

    row.append(workshopCell, ownerCell, contactCell, specialtiesCell, reviewsCell);
    return row;
  });

  tbody.replaceChildren(...rows);
}

function toggleCommissionList(button) {
  const row = button.closest('tr');
  if (!row) return;

  const list = row.querySelector('.pending-list');
  if (!list) return;

  const hiddenItems = Array.from(list.querySelectorAll('[data-extra-commission]'));
  if (!hiddenItems.length) {
    button.hidden = true;
    return;
  }

  const isExpanded = button.dataset.expanded === 'true';
  const nextExpanded = !isExpanded;

  hiddenItems.forEach((item) => {
    item.hidden = !nextExpanded;
  });

  button.dataset.expanded = String(nextExpanded);
  button.textContent = nextExpanded
    ? 'Ver menos'
    : `Ver todas (${button.dataset.totalCount || hiddenItems.length})`;
}

function showRowFeedback(row, message, type = 'success') {
  if (!row) return;
  const feedbackElement = row.querySelector('[data-row-feedback]');

  if (!feedbackElement) return;

  feedbackElement.textContent = message;
  feedbackElement.hidden = false;
  feedbackElement.classList.remove('success', 'error');
  feedbackElement.classList.add(type);

  setTimeout(() => {
    feedbackElement.hidden = true;
  }, 4000);
}

async function updateCertificateStatus(row) {
  const userId = row?.dataset?.userId;
  const select = row?.querySelector('[data-certificate-select]');
  const indicator = row?.querySelector('[data-certificate-indicator]');

  if (!userId || !select || !indicator) return;

  try {
    const status = select.value;
    await fetchWithHandling(`/api/admin/users/${userId}/certificate`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });

    select.dataset.originalValue = status;
    updateStatusIndicator(indicator, status);
    const user = dashboardState.users.find((item) => String(item.id) === String(userId));
    if (user) {
      user.certificate_status = status;
    }
    refreshDashboard();
    const refreshedRow = document.querySelector(`[data-user-row][data-user-id="${userId}"]`);
    showRowFeedback(refreshedRow || row, 'Certificado actualizado correctamente.');
  } catch (error) {
    console.error(error);
    select.value = select.dataset.originalValue || 'pendiente';
    showRowFeedback(row, error.message, 'error');
  }
}

async function updateAccountType(row) {
  const userId = row?.dataset?.userId;
  const select = row?.querySelector('[data-account-select]');

  if (!userId || !select) return;

  try {
    const accountType = select.value;
    await fetchWithHandling(`/api/admin/users/${userId}/account-type`, {
      method: 'PUT',
      body: JSON.stringify({ accountType }),
    });

    select.dataset.originalValue = accountType;
    const user = dashboardState.users.find((item) => String(item.id) === String(userId));
    if (user) {
      user.account_type = accountType;
    }
    refreshDashboard();
    const refreshedRow = document.querySelector(`[data-user-row][data-user-id="${userId}"]`);
    showRowFeedback(refreshedRow || row, 'Rol actualizado correctamente.');
  } catch (error) {
    console.error(error);
    select.value = select.dataset.originalValue || 'cliente';
    showRowFeedback(row, error.message, 'error');
  }
}

function wireTableActions() {
  const table = document.querySelector('#usuarios .admin-table');
  if (!table) return;

  table.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest('[data-user-row]');
    if (!row) return;

    if (action === 'view-certificate') {
      const url = target.dataset.certificateUrl;
      if (url) {
        window.open(url, '_blank', 'noopener');
      } else {
        showRowFeedback(row, 'Este usuario no adjuntó un certificado.', 'error');
      }
      return;
    }

    target.disabled = true;
    try {
      if (action === 'update-certificate') {
        await updateCertificateStatus(row);
      } else if (action === 'update-account') {
        await updateAccountType(row);
      }
    } finally {
      target.disabled = false;
    }
  });

  table.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const row = target.closest('[data-user-row]');
    if (!row) return;

    if (target.matches('[data-certificate-select]')) {
      const indicator = row.querySelector('[data-certificate-indicator]');
      if (indicator) updateStatusIndicator(indicator, target.value);
    }
  });
}

function wirePendingCommissionActions() {
  const tbody = document.getElementById('pending-commissions-body');
  if (!tbody) return;

  tbody.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.dataset.action === 'toggle-commissions') {
      toggleCommissionList(target);
    }
  });
}

function setupFilters() {
  const accountFilter = document.getElementById('filter-account-type');
  const certificateFilter = document.getElementById('filter-certificate-status');

  const handleFilterChange = () => {
    const filteredUsers = applyFilters(dashboardState.users);
    renderUsers(filteredUsers);
  };

  if (accountFilter) accountFilter.addEventListener('change', handleFilterChange);
  if (certificateFilter) certificateFilter.addEventListener('change', handleFilterChange);
}

async function handleLogout() {
  const confirmed = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
  if (!confirmed) {
    return;
  }

  try {
    await fetchWithHandling('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('No se pudo cerrar sesión', error);
  } finally {
    window.location.href = './login.html';
  }
}

function wireLogoutButton() {
  const button = document.getElementById('logout-button');
  if (!button) return;
  button.addEventListener('click', handleLogout);
}

function setupSectionNavigation() {
  const navLinks = Array.from(document.querySelectorAll('.admin-nav .nav-link'));
  if (!navLinks.length) return;

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const sections = [];

  navLinks.forEach((link) => {
    const targetId = link.getAttribute('href')?.replace('#', '');
    if (!targetId) {
      return;
    }

    const section = document.getElementById(targetId);
    if (section) {
      sections.push({ link, section });
    }
  });

  if (!sections.length || !('IntersectionObserver' in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const matched = sections.find(({ section }) => section === entry.target);
        if (!matched) return;

        navLinks.forEach((item) => item.classList.remove('active'));
        matched.link.classList.add('active');
      });
    },
    {
      rootMargin: '-40% 0px -40% 0px',
      threshold: 0.25,
    }
  );

  sections.forEach(({ section }) => observer.observe(section));
}

function refreshDashboard() {
  renderStats(dashboardState.users, dashboardState.workshopStats);
  const filtered = applyFilters(dashboardState.users);
  renderUsers(filtered);
}

async function initAdminDashboard() {
  try {
    const profile = await fetchProfile();
    if (!profile) return;

    if (profile.accountType !== 'admin') {
      window.location.href = './paginainicio.html';
      return;
    }

    const [users, pendingCommissions, workshopData] = await Promise.all([
      fetchUsers(),
      fetchPendingCommissions(),
      fetchWorkshops(),
    ]);

    if (!users) return;

    dashboardState.users = users;
    dashboardState.pendingCommissions = pendingCommissions || [];
    dashboardState.workshops = workshopData?.workshops || [];
    dashboardState.workshopStats = workshopData?.stats || null;

    refreshDashboard();
    renderPendingCommissions(dashboardState.pendingCommissions);
    renderWorkshops(dashboardState.workshops);
    setupFilters();
    wireTableActions();
    wirePendingCommissionActions();
    wireLogoutButton();
    setupSectionNavigation();
  } catch (error) {
    console.error('No se pudo inicializar el panel de administración', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
});
