export function normalizeUrl(value) {
  const input = value.trim();
  if (!input) throw new Error('Enter a website address.');
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an http or https address without embedded login details.');
  }
  if (!url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost')) {
    throw new Error('Enter a public website address.');
  }
  return url.href;
}
