const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/world.js':'world.js','/enemies.js':'enemies.js','/game.js':'game.js'};
http.createServer((req,res)=>{
 const file=files[req.url.split('?')[0]];
 if(!file){res.writeHead(404);res.end();return}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
 fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(8765,'127.0.0.1',()=>console.log('ORBITAL: http://127.0.0.1:8765/'));
