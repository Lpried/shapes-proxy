import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

for (const [packageName, directory, files] of [
  ['scramjet', 'scramjet', ['scramjet.js', 'scramjet.wasm']],
  ['scramjet-controller', 'controller', ['controller.api.js', 'controller.inject.js', 'controller.sw.js']],
]) {
  await mkdir(`public/${directory}`, { recursive: true });
  for (const file of files) await copyFile(`node_modules/@mercuryworkshop/${packageName}/dist/${file}`, `public/${directory}/${file}`);
}
await build({ entryPoints: ['browser.js'], outfile: 'public/browser.js', bundle: true, format: 'esm', target: 'es2022', minify: true });

for (const file of ['index.html', 'style.css', 'sw.js']) await copyFile(file, `public/${file}`);
