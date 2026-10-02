import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outputRoot=resolve(process.argv[2]??'.api-build');
const entrypoints=['start','action','pump'];
const relativeSpecifier=/(?:from\s*|import\s*\(|require\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;

async function javascriptFiles(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const nested=await Promise.all(entries.map(entry=>entry.isDirectory()?javascriptFiles(resolve(directory,entry.name)):entry.name.endsWith('.js')?[resolve(directory,entry.name)]:[]));
  return nested.flat();
}

for(const file of await javascriptFiles(outputRoot)){
  const source=await readFile(file,'utf8');
  for(const [,specifier] of source.matchAll(relativeSpecifier)){
    if(!/\.(?:js|json|node)$/.test(specifier))throw new Error(`Extensionless server import in ${file}: ${specifier}`);
  }
}

process.env.SUPABASE_URL??='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY??='runtime-smoke-placeholder';

for(const name of entrypoints){
  const module=await import(pathToFileURL(resolve(outputRoot,`api/online/match/${name}.js`)).href);
  let status=0,payload;
  await module.default({method:'GET',headers:{}},{status(value){status=value;return this;},json(value){payload=value;}});
  if(status!==405||payload?.code!=='METHOD_NOT_ALLOWED')throw new Error(`${name} endpoint did not reach requirePost()`);
  status=0;payload=undefined;
  await module.default({method:'POST',headers:{},body:{}},{status(value){status=value;return this;},json(value){payload=value;}});
  if(status!==401||payload?.code!=='UNAUTHORIZED')throw new Error(`${name} endpoint did not reach authentication`);
}

for(const [file,request,expected] of [
  ['health',{method:'POST',headers:{}},405],
  ['online/match/cron',{method:'GET',headers:{}},401],
]){
  const module=await import(pathToFileURL(resolve(outputRoot,`api/${file}.js`)).href);let status=0;
  await module.default(request,{status(value){status=value;return this;},json(){}});
  if(status!==expected)throw new Error(`${file} endpoint returned ${status}, expected ${expected}`);
}

console.log('Server ESM import graph and entrypoint smoke checks passed.');
