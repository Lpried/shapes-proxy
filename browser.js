import LibcurlClient from '@mercuryworkshop/libcurl-transport';
import { normalizeUrl } from './url.js';

const form = document.querySelector('form');
const input = document.querySelector('#address');
const status = document.querySelector('#status');
const frameElement = document.querySelector('iframe');
const welcome = document.querySelector('#welcome');
const go = document.querySelector('#go');
let frame;
let pending;

function deadline(promise, message, ms = 30000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function start() {
  if (!pending) pending = (async () => {
    if (!isSecureContext || !navigator.serviceWorker) throw new Error('Open this browser over HTTPS.');
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await deadline(navigator.serviceWorker.ready, 'Browser setup timed out. Reload and try again.');
    if (!navigator.serviceWorker.controller) await deadline(new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    }), 'The browser is not ready yet. Reload and try again.');
    const transport = new LibcurlClient({ wisp: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` });
    await deadline(transport.init(), 'The connection could not start. Reload and try again.');
    const controller = new window.$scramjetController.Controller({ serviceworker: navigator.serviceWorker.controller, transport });
    await deadline(controller.wait(), 'The browser could not start. Reload and try again.');
    frame = controller.createFrame(frameElement);
    for (const button of document.querySelectorAll('[data-action]')) button.disabled = false;
    return frame;
  })();
  return pending;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  go.disabled = true;
  try {
    const url = normalizeUrl(input.value);
    status.textContent = 'Starting browser…';
    const browser = await start();
    welcome.hidden = true;
    frameElement.hidden = false;
    input.value = url;
    history.replaceState(null, '', `/#${new URLSearchParams({ url })}`);
    status.textContent = 'Loading website…';
    browser.go(url);
  } catch (error) {
    status.textContent = error.message || 'Could not open this website. Try reloading.';
  } finally { go.disabled = false; }
});
// A frame load does not prove a remote site succeeded (it can be an error page).
frameElement.addEventListener('load', () => { if (frame) status.textContent = 'Browser ready'; });
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => frame?.[button.dataset.action]());
}
document.querySelector('#retry').addEventListener('click', () => location.reload());
const initial = new URLSearchParams(location.hash.slice(1)).get('url');
if (initial) { input.value = initial; form.requestSubmit(); }
