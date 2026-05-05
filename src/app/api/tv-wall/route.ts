import { type NextRequest, NextResponse } from "next/server"
import { readStreams } from "@/lib/db"
import type { Stream } from "@/types/stream"

function buildSlots(streams: Stream[], maxCells: number): (string | null)[] {
  const slots = new Array<string | null>(maxCells).fill(null)
  const placed = new Set<string>()
  for (const s of streams) {
    const pos = s.tvPosition
    if (typeof pos === "number" && pos >= 0 && pos < maxCells && slots[pos] === null) {
      slots[pos] = s.id
      placed.add(s.id)
    }
  }
  let fill = 0
  for (const s of streams) {
    if (placed.has(s.id)) continue
    while (fill < maxCells && slots[fill] !== null) fill++
    if (fill >= maxCells) break
    slots[fill] = s.id
    fill++
  }
  return slots
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rows = Math.max(1, Math.min(20, Number(searchParams.get("rows")) || 3))
  const cols = Math.max(1, Math.min(20, Number(searchParams.get("cols")) || 4))
  const pure = searchParams.get("pure") === "1"

  const streams = readStreams()
  const slots = buildSlots(streams, rows * cols)
  const slotsJson = JSON.stringify(slots)
  const namesJson = JSON.stringify(Object.fromEntries(streams.map((s) => [s.id, s.name])))

  const chromeHtml = pure
    ? ""
    : `<button id="back" onclick="history.back()">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
    Back
  </button>
  <button id="mute" onclick="toggleMute()"><span id="mute-icon"></span></button>`

  const chromeCss = pure
    ? ""
    : `#back,#mute{position:fixed;z-index:30;display:flex;align-items:center;gap:8px;font-size:1.1rem;color:#fff;background:rgba(0,0,0,0.4);border:none;padding:12px 20px;border-radius:10px;cursor:pointer;transition:opacity .4s;font-family:sans-serif}
  #back{top:20px;left:20px}
  #mute{bottom:20px;right:20px}
  body.ui-hidden #back,body.ui-hidden #mute{opacity:0;pointer-events:none}`

  const chromeScript = pure
    ? `function setAllMuted(m){document.querySelectorAll('video').forEach(function(v){v.muted=m;});}
       window.__setAllMuted=setAllMuted;`
    : `var SVG_ON='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  var SVG_OFF='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  var globalMuted=true;
  function updateMuteIcon(){document.getElementById('mute-icon').innerHTML=globalMuted?SVG_OFF:SVG_ON;}
  function toggleMute(){globalMuted=!globalMuted;document.querySelectorAll('video').forEach(function(v){v.muted=globalMuted;});updateMuteIcon();}
  updateMuteIcon();
`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>TV Wall ${cols}x${rows}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000;overflow:hidden;width:100%;height:100%}
#grid{display:grid;width:100vw;height:100vh;height:100dvh;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:2px;background:#000}
.cell{position:relative;background:#000;overflow:hidden}
.cell video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.cell .label{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,0.55);color:#fff;font:600 12px/1.2 sans-serif;padding:2px 6px;border-radius:3px;pointer-events:none;opacity:1;transition:opacity .4s;z-index:2}
body.ui-hidden .cell .label{opacity:0}
.cell .msg{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;font:600 12px/1.2 sans-serif;padding:4px 10px;border-radius:6px;display:none;z-index:3;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.empty{background:#080808}
${chromeCss}
</style>
</head>
<body>
<div id="grid"></div>
${chromeHtml}
<script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js"></script>
<script>
var slots=${slotsJson};
var names=${namesJson};
var grid=document.getElementById('grid');

function makePlayer(cell, id){
  var v=document.createElement('video');
  v.autoplay=true;v.playsInline=true;v.muted=true;
  cell.appendChild(v);
  var label=document.createElement('div');
  label.className='label';label.textContent=names[id]||id;
  cell.appendChild(label);
  var msg=document.createElement('div');
  msg.className='msg';
  cell.appendChild(msg);

  var proxyUrl='/api/hls/live/'+id+'/index.m3u8';
  var directUrl='http://'+window.location.hostname+':8888/live/'+id+'/index.m3u8';
  var hls;var activeSrc;var lastT=0;var started=false;var msgTimer;

  function showMsg(t){
    msg.textContent=t;msg.style.display='block';
    clearTimeout(msgTimer);
    msgTimer=setTimeout(function(){msg.style.display='none';},4000);
  }

  function load(src){
    activeSrc=src;
    if(hls)hls.destroy();
    if(!Hls.isSupported()){
      if(v.canPlayType('application/vnd.apple.mpegurl')){
        v.src=src;v.play().catch(function(){});
      }
      return;
    }
    hls=new Hls({liveSyncDurationCount:2,liveMaxLatencyDurationCount:4,manifestLoadingTimeOut:10000,manifestLoadingMaxRetry:10,fragLoadingTimeOut:10000,fragLoadingMaxRetry:10});
    hls.loadSource(src);hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){v.play().catch(function(){});});
    hls.on(Hls.Events.ERROR,function(e,d){
      if(d.fatal){showMsg('Error: '+d.type+' — reconnecting...');setTimeout(function(){load(activeSrc);},3000);}
    });
  }

  setInterval(function(){
    if(!started && v.currentTime>0) started=true;
    if(started && v.currentTime===lastT && !v.paused){
      showMsg('Stream stalled — reloading...');
      if(hls) load(activeSrc);
      else { var s=v.src; v.src=''; v.src=s; v.play().catch(function(){}); }
    }
    lastT=v.currentTime;
  },10000);

  var ctrl=new AbortController();
  var t=setTimeout(function(){ctrl.abort();},2000);
  fetch(directUrl,{method:'HEAD',signal:ctrl.signal})
    .then(function(){clearTimeout(t);load(directUrl);})
    .catch(function(){clearTimeout(t);load(proxyUrl);});
}

slots.forEach(function(id){
  var cell=document.createElement('div');
  cell.className='cell'+(id?'':' empty');
  grid.appendChild(cell);
  if(id) makePlayer(cell,id);
});

${chromeScript}

var uiTimer;
function showUI(){
  document.body.classList.remove('ui-hidden');
  clearTimeout(uiTimer);
  uiTimer=setTimeout(function(){document.body.classList.add('ui-hidden');},5000);
}
document.addEventListener('mousemove',showUI);
document.addEventListener('touchstart',showUI);
document.addEventListener('keydown',showUI);
showUI();

try{
  var gp=JSON.parse(localStorage.getItem('global-prefs')||'{}');
  if(gp.autoReload){
    setTimeout(function(){location.reload();},Math.max(1,gp.reloadInterval||2)*60*1000);
  }
}catch(e){}
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
