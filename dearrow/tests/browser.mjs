import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../tizentube/mods');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) throw Error('not a source file');
    res.setHeader('Content-Type','text/javascript'); res.end(await readFile(path));
  } catch { res.setHeader('Content-Type','text/html');res.end('<html><body><div id="card"></div></body></html>'); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.route('https://www.youtube.com/youtubei/v1/**', async route => {
    const id=new URL(route.request().url()).searchParams.get('id') || 'dQw4w9WgXcQ';
    const item = { tileRenderer: {
      contentId: id, onSelectCommand: { watchEndpoint: { videoId: id } },
      metadata: { tileMetadataRenderer: { title: { simpleText: 'Original ' + id } } },
      header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: 'original.jpg' }] } } }
    } };
    const data = { contents: { gridRenderer: { items: [item] } } };
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
  });
  await page.route('https://dearrow-thumb.ajay.app/**', async route => {
    const good = !route.request().url().includes('time=9');
    await route.fulfill({ status: good ? 200 : 404, contentType: 'image/png',
      body: good ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGJkAAAAASUVORK5CYII=', 'base64') : '' });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  let adblock=await readFile(resolve(root,'features/adblock.js'),'utf8');
  adblock=adblock.replace(/^import .*?;\s*$/gm,'');
  await page.evaluate(async ({adblock})=>{
    window.settings={enabled:true,titles:true,thumbnails:true};
    window._yttv={};window.queuedVideos={videos:[]};
    const mod=await import('/features/dearrow.js');window.dearrow=mod;
    window.process=mod.createResponseProcessor({client:{get:async id=> {
      await new Promise(r=>setTimeout(r,30)); return {title:'Replaced '+id,timestamp:0};
    }},readSettings:()=>window.settings,loadImage:async()=>true});
    mod.installTransport(window,window.process,console.warn);
    // Execute the actual patched upstream parse/HQ pipeline with UI dependencies
    // stubbed. This is a fixture integration test, not a live YouTube session.
    const configRead=key=>({ enableHqThumbnails:true,sponsorBlockManualSkips:[],hideWatchedVideosPages:[],preferredVideoCodec:'any' })[key];
    Function('configRead',adblock)(configRead);
    window.title=data=>data.contents.gridRenderer.items[0].tileRenderer.metadata.tileMetadataRenderer.title.simpleText;
    window.thumb=data=>data.contents.gridRenderer.items[0].tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url;
    window.render=data=>{document.querySelector('#card').textContent=window.title(data);};
  },{adblock});
  let count=0;
  async function check(name, fn) { await fn();count++;console.log('PASS '+name); }
  await check('fetch JSON -> upstream parse -> rendered fixture title and thumbnail',async()=>{
    const result=await page.evaluate(async()=>{const data=await(await fetch('https://www.youtube.com/youtubei/v1/browse')).json();render(data);return {title:document.querySelector('#card').textContent,thumb:thumb(data)};});
    assert.equal(result.title,'Replaced dQw4w9WgXcQ');assert.ok(result.thumb.includes('time=0'));
  });
  await check('XHR text handlers see prepared data and ordered final events',async()=>{
    const result=await page.evaluate(()=>new Promise(resolve=>{
      const xhr=new XMLHttpRequest(),events=[];xhr.open('GET','https://www.youtube.com/youtubei/v1/search');
      xhr.onreadystatechange=()=>{if(xhr.readyState===4) events.push(['ready',title(JSON.parse(xhr.responseText))]);};
      xhr.onload=()=>events.push(['load',title(JSON.parse(xhr.responseText))]);
      xhr.onloadend=()=>resolve(events);xhr.send();
    }));assert.deepEqual(result,[['ready','Replaced dQw4w9WgXcQ'],['load','Replaced dQw4w9WgXcQ']]);
  });
  await check('XHR json response type',async()=>{
    const result=await page.evaluate(()=>new Promise(resolve=>{const xhr=new XMLHttpRequest();xhr.open('GET','https://www.youtube.com/youtubei/v1/next');xhr.responseType='json';xhr.onload=()=>resolve(title(xhr.response));xhr.send();}));assert.equal(result,'Replaced dQw4w9WgXcQ');
  });
  await check('reused XHR drops prepared response from previous request',async()=>{
    const result=await page.evaluate(()=>new Promise(resolve=>{
      const xhr=new XMLHttpRequest(),titles=[];xhr.open('GET','https://www.youtube.com/youtubei/v1/search');xhr.onload=()=>titles.push(title(JSON.parse(xhr.responseText)));
      xhr.onloadend=()=>resolve(titles);xhr.send();
      setTimeout(()=>{xhr.open('GET','https://www.youtube.com/youtubei/v1/search?id=aqz-KE-bpKQ');xhr.send();},10);
    }));assert.deepEqual(result,['Replaced aqz-KE-bpKQ']);
  });
  await check('rapid navigation fixture renders current requested ID',async()=>{
    const result=await page.evaluate(async()=>{
      let generation=0;
      async function navigate(id){const own=++generation;const data=await(await fetch('https://www.youtube.com/youtubei/v1/browse?id='+id)).json();if(own===generation)render(data);}
      await Promise.all([navigate('dQw4w9WgXcQ'),navigate('aqz-KE-bpKQ')]);return document.querySelector('#card').textContent;
    });assert.equal(result,'Replaced aqz-KE-bpKQ');
  });
  await check('fetch clone and text consumption',async()=>{
    const result=await page.evaluate(async()=>{const response=await fetch('https://www.youtube.com/youtubei/v1/browse');const clone=response.clone();return [title(await response.json()),title(JSON.parse(await clone.text()))];});assert.deepEqual(result,['Replaced dQw4w9WgXcQ','Replaced dQw4w9WgXcQ']);
  });
  await check('master off retains original at transport and render',async()=>{
    const result=await page.evaluate(async()=>{settings.enabled=false;const data=await(await fetch('https://www.youtube.com/youtubei/v1/browse')).json();render(data);settings.enabled=true;return document.querySelector('#card').textContent;});assert.equal(result,'Original dQw4w9WgXcQ');
  });
  await check('unrelated HTTP request retains body',async()=>{
    const result=await page.evaluate(async()=>{const r=await fetch('/features/dearrow.js');return(await r.text()).startsWith('import sha256');});assert.equal(result,true);
  });
  await check('real Image load and failure fallback', async()=>{
    const result=await page.evaluate(async()=>[
      await dearrow.preloadImage(window,dearrow.thumbnailURL('dQw4w9WgXcQ',0)),
      await dearrow.preloadImage(window,dearrow.thumbnailURL('dQw4w9WgXcQ',9))
    ]);assert.deepEqual(result,[true,false]);
  });
  await check('actual image preload and rendered fixture use correct video frame', async()=>{
    const result=await page.evaluate(async()=>{
      const process=dearrow.createResponseProcessor({ client:{get:async()=>({title:'Frame test',timestamp:0})},
        readSettings:()=>settings,loadImage:url=>dearrow.preloadImage(window,url) });
      const data={videoRenderer:{videoId:'aqz-KE-bpKQ',title:{simpleText:'Original'},thumbnail:{thumbnails:[{url:'original.jpg'}]}}};
      await process(data);const image=document.createElement('img');image.src=data.videoRenderer.thumbnail.thumbnails[0].url;
      document.body.appendChild(image);await image.decode();return{url:image.src,width:image.naturalWidth,title:data.videoRenderer.title.simpleText};
    });assert.ok(result.url.includes('videoID=aqz-KE-bpKQ&time=0'));assert.equal(result.width,1);assert.equal(result.title,'Frame test');
  });
  await check('transport installation is idempotent', async()=>{
    const result=await page.evaluate(()=>{const original=window.fetch;dearrow.installTransport(window,window.process);return window.fetch===original;});
    assert.equal(result,true);
  });
  assert.deepEqual(errors,[]);console.log(`${count} browser fixture integration tests passed. Chromium ${browser.version()}. Live YouTube/Shield not tested.`);
} finally {if(browser) await browser.close();await new Promise(r=>server.close(r));}
