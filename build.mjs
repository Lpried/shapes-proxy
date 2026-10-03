import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

// Wisp 0.4.1 stores streams in an object but its per-host limiter tries to
// iterate that object. Keep the limiter enabled and correct its iteration.
const filterPath = 'node_modules/@mercuryworkshop/wisp-js/src/server/filter.mjs';
const brokenLoop = 'for (let stream of connection.streams) {';
const fixedLoop = 'for (let stream of Object.values(connection.streams)) {';
const filterSource = await readFile(filterPath, 'utf8');
if (filterSource.includes(brokenLoop)) {
  await writeFile(filterPath, filterSource.replace(brokenLoop, fixedLoop));
} else if (!filterSource.includes(fixedLoop)) {
  throw new Error('Wisp stream limiter changed; review the compatibility fix.');
}

for (const [packageName, directory, files] of [
  ['scramjet', 'scramjet', ['scramjet.js', 'scramjet.wasm']],
  ['scramjet-controller', 'controller', ['controller.api.js', 'controller.inject.js', 'controller.sw.js']],
]) {
  await mkdir(`public/${directory}`, { recursive: true });
  for (const file of files) await copyFile(`node_modules/@mercuryworkshop/${packageName}/dist/${file}`, `public/${directory}/${file}`);
}
await build({ entryPoints: ['browser.js'], outfile: 'public/browser.js', bundle: true, format: 'esm', target: 'es2022', minify: true });

for (const file of ['index.html', 'style.css', 'sw.js']) await copyFile(file, `public/${file}`);
