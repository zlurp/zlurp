import { createClient } from 'redis';
let client = null;
let connected = false;
async function getClient() {
    if (!process.env.REDIS_URL)
        return null;
    if (client && connected)
        return client;
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
        console.error('[cache] Redis error:', err.message);
        connected = false;
    });
    try {
        await client.connect();
        connected = true;
    }
    catch (err) {
        console.error('[cache] Redis connect failed:', err);
        connected = false;
        return null;
    }
    return client;
}
const TTL = 60 * 60;
function key(url, mode) {
    return `scrape:${mode}:${url}`;
}
export async function getCache(url, mode) {
    const c = await getClient();
    if (!c)
        return null;
    try {
        const raw = await c.get(key(url, mode));
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export async function setCache(url, mode, entry) {
    const c = await getClient();
    if (!c)
        return;
    try {
        await c.setEx(key(url, mode), TTL, JSON.stringify(entry));
    }
    catch {
        // non-fatal
    }
}
