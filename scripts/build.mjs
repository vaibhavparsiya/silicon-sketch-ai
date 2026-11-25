import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
const assets={};
for(const f of await readdir('web')) assets[f]=await readFile('web/'+f,'utf8');
const parts=await Promise.all(['web/core.mjs','web/sequence.mjs','worker/contract.mjs','web/net.mjs','web/catalog.mjs','worker/rtl.mjs','worker/blind.mjs','worker/challenge.mjs','worker/interpreter.mjs','worker/server.mjs'].map(async f=>(await readFile(f,'utf8')).replace(/^import .*?;$/gm,'').replace(/^export /gm,'')));
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',parts.join('\n')+'\nconst assets='+JSON.stringify(assets)+';\nexport default {fetch(request,env){return handle(request,env,assets);}};\n');
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
