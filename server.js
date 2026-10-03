const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const dataDirectory = path.join(root, 'data');
const dataFile = path.join(dataDirectory, 'budget-data.json');
const preferredPorts = Array.from(new Set([Number(process.env.PORT) || 3000, 3001, 3002, 3003, 3004, 3005, 3010]));
const categories = ['Housing', 'Food', 'Transport', 'Utilities', 'Health', 'Shopping', 'Entertainment', 'Income', 'Other'];

async function readState() {
    try {
        const saved = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        return {
            transactions: Array.isArray(saved.transactions) ? saved.transactions : [],
            budgets: Array.isArray(saved.budgets) ? saved.budgets : []
        };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return { transactions: [], budgets: [] };
    }
}

async function writeState(state) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = `${dataFile}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(state, null, 2));
    await fs.rename(temporaryFile, dataFile);
}

function sendJson(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
}

async function readBody(request) {
    let body = '';
    for await (const chunk of request) {
        body += chunk;
        if (body.length > 1024 * 1024) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    }
    try {
        return JSON.parse(body || '{}');
    } catch {
        throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
    }
}

function validateTransaction(input) {
    const description = typeof input.description === 'string' ? input.description.trim().slice(0, 100) : '';
    const amount = Number(input.amount);
    const category = categories.includes(input.category) ? input.category : 'Other';
    const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : '';
    const type = input.type === 'income' ? 'income' : 'expense';
    if (!description || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || !date) {
        throw Object.assign(new Error('Enter a description, a valid date, and an amount greater than zero.'), { status: 400 });
    }
    return { description, amount: Math.round(amount * 100) / 100, category, date, type };
}

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
        if (url.pathname.startsWith('/api/')) {
            if (request.method === 'GET' && url.pathname === '/api/state') {
                sendJson(response, 200, await readState());
                return;
            }

            if (request.method === 'POST' && url.pathname === '/api/transactions') {
                const state = await readState();
                const transaction = { id: crypto.randomUUID(), ...validateTransaction(await readBody(request)), createdAt: new Date().toISOString() };
                state.transactions.unshift(transaction);
                await writeState(state);
                sendJson(response, 201, transaction);
                return;
            }

            const transactionMatch = url.pathname.match(/^\/api\/transactions\/([\w-]+)$/);
            if (request.method === 'PUT' && transactionMatch) {
                const state = await readState();
                const index = state.transactions.findIndex(item => item.id === transactionMatch[1]);
                if (index < 0) {
                    sendJson(response, 404, { error: 'Transaction not found.' });
                    return;
                }
                state.transactions[index] = { ...state.transactions[index], ...validateTransaction(await readBody(request)) };
                await writeState(state);
                sendJson(response, 200, state.transactions[index]);
                return;
            }

            if (request.method === 'DELETE' && transactionMatch) {
                const state = await readState();
                const remaining = state.transactions.filter(item => item.id !== transactionMatch[1]);
                if (remaining.length === state.transactions.length) {
                    sendJson(response, 404, { error: 'Transaction not found.' });
                    return;
                }
                state.transactions = remaining;
                await writeState(state);
                response.writeHead(204);
                response.end();
                return;
            }

            if (request.method === 'PUT' && url.pathname === '/api/budgets') {
                const input = await readBody(request);
                const budget = Number(input.amount);
                if (!categories.includes(input.category) || !Number.isFinite(budget) || budget < 0 || budget > 1_000_000_000) {
                    sendJson(response, 400, { error: 'Choose a category and enter a valid budget amount.' });
                    return;
                }
                const state = await readState();
                const month = typeof input.month === 'string' && /^\d{4}-\d{2}$/.test(input.month) ? input.month : new Date().toISOString().slice(0, 7);
                const nextBudget = { category: input.category, month, amount: Math.round(budget * 100) / 100 };
                state.budgets = state.budgets.filter(item => item.category !== nextBudget.category || item.month !== month);
                state.budgets.push(nextBudget);
                await writeState(state);
                sendJson(response, 200, nextBudget);
                return;
            }

            sendJson(response, 404, { error: 'API route not found.' });
            return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            sendJson(response, 405, { error: 'Method not allowed.' });
            return;
        }
        const requestedPath = decodeURIComponent(url.pathname === '/' ? '/dashboard.html' : url.pathname);
        const filePath = path.resolve(root, `.${requestedPath}`);
        if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }
        const contents = await fs.readFile(filePath);
        response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
        response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
        if (error.code === 'ENOENT') {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }
        sendJson(response, error.status || 500, { error: error.status ? error.message : 'Something went wrong on the server.' });
    }
});

let currentPortIndex = 0;

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        const nextPort = preferredPorts[currentPortIndex + 1];
        if (nextPort) {
            currentPortIndex += 1;
            console.warn(`Port ${preferredPorts[currentPortIndex - 1]} is busy. Retrying on ${nextPort}...`);
            server.listen(nextPort);
            return;
        }
    }

    console.error(error);
    process.exit(1);
});

server.listen(preferredPorts[currentPortIndex], () => {
    console.log(`Budget Desk is running at http://localhost:${preferredPorts[currentPortIndex]}`);
});
