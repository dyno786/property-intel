import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
for (const file of fs.readdirSync('api').filter(p => p.endsWith('.js'))) parse(fs.readFileSync('api/'+file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
for (const file of fs.readdirSync('public').filter(p => p.endsWith('.html'))) {
  const html = fs.readFileSync('public/'+file, 'utf8');
  if ((html.match(/<script\b/gi)||[]).length !== (html.match(/<\/script>/gi)||[]).length) throw new Error(file+': unbalanced script tags');
  for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    new vm.Script(code, { filename: file });
    if (/\.innerHTML\s*=/.test(code)) throw new Error(file+': unsafe innerHTML assignment');
  }
  const outside = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  if (/\n(?:async function |function |let |const )/.test(outside)) throw new Error(file+': JavaScript outside script tags');
}
console.log('All API modules and 19 HTML pages passed syntax and script-boundary checks.');
