const categories = ['Housing', 'Food', 'Transport', 'Utilities', 'Health', 'Shopping', 'Entertainment', 'Other'];
const palette = ['#21765e', '#e99163', '#4f78a8', '#d6ad43', '#8f6f9b', '#71a7a0', '#d06b69', '#848d80'];
const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const state = { transactions: [], budgets: [], month: currentMonth, view: 'overview', currency: localStorage.getItem('budget-currency') || 'USD', query: '', category: 'all' };
const root = document.querySelector('#app');
const money = amount => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency }).format(amount || 0);
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const monthLabel = month => new Date(`${month}-02T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const monthTransactions = () => state.transactions.filter(item => item.date?.startsWith(state.month));
const totals = list => list.reduce((sum, item) => sum + (item.type === 'income' ? Number(item.amount) : -Number(item.amount)), 0);
const expenses = list => list.filter(item => item.type === 'expense');

async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
}

async function loadState() {
    try {
        const saved = await request('/api/state');
        state.transactions = saved.transactions;
        state.budgets = saved.budgets;
        render();
    } catch (error) {
        root.innerHTML = `<main class="error-screen"><span class="eyebrow">BUDGET DESK</span><h1>Can't connect to your budget.</h1><p>${escapeText(error.message)} Start the local server with <code>npm start</code>, then reload this page.</p></main>`;
    }
}

function render() {
    root.innerHTML = `
        <aside class="sidebar">
            <a class="brand" href="#overview" data-view="overview" aria-label="Budget Desk home"><span class="brand-mark">b.</span><span>budget<span class="brand-light">desk</span></span></a>
            <div class="side-caption">WORKSPACE</div>
            <nav class="main-nav" aria-label="Main navigation">
                ${[['overview', 'Overview'], ['transactions', 'Transactions'], ['budgets', 'Budgets'], ['reports', 'Reports']].map(([key, label]) => `<button class="nav-link ${state.view === key ? 'active' : ''}" data-view="${key}"><span class="nav-mark nav-${key}"></span>${label}${key === 'transactions' ? `<span class="nav-count">${state.transactions.length}</span>` : ''}</button>`).join('')}
            </nav>
            <div class="sidebar-bottom">
                <div class="sync-indicator"><span></span><div><strong>All changes saved</strong><small>Private to this device</small></div></div>
                <div class="profile"><div class="profile-avatar">Y</div><div><strong>Your workspace</strong><small>Personal account</small></div><span class="profile-dots">···</span></div>
            </div>
        </aside>
        <main class="main-panel">
            <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span class="crumb-slash">/</span><strong>${state.view[0].toUpperCase() + state.view.slice(1)}</strong></div><div class="top-actions"><label class="currency-picker"><span class="sr-only">Currency</span><select id="currency" aria-label="Currency"><option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option><option value="CAD">CAD $</option></select></label><label class="month-picker"><span class="sr-only">Selected month</span><input id="month-picker" type="month" value="${state.month}"></label><button class="button button-primary" id="new-transaction"><span class="plus-icon">+</span> New transaction</button></div></header>
            <section class="content" id="view-content"></section>
        </main>
        <dialog class="transaction-dialog" id="transaction-dialog"><form id="transaction-form"><div class="dialog-heading"><div><span class="eyebrow">YOUR LEDGER</span><h2 id="dialog-title">Add transaction</h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Close">×</button></div><input type="hidden" id="transaction-id"><label class="field-label" for="description">Description</label><input class="text-input" id="description" maxlength="100" placeholder="e.g. Weekly groceries" required><div class="form-row"><div><label class="field-label" for="amount">Amount</label><div class="amount-input"><span id="currency-symbol">$</span><input id="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></div></div><div><label class="field-label" for="type">Type</label><select class="text-input" id="type"><option value="expense">Expense</option><option value="income">Income</option></select></div></div><div class="form-row"><div><label class="field-label" for="category">Category</label><select class="text-input" id="category"></select></div><div><label class="field-label" for="date">Date</label><input class="text-input" id="date" type="date" value="${today.toISOString().slice(0, 10)}" required></div></div><p class="form-error" id="form-error" role="alert"></p><div class="dialog-actions"><button class="button button-quiet" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Save transaction</button></div></form></dialog>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
    document.querySelector('#currency').value = state.currency;
    fillCategories();
    bindEvents();
    renderView();
}

function fillCategories(selected = 'Food') {
    const select = document.querySelector('#category');
    if (!select) return;
    const type = document.querySelector('#type')?.value || 'expense';
    const options = type === 'income' ? ['Income', 'Other'] : categories;
    select.innerHTML = options.map(item => `<option value="${item}">${item}</option>`).join('');
    select.value = options.includes(selected) ? selected : options[0];
}

function bindEvents() {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', event => {
        event.preventDefault();
        state.view = button.dataset.view;
        render();
    }));
    document.querySelector('#month-picker').addEventListener('change', event => {
        state.month = event.target.value || currentMonth;
        renderView();
    });
    document.querySelector('#currency').addEventListener('change', event => {
        state.currency = event.target.value;
        localStorage.setItem('budget-currency', state.currency);
        render();
    });
    document.querySelector('#new-transaction').addEventListener('click', () => openDialog());
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.querySelector('#transaction-dialog').close()));
    document.querySelector('#type').addEventListener('change', () => fillCategories());
    document.querySelector('#transaction-form').addEventListener('submit', saveTransaction);
}

function renderView() {
    const target = document.querySelector('#view-content');
    if (!target) return;
    const views = { overview: renderOverview, transactions: renderTransactions, budgets: renderBudgets, reports: renderReports };
    target.innerHTML = views[state.view]();
    bindViewEvents();
}

function transactionRows(list) {
    if (!list.length) return `<tr><td colspan="5"><div class="empty-state"><span class="empty-mark">+</span><strong>No transactions yet</strong><small>Add a transaction to see it here.</small></div></td></tr>`;
    return list.map(item => `<tr><td><div class="transaction-name"><span class="category-dot" style="--dot:${palette[categories.indexOf(item.category)] || palette[7]}"></span><span><strong>${escapeText(item.description)}</strong><small>${escapeText(item.category)}</small></span></div></td><td>${new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td><span class="type-label ${item.type}">${item.type}</span></td><td class="amount-cell ${item.type}">${item.type === 'income' ? '+' : '−'}${money(item.amount)}</td><td><div class="row-actions"><button class="row-action" data-edit="${item.id}" aria-label="Edit ${escapeText(item.description)}" title="Edit">Edit</button><button class="row-action delete-action" data-delete="${item.id}" aria-label="Delete ${escapeText(item.description)}" title="Delete">Delete</button></div></td></tr>`).join('');
}

function tableMarkup(list) {
    return `<div class="table-scroll"><table><thead><tr><th>DESCRIPTION</th><th>DATE</th><th>TYPE</th><th>AMOUNT</th><th></th></tr></thead><tbody>${transactionRows(list)}</tbody></table></div>`;
}

function renderOverview() {
    const list = monthTransactions();
    const incoming = list.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
    const spent = expenses(list).reduce((sum, item) => sum + Number(item.amount), 0);
    const balance = totals(state.transactions);
    const savings = incoming ? Math.max(0, (incoming - spent) / incoming * 100) : 0;
    const previous = new Date(`${state.month}-02T12:00:00`);
    const monthValues = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(previous.getFullYear(), previous.getMonth() - 5 + index, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const items = state.transactions.filter(item => item.date?.startsWith(key));
        return { label: date.toLocaleDateString(undefined, { month: 'short' }), income: items.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0), expense: expenses(items).reduce((sum, item) => sum + Number(item.amount), 0) };
    });
    const maximum = Math.max(1, ...monthValues.flatMap(item => [item.income, item.expense]));
    const categorySpending = categories.map((category, index) => ({ category, color: palette[index], amount: expenses(list).filter(item => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0) })).filter(item => item.amount).sort((a, b) => b.amount - a.amount);
    const totalCategorySpend = categorySpending.reduce((sum, item) => sum + item.amount, 0);
    const conic = categorySpending.length ? `conic-gradient(${categorySpending.map((item, index) => { const before = categorySpending.slice(0, index).reduce((sum, value) => sum + value.amount, 0) / totalCategorySpend * 100; return `${item.color} ${before}% ${before + item.amount / totalCategorySpend * 100}%`; }).join(', ')})` : 'conic-gradient(#e7ebe7 0 100%)';
    const budgets = state.budgets.filter(item => item.month === state.month && item.amount > 0).slice(0, 4);
    return `<div class="page-heading"><div><span class="eyebrow">${monthLabel(state.month).toUpperCase()}</span><h1>Your money, <em>in view.</em></h1><p>A clear picture of what came in and where it went.</p></div><button class="button button-outline" id="export-csv">Export CSV <span class="export-glyph">↗</span></button></div>
        <div class="summary-grid"><article class="summary-card balance-card"><div class="summary-label">TOTAL BALANCE <span class="summary-period">ALL TIME</span></div><div class="summary-amount">${money(balance)}</div><div class="balance-note"><span class="balance-spark">↗</span> Your current net balance</div><div class="balance-decoration"></div></article><article class="summary-card"><div class="summary-label">INCOME <span class="metric-dot income-dot"></span></div><div class="summary-amount">${money(incoming)}</div><div class="summary-foot">${list.filter(item => item.type === 'income').length} entries this month</div></article><article class="summary-card"><div class="summary-label">SPENDING <span class="metric-dot expense-dot"></span></div><div class="summary-amount">${money(spent)}</div><div class="summary-foot">${list.filter(item => item.type === 'expense').length} expenses this month</div></article><article class="summary-card"><div class="summary-label">SAVINGS RATE</div><div class="summary-amount">${Math.round(savings)}<span class="percent">%</span></div><div class="summary-foot">${incoming ? 'Of this month’s income kept' : 'Add income to track savings'}</div></article></div>
        <div class="dashboard-grid"><article class="panel cashflow-panel"><div class="panel-heading"><div><h2>Cash flow</h2><p>Income and spending over six months</p></div><div class="chart-legend"><span><i class="legend-income"></i>Income</span><span><i class="legend-expense"></i>Spending</span></div></div><div class="bar-chart">${monthValues.map(item => `<div class="bar-group"><div class="bar-pair"><div class="bar income-bar" style="height:${Math.max(item.income ? 3 : 0, item.income / maximum * 100)}%" title="Income ${money(item.income)}"></div><div class="bar expense-bar" style="height:${Math.max(item.expense ? 3 : 0, item.expense / maximum * 100)}%" title="Spending ${money(item.expense)}"></div></div><span>${item.label}</span></div>`).join('')}</div><div class="chart-baseline"></div></article>
        <article class="panel spending-panel"><div class="panel-heading"><div><h2>Where it goes</h2><p>Spending by category</p></div><button class="text-link" data-view="budgets">Budgets <span>→</span></button></div><div class="spending-body"><div class="donut" style="--donut:${conic}"><div class="donut-hole"><strong>${money(spent)}</strong><small>this month</small></div></div><div class="category-legend">${categorySpending.length ? categorySpending.slice(0, 4).map(item => `<div><span><i style="background:${item.color}"></i>${item.category}</span><strong>${money(item.amount)}</strong></div>`).join('') : '<div class="muted-empty">Your spending breakdown will show here.</div>'}</div></div></article></div>
        <div class="lower-grid"><article class="panel recent-panel"><div class="panel-heading"><div><h2>Recent activity</h2><p>Your latest transactions</p></div><button class="text-link" data-view="transactions">All transactions <span>→</span></button></div>${tableMarkup(state.transactions.slice(0, 5))}</article><article class="panel budget-preview"><div class="panel-heading"><div><h2>Monthly budgets</h2><p>${monthLabel(state.month)}</p></div><button class="text-link" data-view="budgets">Manage <span>→</span></button></div>${budgets.length ? budgets.map(budgetProgress).join('') : `<div class="budget-empty"><span class="budget-empty-mark">◎</span><strong>Give your money a plan</strong><p>Set category limits and see your progress as you spend.</p><button class="button button-outline" data-view="budgets">Set a budget</button></div>`}</article></div>`;
}

function budgetProgress(budget) {
    const spent = expenses(monthTransactions()).filter(item => item.category === budget.category).reduce((sum, item) => sum + Number(item.amount), 0);
    const percent = Math.min(100, budget.amount ? spent / budget.amount * 100 : 0);
    const color = palette[categories.indexOf(budget.category)] || palette[7];
    return `<div class="budget-row"><div class="budget-row-top"><span><i class="budget-category-dot" style="background:${color}"></i>${budget.category}</span><strong>${money(spent)} <small>of ${money(budget.amount)}</small></strong></div><div class="progress-track"><span class="progress-fill ${percent >= 90 ? 'near-limit' : ''}" style="width:${percent}%;--progress:${color}"></span></div><div class="budget-row-foot"><span>${Math.round(percent)}% used</span><span>${money(Math.max(0, budget.amount - spent))} left</span></div></div>`;
}

function renderTransactions() {
    const list = state.transactions.filter(item => item.date?.startsWith(state.month)).filter(item => state.category === 'all' || item.category === state.category).filter(item => `${item.description} ${item.category}`.toLowerCase().includes(state.query.toLowerCase()));
    return `<div class="page-heading"><div><span class="eyebrow">YOUR LEDGER</span><h1>Transactions</h1><p>Every deposit and purchase, all in one place.</p></div><button class="button button-outline" id="export-csv">Export CSV <span class="export-glyph">↗</span></button></div><article class="panel transactions-panel"><div class="table-toolbar"><div class="search-box"><span>⌕</span><input id="transaction-search" type="search" placeholder="Search transactions" value="${escapeText(state.query)}"></div><label class="filter-select"><span class="sr-only">Filter by category</span><select id="category-filter"><option value="all">All categories</option>${categories.map(item => `<option value="${item}">${item}</option>`).join('')}<option value="Income">Income</option></select></label><span class="result-count">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</span></div>${tableMarkup(list)}</article>`;
}

function renderBudgets() {
    const monthBudgets = state.budgets.filter(item => item.month === state.month).sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category));
    const totalBudget = monthBudgets.reduce((sum, item) => sum + Number(item.amount), 0);
    const spent = expenses(monthTransactions()).reduce((sum, item) => sum + Number(item.amount), 0);
    return `<div class="page-heading"><div><span class="eyebrow">PLAN WITH PURPOSE</span><h1>Budgets</h1><p>Set a monthly limit and keep spending intentional.</p></div></div><div class="budget-overview"><div><span>PLANNED THIS MONTH</span><strong>${money(totalBudget)}</strong></div><div><span>SPENT THIS MONTH</span><strong>${money(spent)}</strong></div><div><span>REMAINING</span><strong>${money(totalBudget - spent)}</strong></div></div><div class="budgets-layout"><article class="panel budget-list-panel"><div class="panel-heading"><div><h2>Category limits</h2><p>Budgets for ${monthLabel(state.month)}</p></div></div>${monthBudgets.length ? monthBudgets.map(budgetProgress).join('') : '<div class="empty-state budget-list-empty"><span class="empty-mark">◎</span><strong>No budgets set yet</strong><small>Add a category limit to start planning.</small></div>'}</article><article class="panel budget-form-panel"><div class="panel-heading"><div><h2>Set a budget</h2><p>Create or update a category limit</p></div></div><form id="budget-form"><label class="field-label" for="budget-category">Category</label><select id="budget-category" class="text-input">${categories.map(item => `<option value="${item}">${item}</option>`).join('')}</select><label class="field-label" for="budget-amount">Monthly limit</label><div class="amount-input"><span>${({ USD: '$', EUR: '€', GBP: '£', CAD: '$' })[state.currency]}</span><input id="budget-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></div><p class="form-error" id="budget-error" role="alert"></p><button class="button button-primary full-button" type="submit">Save category budget</button></form></article></div>`;
}

function renderReports() {
    const list = monthTransactions();
    const incoming = list.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
    const spent = expenses(list).reduce((sum, item) => sum + Number(item.amount), 0);
    const grouped = categories.map(category => ({ category, amount: expenses(list).filter(item => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0) })).filter(item => item.amount).sort((a, b) => b.amount - a.amount);
    const top = grouped[0];
    return `<div class="page-heading"><div><span class="eyebrow">A BETTER VIEW OF YOUR MONEY</span><h1>Reports</h1><p>Your ${monthLabel(state.month)} summary at a glance.</p></div><button class="button button-outline" id="export-csv">Download report <span class="export-glyph">↗</span></button></div><div class="report-stats"><article class="panel report-stat"><span>INCOME</span><strong class="income-text">${money(incoming)}</strong><small>${list.filter(item => item.type === 'income').length} transactions</small></article><article class="panel report-stat"><span>SPENDING</span><strong class="expense-text">${money(spent)}</strong><small>${expenses(list).length} transactions</small></article><article class="panel report-stat"><span>NET CASH FLOW</span><strong>${money(incoming - spent)}</strong><small>Income minus spending</small></article><article class="panel report-stat"><span>TOP CATEGORY</span><strong>${top ? escapeText(top.category) : '—'}</strong><small>${top ? `${money(top.amount)} spent` : 'No spending recorded'}</small></article></div><article class="panel report-breakdown"><div class="panel-heading"><div><h2>Spending breakdown</h2><p>Categories ranked by amount spent</p></div></div>${grouped.length ? grouped.map(item => `<div class="report-category"><span>${escapeText(item.category)}</span><div class="report-bar"><i style="width:${item.amount / grouped[0].amount * 100}%;background:${palette[categories.indexOf(item.category)]}"></i></div><strong>${money(item.amount)}</strong></div>`).join('') : '<div class="empty-state"><span class="empty-mark">↗</span><strong>Nothing to report yet</strong><small>Once you add transactions, your monthly breakdown will appear here.</small></div>'}</article>`;
}

function bindViewEvents() {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', event => {
        event.preventDefault();
        state.view = button.dataset.view;
        render();
    }));
    document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
        const item = state.transactions.find(transaction => transaction.id === button.dataset.edit);
        if (item) openDialog(item);
    }));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteTransaction(button.dataset.delete)));
    document.querySelector('#transaction-search')?.addEventListener('input', event => {
        state.query = event.target.value;
        const position = event.target.selectionStart;
        renderView();
        const search = document.querySelector('#transaction-search');
        search.focus();
        search.setSelectionRange(position, position);
    });
    document.querySelector('#category-filter')?.addEventListener('change', event => {
        state.category = event.target.value;
        renderView();
        document.querySelector('#category-filter').value = state.category;
    });
    document.querySelector('#export-csv')?.addEventListener('click', exportCsv);
    document.querySelector('#budget-form')?.addEventListener('submit', saveBudget);
}

function openDialog(transaction) {
    const form = document.querySelector('#transaction-form');
    form.reset();
    document.querySelector('#transaction-id').value = transaction?.id || '';
    document.querySelector('#dialog-title').textContent = transaction ? 'Edit transaction' : 'Add transaction';
    document.querySelector('#description').value = transaction?.description || '';
    document.querySelector('#amount').value = transaction?.amount || '';
    document.querySelector('#date').value = transaction?.date || today.toISOString().slice(0, 10);
    document.querySelector('#type').value = transaction?.type || 'expense';
    document.querySelector('#currency-symbol').textContent = ({ USD: '$', EUR: '€', GBP: '£', CAD: '$' })[state.currency];
    fillCategories(transaction?.category || (transaction?.type === 'income' ? 'Income' : 'Food'));
    document.querySelector('#form-error').textContent = '';
    document.querySelector('#transaction-dialog').showModal();
    document.querySelector('#description').focus();
}

async function saveTransaction(event) {
    event.preventDefault();
    const id = document.querySelector('#transaction-id').value;
    const payload = { description: document.querySelector('#description').value, amount: Number(document.querySelector('#amount').value), type: document.querySelector('#type').value, category: document.querySelector('#category').value, date: document.querySelector('#date').value };
    const button = event.submitter;
    button.disabled = true;
    try {
        const saved = await request(id ? `/api/transactions/${id}` : '/api/transactions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        if (id) state.transactions = state.transactions.map(item => item.id === id ? saved : item);
        else state.transactions.unshift(saved);
        document.querySelector('#transaction-dialog').close();
        render();
        showToast(id ? 'Transaction updated' : 'Transaction added');
    } catch (error) {
        document.querySelector('#form-error').textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

async function deleteTransaction(id) {
    const item = state.transactions.find(transaction => transaction.id === id);
    if (!item || !window.confirm(`Delete “${item.description}”?`)) return;
    try {
        await request(`/api/transactions/${id}`, { method: 'DELETE' });
        state.transactions = state.transactions.filter(transaction => transaction.id !== id);
        render();
        showToast('Transaction deleted');
    } catch (error) {
        showToast(error.message);
    }
}

async function saveBudget(event) {
    event.preventDefault();
    const errorElement = document.querySelector('#budget-error');
    const button = event.submitter;
    button.disabled = true;
    try {
        const budget = await request('/api/budgets', { method: 'PUT', body: JSON.stringify({ category: document.querySelector('#budget-category').value, amount: Number(document.querySelector('#budget-amount').value), month: state.month }) });
        state.budgets = state.budgets.filter(item => item.category !== budget.category || item.month !== budget.month);
        state.budgets.push(budget);
        renderView();
        showToast('Budget saved');
    } catch (error) {
        errorElement.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

function exportCsv() {
    const rows = [['Date', 'Description', 'Type', 'Category', 'Amount'], ...monthTransactions().map(item => [item.date, item.description, item.type, item.category, item.amount])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `budget-desk-${state.month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV report downloaded');
}

let toastTimer;
function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

loadState();
