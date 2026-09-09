const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
let count = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if (entry.isDirectory()) visit(file);
    else if(file.endsWith('.js')) { new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});count++; }
    else if(file.endsWith('.html')) {
      const dom=new JSDOM(fs.readFileSync(file,'utf8'));
      for(const script of dom.window.document.querySelectorAll('script:not([src])')) {new vm.Script(script.textContent,{filename:file});count++;}
      for(const element of dom.window.document.querySelectorAll('*')) for(const attribute of element.attributes) if(attribute.name.startsWith('on')) new vm.Script(`function handler(event){${attribute.value}}`,{filename:file});
      dom.window.close();
    }
  }
}
for(const directory of ['src','public','scripts','test'])visit(directory);
for(const file of ['server.js','knexfile.js']){new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});count++;}
console.log(`Checked ${count} JavaScript files and inline scripts.`);
