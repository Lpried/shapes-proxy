import LibcurlClient from '@mercuryworkshop/libcurl-transport';
import { normalizeUrl } from './url.js';

const form = document.querySelector('form');
const input = document.querySelector('#address');
const status = document.querySelector('#status');
const notice = document.querySelector('#notice');
const welcome = document.querySelector('#welcome');
const appsPanel = document.querySelector('#app-panel');
const tabsElement = document.querySelector('#tabs');
const framesElement = document.querySelector('#frames');
const connection = document.querySelector('#connection');
const tabs = [];
const embedded = new URLSearchParams(location.search).get('embed') === '1' && parent !== window;
const shapesOrigin = 'https://4ef7a541-30cc-4bbf-9d05-8a351edd0e95.sandbox.floot.app';
document.documentElement.classList.toggle('embedded', embedded);
let current;
let pending;
let controller;
let panel = 'browser';

function deadline(promise, message, ms = 30000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}
function announce(message, error = false) {
  status.textContent = message;
  notice.hidden = !message;
  document.querySelector('#retry').hidden = !error;
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
    controller = new window.$scramjetController.Controller({ serviceworker: navigator.serviceWorker.controller, transport });
    await deadline(controller.wait(), 'The browser could not start. Reload and try again.');
    return controller;
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
function refresh() {
  input.value = current?.url || '';
  history.replaceState(null, '', '/' + location.search + (current?.url ? `#${new URLSearchParams({ url: current.url })}` : ''));
  welcome.hidden = panel !== 'home' && (panel !== 'browser' || !!current?.url);
  appsPanel.hidden = panel !== 'apps';
  for (const tab of tabs) tab.element.hidden = tab !== current || panel !== 'browser' || !tab.url;
  for (const button of document.querySelectorAll('[data-action]')) button.disabled = !current?.frame || panel !== 'browser';
  connection.classList.toggle('insecure', !current?.url?.startsWith('https:'));
  connection.title = current?.url?.startsWith('https:') ? 'HTTPS destination' : 'Website address';
  tabsElement.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = 'tab' + (tab === current ? ' active' : '');
    const select = document.createElement('button');
    select.className = 'tab-select';
    select.setAttribute('role', 'tab');
    select.setAttribute('aria-selected', String(tab === current));
    select.title = tab.url || 'New tab';
    const icon = document.createElement('span'); icon.className = 'tab-icon'; icon.textContent = '🌐'; icon.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.textContent = tab.url ? new URL(tab.url).hostname : 'New tab';
    select.append(icon, label);
    select.addEventListener('click', () => { current = tab; panel = 'browser'; announce(''); refresh(); });
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', embedded ? 'Close browser and return to Shapes' : `Close ${label.textContent}`);
    close.title = embedded ? 'Close browser and return to Shapes' : `Close ${label.textContent}`;
    close.addEventListener('click', () => {
      if (embedded) parent.postMessage({ type: 'shapes-browser', action: 'close' }, shapesOrigin);
      else removeTab(tab);
    });
    item.append(select, close); tabsElement.append(item);
  }
}
function newTab() {
  const element = document.createElement('iframe');
  element.title = 'Proxied website'; element.referrerPolicy = 'no-referrer'; element.allow = 'fullscreen; clipboard-write'; element.hidden = true;
  const tab = { element, url: '', frame: null, loading: false };
  tabs.push(tab); framesElement.append(element); current = tab; panel = 'browser';
  element.addEventListener('load', () => {
    if (!tab.frame || !tab.url) return;
    try {
      const pathname = element.contentWindow.location.pathname;
      if (!pathname.startsWith(tab.frame.prefix)) return;
      const decoded = decodeURIComponent(pathname.slice(tab.frame.prefix.length));
      if (/^https?:\/\//.test(decoded)) tab.url = decoded;
      const body = element.contentDocument?.body?.textContent || '';
      if (body.startsWith('Internal Service Worker Error:')) {
        if (current === tab) announce('This website could not load. Try another address or restart the browser.', true);
      } else if (current === tab) announce('');
    } catch { if (current === tab) announce(''); }
    if (current === tab && document.activeElement !== input) refresh();
  });
  announce(''); refresh(); input.focus(); return tab;
}
function removeTab(tab) {
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  tabs.splice(index, 1); tab.element.remove();
  if (tab.frame && controller) controller.frames = controller.frames.filter(frame => frame !== tab.frame);
  if (!tabs.length) { newTab(); return; }
  if (current === tab) current = tabs[Math.max(0, index - 1)];
  announce(''); refresh();
}
async function navigate(value) {
  const tab = current;
  if (tab.loading) return;
  try {
    const url = normalizeUrl(value);
    tab.loading = true; announce('Loading website…');
    const browser = await start();
    if (!tabs.includes(tab)) return;
    if (!tab.frame) tab.frame = browser.createFrame(tab.element);
    tab.url = url;
    if (current === tab) { panel = 'browser'; refresh(); }
    tab.frame.go(url);
  } catch (error) {
    if (current === tab) announce(error.message || 'Could not open this website.', true);
  } finally { tab.loading = false; }
}
form.addEventListener('submit', event => { event.preventDefault(); navigate(input.value); });
for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => current?.frame?.[button.dataset.action]());
document.querySelector('#new-tab').addEventListener('click', newTab);
document.querySelector('#close-tab').addEventListener('click', () => removeTab(current));
document.querySelector('#home').addEventListener('click', () => { panel = 'home'; announce(''); refresh(); input.focus(); });
document.querySelector('#apps').addEventListener('click', () => { panel = 'apps'; announce(''); refresh(); });
for (const button of document.querySelectorAll('[data-url]')) button.addEventListener('click', () => navigate(button.dataset.url));
const dialog = document.querySelector('#account-dialog');
for (const id of ['chat', 'profile']) document.querySelector(`#${id}`).addEventListener('click', () => {
  if (embedded) { parent.postMessage({ type: 'shapes-browser', action: id }, shapesOrigin); return; }
  document.querySelector('#account-title').textContent = id === 'chat' ? 'Your Shapes chat' : 'Your Shapes profile';
  document.querySelector('#account-description').textContent = id === 'chat' ? 'Chat is in your Shapes Network tab. Switch back and select Chat to join the conversation.' : 'Your profile is in your Shapes Network tab. Switch back to edit your picture and profile.';
  dialog.showModal();
});
for (const id of ['dismiss-dialog', 'account-done']) document.querySelector(`#${id}`).addEventListener('click', () => dialog.close());
document.querySelector('#retry').addEventListener('click', () => location.reload());
const initial = new URLSearchParams(location.hash.slice(1)).get('url');
newTab();
if (initial) navigate(initial);
if (embedded) {
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== shapesOrigin || event.data?.type !== 'shapes-browser') return;
    if (event.data.action === 'navigate' && typeof event.data.url === 'string') navigate(event.data.url);
  });
  parent.postMessage({ type: 'shapes-browser', action: 'ready' }, shapesOrigin);
}
