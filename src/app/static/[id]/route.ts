import { type NextRequest, NextResponse } from "next/server"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#000;overflow:hidden;width:100%;height:100%}
    video{width:100vw;height:100vh;display:block;object-fit:contain}
    #msg{
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;
      border-radius:8px;font-family:sans-serif;font-size:34px;
      display:none;z-index:9
    }
    #back,#mute{
      position:fixed;z-index:20;
      display:flex;align-items:center;gap:8px;
      font-size:1.1rem;color:#fff;background:rgba(0,0,0,0.4);
      border:none;padding:12px 20px;border-radius:10px;
      cursor:pointer;transition:opacity 0.4s;
    }
    #back{top:20px;left:20px;}
    #mute{bottom:20px;right:20px;}
  </style>
</head>
<body>
  <video id="v" autoplay playsinline></video>
  <div id="msg"></div>
  <button id="back" onclick="history.back()">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
    Back
  </button>
  <button id="mute" onclick="toggleMute()">
    <span id="mute-icon"></span>
  </button>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js"></script>
  <script>
    var streamId='${id}';
    var proxyUrl='/api/hls/live/'+streamId+'/index.m3u8';
    var directUrl='http://'+window.location.hostname+':8888/live/'+streamId+'/index.m3u8';
    var activeSrc=proxyUrl;
    var hls;

    var SVG_ON='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    var SVG_OFF='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

    function updateMuteIcon(muted){
      document.getElementById('mute-icon').innerHTML=muted?SVG_OFF:SVG_ON;
    }
    function toggleMute(){
      var v=document.getElementById('v');
      v.muted=!v.muted;
      updateMuteIcon(v.muted);
    }

    function showMsg(t){
      var m=document.getElementById('msg');
      m.textContent=t;m.style.display='block';
      setTimeout(function(){m.style.display='none';},4000);
    }

    // Both buttons fade out after 5s, reappear on any interaction
    var backBtn=document.getElementById('back');
    var muteBtn=document.getElementById('mute');
    var uiTimer;
    function showUI(){
      backBtn.style.opacity='1';muteBtn.style.opacity='1';
      clearTimeout(uiTimer);
      uiTimer=setTimeout(function(){backBtn.style.opacity='0';muteBtn.style.opacity='0';},5000);
    }
    document.addEventListener('mousemove',showUI);
    showUI();

    function startHls(src){
      activeSrc=src;
      if(hls)hls.destroy();
      hls=new Hls({
        liveSyncDurationCount:2,liveMaxLatencyDurationCount:4,
        manifestLoadingTimeOut:10000,manifestLoadingMaxRetry:10,
        fragLoadingTimeOut:10000,fragLoadingMaxRetry:10
      });
      hls.loadSource(src);
      hls.attachMedia(document.getElementById('v'));
      hls.on(Hls.Events.MANIFEST_PARSED,function(){
        var v=document.getElementById('v');
        var p=v.play();
        if(p)p.catch(function(){
          v.muted=true;
          updateMuteIcon(true);
          v.play();
        });
      });
      hls.on(Hls.Events.ERROR,function(e,d){
        if(d.fatal){showMsg('Error: '+d.type+' — reconnecting...');setTimeout(function(){startHls(activeSrc);},3000);}
      });
    }

    updateMuteIcon(false);

    // Try direct MediaMTX first (lower latency, avoids proxy buffering).
    // Falls back to proxy if port 8888 is not reachable from this client.
    fetch(directUrl,{method:'HEAD',signal:AbortSignal.timeout(2000)})
      .then(function(){startHls(directUrl);})
      .catch(function(){startHls(proxyUrl);});

    var last=0;
    setInterval(function(){
      var v=document.getElementById('v');
      if(v.currentTime===last&&!v.paused){showMsg('Stream stalled — reloading...');startHls(activeSrc);}
      last=v.currentTime;
    },10000);
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
