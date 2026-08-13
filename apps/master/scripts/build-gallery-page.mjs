// Folds the built gallery into one self-contained HTML file.
//
// The CSS and JS are inlined so the result opens from disk with no server and
// no network, which is what makes it shareable — the design system is
// otherwise only visible inside Electron on Windows.
//
// Run after `pnpm gallery`:  node scripts/build-gallery-page.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../gallery-dist');
const out = resolve(dist, 'blocks-c1-gallery.html');

const [css, js] = await Promise.all([
  readFile(resolve(dist, 'gallery.css'), 'utf8'),
  readFile(resolve(dist, 'gallery.js'), 'utf8'),
]);

// A closing script tag inside the bundle's own string literals would end the
// inline block early; break it up so the browser keeps reading JavaScript.
const safeJs = js.replaceAll('</script', '<\\/script');

const html = `<title>Blocks C1 Gallery</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;

await writeFile(out, html, 'utf8');
console.log(`wrote ${out} — ${(html.length / 1024).toFixed(0)} kB`);
