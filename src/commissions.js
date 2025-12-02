(function () {
    const tableBody = document.querySelector('[data-commissions-body]');
    const feedback = document.querySelector('[data-commissions-feedback]');

    function setFeedback(message, type = 'info') {
        if (!feedback) {
            return;
        }

        feedback.textContent = message || '';
        feedback.hidden = !message;
        feedback.dataset.state = type;
    }

    function updateRowAsPaid(row) {
        if (!row) return;
        const statusCell = row.querySelector('[data-commission-status]');
        const button = row.querySelector('[data-commission-pay]');
        const paypalContainer = row.querySelector('[data-paypal-container]');

        if (statusCell) {
            statusCell.textContent = 'pagada';
        }

        if (button) {
            button.disabled = true;
            button.textContent = 'Pagada';
        }

        if (paypalContainer) {
            paypalContainer.innerHTML = '';
        }
    }

    async function markCommissionAsPaid(id) {
        const response = await fetch(`/api/comisiones/${encodeURIComponent(id)}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
        });

        if (response.status === 401) {
            window.location.href = './login.html';
            return null;
        }

        if (!response.ok) {
            const data = await response.json().catch(() => null);
            const message = data?.error || 'No se pudo actualizar la comisión.';
            throw new Error(message);
        }

        const data = await response.json();
        return data?.commission || null;
    }

    function renderCommissionRow(commission) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${commission.appointmentId ?? '--'}</td>
            <td>${commission.scheduledFor ? new Date(commission.scheduledFor).toLocaleString() : 'Pendiente'}</td>
            <td>$${Number(commission.commissionAmount || 0).toFixed(2)}</td>
            <td>$${Number(commission.workPrice || 0).toFixed(2)}</td>
            <td data-commission-status>${commission.status || 'pendiente'}</td>
            <td>
                <button type="button" class="button" data-commission-pay data-id="${commission.id}">
                    Pagar
                </button>
                <div data-paypal-container class="paypal-container" hidden></div>
            </td>
        `;

        row.dataset.commissionAmount = Number(commission.commissionAmount || 0).toString();
        row.dataset.workPrice = Number(commission.workPrice || 0).toString();

        return row;
    }

    function renderTable(commissions) {
        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = '';

        if (!Array.isArray(commissions) || !commissions.length) {
            setFeedback('No tienes comisiones pendientes por ahora.', 'info');
            return;
        }

        setFeedback('');
        const fragment = document.createDocumentFragment();

        commissions.forEach((commission) => {
            fragment.appendChild(renderCommissionRow(commission));
        });

        tableBody.appendChild(fragment);
    }

    async function fetchCommissions() {
        try {
            setFeedback('Cargando comisiones...', 'info');
            const response = await fetch('/api/mechanic/commissions?status=pendiente', {
                credentials: 'same-origin',
            });

            if (response.status === 401) {
                window.location.href = './login.html';
                return;
            }

            if (response.status === 403) {
                setFeedback('Solo los mecánicos pueden ver sus comisiones.', 'error');
                return;
            }

            if (!response.ok) {
                throw new Error('No se pudieron cargar las comisiones.');
            }

            const data = await response.json();
            renderTable(Array.isArray(data?.commissions) ? data.commissions : []);
        } catch (error) {
            console.error(error);
            setFeedback(
                error instanceof Error ? error.message : 'No se pudieron cargar las comisiones.',
                'error',
            );
        }
    }

    function attachPayPal(button, commission) {
        const row = button.closest('tr');
        if (!row) {
            return;
        }

        const container = row.querySelector('[data-paypal-container]');
        if (!container) {
            return;
        }

        container.hidden = false;
        container.innerHTML = '';

        const amountToCharge = Number(commission.commissionAmount || 0);
        if (!Number.isFinite(amountToCharge) || amountToCharge <= 0) {
            markCommissionAsPaid(commission.id)
                .then(() => updateRowAsPaid(row))
                .catch((error) => setFeedback(error.message, 'error'));
            return;
        }

        if (typeof paypal === 'undefined' || !paypal?.Buttons) {
            markCommissionAsPaid(commission.id)
                .then(() => updateRowAsPaid(row))
                .catch((error) => setFeedback(error.message, 'error'));
            return;
        }

        paypal
            .Buttons({
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    label: 'pay',
                },
                createOrder(_data, actions) {
                    return actions.order.create({
                        purchase_units: [
                            {
                                description: 'Pago de comisión MechApp',
                                amount: {
                                    value: Math.max(amountToCharge, 0.01).toFixed(2),
                                },
                            },
                        ],
                    });
                },
                onApprove(data, actions) {
                    const orderId = data?.orderID;
                    if (actions?.order?.capture) {
                        return actions.order
                            .capture()
                            .then((details) => details?.id || orderId)
                            .then((capturedId) =>
                                fetch(`/api/comisiones/${encodeURIComponent(commission.id)}/paypal`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'same-origin',
                                    body: JSON.stringify({ orderID: capturedId || orderId }),
                                })
                                    .then((response) => {
                                        if (response.status === 401) {
                                            window.location.href = './login.html';
                                            return null;
                                        }
                                        if (!response.ok) {
                                            return response.json().then((payload) => {
                                                const message = payload?.error || 'No se pudo registrar el pago.';
                                                throw new Error(message);
                                            });
                                        }
                                        return response.json();
                                    })
                                    .then(() => updateRowAsPaid(row)),
                            )
                            .catch((error) => setFeedback(error.message, 'error'));
                    }

                    return fetch(`/api/comisiones/${encodeURIComponent(commission.id)}/paypal`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ orderID: orderId }),
                    })
                        .then((response) => {
                            if (response.status === 401) {
                                window.location.href = './login.html';
                                return null;
                            }
                            if (!response.ok) {
                                return response.json().then((payload) => {
                                    const message = payload?.error || 'No se pudo registrar el pago.';
                                    throw new Error(message);
                                });
                            }
                            return response.json();
                        })
                        .then(() => updateRowAsPaid(row))
                        .catch((error) => setFeedback(error.message, 'error'));
                },
                onError(err) {
                    console.error(err);
                    setFeedback('No se pudo iniciar el pago con PayPal.', 'error');
                },
                onCancel() {
                    setFeedback('Pago cancelado.', 'info');
                },
            })
            .render(container);
    }

    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const button = event.target.closest('[data-commission-pay]');
            if (!button) {
                return;
            }

            const id = button.dataset.id;
            if (!id) {
                return;
            }

            const commissionRow = button.closest('tr');
            if (!commissionRow) {
                return;
            }

            const commission = {
                id,
                commissionAmount: Number.parseFloat(commissionRow.dataset.commissionAmount || '0') || 0,
                workPrice: Number.parseFloat(commissionRow.dataset.workPrice || '0') || 0,
            };

            attachPayPal(button, commission);
        });
    }

    fetchCommissions();
})();
