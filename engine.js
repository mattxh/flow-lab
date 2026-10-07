(function(root){
  'use strict';
  const catalog={
  "small": {
    "name": "Qwen3-8B",
    "short": "Q8",
    "memory": 20,
    "color": "#68dfc6",
    "speed": 5.5,
    "format": "BF16",
    "task": "text",
    "source": "https://huggingface.co/Qwen/Qwen3-8B",
    "description": "A compact language model for conversation and text tasks. BF16 uses about two bytes per model weight. This lab reserves 20 GB for weights plus working space.",
    "kind": "model"
  },
  "qwen32": {
    "name": "Qwen3-32B",
    "short": "Q32",
    "memory": 76,
    "color": "#85d5a0",
    "speed": 2.6,
    "format": "BF16",
    "task": "text",
    "source": "https://huggingface.co/Qwen/Qwen3-32B",
    "description": "A larger Qwen language model. This lab reserves 76 GB for its BF16 weights and working space. A larger model usually needs more memory, but quality and speed depend on the task.",
    "kind": "model"
  },
  "oss20": {
    "name": "gpt-oss-20b",
    "short": "OSS20",
    "memory": 20,
    "color": "#87d8e6",
    "speed": 4.5,
    "format": "MXFP4",
    "task": "text",
    "source": "https://developers.openai.com/cookbook/articles/gpt-oss/run-transformers",
    "description": "An open-weight reasoning model. Its expert weights use compact MXFP4 numbers. OpenAI describes approximately 16 GB of GPU memory for this format; the lab reserves 20 GB as an illustrative working budget.",
    "kind": "model"
  },
  "medium": {
    "name": "gpt-oss-120b",
    "short": "OSS120",
    "memory": 80,
    "color": "#ad9aff",
    "speed": 2.4,
    "format": "MXFP4",
    "task": "text",
    "source": "https://developers.openai.com/cookbook/articles/gpt-oss/run-transformers",
    "description": "A larger open-weight reasoning model with compact MXFP4 expert weights. OpenAI documents at least 60 GB of VRAM for Transformers. This lab uses an illustrative 80 GB reservation, so one 96 GB GPU can hold a copy in the simulation.",
    "kind": "model"
  },
  "gemma": {
    "name": "Gemma 3 27B IT",
    "short": "G27",
    "memory": 64,
    "color": "#a8bafa",
    "speed": 2.8,
    "format": "BF16",
    "task": "text",
    "source": "https://huggingface.co/google/gemma-3-27b-it",
    "description": "An instruction-tuned model that supports text and image inputs. This lab demonstrates its text route and reserves 64 GB for BF16 weights and working space.",
    "kind": "model"
  },
  "deepseek32": {
    "name": "DeepSeek-R1 Distill Qwen 32B",
    "short": "R1-32",
    "memory": 76,
    "color": "#c2a8f4",
    "speed": 2.5,
    "format": "BF16",
    "task": "text",
    "source": "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    "description": "A Qwen-based student model trained using examples from DeepSeek-R1. It is a separate, much smaller model than full R1. This lab reserves 76 GB for its BF16 weights and working space.",
    "kind": "model"
  },
  "large": {
    "name": "DeepSeek-R1 · full",
    "short": "R1",
    "memory": 720,
    "color": "#edb97b",
    "speed": 2,
    "format": "FP8 scenario",
    "task": "text",
    "source": "https://huggingface.co/deepseek-ai/DeepSeek-R1",
    "description": "The full mixture-of-experts model, not the 32B distillation. This illustrative FP8 scenario reserves 720 GB, or 90 GB per GPU across eight GPUs. Actual fit depends on runtime overhead, context length, cache, and sharding support. Fewer active experts per token does not mean only their weights need to be stored.",
    "kind": "model"
  },
  "yolo": {
    "name": "YOLO11s",
    "short": "YOLO",
    "memory": 2,
    "color": "#f4b58b",
    "speed": 8,
    "format": "FP16",
    "task": "vision",
    "shardable": false,
    "source": "https://docs.ultralytics.com/models/yolo11/",
    "description": "An object detector with 9.4 million parameters. It takes an image and returns object labels, boxes, and confidence scores. This lab reserves 2 GB including image buffers and runtime space; that is not the weight-file size.",
    "kind": "model"
  },
  "embedding": {
    "name": "BGE-M3 · embedding",
    "short": "EMB",
    "memory": 2,
    "color": "#91d1f3",
    "speed": 7,
    "format": "FP16",
    "task": "embedding",
    "shardable": false,
    "source": "https://huggingface.co/BAAI/bge-m3",
    "description": "Turns text into numbers that describe its meaning. Its dense embedding contains 1,024 numbers, which a vector database can compare to find similar text. It does not write an answer. This lab reserves 2 GB for a small illustrative workload.",
    "kind": "model"
  },
  "reranker": {
    "name": "BGE reranker v2 M3",
    "short": "RANK",
    "memory": 2,
    "color": "#efabd5",
    "speed": 6,
    "format": "FP16",
    "task": "rerank",
    "shardable": false,
    "source": "https://huggingface.co/BAAI/bge-reranker-v2-m3",
    "description": "Reads a query alongside candidate passages and scores their relevance. The app sorts the candidates by those scores. It improves a shortlist found by search; it does not generate an embedding or a chat answer. The lab reserves 2 GB.",
    "kind": "model"
  },
  "notebook": {
    "name": "GPU notebook",
    "short": "NB",
    "kind": "notebook",
    "memory": 6,
    "color": "#82b9fa",
    "description": "Your own Jupyter workspace. Its code can run on a CPU, or use a GPU for heavy math."
  },
  "api": {
    "name": "App / inference API",
    "short": "API",
    "kind": "service",
    "memory": 2,
    "color": "#93bded",
    "description": "Receives input, asks the selected model to process it, and sends the result back. The app runs on a CPU."
  },
  "hub": {
    "name": "JupyterHub",
    "short": "HUB",
    "kind": "service",
    "memory": 2,
    "color": "#82b9fa",
    "description": "The front desk for notebooks: signs people in and starts their own notebook servers."
  },
  "langfuse": {
    "name": "Langfuse",
    "short": "LF",
    "kind": "service",
    "memory": 4,
    "color": "#eaa3d7",
    "description": "Records AI application traces: calls, timing, inputs, and outputs when the app sends that information. It does not run the model."
  }
};
  class Engine {
    constructor(){this.uid=0;this.kv={enabled:true,contextK:4,slots:1,gbPerK:.125,bits:16};this.sharing=true;this.machineCount=2;this.vram=96;this.split=1;this.route='small';this.slow=false;this.internet=true;this.failed=new Set();this.placements=[];}
    host(gpu){return Math.floor(gpu/(8/this.machineCount));}
    hosts(p){return p.target==='gpu'?[...new Set(p.gpus.map(g=>this.host(g)))]:p.target==='cpu'?[p.host]:[];}
    kvBudget(type){return this.kv.enabled&&catalog[type].task==='text'?this.kv.contextK*this.kv.slots*this.kv.gbPerK*this.kv.bits/16:0;}
    memory(type){return catalog[type].memory+this.kvBudget(type);}
    maxActive(type){return catalog[type].task==='text'?this.kv.slots:1;}
    gpuKV(index){return this.gpuJobs(index).reduce((sum,p)=>sum+this.kvBudget(p.type)/p.gpus.length,0);}
    gpuJobs(index,placements=this.placements){return placements.filter(p=>p.target==='gpu'&&p.gpus.includes(index));}
    gpuUsed(index,placements=this.placements){return this.gpuJobs(index,placements).reduce((sum,p)=>sum+this.memory(p.type)/p.gpus.length,0);}
    canShare(index,memory,placements=this.placements){const jobs=this.gpuJobs(index,placements);return !jobs.some(p=>p.gpus.length>1)&&(this.sharing||jobs.length===0)&&this.gpuUsed(index,placements)+memory<=this.vram;}
    setSharing(on){if(!on&&Array.from({length:8},(_,i)=>this.gpuJobs(i).length).some(n=>n>1))return {ok:false,message:'Several workloads share a GPU. Move or remove extras before switching to dedicated GPUs.'};this.sharing=on;return {ok:true};}
    status(p){
      if(this.hosts(p).some(h=>this.failed.has(h)))return 'offline';
      if(p.target==='cloud'&&!this.internet)return 'offline';
      if(p.target==='gpu'&&p.gpus.some(g=>this.gpuUsed(g)>this.vram))return 'memory';
      if(p.target==='cpu'&&this.placements.filter(x=>x.target==='cpu'&&x.host===p.host).reduce((n,x)=>n+this.memory(x.type),0)>128)return 'memory';
      return 'ready';
    }
    capacity(p,activeIds=null){
      const c=catalog[p.type];if(c.kind!=='model'||this.status(p)!=='ready')return 0;
      if(p.target==='cloud')return 4;
      if(p.target==='cpu')return c.speed*.08;
      const parts=p.gpus.length,required=Math.max(1,Math.ceil(this.memory(p.type)/this.vram));
      const contenders=Math.max(1,...p.gpus.map(g=>this.gpuJobs(g).filter(x=>this.status(x)==='ready'&&(!activeIds||activeIds.has(x.id)||x.type==='notebook')).length));
      return c.speed/contenders/(c.task==='text'?1+this.kv.contextK/32:1)*Math.sqrt(parts/required)*(this.hosts(p).length>1?(this.slow?.26:.78):1);
    }
    place(type,target,index=0,moveId=null){
      const c=catalog[type];if(!c)return {ok:false,message:'Choose a workload first.'};
      const rest=this.placements.filter(p=>p.id!==moveId),needed=this.memory(type);
      const p={id:moveId||'p'+(++this.uid),type,target,gpus:[],host:0};
      if(target==='gpu'){
        if(c.kind==='service')return {ok:false,message:c.name+' is a CPU service. Drop it on a machine’s CPU area.'};
        const n=c.kind==='notebook'||c.shardable===false?1:this.split;
        if(!Number.isInteger(index)||index<0||index>7)return {ok:false,message:'Choose one of the eight physical GPUs.'};
        if(needed/n>this.vram)return {ok:false,message:c.name+' reserves about '+needed+' GB in this lab. Each GPU holds only '+this.vram+' GB. Increase GPUs per copy to explicitly split the model.'};
        if(n===1){
          const jobs=this.gpuJobs(index,rest),used=this.gpuUsed(index,rest);
          if(!this.sharing&&jobs.length)return {ok:false,message:'Dedicated mode reserves this GPU for one workload. Enable GPU sharing to place another model here.'};
          if(jobs.some(x=>x.gpus.length>1))return {ok:false,message:'This GPU belongs to a distributed model. This lab keeps distributed groups dedicated; choose another GPU.'};
          if(used+needed>this.vram)return {ok:false,message:'GPU '+(index+1)+' has '+(this.vram-used).toFixed(1)+' GB free; '+c.name+' needs about '+needed+' GB. Free memory on other cards cannot automatically fill this gap.'};
          p.gpus=[index];
        }else{
          const used=new Set(rest.filter(x=>x.target==='gpu').flatMap(x=>x.gpus));
          if(used.has(index))return {ok:false,message:'Start a distributed copy on an empty GPU. This lab gives its workers dedicated cards.'};
          const available=Array.from({length:8},(_,i)=>(index+i)%8).filter(i=>!used.has(i)&&!this.failed.has(this.host(i)));
          if(available.length<n)return {ok:false,message:'This distributed copy needs '+n+' empty physical GPUs; '+available.length+' are free. Shared access slots do not create extra GPUs.'};
          p.gpus=available.slice(0,n);
        }
      }else if(target==='cpu'){
        if(!Number.isInteger(index)||index<0||index>=this.machineCount)return {ok:false,message:'That machine is not available.'};
        p.host=index;
        const peers=rest.filter(x=>x.target==='cpu'&&x.host===index);
        if(peers.length>=4)return {ok:false,message:'This teaching machine has four CPU workload slots. Use another machine.'};
        if(peers.reduce((s,x)=>s+this.memory(x.type),0)+needed>128)return {ok:false,message:'The CPU machine has 128 GB RAM. This workload will not fit alongside the others.'};
      }else if(target==='cloud'){
        if(c.kind!=='model')return {ok:false,message:'This endpoint only hosts AI models. Put '+c.name+' on a machine inside the cluster.'};
        if(rest.filter(x=>x.target==='cloud').length>=3)return {ok:false,message:'The demo provider has three model slots. Remove one first.'};
      }else return {ok:false,message:'Choose a CPU area, GPU, or hosted-model endpoint.'};
      this.placements=[...rest,p];
      let message=c.name+' placed '+(target==='gpu'?'on GPU '+p.gpus.map(x=>x+1).join(', '):target==='cpu'?'on machine '+(index+1)+' CPU':'at the online model provider')+'.';
      if(target==='gpu'&&p.gpus.length===1&&this.gpuJobs(index).length>1)message+=' It shares this card’s '+this.vram+' GB memory and compute with other workloads.';
      if(target==='cpu'&&c.kind==='model')message+=' It can run here, but CPU inference is much slower in this simulation.';
      if(this.hosts(p).length>1)message+=' Its workers now communicate across machines.';
      return {ok:true,placement:p,message};
    }
    remove(id){this.placements=this.placements.filter(p=>p.id!==id);}
    recover(){
      const moved=[];
      for(const p of this.placements){
        if(this.status(p)!=='offline'||p.target==='cloud')continue;
        const rest=this.placements.filter(x=>x.id!==p.id);
        if(p.target==='gpu'){
          const healthy=Array.from({length:8},(_,g)=>g).filter(g=>!this.failed.has(this.host(g))).sort((a,b)=>this.gpuJobs(a,rest).length-this.gpuJobs(b,rest).length||this.gpuUsed(a,rest)-this.gpuUsed(b,rest));
          if(p.gpus.length===1){const free=healthy.find(g=>this.canShare(g,this.memory(p.type),rest));if(free!==undefined){p.gpus=[free];moved.push(p.id);}}
          else{
            const broken=p.gpus.filter(g=>this.failed.has(this.host(g))),kept=p.gpus.filter(g=>!this.failed.has(this.host(g)));
            const free=healthy.filter(g=>!kept.includes(g)&&this.gpuJobs(g,rest).length===0);
            if(free.length>=broken.length&&this.memory(p.type)/p.gpus.length<=this.vram){let i=0;p.gpus=p.gpus.map(g=>broken.includes(g)?free[i++]:g);moved.push(p.id);}
          }
        }else if(p.target==='cpu'){
          for(let h=0;h<this.machineCount;h++){const peers=rest.filter(x=>x.target==='cpu'&&x.host===h);if(!this.failed.has(h)&&peers.length<4&&peers.reduce((n,x)=>n+this.memory(x.type),0)+this.memory(p.type)<=128){p.host=h;moved.push(p.id);break;}}
        }
      }
      return moved;
    }
    models(){return this.placements.filter(p=>p.type===this.route&&this.status(p)==='ready');}
    service(type){return this.placements.find(p=>p.type===type&&this.status(p)==='ready');}
    architecture(n){this.machineCount=n;this.failed.clear();for(const p of this.placements)if(p.target==='cpu')p.host%=n;}
    preset(name){
      this.placements=[];this.sharing=true;this.failed.clear();this.internet=true;this.slow=false;this.vram=96;this.machineCount=2;
      const put=(t,d,i,n=1)=>{this.split=n;return this.place(t,d,i);};
      if(name==='giant'||name==='distributed'){
        this.machineCount=name==='giant'?1:4;this.route='large';put('api','cpu',0);put('langfuse','cpu',this.machineCount-1);put('large','gpu',0,8);
      }else if(name==='platform'){
        this.machineCount=2;this.route='small';put('api','cpu',0);put('langfuse','cpu',1);put('hub','cpu',0);['small','small','oss20','yolo','embedding','reranker'].forEach((t,i)=>put(t,'gpu',i));
      }else if(name==='shared'){
        this.machineCount=1;this.route='small';put('api','cpu',0);put('langfuse','cpu',0);['small','oss20','yolo','embedding','reranker'].forEach(t=>put(t,'gpu',0));
      }else if(name==='mixed'){
        this.route='yolo';put('api','cpu',0);put('langfuse','cpu',1);['small','oss20','medium','gemma','deepseek32','yolo','embedding','reranker'].forEach((t,i)=>put(t,'gpu',i));
      }else if(name==='cloud'){
        this.route='medium';put('api','cpu',0);put('hub','cpu',0);put('langfuse','cpu',1);put('medium','cloud',0);put('notebook','gpu',4);
      }else{
        this.route='small';put('api','cpu',0);put('hub','cpu',0);put('langfuse','cpu',1);put('small','gpu',0);put('small','gpu',4);put('notebook','gpu',6);
      }
      this.split=1;
    }
  }
  const api={Engine,catalog};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GPULab=api;
})(typeof window!=='undefined'?window:globalThis);
