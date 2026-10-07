'use strict';
(() => {
  const {Engine,catalog}=window.GPULab;
  const engine=new Engine();
  const art=window.ComponentArt;
  let runtime='bare',storageOn=false,cloudOn=false,gitops=false,heal=false;
  const modes={bare:{name:'Linux · operating system',unit:'Process',title:'YOUR COMPUTERS',art:'linux',description:'Programs run directly on Linux. You choose the machine and start the software yourself.'},docker:{name:'Docker · containers on each machine',unit:'Container',title:'DOCKER ON EACH COMPUTER',art:'docker',description:'A container packages a program’s environment. Docker runs it on one machine; plain Docker does not coordinate this whole fleet.'},kubernetes:{name:'Kubernetes · coordinates the machines',unit:'Pod',title:'YOUR KUBERNETES CLUSTER',art:'kubernetes',description:'Kubernetes manages Pods across your machines. Each Pod runs containers on one machine. GPUs still do the same math.'}};
  const $=id=>document.getElementById(id);
  const canvas=$('wires'),ctx=canvas.getContext('2d'),board=$('board');
  const colors={request:'#68dfc6',answer:'#edb97b',exchange:'#ad9aff',trace:'#eaa3d7',deployment:'#82b9fa'};
  const splitValues=[1,2,4,8];
  // Slow the shared simulation clock so every dot and workload stays synchronized.
  const playbackRate=.25;
  let catalogFilter='all',mixedTraffic=true;
  const tasks={
    text:{label:'Language / reasoning',art:'model',input:'A prompt or request',action:'Read → reason → generate',output:'Generated text',help:'The model predicts text using its learned weights. Gemma also supports images; this lab uses its text route.'},
    vision:{label:'Object detection',art:'vision',input:'A camera frame or photo',action:'Find objects in the image',output:'Person · box · confidence',help:'YOLO returns detections. The app can draw boxes on the original image. It does not write a chatbot answer.'},
    embedding:{label:'Embedding',art:'embedding',input:'“A dog playing outside”',action:'Encode the text’s meaning',output:'[0.12, −0.08, …] · 1,024 values',help:'A vector is a list of numbers. A vector database compares these lists to retrieve similar passages. Embeddings are not answers.'},
    rerank:{label:'Reranking',art:'rerank',input:'A query + candidate passages',action:'Score query–passage pairs',output:'Most relevant passages first',help:'Search first finds candidates. A reranker reads them more closely and scores relevance; the app sorts them. A language model can then use the best passages to answer (RAG).'}
  };
  const taskFor=c=>tasks[c.task||'text'];
  const modelArt=c=>c.kind==='model'?taskFor(c).art:c.name==='Langfuse'?'trace':c.short==='API'?'network':'notebook';
  function modelDetails(c){return c.kind==='model'?' '+c.format+' · '+c.memory+' GB estimated reservation. '+(c.shardable===false?'This lab keeps each copy on one GPU; the split lever does not apply.':'GPUs per copy controls this model’s simulated split.')+' Actual memory depends on context, batch size, and runtime.':'';}
  function sourceLink(c){return c.source?'<a class="inspect-button" target="_blank" rel="noreferrer" href="'+c.source+'">Official model information ↗</a>':'';}
  function updateTask(){const c=catalog[engine.route],t=taskFor(c);$('taskModel').textContent=c.name;$('taskArt').innerHTML=art(t.art);$('taskInput').textContent=t.input;$('taskKind').textContent=t.label;$('taskAction').textContent=t.action;$('taskOutput').textContent=t.output;$('taskHelp').textContent=t.help;$('clients').querySelector('small').textContent=t.input;$('gateway').querySelector('small').textContent='Routes to the inference API';$('routeSelected').hidden=!selection||catalog[selection.type].kind!=='model'||selection.type===engine.route;}
  $('route').innerHTML=Object.entries(tasks).map(([type,t])=>'<optgroup label="'+t.label+'">'+Object.entries(catalog).filter(([,c])=>c.task===type).map(([key,c])=>'<option value="'+key+'">'+c.name+'</option>').join('')+'</optgroup>').join('');
  $('catalogFilter').onchange=e=>{catalogFilter=e.target.value;render();};
  $('routeSelected').onclick=()=>{if(selection&&catalog[selection.type].kind==='model'){engine.route=selection.type;render();}};

  let selection=null,selectedId=null,dragPayload=null,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clock=0,last=0,arrival=0,requests=[],effects=[],completed=0,traceCount=0,dropped=0,latencies=[],requestId=0,focusId=null,focusStage='',lastUI=0,deployUntil=0;
  let paths={},rects={},width=0,height=0,toastTimer=null,presetName='copies';
  const lanes={text:{name:'Chat & reasoning',app:'Chat interface',color:'#68dfc6',art:'model'},vision:{name:'Image detection',app:'Camera application',color:'#f4b58b',art:'vision'},embedding:{name:'Embeddings',app:'Search indexer',color:'#91d1f3',art:'embedding'},rerank:{name:'Reranking',app:'Search results',color:'#efabd5',art:'rerank'}};
  let demand={text:25,vision:25,embedding:25,rerank:25},laneModels={text:'small',vision:'yolo',embedding:'embedding',rerank:'reranker'},credits={text:0,vision:0,embedding:0,rerank:0};
  let finished=[],traceRows=[],pendingReplicas=[],droppedByLane={text:0,vision:0,embedding:0,rerank:0},lastSchedule=0,trafficEpoch=0;
  const locationOf=p=>!p?'unassigned':p.target==='gpu'?'GPU '+p.gpus.map(g=>g+1).join(' + '):p.target==='cpu'?'Machine '+(p.host+1)+' CPU':'Online provider';
  const laneOf=type=>catalog[type].task||'text';
  function laneRates(){const total=Object.values(demand).reduce((a,b)=>a+b,0),rate=+$('traffic').value;return Object.fromEntries(Object.keys(lanes).map(k=>[k,mixedTraffic?(total?rate*demand[k]/total:0):(laneOf(engine.route)===k?rate:0)]));}
  function chooseType(){if(!mixedTraffic)return engine.route;const total=Object.values(demand).reduce((a,b)=>a+b,0);if(!total)return null;let chosen=null;for(const k of Object.keys(lanes)){if(!demand[k])continue;credits[k]+=demand[k]/total;if(chosen===null||credits[k]>credits[chosen])chosen=k;}credits[chosen]-=1;return laneModels[chosen];}
  function renderLayers(){
    const enabled=engine.placements.some(p=>p.type==='api');$('platformLayers').hidden=!enabled;$('demandPanel').hidden=!enabled;document.querySelector('.hardware-heading b').textContent=(enabled?'03':'01')+' / PHYSICAL MACHINES & GPUS';
    $('laneControls').innerHTML=Object.entries(lanes).map(([k,l])=>`<div class="demand-control" style="--lane:${l.color}"><label for="demand-${k}">${l.name}<output id="rate-${k}"></output></label><input id="demand-${k}" data-demand="${k}" type="range" min="0" max="100" value="${demand[k]}" aria-label="${l.name} relative demand"><label class="model-picker" for="lane-model-${k}">Model receiving this work</label><select id="lane-model-${k}" data-lane-model="${k}">${Object.entries(catalog).filter(([,c])=>c.task===k).map(([key,c])=>`<option value="${key}" ${laneModels[k]===key?'selected':''}>${c.name}</option>`).join('')}</select></div>`).join('');
    $('userApps').innerHTML=Object.entries(lanes).map(([k,l])=>`<div class="user-app" id="input-${k}" style="--lane:${l.color}"><div class="window-chrome"><i></i><i></i><i></i><b>${l.app}</b></div><span class="app-illustration">${art(l.art)}</span><span>${tasks[k].input}</span><b id="app-rate-${k}">0 / sec</b></div>`).join('');
    $('softwareLanes').innerHTML=Object.entries(lanes).map(([k,l])=>{
      const copies=engine.placements.filter(p=>catalog[p.type].kind==='model'&&laneOf(p.type)===k),targetModel=!mixedTraffic&&laneOf(engine.route)===k?engine.route:laneModels[k];
      return `<section class="software-lane" style="--lane:${l.color}" id="lane-${k}"><div class="lane-title"><b>${l.name}</b><span id="copy-count-${k}"></span></div><div class="request-queue" id="queue-${k}"><div><b id="queue-count-${k}">0 waiting</b><span id="queue-age-${k}"></span></div><div id="queue-cards-${k}" class="queue-cards"></div><small id="queue-note-${k}"></small></div><div class="service-router" id="router-${k}">${runtime==='kubernetes'?'Service address → ready replicas':'App router → ready copies'}<small>${catalog[targetModel].name}</small></div><div class="logical-copies">${copies.length?copies.map(p=>{
        const c=catalog[p.type],count=p.target==='gpu'?p.gpus.length:1;
        return `<button class="logical-workload ${runtime} ${engine.status(p)!=='ready'?'unavailable':''}" data-pid="${p.id}" id="logical-${p.id}" draggable="true" style="--tone:${c.color}"><span class="pod-shell-label">${p.target==='cloud'?'Hosted model':runtime==='kubernetes'?count>1?count+' worker Pods':'Pod':runtime==='docker'?'Docker runtime':'Linux process'}</span><span class="container-body"><span class="container-ribs"></span><span class="tag-art">${art(modelArt(c))}</span><b>${c.name}</b><small>${p.target==='cloud'?'Provider runs the software':runtime==='bare'?'Program + model weights':'Container: model server + weights'}</small></span><span class="allocation-label">↧ ${locationOf(p)}${p.target==='gpu'?' · '+engine.hosts(p).map(h=>'M'+(h+1)).join(', '):''}</span><span class="logical-state" id="logical-state-${p.id}">Ready</span></button>`;
      }).join(''):'<p class="no-copy">No models deployed.<br>Requests for this type will wait.</p>'}</div><button class="add-replica" data-replica="${k}">${runtime==='kubernetes'?'+ Request another replica':'+ Place another copy'}</button><span class="lane-throughput" id="throughput-${k}"></span></section>`;
    }).join('');
    $('softwareTitle').textContent=runtime==='kubernetes'?'02 / SOFTWARE · PODS CONTAIN CONTAINERS':runtime==='docker'?'02 / SOFTWARE · DOCKER CONTAINERS':'02 / SOFTWARE · LINUX PROGRAMS';
    $('controllerArt').innerHTML=art(runtime==='kubernetes'?'kubernetes':runtime==='docker'?'docker':'linux');
    $('controllerTitle').textContent=runtime==='kubernetes'?'Kubernetes control plane':runtime==='docker'?'Docker on each machine':'You start the programs';
    $('controllerHelp').textContent=runtime==='kubernetes'?'The scheduler places requested replicas on available hardware. Services give ready Pods stable addresses. The app holds queues and chooses available copies. Automatic failover is on by default. Automatic scaling from traffic needs a separately configured autoscaler.':'You choose where each copy runs. An application can route requests to copies without Kubernetes. Switching to Kubernetes adds scheduling and Pod management.';
    $('pendingList').innerHTML=pendingReplicas.map((p,i)=>`<span>${catalog[p.type].name} · Pending: no suitable free resources <button data-cancel-pending="${i}" aria-label="Cancel pending replica">×</button></span>`).join('');
    $('langfusePanel').hidden=!engine.placements.some(p=>p.type==='langfuse');
    $('langfuseArt').innerHTML=art('trace');
    renderRecovery();renderKV();updateLayerMetrics();
  }
  function updateLayerMetrics(){
    if(!$('queue-count-text'))return;
    const rates=laneRates(),activeIds=new Set(requests.filter(r=>['travel','compute'].includes(r.stage)).map(r=>r.pid));
    for(const [k,l] of Object.entries(lanes)){
      const target=mixedTraffic?laneModels[k]:laneOf(engine.route)===k?engine.route:laneModels[k];
      const wait=requests.filter(r=>r.stage==='queue'&&laneOf(r.type)===k),copies=engine.placements.filter(p=>p.type===target&&engine.status(p)==='ready');
      const pct=+$('traffic').value?Math.round(rates[k]/+$('traffic').value*100):0;
      $('rate-'+k).textContent=pct+'% · '+rates[k].toFixed(1)+'/s';$('app-rate-'+k).textContent=rates[k].toFixed(1)+' requests / sec';
      $('demand-'+k).disabled=!mixedTraffic;$('lane-model-'+k).disabled=!mixedTraffic;
      $('queue-count-'+k).textContent=wait.length+' waiting';$('queue-age-'+k).textContent=wait.length?'oldest '+Math.max(...wait.map(r=>clock-r.born)).toFixed(1)+'s':'';
      $('copy-count-'+k).textContent=copies.length+' ready for selected model';
      const cardKey=wait.slice(0,16).map(r=>r.id).join(',');
      if($('queue-cards-'+k).dataset.key!==cardKey){$('queue-cards-'+k).dataset.key=cardKey;$('queue-cards-'+k).innerHTML=wait.slice(0,16).map((r,i)=>`<button class="waiting-card" data-follow-request="${r.id}" style="--order:${i}" title="Request ${r.id} for ${catalog[r.type].name}"><i></i><span>#${r.id}</span></button>`).join('');}
      const oldTypes=[...new Set(wait.filter(r=>r.type!==target).map(r=>catalog[r.type].name))];
      $('queue-note-'+k).textContent=(wait.length>16?'+'+(wait.length-16)+' more. ':'')+(oldTypes.length?'Also waiting for: '+oldTypes.join(', ')+'. ':!copies.length&&rates[k]>0?'Deploy '+catalog[target].name+' to handle this demand. ':wait.length>8?'Demand is outpacing ready copies. Add capacity or reduce demand. ':'Cards collect here when every matching copy is busy.')+(droppedByLane[k]?' '+droppedByLane[k]+' dropped (buffer full).':'');
      $('lane-'+k).classList.toggle('congested',wait.length>8||(!copies.length&&wait.length>0));
      const recent=finished.filter(r=>r.task===k&&clock-r.at<10),windowSize=Math.max(1,Math.min(10,clock-trafficEpoch));
      $('throughput-'+k).textContent=(recent.length/windowSize).toFixed(1)+' results / sec · '+copies.filter(p=>activeIds.has(p.id)).length+' busy copies';
    }
    for(const p of engine.placements){const state=$('logical-state-'+p.id);if(!state)continue;state.textContent=engine.status(p)!=='ready'?(engine.status(p)==='memory'?'Memory budget exceeds capacity':runtime==='kubernetes'&&heal&&p.target!=='cloud'?'Pending recovery':'Offline / unavailable'):activeIds.has(p.id)?'Processing request':'Ready';$('logical-'+p.id).classList.toggle('processing',activeIds.has(p.id));}
    document.querySelectorAll('.gpu').forEach(g=>{const types=new Set(engine.gpuJobs(+g.dataset.index).map(p=>p.type));g.classList.toggle('hot',requests.filter(r=>r.stage==='queue'&&types.has(r.type)).length>8);});
    const lf=engine.service('langfuse');$('langfuseStatus').textContent=lf?'Receiving application traces':'Trace collection offline';
    const recentTraces=traceRows.slice(0,6);$('traceRows').innerHTML=recentTraces.length?recentTraces.map(t=>`<button class="trace-row" data-open-trace="${t.id}"><span>#${t.id} · ${t.model}<small>${t.location}</small></span><span>${t.wait.toFixed(1)}s<small>waiting</small></span><span>${t.total.toFixed(1)}s<small>total</small></span></button>`).join(''):'<p class="hint">Completed requests appear here after the app sends a trace.</p>';
    $('traceInsight').textContent=recentTraces.length?'Slowest recent request: '+[...recentTraces].sort((a,b)=>b.total-a.total)[0].model+'. Open a trace to see queue time versus model time.':'Langfuse observes the app. Its dashboard does not place Pods or run model calculations.';
  }
  function scheduleReplica(type){
    const c=catalog[type],oldSplit=engine.split,parts=c.shardable===false?1:[1,2,4,8].find(n=>engine.memory(type)/n<=96);if(!parts)return false;
    engine.split=parts;
    const choices=Array.from({length:8},(_,g)=>g).filter(g=>!engine.failed.has(engine.host(g))).sort((a,b)=>engine.gpuJobs(a).length-engine.gpuJobs(b).length||engine.gpuUsed(a)-engine.gpuUsed(b));
    for(const g of choices){if(parts>1){const free=choices.filter(x=>!engine.gpuJobs(x).length);if(free.length<parts)break;}
      const result=engine.place(type,'gpu',g);if(result.ok){engine.split=oldSplit;deployUntil=clock+4;log('Scheduler placed '+c.name+' on '+locationOf(result.placement)+'.');return true;}}
    engine.split=oldSplit;return false;
  }
  function requestReplica(lane){const type=mixedTraffic?laneModels[lane]:laneOf(engine.route)===lane?engine.route:laneModels[lane];if(runtime!=='kubernetes'){selectWorkload(type);notify('Choose a GPU for the new '+catalog[type].name+' copy.');return;}if(!scheduleReplica(type)){pendingReplicas.push({type});notify('Replica requested. It is Pending until suitable GPU resources are available.');}presetName='';render();}
  function recordCompletion(r){
    r.doneAt=clock;r.traced=!!engine.service('langfuse');
    const p=engine.placements.find(p=>p.id===r.pid),row={id:r.id,task:laneOf(r.type),model:catalog[r.type].name,type:r.type,location:locationOf(p),wait:r.wait,compute:r.computeTime,total:clock-r.born,at:clock};
    finished.push(row);finished=finished.filter(x=>clock-x.at<15);
    if(engine.service('langfuse')){traceRows.unshift(row);traceRows=traceRows.slice(0,80);effects.push({start:clock,duration:1.5,key:'observe-'+r.pid});}
  }
  function layerPaths(){
    if($('platformLayers').hidden)return;
    for(const [k,l] of Object.entries(lanes)){
      const a=port($('input-'+k)),b=port($('queue-'+k),'top');paths['entry-'+k]=elbow(a,b,a.y+12,l.color);
    }
    for(const p of engine.placements.filter(p=>catalog[p.type].kind==='model')){
      const k=laneOf(p.type),logical=$('logical-'+p.id),q=port($('queue-'+k)),target=port(logical,'top');
      paths['model-'+p.id]=elbow(q,target,q.y+12,lanes[k].color);
      const a=port(logical),b=port(elementFor(p),'top');paths['binding-'+p.id]=elbow(a,b,a.y+20,'#91a9b8','dash');
      if(engine.service('langfuse')){const t=port($('langfusePanel'),'top');paths['observe-'+p.id]=elbow(port(logical,'right'),t,t.y-12,colors.trace);}
      if(runtime==='kubernetes'){const scheduler=port($('controllerPanel'));paths['schedule-'+p.id]=elbow(scheduler,target,scheduler.y+8,colors.deployment,'dash');}
    }
  }
  document.addEventListener('input',e=>{if(e.target.dataset.demand){demand[e.target.dataset.demand]=+e.target.value;credits={text:0,vision:0,embedding:0,rerank:0};updateLayerMetrics();}});
  document.addEventListener('change',e=>{if(e.target.dataset.laneModel){laneModels[e.target.dataset.laneModel]=e.target.value;credits={text:0,vision:0,embedding:0,rerank:0};render();log('New '+lanes[e.target.dataset.laneModel].name+' requests target '+catalog[e.target.value].name+'. Existing requests retain their model.');}});
  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-replica]');if(add){requestReplica(add.dataset.replica);return;}
    const cancel=e.target.closest('[data-cancel-pending]');if(cancel){pendingReplicas.splice(+cancel.dataset.cancelPending,1);render();return;}
    const follow=e.target.closest('[data-follow-request]');if(follow){const r=requests.find(r=>r.id===+follow.dataset.followRequest);if(r){focusId=r.id;focusStage='';showFollow(r);}return;}
    const trace=e.target.closest('[data-open-trace]');if(trace){const t=traceRows.find(t=>t.id===+trace.dataset.openTrace);if(t){focusId=null;inspector('Langfuse trace #'+t.id+' · '+t.model,'Request ran on '+t.location+'. It waited '+t.wait.toFixed(2)+'s in the application queue, spent '+t.compute.toFixed(2)+'s doing model work, and took '+t.total.toFixed(2)+'s overall. The remaining time is simulated transport. Long queue time suggests too much demand for the matching copies; model time can grow when workloads share a GPU.','OBSERVABILITY');}return;}
    const mix=e.target.closest('[data-mix]');if(mix){mixedTraffic=true;demand=mix.dataset.mix==='chat'?{text:85,vision:5,embedding:5,rerank:5}:mix.dataset.mix==='vision'?{text:5,vision:85,embedding:5,rerank:5}:{text:25,vision:25,embedding:25,rerank:25};credits={text:0,vision:0,embedding:0,rerank:0};if(mix.dataset.mix!=='balanced'){$('traffic').value=16;$('trafficOut').value='16 / sec';}render();}
  });

  let lastRecovery=0,trackedRecord=null,trackStepMode=true,trackerPaused=false;
  const contextSteps=[1,2,4,8,16,32,64,128];
  const trackerStages=['entry','queue','travel','compute','return','done'];
  function recoverWorkloads(){
    if(runtime!=='kubernetes'||!heal)return [];
    const before=new Map(engine.placements.map(p=>[p.id,locationOf(p)])),moved=engine.recover();
    if(moved.length){
      for(const r of requests){if(moved.includes(r.pid)){r.stage='queue';r.pid=null;r.progress=0;r.retries=(r.retries||0)+1;}}
      deployUntil=clock+5;lastRecovery=clock;
      for(const id of moved){const p=engine.placements.find(p=>p.id===id);log('Recovered '+catalog[p.type].name+': '+before.get(id)+' → '+locationOf(p)+'.');}
    }
    return moved;
  }
  function recoveryPending(){return runtime==='kubernetes'&&heal?engine.placements.filter(p=>p.target!=='cloud'&&engine.status(p)==='offline'):[];}
  function renderRecovery(){
    const pending=recoveryPending();$('recoveryBanner').hidden=runtime!=='kubernetes';
    $('recoveryBanner').textContent=!heal?'Automatic failover is off.':pending.length?pending.length+' workload(s) Pending recovery. Free suitable memory or power on another machine; the scheduler will retry.':'Automatic failover is on. Workloads are recreated on working machines when they fit.';
    $('recoveryBanner').classList.toggle('waiting',pending.length>0);
    $('recoveryPending').innerHTML=pending.map(p=>'<span>'+catalog[p.type].name+' · '+(p.target==='cpu'?'needs a CPU slot and '+engine.memory(p.type).toFixed(1)+' GB RAM':p.gpus.length>1?'needs '+p.gpus.filter(g=>engine.failed.has(engine.host(g))).length+' spare dedicated GPU(s), '+(engine.memory(p.type)/p.gpus.length).toFixed(1)+' GB per worker':'needs '+engine.memory(p.type).toFixed(1)+' GB on a working GPU')+'</span>').join('');
  }
  function renderKV(){
    $('kvEnabled').checked=engine.kv.enabled;$('kvContext').value=contextSteps.indexOf(engine.kv.contextK);$('kvContextOut').value=engine.kv.contextK+'k tokens';$('kvSlots').value=engine.kv.slots;$('kvBits').value=engine.kv.bits;$('kvRate').value=engine.kv.gbPerK;
    const per=engine.kv.contextK*engine.kv.gbPerK*engine.kv.bits/16;
    $('kvFormula').textContent=engine.kv.enabled?engine.kv.contextK+'k tokens × '+engine.kv.gbPerK+' GB/k × '+engine.kv.slots+' slots × '+engine.kv.bits+'/16 = '+(per*engine.kv.slots).toFixed(2)+' GB KV reservation per language-model copy.':'KV memory is excluded from this experiment. Real language-model servers still need working memory.';
    const all=engine.placements.filter(p=>p.target==='gpu').reduce((n,p)=>n+engine.kvBudget(p.type),0);
    $('kvTotal').textContent=all.toFixed(2)+' GB KV reserved across local GPUs';
  }
  function updateKVLive(){
    for(let g=0;g<8;g++){
      const el=$('kv-live-'+g);if(!el)continue;let used=0;
      for(const p of engine.gpuJobs(g)){if(engine.status(p)!=='ready'||catalog[p.type].task!=='text'||!engine.kv.enabled)continue;
        const active=requests.filter(r=>r.pid===p.id&&['travel','compute'].includes(r.stage));
        used+=active.reduce((n,r)=>n+engine.kvBudget(p.type)/engine.kv.slots/p.gpus.length*(r.stage==='compute'?.7+.3*Math.min(1,r.progress/r.duration):.7),0);
      }
      el.textContent='KV in use ~'+used.toFixed(2)+' / '+engine.gpuKV(g).toFixed(2)+' GB reserved';
    }
  }
  function changeKV(){
    engine.kv={enabled:$('kvEnabled').checked,contextK:contextSteps[+$('kvContext').value],slots:+$('kvSlots').value,bits:+$('kvBits').value,gbPerK:Math.min(2,Math.max(.01,Number($('kvRate').value)||.125))};
    for(const r of requests){if(catalog[r.type].task==='text'&&['travel','compute'].includes(r.stage)){r.stage='queue';r.pid=null;r.progress=0;r.retries=(r.retries||0)+1;}}
    presetName='';render();notify('KV budget updated. In-progress language requests restart from the queue. Copies that exceed memory must be resized or removed.');
  }
  function trackerTarget(r){const k=laneOf(r.type),p=engine.placements.find(p=>p.id===r.pid);return r.stage==='entry'||r.stage==='return'?$('input-'+k):r.stage==='queue'?$('queue-'+k):r.stage==='travel'?$('logical-'+r.pid):r.stage==='compute'?(p?.target==='gpu'?$('gpu-'+p.gpus[0]):elementFor(p)):engine.service('langfuse')?$('langfusePanel'):$('input-'+k);}
  function updateTracker(r){
    if(!r)return;trackedRecord=r;$('requestTracker').hidden=false;
    const p=engine.placements.find(p=>p.id===r.pid),c=catalog[r.type],place=p?locationOf(p):(r.lastLocation||'waiting for placement'),k=laneOf(r.type);
    if(p)r.lastLocation=place;
    const texts={
      entry:['User interface','The '+lanes[k].app.toLowerCase()+' creates a request for '+c.name+'. '+tasks[k].input+' is sent to the application.'],
      queue:['Application & routing','The CPU application holds this request in its queue. It needs a ready '+c.name+' copy with a free request slot and enough memory. Other model types cannot serve it automatically.'],
      travel:[runtime==='kubernetes'?'Service → Pod → container':runtime==='docker'?'Application → container':'Application → process',runtime==='kubernetes'?'The app selects a ready replica behind the model service. Its Pod contains the model-server container. Kubernetes placed that workload on '+place+'.':'The app sends this request to the model process running on '+place+'.'],
      compute:['Hardware & KV cache',place+' performs the model calculations. '+(c.task==='text'&&engine.kv.enabled?'The model reuses attention keys and values in its KV cache. This copy reserves '+engine.kvBudget(r.type).toFixed(2)+' GB for '+engine.kv.slots+' conversation slot(s); live usage grows as tokens are processed.':'This workload does not use the language-model KV budget in this lab.')+(p?.gpus.length>1?' Purple messages show model workers cooperating.':'')],
      return:['Result → user interface',tasks[k].output+' travels back through the app to the user. The request’s temporary KV data can be released; this simulation retains the configured cache reservation for the next conversation.'],
      done:['Langfuse & completion',r.traced?'The application sent a trace to Langfuse: '+r.wait.toFixed(2)+'s queued, '+r.computeTime.toFixed(2)+'s model work, '+((r.doneAt||clock)-r.born).toFixed(2)+'s total. Langfuse records this journey; it does not route or execute the model.':'The result was delivered. Langfuse was unavailable or disabled, so no trace was saved for this request.']
    },item=texts[r.stage];
    $('trackerTitle').textContent='Request #'+r.id+' · '+c.name;$('trackerLayer').textContent=item[0];$('trackerNarration').textContent=item[1];
    $('trackerTiming').textContent='Wait '+r.wait.toFixed(1)+'s · model work '+r.computeTime.toFixed(1)+'s · '+(r.retries||0)+' retries';
    $('trackerSteps').innerHTML=trackerStages.map((s,i)=>'<span class="'+(s===r.stage?'current':r.visited?.[s]?'visited':'')+'">'+(i+1)+' '+['Interface','App queue','Container / Pod','GPU / KV','Response','Trace'][i]+'</span>').join('');
    $('trackerNext').disabled=r.stage==='done';$('trackerNext').textContent=r.stage==='done'?'Request complete':paused?'Next layer →':'Running to next layer…';$('trackStepMode').checked=trackStepMode;
    document.querySelectorAll('.tracking-focus').forEach(el=>el.classList.remove('tracking-focus'));trackerTarget(r)?.classList.add('tracking-focus');
  }
  $('trackerNext').onclick=()=>{if(trackedRecord?.stage!=='done'&&paused){trackerPaused=false;togglePause();}};
  $('trackerShow').onclick=()=>trackerTarget(trackedRecord)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  $('trackStepMode').onchange=e=>{trackStepMode=e.target.checked;if(!trackStepMode&&trackerPaused&&paused){trackerPaused=false;togglePause();}};
  $('trackerClose').onclick=()=>{focusId=null;trackedRecord=null;$('requestTracker').hidden=true;document.querySelectorAll('.tracking-focus').forEach(el=>el.classList.remove('tracking-focus'));if(trackerPaused&&paused)togglePause();trackerPaused=false;};
  ['kvEnabled','kvContext','kvSlots','kvBits','kvRate'].forEach(id=>$(id).addEventListener('change',changeKV));
  $('kvContext').addEventListener('input',e=>$('kvContextOut').value=contextSteps[+e.target.value]+'k tokens');

  const descriptions={
    clients:['People send inputs','A mint dot represents one whole request. Pale dots are results coming back. These are data messages shown in slow motion, not physical electrons.'],
    gateway:['A stable front door','The entrance sends a request to a running App / inference API on a CPU. That app picks a ready copy of the model you selected. Kubernetes Services give workloads a stable network address.'],
    network:['Follow the colored dots','Input colors identify the workload type. Pale results travel back. Purple dots show pieces of one distributed model exchanging results. Pink dots are trace records or notebook data. Separate model copies do not need to exchange their model calculations.'],
    storage:['Memory forgets. Storage keeps.','GPU memory holds the model while it is working. Persistent storage keeps model files, notebooks, and trace data after a Pod stops. A real platform may use several different databases and storage systems; this shared box is a simplified view.'],
    git:['Git stores the plan','Git records the version of your desired setup, like a saved blueprint. GitOps adds a loop that compares the running setup with the blueprint and brings it back into line.'],
    argo:['Argo CD follows the blueprint','Argo CD reads the versioned plan from Git and applies Kubernetes resources. It can show differences and reconcile them. It does not do the AI model’s math.'],
    k8s:['Kubernetes arranges the work','Kubernetes schedules Pods onto machines and maintains workloads. Each Pod stays on one machine. If a model spans several machines, it needs cooperating worker Pods and distributed model software. Kubernetes alone does not split model weights.']
  };
  const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function notify(text,error=false){$('toast').textContent=text;$('toast').className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').className='',5200);}
  function log(text){const li=document.createElement('li');const stamp=document.createElement('time');stamp.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});li.append(stamp,document.createTextNode(text));$('eventLog').prepend(li);while($('eventLog').children.length>4)$('eventLog').lastChild.remove();}
  function inspector(title,text,label='WHAT YOU ARE SEEING',actions=''){$('inspectorTitle').textContent=title;$('inspectorText').textContent=text;$('inspectorLabel').textContent=label;$('inspectorActions').innerHTML=actions;if(!focusId)$('traceSteps').hidden=true;}
  function resetTraffic(){trackedRecord=null;trackerPaused=false;$('requestTracker').hidden=true;finished=[];traceRows=[];pendingReplicas=[];trafficEpoch=clock;credits={text:0,vision:0,embedding:0,rerank:0};droppedByLane={text:0,vision:0,embedding:0,rerank:0};requests=[];effects=[];completed=0;traceCount=0;dropped=0;latencies=[];arrival=0;focusId=null;focusStage='';$('traceSteps').hidden=true;}
  function removeControl(p){const c=catalog[p.type],label='Remove '+c.name+(p.gpus.length>1?' (entire '+p.gpus.length+'-GPU copy)':' copy');return '<button type="button" class="remove-model" data-remove="'+p.id+'" draggable="false" title="'+label+'" aria-label="'+label+'">×</button>';}
  function tag(p){const c=catalog[p.type],status=engine.status(p);const button='<button class="pod-tag '+runtime+' '+(status!=='ready'?'bad':'')+'" style="--tone:'+c.color+'" draggable="true" data-pid="'+p.id+'" aria-label="Inspect or drag '+c.name+'"><span class="tag-art">'+art(modelArt(c))+'</span><span>'+c.name+(status!=='ready'?' · !':'')+'<small>'+(p.target==='cloud'?'Hosted service':modes[runtime].unit)+'</small></span></button>';return c.kind==='model'?'<div class="hardware-model-item compact">'+button+removeControl(p)+'</div>':button;}
  function render(){
    $('shelf').innerHTML=Object.entries(catalog).filter(([key,c])=>c.kind==='model'||(key==='notebook'?engine.placements.some(p=>p.type==='hub'):engine.placements.some(p=>p.type===key))).filter(([,c])=>catalogFilter==='all'||(catalogFilter==='search'?['embedding','rerank'].includes(c.task):c.task===catalogFilter)).map(([key,c])=>`<button class="workload-card ${selection?.type===key&&!selection.moveId?'selected':''}" style="--tone:${c.color}" data-workload="${key}" draggable="true" aria-pressed="${selection?.type===key&&!selection.moveId?'true':'false'}"><span class="badge">${art(modelArt(c))}</span><span><b>${c.name}</b><small>${c.kind==='model'?taskFor(c).label+' · '+c.format+'<br>~'+c.memory+' GB base + '+engine.kvBudget(key).toFixed(2)+' GB KV':c.kind==='notebook'?'6 GB · CPU or GPU':'CPU software'}</small></span><span class="drag-dots" aria-hidden="true">⠿</span></button>`).join('');
    const per=8/engine.machineCount;
    $('rack').className='rack'+(engine.machineCount===1?' one':'');
    $('rack').innerHTML=Array.from({length:engine.machineCount},(_,h)=>{
      const cpu=engine.placements.filter(p=>p.target==='cpu'&&p.host===h),ram=cpu.reduce((s,p)=>s+engine.memory(p.type),0);
      return `<section class="host ${engine.failed.has(h)?'offline':''}" id="host-${h}"><div class="host-heading"><i class="machine-light"></i><b>Machine ${h+1}</b><small>CPU + ${per} GPUs</small><button class="power" data-power="${h}" aria-label="${engine.failed.has(h)?'Power on':'Power off'} machine ${h+1}" aria-pressed="${!engine.failed.has(h)}">⏻</button></div><div class="server-art">${art('server')}</div><div class="cpu-area drop-target" id="cpu-${h}" data-target="cpu" data-index="${h}" role="button" tabindex="0" aria-label="Place software on machine ${h+1} CPU"><span class="cpu-art">${art('cpu')}</span><div class="cpu-content"><div class="area-label"><span>CPU + RAM</span><small>${ram} / 128 GB RAM</small></div><div class="cpu-slots">${cpu.length?cpu.map(tag).join(''):'<span class="empty-note">Ordinary programs run here</span>'}</div></div></div><div class="gpu-grid">${Array.from({length:per},(_,g)=>{
        const n=h*per+g,jobs=engine.gpuJobs(n),used=engine.gpuUsed(n),bad=jobs.some(p=>engine.status(p)!=='ready');
        const chips=jobs.map(p=>{const c=catalog[p.type];return '<div class="hardware-model-item"><button class="gpu-workload '+runtime+' '+(selectedId===p.id?'selected':'')+'" style="--tone:'+c.color+'" data-pid="'+p.id+'" draggable="true" aria-label="Inspect or drag '+c.name+'"><span class="tag-art">'+art(modelArt(c))+'</span><span><b>'+c.name+'</b><small>'+modes[runtime].unit+' · '+(p.gpus.length>1?'piece '+(p.gpus.indexOf(n)+1)+'/'+p.gpus.length:'whole copy')+' · ~'+(engine.memory(p.type)/p.gpus.length).toFixed(1)+' GB</small></span></button>'+removeControl(p)+'</div>';}).join('');
        const segments=jobs.map(p=>'<i style="width:'+(catalog[p.type].memory/p.gpus.length/engine.vram*100)+'%;background:'+catalog[p.type].color+'" title="'+catalog[p.type].name+' base reservation"></i><i class="kv-segment" style="width:'+(engine.kvBudget(p.type)/p.gpus.length/engine.vram*100)+'%" title="KV cache reservation"></i>').join('');
        return '<section id="gpu-'+n+'" class="gpu drop-target '+runtime+' '+(jobs.length?'occupied':'')+' '+(bad?'bad':'')+'" style="--tone:'+(jobs[0]?catalog[jobs[0].type].color:'#68dfc6')+'" data-target="gpu" data-index="'+n+'" role="group" tabindex="0" aria-label="GPU '+(n+1)+', '+jobs.length+' workloads, '+used.toFixed(1)+' of 96 GB estimated"><span class="gpu-head"><span>GPU '+String(n+1).padStart(2,'0')+'</span><span>96 GB</span></span><span class="gpu-art">'+art('gpu')+'</span><span class="software-unit">RTX PRO 6000 · '+(jobs.some(p=>p.gpus.length>1)?'dedicated model worker':engine.sharing?'sharing enabled':'dedicated access')+'</span><div class="gpu-workloads">'+(chips||'<span class="gpu-empty">Drop a model here</span>')+'</div><span class="gpu-detail">'+used.toFixed(1)+' / 96 GB estimated · '+Math.max(0,96-used).toFixed(1)+' GB free</span><span class="vram-track segmented">'+segments+'</span><span class="kv-live" id="kv-live-'+n+'"></span><span class="gpu-add">'+(engine.sharing&&!jobs.some(p=>p.gpus.length>1)?'+ Drop another model if it fits':jobs.length?'Move models using their labels':'Choose a model to place')+'</span></section>';
      }).join('')}</div></section>`;
    }).join('');
    $('cloudSlots').innerHTML=engine.placements.filter(p=>p.target==='cloud').map(tag).join('');
    document.body.dataset.runtime=runtime;
    $('clusterTitle').textContent=modes[runtime].title;
    $('runtime').value=runtime;$('runtimeHelp').textContent=modes[runtime].description;
    $('runtimeTitle').textContent=modes[runtime].name;$('runtimeDescription').textContent=modes[runtime].description;
    $('runtimeLayer').querySelector('.runtime-art').innerHTML=art(modes[runtime].art);
    $('clients').querySelector('.endpoint-symbol').innerHTML=art('people');$('gateway').querySelector('.endpoint-symbol').innerHTML=art('network');$('cloud').querySelector('.endpoint-symbol').innerHTML=art('cloud');$('storage').querySelector('.storage-art').innerHTML=art('storage');
    const hasAPI=engine.placements.some(p=>p.type==='api');
    document.querySelector('.task-story').hidden=!hasAPI;$('clients').hidden=!hasAPI;$('gateway').hidden=!hasAPI;$('cloud').hidden=!cloudOn;
    document.querySelector('.endpoints').hidden=!hasAPI&&!cloudOn;
    document.querySelector('.network-band').hidden=!hasAPI&&!cloudOn;
    $('basicGuide').hidden=engine.placements.length>0;
    $('storage').hidden=!storageOn;document.querySelector('.management').hidden=!gitops;
    ['api','hub','langfuse'].forEach(t=>$('feature-'+t).checked=engine.placements.some(p=>p.type===t));
    $('feature-storage').checked=storageOn;$('feature-cloud').checked=cloudOn;$('feature-gitops').checked=gitops;$('feature-heal').checked=heal;
    $('feature-gitops').disabled=runtime!=='kubernetes';$('feature-heal').disabled=runtime!=='kubernetes';$('kubeHint').hidden=runtime==='kubernetes';
    $('traffic').disabled=!hasAPI;$('send').disabled=!hasAPI;
    $('rackSummary').textContent=`${engine.machineCount} ${engine.machineCount===1?'machine':'machines'} · 8 GPUs · ${engine.vram*8} GB GPU memory`;
    $('cancelSelection').hidden=!selection;document.body.classList.toggle('placing',!!selection);
    $('selectionHint').textContent=selection?`${selection.moveId?'Move':'Place'} ${catalog[selection.type].name}: click or drop on a destination.`:'Drag software into the hardware. Click a running copy to inspect it.';
    document.querySelectorAll('[data-architecture]').forEach(b=>{const active=+b.dataset.architecture===engine.machineCount;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===presetName));
    $('sharing').checked=engine.sharing;$('mixedTraffic').checked=mixedTraffic;
    $('sharingHelp').textContent=engine.sharing?(runtime==='kubernetes'?'Assumes NVIDIA time-slicing has been configured for shared Pods. The lab checks memory budgets; real time-slicing provides no memory isolation.':'Multiple programs can use the same card. They share its 96 GB and compute time. The lab checks estimated memory before placement.'):'A workload reserves a whole GPU. Kubernetes commonly schedules GPUs this way through its device plugin.';
    const gpuTotals=Array.from({length:8},(_,g)=>({g,used:engine.gpuUsed(g),offline:engine.failed.has(engine.host(g))}));
    const available=gpuTotals.filter(g=>!g.offline),free=available.reduce((sum,g)=>sum+Math.max(0,96-g.used),0),largest=Math.max(0,...available.map(g=>96-g.used));
    $('poolSummary').textContent=free.toFixed(0)+' GB free across working cards · largest free space on one card: '+largest.toFixed(0)+' GB';
    $('poolCards').innerHTML=gpuTotals.map(g=>'<span class="pool-card '+(g.offline?'offline':'')+'"><b>GPU '+(g.g+1)+'</b><i><em style="height:'+Math.min(100,g.used/96*100)+'%"></em></i><small>'+ (g.offline?'offline':Math.max(0,96-g.used).toFixed(0)+' GB free')+'</small></span>').join('');
    $('route').value=engine.route;updateTask();$('slow').checked=engine.slow;$('internet').checked=engine.internet;
    $('split').value=splitValues.indexOf(engine.split);$('splitOut').value=engine.split;
    renderLayers();
    requestAnimationFrame(measure);
    updateMetrics();
  }
  function selectWorkload(type,moveId=null){selection={type,moveId};focusId=null;selectedId=moveId;render();const c=catalog[type];inspector((moveId?'Move ':'Place ')+c.name,c.description+modelDetails(c)+' '+(c.kind==='service'?'Choose a machine’s CPU area.':c.kind==='model'?'Choose a GPU with enough free memory, a CPU area, or the online model provider.':'Choose a CPU area or a GPU with enough free memory.'),'READY TO PLACE',sourceLink(c));}
  function placeSelected(target,index,payload=selection){
    if(!payload)return;
    const previous=payload.moveId&&engine.placements.find(p=>p.id===payload.moveId),split=engine.split;
    if(previous?.target==='gpu'&&target==='gpu')engine.split=previous.gpus.length;
    const result=engine.place(payload.type,target,index,payload.moveId);engine.split=split;
    if(!result.ok){notify(result.message,true);log(result.message);return;}
    if(catalog[result.placement.type].kind==='model'){engine.route=result.placement.type;}selection=null;selectedId=result.placement.id;presetName='';render();notify(result.message);log(result.message);inspectPlacement(result.placement.id);deployUntil=clock+3;
  }
  function inspectPlacement(id){
    const p=engine.placements.find(p=>p.id===id);if(!p)return;
    focusId=null;selectedId=id;const c=catalog[p.type],status=engine.status(p);let text=c.description+modelDetails(c)+' Base reservation: '+c.memory+' GB. Additional KV reservation: '+engine.kvBudget(p.type).toFixed(2)+' GB per copy. ';
    if(p.target==='gpu')text+=p.gpus.length>1?`This is ONE copy spread across ${p.gpus.length} GPUs. Each holds about ${(engine.memory(p.type)/p.gpus.length).toFixed(1)} GB. `:'This is one complete copy on one GPU. ';
    if(engine.hosts(p).length>1)text+='Its cooperating '+(runtime==='kubernetes'?'worker Pods':runtime==='docker'?'containers':'programs')+' run on different machines and exchange data over the network. Slower links make this copy slower. ';
    else if(p.target==='gpu'&&p.gpus.length>1)text+='All pieces share one machine and communicate locally. ';
    if(p.target==='gpu'&&p.gpus.length===1&&engine.gpuJobs(p.gpus[0]).length>1)text+='This card hosts '+engine.gpuJobs(p.gpus[0]).length+' workloads using about '+engine.gpuUsed(p.gpus[0]).toFixed(1)+' of 96 GB. Active workloads share compute time. Free memory stays on this physical card. ';
    if(p.target==='cpu'&&c.kind==='model')text+='It uses CPU memory and runs slowly in this toy model. ';
    if(p.target==='cloud')text+='It runs on the provider’s hardware. It uses none of your eight GPUs. ';
    if(c.kind==='model')text+=`Ready copies of ${c.name}: ${engine.placements.filter(x=>x.type===p.type&&engine.status(x)==='ready').length}. Independent copies can handle separate requests. `;
    if(status!=='ready')text+=status==='memory'?'This copy cannot run: its memory budget exceeds available memory.':'This copy is offline because a required machine or connection is off.';
    inspector(c.name+' · '+(p.target==='cloud'?'online':p.target==='cpu'?'CPU workload':p.gpus.length+' GPU'+(p.gpus.length>1?'s':'')),text,'SELECTED WORKLOAD',`<button class="inspect-button" data-move="${id}">Move this copy ↗</button><button class="inspect-button danger" data-remove="${id}">Remove copy</button>`+sourceLink(c));
    document.querySelectorAll('[data-pid]').forEach(b=>b.classList.toggle('selected',b.dataset.pid===id));
  }
  function preset(name){
    engine.kv={enabled:true,contextK:4,slots:1,gbPerK:.125,bits:16};
    catalogFilter='all';$('catalogFilter').value='all';
    mixedTraffic=['shared','mixed','platform'].includes(name);
    demand={text:25,vision:25,embedding:25,rerank:25};laneModels={text:'small',vision:'yolo',embedding:'embedding',rerank:'reranker'};
    if(name==='basic'){
      engine.placements=[];engine.sharing=true;engine.failed.clear();engine.machineCount=1;engine.vram=96;engine.split=1;engine.route='small';engine.slow=false;engine.internet=true;
      runtime='bare';storageOn=false;cloudOn=false;gitops=false;heal=false;selection=null;selectedId=null;presetName='basic';resetTraffic();$('traffic').value=0;$('trafficOut').value='0 / sec';
      render();inspector('Start with the physical machine.','You have one computer containing a CPU, memory, and eight GPUs. No software is using them yet. Turn on the App / API feature, then drag Qwen3-8B onto a GPU. Add Docker or Kubernetes later to see the software layers appear.','HARDWARE FIRST');log('Hardware ready. Add only the layers you want.');return;
    }
    runtime='kubernetes';storageOn=true;cloudOn=name==='cloud';gitops=true;heal=true;
    engine.preset(name);presetName=name;selection=null;selectedId=null;resetTraffic();$('traffic').value=name==='platform'?8:name==='mixed'?8:name==='shared'?12:name==='copies'?3:1;$('trafficOut').value=$('traffic').value+' / sec';
    const texts={platform:['A busy platform, from users to GPUs.','Four applications send different kinds of work at once. Change the demand sliders or try Chat rush. Waiting request cards collect in the overloaded lane. Request another replica to have Kubernetes place a copy on spare hardware. Langfuse records queue time and model time for completed requests.'],shared:['Five models on ONE card.','Qwen3-8B, gpt-oss-20b, YOLO, embeddings, and a reranker share GPU 1. Their base budgets total 46 GB, plus a separate KV reservation for the language models. Mixed traffic is enabled: busy models take turns on the same chip. Drag a model label onto GPU 2 to give it separate compute.'],mixed:['Different models, different jobs.','Eight GPUs hold eight independent workloads: Qwen, two gpt-oss sizes, Gemma, a DeepSeek distillation, YOLO, embeddings, and a reranker. Choose a model in the selector above the diagram to send it traffic. Sharing is enabled: drag a model label onto another GPU to combine workloads if their estimated budgets fit.'],copies:['Two copies, two workers.','Qwen3-8B is loaded onto two GPUs. Each copy can answer a different request. The API spreads requests between them. A Jupyter notebook uses another GPU for its own work.'],giant:['Eight pieces of ONE model.','Full DeepSeek-R1 uses a 720 GB FP8 teaching budget: about 90 GB of base reservation per GPU, plus KV cache, across eight 96 GB GPUs. The purple dots show the pieces exchanging results. Real fit also depends on serving software and workload size.'],distributed:['One model across four machines.','The same eight pieces are now spread across four machines. Purple messages cross machine boundaries. Turn on slow links and watch the queue grow because the pieces have to wait for one another.'],cloud:['The model lives somewhere else.','Your CPU runs the chatbot app. It sends a request to an online provider, where gpt-oss-120b runs. Your local GPUs remain free for notebook work. Turn off the online model connection to see the dependency.']};
    inspector(...texts[name]);render();log('Loaded: '+texts[name][0]);
  }
  function togglePause(){paused=!paused;document.body.classList.toggle('paused',paused);$('liveLabel').textContent=paused?'Simulation paused':'Simulation running · ¼ speed';$('play').textContent=paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');}
  document.addEventListener('click',e=>{
    const w=e.target.closest('[data-workload]');if(w){selectWorkload(w.dataset.workload);return;}
    const move=e.target.closest('[data-move]');if(move){const p=engine.placements.find(p=>p.id===move.dataset.move);if(p)selectWorkload(p.type,p.id);return;}
    const remove=e.target.closest('[data-remove]');if(remove){const p=engine.placements.find(p=>p.id===remove.dataset.remove);if(p){engine.remove(p.id);for(const r of requests){if(r.pid===p.id){r.stage='queue';r.pid=null;r.progress=0;}}selection=null;selectedId=null;focusId=null;presetName='';render();const message=catalog[p.type].name+' copy removed'+(p.gpus.length>1?' from all '+p.gpus.length+' GPUs':'')+'.';log(message);notify(message);inspector('Workload removed.','Its memory is available again. Requests for that model wait or go to another ready copy. Other models on the same card keep running.');}return;}
    const power=e.target.closest('[data-power]');if(power){const h=+power.dataset.power;if(engine.failed.has(h))engine.failed.delete(h);else engine.failed.add(h);presetName='';log('Machine '+(h+1)+(engine.failed.has(h)?' powered off. Its jobs are unavailable.':' powered on. Its jobs can resume.'));if(runtime==='kubernetes'&&heal){recoverWorkloads();if(recoveryPending().length)log('Some workloads are Pending recovery until suitable resources become available.');}render();return;}
    const arch=e.target.closest('[data-architecture]');if(arch){engine.architecture(+arch.dataset.architecture);presetName='';render();log('Rearranged 8 GPUs across '+engine.machineCount+' machine(s).');inspector('Same GPUs. Different connections.','GPU numbers stay the same. The new machine boundaries change which model pieces talk locally and which communicate over the network. This instant rearrangement is a teaching shortcut; real hardware must be provisioned.');return;}
    const pre=e.target.closest('[data-preset]');if(pre){preset(pre.dataset.preset);return;}
    const target=e.target.closest('.drop-target');if(target&&selection){placeSelected(target.dataset.target,+target.dataset.index);return;}
    const p=e.target.closest('[data-pid]');if(p){inspectPlacement(p.dataset.pid);return;}
    if(target){const type=target.dataset.target;if(type==='gpu'){const g=+target.dataset.index;inspector('GPU '+(g+1)+' · '+engine.gpuJobs(g).length+' workloads','This physical card holds 96 GB. About '+engine.gpuUsed(g).toFixed(1)+' GB is reserved in the lab. Enable sharing to place multiple small models here; they share compute as well as memory. A model too large for this card needs an explicit multi-GPU split. Click a model label to move or remove that specific copy.','HARDWARE');}else if(type==='cpu')inspector('CPU · general-purpose compute','This machine has a CPU for ordinary programs and 128 GB of working memory in this demo. Put App / inference API, JupyterHub, or Langfuse here. Models can also use a CPU, but this simulation makes them slower.','HARDWARE');else inspector('An online model endpoint','Drop a model here to use a provider’s hardware. The app still needs your CPU. The model uses no local GPUs, but it needs a network connection.','EXTERNAL SERVICE');return;}
    const inspect=e.target.closest('[data-inspect]');if(inspect){focusId=null;inspector(...descriptions[inspect.dataset.inspect]);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selection){selection=null;render();}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role="button"],.gpu.drop-target')){e.preventDefault();e.target.click();}});
  document.addEventListener('dragstart',e=>{
    const card=e.target.closest('[data-workload]'),placed=e.target.closest('[data-pid]');let data=null;
    if(card)data={type:card.dataset.workload,moveId:null};else if(placed){const p=engine.placements.find(p=>p.id===placed.dataset.pid);if(p)data={type:p.type,moveId:p.id};}
    if(!data)return;dragPayload=data;e.dataTransfer.effectAllowed=data.moveId?'move':'copy';e.dataTransfer.setData('application/json',JSON.stringify(data));document.body.classList.add('placing');$('selectionHint').textContent='Drop '+catalog[data.type].name+' onto a CPU area, GPU with enough memory, or online provider.';
  });
  document.addEventListener('dragover',e=>{const t=e.target.closest('.drop-target');if(t&&dragPayload){e.preventDefault();e.dataTransfer.dropEffect=dragPayload.moveId?'move':'copy';document.querySelectorAll('.drag-over').forEach(x=>{if(x!==t)x.classList.remove('drag-over');});t.classList.add('drag-over');}});
  document.addEventListener('dragleave',e=>{const t=e.target.closest('.drop-target');if(t&&!t.contains(e.relatedTarget))t.classList.remove('drag-over');});
  document.addEventListener('drop',e=>{const t=e.target.closest('.drop-target');if(t&&dragPayload){e.preventDefault();placeSelected(t.dataset.target,+t.dataset.index,dragPayload);}document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));dragPayload=null;document.body.classList.toggle('placing',!!selection);});
  document.addEventListener('dragend',()=>{dragPayload=null;document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));document.body.classList.toggle('placing',!!selection);});
  $('cancelSelection').onclick=()=>{selection=null;render();};
  function featureService(type,on){
    if(on&&!engine.placements.some(p=>p.type===type)){
      let result;for(let h=0;h<engine.machineCount;h++){if(engine.failed.has(h))continue;result=engine.place(type,'cpu',h);if(result.ok)break;}
      if(!result?.ok){notify(result?.message||'Power on a machine first.',true);render();return;}
      if(type==='langfuse'||type==='hub')storageOn=true;
      if(type==='api'&&+$('traffic').value===0){$('traffic').value=1;$('trafficOut').value='1 / sec';}
      log(catalog[type].name+' added as a '+modes[runtime].unit.toLowerCase()+'.'+(type==='langfuse'?' Persistent storage added for traces.':''));
      inspector(catalog[type].name+' is now running.',catalog[type].description+(type==='api'?' Next, drag a model onto a GPU so the app has something to ask.':type==='hub'?' You can now drag a notebook onto a CPU or GPU.':' Pink trace records will appear after the app completes requests.'),'FEATURE ADDED');
    }else if(!on){engine.placements=engine.placements.filter(p=>p.type!==type&&!(type==='hub'&&p.type==='notebook'));if(type==='api'){$('traffic').value=0;$('trafficOut').value='0 / sec';resetTraffic();}log(catalog[type].name+' feature removed.');}
    selection=null;presetName='';render();
  }
  ['api','hub','langfuse'].forEach(t=>$('feature-'+t).onchange=e=>featureService(t,e.target.checked));
  $('firstApp').onclick=()=>{featureService('api',true);selectWorkload('small');notify('The chatbot app is ready. Click or drop Qwen3-8B on a GPU.');};
  $('runtime').onchange=e=>{runtime=e.target.value;if(runtime!=='kubernetes'){gitops=false;heal=false;pendingReplicas=[];}else{heal=true;recoverWorkloads();}presetName='';render();inspector(modes[runtime].name,modes[runtime].description+' '+(runtime==='kubernetes'?'Automatic failover is enabled. GitOps remains an optional extra.':'Moving between machines still needs your own setup.'),'SOFTWARE LAYER');log('Execution layer: '+modes[runtime].name+'.');};
  $('feature-storage').onchange=e=>{if(!e.target.checked&&engine.placements.some(p=>p.type==='langfuse')){notify('Langfuse needs its trace storage in this lab. Turn off Langfuse first.',true);render();return;}storageOn=e.target.checked;render();log(storageOn?'Persistent storage connected.':'Persistent storage removed; notebook files are now temporary.');};
  $('feature-cloud').onchange=e=>{cloudOn=e.target.checked;if(!cloudOn)engine.placements=engine.placements.filter(p=>p.target!=='cloud');render();log(cloudOn?'Online model endpoint added. Drop a model into the cloud.':'Online model endpoint and its models removed.');};
  $('feature-gitops').onchange=e=>{gitops=runtime==='kubernetes'&&e.target.checked;render();if(gitops){deployUntil=clock+5;inspector('GitOps adds a saved, repeatable plan.','Git stores the desired setup. Argo CD reads it and sends changes to Kubernetes. Blue pulses are deployment instructions; mint and orange dots are live user traffic.','FEATURE ADDED');}};
  $('feature-heal').onchange=e=>{heal=runtime==='kubernetes'&&e.target.checked;if(heal)recoverWorkloads();render();inspector('Recovery needs spare room.','Kubernetes controllers recreate managed workloads on working machines. This lab also assumes a distributed-job controller coordinates multi-GPU workers. Pending jobs retry when resources become free. Node failure detection and model loading are accelerated here; real recovery takes time.','OPTIONAL KUBERNETES FEATURE');};
  $('sharing').onchange=e=>{const result=engine.setSharing(e.target.checked);if(!result.ok){notify(result.message,true);render();return;}presetName='';render();log(engine.sharing?'GPU sharing enabled. Memory remains local to each card.':'Dedicated GPU access enabled.');};
  $('mixedTraffic').onchange=e=>{mixedTraffic=e.target.checked;render();log(mixedTraffic?'Traffic follows the four workload-mix sliders, including types with no model deployed. Follow one request uses the selected model.':'New traffic uses the selected model.');};
  $('split').oninput=e=>{engine.split=splitValues[+e.target.value];$('splitOut').value=engine.split;};
  $('traffic').oninput=e=>{$('trafficOut').value=e.target.value+' / sec';updateLayerMetrics();};
  $('route').onchange=e=>{engine.route=e.target.value;render();log('New requests now use '+catalog[engine.route].name+'. Existing requests keep their original model.');};
  $('slow').onchange=e=>{engine.slow=e.target.checked;log(engine.slow?'Inter-machine links slowed. Distributed models pay the communication cost.':'Fast inter-machine links restored.');};
  $('internet').onchange=e=>{engine.internet=e.target.checked;render();log(engine.internet?'Online model connection restored.':'Online model connection disconnected. Local jobs can continue.');};
  $('resetLab').onclick=()=>{clock=0;last=0;lastUI=0;requestId=0;engine.uid=0;deployUntil=0;lastSchedule=0;lastRecovery=0;dragPayload=null;$('eventLog').replaceChildren();$('taskDetail').open=false;preset('basic');document.querySelectorAll('.tracking-focus').forEach(el=>el.classList.remove('tracking-focus'));if(paused&&!matchMedia('(prefers-reduced-motion: reduce)').matches)togglePause();notify('Reset complete: eight empty 96 GB GPUs. Models, queues, traces, and optional layers cleared.');};
  $('play').onclick=togglePause;
  $('helpButton').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
  $('help').addEventListener('click',e=>{if(e.target===$('help')){const r=$('help').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('help').close();}});
  $('deploy').onclick=()=>{deployUntil=clock+5;if(paused)togglePause();focusId=null;inspector('The plan travels; then software runs.','Blue dashed messages show Git → Argo CD → Kubernetes → machines. These are setup instructions, separate from live user requests. In this sandbox a drop changes the simulated plan immediately.');log('Replaying a deployment: Git → Argo CD → Kubernetes.');};
  $('send').onclick=()=>{if(!engine.service('api')){notify('Enable a working App / API first.',true);return;}if(paused)togglePause();const r=newRequest(true);if(!r){notify('This model’s request buffer is full. Let it drain or add capacity.',true);return;}focusId=r.id;focusStage='';showFollow(r);log('Following request #'+r.id+'. Watch the larger highlighted dot.');};
  function elementFor(p){if(!p)return null;return p.target==='gpu'?document.querySelector('#gpu-'+p.gpus[0]+' [data-pid="'+p.id+'"]'):document.querySelector((p.target==='cloud'?'#cloudSlots':'#cpu-'+p.host)+' [data-pid="'+p.id+'"]');}
  function rect(el){if(!el||!el.getClientRects().length)return null;const r=el.getBoundingClientRect(),b=board.getBoundingClientRect();return {x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height};}
  function port(el,side='bottom'){const r=rect(el);if(!r)return null;return side==='top'?{x:r.x+r.w/2,y:r.y}:side==='bottom'?{x:r.x+r.w/2,y:r.y+r.h}:side==='left'?{x:r.x,y:r.y+r.h/2}:{x:r.x+r.w,y:r.y+r.h/2};}
  function path(points,color=colors.request,style='solid'){if(points.some(x=>!x))return null;const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));return {points,lengths,length:lengths.reduce((a,b)=>a+b,0),color,style};}
  function elbow(a,b,y,color,style){return a&&b?path([a,{x:a.x,y},{x:b.x,y},b],color,style):null;}
  function measure(){
    width=board.clientWidth;height=board.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);paths={};rects={};
    paths.entry=path([port($('clients'),'right'),port($('gateway'),'left')]);
    const api=engine.service('api'),apiEl=elementFor(api),gate=port($('gateway')),bus=(gate?.y||20)+30;
    if(apiEl){paths.api=elbow(gate,port(apiEl,'top'),bus);rects.api=rect(apiEl);}
    for(const p of engine.placements){
      const el=elementFor(p);rects[p.id]=rect(el);
      if(catalog[p.type].kind==='model'&&apiEl){
        const a=port(apiEl,p.target==='cloud'?'top':'bottom'),b=port(el,'top');
        paths['model-'+p.id]=elbow(a,b,p.target==='cloud'?bus+15:Math.min(a.y+13,b.y-8));
      }
      if(p.target==='gpu'&&p.gpus.length>1){
        for(let j=1;j<p.gpus.length;j++){const a=port($('gpu-'+p.gpus[0])),b=port($('gpu-'+p.gpus[j]));paths['shard-'+p.id+'-'+j]=elbow(a,b,Math.max(a.y,b.y)+5,colors.exchange);}
      }
      if(p.type==='notebook'&&storageOn){const a=port($('storage'),'top'),b=port(el);paths['data-'+p.id]=elbow(a,b,a.y-7,colors.trace);}
    }
    const lf=engine.service('langfuse'),lfEl=elementFor(lf);if(apiEl&&lfEl){paths.trace=elbow(port(apiEl,'top'),port(lfEl,'top'),bus+23,colors.trace);if(storageOn)paths.save=elbow(port(lfEl),port($('storage'),'top'),port($('storage'),'top').y-8,colors.trace);}
    if(gitops){paths.git=path([port($('git'),'right'),port($('argo'),'left')],colors.deployment,'dash');paths.argo=path([port($('argo'),'right'),port($('k8s'),'left')],colors.deployment,'dash');const k=port($('k8s'),'top');paths.deploy=elbow(k,port($('cpu-0'),'left'),k.y-12,colors.deployment,'dash');}
    layerPaths();
  }
  function sample(p,t){if(!p||!p.length)return null;let d=Math.min(1,Math.max(0,t))*p.length;for(let i=0;i<p.lengths.length;i++){const l=p.lengths[i];if(d<=l||i===p.lengths.length-1){const a=p.points[i],b=p.points[i+1],u=l?d/l:0;return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};}d-=l;}return p.points[0];}
  function join(...ps){const points=ps.filter(Boolean).flatMap(p=>p.points);return points.length>1?path(points):null;}
  function reverse(p){return p?path([...p.points].reverse(),p.color):null;}
  function newRequest(focused=false){const type=focused?engine.route:chooseType();if(!type)return null;const task=laneOf(type);if(requests.length>=400||requests.filter(r=>r.type===type).length>=80){dropped++;droppedByLane[task]++;return null;}const r={id:++requestId,born:clock,stage:'entry',progress:0,duration:.8,pid:null,type,focused,wait:0,computeTime:0};requests.push(r);return r;}
  function showFollow(r){
    if(r.id!==focusId)return;const changed=focusStage!==r.stage;
    if(changed){focusStage=r.stage;r.visited=r.visited||{};r.visited[r.stage]=true;if(trackStepMode&&!paused){trackerPaused=true;togglePause();}}
    updateTracker(r);
  }
  function tick(dt){
    clock+=dt;arrival+=dt*+$('traffic').value;
    while(arrival>=1){arrival--;newRequest();}
    if(runtime==='kubernetes'&&pendingReplicas.length&&clock-lastSchedule>2){lastSchedule=clock;const remaining=[];let changed=false;for(const pending of pendingReplicas){if(scheduleReplica(pending.type))changed=true;else remaining.push(pending);}pendingReplicas=remaining;if(changed)render();}
    if(runtime==='kubernetes'&&heal&&clock-lastRecovery>1){lastRecovery=clock;if(recoverWorkloads().length)render();}
    const api=engine.service('api');
    const activeCounts=new Map();requests.filter(r=>r.stage==='compute').forEach(r=>activeCounts.set(r.pid,(activeCounts.get(r.pid)||0)+1));
    const activeIds=new Set(requests.filter(r=>r.stage==='compute').map(r=>r.pid));
    for(const r of requests){
      if(r.stage==='queue'){r.wait+=dt;continue;}
      if(r.stage!=='entry'&&!api){r.stage='queue';r.pid=null;r.progress=0;continue;}
      if(['travel','compute','return'].includes(r.stage)){const p=engine.placements.find(x=>x.id===r.pid);if(!p||engine.status(p)!=='ready'){r.stage='queue';r.pid=null;r.progress=0;continue;}}
      if(r.stage==='compute')r.computeTime+=dt;
      r.progress+=r.stage==='compute'?dt*engine.capacity(engine.placements.find(p=>p.id===r.pid),activeIds)/Math.max(1,activeCounts.get(r.pid)||1):dt;
      if(r.progress>=r.duration){
        r.progress=0;
        if(r.stage==='entry')r.stage='queue';
        else if(r.stage==='travel'){r.stage='compute';r.duration=1;}
        else if(r.stage==='compute'){r.stage='return';r.duration=.85;}
        else if(r.stage==='return'){r.stage='done';completed++;recordCompletion(r);latencies.push(clock-r.born);if(latencies.length>30)latencies.shift();if(engine.service('langfuse')){traceCount++;effects.push({start:clock,duration:1.4,key:'trace'});effects.push({start:clock+1.4,duration:1.2,key:'save'});}}
      }
    }
    const guide=requests.find(r=>r.id===focusId);if(guide&&guide.stage!==focusStage){showFollow(guide);if(paused){requests=requests.filter(r=>r.stage!=='done');return;}}
    const busy=new Map();requests.filter(r=>r.stage==='travel'||r.stage==='compute').forEach(r=>busy.set(r.pid,(busy.get(r.pid)||0)+1));
    if(api){for(const r of requests.filter(r=>r.stage==='queue')){
      const available=engine.placements.filter(p=>p.type===r.type&&engine.status(p)==='ready'&&(busy.get(p.id)||0)<engine.maxActive(p.type));
      const p=available.sort((a,b)=>engine.capacity(b)-engine.capacity(a))[0];
      if(p){r.pid=p.id;r.stage='travel';r.progress=0;r.duration=p.target==='cloud'?.65:.35;busy.set(p.id,(busy.get(p.id)||0)+1);}
    }}
    finished=finished.filter(r=>clock-r.at<15);
    const focus=requests.find(r=>r.id===focusId);if(focus)showFollow(focus);
    requests=requests.filter(r=>r.stage!=='done');effects=effects.filter(e=>clock<e.start+e.duration);
  }
  function wire(p){if(!p)return;ctx.beginPath();p.points.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.strokeStyle=p.color;ctx.globalAlpha=p.style==='dash'?.3:.2;ctx.lineWidth=1.15;ctx.setLineDash(p.style==='dash'?[3,5]:[]);ctx.lineJoin='round';ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
  function dot(p,t,color,focused=false){const q=sample(p,t);if(!q)return;ctx.shadowColor=color;ctx.shadowBlur=focused?15:7;ctx.fillStyle=color;ctx.beginPath();ctx.arc(q.x,q.y,focused?5:2.8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(focused){ctx.strokeStyle='#f6fcff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.stroke();}}
  function draw(){
    ctx.clearRect(0,0,width,height);
    for(const [key,p] of Object.entries(paths)){if((['git','argo','deploy'].includes(key)||key.startsWith('schedule-'))&&clock>deployUntil)continue;if(key==='entry'||key==='api')continue;if(key.startsWith('binding-')&&!requests.some(r=>r.pid===key.slice(8)&&r.stage==='compute')&&selectedId!==key.slice(8))continue;if(key.startsWith('observe-')&&!effects.some(e=>e.key===key))continue;wire(p);}
    const entry=join(paths.entry,paths.api),busy=new Set();
    for(const r of requests){
      const focused=r.id===focusId,task=laneOf(r.type),requestColor=lanes[task].color,inputPath=paths['entry-'+task]||entry;
      if(r.stage==='entry')dot(inputPath,r.progress/r.duration,requestColor,focused);
      else if(r.stage==='travel')dot(paths['model-'+r.pid],r.progress/r.duration,requestColor,focused);
      else if(r.stage==='return')dot(join(reverse(paths['model-'+r.pid]),reverse(inputPath)),r.progress/r.duration,'#f3f0df',focused);
      else if(r.stage==='compute'){
        dot(paths['binding-'+r.pid],(clock*.7+r.id*.13)%1,requestColor,focused);
        busy.add(r.pid);const p=engine.placements.find(p=>p.id===r.pid);
        if(p){const cells=p.target==='gpu'?p.gpus.map(g=>document.querySelector('#gpu-'+g+' [data-pid="'+p.id+'"]')):[elementFor(p)];for(const el of cells){const a=rect(el);if(!a)continue;ctx.strokeStyle=catalog[p.type].color;ctx.globalAlpha=.65;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(a.x+3,a.y+a.h-2);ctx.lineTo(a.x+3+(a.w-6)*Math.min(1,r.progress/r.duration),a.y+a.h-2);ctx.stroke();ctx.globalAlpha=1;}}
      }
    }
    for(const p of engine.placements){
      if(engine.status(p)!=='ready')continue;
      if(p.type==='notebook'){dot(paths['data-'+p.id],(clock*.34)%1,colors.trace);}
      if(p.target==='gpu'&&p.gpus.length>1&&busy.has(p.id)){
        for(let j=1;j<p.gpus.length;j++){const route=paths['shard-'+p.id+'-'+j],cross=engine.host(p.gpus[0])!==engine.host(p.gpus[j]),speed=cross&&engine.slow?.15:.7;dot(route,(clock*speed+j*.13)%1,colors.exchange);dot(reverse(route),(clock*speed+j*.13+.5)%1,colors.exchange);}
      }
    }
    for(const e of effects)if(clock>=e.start)dot(paths[e.key],(clock-e.start)/e.duration,colors.trace);
    if(clock<deployUntil){for(const p of engine.placements)dot(paths['schedule-'+p.id],(clock*.5)%1,colors.deployment);dot(paths.git,(clock*.6)%1,colors.deployment);dot(paths.argo,(clock*.6+.3)%1,colors.deployment);dot(paths.deploy,(clock*.4)%1,colors.deployment);}
  }
  function updateMetrics(){
    const reserved=new Set(engine.placements.flatMap(p=>p.gpus)).size,queued=requests.filter(r=>r.stage==='queue').length;
    $('usedMetric').innerHTML=reserved+' <small>/ 8</small>';$('doneMetric').innerHTML=completed+' <small>results</small>';$('queueMetric').innerHTML=queued+' <small>requests</small>';$('queueBadge').textContent=queued+' waiting';
    const latency=latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null;$('latencyMetric').innerHTML=(latency===null?'—':latency.toFixed(1))+' <small>sec</small>';$('traceCount').textContent=traceCount+' traces saved';
    const busy=new Set(requests.filter(r=>r.stage==='compute').map(r=>r.pid));for(const p of engine.placements)if(p.type==='notebook'&&engine.status(p)==='ready')busy.add(p.id);document.querySelectorAll('.gpu').forEach(g=>g.classList.toggle('busy',engine.gpuJobs(+g.dataset.index).some(p=>busy.has(p.id))));document.querySelectorAll('.gpu-workload').forEach(c=>c.classList.toggle('busy',busy.has(c.dataset.pid)));
    let note='',warning=false;
    if(!engine.placements.length){note='Just hardware for now. Add the App / API feature, then place a model on a GPU.';}
    else if(!engine.service('api')){note='No running App / inference API. Turn on the App / API feature or restore its machine to handle requests.';warning=true;}
    else if(!mixedTraffic&&!engine.models().length){note='No ready '+catalog[engine.route].name+' copy. Place one, fix its memory, or restore its machine / connection.';warning=true;}
    else if(dropped){note='A model request buffer filled (80 per model; 400 overall). '+dropped+' new requests were dropped. Lower traffic or add copies.';warning=true;}
    else if(queued>8){const counts={};requests.filter(r=>r.stage==='queue').forEach(r=>counts[r.type]=(counts[r.type]||0)+1);const largest=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];note='The largest waiting line needs '+catalog[largest].name+'. Add a matching copy or reduce that type’s demand.';warning=true;}
    else if(engine.slow&&engine.models().some(p=>engine.hosts(p).length>1)){note='The model’s pieces wait for slow inter-machine messages. More machines can mean more communication.';warning=true;}
    else if(mixedTraffic){note='Four independent demand streams are active. Compare each queue with its ready copies; idle GPUs cannot handle a different model until it is deployed there.';}
    else note=engine.models().length+' ready '+catalog[engine.route].name+' '+(engine.models().length===1?'copy':'copies')+'. '+(engine.service('langfuse')?'Langfuse is recording traces.':'Place Langfuse on a CPU to record traces.');
    updateLayerMetrics();updateKVLive();if(trackedRecord)updateTracker(trackedRecord);
    $('statusNote').textContent=note;$('statusNote').classList.toggle('warning',warning);
  }
  function frame(t){const dt=last?Math.min((t-last)/1000,.1):0;last=t;if(!paused)tick(dt*playbackRate);draw();if(t-lastUI>350){updateMetrics();lastUI=t;}requestAnimationFrame(frame);}
  const resizeObserver=new ResizeObserver(()=>measure());resizeObserver.observe(board);
  window.addEventListener('resize',measure);
  document.addEventListener('visibilitychange',()=>{last=0;});
  preset(new URLSearchParams(location.search).get('setup')==='basic'?'basic':'platform');if(paused){paused=false;togglePause();}requestAnimationFrame(frame);
  // Expose read-only summaries for local smoke checks and for a curious learner in DevTools.
  window.flowLab={snapshot:()=>({runtime,storageOn,cloudOn,gitops,heal,machineCount:engine.machineCount,vram:engine.vram,route:engine.route,sharing:engine.sharing,mixedTraffic,kv:{...engine.kv},recoveryPending:recoveryPending().map(p=>p.id),demand:{...demand},laneModels:{...laneModels},pendingReplicas:[...pendingReplicas],queues:Object.fromEntries(Object.keys(lanes).map(k=>[k,requests.filter(r=>r.stage==='queue'&&laneOf(r.type)===k).length])),recentTraces:traceRows.slice(0,6),gpuMemory:Array.from({length:8},(_,i)=>engine.gpuUsed(i)),placements:engine.placements.map(p=>({...p,status:engine.status(p)})),completed,queued:requests.filter(r=>r.stage==='queue').length,traceCount,paused}),version:'6.0'};
})();
