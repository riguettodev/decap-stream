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
  </style>
</head>
<body>
  <video id="v" autoplay muted playsinline></video>
  <div id="msg"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js"></script>
  <script>
    var streamId='${id}';
    var proxyUrl='/api/hls/live/'+streamId+'/index.m3u8';
    var directUrl='http://'+window.location.hostname+':8888/live/'+streamId+'/index.m3u8';
    var activeSrc=proxyUrl;
    var hls;

    function showMsg(t){
      var m=document.getElementById('msg');
      m.textContent=t;m.style.display='block';
      setTimeout(function(){m.style.display='none';},4000);
    }

    function load(src){
      activeSrc=src;
      if(hls)hls.destroy();
      hls=new Hls({
        liveSyncDurationCount:2,liveMaxLatencyDurationCount:4,
        manifestLoadingTimeOut:10000,manifestLoadingMaxRetry:10,
        fragLoadingTimeOut:10000,fragLoadingMaxRetry:10
      });
      hls.loadSource(src);
      hls.attachMedia(document.getElementById('v'));
      hls.on(Hls.Events.MANIFEST_PARSED,function(){document.getElementById('v').play();});
      hls.on(Hls.Events.ERROR,function(e,d){
        if(d.fatal){showMsg('Erro: '+d.type+' — reconectando...');setTimeout(function(){load(activeSrc);},3000);}
      });
    }

    var last=0;
    setInterval(function(){
      var v=document.getElementById('v');
      if(v.currentTime===last&&!v.paused){showMsg('Stream travada — recarregando...');load(activeSrc);}
      last=v.currentTime;
    },10000);

    var ctrl=new AbortController();
    var fetchTimer=setTimeout(function(){ctrl.abort();},2000);
    fetch(directUrl,{method:'HEAD',signal:ctrl.signal})
      .then(function(){clearTimeout(fetchTimer);load(directUrl);})
      .catch(function(){clearTimeout(fetchTimer);load(proxyUrl);});
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
