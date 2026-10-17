import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/dompurify/dist/purify.min.js', 'public/vendor/purify.min.js');
await copyFile('node_modules/dompurify/LICENSE', 'public/vendor/DOMPurify-LICENSE');
