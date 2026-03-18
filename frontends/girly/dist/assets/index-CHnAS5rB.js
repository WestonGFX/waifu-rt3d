import{g as dh}from"./index-BAHACfBs.js";function ph(G,be){for(var Oe=0;Oe<be.length;Oe++){const $e=be[Oe];if(typeof $e!="string"&&!Array.isArray($e)){for(const ve in $e)if(ve!=="default"&&!(ve in G)){const _e=Object.getOwnPropertyDescriptor($e,ve);_e&&Object.defineProperty(G,ve,_e.get?_e:{enumerable:!0,get:()=>$e[ve]})}}}return Object.freeze(Object.defineProperty(G,Symbol.toStringTag,{value:"Module"}))}var ns={},fa={},Fp;function nc(){if(Fp)return fa;Fp=1,Object.defineProperty(fa,"__esModule",{value:!0}),fa.baseAssetPath=void 0;const be=typeof window<"u"&&typeof window.document<"u"?window.document.currentScript:null;let Oe="/";return be&&(Oe=be.src.replace(/#.*$/,"").replace(/\?.*$/,"").replace(/\/[^/]+$/,"/")),fa.baseAssetPath=Oe,fa}var ma={},Wp;function ls(){if(Wp)return ma;Wp=1,Object.defineProperty(ma,"__esModule",{value:!0}),ma.defaultModelFetcher=void 0;const G=be=>fetch(be).then(Oe=>Oe.arrayBuffer());return ma.defaultModelFetcher=G,ma}var rr={},ga={},Gp;function va(){if(Gp)return ga;Gp=1,Object.defineProperty(ga,"__esModule",{value:!0}),ga.log=void 0;const G=be=>Oe=>{console.log(`VAD | ${be} >`,Oe)};return ga.log={error:G("error"),debug:G("debug"),warn:G("warn")},ga}var ya={},jp;function Fa(){if(jp)return ya;jp=1,Object.defineProperty(ya,"__esModule",{value:!0}),ya.Message=void 0;var G;return(function(be){be.AudioFrame="AUDIO_FRAME",be.SpeechStart="SPEECH_START",be.VADMisfire="VAD_MISFIRE",be.SpeechEnd="SPEECH_END",be.SpeechStop="SPEECH_STOP",be.SpeechRealStart="SPEECH_REAL_START",be.FrameProcessed="FRAME_PROCESSED"})(G||(ya.Message=G={})),ya}var Hp;function ds(){if(Hp)return rr;Hp=1,Object.defineProperty(rr,"__esModule",{value:!0}),rr.FrameProcessor=rr.validateOptions=rr.defaultFrameProcessorOptions=void 0;const G=va(),be=Fa();rr.defaultFrameProcessorOptions={positiveSpeechThreshold:.3,negativeSpeechThreshold:.25,preSpeechPadMs:800,redemptionMs:1400,minSpeechMs:400,submitUserSpeechOnPause:!1};function Oe(de){(de.positiveSpeechThreshold<0||de.positiveSpeechThreshold>1)&&G.log.error("positiveSpeechThreshold should be a number between 0 and 1"),(de.negativeSpeechThreshold<0||de.negativeSpeechThreshold>de.positiveSpeechThreshold)&&G.log.error("negativeSpeechThreshold should be between 0 and positiveSpeechThreshold"),de.preSpeechPadMs<0&&G.log.error("preSpeechPadMs should be positive"),de.redemptionMs<0&&G.log.error("redemptionMs should be positive"),de.minSpeechMs<0&&G.log.error("minSpeechMs should be positive")}rr.validateOptions=Oe;const $e=de=>{const K=de.reduce((Q,xe)=>(Q.push(Q.at(-1)+xe.length),Q),[0]),C=new Float32Array(K.at(-1));return de.forEach((Q,xe)=>{const Ie=K[xe];C.set(Q,Ie)}),C};function ve(de,K){const C=Math.floor(de.redemptionMs/K),Q=Math.floor(de.preSpeechPadMs/K),xe=Math.floor(de.minSpeechMs/K);return{redemptionFrames:C,preSpeechPadFrames:Q,minSpeechFrames:xe}}class _e{constructor(K,C,Q,xe){this.modelProcessFunc=K,this.modelResetFunc=C,this.options=Q,this.msPerFrame=xe,this.speaking=!1,this.redemptionCounter=0,this.speechFrameCount=0,this.active=!1,this.speechRealStartFired=!1,this.setOptions=Y=>{this.options={...this.options,...Y};const{redemptionFrames:re,preSpeechPadFrames:Re,minSpeechFrames:Ze}=ve(this.options,this.msPerFrame);this.redemptionFrames=re,this.preSpeechPadFrames=Re,this.minSpeechFrames=Ze},this.reset=()=>{this.speaking=!1,this.speechRealStartFired=!1,this.audioBuffer=[],this.modelResetFunc(),this.redemptionCounter=0,this.speechFrameCount=0},this.pause=Y=>{this.active=!1,this.options.submitUserSpeechOnPause?this.endSegment(Y):this.reset()},this.resume=()=>{this.active=!0},this.endSegment=Y=>{const re=this.audioBuffer;this.audioBuffer=[];const Re=this.speaking;if(this.reset(),Re)if(re.reduce((tt,Se)=>Se.isSpeech?tt+1:tt,0)>=this.minSpeechFrames){const tt=$e(re.map(Se=>Se.frame));Y({msg:be.Message.SpeechEnd,audio:tt})}else Y({msg:be.Message.VADMisfire});return{}},this.process=async(Y,re)=>{if(!this.active)return;const Re=await this.modelProcessFunc(Y),Ze=Re.isSpeech>=this.options.positiveSpeechThreshold;if(re({probs:Re,msg:be.Message.FrameProcessed,frame:Y}),this.audioBuffer.push({frame:Y,isSpeech:Ze}),Ze&&(this.speechFrameCount++,this.redemptionCounter=0),Ze&&!this.speaking&&(this.speaking=!0,re({msg:be.Message.SpeechStart})),this.speaking&&this.speechFrameCount===this.minSpeechFrames&&!this.speechRealStartFired&&(this.speechRealStartFired=!0,re({msg:be.Message.SpeechRealStart})),Re.isSpeech<this.options.negativeSpeechThreshold&&this.speaking&&++this.redemptionCounter>=this.redemptionFrames){this.redemptionCounter=0,this.speechFrameCount=0,this.speaking=!1,this.speechRealStartFired=!1;const tt=this.audioBuffer;if(this.audioBuffer=[],tt.reduce((Te,pe)=>pe.isSpeech?Te+1:Te,0)>=this.minSpeechFrames){const Te=$e(tt.map(pe=>pe.frame));re({msg:be.Message.SpeechEnd,audio:Te})}else re({msg:be.Message.VADMisfire})}if(!this.speaking){for(;this.audioBuffer.length>this.preSpeechPadFrames;)this.audioBuffer.shift();this.speechFrameCount=0}},this.audioBuffer=[];const{redemptionFrames:Ie,preSpeechPadFrames:ce,minSpeechFrames:se}=ve(this.options,this.msPerFrame);this.redemptionFrames=Ie,this.preSpeechPadFrames=ce,this.minSpeechFrames=se,this.reset()}}return rr.FrameProcessor=_e,rr}var ir={};function zt(G){throw new Error('Could not dynamically require "'+G+'". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.')}var ss={exports:{}};/*!
 * ONNX Runtime Web v1.24.3
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */var Kp;function ch(){return Kp||(Kp=1,(function(G,be){var Oe=(()=>{var $e=Object.defineProperty,ve=Object.getOwnPropertyDescriptor,_e=Object.getOwnPropertyNames,de=Object.prototype.hasOwnProperty,K=(e=>typeof zt<"u"?zt:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof zt<"u"?zt:t)[r]}):e)(function(e){if(typeof zt<"u")return zt.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')}),C=(e,t)=>()=>(e&&(t=e(e=0)),t),Q=(e,t)=>{for(var r in t)$e(e,r,{get:t[r],enumerable:!0})},xe=(e,t,r,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of _e(t))!de.call(e,a)&&a!==r&&$e(e,a,{get:()=>t[a],enumerable:!(i=ve(t,a))||i.enumerable});return e},Ie=e=>xe($e({},"__esModule",{value:!0}),e),ce,se,Y,re,Re,Ze=C(()=>{ce=new Map,se=[],Y=(e,t,r)=>{if(t&&typeof t.init=="function"&&typeof t.createInferenceSessionHandler=="function"){let i=ce.get(e);if(i===void 0)ce.set(e,{backend:t,priority:r});else{if(i.priority>r)return;if(i.priority===r&&i.backend!==t)throw new Error(`cannot register backend "${e}" using priority ${r}`)}if(r>=0){let a=se.indexOf(e);a!==-1&&se.splice(a,1);for(let n=0;n<se.length;n++)if(ce.get(se[n]).priority<=r){se.splice(n,0,e);return}se.push(e)}return}throw new TypeError("not a valid backend")},re=async e=>{let t=ce.get(e);if(!t)return"backend not found.";if(t.initialized)return t.backend;if(t.aborted)return t.error;{let r=!!t.initPromise;try{return r||(t.initPromise=t.backend.init(e)),await t.initPromise,t.initialized=!0,t.backend}catch(i){return r||(t.error=`${i}`,t.aborted=!0),t.error}finally{delete t.initPromise}}},Re=async e=>{let t=e.executionProviders||[],r=t.map(u=>typeof u=="string"?u:u.name),i=r.length===0?se:r,a,n=[],s=new Set;for(let u of i){let l=await re(u);typeof l=="string"?n.push({name:u,err:l}):(a||(a=l),a===l&&s.add(u))}if(!a)throw new Error(`no available backend found. ERR: ${n.map(u=>`[${u.name}] ${u.err}`).join(", ")}`);for(let{name:u,err:l}of n)r.includes(u)&&console.warn(`removing requested execution provider "${u}" from session options because it is not available: ${l}`);let o=t.filter(u=>s.has(typeof u=="string"?u:u.name));return[a,new Proxy(e,{get:(u,l)=>l==="executionProviders"?o:Reflect.get(u,l)})]}}),tt=C(()=>{Ze()}),Se,Te=C(()=>{Se="1.24.3"}),pe,le,Fe=C(()=>{Te(),pe="warning",le={wasm:{},webgl:{},webgpu:{},versions:{common:Se},set logLevel(e){if(e!==void 0){if(typeof e!="string"||["verbose","info","warning","error","fatal"].indexOf(e)===-1)throw new Error(`Unsupported logging level: ${e}`);pe=e}},get logLevel(){return pe}},Object.defineProperty(le,"logLevel",{enumerable:!0})}),ee,lt=C(()=>{Fe(),ee=le}),Ke,yt,nr=C(()=>{Ke=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);r.width=e.dims[3],r.height=e.dims[2];let i=r.getContext("2d");if(i!=null){let a,n;(t==null?void 0:t.tensorLayout)!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],n=e.dims[3]):(a=e.dims[3],n=e.dims[2]);let s=(t==null?void 0:t.format)!==void 0?t.format:"RGB",o=t==null?void 0:t.norm,u,l;o===void 0||o.mean===void 0?u=[255,255,255,255]:typeof o.mean=="number"?u=[o.mean,o.mean,o.mean,o.mean]:(u=[o.mean[0],o.mean[1],o.mean[2],0],o.mean[3]!==void 0&&(u[3]=o.mean[3])),o===void 0||o.bias===void 0?l=[0,0,0,0]:typeof o.bias=="number"?l=[o.bias,o.bias,o.bias,o.bias]:(l=[o.bias[0],o.bias[1],o.bias[2],0],o.bias[3]!==void 0&&(l[3]=o.bias[3]));let d=n*a,p=0,h=d,f=d*2,g=-1;s==="RGBA"?(p=0,h=d,f=d*2,g=d*3):s==="RGB"?(p=0,h=d,f=d*2):s==="RBG"&&(p=0,f=d,h=d*2);for(let y=0;y<n;y++)for(let $=0;$<a;$++){let _=(e.data[p++]-l[0])*u[0],w=(e.data[h++]-l[1])*u[1],S=(e.data[f++]-l[2])*u[2],x=g===-1?255:(e.data[g++]-l[3])*u[3];i.fillStyle="rgba("+_+","+w+","+S+","+x+")",i.fillRect($,y,1,1)}if("toDataURL"in r)return r.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},yt=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),i;if(r!=null){let a,n,s;(t==null?void 0:t.tensorLayout)!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],n=e.dims[1],s=e.dims[3]):(a=e.dims[3],n=e.dims[2],s=e.dims[1]);let o=t!==void 0&&t.format!==void 0?t.format:"RGB",u=t==null?void 0:t.norm,l,d;u===void 0||u.mean===void 0?l=[255,255,255,255]:typeof u.mean=="number"?l=[u.mean,u.mean,u.mean,u.mean]:(l=[u.mean[0],u.mean[1],u.mean[2],255],u.mean[3]!==void 0&&(l[3]=u.mean[3])),u===void 0||u.bias===void 0?d=[0,0,0,0]:typeof u.bias=="number"?d=[u.bias,u.bias,u.bias,u.bias]:(d=[u.bias[0],u.bias[1],u.bias[2],0],u.bias[3]!==void 0&&(d[3]=u.bias[3]));let p=n*a;if(t!==void 0&&(t.format!==void 0&&s===4&&t.format!=="RGBA"||s===3&&t.format!=="RGB"&&t.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let h=4,f=0,g=1,y=2,$=3,_=0,w=p,S=p*2,x=-1;o==="RGBA"?(_=0,w=p,S=p*2,x=p*3):o==="RGB"?(_=0,w=p,S=p*2):o==="RBG"&&(_=0,S=p,w=p*2),i=r.createImageData(a,n);for(let k=0;k<n*a;f+=h,g+=h,y+=h,$+=h,k++)i.data[f]=(e.data[_++]-d[0])*l[0],i.data[g]=(e.data[w++]-d[1])*l[1],i.data[y]=(e.data[S++]-d[2])*l[2],i.data[$]=x===-1?255:(e.data[x++]-d[3])*l[3]}else throw new Error("Can not access image data");return i}}),dt,_t,mr,gr,De,It,gi=C(()=>{wr(),dt=(e,t)=>{if(e===void 0)throw new Error("Image buffer must be defined");if(t.height===void 0||t.width===void 0)throw new Error("Image height and width must be defined");if(t.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:r,width:i}=t,a=t.norm??{mean:255,bias:0},n,s;typeof a.mean=="number"?n=[a.mean,a.mean,a.mean,a.mean]:n=[a.mean[0],a.mean[1],a.mean[2],a.mean[3]??255],typeof a.bias=="number"?s=[a.bias,a.bias,a.bias,a.bias]:s=[a.bias[0],a.bias[1],a.bias[2],a.bias[3]??0];let o=t.format!==void 0?t.format:"RGBA",u=t.tensorFormat!==void 0&&t.tensorFormat!==void 0?t.tensorFormat:"RGB",l=r*i,d=u==="RGBA"?new Float32Array(l*4):new Float32Array(l*3),p=4,h=0,f=1,g=2,y=3,$=0,_=l,w=l*2,S=-1;o==="RGB"&&(p=3,h=0,f=1,g=2,y=-1),u==="RGBA"?S=l*3:u==="RBG"?($=0,w=l,_=l*2):u==="BGR"&&(w=0,_=l,$=l*2);for(let x=0;x<l;x++,h+=p,g+=p,f+=p,y+=p)d[$++]=(e[h]+s[0])/n[0],d[_++]=(e[f]+s[1])/n[1],d[w++]=(e[g]+s[2])/n[2],S!==-1&&y!==-1&&(d[S++]=(e[y]+s[3])/n[3]);return u==="RGBA"?new Pe("float32",d,[1,4,r,i]):new Pe("float32",d,[1,3,r,i])},_t=async(e,t)=>{let r=typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement,i=typeof ImageData<"u"&&e instanceof ImageData,a=typeof ImageBitmap<"u"&&e instanceof ImageBitmap,n=typeof e=="string",s,o=t??{},u=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},l=d=>typeof HTMLCanvasElement<"u"&&d instanceof HTMLCanvasElement||d instanceof OffscreenCanvas?d.getContext("2d"):null;if(r){let d=u();d.width=e.width,d.height=e.height;let p=l(d);if(p!=null){let h=e.height,f=e.width;if(t!==void 0&&t.resizedHeight!==void 0&&t.resizedWidth!==void 0&&(h=t.resizedHeight,f=t.resizedWidth),t!==void 0){if(o=t,t.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");o.tensorFormat="RGBA",o.height=h,o.width=f}else o.tensorFormat="RGBA",o.height=h,o.width=f;p.drawImage(e,0,0),s=p.getImageData(0,0,f,h).data}else throw new Error("Can not access image data")}else if(i){let d,p;if(t!==void 0&&t.resizedWidth!==void 0&&t.resizedHeight!==void 0?(d=t.resizedHeight,p=t.resizedWidth):(d=e.height,p=e.width),t!==void 0&&(o=t),o.format="RGBA",o.height=d,o.width=p,t!==void 0){let h=u();h.width=p,h.height=d;let f=l(h);if(f!=null)f.putImageData(e,0,0),s=f.getImageData(0,0,p,d).data;else throw new Error("Can not access image data")}else s=e.data}else if(a){if(t===void 0)throw new Error("Please provide image config with format for Imagebitmap");let d=u();d.width=e.width,d.height=e.height;let p=l(d);if(p!=null){let h=e.height,f=e.width;return p.drawImage(e,0,0,f,h),s=p.getImageData(0,0,f,h).data,o.height=h,o.width=f,dt(s,o)}else throw new Error("Can not access image data")}else{if(n)return new Promise((d,p)=>{let h=u(),f=l(h);if(!e||!f)return p();let g=new Image;g.crossOrigin="Anonymous",g.src=e,g.onload=()=>{h.width=g.width,h.height=g.height,f.drawImage(g,0,0,h.width,h.height);let y=f.getImageData(0,0,h.width,h.height);o.height=h.height,o.width=h.width,d(dt(y.data,o))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(s!==void 0)return dt(s,o);throw new Error("Input data provided is not supported - aborted tensor creation")},mr=(e,t)=>{let{width:r,height:i,download:a,dispose:n}=t,s=[1,i,r,4];return new Pe({location:"texture",type:"float32",texture:e,dims:s,download:a,dispose:n})},gr=(e,t)=>{let{dataType:r,dims:i,download:a,dispose:n}=t;return new Pe({location:"gpu-buffer",type:r??"float32",gpuBuffer:e,dims:i,download:a,dispose:n})},De=(e,t)=>{let{dataType:r,dims:i,download:a,dispose:n}=t;return new Pe({location:"ml-tensor",type:r??"float32",mlTensor:e,dims:i,download:a,dispose:n})},It=(e,t,r)=>new Pe({location:"cpu-pinned",type:e,data:t,dims:r??[t.length]})}),nt,At,yr,yi,Wa=C(()=>{nt=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),At=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),yr=!1,yi=()=>{if(!yr){yr=!0;let e=typeof BigInt64Array<"u"&&BigInt64Array.from,t=typeof BigUint64Array<"u"&&BigUint64Array.from,r=globalThis.Float16Array,i=typeof r<"u"&&r.from;e&&(nt.set("int64",BigInt64Array),At.set(BigInt64Array,"int64")),t&&(nt.set("uint64",BigUint64Array),At.set(BigUint64Array,"uint64")),i?(nt.set("float16",r),At.set(r,"float16")):nt.set("float16",Uint16Array)}}}),wi,_i,Ga=C(()=>{wr(),wi=e=>{let t=1;for(let r=0;r<e.length;r++){let i=e[r];if(typeof i!="number"||!Number.isSafeInteger(i))throw new TypeError(`dims[${r}] must be an integer, got: ${i}`);if(i<0)throw new RangeError(`dims[${r}] must be a non-negative integer, got: ${i}`);t*=i}return t},_i=(e,t)=>{switch(e.location){case"cpu":return new Pe(e.type,e.data,t);case"cpu-pinned":return new Pe({location:"cpu-pinned",data:e.data,type:e.type,dims:t});case"texture":return new Pe({location:"texture",texture:e.texture,type:e.type,dims:t});case"gpu-buffer":return new Pe({location:"gpu-buffer",gpuBuffer:e.gpuBuffer,type:e.type,dims:t});case"ml-tensor":return new Pe({location:"ml-tensor",mlTensor:e.mlTensor,type:e.type,dims:t});default:throw new Error(`tensorReshape: tensor location ${e.location} is not supported`)}}}),Pe,wr=C(()=>{nr(),gi(),Wa(),Ga(),Pe=class{constructor(e,t,r){yi();let i,a;if(typeof e=="object"&&"location"in e)switch(this.dataLocation=e.location,i=e.type,a=e.dims,e.location){case"cpu-pinned":{let s=nt.get(i);if(!s)throw new TypeError(`unsupported type "${i}" to create tensor from pinned buffer`);if(!(e.data instanceof s))throw new TypeError(`buffer should be of type ${s.name}`);this.cpuData=e.data;break}case"texture":{if(i!=="float32")throw new TypeError(`unsupported type "${i}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break}case"gpu-buffer":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint8"&&i!=="bool"&&i!=="uint4"&&i!=="int4")throw new TypeError(`unsupported type "${i}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break}case"ml-tensor":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint64"&&i!=="int8"&&i!=="uint8"&&i!=="bool"&&i!=="uint4"&&i!=="int4")throw new TypeError(`unsupported type "${i}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let s,o;if(typeof e=="string")if(i=e,o=r,e==="string"){if(!Array.isArray(t))throw new TypeError("A string tensor's data must be a string array.");s=t}else{let u=nt.get(e);if(u===void 0)throw new TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(t)){if(e==="float16"&&u===Uint16Array||e==="uint4"||e==="int4")throw new TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${u.name} as data.`);e==="uint64"||e==="int64"?s=u.from(t,BigInt):s=u.from(t)}else if(t instanceof u)s=t;else if(t instanceof Uint8ClampedArray)if(e==="uint8")s=Uint8Array.from(t);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else if(e==="float16"&&t instanceof Uint16Array&&u!==Uint16Array)s=new globalThis.Float16Array(t.buffer,t.byteOffset,t.length);else throw new TypeError(`A ${i} tensor's data must be type of ${u}`)}else if(o=t,Array.isArray(e)){if(e.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let u=typeof e[0];if(u==="string")i="string",s=e;else if(u==="boolean")i="bool",s=Uint8Array.from(e);else throw new TypeError(`Invalid element type of data array: ${u}.`)}else if(e instanceof Uint8ClampedArray)i="uint8",s=Uint8Array.from(e);else{let u=At.get(e.constructor);if(u===void 0)throw new TypeError(`Unsupported type for tensor data: ${e.constructor}.`);i=u,s=e}if(o===void 0)o=[s.length];else if(!Array.isArray(o))throw new TypeError("A tensor's dims must be a number array");a=o,this.cpuData=s,this.dataLocation="cpu"}let n=wi(a);if(this.cpuData&&n!==this.cpuData.length&&!((i==="uint4"||i==="int4")&&Math.ceil(n/2)===this.cpuData.length))throw new Error(`Tensor's size(${n}) does not match data length(${this.cpuData.length}).`);this.type=i,this.dims=a,this.size=n}static async fromImage(e,t){return _t(e,t)}static fromTexture(e,t){return mr(e,t)}static fromGpuBuffer(e,t){return gr(e,t)}static fromMLTensor(e,t){return De(e,t)}static fromPinnedBuffer(e,t,r){return It(e,t,r)}toDataURL(e){return Ke(this,e)}toImageData(e){return yt(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let t=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=t,e&&this.disposer&&(this.disposer(),this.disposer=void 0),t}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return _i(this,e)}}}),Ge,bi=C(()=>{wr(),Ge=Pe}),Wt,_r,rt,Je,pt,ct,$i=C(()=>{Fe(),Wt=(e,t)=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeStamp(`${e}::ORT::${t}`)},_r=(e,t)=>{var a;let r=((a=new Error().stack)==null?void 0:a.split(/\r\n|\r|\n/g))||[],i=!1;for(let n=0;n<r.length;n++){if(i&&!r[n].includes("TRACE_FUNC")){let s=`FUNC_${e}::${r[n].trim().split(" ")[1]}`;t&&(s+=`::${t}`),Wt("CPU",s);return}r[n].includes("TRACE_FUNC")&&(i=!0)}},rt=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||_r("BEGIN",e)},Je=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||_r("END",e)},pt=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.time(`ORT::${e}`)},ct=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeEnd(`ORT::${e}`)}}),vi,ja=C(()=>{Ze(),bi(),$i(),vi=class sc{constructor(t){this.handler=t}async run(t,r,i){rt(),pt("InferenceSession.run");let a={},n={};if(typeof t!="object"||t===null||t instanceof Ge||Array.isArray(t))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let s=!0;if(typeof r=="object"){if(r===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(r instanceof Ge)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(r)){if(r.length===0)throw new TypeError("'fetches' cannot be an empty array.");s=!1;for(let l of r){if(typeof l!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(l)===-1)throw new RangeError(`'fetches' contains invalid output name: ${l}.`);a[l]=null}if(typeof i=="object"&&i!==null)n=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else{let l=!1,d=Object.getOwnPropertyNames(r);for(let p of this.outputNames)if(d.indexOf(p)!==-1){let h=r[p];(h===null||h instanceof Ge)&&(l=!0,s=!1,a[p]=h)}if(l){if(typeof i=="object"&&i!==null)n=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else n=r}}else if(typeof r<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let l of this.inputNames)if(typeof t[l]>"u")throw new Error(`input '${l}' is missing in 'feeds'.`);if(s)for(let l of this.outputNames)a[l]=null;let o=await this.handler.run(t,a,n),u={};for(let l in o)if(Object.hasOwnProperty.call(o,l)){let d=o[l];d instanceof Ge?u[l]=d:u[l]=new Ge(d.type,d.data,d.dims)}return ct("InferenceSession.run"),Je(),u}async release(){return this.handler.dispose()}static async create(t,r,i,a){rt(),pt("InferenceSession.create");let n,s={};if(typeof t=="string"){if(n=t,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof Uint8Array){if(n=t,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer){let d=t,p=0,h=t.byteLength;if(typeof r=="object"&&r!==null)s=r;else if(typeof r=="number"){if(p=r,!Number.isSafeInteger(p))throw new RangeError("'byteOffset' must be an integer.");if(p<0||p>=d.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${d.byteLength}).`);if(h=t.byteLength-p,typeof i=="number"){if(h=i,!Number.isSafeInteger(h))throw new RangeError("'byteLength' must be an integer.");if(h<=0||p+h>d.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${d.byteLength-p}].`);if(typeof a=="object"&&a!==null)s=a;else if(typeof a<"u")throw new TypeError("'options' must be an object.")}else if(typeof i<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof r<"u")throw new TypeError("'options' must be an object.");n=new Uint8Array(d,p,h)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[o,u]=await Re(s),l=await o.createInferenceSessionHandler(n,u);return ct("InferenceSession.create"),Je(),new sc(l)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}get inputMetadata(){return this.handler.inputMetadata}get outputMetadata(){return this.handler.outputMetadata}}}),br,Ha=C(()=>{ja(),br=vi}),Ka=C(()=>{}),Za=C(()=>{}),Qa=C(()=>{}),Xa=C(()=>{}),xi={};Q(xi,{InferenceSession:()=>br,TRACE:()=>Wt,TRACE_EVENT_BEGIN:()=>pt,TRACE_EVENT_END:()=>ct,TRACE_FUNC_BEGIN:()=>rt,TRACE_FUNC_END:()=>Je,Tensor:()=>Ge,env:()=>ee,registerBackend:()=>Y});var et=C(()=>{tt(),lt(),Ha(),bi(),Ka(),Za(),$i(),Qa(),Xa()}),$r=C(()=>{}),Si={};Q(Si,{default:()=>Ti});var vr,xr,Ti,Ya=C(()=>{var e;Ip(),bt(),kr(),vr="ort-wasm-proxy-worker",xr=((e=globalThis.self)==null?void 0:e.name)===vr,xr&&(self.onmessage=t=>{let{type:r,in:i}=t.data;try{switch(r){case"init-wasm":Ar(i.wasm).then(()=>{jn(i).then(()=>{postMessage({type:r})},a=>{postMessage({type:r,err:a})})},a=>{postMessage({type:r,err:a})});break;case"init-ep":{let{epName:a,env:n}=i;Hn(n,a).then(()=>{postMessage({type:r})},s=>{postMessage({type:r,err:s})});break}case"copy-from":{let{buffer:a}=i,n=Ua(a);postMessage({type:r,out:n});break}case"create":{let{model:a,options:n}=i;Zn(a,n).then(s=>{postMessage({type:r,out:s})},s=>{postMessage({type:r,err:s})});break}case"release":Qn(i),postMessage({type:r});break;case"run":{let{sessionId:a,inputIndices:n,inputs:s,outputIndices:o,options:u}=i;Yn(a,n,s,o,new Array(o.length).fill(null),u).then(l=>{l.some(d=>d[3]!=="cpu")?postMessage({type:r,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:r,out:l},es([...s,...l]))},l=>{postMessage({type:r,err:l})});break}case"end-profiling":Jn(i),postMessage({type:r});break;default:}}catch(a){postMessage({type:r,err:a})}}),Ti=xr?null:t=>new Worker(t??Ue,{type:"classic",name:vr})}),Ei,Ii,Ue,Sr,Qt,ki,Ci,Tr,zi,Er,Ai,Ir,Oi,kr=C(()=>{$r(),Ei=typeof location>"u"?void 0:location.origin,Ii=()=>{var e,t;return typeof document<"u"?(e=document.currentScript)==null?void 0:e.src:typeof self<"u"?(t=self.location)==null?void 0:t.href:void 0},Ue=Ii(),Sr=()=>{if(Ue&&!Ue.startsWith("blob:"))return Ue.substring(0,Ue.lastIndexOf("/")+1)},Qt=(e,t)=>{try{let r=t??Ue;return(r?new URL(e,r):new URL(e)).origin===Ei}catch{return!1}},ki=(e,t)=>{let r=t??Ue;try{return(r?new URL(e,r):new URL(e)).href}catch{return}},Ci=(e,t)=>`${t??"./"}${e}`,Tr=async e=>{let t=await(await fetch(e,{credentials:"same-origin"})).blob();return URL.createObjectURL(t)},zi=async e=>(await import(e)).default,Er=(Ya(),Ie(Si)).default,Ai=async()=>{if(!Ue)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(Qt(Ue))return[void 0,Er()];let e=await Tr(Ue);return[e,Er(e)]},Ir=void 0,Oi=async(e,t,r,i)=>{let a=Ir&&!(e||t);if(a)if(Ue)a=Qt(Ue)||i&&!r;else if(i&&!r)a=!0;else throw new Error("cannot determine the script source URL.");if(a)return[void 0,Ir];{let n="ort-wasm-simd-threaded.jsep.mjs",s=e??ki(n,t),o=r&&s&&!Qt(s,t),u=o?await Tr(s):s??Ci(n,t);return[o?u:void 0,await zi(u)]}}}),Cr,Xt,Ot,zr,Ri,Bi,Mi,Ar,he,bt=C(()=>{kr(),Xt=!1,Ot=!1,zr=!1,Ri=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},Bi=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},Mi=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,19,1,17,0,65,1,253,15,65,2,253,15,65,3,253,15,253,147,2,11]))}catch{return!1}},Ar=async e=>{if(Xt)return Promise.resolve();if(Ot)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(zr)throw new Error("previous call to 'initializeWebAssembly()' failed.");Ot=!0;let t=e.initTimeout,r=e.numThreads;if(e.simd!==!1){if(e.simd==="relaxed"){if(!Mi())throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.")}else if(!Bi())throw new Error("WebAssembly SIMD is not supported in the current environment.")}let i=Ri();r>1&&!i&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+r+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),e.numThreads=r=1);let a=e.wasmPaths,n=typeof a=="string"?a:void 0,s=a==null?void 0:a.mjs,o=(s==null?void 0:s.href)??s,u=a==null?void 0:a.wasm,l=(u==null?void 0:u.href)??u,d=e.wasmBinary,[p,h]=await Oi(o,n,r>1,!!d||!!l),f=!1,g=[];if(t>0&&g.push(new Promise(y=>{setTimeout(()=>{f=!0,y()},t)})),g.push(new Promise((y,$)=>{let _={numThreads:r};if(d)_.wasmBinary=d,_.locateFile=w=>w;else if(l||n)_.locateFile=w=>l??n+w;else if(o&&o.indexOf("blob:")!==0)_.locateFile=w=>new URL(w,o).href;else if(p){let w=Sr();w&&(_.locateFile=S=>w+S)}h(_).then(w=>{Ot=!1,Xt=!0,Cr=w,y(),p&&URL.revokeObjectURL(p)},w=>{Ot=!1,zr=!0,$(w)})})),await Promise.race(g),f)throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`)},he=()=>{if(Xt&&Cr)return Cr;throw new Error("WebAssembly is not initialized yet.")}}),je,Yt,ae,Or=C(()=>{bt(),je=(e,t)=>{let r=he(),i=r.lengthBytesUTF8(e)+1,a=r._malloc(i);return r.stringToUTF8(e,a,i),t.push(a),a},Yt=(e,t,r,i)=>{if(typeof e=="object"&&e!==null){if(r.has(e))throw new Error("Circular reference in options");r.add(e)}Object.entries(e).forEach(([a,n])=>{let s=t?t+a:a;if(typeof n=="object")Yt(n,s+".",r,i);else if(typeof n=="string"||typeof n=="number")i(s,n.toString());else if(typeof n=="boolean")i(s,n?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof n}`)})},ae=e=>{let t=he(),r=t.stackSave();try{let i=t.PTR_SIZE,a=t.stackAlloc(2*i);t._OrtGetLastError(a,a+i);let n=Number(t.getValue(a,i===4?"i32":"i64")),s=t.getValue(a+i,"*"),o=s?t.UTF8ToString(s):"";throw new Error(`${e} ERROR_CODE: ${n}, ERROR_MESSAGE: ${o}`)}finally{t.stackRestore(r)}}}),Di,Ja=C(()=>{bt(),Or(),Di=e=>{let t=he(),r=0,i=[],a=e||{};try{if((e==null?void 0:e.logSeverityLevel)===void 0)a.logSeverityLevel=2;else if(typeof e.logSeverityLevel!="number"||!Number.isInteger(e.logSeverityLevel)||e.logSeverityLevel<0||e.logSeverityLevel>4)throw new Error(`log severity level is not valid: ${e.logSeverityLevel}`);if((e==null?void 0:e.logVerbosityLevel)===void 0)a.logVerbosityLevel=0;else if(typeof e.logVerbosityLevel!="number"||!Number.isInteger(e.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);(e==null?void 0:e.terminate)===void 0&&(a.terminate=!1);let n=0;return(e==null?void 0:e.tag)!==void 0&&(n=je(e.tag,i)),r=t._OrtCreateRunOptions(a.logSeverityLevel,a.logVerbosityLevel,!!a.terminate,n),r===0&&ae("Can't create run options."),(e==null?void 0:e.extra)!==void 0&&Yt(e.extra,"",new WeakSet,(s,o)=>{let u=je(s,i),l=je(o,i);t._OrtAddRunConfigEntry(r,u,l)!==0&&ae(`Can't set a run config entry: ${s} - ${o}.`)}),[r,i]}catch(n){throw r!==0&&t._OrtReleaseRunOptions(r),i.forEach(s=>t._free(s)),n}}}),Pi,Ui,Ni,Rt,Li,Vi,en=C(()=>{bt(),Or(),Pi=e=>{switch(e){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"layout":return 3;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${e}`)}},Ui=e=>{switch(e){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${e}`)}},Ni=e=>{e.extra||(e.extra={}),e.extra.session||(e.extra.session={});let t=e.extra.session;t.use_ort_model_bytes_directly||(t.use_ort_model_bytes_directly="1"),e.executionProviders&&e.executionProviders.some(r=>(typeof r=="string"?r:r.name)==="webgpu")&&(e.enableMemPattern=!1)},Rt=(e,t,r,i)=>{let a=je(t,i),n=je(r,i);he()._OrtAddSessionConfigEntry(e,a,n)!==0&&ae(`Can't set a session config entry: ${t} - ${r}.`)},Li=async(e,t,r)=>{let i=t.executionProviders;for(let a of i){let n=typeof a=="string"?a:a.name,s=[];switch(n){case"webnn":if(n="WEBNN",typeof a!="string"){let p=a==null?void 0:a.deviceType;p&&Rt(e,"deviceType",p,r)}break;case"webgpu":if(n="JS",typeof a!="string"){let p=a;if(p!=null&&p.preferredLayout){if(p.preferredLayout!=="NCHW"&&p.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${p.preferredLayout}`);Rt(e,"preferredLayout",p.preferredLayout,r)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${n}`)}let o=je(n,r),u=s.length,l=0,d=0;if(u>0){l=he()._malloc(u*he().PTR_SIZE),r.push(l),d=he()._malloc(u*he().PTR_SIZE),r.push(d);for(let p=0;p<u;p++)he().setValue(l+p*he().PTR_SIZE,s[p][0],"*"),he().setValue(d+p*he().PTR_SIZE,s[p][1],"*")}await he()._OrtAppendExecutionProvider(e,o,l,d,u)!==0&&ae(`Can't append execution provider: ${n}.`)}},Vi=async e=>{let t=he(),r=0,i=[],a=e||{};Ni(a);try{let n=Pi(a.graphOptimizationLevel??"all"),s=Ui(a.executionMode??"sequential"),o=typeof a.logId=="string"?je(a.logId,i):0,u=a.logSeverityLevel??2;if(!Number.isInteger(u)||u<0||u>4)throw new Error(`log severity level is not valid: ${u}`);let l=a.logVerbosityLevel??0;if(!Number.isInteger(l)||l<0||l>4)throw new Error(`log verbosity level is not valid: ${l}`);let d=typeof a.optimizedModelFilePath=="string"?je(a.optimizedModelFilePath,i):0;if(r=t._OrtCreateSessionOptions(n,!!a.enableCpuMemArena,!!a.enableMemPattern,s,!!a.enableProfiling,0,o,u,l,d),r===0&&ae("Can't create session options."),a.executionProviders&&await Li(r,a,i),a.enableGraphCapture!==void 0){if(typeof a.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${a.enableGraphCapture}`);Rt(r,"enableGraphCapture",a.enableGraphCapture.toString(),i)}if(a.freeDimensionOverrides)for(let[p,h]of Object.entries(a.freeDimensionOverrides)){if(typeof p!="string")throw new Error(`free dimension override name must be a string: ${p}`);if(typeof h!="number"||!Number.isInteger(h)||h<0)throw new Error(`free dimension override value must be a non-negative integer: ${h}`);let f=je(p,i);t._OrtAddFreeDimensionOverride(r,f,h)!==0&&ae(`Can't set a free dimension override: ${p} - ${h}.`)}return a.extra!==void 0&&Yt(a.extra,"",new WeakSet,(p,h)=>{Rt(r,p,h,i)}),[r,i]}catch(n){throw r!==0&&t._OrtReleaseSessionOptions(r)!==0&&ae("Can't release session options."),i.forEach(s=>t._free(s)),n}}}),$t,vt,xt,Rr,Br,Mr,Dr,Yr,ue=C(()=>{$t=e=>{switch(e){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${e}`)}},vt=e=>{switch(e){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${e}`)}},xt=(e,t)=>{let r=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][e],i=typeof t=="number"?t:t.reduce((a,n)=>a*n,1);return r>0?Math.ceil(i*r):void 0},Rr=e=>{switch(e){case"float16":return typeof Float16Array<"u"&&Float16Array.from?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${e}`)}},Br=e=>{switch(e){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${e}`)}},Mr=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",Dr=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint64"||e==="int8"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",Yr=e=>{switch(e){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${e}`)}}}),Pr,qi=C(()=>{$r(),Pr=async e=>{if(typeof e=="string"){let t=await fetch(e);if(!t.ok)throw new Error(`failed to load external data file: ${e}`);let r=t.headers.get("Content-Length"),i=r?parseInt(r,10):0;if(i<1073741824)return new Uint8Array(await t.arrayBuffer());{if(!t.body)throw new Error(`failed to load external data file: ${e}, no response body.`);let a=t.body.getReader(),n;try{n=new ArrayBuffer(i)}catch(o){if(o instanceof RangeError){let u=Math.ceil(i/65536);n=new WebAssembly.Memory({initial:u,maximum:u}).buffer}else throw o}let s=0;for(;;){let{done:o,value:u}=await a.read();if(o)break;let l=u.byteLength;new Uint8Array(n,s,l).set(u),s+=l}return new Uint8Array(n,0,i)}}else return e instanceof Blob?new Uint8Array(await e.arrayBuffer()):e instanceof Uint8Array?e:new Uint8Array(e)}}),Fi,Jr,ei,Gt,ti,ri,Ee,Tt=C(()=>{ue(),Fi=["V","I","W","E","F"],Jr=(e,t)=>{console.log(`[${Fi[e]},${new Date().toISOString()}]${t}`)},ti=(e,t)=>{ei=e,Gt=t},ri=(e,t)=>{let r=Br(e),i=Br(ei);r>=i&&Jr(r,typeof t=="function"?t():t)},Ee=(...e)=>{Gt&&ri(...e)}}),ii,jt,M,sr,ai,Wi,Bt,ie=C(()=>{ii=class{static calcMatMulShape(e,t){return e[1]!==t[0]?void 0:[e[0],t[1]]}},jt=class{static calcShape(e,t,r=!1){let i=e.length,a=t.length;if(i===0)return t;if(a===0)return e;let n=Math.max(e.length,t.length),s=new Array(n);if(r){if(i<2||a<2)return;let o=ii.calcMatMulShape([e[i-2],e[i-1]],[t[a-2],t[a-1]]);if(o===void 0)return;[s[n-2],s[n-1]]=o}for(let o=r?3:1;o<=n;o++){let u=i-o<0?1:e[i-o],l=a-o<0?1:t[a-o];if(u!==l&&u>1&&l>1)return;let d=Math.max(u,l);if(u&&l)s[n-o]=Math.max(u,l);else{if(d>1)return;s[n-o]=0}}return s}static isValidBroadcast(e,t){let r=e.length,i=t.length;if(r>i)return!1;for(let a=1;a<=r;a++)if(e[r-a]!==1&&e[r-a]!==t[i-a])return!1;return!0}},M=class qa{static size(t){return qa.getSizeFromDimensionRange(t,0,t.length)}static convertShape(t,r=4){let i=t.length;if(i===0)return[];let a=new Array(i),n=i-1;for(;n>=0;){if(t[n]%r===0){a[n]=t[n]/r;break}if(r%t[n]!==0)throw new Error("cannot convert shape");a[n]=1,r/=t[n],n--}for(n--;n>=0;n--)a[n]=t[n];return a}static sizeFromDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeFromDimension as Tensor has ${t.length} dimensions.`);return qa.getSizeFromDimensionRange(t,r,t.length)}static sizeToDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeToDimension as Tensor has ${t.length} dimensions.`);return qa.getSizeFromDimensionRange(t,0,r)}static getSizeFromDimensionRange(t,r,i){let a=1;for(let n=r;n<i;n++){if(t[n]<0)throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");a*=Number(t[n])}return a}static computeStrides(t){let r=t.length;if(r===0)return[];if(r===1)return[1];let i=new Array(r);i[r-1]=1,i[r-2]=t[r-1];for(let a=r-3;a>=0;--a)i[a]=i[a+1]*t[a+1];return i}static normalizeAxis(t,r){if(t<-r&&t>=r)throw new Error("unsupported axis for this operation.");return t<0?t+r:t}static normalizeAxes(t,r){return t.map(i=>this.normalizeAxis(i,r??t.length))}static sortBasedOnPerm(t,r){return r?r.map(i=>t[i]):t.slice().reverse()}static padShape(t,r){let i=t.length;return t.map((a,n)=>a+r[n]+r[n+i])}static areEqual(t,r){return t.length!==r.length?!1:t.every((i,a)=>i===r[a])}},sr=class $a{static adjustPoolAttributes(t,r,i,a,n,s){if(!t&&i.length!==r.length-2)throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");if(t)for(let o=0;o<r.length-2;o++)o>=i.length?i.push(r[o+2]):i[o]=r[o+2];for(let o=0;o<i.length;o++)if(o<a.length){if(a[o]<0)throw new Error("strides should be greater than or equal to 1")}else a.push(1);for(let o=0;o<i.length;o++)if(o<n.length){if(n[o]<0)throw new Error("dilations should be greater than or equal to 1")}else n.push(1);for(let o=0;o<i.length*2;o++)if(o<s.length){if(s[o]<0)throw new Error("pad should be greater than or equal to 1")}else s.push(0);for(let o=0;o<i.length;o++){if(i[o]<=0)throw new Error("kernel shapes need to be greater than 0");if(s[o]>=i[o]||s[o+i.length]>=i[o])throw new Error("pads should be smaller than kernel")}}static adjustPadsBasedOnAutoPad(t,r,i,a,n,s,o){if(o){if(n.length!==2*(t.length-2))throw new Error("length of pads should be twice the length of data dimensions");if(r.length!==t.length-2)throw new Error("length of strides should be the length of data dimensions");if(a.length!==t.length-2)throw new Error("length of kernel shapes should be the length of data dimensions");for(let u=0;u<t.length-2;u++)$a.adjustPadAndReturnShape(t[u+(s?1:2)],r[u],i[u],a[u],n,u,u+t.length-2,o)}}static computePoolOutputShape(t,r,i,a,n,s,o){if(r.length<=0)throw new Error("input shape must be of size greater than 0");let u=[r[0],r[1]];return $a.computeShapeHelper(t,r,u,i,a,n,s,o),u}static computeConvOutputShape(t,r,i,a,n,s,o){if(t.length<=0||r.length<=0)throw new Error("invalid input tensor dims or invalid filter tensor dims");let u=[t[0],r[0]];return $a.computeShapeHelper(!1,t,u,i,a,n,s,o),u}static computeShapeHelper(t,r,i,a,n,s,o,u){if(t)for(let l=0;l<r.length-2;l++)i.push(1);else for(let l=0;l<r.length-2;l++)i.push($a.adjustPadAndReturnShape(r[l+2],a[l],n[l],s[l],o,l,l+r.length-2,u))}static adjustPadAndReturnShape(t,r,i,a,n,s,o,u){let l=i*(a-1)+1;if(u&&u!=="NOTSET")switch(u){case"VALID":return n[s]=0,n[o]=0,Math.floor((t-l)/r+1);case"SAME_LOWER":case"SAME_UPPER":if(i!==1)throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");{let d=((t+r-1)/r-1)*r+a-t;return n[s]=Math.floor(u==="SAME_LOWER"?(d+1)/2:d/2),n[o]=d-n[s],Math.floor((t+d-a)/r+1)}default:throw new Error("Unsupported AutoPad type")}else return Math.floor((t+n[s]+n[o]-l)/r+1)}},ai=class{static getShapeOfGemmResult(e,t,r,i,a){if(e.length!==2||r.length!==2)throw new Error("shape need to be of size 2");let n,s,o;t?(n=e[1],s=e[0]):(n=e[0],s=e[1]);let u=-1;if(i?(o=r[0],u=1):(o=r[1],u=0),r[u]!==s)throw new Error("dimension mismatch");if(n<=0||o<=0||s<=0)throw new Error("invalid shape specified");if(a&&!jt.isValidBroadcast(a,[n,o]))throw new Error("gemm: invalid bias shape for broadcast");return[n,o,s]}},Wi=-34028234663852886e22,Bt=34028234663852886e22}),Ht,or=C(()=>{ue(),Ht=(e,t)=>new(Rr(t))(e)}),Jt,ur,Ur,Nr,Mt,Kt,ni,si,oi,Gi,ji,xa=C(()=>{ue(),Tt(),Jt=new Map([["float32",32],["float16",16],["int32",32],["uint32",32],["int64",64],["uint64",64],["int8",8],["uint8",8],["int4",4],["uint4",4]]),ur=(e,t)=>{if(t==="int32")return e;let r=Jt.get(t);if(!r)throw new Error(`WebNN backend does not support data type: ${t}`);let i=r/8;if(e.byteLength%i!==0)throw new Error(`Invalid Uint8Array length - must be a multiple of ${i}.`);let a=e.byteLength/i,n=new(Rr(t))(e.buffer,e.byteOffset,a);switch(t){case"int64":case"uint64":{let s=new Int32Array(a);for(let o=0;o<a;o++){let u=n[o];if(u>2147483647n||u<-2147483648n)throw new Error("Can not convert int64 data to int32 - value out of range.");s[o]=Number(u)}return new Uint8Array(s.buffer)}case"int8":case"uint8":case"uint32":{if(t==="uint32"&&n.some(o=>o>2147483647))throw new Error("Can not convert uint32 data to int32 - value out of range.");let s=Int32Array.from(n,Number);return new Uint8Array(s.buffer)}default:throw new Error(`Unsupported data conversion from ${t} to 'int32'`)}},Ur=(e,t)=>{if(t==="int32")return e;if(e.byteLength%4!==0)throw new Error("Invalid Uint8Array length - must be a multiple of 4 (int32).");let r=e.byteLength/4,i=new Int32Array(e.buffer,e.byteOffset,r);switch(t){case"int64":{let a=BigInt64Array.from(i,BigInt);return new Uint8Array(a.buffer)}case"uint64":{if(i.some(n=>n<0))throw new Error("Can not convert int32 data to uin64 - negative value found.");let a=BigUint64Array.from(i,BigInt);return new Uint8Array(a.buffer)}case"int8":{if(i.some(n=>n<-128||n>127))throw new Error("Can not convert int32 data to int8 - value out of range.");let a=Int8Array.from(i,Number);return new Uint8Array(a.buffer)}case"uint8":{if(i.some(a=>a<0||a>255))throw new Error("Can not convert int32 data to uint8 - value out of range.");return Uint8Array.from(i,Number)}case"uint32":{if(i.some(n=>n<0))throw new Error("Can not convert int32 data to uint32 - negative value found.");let a=Uint32Array.from(i,Number);return new Uint8Array(a.buffer)}default:throw new Error(`Unsupported data conversion from 'int32' to ${t}`)}},Nr=1,Mt=()=>Nr++,Kt=new Map([["int8","int32"],["uint8","int32"],["uint32","int32"],["int64","int32"]]),ni=(e,t)=>{let r=Jt.get(e);if(!r)throw new Error(`WebNN backend does not support data type: ${e}`);return t.length>0?Math.ceil(t.reduce((i,a)=>i*a)*r/8):0},si=class{constructor(e){this.isDataConverted=!1;let{sessionId:t,context:r,tensor:i,dataType:a,shape:n,fallbackDataType:s}=e;this.sessionId=t,this.mlContext=r,this.mlTensor=i,this.dataType=a,this.tensorShape=n,this.fallbackDataType=s}get tensor(){return this.mlTensor}get type(){return this.dataType}get fallbackType(){return this.fallbackDataType}get shape(){return this.tensorShape}get byteLength(){return ni(this.dataType,this.tensorShape)}destroy(){Ee("verbose",()=>"[WebNN] TensorWrapper.destroy"),this.mlTensor.destroy()}write(e){this.mlContext.writeTensor(this.mlTensor,e)}async read(e){if(this.fallbackDataType){let t=await this.mlContext.readTensor(this.mlTensor),r=Ur(new Uint8Array(t),this.dataType);if(e){(e instanceof ArrayBuffer?new Uint8Array(e):new Uint8Array(e.buffer,e.byteOffset,e.byteLength)).set(r);return}else return r.buffer}else return e?this.mlContext.readTensor(this.mlTensor,e):this.mlContext.readTensor(this.mlTensor)}canReuseTensor(e,t,r){return this.mlContext===e&&this.dataType===t&&this.tensorShape.length===r.length&&this.tensorShape.every((i,a)=>i===r[a])}setIsDataConverted(e){this.isDataConverted=e}},oi=class{constructor(e,t){this.tensorManager=e,this.wrapper=t}get tensorWrapper(){return this.wrapper}releaseTensor(){this.tensorWrapper&&(this.tensorManager.releaseTensor(this.tensorWrapper),this.wrapper=void 0)}async ensureTensor(e,t,r,i){let a=this.tensorManager.getMLContext(e),n=this.tensorManager.getMLOpSupportLimits(e),s;if(!(n!=null&&n.input.dataTypes.includes(t))){if(s=Kt.get(t),!s||(n==null?void 0:n.input.dataTypes.includes(s)))throw new Error(`WebNN backend does not support data type: ${t}`);Ee("verbose",()=>`[WebNN] TensorIdTracker.ensureTensor: fallback dataType from ${t} to ${s}`)}if(this.wrapper){if(this.wrapper.canReuseTensor(a,t,r))return this.wrapper.tensor;if(i){if(this.wrapper.byteLength!==ni(t,r))throw new Error("Unable to copy data to tensor with different size.");this.activeUpload=new Uint8Array(await this.wrapper.read())}this.tensorManager.releaseTensor(this.wrapper)}let o=typeof MLTensorUsage>"u"?void 0:MLTensorUsage.READ|MLTensorUsage.WRITE;return this.wrapper=await this.tensorManager.getCachedTensor(e,t,r,o,!0,!0,s),i&&this.activeUpload&&(this.wrapper.write(this.activeUpload),this.activeUpload=void 0),this.wrapper.tensor}upload(e){let t=e;if(this.wrapper){if(this.wrapper.fallbackType)if(this.wrapper.fallbackType==="int32")t=ur(e,this.wrapper.type),this.wrapper.setIsDataConverted(!0);else throw new Error(`Unsupported fallback data type: ${this.wrapper.fallbackType}`);if(e.byteLength===this.wrapper.byteLength){this.wrapper.write(t);return}else Ee("verbose",()=>"Data size does not match tensor size. Releasing tensor."),this.releaseTensor()}this.activeUpload?this.activeUpload.set(t):this.activeUpload=new Uint8Array(t)}async download(e){var t,r;if(this.activeUpload){let i=(t=this.wrapper)!=null&&t.isDataConverted?Ur(this.activeUpload,(r=this.wrapper)==null?void 0:r.type):this.activeUpload;if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(i):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(i);return}else return i.buffer}if(!this.wrapper)throw new Error("Tensor has not been created.");return e?this.wrapper.read(e):this.wrapper.read()}},Gi=class{constructor(e){this.backend=e,this.tensorTrackersById=new Map,this.freeTensors=[],this.externalTensors=new Set}getMLContext(e){let t=this.backend.getMLContext(e);if(!t)throw new Error("MLContext not found for session.");return t}getMLOpSupportLimits(e){return this.backend.getMLOpSupportLimits(e)}reserveTensorId(){let e=Mt();return this.tensorTrackersById.set(e,new oi(this)),e}releaseTensorId(e){let t=this.tensorTrackersById.get(e);t&&(this.tensorTrackersById.delete(e),t.tensorWrapper&&this.releaseTensor(t.tensorWrapper))}async ensureTensor(e,t,r,i,a){Ee("verbose",()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${t}, dataType: ${r}, shape: ${i}, copyOld: ${a}}`);let n=this.tensorTrackersById.get(t);if(!n)throw new Error("Tensor not found.");return n.ensureTensor(e,r,i,a)}upload(e,t){let r=this.tensorTrackersById.get(e);if(!r)throw new Error("Tensor not found.");r.upload(t)}async download(e,t){Ee("verbose",()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${t==null?void 0:t.byteLength}}`);let r=this.tensorTrackersById.get(e);if(!r)throw new Error("Tensor not found.");return r.download(t)}releaseTensorsForSession(e){for(let t of this.freeTensors)t.sessionId===e&&t.destroy();this.freeTensors=this.freeTensors.filter(t=>t.sessionId!==e)}registerTensor(e,t,r,i){let a=this.getMLContext(e),n=Mt(),s=new si({sessionId:e,context:a,tensor:t,dataType:r,shape:i});return this.tensorTrackersById.set(n,new oi(this,s)),this.externalTensors.add(s),n}async getCachedTensor(e,t,r,i,a,n,s){let o=this.getMLContext(e);for(let[l,d]of this.freeTensors.entries())if(d.canReuseTensor(o,t,r)){Ee("verbose",()=>`[WebNN] Reusing tensor {dataType: ${t}, ${s?`fallbackDataType: ${s},`:""} shape: ${r}`);let p=this.freeTensors.splice(l,1)[0];return p.sessionId=e,p}Ee("verbose",()=>`[WebNN] MLContext.createTensor {dataType: ${t}, ${s?`fallbackDataType: ${s},`:""} shape: ${r}}`);let u=await o.createTensor({dataType:s??t,shape:r,dimensions:r,usage:i,writable:a,readable:n});return new si({sessionId:e,context:o,tensor:u,dataType:t,shape:r,fallbackDataType:s})}releaseTensor(e){this.externalTensors.has(e)&&this.externalTensors.delete(e),this.freeTensors.push(e)}},ji=(...e)=>new Gi(...e)}),lr,Hi,Ki,Zi=C(()=>{ue(),bt(),or(),xa(),Tt(),lr=new Map([[1,"float32"],[10,"float16"],[6,"int32"],[12,"uint32"],[7,"int64"],[13,"uint64"],[22,"int4"],[21,"uint4"],[3,"int8"],[2,"uint8"],[9,"uint8"]]),Hi=(e,t)=>{if(e===t)return!0;if(e===void 0||t===void 0)return!1;let r=Object.keys(e).sort(),i=Object.keys(t).sort();return r.length===i.length&&r.every((a,n)=>a===i[n]&&e[a]===t[a])},Ki=class{constructor(e){this.tensorManager=ji(this),this.mlContextBySessionId=new Map,this.sessionIdsByMLContext=new Map,this.mlContextCache=[],this.sessionGraphInputs=new Map,this.sessionGraphOutputs=new Map,this.temporaryGraphInputs=[],this.temporaryGraphOutputs=[],this.temporarySessionTensorIds=new Map,this.mlOpSupportLimitsBySessionId=new Map,ti(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw new Error("No active session");return this.activeSessionId}onRunStart(e){Ee("verbose",()=>`[WebNN] onRunStart {sessionId: ${e}}`),this.activeSessionId=e}onRunEnd(e){Ee("verbose",()=>`[WebNN] onRunEnd {sessionId: ${e}}`);let t=this.temporarySessionTensorIds.get(e);if(t){for(let r of t)Ee("verbose",()=>`[WebNN] releasing temporary tensor {tensorId: ${r}}`),this.tensorManager.releaseTensorId(r);this.temporarySessionTensorIds.delete(e),this.activeSessionId=void 0}}async createMLContext(e){if(e instanceof GPUDevice){let r=this.mlContextCache.findIndex(i=>i.gpuDevice===e);if(r!==-1)return this.mlContextCache[r].mlContext;{let i=await navigator.ml.createContext(e);return this.mlContextCache.push({gpuDevice:e,mlContext:i}),i}}else if(e===void 0){let r=this.mlContextCache.findIndex(i=>i.options===void 0&&i.gpuDevice===void 0);if(r!==-1)return this.mlContextCache[r].mlContext;{let i=await navigator.ml.createContext();return this.mlContextCache.push({mlContext:i}),i}}let t=this.mlContextCache.findIndex(r=>Hi(r.options,e));if(t!==-1)return this.mlContextCache[t].mlContext;{let r=await navigator.ml.createContext(e);return this.mlContextCache.push({options:e,mlContext:r}),r}}registerMLContext(e,t){this.mlContextBySessionId.set(e,t);let r=this.sessionIdsByMLContext.get(t);r||(r=new Set,this.sessionIdsByMLContext.set(t,r)),r.add(e),this.mlOpSupportLimitsBySessionId.has(e)||this.mlOpSupportLimitsBySessionId.set(e,t.opSupportLimits()),this.temporaryGraphInputs.length>0&&(this.sessionGraphInputs.set(e,this.temporaryGraphInputs),this.temporaryGraphInputs=[]),this.temporaryGraphOutputs.length>0&&(this.sessionGraphOutputs.set(e,this.temporaryGraphOutputs),this.temporaryGraphOutputs=[])}onReleaseSession(e){this.sessionGraphInputs.delete(e),this.sessionGraphOutputs.delete(e);let t=this.mlContextBySessionId.get(e);if(!t)return;this.tensorManager.releaseTensorsForSession(e),this.mlContextBySessionId.delete(e),this.mlOpSupportLimitsBySessionId.delete(e);let r=this.sessionIdsByMLContext.get(t);if(r.delete(e),r.size===0){this.sessionIdsByMLContext.delete(t);let i=this.mlContextCache.findIndex(a=>a.mlContext===t);i!==-1&&this.mlContextCache.splice(i,1)}}getMLContext(e){return this.mlContextBySessionId.get(e)}getMLOpSupportLimits(e){return this.mlOpSupportLimitsBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){Ee("verbose",()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,t,r,i,a){let n=lr.get(r);if(!n)throw new Error(`Unsupported ONNX data type: ${r}`);return this.tensorManager.ensureTensor(e??this.currentSessionId,t,n,i,a)}async createTemporaryTensor(e,t,r){Ee("verbose",()=>`[WebNN] createTemporaryTensor {onnxDataType: ${t}, shape: ${r}}`);let i=lr.get(t);if(!i)throw new Error(`Unsupported ONNX data type: ${t}`);let a=this.tensorManager.reserveTensorId();await this.tensorManager.ensureTensor(e,a,i,r,!1);let n=this.temporarySessionTensorIds.get(e);return n?n.push(a):this.temporarySessionTensorIds.set(e,[a]),a}uploadTensor(e,t){if(!he().shouldTransferToMLTensor)throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");Ee("verbose",()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${t.byteLength}}`),this.tensorManager.upload(e,t)}async downloadTensor(e,t){return this.tensorManager.download(e,t)}createMLTensorDownloader(e,t){return async()=>{let r=await this.tensorManager.download(e);return Ht(r,t)}}registerMLTensor(e,t,r,i){let a=lr.get(r);if(!a)throw new Error(`Unsupported ONNX data type: ${r}`);let n=this.tensorManager.registerTensor(e,t,a,i);return Ee("verbose",()=>`[WebNN] registerMLTensor {tensor: ${t}, dataType: ${a}, dimensions: ${i}} -> {tensorId: ${n}}`),n}registerMLConstant(e,t,r,i,a,n,s=!1){if(!n)throw new Error("External mounted files are not available.");let o=e;e.startsWith("./")&&(o=e.substring(2));let u=n.get(o);if(!u)throw new Error(`File with name ${o} not found in preloaded files.`);if(t+r>u.byteLength)throw new Error("Out of bounds: data offset and length exceed the external file data size.");let l=u.slice(t,t+r).buffer,d;switch(a.dataType){case"float32":d=new Float32Array(l);break;case"float16":d=typeof Float16Array<"u"&&Float16Array.from?new Float16Array(l):new Uint16Array(l);break;case"int32":d=new Int32Array(l);break;case"uint32":d=new Uint32Array(l);break;case"int64":if(s){let p=ur(new Uint8Array(l),"int64");d=new Int32Array(p.buffer),a.dataType="int32"}else d=new BigInt64Array(l);break;case"uint64":d=new BigUint64Array(l);break;case"int8":d=new Int8Array(l);break;case"int4":case"uint4":case"uint8":d=new Uint8Array(l);break;default:throw new Error(`Unsupported data type: ${a.dataType} in creating WebNN Constant from external data.`)}return Ee("verbose",()=>`[WebNN] registerMLConstant {dataType: ${a.dataType}, shape: ${a.shape}}} ${s?"(Note: it was int64 data type and registered to int32 as workaround)":""}`),i.constant(a,d)}registerGraphInput(e){this.temporaryGraphInputs.push(e)}registerGraphOutput(e){this.temporaryGraphOutputs.push(e)}isGraphInput(e,t){let r=this.sessionGraphInputs.get(e);return r?r.includes(t):!1}isGraphOutput(e,t){let r=this.sessionGraphOutputs.get(e);return r?r.includes(t):!1}isGraphInputOutputTypeSupported(e,t,r=!0){let i=lr.get($t(t)),a=this.mlOpSupportLimitsBySessionId.get(e);return typeof i>"u"?!1:r?!!(a!=null&&a.input.dataTypes.includes(i)):!!(a!=null&&a.output.dataTypes.includes(i))}flush(){}}}),ui=C(()=>{}),li,di,Lr,pi,ci,hi,Qi,Xi,Sa,tn=C(()=>{Tt(),ui(),li=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),di=[],Lr=e=>Math.ceil(Number(e)/16)*16,pi=e=>{for(let t=0;t<di.length;t++){let r=di[t];if(e<=r)return r}return Math.ceil(e/16)*16},ci=1,hi=()=>ci++,Qi=async(e,t,r,i)=>{let a=Lr(r),n=e.device.createBuffer({size:a,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let s=e.getCommandEncoder();e.endComputePass(),s.copyBufferToBuffer(t,0,n,0,a),e.flush(),await n.mapAsync(GPUMapMode.READ);let o=n.getMappedRange();if(i){let u=i();return u.set(new Uint8Array(o,0,r)),u}else return new Uint8Array(o.slice(0,r))}finally{n.destroy()}},Xi=class{constructor(e){this.backend=e,this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[t]of li)di.push(t),this.freeBuffers.set(t,[]),this.freeUniformBuffers.set(t,[]);this.sessionCount=0}upload(e,t){let r=t.buffer,i=t.byteOffset,a=t.byteLength,n=Lr(a),s=this.storageCache.get(e);if(!s)throw new Error("gpu data for uploading does not exist");if(Number(s.originalSize)!==a)throw new Error(`inconsistent data size. gpu data size=${s.originalSize}, data size=${a}`);let o=this.backend.device.createBuffer({mappedAtCreation:!0,size:n,usage:GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC}),u=o.getMappedRange();new Uint8Array(u).set(new Uint8Array(r,i,a)),o.unmap();let l=this.backend.device.createCommandEncoder();l.copyBufferToBuffer(o,0,s.gpuData.buffer,0,n),this.backend.device.queue.submit([l.finish()]),o.destroy(),Ee("verbose",()=>`[WebGPU] GpuDataManager.upload(id=${e})`)}memcpy(e,t){let r=this.storageCache.get(e);if(!r)throw new Error("source gpu data for memcpy does not exist");let i=this.storageCache.get(t);if(!i)throw new Error("destination gpu data for memcpy does not exist");if(r.originalSize!==i.originalSize)throw new Error("inconsistent source and destination gpu data size");let a=Lr(r.originalSize),n=this.backend.getCommandEncoder();this.backend.endComputePass(),n.copyBufferToBuffer(r.gpuData.buffer,0,i.gpuData.buffer,0,a)}registerExternalBuffer(e,t,r){let i;if(r){if(i=r[0],e===r[1])return Ee("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, buffer is the same, skip.`),i;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else i=hi();return this.storageCache.set(i,{gpuData:{id:i,type:0,buffer:e},originalSize:t}),Ee("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, registered.`),i}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),Ee("verbose",()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let r=pi(e),i,a=(t&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,n=(t&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(a||n){let o=(a?this.freeBuffers:this.freeUniformBuffers).get(r);o?o.length>0?i=o.pop():i=this.backend.device.createBuffer({size:r,usage:t}):i=this.backend.device.createBuffer({size:r,usage:t})}else i=this.backend.device.createBuffer({size:r,usage:t});let s={id:hi(),type:0,buffer:i};return this.storageCache.set(s.id,{gpuData:s,originalSize:Number(e)}),Ee("verbose",()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${s.id}`),s}get(e){var t;return(t=this.storageCache.get(e))==null?void 0:t.gpuData}release(e){let t=typeof e=="bigint"?Number(e):e,r=this.storageCache.get(t);if(!r){if(this.storageCache.size===0)return 0;throw new Error("releasing data does not exist")}return Ee("verbose",()=>`[WebGPU] GpuDataManager.release(id=${t}), gpuDataId=${r.gpuData.id}`),this.storageCache.delete(t),this.buffersPending.push(r.gpuData.buffer),r.originalSize}async download(e,t){let r=this.storageCache.get(Number(e));if(!r)throw new Error("data does not exist");await Qi(this.backend,r.gpuData.buffer,r.originalSize,t)}refreshPendingBuffers(){if(this.buffersPending.length!==0)if(this.backend.sessionStatus==="default"){for(let e of this.buffersPending){let t=li.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let r=this.freeBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let r=this.freeUniformBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let t of this.buffersPending)e.push(t);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onCreateSession(){this.sessionCount+=1}onReleaseSession(e){let t=this.capturedPendingBuffers.get(e);t&&(t.forEach(r=>{r.destroy()}),this.capturedPendingBuffers.delete(e)),this.sessionCount-=1,this.sessionCount===0&&(Ee("warning",()=>"[WebGPU] Clearing webgpu buffer cache"),this.storageCache.forEach(r=>{r.gpuData.buffer.destroy()}),this.storageCache=new Map)}},Sa=(...e)=>new Xi(...e)}),c,m,b=C(()=>{c=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||(this.key=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(";")),this.key}},m=e=>new c(e)}),T,v,A,E,I,O,N,V,U,R,Z,z,F,Le,ye,me,Me,te=C(()=>{ue(),ie(),T=64,v=(e,t)=>{if(t===3)throw new Error("vec3 has same alignment as vec4, use vec4 instead");switch(Number(e)){case 10:return t>1?`vec${t}<f16>`:"f16";case 1:return t>1?`vec${t}<f32>`:"f32";case 6:return t>1?`vec${t}<i32>`:"i32";case 12:return t>1?`vec${t}<u32>`:"u32";case 7:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","i32"];case 13:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","u32"];case 9:if(t!==4)throw new Error("bool must be vec4");return["u32","vec4<bool>"];case 22:return"i32";case 21:return"u32";default:throw new Error(`Unknown data type: ${e}`)}},A=(e,t=1)=>{let r=v(e,t);return typeof r=="string"?r:r[0]},E=(e,t=1)=>{let r=v(e,t);return typeof r=="string"?r:r[1]},I=(...e)=>{let t=[];return e.forEach(r=>{r.length!==0&&t.push({type:12,data:r},{type:12,data:M.computeStrides(r)})}),t},O=e=>e%4===0?4:e%2===0?2:1,N=(e="f32",t,r="0")=>!t||t===1?`${e}(${r})`:`vec${t}<${e}>(${r})`,V=(e,t,r)=>e==="f32"?r:t===1?`f32(${r})`:`vec${t}<f32>(${r})`,U=(e,t)=>t===4?`(${e}.x + ${e}.y + ${e}.z + ${e}.w)`:t===2?`(${e}.x + ${e}.y)`:t===3?`(${e}.x + ${e}.y + ${e}.z)`:e,R=(e,t,r,i)=>e.startsWith("uniforms.")&&r>4?typeof t=="string"?i==="f16"?`${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]`:`${e}[(${t}) / 4][(${t}) % 4]`:i==="f16"?`${e}[${Math.floor(t/8)}][${Math.floor(t%8/4)}][${t%8%4}]`:`${e}[${Math.floor(t/4)}][${t%4}]`:r>1?`${e}[${t}]`:e,Z=(e,t,r,i,a)=>{let n=typeof r=="number",s=n?r:r.length,o=[...new Array(s).keys()],u=s<2?"u32":s<=4?`vec${s}<u32>`:`array<u32, ${s}>`,l=v(t,a),d=typeof l=="string"?l:l[1],p=typeof l=="string"?l:l[0],h={indices:u,value:d,storage:p,tensor:t},f=q=>typeof q=="string"?q:`${q}u`,g={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},y=n?"uniforms.":"",$=`${y}${e}_shape`,_=`${y}${e}_strides`,w="";for(let q=0;q<s-1;q++)w+=`
    let dim${q} = current / ${R(_,q,s)};
    let rest${q} = current % ${R(_,q,s)};
    indices[${q}] = dim${q};
    current = rest${q};
    `;w+=`indices[${s-1}] = current;`;let S=s<2?"":`
  fn o2i_${e}(offset: u32) -> ${h.indices} {
    var indices: ${h.indices};
    var current = offset;
    ${w}
    return indices;
  }`,x=q=>(g.offsetToIndices=!0,s<2?q:`o2i_${e}(${q})`),k=[];if(s>=2)for(let q=s-1;q>=0;q--)k.push(`${R(_,q,s)} * (indices[${q}])`);let B=s<2?"":`
  fn i2o_${e}(indices: ${h.indices}) -> u32 {
    return ${k.join("+")};
  }`,D=q=>(g.indicesToOffset=!0,s<2?q:`i2o_${e}(${q})`),P=(...q)=>s===0?"0u":`${h.indices}(${q.map(f).join(",")})`,L=(q,W)=>s<2?`${q}`:`${R(q,W,s)}`,j=(q,W,fe)=>s<2?`${q}=${fe};`:`${R(q,W,s)}=${fe};`,oe={},X=(q,W)=>{g.broadcastedIndicesToOffset=!0;let fe=`${W.name}broadcastedIndicesTo${e}Offset`;if(fe in oe)return`${fe}(${q})`;let we=[];for(let He=s-1;He>=0;He--){let ca=W.indicesGet("outputIndices",He+W.rank-s);we.push(`${L(_,He)} * (${ca} % ${L($,He)})`)}return oe[fe]=`fn ${fe}(outputIndices: ${W.type.indices}) -> u32 {
             return ${we.length>0?we.join("+"):"0u"};
           }`,`${fe}(${q})`},ne=(q,W)=>(()=>{if(h.storage===h.value)return`${e}[${q}]=${W};`;if(h.storage==="vec2<u32>"&&h.value==="i32")return`${e}[${q}]=vec2<u32>(u32(${W}), select(0u, 0xFFFFFFFFu, ${W} < 0));`;if(h.storage==="vec2<u32>"&&h.value==="u32")return`${e}[${q}]=vec2<u32>(u32(${W}), 0u);`;if(h.storage==="u32"&&h.value==="vec4<bool>")return`${e}[${q}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${W}));`;throw new Error(`not supported combination of storage type ${h.storage} and value type ${h.value} yet`)})(),Ce=q=>(()=>{if(h.storage===h.value)return`${e}[${q}]`;if(h.storage==="vec2<u32>"&&h.value==="i32")return`i32(${e}[${q}].x)`;if(h.storage==="vec2<u32>"&&h.value==="u32")return`u32(${e}[${q}].x)`;if(h.storage==="u32"&&h.value==="vec4<bool>")return`vec4<bool>(bool(${e}[${q}] & 0xFFu), bool(${e}[${q}] & 0xFF00u), bool(${e}[${q}] & 0xFF0000u), bool(${e}[${q}] & 0xFF000000u))`;throw new Error(`not supported combination of storage type ${h.storage} and value type ${h.value} yet`)})(),Ae=s<2?"":`
  fn get_${e}ByIndices(indices: ${h.indices}) -> ${d} {
    return ${Ce(`i2o_${e}(indices)`)};
  }`,J=s<2?"":(()=>{let q=o.map(fe=>`d${fe}: u32`).join(", "),W=o.map(fe=>`d${fe}`).join(", ");return`
  fn get_${e}(${q}) -> ${d} {
    return get_${e}ByIndices(${P(W)});
  }`})(),ge=(...q)=>{if(q.length!==s)throw new Error(`indices length must be ${s}`);let W=q.map(f).join(",");return s===0?Ce("0u"):s===1?Ce(W[0]):(g.get=!0,g.getByIndices=!0,g.indicesToOffset=!0,`get_${e}(${W})`)},Ve=q=>s<2?Ce(q):(g.getByIndices=!0,g.indicesToOffset=!0,`get_${e}ByIndices(${q})`),H=s<2?"":`
  fn set_${e}ByIndices(indices: ${h.indices}, value: ${d}) {
    ${ne(`i2o_${e}(indices)`,"value")}
  }`,qe=s<2?"":(()=>{let q=o.map(fe=>`d${fe}: u32`).join(", "),W=o.map(fe=>`d${fe}`).join(", ");return`
  fn set_${e}(${q}, value: ${d}) {
    set_${e}ByIndices(${P(W)}, value);
  }`})();return{impl:()=>{let q=[],W=!1;return g.offsetToIndices&&(q.push(S),W=!0),g.indicesToOffset&&(q.push(B),W=!0),g.broadcastedIndicesToOffset&&(Object.values(oe).forEach(fe=>q.push(fe)),W=!0),g.set&&(q.push(qe),W=!0),g.setByIndices&&(q.push(H),W=!0),g.get&&(q.push(J),W=!0),g.getByIndices&&(q.push(Ae),W=!0),!n&&W&&q.unshift(`const ${$} = ${h.indices}(${r.join(",")});`,`const ${_} = ${h.indices}(${M.computeStrides(r).join(",")});`),q.join(`
`)},type:h,offsetToIndices:x,indicesToOffset:D,broadcastedIndicesToOffset:X,indices:P,indicesGet:L,indicesSet:j,set:(...q)=>{if(q.length!==s+1)throw new Error(`indices length must be ${s}`);let W=q[s];if(typeof W!="string")throw new Error("value must be string");let fe=q.slice(0,s).map(f).join(",");return s===0?ne("0u",W):s===1?ne(fe[0],W):(g.set=!0,g.setByIndices=!0,g.indicesToOffset=!0,`set_${e}(${fe}, ${W})`)},setByOffset:ne,setByIndices:(q,W)=>s<2?ne(q,W):(g.setByIndices=!0,g.indicesToOffset=!0,`set_${e}ByIndices(${q}, ${W});`),get:ge,getByOffset:Ce,getByIndices:Ve,usage:i,name:e,strides:_,shape:$,rank:s}},z=(e,t,r,i=1)=>Z(e,t,r,"input",i),F=(e,t,r,i=1)=>Z(e,t,r,"output",i),Le=(e,t,r)=>Z(e,t,r,"atomicOutput",1),ye=(e,t,r,i=1)=>Z(e,t,r,"internal",i),me=class{constructor(e,t){this.normalizedDispatchGroup=e,this.limits=t,this.internalVariables=[],this.variables=[],this.uniforms=[],this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e=="number"?`${e}u`:e}) { return; }`}mainStart(e=T){let t=typeof e=="number"?e:e[0],r=typeof e=="number"?1:e[1],i=typeof e=="number"?1:e[2];if(t>this.limits.maxComputeWorkgroupSizeX||r>this.limits.maxComputeWorkgroupSizeY||i>this.limits.maxComputeWorkgroupSizeZ)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(t*r*i>this.limits.maxComputeInvocationsPerWorkgroup)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let a=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1,n=a?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`,s=a?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${t*r*i}u + local_idx;`;return`@compute @workgroup_size(${t}, ${r}, ${i})
  fn main(${n}) {
    ${s}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith("uniforms.")&&this.uniforms.push({name:e.shape.replace("uniforms.",""),type:"u32",length:e.rank}),e.strides.startsWith("uniforms.")&&this.uniforms.push({name:e.strides.replace("uniforms.",""),type:"u32",length:e.rank}))}declareVariable(e,t){if(e.usage==="internal")throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");this.variables.push(e),this.appendVariableUniforms(e);let r=e.usage==="input"?"read":"read_write",i=e.usage==="atomicOutput"?"atomic<i32>":e.type.storage;return`@group(0) @binding(${t}) var<storage, ${r}> ${e.name}: array<${i}>;`}declareVariables(...e){return e.map(t=>this.declareVariable(t,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!=="internal")throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(t=>this.registerInternalVariable(t)),this}registerUniform(e,t,r=1){return this.uniforms.push({name:e,type:t,length:r}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return"";let e=[];for(let{name:t,type:r,length:i}of this.uniforms)if(i&&i>4)r==="f16"?e.push(`@align(16) ${t}:array<mat2x4<${r}>, ${Math.ceil(i/8)}>`):e.push(`${t}:array<vec4<${r}>, ${Math.ceil(i/4)}>`);else{let a=i==null||i===1?r:`vec${i}<${r}>`;e.push(`${t}:${a}`)}return`
      struct Uniforms { ${e.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=t=>[12,10,1,6][["u32","f16","f32","i32"].indexOf(t)];return this.uniforms.map(t=>[e(t.type),t.length??1])}},Me=(e,t)=>new me(e,t)}),Ne,ze,it,ut,ht,Vr,ft,Yi,Ji,at=C(()=>{ue(),ie(),b(),te(),Ne=(e,t)=>{if(!e||e.length!==1)throw new Error("Transpose requires 1 input.");if(t.length!==0&&t.length!==e[0].dims.length)throw new Error(`perm size ${t.length} does not match input rank ${e[0].dims.length}`)},ze=(e,t)=>t.length!==0?t:[...new Array(e).keys()].reverse(),it=(e,t)=>M.sortBasedOnPerm(e,ze(e.length,t)),ut=(e,t,r,i)=>{let a=`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`;for(let n=0;n<t;++n)a+=`a[${e[n]}]=i[${n}];`;return a+="return a;}"},ht=(e,t)=>{let r=[],i=[];for(let a=0;a<e.length;++a)e[a]!==1&&r.push(e[a]),e[t[a]]!==1&&i.push(t[a]);return{newShape:r,newPerm:i}},Vr=(e,t)=>{let r=0;for(let i=0;i<e.length;++i)if(t[e[i]]!==1){if(e[i]<r)return!1;r=e[i]}return!0},ft=(e,t)=>{let r=e.dataType,i=e.dims.length,a=ze(i,t),n=it(e.dims,a),s=e.dims,o=n,u=i<2||Vr(a,e.dims),l;if(u)return l=g=>{let y=z("input",r,s,4),$=F("output",r,o,4);return`
  ${g.registerUniform("output_size","u32").declareVariables(y,$)}
  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    output[global_idx] = input[global_idx];
  }`},{name:"TransposeCopy",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let g=M.size(n);return{outputs:[{dims:n,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(g/64/4)},programUniforms:[{type:12,data:Math.ceil(g/4)}]}},getShaderSource:l};let{newShape:d,newPerm:p}=ht(e.dims,a),h=M.areEqual(p,[2,3,1]),f=M.areEqual(p,[3,1,2]);if(d.length===2||h||f){s=h?[d[0],d[1]*d[2]]:f?[d[0]*d[1],d[2]]:d,o=[s[1],s[0]];let g=16;return l=y=>{let $=z("a",r,s.length),_=F("output",r,o.length);return`
  ${y.registerUniform("output_size","u32").declareVariables($,_)}
  var<workgroup> tile : array<array<${_.type.value}, ${g+1}>, ${g}>;
  ${y.mainStart([g,g,1])}
    let stride = (uniforms.output_shape[1] - 1) / ${g} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${g}u + local_id.x;
    let input_row = workgroup_id_x * ${g}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${$.getByIndices(`${$.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${g}u + local_id.x;
    let output_row = workgroup_id_y * ${g}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${_.setByIndices(`${_.type.indices}(output_row, output_col)`,"tile[local_id.x][local_id.y]")}
    }
  }`},{name:"TransposeShared",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let y=M.size(n);return{outputs:[{dims:n,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(o[1]/g),y:Math.ceil(o[0]/g)},programUniforms:[{type:12,data:y},...I(s,o)]}},getShaderSource:l}}return l=g=>{let y=z("a",r,s.length),$=F("output",r,o.length);return`
  ${g.registerUniform("output_size","u32").declareVariables(y,$)}

  ${ut(a,i,y,$)}

  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${$.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${$.setByOffset("global_idx",y.getByIndices("aIndices"))}
  }`},{name:"Transpose",shaderCache:{hint:`${t}`,inputDependencies:["rank"]},getRunData:()=>{let g=M.size(n);return{outputs:[{dims:n,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:[{type:12,data:g},...I(s,o)]}},getShaderSource:l}},Yi=(e,t)=>{Ne(e.inputs,t.perm),e.compute(ft(e.inputs[0],t.perm))},Ji=e=>m({perm:e.perm})}),kt,ea,ke,Et,Ta,Dt,qr,Qe,mt,fi,gt,ta,Ea,Pt,Ut,dr,Xe,We,Ct,Ia,ka,cc=C(()=>{ue(),ie(),te(),an(),at(),kt={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate * candidate",logSumExp:"bestValue + exp(candidate)",l1:"bestValue + abs(candidate)",l2:"bestValue + candidate * candidate",logSum:"bestValue + candidate"},ea={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate",logSumExp:"bestValue + candidate",l1:"bestValue + candidate",l2:"bestValue + candidate",logSum:"bestValue + candidate"},ke={max:"_A[offset]",min:"_A[offset]",mean:"0",sum:"0",prod:"1",sumSquare:"0",logSumExp:"0",l1:"0",l2:"0",logSum:"0"},Et={max:"bestValue",min:"bestValue",sum:"bestValue",prod:"bestValue",sumSquare:"bestValue",logSumExp:"log(bestValue)",l1:"bestValue",l2:"sqrt(bestValue)",logSum:"log(bestValue)"},Ta=(e,t)=>{let r=[];for(let i=t-e;i<t;++i)r.push(i);return r},Dt=(e,t)=>{let r=[],i=e.length;for(let n=0;n<i;n++)t.indexOf(n)===-1&&r.push(e[n]);let a=t.map(n=>e[n]);return[r,a]},qr=(e,t)=>{let r=e.length+t.length,i=[],a=0;for(let n=0;n<r;n++)t.indexOf(n)===-1?i.push(e[a++]):i.push(1);return i},Qe=(e,t)=>{for(let r=0;r<e.length;++r)if(e[e.length-r-1]!==t-1-r)return!1;return!0},mt=(e,t)=>{let r=[];if(!Qe(e,t)){for(let i=0;i<t;++i)e.indexOf(i)===-1&&r.push(i);e.forEach(i=>r.push(i))}return r},fi=(e,t,r,i,a,n,s)=>{let o=r[0].dims,u=M.size(n),l=M.size(s),d=z("_A",r[0].dataType,o),p=F("output",a,n),h=64;u===1&&(h=256);let f=`
          var<workgroup> aBestValues : array<f32, ${h}>;
       `,g=y=>`
        ${y.registerUniform("reduceSize","u32").declareVariables(d,p)}
        ${f}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${y.mainStart(h)}

          let outputIndex = global_idx / ${h};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${ke[i]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${h}) {
           let candidate = f32(${d.getByOffset("offset + k")});
           bestValue = ${kt[i]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${h}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${ea[i]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${p.setByOffset("outputIndex",`${i==="mean"?`${p.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${p.type.storage}(${Et[i]})`}`)};
         }
        }`;return{name:e,shaderCache:{hint:`${t};${h}`,inputDependencies:["type"]},getShaderSource:g,getRunData:()=>({outputs:[{dims:n,dataType:a}],dispatchGroup:{x:u},programUniforms:[{type:12,data:l}]})}},gt=(e,t,r,i)=>{let a=e.inputs.length===1?r:rn(e.inputs,r),n=a.axes;n.length===0&&!a.noopWithEmptyAxes&&(n=e.inputs[0].dims.map((f,g)=>g));let s=M.normalizeAxes(n,e.inputs[0].dims.length),o=s,u=e.inputs[0],l=mt(o,e.inputs[0].dims.length);l.length>0&&(u=e.compute(ft(e.inputs[0],l),{inputs:[0],outputs:[-1]})[0],o=Ta(o.length,u.dims.length));let[d,p]=Dt(u.dims,o),h=d;a.keepDims&&(h=qr(d,s)),e.compute(fi(t,a.cacheKey,[u],i,e.inputs[0].dataType,h,p),{inputs:[u]})},ta=(e,t)=>{gt(e,"ReduceMeanShared",t,"mean")},Ea=(e,t)=>{gt(e,"ReduceL1Shared",t,"l1")},Pt=(e,t)=>{gt(e,"ReduceL2Shared",t,"l2")},Ut=(e,t)=>{gt(e,"ReduceLogSumExpShared",t,"logSumExp")},dr=(e,t)=>{gt(e,"ReduceMaxShared",t,"max")},Xe=(e,t)=>{gt(e,"ReduceMinShared",t,"min")},We=(e,t)=>{gt(e,"ReduceProdShared",t,"prod")},Ct=(e,t)=>{gt(e,"ReduceSumShared",t,"sum")},Ia=(e,t)=>{gt(e,"ReduceSumSquareShared",t,"sumSquare")},ka=(e,t)=>{gt(e,"ReduceLogSumShared",t,"logSum")}}),Nt,ps,Ca,rn,Lt,cs,hs,fs,ms,gs,ys,ws,_s,bs,$s,Vt,vs,xs,Ss,Ts,Es,Is,ks,Cs,zs,As,an=C(()=>{ue(),ie(),b(),te(),cc(),Nt=e=>{if(!e||e.length===0||e.length>2)throw new Error("Reduce op requires 1 or 2 inputs.");if(e.length===2&&e[1].dims.length!==1)throw new Error("Invalid axes input dims.")},ps=e=>["","",`var value = ${e.getByIndices("input_indices")};`,""],Ca=(e,t,r,i,a,n,s=!1,o=!1)=>{let u=[],l=r[0].dims,d=l.length,p=M.normalizeAxes(a,d),h=!o&&p.length===0;l.forEach((y,$)=>{h||p.indexOf($)>=0?s&&u.push(1):u.push(y)});let f=u.length,g=M.size(u);return{name:e,shaderCache:t,getShaderSource:y=>{let $=[],_=z("_A",r[0].dataType,d),w=F("output",n,f),S=i(_,w,p),x=S[2];for(let k=0,B=0;k<d;k++)h||p.indexOf(k)>=0?(s&&B++,x=`for(var j${k}: u32 = 0; j${k} < ${l[k]}; j${k}++) {
                  ${S[2].includes("last_index")?`let last_index = j${k};`:""}
                  ${_.indicesSet("input_indices",k,`j${k}`)}
                  ${x}
                }`):($.push(`${_.indicesSet("input_indices",k,w.indicesGet("output_indices",B))};`),B++);return`

        ${y.registerUniform("output_size","u32").declareVariables(_,w)}

        ${y.mainStart()}
          ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${_.type.indices};
          let output_indices = ${w.offsetToIndices("global_idx")};

          ${$.join(`
`)}
          ${S[0]}       // init ops for reduce max/min
          ${S[1]}
          ${x}
          ${S[3]}
          ${S.length===4?w.setByOffset("global_idx","value"):S.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:u,dataType:n}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:[{type:12,data:g},...I(l,u)]})}},rn=(e,t)=>{let r=[];return e[1].dims[0]>0&&e[1].getBigInt64Array().forEach(i=>r.push(Number(i))),m({axes:r,keepDims:t.keepDims,noopWithEmptyAxes:t.noopWithEmptyAxes})},Lt=(e,t,r,i)=>{let a=e.inputs,n=a.length===1?r:rn(a,r);e.compute(Ca(t,{hint:n.cacheKey,inputDependencies:["rank"]},[a[0]],n.noopWithEmptyAxes&&n.axes.length===0?ps:i,n.axes,a[0].dataType,n.keepDims,n.noopWithEmptyAxes),{inputs:[0]})},cs=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceLogSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,"value = log(value);"])},hs=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceL1",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += abs(${r.getByIndices("input_indices")});`,""])},fs=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceL2",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += (t * t);`,"value = sqrt(value);"])},ms=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceLogSumExp",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += exp(${r.getByIndices("input_indices")});`,"value = log(value);"])},gs=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceMax",t,(r,i,a)=>{let n=[];for(let s=0;s<r.rank;s++)(a.indexOf(s)>=0||a.length===0)&&n.push(r.indicesSet("input_indices",s,0));return[`${n.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = max(value, ${r.getByIndices("input_indices")});`,""]})},ys=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceMean",t,(r,i,a)=>{let n=1;for(let s=0;s<r.rank;s++)(a.indexOf(s)>=0||a.length===0)&&(n*=e.inputs[0].dims[s]);return["var sum = f32(0);","",`sum += f32(${r.getByIndices("input_indices")});`,`let value = ${i.type.value}(sum / ${n});`]})},ws=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceMin",t,(r,i,a)=>{let n=[];for(let s=0;s<r.rank;s++)(a.indexOf(s)>=0||a.length===0)&&n.push(`input_indices[${s}] = 0;`);return[`${n.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = min(value, ${r.getByIndices("input_indices")});`,""]})},_s=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceProd",t,(r,i)=>[`var value = ${i.type.storage}(1);`,"",`value *= ${r.getByIndices("input_indices")};`,""])},bs=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,""])},$s=(e,t)=>{Nt(e.inputs),Lt(e,"ReduceSumSquare",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += t * t;`,""])},Vt=(e,t,r)=>{if(t.length===0)return r;let i=1,a=1;for(let n=0;n<t.length;n++)t.indexOf(n)===-1?i*=e[n]:a*=e[n];return a<32&&i>1024},vs=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?ys(e,t):ta(e,t)},xs=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?hs(e,t):Ea(e,t)},Ss=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?fs(e,t):Pt(e,t)},Ts=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?ms(e,t):Ut(e,t)},Es=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?gs(e,t):dr(e,t)},Is=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?ws(e,t):Xe(e,t)},ks=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?_s(e,t):We(e,t)},Cs=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?bs(e,t):Ct(e,t)},zs=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?$s(e,t):Ia(e,t)},As=(e,t)=>{Vt(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?cs(e,t):ka(e,t)}}),nn,Os,Rs,sn,hc=C(()=>{ue(),b(),an(),nn=e=>{if(!e||e.length===0||e.length>2)throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");if(e[0].dataType!==1)throw new Error("Invalid input type.")},Os=(e,t)=>{nn(e.inputs);let r=(i,a,n)=>{let s=[];for(let o=0;o<i.rank;o++)(n.indexOf(o)>=0||n.length===0)&&s.push(`input_indices[${o}] = 0;`);return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?"<=":"<"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Ca("ArgMin",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},Rs=(e,t)=>{nn(e.inputs);let r=(i,a,n)=>{let s=[];for(let o=0;o<i.rank;o++)(n.indexOf(o)>=0||n.length===0)&&s.push(`input_indices[${o}] = 0;`);return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?">=":">"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Ca("argMax",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},sn=e=>m(e)}),Bs,za,Ms,Ds,Ps,ra,Us,Ns,on=C(()=>{ue(),ie(),ui(),te(),Bs=(e,t)=>{let r=e[0],i=e[1],a=e[2],n=e[3],s=e[4],o=e[5];if(s&&o)throw new Error("Attention cannot have both past and attention_bias");if(r.dims.length!==3)throw new Error('Input "input" must have 3 dimensions');let u=r.dims[0],l=r.dims[1],d=r.dims[2];if(a.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimensions');if(i.dims.length!==2)throw new Error('Input "weights" is expected to have 2 dimensions');if(i.dims[0]!==d)throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");if(a.dims[0]!==i.dims[1])throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');let p=a.dims[0]/3,h=p,f=h;if(t.qkvHiddenSizes.length>0){if(t.qkvHiddenSizes.length!==3)throw new Error("qkv_hidden_sizes attribute should have 3 elements");for(let S of t.qkvHiddenSizes)if(S%t.numHeads!==0)throw new Error("qkv_hidden_sizes should be divisible by num_heads");p=t.qkvHiddenSizes[0],h=t.qkvHiddenSizes[1],f=t.qkvHiddenSizes[2]}let g=l;if(p!==h)throw new Error("qkv_hidden_sizes first element should be same as the second");if(a.dims[0]!==p+h+f)throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');let y=0;if(s){if(h!==f)throw new Error('Input "past" expect k_hidden_size == v_hidden_size');if(s.dims.length!==5)throw new Error('Input "past" must have 5 dimensions');if(s.dims[0]!==2)throw new Error('Input "past" first dimension must be 2');if(s.dims[1]!==u)throw new Error('Input "past" second dimension must be batch_size');if(s.dims[2]!==t.numHeads)throw new Error('Input "past" third dimension must be num_heads');if(s.dims[4]!==h/t.numHeads)throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');t.pastPresentShareBuffer||(y=s.dims[3])}let $=g+y,_=-1,w=0;if(n)throw new Error("Mask not supported");if(s)throw new Error("past is not supported");if(o){if(o.dims.length!==4)throw new Error('Input "attention_bias" must have 4 dimensions');if(o.dims[0]!==u||o.dims[1]!==t.numHeads||o.dims[2]!==l||o.dims[3]!==$)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:u,sequenceLength:l,pastSequenceLength:y,kvSequenceLength:g,totalSequenceLength:$,maxSequenceLength:_,inputHiddenSize:d,hiddenSize:p,vHiddenSize:f,headSize:Math.floor(p/t.numHeads),vHeadSize:Math.floor(f/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:w,scale:t.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},za=(e,t,r)=>t&&e?`
      let total_sequence_length_input = u32(${t.getByOffset("0")});
      let present_sequence_length = max(total_sequence_length_input, uniforms.past_sequence_length);
      let is_subsequent_prompt: bool = sequence_length > 1 && sequence_length != total_sequence_length_input;
      let is_first_prompt: bool = is_subsequent_prompt == false && sequence_length == total_sequence_length_input;
      total_sequence_length = u32(${e==null?void 0:e.getByOffset("batchIdx")}) + 1;
      var past_sequence_length: u32 = 0;
      if (is_first_prompt == false) {
        past_sequence_length = total_sequence_length - sequence_length;
      }
       `:`
    ${r?"let past_sequence_length = uniforms.past_sequence_length":""};
    let present_sequence_length = total_sequence_length;
    `,Ms=(e,t,r,i,a,n,s,o)=>{let u=O(s?1:n),l=64,d=n/u;d<l&&(l=32);let p=Math.ceil(n/u/l),h=[{type:12,data:t},{type:12,data:r},{type:12,data:i},{type:12,data:a},{type:12,data:d},{type:12,data:p}],f=A(e.dataType,u),g=E(1,u),y=["type"];s&&y.push("type"),o&&y.push("type");let $=_=>{let w=F("x",e.dataType,e.dims,u),S=[w],x=s?z("seq_lens",s.dataType,s.dims):void 0;x&&S.push(x);let k=o?z("total_sequence_length_input",o.dataType,o.dims):void 0;k&&S.push(k);let B=E(e.dataType),D=[{name:"batch_size",type:"u32"},{name:"num_heads",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"sequence_length",type:"u32"},{name:"total_sequence_length",type:"u32"},{name:"elements_per_thread",type:"u32"}];return`
  var<workgroup> thread_max: array<f32, ${l}>;
  var<workgroup> thread_sum: array<f32, ${l}>;
  ${_.registerUniforms(D).declareVariables(...S)}
  ${_.mainStart([l,1,1])}
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let sequence_length = uniforms.sequence_length;
    var total_sequence_length = uniforms.total_sequence_length;
    ${za(x,k,!1)}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${l}) * uniforms.total_sequence_length + local_offset;
    let seq_causal_length = ${s?"u32(past_sequence_length + workgroup_id.y + 1)":"total_sequence_length"};
    var thread_max_vector = ${g}(-3.4028234663852886e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      thread_max_vector = max(${g}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(u){case 1:return"thread_max_vector";case 2:return"max(thread_max_vector.x, thread_max_vector.y)";case 4:return"max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";default:throw new Error(`Unsupported components: ${u}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.4028234663852886e+38f);
    for (var i = 0u; i < ${l}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${g}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      sum_vector += exp(${g}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(u){case 1:return"sum_vector";case 2:return"sum_vector.x + sum_vector.y";case 4:return"sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";default:throw new Error(`Unsupported components: ${u}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${l}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        x[offset + i] = ${w.type.value}(${B}(1.0) / ${B}(seq_causal_length));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        var f32input = ${g}(x[offset + i]);
        x[offset + i] = ${w.type.value}(exp(f32input - max_value) / sum);
      }
    }
      ${s?`
        for (var total_seq_id: u32 = seq_causal_length; total_seq_id + local_offset < uniforms.total_sequence_length; total_seq_id++) {
          x[offset + total_seq_id] = ${w.type.value}(${B}(0));
        }`:""};
  }`};return{name:"AttentionProbsSoftmax",shaderCache:{hint:`${l};${f};${u}`,inputDependencies:y},getShaderSource:$,getRunData:()=>({outputs:[],dispatchGroup:{x:1,y:a,z:t*r},programUniforms:h})}},Ds=(e,t,r,i,a,n,s,o,u)=>{let l=s+n.kvSequenceLength,d=[n.batchSize,n.numHeads,n.sequenceLength,l],p=e>1&&i,h=n.kvNumHeads?n.kvNumHeads:n.numHeads,f=p?[n.batchSize,h,l,n.headSize]:void 0,g=n.nReps?n.nReps:1,y=n.scale===0?1/Math.sqrt(n.headSize):n.scale,$=O(n.headSize),_=n.headSize/$,w=12,S={x:Math.ceil(l/w),y:Math.ceil(n.sequenceLength/w),z:n.batchSize*n.numHeads},x=[{type:12,data:n.sequenceLength},{type:12,data:_},{type:12,data:l},{type:12,data:n.numHeads},{type:12,data:n.headSize},{type:1,data:y},{type:12,data:s},{type:12,data:n.kvSequenceLength},{type:12,data:g}],k=p&&i&&M.size(i.dims)>0,B=["type","type"];k&&B.push("type"),a&&B.push("type"),o&&B.push("type"),u&&B.push("type");let D=[{dims:d,dataType:t.dataType,gpuDataType:0}];p&&D.push({dims:f,dataType:t.dataType,gpuDataType:0});let P=L=>{let j=z("q",t.dataType,t.dims,$),oe=z("key",r.dataType,r.dims,$),X=[j,oe];if(k){let H=z("past_key",i.dataType,i.dims,$);X.push(H)}a&&X.push(z("attention_bias",a.dataType,a.dims));let ne=o?z("seq_lens",o.dataType,o.dims):void 0;ne&&X.push(ne);let Ce=u?z("total_sequence_length_input",u.dataType,u.dims):void 0;Ce&&X.push(Ce);let Ae=F("output",t.dataType,d),J=[Ae];p&&J.push(F("present_key",t.dataType,f,$));let ge=E(1,$),Ve=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"alpha",type:"f32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${w}u;

  var<workgroup> tileQ: array<${j.type.storage}, ${w*w}>;
  var<workgroup> tileK: array<${j.type.storage}, ${w*w}>;
  ${L.registerUniforms(Ve).declareVariables(...X,...J)}
  ${L.mainStart([w,w,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let kvHeadIdx = ${g===1?"headIdx":"headIdx / uniforms.n_reps"};
    let kv_num_heads = ${g===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let sequence_length = uniforms.M;
    var total_sequence_length = uniforms.N;
    ${za(ne,Ce,!0)}
    let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx;
    let qOffset = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
    ${k&&p?"let pastKeyOffset = absKvHeadIdx * uniforms.past_sequence_length * uniforms.K;":""};
    let kOffset = absKvHeadIdx * uniforms.kv_sequence_length * uniforms.K;
    ${p?"let presentKeyOffset = absKvHeadIdx * uniforms.N * uniforms.K;":""}
    var value = ${ge}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${k&&p?`
              if (n + local_id.y < past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else if (n + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
                tileK[idx] = key[kOffset + (n + local_id.y - past_sequence_length) * uniforms.K + w + local_id.x];
              }`:`
          if (n + local_id.y < uniforms.kv_sequence_length) {
            tileK[idx] = key[kOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
          }`}
      ${p?`if (n + local_id.y < present_sequence_length) {
        present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];
      }`:""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
          value += ${ge}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    if (global_id.y < uniforms.M && global_id.x < total_sequence_length) {
      let headOffset = workgroup_id.z * uniforms.M * uniforms.N;
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch($){case 1:return"value";case 2:return"value.x + value.y";case 4:return"value.x + value.y + value.z + value.w";default:throw new Error(`Unsupported components: ${$}`)}})()};
        output[outputIdx] = ${Ae.type.value} (sum * uniforms.alpha) + ${a?"attention_bias[outputIdx]":"0.0"};
    }
  }`};return{name:"AttentionProbs",shaderCache:{hint:`${$};${a!==void 0};${i!==void 0};${e}`,inputDependencies:B},getRunData:()=>({outputs:D,dispatchGroup:S,programUniforms:x}),getShaderSource:P}},Ps=(e,t,r,i,a,n,s=void 0,o=void 0)=>{let u=n+a.kvSequenceLength,l=a.nReps?a.nReps:1,d=a.vHiddenSize*l,p=e>1&&i,h=a.kvNumHeads?a.kvNumHeads:a.numHeads,f=p?[a.batchSize,h,u,a.headSize]:void 0,g=[a.batchSize,a.sequenceLength,d],y=12,$={x:Math.ceil(a.vHeadSize/y),y:Math.ceil(a.sequenceLength/y),z:a.batchSize*a.numHeads},_=[{type:12,data:a.sequenceLength},{type:12,data:u},{type:12,data:a.vHeadSize},{type:12,data:a.numHeads},{type:12,data:a.headSize},{type:12,data:d},{type:12,data:n},{type:12,data:a.kvSequenceLength},{type:12,data:l}],w=p&&i&&M.size(i.dims)>0,S=["type","type"];w&&S.push("type"),s&&S.push("type"),o&&S.push("type");let x=[{dims:g,dataType:t.dataType,gpuDataType:0}];p&&x.push({dims:f,dataType:t.dataType,gpuDataType:0});let k=B=>{let D=z("probs",t.dataType,t.dims),P=z("v",r.dataType,r.dims),L=[D,P];w&&L.push(z("past_value",i.dataType,i.dims));let j=s?z("seq_lens",s.dataType,s.dims):void 0;s&&L.push(j);let oe=o?z("total_sequence_length_input",o.dataType,o.dims):void 0;o&&L.push(oe);let X=[F("output",t.dataType,g)];p&&X.push(F("present_value",t.dataType,f));let ne=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"v_hidden_size",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${y}u;
  var<workgroup> tileQ: array<${D.type.value}, ${y*y}>;
  var<workgroup> tileV: array<${D.type.value}, ${y*y}>;
  ${B.registerUniforms(ne).declareVariables(...L,...X)}
  ${B.mainStart([y,y,1])}
   let headIdx = workgroup_id.z % uniforms.num_heads;
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let kvHeadIdx = ${l===1?"headIdx":"headIdx / uniforms.n_reps"};
   let kv_num_heads = ${l===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
   let m = global_id.y;
   let n = global_id.x;
   let sequence_length = uniforms.M;
   var total_sequence_length = uniforms.K;
   ${za(j,oe,!0)}
   let offsetA = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
   let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx; // kvHeadIdx is relative to the batch
   ${w&&p?"let pastValueOffset = absKvHeadIdx * uniforms.N * uniforms.past_sequence_length + n;":""};
   let vOffset = absKvHeadIdx * uniforms.N * uniforms.kv_sequence_length + n;
   ${p?"let presentValueOffset = absKvHeadIdx * uniforms.N * uniforms.K + n;":""}
   var value = ${D.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${w&&p?`
        if (w + local_id.y < past_sequence_length) {
          tileV[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else if (w + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
          tileV[idx] = v[vOffset + (w + local_id.y - past_sequence_length) * uniforms.N];
        }
      `:`
            if (w + local_id.y < uniforms.kv_sequence_length) {
              tileV[idx] = v[vOffset + (w + local_id.y) * uniforms.N];
            }`}
        ${p?`
            if (w + local_id.y < present_sequence_length) {
          present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileV[idx];
        }`:""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < total_sequence_length; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileV[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + headIdx * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`};return{name:"AttentionScore",shaderCache:{hint:`${i!==void 0};${e}`,inputDependencies:S},getRunData:()=>({outputs:x,dispatchGroup:$,programUniforms:_}),getShaderSource:k}},ra=(e,t,r,i,a,n,s,o,u,l,d=void 0,p=void 0)=>{let h=Math.min(e.outputCount,1+(s?1:0)+(o?1:0)),f=h>1?l.pastSequenceLength:0,g=f+l.kvSequenceLength,y=u&&M.size(u.dims)>0?u:void 0,$=[t,r];h>1&&s&&M.size(s.dims)>0&&$.push(s),y&&$.push(y),d&&$.push(d),p&&$.push(p);let _=e.compute(Ds(h,t,r,s,y,l,f,d,p),{inputs:$,outputs:h>1?[-1,1]:[-1]})[0];e.compute(Ms(_,l.batchSize,l.numHeads,f,l.sequenceLength,g,d,p),{inputs:d&&p?[_,d,p]:[_],outputs:[]});let w=[_,i];h>1&&o&&M.size(o.dims)>0&&w.push(o),d&&w.push(d),p&&w.push(p),e.compute(Ps(h,_,i,o,l,f,d,p),{inputs:w,outputs:h>1?[0,2]:[0]})},Us=(e,t)=>{let r=[t.batchSize,t.numHeads,t.sequenceLength,t.headSize],i=t.sequenceLength,a=t.inputHiddenSize,n=t.headSize,s=12,o={x:Math.ceil(t.headSize/s),y:Math.ceil(t.sequenceLength/s),z:t.batchSize*t.numHeads},u=[e.inputs[0],e.inputs[1],e.inputs[2]],l=[{type:12,data:i},{type:12,data:a},{type:12,data:n},{type:12,data:t.numHeads},{type:12,data:t.headSize},{type:12,data:t.hiddenSize},{type:12,data:t.hiddenSize+t.hiddenSize+t.vHiddenSize}],d=p=>{let h=F("output_q",u[0].dataType,r),f=F("output_k",u[0].dataType,r),g=F("output_v",u[0].dataType,r),y=z("input",u[0].dataType,u[0].dims),$=z("weight",u[1].dataType,u[1].dims),_=z("bias",u[2].dataType,u[2].dims),w=y.type.storage,S=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"hidden_size",type:"u32"},{name:"ldb",type:"u32"}];return`
  const TILE_SIZE = ${s}u;
  var<workgroup> tileInput: array<${w}, ${s*s}>;
  var<workgroup> tileWeightQ: array<${w}, ${s*s}>;
  var<workgroup> tileWeightK: array<${w}, ${s*s}>;
  var<workgroup> tileWeightV: array<${w}, ${s*s}>;
  ${p.registerUniforms(S).declareVariables(y,$,_,h,f,g)}
  ${p.mainStart([s,s,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${w}(0);
    var valueK = ${w}(0);
    var valueV = ${w}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`};return e.compute({name:"AttentionPrepare",shaderCache:{inputDependencies:["type","type","type"]},getRunData:()=>({outputs:[{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0}],dispatchGroup:o,programUniforms:l}),getShaderSource:d},{inputs:u,outputs:[-1,-1,-1]})},Ns=(e,t)=>{let r=Bs(e.inputs,t),[i,a,n]=Us(e,r);return ra(e,i,a,n,e.inputs[4],void 0,void 0,void 0,e.inputs[5],r)}}),Ls,Vs,qs,Fs,fc=C(()=>{et(),ue(),ie(),b(),te(),Ls=(e,t)=>{if(!e||e.length!==5)throw new Error("BatchNormalization requires 5 inputs");let r=(i,a,n)=>{let s=a.length;if(s!==i.length)throw new Error(`${n}: num dimensions != ${s}`);a.forEach((o,u)=>{if(o!==i[u])throw new Error(`${n}: dim[${u}] do not match`)})};if(e[0].dims.length>1){let i=t.format==="NHWC"?t.spatial?e[0].dims.slice(-1):e[0].dims.slice(-1).concat(e[0].dims.slice(1,e[0].dims.length-1)):e[0].dims.slice(1,t.spatial?2:void 0);r(e[1].dims,i,"Invalid input scale"),r(e[2].dims,i,"Invalid input B"),r(e[3].dims,i,"Invalid input mean"),r(e[4].dims,i,"Invalid input var")}else r(e[1].dims,[1],"Invalid input scale"),r(e[2].dims,[1],"Invalid input B"),r(e[3].dims,[1],"Invalid input mean"),r(e[4].dims,[1],"Invalid input var")},Vs=(e,t)=>{let{epsilon:r,spatial:i,format:a}=t,n=e[0].dims,s=i?O(n[n.length-1]):1,o=a==="NHWC"&&n.length>1?s:1,u=M.size(n)/s,l=i,d=l?n.length:n,p=z("x",e[0].dataType,e[0].dims,s),h=z("scale",e[1].dataType,e[1].dims,o),f=z("bias",e[2].dataType,e[2].dims,o),g=z("inputMean",e[3].dataType,e[3].dims,o),y=z("inputVar",e[4].dataType,e[4].dims,o),$=F("y",e[0].dataType,d,s),_=()=>{let S="";if(i)S=`let cOffset = ${n.length===1?"0u":a==="NHWC"?`outputIndices[${n.length-1}] / ${s}`:"outputIndices[1]"};`;else if(a==="NCHW")S=`
            ${$.indicesSet("outputIndices","0","0")}
            let cOffset = ${$.indicesToOffset("outputIndices")};`;else{S=`var cIndices = ${h.type.indices}(0);
                       cIndices[0] = outputIndices[${n.length-1}];`;for(let x=1;x<h.rank;x++)S+=`cIndices[${x}] = outputIndices[${x}];`;S+=`let cOffset = ${h.indicesToOffset("cIndices")};`}return S},w=S=>`
  const epsilon = ${r};
  ${S.registerUniform("outputSize","u32").declareVariables(p,h,f,g,y,$)}
  ${S.mainStart()}
  ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${$.offsetToIndices(`global_idx * ${s}`)};
    ${_()}
    let scale = ${h.getByOffset("cOffset")};
    let bias = ${f.getByOffset("cOffset")};
    let inputMean = ${g.getByOffset("cOffset")};
    let inputVar = ${y.getByOffset("cOffset")};
    let x = ${p.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${$.setByOffset("global_idx","value")}
  }`;return{name:"BatchNormalization",shaderCache:{hint:`${t.epsilon}_${t.format}_${i}_${s}`,inputDependencies:l?["rank","type","type","type","type"]:void 0},getShaderSource:w,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l?[{type:12,data:u},...I(n)]:[{type:12,data:u}]})}},qs=e=>m(e),Fs=(e,t)=>{let{inputs:r,outputCount:i}=e,a=qs({...t,outputCount:i});if(ee.webgpu.validateInputContent&&Ls(r,a),t.trainingMode)throw new Error("BatchNormalization trainingMode is not supported yet.");e.compute(Vs(r,a))}}),Ws,Gs,js,mc=C(()=>{ie(),te(),Ws=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![320,640,1280].includes(e[0].dims[2]))throw new Error("number of channels should be 320, 640 or 1280");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Gs=e=>{let t=e[0].dims,r=e[0].dims[2],i=M.size(t)/4,a=e[0].dataType,n=z("input",a,t,4),s=z("bias",a,[r],4),o=z("residual",a,t,4),u=F("output",a,t,4);return{name:"BiasAdd",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(i/64)}}),getShaderSource:l=>`
  const channels = ${r}u / 4;
  ${l.declareVariables(n,s,o,u)}

  ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes(i)}
    let value = ${n.getByOffset("global_idx")}
      + ${s.getByOffset("global_idx % channels")} + ${o.getByOffset("global_idx")};
    ${u.setByOffset("global_idx","value")}
  }`}},js=e=>{Ws(e.inputs),e.compute(Gs(e.inputs))}}),Hs,Be,Ks,Zs,Qs,Xs,Ys,Js,eo,to,ro,io,ao,no,so,oo,ia,uo,Aa,lo,po,co,ho,fo,mo,go,yo,wo,_o,bo,$o,vo,xo,So,To,un,Eo,ln,dn,Io,ko,Co,zo,Ao,Oo,pn=C(()=>{ue(),ie(),b(),te(),Hs=(e,t,r,i,a,n,s)=>{let o=Math.ceil(t/4),u="";typeof a=="string"?u=`${a}(a)`:u=a("a");let l=z("inputData",r,[o],4),d=F("outputData",i,[o],4),p=[{name:"vec_size",type:"u32"}];return s&&p.push(...s),`
      ${e.registerUniforms(p).declareVariables(l,d)}

  ${n??""}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${l.getByOffset("global_idx")};
    ${d.setByOffset("global_idx",u)}
  }`},Be=(e,t,r,i,a,n=e.dataType,s,o)=>{let u=[{type:12,data:Math.ceil(M.size(e.dims)/4)}];return s&&u.push(...s),{name:t,shaderCache:{hint:a,inputDependencies:["type"]},getShaderSource:l=>Hs(l,M.size(e.dims),e.dataType,n,r,i,o),getRunData:l=>({outputs:[{dims:e.dims,dataType:n}],dispatchGroup:{x:Math.ceil(M.size(l[0].dims)/64/4)},programUniforms:u})}},Ks=e=>{e.compute(Be(e.inputs[0],"Abs","abs"))},Zs=e=>{e.compute(Be(e.inputs[0],"Acos","acos"))},Qs=e=>{e.compute(Be(e.inputs[0],"Acosh","acosh"))},Xs=e=>{e.compute(Be(e.inputs[0],"Asin","asin"))},Ys=e=>{e.compute(Be(e.inputs[0],"Asinh","asinh"))},Js=e=>{e.compute(Be(e.inputs[0],"Atan","atan"))},eo=e=>{e.compute(Be(e.inputs[0],"Atanh","atanh"))},to=e=>m(e),ro=(e,t)=>{let r;switch(t.to){case 10:r="vec4<f16>";break;case 1:r="vec4<f32>";break;case 12:r="vec4<u32>";break;case 6:r="vec4<i32>";break;case 9:r="vec4<bool>";break;default:throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`)}e.compute(Be(e.inputs[0],"Cast",r,void 0,t.cacheKey,t.to))},io=e=>{let t,r,i=e.length>=2&&e[1].data!==0,a=e.length>=3&&e[2].data!==0;switch(e[0].dataType){case 1:t=i?e[1].getFloat32Array()[0]:-34028234663852886e22,r=a?e[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:t=i?e[1].getUint16Array()[0]:64511,r=a?e[2].getUint16Array()[0]:31743;break;default:throw new Error("Unsupport data type")}return m({min:t,max:r})},ao=(e,t)=>{let r=t||io(e.inputs),i=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"Clip",a=>`clamp(${a}, vec4<${i}>(uniforms.min), vec4<${i}>(uniforms.max))`,void 0,r.cacheKey,void 0,[{type:e.inputs[0].dataType,data:r.min},{type:e.inputs[0].dataType,data:r.max}],[{name:"min",type:i},{name:"max",type:i}]),{inputs:[0]})},no=e=>{e.compute(Be(e.inputs[0],"Ceil","ceil"))},so=e=>{e.compute(Be(e.inputs[0],"Cos","cos"))},oo=e=>{e.compute(Be(e.inputs[0],"Cosh","cosh"))},ia=e=>m(e),uo=(e,t)=>{let r=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"Elu",i=>`elu_vf32(${i})`,`
  const elu_alpha_ = ${r}(${t.alpha});

  fn elu_f32(a: ${r}) -> ${r} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${r}>) -> vec4<${r}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,t.cacheKey))},Aa=(e="f32")=>`
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,lo=e=>{let t=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"Erf",r=>`erf_vf32(${r})`,Aa(t)))},po=e=>{e.compute(Be(e.inputs[0],"Exp","exp"))},co=e=>{e.compute(Be(e.inputs[0],"Floor","floor"))},ho=e=>{let t=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"Gelu",r=>`0.5 * ${r} * (1.0 + erf_vf32(${r} * 0.7071067811865475))`,Aa(t)))},fo=(e,t)=>{let r=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"LeakyRelu",i=>`select(leaky_relu_alpha_ * ${i}, ${i}, ${i} >= vec4<${r}>(0.0))`,`const leaky_relu_alpha_ = ${r}(${t.alpha});`,t.cacheKey))},mo=e=>{e.compute(Be(e.inputs[0],"Not",t=>`!${t}`))},go=e=>{e.compute(Be(e.inputs[0],"Neg",t=>`-${t}`))},yo=e=>{e.compute(Be(e.inputs[0],"Reciprocal",t=>`1.0/${t}`))},wo=e=>{let t=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"Relu",r=>`select(vec4<${t}>(0.0), ${r}, ${r} > vec4<${t}>(0.0))`))},_o=e=>{e.compute(Be(e.inputs[0],"Sigmoid",t=>`(1.0 / (1.0 + exp(-${t})))`))},bo=e=>m(e),$o=(e,t)=>{let r=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"HardSigmoid",i=>`max(vec4<${r}>(0.0), min(vec4<${r}>(1.0), ${t.alpha} * ${i} + vec4<${r}>(${t.beta})))`,void 0,t.cacheKey))},vo=e=>{e.compute(Be(e.inputs[0],"Sin","sin"))},xo=e=>{e.compute(Be(e.inputs[0],"Sinh","sinh"))},So=e=>{e.compute(Be(e.inputs[0],"Sqrt","sqrt"))},To=e=>{e.compute(Be(e.inputs[0],"Tan","tan"))},un=e=>`sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`,Eo=e=>{e.compute(Be(e.inputs[0],"Tanh",un))},ln=(e="f32")=>`
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${un("v")};
}
`,dn=e=>`(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`,Io=e=>{let t=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"FastGelu",dn,ln(t),void 0,e.inputs[0].dataType))},ko=(e,t)=>{let r=E(e.inputs[0].dataType);return e.compute(Be(e.inputs[0],"ThresholdedRelu",i=>`select(vec4<${r}>(0.0), ${i}, ${i} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${r}>(${t.alpha});`,t.cacheKey)),0},Co=e=>{e.compute(Be(e.inputs[0],"Log","log"))},zo=(e,t)=>`
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,Ao=e=>`quick_gelu_impl(${e})`,Oo=(e,t)=>{let r=E(e.inputs[0].dataType);e.compute(Be(e.inputs[0],"QuickGelu",Ao,zo(r,t.alpha),t.cacheKey,e.inputs[0].dataType))}}),Ro,Bo,Mo,gc=C(()=>{ie(),te(),pn(),Ro=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![2560,5120,10240].includes(e[0].dims[2]))throw new Error("hidden state should be 2560, 5120 or 10240");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Bo=e=>{let t=e[0].dims.slice();t[2]=t[2]/2;let r=z("input",e[0].dataType,e[0].dims,4),i=z("bias",e[0].dataType,[e[0].dims[2]],4),a=F("output",e[0].dataType,t,4),n=M.size(t)/4,s=A(e[0].dataType);return{name:"BiasSplitGelu",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(n/64)}}),getShaderSource:o=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2]/4/2}u;

  ${o.declareVariables(r,i,a)}

  ${Aa(s)}

  ${o.mainStart()}
    ${o.guardAgainstOutOfBoundsWorkgroupSizes(n)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${a.setByOffset("global_idx","valueLeft * geluRight")}
  }`}},Mo=e=>{Ro(e.inputs),e.compute(Bo(e.inputs))}}),Do,Po,qt,Uo,No,Lo,Vo,qo,Fo,Wo,Go,jo,Ho,yc=C(()=>{ue(),ie(),te(),Do=(e,t,r,i,a,n,s,o,u,l,d,p)=>{let h,f;typeof o=="string"?h=f=(w,S)=>`${o}((${w}),(${S}))`:typeof o=="function"?h=f=o:(h=o.scalar,f=o.vector);let g=F("outputData",d,i.length,4),y=z("aData",u,t.length,4),$=z("bData",l,r.length,4),_;if(a)if(n){let w=M.size(t)===1,S=M.size(r)===1,x=t.length>0&&t[t.length-1]%4===0,k=r.length>0&&r[r.length-1]%4===0;w||S?_=g.setByOffset("global_idx",f(w?`${y.type.value}(${y.getByOffset("0")}.x)`:y.getByOffset("global_idx"),S?`${$.type.value}(${$.getByOffset("0")}.x)`:$.getByOffset("global_idx"))):_=`
            let outputIndices = ${g.offsetToIndices("global_idx * 4u")};
            let offsetA = ${y.broadcastedIndicesToOffset("outputIndices",g)};
            let offsetB = ${$.broadcastedIndicesToOffset("outputIndices",g)};
            ${g.setByOffset("global_idx",f(s||x?y.getByOffset("offsetA / 4u"):`${y.type.value}(${y.getByOffset("offsetA / 4u")}[offsetA % 4u])`,s||k?$.getByOffset("offsetB / 4u"):`${$.type.value}(${$.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `}else _=g.setByOffset("global_idx",f(y.getByOffset("global_idx"),$.getByOffset("global_idx")));else{if(!n)throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");let w=(S,x,k="")=>{let B=`aData[indexA${x}][componentA${x}]`,D=`bData[indexB${x}][componentB${x}]`;return`
            let outputIndices${x} = ${g.offsetToIndices(`global_idx * 4u + ${x}u`)};
            let offsetA${x} = ${y.broadcastedIndicesToOffset(`outputIndices${x}`,g)};
            let offsetB${x} = ${$.broadcastedIndicesToOffset(`outputIndices${x}`,g)};
            let indexA${x} = offsetA${x} / 4u;
            let indexB${x} = offsetB${x} / 4u;
            let componentA${x} = offsetA${x} % 4u;
            let componentB${x} = offsetB${x} % 4u;
            ${S}[${x}] = ${k}(${h(B,D)});
          `};d===9?_=`
            var data = vec4<u32>(0);
            ${w("data",0,"u32")}
            ${w("data",1,"u32")}
            ${w("data",2,"u32")}
            ${w("data",3,"u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:_=`
            ${w("outputData[global_idx]",0)}
            ${w("outputData[global_idx]",1)}
            ${w("outputData[global_idx]",2)}
            ${w("outputData[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(y,$,g)}

        ${p??""}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${_}
      }`},Po=(e,t,r,i,a,n,s=r.dataType)=>{let o=r.dims.map(Number),u=i.dims.map(Number),l=!M.areEqual(o,u),d=o,p=M.size(o),h=!1,f=!1,g=[l];if(l){let y=jt.calcShape(o,u,!1);if(!y)throw new Error("Can't perform binary op on the given tensors");d=y.slice(),p=M.size(d);let $=M.size(o)===1,_=M.size(u)===1,w=o.length>0&&o[o.length-1]%4===0,S=u.length>0&&u[u.length-1]%4===0;g.push($),g.push(_),g.push(w),g.push(S);let x=1;for(let k=1;k<d.length;k++){let B=o[o.length-k],D=u[u.length-k];if(B===D)x*=B;else break}x%4===0?(f=!0,h=!0):($||_||w||S)&&(h=!0)}else h=!0;return g.push(h),{name:e,shaderCache:{hint:t+g.map(y=>y.toString()).join("_"),inputDependencies:["rank","rank"]},getShaderSource:y=>Do(y,o,u,d,h,l,f,a,r.dataType,i.dataType,s,n),getRunData:()=>({outputs:[{dims:d,dataType:s}],dispatchGroup:{x:Math.ceil(p/64/4)},programUniforms:[{type:12,data:Math.ceil(M.size(d)/4)},...I(o,u,d)]})}},qt=(e,t,r,i,a,n)=>{e.compute(Po(t,a??"",e.inputs[0],e.inputs[1],r,i,n))},Uo=e=>{qt(e,"Add",(t,r)=>`${t}+${r}`)},No=e=>{qt(e,"Div",(t,r)=>`${t}/${r}`)},Lo=e=>{qt(e,"Equal",{scalar:(t,r)=>`u32(${t}==${r})`,vector:(t,r)=>`vec4<u32>(${t}==${r})`},void 0,void 0,9)},Vo=e=>{qt(e,"Mul",(t,r)=>`${t}*${r}`)},qo=e=>{let t=z("input",e.inputs[0].dataType,e.inputs[0].dims).type.value;qt(e,"Pow",{scalar:(r,i)=>`pow_custom(${r},${i})`,vector:(r,i)=>`pow_vector_custom(${r},${i})`},`
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t==="i32"?"round":""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},Fo=e=>{qt(e,"Sub",(t,r)=>`${t}-${r}`)},Wo=e=>{qt(e,"Greater",{scalar:(t,r)=>`u32(${t}>${r})`,vector:(t,r)=>`vec4<u32>(${t}>${r})`},void 0,void 0,9)},Go=e=>{qt(e,"Less",{scalar:(t,r)=>`u32(${t}<${r})`,vector:(t,r)=>`vec4<u32>(${t}<${r})`},void 0,void 0,9)},jo=e=>{qt(e,"GreaterOrEqual",{scalar:(t,r)=>`u32(${t}>=${r})`,vector:(t,r)=>`vec4<u32>(${t}>=${r})`},void 0,void 0,9)},Ho=e=>{qt(e,"LessOrEqual",{scalar:(t,r)=>`u32(${t}<=${r})`,vector:(t,r)=>`vec4<u32>(${t}<=${r})`},void 0,void 0,9)}}),Ko,Zo,Qo,Xo,Yo,Jo,wc=C(()=>{ue(),ie(),b(),te(),Ko=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");let r=0,i=e[r],a=i.dataType,n=i.dims.length;e.forEach((s,o)=>{if(o!==r){if(s.dataType!==a)throw new Error("input tensors should be one type");if(s.dims.length!==n)throw new Error("input tensors should have the same shape");s.dims.forEach((u,l)=>{if(l!==t&&u!==i.dims[l])throw new Error("non concat dimensions must match")})}})},Zo=(e,t)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`,Qo=(e,t)=>{let r=e.length,i=[];for(let a=0;a<r;++a){let n=t.setByOffset("global_idx",e[a].getByIndices("indices"));r===1?i.push(n):a===0?i.push(`if (inputIndex == ${a}u) { ${n} }`):a===r-1?i.push(`else { ${n} }`):i.push(`else if (inputIndex == ${a}) { ${n} }`)}return i.join(`
`)},Xo=(e,t,r,i)=>{let a=M.size(r),n=new Array(e.length),s=new Array(e.length),o=0,u=[],l=[],d=[{type:12,data:a}];for(let y=0;y<e.length;++y)o+=e[y].dims[t],n[y]=o,l.push(e[y].dims.length),s[y]=z(`input${y}`,i,l[y]),u.push("rank"),d.push({type:12,data:n[y]});for(let y=0;y<e.length;++y)d.push(...I(e[y].dims));d.push(...I(r));let p=F("output",i,r.length),h=p.indicesGet("indices",t),f=Array.from(Array(n.length).keys()).map(y=>`uniforms.sizeInConcatAxis${y}`).join(","),g=y=>`

  ${(()=>{y.registerUniform("outputSize","u32");for(let $=0;$<e.length;$++)y.registerUniform(`sizeInConcatAxis${$}`,"u32");return y.declareVariables(...s,p)})()}

  ${Zo(n.length,f)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${p.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${h});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${n.length}u>(${f});
      ${h} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${Qo(s,p)}
  }`;return{name:"Concat",shaderCache:{hint:`${t}`,inputDependencies:u},getRunData:()=>({outputs:[{dims:r,dataType:i}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:d}),getShaderSource:g}},Yo=(e,t)=>{let r=e.inputs,i=r[0].dims,a=M.normalizeAxis(t.axis,i.length);Ko(r,a);let n=i.slice();n[a]=r.reduce((o,u)=>o+(u.dims.length>a?u.dims[a]:0),0);let s=r.filter(o=>M.size(o.dims)>0);e.compute(Xo(s,a,n,r[0].dataType),{inputs:s})},Jo=e=>m({axis:e.axis})}),Fr,Wr,Gr,cn,jr=C(()=>{ue(),ie(),Fr=(e,t,r="f32")=>{switch(e.activation){case"Relu":return`value = max(value, ${t}(0.0));`;case"Sigmoid":return`value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;case"Clip":return`value = clamp(value, ${t}(${r}(uniforms.clip_min)), ${t}(${r}(uniforms.clip_max)));`;case"HardSigmoid":return`value = max(${t}(0.0), min(${t}(1.0), ${r}(uniforms.alpha) * value + ${r}(uniforms.beta)));`;case"LeakyRelu":return`value = select(${r}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;case"Tanh":return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case"":return"";default:throw new Error(`Unsupported activation ${e.activation}`)}},Wr=(e,t)=>{e.activation==="Clip"?t.push({type:1,data:e.clipMax},{type:1,data:e.clipMin}):e.activation==="HardSigmoid"?t.push({type:1,data:e.alpha},{type:1,data:e.beta}):e.activation==="LeakyRelu"&&t.push({type:1,data:e.alpha})},Gr=(e,t)=>{e.activation==="Clip"?t.push({name:"clip_max",type:"f32"},{name:"clip_min",type:"f32"}):e.activation==="HardSigmoid"?t.push({name:"alpha",type:"f32"},{name:"beta",type:"f32"}):e.activation==="LeakyRelu"&&t.push({name:"alpha",type:"f32"})},cn=e=>{let t=(e==null?void 0:e.activation)||"";if(t==="HardSigmoid"){let[r,i]=(e==null?void 0:e.activation_params)||[.2,.5];return{activation:t,alpha:r,beta:i}}else if(t==="Clip"){let[r,i]=(e==null?void 0:e.activation_params)||[Wi,Bt];return{activation:t,clipMax:i,clipMin:r}}else if(t==="LeakyRelu"){let[r]=(e==null?void 0:e.activation_params)||[.01];return{activation:t,alpha:r}}return{activation:t}}}),st,eu,hn=C(()=>{st=(e,t)=>{switch(e){case 1:return t;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw new Error(`${e}-component is not supported.`)}},eu=e=>`
      ${e?"value = value + getBiasByOutputCoords(coords);":""}
      `}),tu,_c=C(()=>{tu=e=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`}),aa,fn,mn=C(()=>{ue(),ie(),te(),jr(),aa=(e,t,r,i,a)=>{let n=i-r;return`
      ${Array.from({length:r}).map((s,o)=>`
      if (${R(t.shape,o,t.rank)} != 1) {
        ${t.indicesSet(e,o,R(a,o+n,i))}
      } else {
        ${t.indicesSet(e,o,0)}
      }`).join("")}
`},fn=(e,t,r,i,a=!1,n)=>{let s=e[0].dims,o=e[1].dims,u=s[s.length-2],l=o[o.length-1],d=s[s.length-1],p=O(l),h=O(d),f=O(u),g=M.size(r)/p/f,y=e.length>2,$=i?i.slice(0,-2):r.slice(0,-2),_=[M.size($),u,l],w=[{type:12,data:g},{type:12,data:u},{type:12,data:l},{type:12,data:d}];Wr(t,w),w.push(...I($,s,o)),y&&w.push(...I(e[2].dims)),w.push(...I(_));let S=x=>{let k=ye("batch_dims",e[0].dataType,$.length),B=z("a",e[0].dataType,s.length,h),D=z("b",e[1].dataType,o.length,p),P=F("output",e[0].dataType,_.length,p),L=A(P.type.tensor),j=Fr(t,P.type.value,L),oe=[B,D],X="";if(y){let Ae=a?p:1;oe.push(z("bias",e[2].dataType,e[2].dims.length,Ae)),X=`${a?`value += bias[col / ${Ae}];`:`value += ${P.type.value}(bias[row + i]);`}`}let ne=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"}];Gr(t,ne);let Ce=()=>{let Ae=`var a_data: ${B.type.value};`;for(let J=0;J<h;J++)Ae+=`
              let b_data${J} = b[(b_offset + (k + ${J}) * uniforms.N + col) / ${p}];`;for(let J=0;J<f;J++){Ae+=`a_data = a[(a_offset + (row + ${J}) * uniforms.K + k) / ${h}];`;for(let ge=0;ge<h;ge++)Ae+=`
            values[${J}] = fma(${D.type.value}(a_data${h===1?"":`[${ge}]`}), b_data${ge}, values[${J}]);
`}return Ae};return`
  ${x.registerUniforms(ne).registerInternalVariables(k).declareVariables(...oe,P)}
  ${x.mainStart()}
    ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${p})) * ${p};
    var index1 = global_idx / (uniforms.N / ${p});
    let stride1 = uniforms.M / ${f};
    let row = (index1 % stride1) * ${f};
    let batch = index1 / stride1;

    ${r.length===2?"":`let batch_indices = ${k.offsetToIndices("batch")};`}

    var a_indices: ${B.type.indices};
    ${aa("a_indices",B,B.rank-2,k.rank,"batch_indices")}
    ${B.indicesSet("a_indices",B.rank-2,0)}
    ${B.indicesSet("a_indices",B.rank-1,0)}
    let a_offset = ${B.indicesToOffset("a_indices")};

    var b_indices: ${D.type.indices};
    ${aa("b_indices",D,D.rank-2,k.rank,"batch_indices")}
    ${D.indicesSet("b_indices",D.rank-2,0)}
    ${D.indicesSet("b_indices",D.rank-1,0)}
    let b_offset = ${D.indicesToOffset("b_indices")};
    var values: array<${P.type.value}, ${f}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${h}) {
      ${Ce()}
    }
    for (var i = 0u; i < ${f}u; i++) {
      var value = values[i];
      ${X}
      ${j}
      let cur_indices = ${P.type.indices}(batch, row + i, col);
      let offset = ${P.indicesToOffset("cur_indices")};
      ${P.setByOffset(`offset / ${p}`,"value")};
    }
  }
  `};return{name:"MatMulNaive",shaderCache:{hint:`${t.activation};${p};${h};${f};${a}`,inputDependencies:y?["rank","rank","rank"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:n?n(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(g/64)},programUniforms:w}),getShaderSource:S}}}),ru,iu,gn,yn,au,wn,nu,Oa,_n=C(()=>{ue(),ie(),te(),jr(),mn(),hn(),ru=(e,t)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t?", batchIndices":""});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t?", batchIndices":""});
        `,iu=(e,t)=>e?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t===3?"":"let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached.w + acc[i];"}
        }`,gn=(e,t,r="f32",i,a=!1,n=32,s=!1,o=32)=>{let u=t[1]*e[1],l=t[0]*e[0],d=a?u:n,p=a?n:u,h=d/t[0],f=n/t[1];if(!((a&&h===4&&e[1]===4||!a&&(h===3||h===4))&&d%t[0]===0&&n%t[1]===0&&e[0]===4))throw new Error(`If transposeA ${a} is true, innerElementSize ${h} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${h} must be 3 or 4.
  tileAWidth ${d} must be divisible by workgroupSize[0]${t[0]}. tileInner ${n} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${h}<${r}>, ${d/h}>, ${p}>;
var<workgroup> mm_Bsub: array<array<vec4<${r}>, ${l/e[0]}>, ${n}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${h};
const tileInner = ${n};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${s?"0":"i32(globalId.z)"};
  ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
  let globalRowStart = i32(workgroupId.y) * ${u};

  let num_tiles = ${s?`${Math.ceil(o/n)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${s?`i32(globalId.z) * ${o}`:"0"};

  var acc: array<vec4<${r}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${f};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${ru(a,i)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${i?", batchIndices":""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${h===3?"":"let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${iu(a,h)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},yn=(e,t)=>e?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t?", batchIndices":""});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t?", batchIndices":""});
            `,au=e=>e?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];",wn=(e,t,r="f32",i,a=!1,n=32,s=!1,o=32,u=!1)=>{let l=e[1]*t[1],d=e[0]*t[0],p=a?l:n,h=a?n:l;if(!(h%t[1]===0&&p%t[0]===0&&n%t[1]===0))throw new Error(`tileAHight ${h} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${p} must be divisible by workgroupSize[0]${t[0]}, tileInner ${n} must be divisible by workgroupSize[1]${t[1]}`);let f=h/t[1],g=p/t[0],y=n/t[1],$=u?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${l};
    let globalColStart = i32(workgroupId.x) * ${d};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${h}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${p}; inputCol = inputCol + ${t[0]}) {
          ${yn(a,i)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${n}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${d}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${i?", batchIndices":""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${r}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${a?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${l};

let tileRowA = i32(localId.y) * ${f};
let tileColA = i32(localId.x) * ${g};
let tileRowB = i32(localId.y) * ${y};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${g}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${yn(a,i)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${y}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${i?", batchIndices":""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${r}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${au(a)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${r}, ${p}>, ${h}>;
  var<workgroup> mm_Bsub : array<array<${r}, ${d}>, ${n}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${n};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${s?"0":"i32(globalId.z)"};
    ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
    let num_tiles = ${s?`${Math.ceil(o/n)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${s?`i32(globalId.z) * ${o}`:"0"};

    var acc : array<array<${r}, colPerThread>, rowPerThread>;
    ${$}
  }
`},nu=(e,t,r,i,a=!1)=>{let[n,s,o,u]=i,l=A(i[0].type.tensor);return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${n.type.indices}) -> ${st(e,l)} {
      var value = ${st(e,l)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        var aIndices: ${s.type.indices};
        ${aa("aIndices",s,s.rank-2,n.rank,"batchIndices")}
        ${s.indicesSet("aIndices",s.rank-2,"u32(row)")}
        ${s.indicesSet("aIndices",s.rank-1,"u32(colIn)")}
        value = ${s.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${n.type.indices}) -> ${st(e,l)} {
      var value = ${st(e,l)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        var bIndices: ${o.type.indices};
        ${aa("bIndices",o,o.rank-2,n.rank,"batchIndices")}
        ${o.indicesSet("bIndices",o.rank-2,"u32(row)")}
        ${o.indicesSet("bIndices",o.rank-1,"u32(colIn)")}
        value = ${o.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${st(e,l)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t?`value = value + ${a?"bias[colIn]":`${st(e,l)}(bias[row])`};`:""}
        ${r}
        ${u.setByIndices("vec3<u32>(coords)","value")}
      }
    }
    `},Oa=(e,t,r,i,a=!1,n)=>{let s=e[0].dims,o=e[1].dims,u=s.slice(0,-2),l=o.slice(0,-2),d=i?i.slice(0,-2):r.slice(0,-2),p=M.size(d),h=s[s.length-2],f=s[s.length-1],g=o[o.length-1],y=f%4===0&&g%4===0,$=h<=8?[4,1,1]:[4,4,1],_=[8,8,1],w=[Math.ceil(g/_[0]/$[0]),Math.ceil(h/_[1]/$[1]),Math.ceil(p/_[2]/$[2])],S=y?4:1,x=[...u,h,f/S],k=x.length,B=[...l,f,g/S],D=B.length,P=[p,h,g/S],L=[{type:6,data:h},{type:6,data:g},{type:6,data:f}];Wr(t,L),L.push(...I(d,x,B));let j=["rank","rank"],oe=e.length>2;oe&&(L.push(...I(e[2].dims)),j.push("rank")),L.push(...I(P));let X=ne=>{let Ce=d.length,Ae=ye("batchDims",e[0].dataType,Ce,1),J=A(e[0].dataType),ge=z("a",e[0].dataType,k,S),Ve=z("b",e[1].dataType,D,S),H=F("result",e[0].dataType,P.length,S),qe=[ge,Ve];if(oe){let He=a?S:1;qe.push(z("bias",e[2].dataType,e[2].dims.length,He))}let q=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"}];Gr(t,q);let W=A(H.type.tensor),fe=Fr(t,H.type.value,W),we=nu(S,oe,fe,[Ae,ge,Ve,H],a);return`
  ${ne.registerUniforms(q).registerInternalVariables(Ae).declareVariables(...qe,H)}
  ${we}
  ${y?gn($,_,J,Ae):wn($,_,J,Ae)}
                   `};return{name:"MatMul",shaderCache:{hint:`${$};${t.activation};${y};${a}`,inputDependencies:j},getRunData:()=>({outputs:[{dims:n?n(r):r,dataType:e[0].dataType}],dispatchGroup:{x:w[0],y:w[1],z:w[2]},programUniforms:L}),getShaderSource:X}}}),su,ou,bc=C(()=>{ue(),Tt(),te(),jr(),hn(),_c(),_n(),su=(e,t,r,i,a=!1,n,s=4,o=4,u=4,l="f32")=>{let d=L=>{switch(L){case 1:return"resData = x[xIndex];";case 3:return`resData = vec3<${l}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return"resData = x[xIndex / 4];";default:throw new Error(`innerElementSize ${L} is not supported.`)}},p=L=>{switch(L){case 1:return"return w[row * i32(uniforms.w_shape[3]) + colIn];";case 4:return"return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";default:throw new Error(`innerElementSize ${L} is not supported.`)}},h=e?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,f=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,g=e?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",y=e?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",$=e?"row":"col",_=e?"col":"row",w=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
    let outRow = ${$} / outWidth;
    let outCol = ${$} % outWidth;

    let WRow = ${_} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${_} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${_} % inChannels;
    var resData = ${st(s,l)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${g} && xCol >= 0 && xCol < ${y}) {
      ${h}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${d(s)}
    }
    return resData;`,S=e?t&&i?`
    let col = colIn * ${s};
    ${w}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${w}
    }
    return ${st(s,l)}(0.0);`:i&&r?`
    let col = colIn * ${s};
    ${w}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${w}
    }
    return ${st(s,l)}(0.0);`,x=e?i&&r?p(o):`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${p(o)}
    }
    return ${st(o,l)}(0.0);`:`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_a_outer) {
      ${p(o)}
    }
    return ${st(o,l)}(0.0);`,k=st(u,l),B=st(e?s:o,l),D=st(e?o:s,l),P=Fr(n,k,l);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${B} {
      ${e?S:x}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${D} {
      ${e?x:S}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${k}) {
      let col = colIn * ${u};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${f}
      ${eu(a)}
      ${P}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},ou=(e,t,r,i,a,n,s,o,u)=>{let l=t.format==="NHWC",d=l?e[0].dims[3]:e[0].dims[1],p=r[0],h=l?r[2]:r[3],f=l?r[1]:r[2],g=l?r[3]:r[1],y=l&&(d%4===0||d%3===0)&&g%4===0,$=l?g:h*f,_=l?h*f:g,w=[8,8,1],S=i<=8?[4,1,1]:[4,4,1],x=[Math.ceil($/w[0]/S[0]),Math.ceil(_/w[1]/S[1]),Math.ceil(p/w[2]/S[2])];Ee("verbose",()=>`[conv2d_mm_webgpu] dispatch = ${x}`);let k=y?l&&d%4!==0?3:4:1,B=w[1]*S[1],D=w[0]*S[0],P=Math.max(w[0]*k,w[1]),L=i%B===0,j=a%D===0,oe=n%P===0,X=y?[k,4,4]:[1,1,1],ne=[{type:6,data:i},{type:6,data:a},{type:6,data:n},{type:6,data:[t.pads[0],t.pads[1]]},{type:6,data:t.strides},{type:6,data:t.dilations}];Wr(t,ne),ne.push(...I(e[0].dims,e[1].dims));let Ce=["rank","rank"];s&&(ne.push(...I(e[2].dims)),Ce.push("rank")),ne.push(...I(r));let Ae=J=>{let ge=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"pad",type:"i32",length:2},{name:"stride",type:"i32",length:2},{name:"dilation",type:"i32",length:2}];Gr(t,ge);let Ve=y?4:1,H=A(e[0].dataType),qe=`
      fn setOutputAtIndex(flatIndex : i32, value : ${y?`vec4<${H}>`:H}) {
        result[flatIndex] = ${y?`vec4<${H}>`:H}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${y?`vec4<${H}>`:H}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${y?"/ 4":""}, value);
      }`,q=z("x",e[0].dataType,e[0].dims.length,k===3?1:k),W=z("w",e[1].dataType,e[1].dims.length,Ve),fe=[q,W],we=F("result",e[0].dataType,r.length,Ve);if(s){let He=z("bias",e[2].dataType,e[2].dims.length,Ve);fe.push(He),qe+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${y?`vec4<${H}>`:H} {
          return bias[coords.${l?"w":"y"}${y?"/ 4":""}];
        }`}return`
        ${tu("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${J.registerUniforms(ge).declareVariables(...fe,we)}
        ${qe}
        ${su(l,L,j,oe,s,t,X[0],X[1],X[2],H)}
        ${y?gn(S,w,H,void 0,!l,P):wn(S,w,H,void 0,!l,P,!1,void 0,o)}`};return{name:"Conv2DMatMul",shaderCache:{hint:`${t.cacheKey};${k};${y};${L};${j};${oe};${B};${D};${P}`,inputDependencies:Ce},getRunData:()=>({outputs:[{dims:u?u(r):r,dataType:e[0].dataType}],dispatchGroup:{x:x[0],y:x[1],z:x[2]},programUniforms:ne}),getShaderSource:Ae}}}),uu,bn,na,lu,$n,du,pu,cu,$c=C(()=>{ue(),Tt(),ie(),te(),jr(),hn(),uu=e=>{let t=1;for(let r=0;r<e.length;r++)t*=e[r];return t},bn=e=>typeof e=="number"?[e,e,e]:e,na=(e,t)=>t<=1?e:e+(e-1)*(t-1),lu=(e,t,r,i=1)=>{let a=na(t,i);return Math.floor((e[0]*(r-1)-r+a)/2)},$n=(e,t,r,i,a)=>{a==null&&(a=lu(e,t[0],i[0]));let n=[0,0,0,r];for(let s=0;s<3;s++)e[s]+2*a>=t[s]&&(n[s]=Math.trunc((e[s]-t[s]+2*a)/i[s]+1));return n},du=(e,t,r,i,a,n,s,o,u,l)=>{let d,p,h,f;if(e==="VALID"&&(e=0),typeof e=="number"){d={top:e,bottom:e,left:e,right:e,front:e,back:e};let g=$n([t,r,i,1],[o,u,l],1,[a,n,s],e);p=g[0],h=g[1],f=g[2]}else if(Array.isArray(e)){if(!e.every((y,$,_)=>y===_[0]))throw Error(`Unsupported padding parameter: ${e}`);d={top:e[0],bottom:e[1],left:e[2],right:e[3],front:e[4],back:e[5]};let g=$n([t,r,i,1],[o,u,l],1,[a,n,s],e[0]);p=g[0],h=g[1],f=g[2]}else if(e==="SAME_UPPER"){p=Math.ceil(t/a),h=Math.ceil(r/n),f=Math.ceil(i/s);let g=(p-1)*a+o-t,y=(h-1)*n+u-r,$=(f-1)*s+l-i,_=Math.floor(g/2),w=g-_,S=Math.floor(y/2),x=y-S,k=Math.floor($/2),B=$-k;d={top:S,bottom:x,left:k,right:B,front:_,back:w}}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:d,outDepth:p,outHeight:h,outWidth:f}},pu=(e,t,r,i,a,n=!1,s="channelsLast")=>{let o,u,l,d,p;if(s==="channelsLast")[o,u,l,d,p]=e;else if(s==="channelsFirst")[o,p,u,l,d]=e;else throw new Error(`Unknown dataFormat ${s}`);let[h,,f,g,y]=t,[$,_,w]=bn(r),[S,x,k]=bn(i),B=na(f,S),D=na(g,x),P=na(y,k),{padInfo:L,outDepth:j,outHeight:oe,outWidth:X}=du(a,u,l,d,$,_,w,B,D,P),ne=n?h*p:h,Ce=[0,0,0,0,0];return s==="channelsFirst"?Ce=[o,ne,j,oe,X]:s==="channelsLast"&&(Ce=[o,j,oe,X,ne]),{batchSize:o,dataFormat:s,inDepth:u,inHeight:l,inWidth:d,inChannels:p,outDepth:j,outHeight:oe,outWidth:X,outChannels:ne,padInfo:L,strideDepth:$,strideHeight:_,strideWidth:w,filterDepth:f,filterHeight:g,filterWidth:y,effectiveFilterDepth:B,effectiveFilterHeight:D,effectiveFilterWidth:P,dilationDepth:S,dilationHeight:x,dilationWidth:k,inShape:e,outShape:Ce,filterShape:t}},cu=(e,t,r,i,a,n)=>{let s=n==="channelsLast";s?e[0].dims[3]:e[0].dims[1];let o=[64,1,1],u={x:r.map(($,_)=>_)},l=[Math.ceil(uu(u.x.map($=>r[$]))/o[0]),1,1];Ee("verbose",()=>`[conv3d_naive_webgpu] dispatch = ${l}`);let d=1,p=M.size(r),h=[{type:12,data:p},{type:12,data:i},{type:12,data:a},{type:12,data:t.strides},{type:12,data:t.dilations}];Wr(t,h),h.push(...I(e[0].dims,e[1].dims));let f=["rank","rank"],g=e.length===3;g&&(h.push(...I(e[2].dims)),f.push("rank")),h.push(...I(r));let y=$=>{let _=[{name:"output_size",type:"u32"},{name:"filter_dims",type:"u32",length:i.length},{name:"pads",type:"u32",length:a.length},{name:"strides",type:"u32",length:t.strides.length},{name:"dilations",type:"u32",length:t.dilations.length}];Gr(t,_);let w=1,S=A(e[0].dataType),x=z("x",e[0].dataType,e[0].dims.length,d),k=z("W",e[1].dataType,e[1].dims.length,w),B=[x,k],D=F("result",e[0].dataType,r.length,w),P="";if(g){let oe=z("bias",e[2].dataType,e[2].dims.length,w);B.push(oe),P+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${S} {
          return bias[${s?R("coords",4,5):R("coords",1,5)}];
        }`}let L=st(d,S),j=Fr(t,L,S);return`
            ${P}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${x.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${k.getByIndices("aIndices")};
            }
          ${$.registerUniforms(_).declareVariables(...B,D)}
          ${$.mainStart()}
          ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${D.offsetToIndices("global_idx")};
              let batch = ${R("coords",0,x.rank)};
              let d2 = ${s?R("coords",x.rank-1,x.rank):R("coords",1,x.rank)};
              let xFRCCorner = vec3<u32>(${s?R("coords",1,x.rank):R("coords",2,x.rank)},
              ${s?R("coords",2,x.rank):R("coords",3,x.rank)},
              ${s?R("coords",3,x.rank):R("coords",4,x.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${s?R("uniforms.x_shape",1,x.rank):R("uniforms.x_shape",2,x.rank)};
              let xShapeZ = ${s?R("uniforms.x_shape",2,x.rank):R("uniforms.x_shape",3,x.rank)};
              let xShapeW = ${s?R("uniforms.x_shape",3,x.rank):R("uniforms.x_shape",4,x.rank)};
              let xShapeU = ${s?R("uniforms.x_shape",4,x.rank):R("uniforms.x_shape",1,x.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${s?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${s?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${s?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${s?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${g?"value = value + getBiasByOutputCoords(coords)":""};
              ${j}
              result[global_idx] = f32(value);
          }`};return{name:"Conv3DNaive",shaderCache:{hint:`${t.cacheKey};${s};${d};${g}`,inputDependencies:f},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:l[0],y:l[1],z:l[2]},programUniforms:h}),getShaderSource:y}}}),hu,fu,vc=C(()=>{ue(),ie(),te(),jr(),hu=(e,t,r,i)=>{let a=e.length>2,n=a?"value += b[output_channel];":"",s=e[0].dims,o=e[1].dims,u=t.format==="NHWC",l=u?r[3]:r[1],d=l/t.group,p=u&&d>=4?O(l):1,h=M.size(r)/p,f=[{type:12,data:h},{type:12,data:t.dilations},{type:12,data:[t.strides[0],t.strides[1]]},{type:12,data:[t.pads[0],t.pads[1]]},{type:12,data:d}];Wr(t,f),f.push(...I(s,[o[0],o[1],o[2],o[3]/p]));let g=a?["rank","rank","rank"]:["rank","rank"];f.push(...I([r[0],r[1],r[2],r[3]/p]));let y=$=>{let _=F("output",e[0].dataType,r.length,p),w=A(_.type.tensor),S=Fr(t,_.type.value,w),x=z("x",e[0].dataType,s.length),k=z("w",e[1].dataType,o.length,p),B=[x,k];a&&B.push(z("b",e[2].dataType,e[2].dims,p));let D=[{name:"output_size",type:"u32"},{name:"dilations",type:"u32",length:t.dilations.length},{name:"strides",type:"u32",length:2},{name:"pads",type:"u32",length:2},{name:"output_channels_per_group",type:"u32"}];Gr(t,D);let P=u?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${x.get("batch","xHeight","xWidth","input_channel")};
            let wVal = ${k.get("wHeight","wWidth","wInChannel","output_channel")};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${x.get("batch","input_channel","xHeight","xWidth")};
            let wVal = ${k.get("output_channel","wInChannel","wHeight","wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${$.registerUniforms(D).declareVariables(...B,_)}

  ${$.mainStart()}
    ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${_.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${u?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${u?1:2}], outputIndices[${u?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${p} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${u?2:1}];

    var value: ${_.type.value} = ${_.type.value}(0);
    ${P}
    ${n}
    ${S}
    ${_.setByOffset("global_idx","value")}
  }`};return{name:"GroupedConv",shaderCache:{hint:`${t.cacheKey}_${p}`,inputDependencies:g},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:f}),getShaderSource:y}},fu=(e,t,r,i)=>{let a=e.length>2,n=O(r[3]),s=O(r[2]),o=M.size(r)/n/s,u=[e[0].dims[0],e[0].dims[1],e[0].dims[2],e[0].dims[3]/n],l=[e[1].dims[0],e[1].dims[1],e[1].dims[2],e[1].dims[3]/n],d=[r[0],r[1],r[2],r[3]/n],p=[{type:12,data:o},{type:6,data:[t.strides[0],t.strides[1]]},{type:6,data:[t.pads[0],t.pads[1]]}];Wr(t,p),p.push(...I(u,l,d));let h=(s-1)*t.strides[1]+l[1],f=g=>{let y=F("output",e[0].dataType,d.length,n),$=A(y.type.tensor),_=Fr(t,y.type.value,$),w=z("x",e[0].dataType,u.length,n),S=z("w",e[1].dataType,l.length,n),x=[w,S];a&&x.push(z("b",e[2].dataType,e[2].dims,n));let k=a?"value += b[output_channel];":"",B=[{name:"output_size",type:"u32"},{name:"strides",type:"i32",length:2},{name:"pads",type:"i32",length:2}];return Gr(t,B),`
  ${g.registerUniforms(B).declareVariables(...x,y)}
  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${s}u;
    let col = (index1 % width1) * ${s}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${w.type.value}, ${h}>;
    var values: array<${y.type.value}, ${s}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${l[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${h}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${w.get("batch","u32(x_height)","u32(x_width)","input_channel")};
          } else {
            x_vals[i] = ${w.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${l[1]}; w_width++) {
          let w_val = ${S.get("w_height","w_width","0","output_channel")};
          for (var i = 0u; i < ${s}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${s}u; i++) {
      var value = values[i];
      ${k}
      ${_}
      ${y.set("batch","row","col + i","output_channel","value")};
    }
  }`};return{name:"GroupedConv-Vectorize",shaderCache:{hint:`${t.cacheKey};${n};${s};${h};${l[0]};${l[1]}`,inputDependencies:a?["rank","rank","type"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:p}),getShaderSource:f}}}),mu,Ra,gu,Ba,vn,xn,yu,wu,Sn,xc=C(()=>{ie(),bc(),$c(),_n(),vc(),jr(),mn(),at(),mu=(e,t,r,i,a,n)=>{let s=e[0],o=e.slice(n?1:2,n?3:4),u=o.length,l=t[0],d=t.slice(2).map((h,f)=>h+(h-1)*(r[f]-1)),p=o.map((h,f)=>h+i[f]+i[f+u]).map((h,f)=>Math.floor((h-d[f]+a[f])/a[f]));return p.splice(0,0,s),p.splice(n?3:1,0,l),p},Ra=[2,3,1,0],gu=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length>5)throw new Error("greater than 5D is not supported");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[1]*t.group;if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");if(e.length===3&&(e[2].dims.length!==1||e[1].dims[0]!==e[2].dims[0]))throw new Error("invalid bias");let a=e[0].dims.length-2;if(t.dilations.length!==a)throw new Error(`dilations should be ${a}D`);if(t.strides.length!==a)throw new Error(`strides should be ${a}D`);if(t.pads.length!==a*2)throw new Error(`pads should be ${a*2}D`);if(t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape")},Ba=(e,t)=>{let r=e.kernelShape.slice();r.length<t[1].dims.length-2&&r.push(...Array(t[1].dims.length-2-r.length).fill(0));for(let n=2;n<t[1].dims.length;++n)r[n-2]===0&&(r[n-2]=t[1].dims[n]);let i=e.pads.slice();sr.adjustPadsBasedOnAutoPad(t[0].dims,e.strides,e.dilations,r,i,e.format==="NHWC",e.autoPad);let a=Object.assign({},e);return Object.assign(a,{kernelShape:r,pads:i}),a},vn=e=>{let t=cn(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],a=e.dilations,n=e.group,s=e.kernel_shape,o=e.pads,u=e.strides,l=e.w_is_const();return{autoPad:i,format:r,dilations:a,group:n,kernelShape:s,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},xn=(e,t,r,i)=>{let a=r.format==="NHWC",n=mu(t[0].dims,t[1].dims,r.dilations,r.pads,r.strides,a);if(r.group!==1){let B=[t[0]];if(a){let D=e.kernelCustomData.wT??e.compute(ft(t[1],Ra),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=D),B.push(D)}else B.push(t[1]);t.length===3&&B.push(t[2]),!e.adapterInfo.isArchitecture("ampere")&&a&&t[1].dims[0]===r.group&&t[1].dims[1]===1&&r.dilations[0]===1&&r.dilations[1]===1?e.compute(fu(B,r,n,i),{inputs:B}):e.compute(hu(B,r,n,i),{inputs:B});return}let s=t.length===3,o=t[0].dims[a?1:2],u=t[0].dims[a?2:3],l=t[0].dims[a?3:1],d=t[1].dims[2],p=t[1].dims[3],h=n[a?1:2],f=n[a?2:3],g=n[a?3:1],y=a&&d===o&&p===u&&r.pads[0]===0&&r.pads[1]===0;if(y||d===1&&p===1&&r.dilations[0]===1&&r.dilations[1]===1&&r.strides[0]===1&&r.strides[1]===1&&r.pads[0]===0&&r.pads[1]===0){let B=n[0],D,P,L,j=[];if(a){let ne=e.kernelCustomData.wT??e.compute(ft(t[1],Ra),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];if(r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=ne),y){let Ce=o*u*l;D=t[0].reshape([1,B,Ce]),P=ne.reshape([1,Ce,g]),L=[1,B,g]}else D=t[0].reshape([B,o*u,l]),P=ne.reshape([1,l,g]),L=[B,h*f,g];j.push(D),j.push(P)}else D=t[0].reshape([B,l,o*u]),P=t[1].reshape([1,g,l]),L=[B,g,h*f],j.push(P),j.push(D);s&&j.push(t[2]);let oe=L[2],X=j[0].dims[j[0].dims.length-1];oe<8&&X<8?e.compute(fn(j,r,n,L,a,i),{inputs:j}):e.compute(Oa(j,r,n,L,a,i),{inputs:j});return}let $=!0,_=e.kernelCustomData.wT??e.compute(ft(t[1],Ra),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=_);let w=[t[0],_];s&&w.push(t[2]);let S=a?h*f:g,x=a?g:h*f,k=d*p*l;e.compute(ou(w,r,n,S,x,k,s,$,i),{inputs:w})},yu=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let a=[0,t.pads[0],0,t.pads[1]],n=[1].concat(t.strides),s=[1].concat(t.dilations),o=[1].concat(t.kernelShape),u=Ba({...t,pads:a,strides:n,dilations:s,kernelShape:o},i);xn(e,i,u,l=>r?[l[0],l[2],l[3]]:[l[0],l[1],l[3]])},wu=(e,t,r)=>{let i=r.format==="NHWC"?"channelsLast":"channelsFirst",a=Ba(r,t),n=r.autoPad==="NOTSET"?r.pads:r.autoPad,s=pu(t[0].dims,t[1].dims,r.strides,r.dilations,n,!1,i);e.compute(cu(t,a,s.outShape,[s.filterDepth,s.filterHeight,s.filterWidth],[s.padInfo.front,s.padInfo.top,s.padInfo.left],i))},Sn=(e,t)=>{if(gu(e.inputs,t),e.inputs[0].dims.length===3)yu(e,t);else if(e.inputs[0].dims.length===5)wu(e,e.inputs,t);else{let r=Ba(t,e.inputs);xn(e,e.inputs,r)}}}),_u,Sc=C(()=>{ue(),Tt(),ie(),te(),_u=(e,t,r)=>{let i=e.length>2,a=t.outputShape,n=t.format==="NHWC",s=t.group,o=e[1].dims,u=o[2]/s,l=o[3],d=n?O(u):1,p=n&&l===1&&u>=4,h=p?Math.floor(u/4)*4:Math.floor(u/d)*d,f=u-h,g=n?O(l):1,y=n?l===1?d:g:1,$=M.size(a)/g,_=[Math.ceil($/64),1,1];Ee("verbose",()=>`[conv2d_backprop_webgpu] dispatch = ${_}`);let w=["rank","rank"],S=[t.strides[0],t.strides[1]],x=[t.kernelShape[n?1:2],t.kernelShape[n?2:3]],k=[t.dilations[0],t.dilations[1]],B=[x[0]+(t.dilations[0]<=1?0:(t.kernelShape[n?1:2]-1)*(t.dilations[0]-1)),x[1]+(t.dilations[1]<=1?0:(t.kernelShape[n?2:3]-1)*(t.dilations[1]-1))],D=[B[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),B[1]-1-Math.floor((t.pads[1]+t.pads[3])/2)],P=[{type:12,data:$},{type:12,data:S},{type:12,data:x},{type:12,data:k},{type:12,data:B},{type:6,data:D},{type:12,data:h},{type:12,data:u},{type:12,data:l},...I(e[0].dims,e[1].dims)];i&&(P.push(...I(e[2].dims)),w.push("rank")),P.push(...I(a));let L=j=>{let oe=[{name:"output_size",type:"u32"},{name:"strides",type:"u32",length:S.length},{name:"filter_dims",type:"u32",length:x.length},{name:"dilations",type:"u32",length:x.length},{name:"effective_filter_dims",type:"u32",length:B.length},{name:"pads",type:"i32",length:D.length},{name:"input_channels_per_group_int",type:"u32"},{name:"input_channels_per_group",type:"u32"},{name:"output_channels_per_group",type:"u32"}],X=A(e[0].dataType),ne=n?1:2,Ce=n?2:3,Ae=n?3:1,J=z("W",e[1].dataType,e[1].dims.length,y),ge=z("Dy",e[0].dataType,e[0].dims.length,d),Ve=[ge,J];i&&Ve.push(z("bias",e[2].dataType,[a[Ae]].length,g));let H=F("result",e[0].dataType,a.length,g),qe=()=>{let fe="";if(p)d===4?fe+=`
        let xValue = ${ge.getByOffset("x_offset")};
        let wValue = ${J.getByOffset("w_offset")};
        dotProd = dotProd + dot(xValue, wValue);
        x_offset += 1u;
        w_offset += 1u;`:d===2?fe+=`
          dotProd = dotProd + dot(vec4<${X}>(${ge.getByOffset("x_offset")}, ${ge.getByOffset("x_offset + 1u")}), vec4<${X}>(${J.getByOffset("w_offset")}, ${J.getByOffset("w_offset + 1u")}));
          x_offset += 2u;
          w_offset += 2u;`:d===1&&(fe+=`
          dotProd = dotProd + dot(vec4<${X}>(${ge.getByOffset("x_offset")}, ${ge.getByOffset("x_offset + 1u")}, ${ge.getByOffset("x_offset + 2u")}, ${ge.getByOffset("x_offset + 3u")}), vec4<${X}>(${J.getByOffset("w_offset")}, ${J.getByOffset("w_offset + 1u")}, ${J.getByOffset("w_offset + 2u")}, ${J.getByOffset("w_offset + 3u")}));
          x_offset += 4u;
          w_offset += 4u;`);else if(fe+=`
                  let xValue = ${n?ge.getByOffset(`${ge.indicesToOffset(`${ge.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${d}`):ge.get("batch","inputChannel","idyR","idyC")};
        `,d===1)fe+=`
          let w_offset = ${J.indicesToOffset(`${J.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel, wOutChannel)`)};
          let wValue = ${J.getByOffset(`w_offset / ${y}`)};
          dotProd = dotProd + xValue * wValue;`;else for(let we=0;we<d;we++)fe+=`
            let wValue${we} = ${J.getByOffset(`${J.indicesToOffset(`${J.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel + ${we}, wOutChannel)`)} / ${y}`)};
            dotProd = dotProd + xValue[${we}] * wValue${we};`;return fe},q=()=>{if(f===0)return"";if(!p)throw new Error(`packInputAs4 ${p} is not true.`);let fe="";if(d===1){fe+="dotProd = dotProd";for(let we=0;we<f;we++)fe+=`
            + ${ge.getByOffset(`x_offset + ${we}`)} * ${J.getByOffset(`w_offset + ${we}`)}`;fe+=";"}else if(d===2){if(f!==2)throw new Error(`Invalid inputChannelsRemainder ${f}.`);fe+=`
          let xValue = ${ge.getByOffset("x_offset")};
          let wValue = ${J.getByOffset("w_offset")};
          dotProd = dotProd + dot(xValue, wValue);`}return fe},W=`
            let outputIndices = ${H.offsetToIndices(`global_idx * ${g}`)};
            let batch = ${H.indicesGet("outputIndices",0)};
            let d1 = ${H.indicesGet("outputIndices",Ae)};
            let r = ${H.indicesGet("outputIndices",ne)};
            let c = ${H.indicesGet("outputIndices",Ce)};
            let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
            let dyRCorner = dyCorner.x;
            let dyCCorner = dyCorner.y;
            let groupId = d1 / uniforms.output_channels_per_group;
            let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
            // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
            // ? = to be determined. : = across all values in that axis.
            var dotProd = ${H.type.value}(0.0);
            var wR: u32 = 0;
            if (uniforms.dilations.x == 1) {
              // Minimum wR >= 0 that satisfies (dyRCorner + wR) % (uniforms.strides.x) == 0
              wR = u32(((dyRCorner + i32(uniforms.strides.x) - 1) / i32(uniforms.strides.x)) * i32(uniforms.strides.x) - dyRCorner);
            }
            for (; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
              if (wR % uniforms.dilations.x != 0) {
                continue;
              }
              let dyR = (${X}(dyRCorner) + ${X}(wR)) / ${X}(uniforms.strides[0]);
              let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
              if (dyR < 0.0 || dyR >= ${X}(uniforms.Dy_shape[${ne}]) || fract(dyR) > 0.0 ||
                  wRPerm < 0) {
                continue;
              }
              let idyR: u32 = u32(dyR);
              var wC: u32 = 0;
              if (uniforms.dilations.y == 1) {
                // Minimum wC >= 0 that satisfies (dyCCorner + wC) % (uniforms.strides.y) == 0
                wC = u32(((dyCCorner + i32(uniforms.strides.y) - 1) / i32(uniforms.strides.y)) * i32(uniforms.strides.y) - dyCCorner);
              }
              for (; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
                if (wC % uniforms.dilations.y != 0) {
                  continue;
                }
                let dyC = (${X}(dyCCorner) + ${X}(wC)) / ${X}(uniforms.strides.y);
                let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
                if (dyC < 0.0 || dyC >= ${X}(uniforms.Dy_shape[${Ce}]) ||
                    fract(dyC) > 0.0 || wCPerm < 0) {
                  continue;
                }
                let idyC: u32 = u32(dyC);
                var inputChannel = groupId * uniforms.input_channels_per_group;
                ${p?`
                var x_offset = ${ge.indicesToOffset(`${ge.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${d};
                var w_offset = ${J.indicesToOffset(`${J.type.indices}(wRPerm, wCPerm, inputChannel, wOutChannel)`)} / ${y};
                  `:""}
                for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group_int; d2 = d2 + ${p?4:d}) {
                  ${qe()}
                  inputChannel = inputChannel + ${p?4:d};
                }
                ${q()}
                wC = wC + uniforms.strides.y - 1;
              }
              wR = wR + uniforms.strides[0] - 1;
            }
            let value = dotProd${i?` + bias[d1 / ${g}]`:""};
            ${H.setByOffset("global_idx","value")};
          `;return`
    ${j.registerUniforms(oe).declareVariables(...Ve,H)}
      ${j.mainStart()}
      ${j.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
    ${W}}`};return{name:"ConvTranspose2D",shaderCache:{hint:`${t.cacheKey};${d}${y}${g}${p}${f}`,inputDependencies:w},getRunData:()=>({dispatchGroup:{x:_[0],y:_[1],z:_[2]},outputs:[{dims:r?r(a):a,dataType:e[0].dataType}],programUniforms:P}),getShaderSource:L}}}),bu,$u,vu,Tn,xu,Su,En,Tu,Eu,Tc=C(()=>{Sc(),jr(),at(),bu=(e,t,r,i,a,n)=>(e-1)*t+r+(i-1)*a+1-n,$u=(e,t,r,i,a)=>{let n=Math.floor(e/2);t==="SAME_UPPER"?(r[i]=n,r[a]=e-n):t==="SAME_LOWER"&&(r[i]=e-n,r[a]=n)},vu=(e,t,r,i,a,n,s,o,u,l)=>{let d=e.length-2,p=l.length===0;u.length<d&&u.push(...Array(d-u.length).fill(0));let h=e[0],f=t[o?3:1]*a;for(let g=0,y=e.length-d-(o?1:0);g<d;++g,++y){let $=e[y],_=p?$*s[g]:l[g],w=bu($,s[g],n[g],t[y],r[g],_);$u(w,i,n,g,g+d),p&&l.push(s[g]*($-1)+u[g]+(t[y]-1)*r[g]+1-n[g]-n[g+d])}l.splice(0,0,h),l.splice(o?3:1,0,f)},Tn=(e,t)=>{let r=e.kernelShape.slice();if(e.kernelShape.length===0||e.kernelShape.reduce((p,h)=>p*h,1)===0){r.length=0;for(let p=2;p<t[1].dims.length;++p)r.push(t[1].dims[p])}let i=e.format==="NHWC";r.splice(0,0,t[1].dims[0]),r.splice(i?3:1,0,t[1].dims[1]);let a=e.pads.slice(),n=e.outputShape.slice(),s=e.outputPadding.slice(),o=t[0].dims,u=e.dilations.slice();if(u.reduce((p,h)=>p+h,0)===0){let p=t[0].dims.length-2;u=new Array(p).fill(1)}let l=e.strides.slice();if(l.reduce((p,h)=>p+h,0)===0){let p=t[0].dims.length-2;l=new Array(p).fill(1)}vu(o,r,u,e.autoPad,e.group,a,l,i,s,n);let d=Object.assign({},e);return Object.assign(d,{kernelShape:r,pads:a,outputPadding:s,outputShape:n,dilations:u,strides:l}),d},xu=e=>{let t=cn(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][typeof e.autoPad>"u"?0:e.autoPad],a=e.dilations,n=e.group??1,s=e.kernelShape,o=e.pads,u=e.strides,l=e.wIsConst(),d=e.outputPadding,p=e.outputShape;return{autoPad:i,format:r,dilations:a,group:n,kernelShape:s,outputPadding:d,outputShape:p,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},Su=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length!==4&&e[0].dims.length!==3)throw new Error("currently only support 2-dimensional conv");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[0];if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");let a=e[1].dims[1]*t.group;if(e.length===3&&(e[2].dims.length!==1||e[2].dims[0]!==a))throw new Error("invalid bias");let n=e[0].dims.length-2;if(t.dilations.reduce((s,o)=>s+o,0)>0&&t.dilations.length!==n)throw new Error(`dilations should be ${n}D`);if(t.strides.reduce((s,o)=>s+o,0)>0&&t.strides.length!==n)throw new Error(`strides should be ${n}D`);if(t.pads.reduce((s,o)=>s+o,0)>0&&t.pads.length!==n*2)throw new Error(`pads should be ${n*2}D`);if(t.outputPadding.length!==n&&t.outputPadding.length!==0)throw new Error(`output_padding should be ${n}D`);if(t.kernelShape.reduce((s,o)=>s+o,0)>0&&t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape");if(t.outputShape.length!==0&&t.outputShape.length!==e[0].dims.length-2)throw new Error("invalid output shape")},En=(e,t,r,i)=>{let a=e.kernelCustomData.wT??e.compute(ft(t[1],[2,3,0,1]),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=a);let n=[t[0],a];t.length===3&&n.push(t[2]),e.compute(_u(n,r,i),{inputs:n})},Tu=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let a=t.kernelShape;(a.length===0||a[0]===0)&&(a=[e.inputs[1].dims[2]]);let n=t.dilations;(n.length===0||n[0]===0)&&(n=[1]);let s=t.strides;(s.length===0||s[0]===0)&&(s=[1]);let o=t.pads;o.length===0&&(o=[0,0]),o=[0,o[0],0,o[1]],s=[1].concat(s),n=[1].concat(n),a=[1].concat(a);let u=t.outputPadding;u=[0].concat(u);let l=Tn({...t,pads:o,strides:s,dilations:n,kernelShape:a,outputPadding:u},i);En(e,i,l,d=>r?[d[0],d[2],d[3]]:[d[0],d[1],d[3]])},Eu=(e,t)=>{if(Su(e.inputs,t),e.inputs[0].dims.length===3)Tu(e,t);else{let r=Tn(t,e.inputs);En(e,e.inputs,r)}}}),Iu,ku,Cu,Ec=C(()=>{ue(),ie(),b(),te(),Iu=(e,t,r,i)=>{let a=M.size(t),n=t.length,s=z("input",e,n),o=F("output",e,n),u=r.dataType===6?r.getInt32Array()[0]:Number(r.getBigInt64Array()[0]),l=M.normalizeAxis(u,n),d=p=>{let h=` i32(${s.indicesGet("inputIndices","uniforms.axis")}) `,f=R("uniforms.input_shape","uniforms.axis",n),g=i.reverse?h+(i.exclusive?" + 1":""):"0",y=i.reverse?f:h+(i.exclusive?"":" + 1");return`
                ${p.registerUniform("outputSize","u32").registerUniform("axis","u32").declareVariables(s,o)}
                ${p.mainStart()}
                  ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${o.offsetToIndices("global_idx")};
                  var sum = ${o.type.value}(0);
                  let first : i32 = ${g};
                  let last : i32 = ${y};
                  for (var i : i32 = first; i < last; i++) {
                    ${s.indicesSet("inputIndices","uniforms.axis","u32(i)")};
                    sum = sum + ${s.getByIndices("inputIndices")};
                  }
                  ${o.setByOffset("global_idx","sum")};
                }`};return{name:"CumSum",shaderCache:{hint:i.cacheKey,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:t,dataType:e}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:[{type:12,data:a},{type:12,data:l},...I(t,t)]}),getShaderSource:d}},ku=(e,t)=>{let r=e.inputs[0].dims,i=e.inputs[0].dataType,a=e.inputs[1];e.compute(Iu(i,r,a,t),{inputs:[0]})},Cu=e=>{let t=e.exclusive===1,r=e.reverse===1;return m({exclusive:t,reverse:r})}}),zu,Au,Ou,Ru,Bu,Ic=C(()=>{ue(),ie(),b(),te(),zu=e=>{if(!e||e.length!==1)throw new Error("DepthToSpace requires 1 input.");if(e[0].dims.length!==4)throw new Error("DepthToSpace requires 4D input.")},Au=(e,t,r,i)=>{let a=[];a.push(`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`);for(let n=0;n<t;++n)a.push(r.indicesSet("a",e[n],`i[${n}]`));return a.push("return a;}"),a.join(`
`)},Ou=(e,t)=>{let r,i,a,n,s,o,u=t.format==="NHWC",l=t.blocksize,d=t.mode==="DCR";u?([r,i,a,n]=e.dims,s=d?[r,i,a,l,l,n/l**2]:[r,i,a,n/l**2,l,l],o=d?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([r,i,a,n]=[e.dims[0],e.dims[2],e.dims[3],e.dims[1]],s=d?[r,l,l,n/l**2,i,a]:[r,n/l**2,l,l,i,a],o=d?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let p=e.reshape(s),h=p.dims.length,f=e.dataType,g=z("a",f,h),y=F("output",f,h),$=_=>`
  ${_.registerUniform("output_size","u32").declareVariables(g,y)}

  ${Au(o,h,g,y)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${y.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${y.setByOffset("global_idx",g.getByIndices("aIndices"))}
  }`;return{name:"DepthToSpace",shaderCache:{hint:`${e.dims};${t.blocksize};${t.mode}`,inputDependencies:["rank"]},getRunData:_=>{let w=u?[r,i*l,a*l,n/l**2]:[r,n/l**2,i*l,a*l],S=M.size(w),x=p.dims,k=M.sortBasedOnPerm(x,o);return{outputs:[{dims:w,dataType:_[0].dataType}],dispatchGroup:{x:Math.ceil(S/64)},programUniforms:[{type:12,data:S},...I(x,k)]}},getShaderSource:$}},Ru=(e,t)=>{zu(e.inputs),e.compute(Ou(e.inputs[0],t))},Bu=e=>m({blocksize:e.blocksize,mode:e.mode,format:e.format})}),Ma,sa,In,Mu,Du,Pu,Uu,kn,Nu,Lu,Vu,kc=C(()=>{ue(),ie(),b(),te(),Ma="[a-zA-Z]|\\.\\.\\.",sa="("+Ma+")+",In="^"+sa+"$",Mu="("+sa+",)*"+sa,Du="^"+Mu+"$",Pu=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,t){let r=this.symbolToIndices.get(e);r===void 0?r=[t]:r.push(t),this.symbolToIndices.set(e,r)}},Uu=class{constructor(e,t){var a;this.equation=t,this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=new Array,this.outputDims=[];let[r,i]=t.includes("->")?t.split("->",2):[t,""];if(!r.match(RegExp(Du)))throw new Error("Invalid LHS term");if(r.split(",").forEach((n,s)=>{let o=e[s].dims.slice();if(!n.match(RegExp(In)))throw new Error("Invalid LHS term");let u=this.processTerm(n,!0,o,s);this.lhs.push(u)}),i==="")i+=[...this.symbolToInfo.entries()].filter(([n,s])=>s.count===1||n==="...").map(([n])=>n).join("");else if(!i.match(RegExp(sa)))throw new Error("Invalid RHS");(a=i.match(RegExp(Ma,"g")))==null||a.forEach(n=>{if(n==="...")this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let s=this.symbolToInfo.get(n);if(s===void 0)throw new Error("Invalid RHS symbol");this.outputDims.push(s.dimValue)}}),this.rhs=this.processTerm(i,!1,this.outputDims)}addSymbol(e,t,r){let i=this.symbolToInfo.get(e);if(i!==void 0){if(i.dimValue!==t&&i.count!==1)throw new Error("Dimension mismatch");i.count++,i.inputIndices.push(r)}else i={count:1,dimValue:t,inputIndices:[r]};this.symbolToInfo.set(e,i)}processTerm(e,t,r,i=-1){let a=r.length,n=!1,s=[],o=0;if(!e.match(RegExp(In))&&!t&&e!=="")throw new Error("Invalid LHS term");let u=e.match(RegExp(Ma,"g")),l=new Pu(i);return u==null||u.forEach((d,p)=>{if(d==="..."){if(n)throw new Error("Only one ellipsis is allowed per input term");n=!0;let h=a-u.length+1;if(h<0)throw new Error("Ellipsis out of bounds");if(s=r.slice(o,o+h),this.hasEllipsis){if(this.ellipsisDims.length!==s.length||this.ellipsisDims.toString()!==s.toString())throw new Error("Ellipsis dimensions mismatch")}else if(t)this.hasEllipsis=!0,this.ellipsisDims=s;else throw new Error("Ellipsis must be specified in the LHS");for(let f=0;f<s.length;f++){let g=String.fromCharCode(48+f);l.addSymbol(g,p+f),this.addSymbol(g,r[o++],i)}}else l.addSymbol(d,p+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(d,r[o++],i)}),l}},kn=e=>e+"_max",Nu=(e,t,r,i)=>{let a=e.map(l=>l.length).map((l,d)=>z(`input${d}`,t,l)),n=M.size(i),s=F("output",t,i.length),o=[...r.symbolToInfo.keys()].filter(l=>!r.rhs.symbolToIndices.has(l)),u=l=>{let d=[],p="var prod = 1.0;",h="var sum = 0.0;",f="sum += prod;",g=[],y=[],$=[],_=[],w=r.symbolToInfo.size===r.rhs.symbolToIndices.size;r.symbolToInfo.forEach((x,k)=>{var B;if(r.rhs.symbolToIndices.has(k)){let D=(B=r.rhs.symbolToIndices.get(k))==null?void 0:B[0];D!==void 0&&r.lhs.forEach((P,L)=>{if(x.inputIndices.includes(L)){let j=P.symbolToIndices.get(k);if(j===void 0)throw new Error("Invalid symbol error");j.forEach(oe=>{d.push(`${a[L].indicesSet(`input${L}Indices`,oe,s.indicesGet("outputIndices",D))}`)})}})}else r.lhs.forEach((D,P)=>{if(x.inputIndices.includes(P)){let L=D.symbolToIndices.get(k);if(L===void 0)throw new Error("Invalid symbol error");L.forEach(j=>{g.push(`${a[P].indicesSet(`input${P}Indices`,j,`${k}`)}`)}),_.push(`prod *= ${a[P].getByIndices(`input${P}Indices`)};`)}}),y.push(`for(var ${k}: u32 = 0; ${k} < uniforms.${kn(k)}; ${k}++) {`),$.push("}")});let S=w?[...d,`let sum = ${a.map((x,k)=>x.getByIndices(`input${k}Indices`)).join(" * ")};`]:[...d,h,...y,...g,p,..._,f,...$];return`
            ${l.registerUniforms(o.map(x=>({name:`${kn(x)}`,type:"u32"}))).registerUniform("outputSize","u32").declareVariables(...a,s)}

            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${s.offsetToIndices("global_idx")};
            ${a.map((x,k)=>`var input${k}Indices: ${a[k].type.indices};`).join(`
`)}
            ${S.join(`
`)};
            ${s.setByOffset("global_idx","sum")};
          }`};return{name:"Einsum",shaderCache:{hint:r.equation,inputDependencies:e.map(()=>"rank")},getRunData:()=>{let l=o.filter(p=>r.symbolToInfo.has(p)).map(p=>{var h;return{type:12,data:((h=r.symbolToInfo.get(p))==null?void 0:h.dimValue)||0}});l.push({type:12,data:n});let d=e.map((p,h)=>[...I(p)]).reduce((p,h)=>p.concat(h),l);return d.push(...I(i)),{outputs:[{dims:i,dataType:t}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:d}},getShaderSource:u}},Lu=(e,t)=>{let r=new Uu(e.inputs,t.equation),i=r.outputDims,a=e.inputs.map((n,s)=>n.dims);e.compute(Nu(a,e.inputs[0].dataType,r,i))},Vu=e=>{let t=e.equation.replace(/\s+/g,"");return m({equation:t})}}),qu,Cn,Fu,Wu,Gu,Cc=C(()=>{ue(),ie(),te(),qu=e=>{if(!e||e.length!==2)throw new Error("Expand requires 2 input.");let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=r.length<t.length?0:r.length-t.length,a=t.length<r.length?0:t.length-r.length;for(;i<r.length&&a<t.length;++i,++a)if(r[i]!==t[a]&&r[i]!==1&&t[a]!==1)throw new Error("Expand requires shape to be broadcastable to input")},Cn=(e,t)=>{let r=e.length-t.length,i=[];for(let a=0;a<r;++a)i.push(e[a]);for(let a=0;a<t.length;++a)i.push(t[a]===1?e[a+r]:t[a]);return i},Fu=(e,t)=>e.length>t.length?Cn(e,t):Cn(t,e),Wu=e=>{let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=Fu(t,r),a=e[0].dataType,n=a===9||M.size(t)===1,s=a===9||t.length>0&&t[t.length-1]%4===0?4:1,o=n||i.length>0&&i[i.length-1]%4===0?4:1,u=Math.ceil(M.size(i)/o),l=p=>{let h=z("input",a,t.length,s),f=F("output",a,i.length,o),g;if(a===9){let y=($,_,w="")=>`
          let outputIndices${_} = ${f.offsetToIndices(`outputOffset + ${_}u`)};
          let offset${_} = ${h.broadcastedIndicesToOffset(`outputIndices${_}`,f)};
          let index${_} = offset${_} / 4u;
          let component${_} = offset${_} % 4u;
          ${$}[${_}] = ${w}(${h.getByOffset(`index${_}`)}[component${_}]);
        `;g=`
        let outputOffset = global_idx * ${o};
        var data = vec4<u32>(0);
        ${y("data",0,"u32")}
        ${y("data",1,"u32")}
        ${y("data",2,"u32")}
        ${y("data",3,"u32")}
        ${f.setByOffset("global_idx","data")}
      }`}else g=`
        let outputIndices = ${f.offsetToIndices(`global_idx * ${o}`)};
        let inputOffset = ${h.broadcastedIndicesToOffset("outputIndices",f)};
        let data = ${f.type.value}(${h.getByOffset(`inputOffset / ${s}`)});
        ${f.setByOffset("global_idx","data")}
      }`;return`
    ${p.registerUniform("vec_size","u32").declareVariables(h,f)}
    ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${g}`},d=[{type:12,data:u},...I(t,i)];return{name:"Expand",shaderCache:{hint:`${i.length};${s}${o}`,inputDependencies:["rank"]},getShaderSource:l,getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:d})}},Gu=e=>{qu(e.inputs),e.compute(Wu(e.inputs),{inputs:[0]})}}),ju,Hu,zc=C(()=>{ue(),ie(),te(),pn(),ju=e=>{let t=e[0].dataType,r=M.size(e[0].dims),i=M.size(e[1].dims),a=i%4===0,n=s=>{let o=z("x",t,[1],4),u=z("bias",t,[1],4),l=F("y",t,[1],4),d=[{name:"output_vec_size",type:"u32"},{name:"bias_size",type:"u32"}],p=f=>`
      let bias${f}_offset: u32 = (global_idx * 4 + ${f}) % uniforms.bias_size;
      let bias${f} = ${u.getByOffset(`bias${f}_offset / 4`)}[bias${f}_offset % 4];`,h=a?`
      let bias = ${u.getByOffset("global_idx % (uniforms.bias_size / 4)")};`:`${p(0)}${p(1)}${p(2)}${p(3)}
      let bias = ${o.type.value}(bias0, bias1, bias2, bias3);`;return`${s.registerUniforms(d).declareVariables(o,u,l)}

    ${ln(E(t))}

    ${s.mainStart(T)}
      ${s.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${o.getByOffset("global_idx")};
      ${h}
      let x_in = x + bias;
      ${l.setByOffset("global_idx",dn("x_in"))}
    }`};return{name:"FastGeluWithBias",shaderCache:{hint:`${a}`,inputDependencies:["type","type"]},getShaderSource:n,getRunData:s=>({outputs:[{dims:s[0].dims,dataType:s[0].dataType}],programUniforms:[{type:12,data:Math.ceil(r/4)},{type:12,data:i}],dispatchGroup:{x:Math.ceil(r/T/4)}})}},Hu=e=>{e.inputs.length<2||M.size(e.inputs[1].dims)===0?Io(e):e.compute(ju(e.inputs))}}),Ku,Zu,Qu,Xu,Ac=C(()=>{ue(),ie(),b(),te(),Ku=e=>{if(!e||e.length!==2)throw new Error("Gather requires 2 inputs.")},Zu=(e,t)=>{let r=e[0].dims,i=e[1].dims,a=r.length,n=M.normalizeAxis(t.axis,a),s=r.slice(0);s.splice(n,1,...i);let o=r[n],u=e[0].dataType===9?4:1,l=Math.ceil(M.size(s)/u),d=[{type:12,data:l},{type:6,data:o},{type:12,data:n},...I(e[0].dims,e[1].dims,s)],p=h=>{let f=z("data",e[0].dataType,e[0].dims.length,u),g=z("inputIndices",e[1].dataType,e[1].dims.length),y=F("output",e[0].dataType,s.length,u),$=w=>{let S=i.length,x=`var indicesIndices${w}  = ${g.type.indices}(0);`;for(let k=0;k<S;k++)x+=`${S>1?`indicesIndices${w}[${k}]`:`indicesIndices${w}`} = ${s.length>1?`outputIndices${w}[uniforms.axis + ${k}]`:`outputIndices${w}`};`;x+=`
          var idx${w} = ${g.getByIndices(`indicesIndices${w}`)};
          if (idx${w} < 0) {
            idx${w} = idx${w} + uniforms.axisDimLimit;
          }
          var dataIndices${w} : ${f.type.indices};
        `;for(let k=0,B=0;k<a;k++)k===n?(x+=`${a>1?`dataIndices${w}[${k}]`:`dataIndices${w}`} = u32(idx${w});`,B+=S):(x+=`${a>1?`dataIndices${w}[${k}]`:`dataIndices${w}`} = ${s.length>1?`outputIndices${w}[${B}]`:`outputIndices${w}`};`,B++);return x},_;if(e[0].dataType===9){let w=(S,x,k="")=>`
          let outputIndices${x} = ${y.offsetToIndices(`outputOffset + ${x}u`)};
          ${$(x)};
          let offset${x} = ${f.indicesToOffset(`dataIndices${x}`)};
          let index${x} = offset${x} / 4u;
          let component${x} = offset${x} % 4u;
          ${S}[${x}] = ${k}(${f.getByOffset(`index${x}`)}[component${x}]);
        `;_=`
        let outputOffset = global_idx * ${u};
        var value = vec4<u32>(0);
        ${w("value",0,"u32")}
        ${w("value",1,"u32")}
        ${w("value",2,"u32")}
        ${w("value",3,"u32")}
        ${y.setByOffset("global_idx","value")}
      `}else _=`
      let outputIndices = ${y.offsetToIndices("global_idx")};
      ${$("")};
      let value = ${f.getByIndices("dataIndices")};
      ${y.setByOffset("global_idx","value")};
      `;return`
      ${h.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(f,g,y)}
      ${h.mainStart()}
        ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${_}
      }`};return{name:"Gather",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:s,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d}),getShaderSource:p}},Qu=e=>m({axis:e.axis}),Xu=(e,t)=>{let r=e.inputs;Ku(r),e.compute(Zu(e.inputs,t))}}),Yu,Ju,el,Oc=C(()=>{ue(),ie(),te(),Yu=(e,t,r,i,a,n,s,o,u)=>{let l=[{type:12,data:n},{type:12,data:i},{type:12,data:a},{type:12,data:r},{type:12,data:s},{type:12,data:o},{type:12,data:u}],d=[n];l.push(...I(t.dims,d));let p=h=>{let f=z("indices_data",t.dataType,t.dims.length),g=F("input_slice_offsets_data",12,1,1),y=[f,g],$=[{name:"output_size",type:"u32"},{name:"batch_dims",type:"u32"},{name:"input_dims",type:"u32",length:a.length},{name:"sizes_from_slice_dims_data",type:"u32",length:r.length},{name:"num_slices_per_batch",type:"u32"},{name:"input_batch_stride",type:"u32"},{name:"num_slice_dims",type:"u32"}];return`
  ${h.registerUniforms($).declareVariables(...y)}
  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let batch_idx = global_idx / uniforms.num_slices_per_batch;
    let base_offset = batch_idx * uniforms.input_batch_stride;

    let slice_indices_base_offset = global_idx * uniforms.num_slice_dims;
    var relative_slice_offset = 0;
    for (var dim_idx = 0u; dim_idx < uniforms.num_slice_dims; dim_idx ++) {
      var index = i32(indices_data[dim_idx + slice_indices_base_offset].x);
      let input_dim_idx = uniforms.batch_dims + dim_idx;
      if (index < 0) {
        ${a.length===1?"index += i32(uniforms.input_dims);":"index += i32(uniforms.input_dims[input_dim_idx]);"}
      }
      ${r.length===1?"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data);":"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data[dim_idx]);"}
    }

    input_slice_offsets_data[global_idx] =  base_offset + u32(relative_slice_offset);
  }`};return e.compute({name:"computeSliceOffsets",shaderCache:{hint:`${a.length}_${r.length}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:d,dataType:e.inputs[1].dataType}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:l}),getShaderSource:p},{inputs:[t],outputs:[-1]})[0]},Ju=(e,t)=>{let r=e.inputs,i=r[0].dims,a=r[0].dataType,n=r[1].dims,s=n[n.length-1],o=M.sizeToDimension(n,n.length-1),u=M.sizeFromDimension(i,t.batchDims+s),l=M.sizeToDimension(i,t.batchDims),d=M.sizeFromDimension(i,t.batchDims),p=o/l,h=new Array(s),f=u;for(let x=0;x<s;++x)h[s-1-x]=f,f*=i[t.batchDims+s-1-x];let g=Yu(e,r[1],h,t.batchDims,i,o,p,d,s),y=t.batchDims+s;if(y>i.length)throw new Error("last dimension of indices must not be larger than rank of input tensor");let $=n.slice(0,-1).concat(i.slice(y)),_=M.size($),w=[{type:12,data:_},{type:12,data:u},...I(r[0].dims,g.dims,$)],S=x=>{let k=z("data",r[0].dataType,r[0].dims.length),B=z("slice_offsets",12,g.dims.length),D=F("output",r[0].dataType,$.length);return`
          ${x.registerUniform("output_size","u32").registerUniform("slice_size","u32").declareVariables(k,B,D)}
            ${x.mainStart()}
            ${x.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let slice_offset = slice_offsets[global_idx / uniforms.slice_size];
          output[global_idx] = data[u32(slice_offset) + global_idx % uniforms.slice_size];
        }`};e.compute({name:"GatherND",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:$,dataType:a}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:w}),getShaderSource:S},{inputs:[r[0],g]})},el=e=>({batchDims:e.batch_dims,cacheKey:""})}),tl,rl,il,al,Rc=C(()=>{ue(),ie(),b(),te(),tl=(e,t)=>{if(e.length<3||e.length>4)throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");let r=M.normalizeAxis(t.quantizeAxis,e[0].dims.length),i=t.blockSize,a=e[0],n=e[2],s=e.length===4?e[3]:void 0;if(n.dims.length!==a.dims.length||!a.dims.map((o,u)=>u===r?Math.ceil(o/i)===n.dims[u]:o===n.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");if(s){if(s.dataType!==a.dataType)throw new Error("Zero point must have the same data type as the input tensor.");if(s.dims.length!==n.dims.length||!s.dims.map((o,u)=>o===n.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.")}},rl=(e,t)=>{let r=e[0].dims,i=e[1].dims,a=r.length,n=M.normalizeAxis(t.gatherAxis,a),s=M.normalizeAxis(t.quantizeAxis,a),o=r.slice(0);o.splice(n,1,...i);let u=M.size(o),l=e[2].dataType,d=e[0].dataType===22,p=[{type:12,data:u},{type:12,data:s},{type:12,data:n},{type:12,data:t.blockSize},...I(...e.map((f,g)=>f.dims),o)],h=f=>{let g=z("data",e[0].dataType,e[0].dims.length),y=z("inputIndices",e[1].dataType,e[1].dims.length),$=z("scales",e[2].dataType,e[2].dims.length),_=e.length>3?z("zeroPoint",e[3].dataType,e[3].dims.length):void 0,w=F("output",l,o.length),S=[g,y,$];_&&S.push(_);let x=[{name:"output_size",type:"u32"},{name:"quantize_axis",type:"u32"},{name:"gather_axis",type:"u32"},{name:"block_size",type:"u32"}];return`
        ${f.registerUniforms(x).declareVariables(...S,w)}
        ${f.mainStart()}
        let output_indices = ${w.offsetToIndices("global_idx")};
        var indices_indices = ${y.type.indices}(0);
        ${i.length>1?`
          for (var i: u32 = 0; i < ${i.length}; i++) {
            let index = ${w.indicesGet("output_indices","uniforms.gather_axis + i")};
            ${y.indicesSet("indices_indices","i","index")};
          }`:`indices_indices = ${w.indicesGet("output_indices","uniforms.gather_axis")};`};
        var data_indices = ${g.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${w.indicesGet("output_indices","i")};
          ${g.indicesSet("data_indices","i","index")};
        }
        var index_from_indices = ${y.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${r[n]};
        }
        ${g.indicesSet("data_indices","uniforms.gather_axis","u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${o.length}; i++) {
          let index = ${w.indicesGet("output_indices",`i + ${i.length} - 1`)};
          ${g.indicesSet("data_indices","i","index")};
        }
        let data_offset = ${g.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${g.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${d?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${$.indicesGet("data_indices","uniforms.quantize_axis")} / uniforms.block_size;
        ${$.indicesSet("scale_indices","uniforms.quantize_axis","quantize_axis_index")};
        var scale = ${$.getByIndices("scale_indices")};
        ${_?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${_.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${_.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${d?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:"var zero_point = 0"};
        let dequantized_data = ${E(l)}(quantized_data - zero_point) * scale;
        ${w.setByOffset("global_idx","dequantized_data")};
    }`};return{name:"GatherBlockQuantized",shaderCache:{hint:`${t.cacheKey};${e.filter((f,g)=>g!==1).map(f=>f.dims.join("_")).join(";")}`,inputDependencies:Array.from({length:e.length},(f,g)=>"rank")},getRunData:()=>({outputs:[{dims:o,dataType:l}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:p}),getShaderSource:h}},il=(e,t)=>{let r=e.inputs;tl(r,t),e.compute(rl(e.inputs,t))},al=e=>m({blockSize:e.blockSize,gatherAxis:e.gatherAxis,quantizeAxis:e.quantizeAxis})}),nl,sl,ol,ul,Bc=C(()=>{ue(),ie(),b(),te(),nl=e=>{if(!e||e.length!==2)throw new Error("GatherElements requires 2 inputs.");if(e[0].dims.length<1)throw new Error("GatherElements requires that the data input be rank >= 1.");if(e[0].dims.length!==e[1].dims.length)throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},sl=(e,t)=>{let r=e[0].dims,i=e[0].dataType,a=r.length,n=e[1].dims,s=e[1].dataType,o=M.normalizeAxis(t.axis,a),u=r[o],l=n.slice(0),d=M.size(l),p=z("input",i,a),h=z("indicesInput",s,n.length),f=F("output",i,l.length),g=[{type:12,data:d},{type:6,data:u},{type:12,data:o}];return g.push(...I(r,n,l)),{name:"GatherElements",shaderCache:{inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:l,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:g}),getShaderSource:y=>`
      ${y.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(p,h,f)}
      ${y.mainStart()}
      ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${f.offsetToIndices("global_idx")};

      var idx = ${h.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${p.type.indices}(outputIndices);
      ${p.indicesSet("inputIndices","uniforms.axis","u32(idx)")};
      let value = ${p.getByIndices("inputIndices")};

      ${f.setByOffset("global_idx","value")};
  }`}},ol=e=>m({axis:e.axis}),ul=(e,t)=>{let r=e.inputs;nl(r),e.compute(sl(e.inputs,t))}}),ll,dl,pl,cl,Mc=C(()=>{ue(),ie(),te(),ll=e=>{if(!e)throw new Error("Input is missing");if(e.length<2||e.length>3)throw new Error("Invaid input number.");if(e.length===3&&e[2].dims.length>2)throw new Error("Invalid input shape of C");if(e[0].dataType!==e[1].dataType||e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("Input types are mismatched")},dl=(e,t)=>{let r=e[0].dims.slice(),i=e[1].dims.slice(),[a,n,s]=ai.getShapeOfGemmResult(r,t.transA,i,t.transB,e.length===3?e[2].dims:void 0),o=[a,n];if(!o)throw new Error("Can't use gemm on the given tensors");let u=16,l=Math.ceil(n/u),d=Math.ceil(a/u);M.size(o);let p=[{type:12,data:l},{type:12,data:a},{type:12,data:n},{type:12,data:s},{type:1,data:t.alpha},{type:1,data:t.beta}],h=["type","type"];e.length===3&&(p.push(...I(e[2].dims)),h.push("rank")),p.push(...I(o));let f=g=>{let y=z("a",e[0].dataType,e[0].dims),$=z("b",e[1].dataType,e[1].dims),_=null,w=[y,$];e.length===3&&(_=z("c",e[2].dataType,e[2].dims.length),w.push(_));let S=F("output",e[0].dataType,o.length);w.push(S);let x=[{name:"num_tile_n",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}],k="",B="";t.transA&&t.transB?(B=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${y.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${$.type.value}(0);
      }
      `,k="value += tile_a[k][local_id.y] * tile_b[local_id.x][k];"):t.transA&&!t.transB?(B=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${y.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${$.type.value}(0);
      }
      `,k="value += tile_a[k][local_id.y] * tile_b[k][local_id.x];"):!t.transA&&t.transB?(B=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${y.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${$.type.value}(0);
      }
      `,k="value += tile_a[local_id.y][k] * tile_b[local_id.x][k];"):!t.transA&&!t.transB&&(B=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${y.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${$.type.value}(0);
      }
      `,k="value += tile_a[local_id.y][k] * tile_b[k][local_id.x];");let D=t.alpha===1?"":"value *= uniforms.alpha;";return`
  ${g.registerUniforms(x).declareVariables(...w)}
  var<workgroup> tile_a: array<array<${y.type.storage}, ${u}>, ${u}>;
  var<workgroup> tile_b: array<array<${$.type.storage}, ${u}>, ${u}>;
  ${g.mainStart([u,u,1])}
    let tile_col_start = (workgroup_index % uniforms.num_tile_n) * ${u};
    let tile_row_start = (workgroup_index / uniforms.num_tile_n) * ${u};
    let num_tiles = (uniforms.K - 1) / ${u} + 1;
    var k_start = 0u;
    var value = ${S.type.value}(0);
    for (var t: u32 = 0u; t < num_tiles; t++) {
      ${B}
      k_start = k_start + ${u};
      workgroupBarrier();

      for (var k: u32 = 0u; k < ${u}; k++) {
        ${k}
      }
      workgroupBarrier();
    }

    ${D}
    let m = tile_row_start + local_id.y;
    let n = tile_col_start + local_id.x;
    ${_!=null?`let cOffset = ${_.broadcastedIndicesToOffset("vec2(m, n)",S)}; value += ${S.type.value}(uniforms.beta) * ${_.getByOffset("cOffset")};`:""}
    if (m < uniforms.M && n < uniforms.N) {
      output[m * uniforms.N + n] = value;
    }
  }`};return{name:"GemmShared",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:h},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:l*d},programUniforms:p}),getShaderSource:f}},pl=e=>{let t=e.transA,r=e.transB,i=e.alpha,a=e.beta;return{transA:t,transB:r,alpha:i,beta:a,cacheKey:`${e.transA};${e.transB};${e.alpha===1}`}},cl=(e,t)=>{ll(e.inputs),e.compute(dl(e.inputs,t))}}),Zt,er,Hr,Kr,hl,fl,ml,gl,yl,wl,_l,bl,$l,vl,Dc=C(()=>{ue(),ie(),b(),te(),[Zt,er,Hr,Kr]=[0,1,2,3],hl=e=>{if(e[0].dims.length!==4)throw new Error("only 4-D tensor is supported.");if(e[0].dims.length!==e[1].dims.length)throw new Error("input dimensions must be equal to grid dimensions");if(e[0].dims.length-2!==e[1].dims[e[1].dims.length-1])throw new Error(`last dimension of grid must be equal to ${e[0].dims.length-2}`);if(e[0].dims[0]!==e[1].dims[0])throw new Error("grid batch size must match input batch size")},fl=`
  fn gs_get_cubic_coeffs(x: f32) -> vec4<f32> {
    let cubic_alpha = -0.75f;
    let x_abs = abs(x);
    var coeffs: vec4<f32>;
    coeffs[0] = (((cubic_alpha * (x_abs + 1) - 5 * cubic_alpha) * (x_abs + 1) + 8 * cubic_alpha) * (x_abs + 1) - 4 * cubic_alpha);
    coeffs[1] = (((cubic_alpha + 2) * x_abs - (cubic_alpha + 3)) * x_abs * x_abs + 1);
    coeffs[2] = (((cubic_alpha + 2) * (1 - x_abs) - (cubic_alpha + 3)) * (1 - x_abs) * (1 - x_abs) + 1);
    coeffs[3] = (((cubic_alpha * (2 - x_abs) - 5 * cubic_alpha) * (2 - x_abs) + 8 * cubic_alpha) * (2 - x_abs) - 4 * cubic_alpha);
    return coeffs;
  }
`,ml=e=>`
  fn gs_bicubic_interpolate(p: mat4x4<${e}>, x: f32, y: f32) -> ${e} {
    var v: vec4<f32>;
    var coeffs = gs_get_cubic_coeffs(x);
    for (var i = 0; i < 4; i++) {
      v[i] = coeffs[0] * p[i][0] + coeffs[1] * p[i][1] + coeffs[2] * p[i][2] + coeffs[3] * p[i][3];
    }
    coeffs = gs_get_cubic_coeffs(y);
    let pixel = ${e}(coeffs[0] * v[0] + coeffs[1] * v[1] + coeffs[2] * v[2] + coeffs[3] * v[3]);
    return pixel;
  }
`,gl=e=>`
  fn gs_denormalize(n: f32, length: i32) -> f32 {
    ${e.alignCorners===0?`
    // alignCorners: false => [-1, 1] to [-0.5, length - 0.5]
    return ((n + 1.0) * f32(length) - 1.0) / 2.0;
    `:`
    // alignCorners: true => [-1, 1] to [0, length - 1]
    return (n + 1.0) / 2.0 * (f32(length - 1));
    `}
  }
`,yl=e=>`
  ${e.paddingMode==="reflection"?`
      fn gs_reflect(x: i32, x_min: f32, x_max: f32) -> u32 {
        var dx = 0.0;
        var fx = f32(x);
        let range = x_max - x_min;
        if (fx < x_min) {
          dx = x_min - fx;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_min + r;
          } else {
            fx = x_max - r;
          }
        } else if (fx > x_max) {
          dx = fx - x_max;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_max - r;
          } else {
            fx = x_min + r;
          }
        }
        return u32(fx);
      }`:""}
`,wl=(e,t,r)=>`
  fn pixel_at_grid(r: i32, c: i32, H: i32, W: i32, batch: u32, channel: u32, border: vec4<f32>) -> ${t} {
     var pixel = ${t}(0);
     var indices = vec4<u32>(0);
     indices[${Zt}] = batch;
     indices[${er}] = channel;`+(()=>{switch(r.paddingMode){case"zeros":return`
          if (r >= 0 && r < H && c >=0 && c < W) {
            indices[${Hr}] = u32(r);
            indices[${Kr}] = u32(c);
          } else {
            return ${t}(0);
          }
        `;case"border":return`
          indices[${Hr}] = u32(clamp(r, 0, H - 1));
          indices[${Kr}] = u32(clamp(c, 0, W - 1));
        `;case"reflection":return`
          indices[${Hr}] = gs_reflect(r, border[1], border[3]);
          indices[${Kr}] = gs_reflect(c, border[0], border[2]);
        `;default:throw new Error(`padding mode ${r.paddingMode} is not supported`)}})()+`
    return ${e.getByIndices("indices")};
  }
`,_l=(e,t,r)=>(()=>{switch(r.mode){case"nearest":return`
          let result = pixel_at_grid(i32(round(y)), i32(round(x)), H_in, W_in, indices[${Zt}], indices[${er}], border);
        `;case"bilinear":return`
          let x1 = i32(floor(x));
          let y1 = i32(floor(y));
          let x2 = x1 + 1;
          let y2 = y1 + 1;

          let p11 = pixel_at_grid(y1, x1, H_in, W_in, indices[${Zt}], indices[${er}], border);
          let p12 = pixel_at_grid(y1, x2, H_in, W_in, indices[${Zt}], indices[${er}], border);
          let p21 = pixel_at_grid(y2, x1, H_in, W_in, indices[${Zt}], indices[${er}], border);
          let p22 = pixel_at_grid(y2, x2, H_in, W_in, indices[${Zt}], indices[${er}], border);

          let dx2 = ${t}(f32(x2) - x);
          let dx1 = ${t}(x - f32(x1));
          let dy2 = ${t}(f32(y2) - y);
          let dy1 = ${t}(y - f32(y1));
          let result = dy2 * (dx2 * p11 + dx1 * p12) + dy1 * (dx2 * p21 + dx1 * p22);
        `;case"bicubic":return`
          let x0 = i32(floor(x)) - 1;
          let y0 = i32(floor(y)) - 1;
          var p: mat4x4<${t}>;
          for (var h = 0; h < 4; h++) {
            for (var w = 0; w < 4; w++) {
              p[h][w] = pixel_at_grid(h + y0, w + x0, H_in, W_in, indices[${Zt}], indices[${er}], border);
            }
          }

          let dx = x - f32(x0 + 1);
          let dy = y - f32(y0 + 1);
          let result = gs_bicubic_interpolate(p, dx, dy);
        `;default:throw new Error(`mode ${r.mode} is not supported`)}})()+`${e.setByOffset("global_idx","result")}`,bl=(e,t)=>{let r=z("x",e[0].dataType,e[0].dims.length),i=[e[1].dims[0],e[1].dims[1],e[1].dims[2]],a=z("grid",e[1].dataType,i.length,2),n=[e[0].dims[0],e[0].dims[1],e[1].dims[1],e[1].dims[2]];t.format==="NHWC"&&(n=[e[0].dims[0],e[1].dims[1],e[1].dims[2],e[0].dims[3]],[Zt,er,Hr,Kr]=[0,3,1,2]);let s=F("output",e[0].dataType,n.length),o=r.type.value,u=M.size(n),l=[{type:12,data:u},...I(e[0].dims,i,n)],d=p=>`
  ${p.registerUniform("output_size","u32").declareVariables(r,a,s)}
  ${fl}
  ${ml(o)}
  ${gl(t)}
  ${yl(t)}
  ${wl(r,o,t)}

  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let H_in = i32(uniforms.x_shape[${Hr}]);
      let W_in = i32(uniforms.x_shape[${Kr}]);

      ${t.alignCorners===0?`
      let x_min = -0.5;
      let x_max = f32(W_in) - 0.5;
      let y_min = -0.5;
      let y_max = f32(H_in) - 0.5;
      `:`
      let x_min = 0.0;
      let x_max = f32(W_in) - 1.0;
      let y_min = 0.0;
      let y_max = f32(H_in) - 1.0;
      `};
      let border = vec4<f32>(x_min, y_min, x_max, y_max);

      let indices = ${s.offsetToIndices("global_idx")};
      var grid_indices = vec3<u32>(indices[${Zt}], indices[${Hr}], indices[${Kr}]);
      let nxy = ${a.getByIndices("grid_indices")};
      var x = gs_denormalize(f32(nxy[0]), W_in);
      var y = gs_denormalize(f32(nxy[1]), H_in);

      ${_l(s,o,t)}
  }`;return{name:"GridSample",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:["type","type"]},getRunData:p=>{let h=M.size(n);return{outputs:[{dims:n,dataType:p[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:l}},getShaderSource:d}},$l=(e,t)=>{hl(e.inputs),e.compute(bl(e.inputs,t))},vl=e=>m({alignCorners:e.align_corners,mode:e.mode,paddingMode:e.padding_mode,format:e.format})}),wt,xl,Sl,zn,Tl,oa,El,Il=C(()=>{ue(),ie(),b(),ui(),on(),te(),at(),wt=(e,t)=>e.length>t&&e[t].dims.length>0?e[t]:void 0,xl=(e,t)=>{let r=e[0],i=wt(e,1),a=wt(e,2),n=wt(e,3),s=wt(e,4),o=wt(e,5),u=wt(e,6),l=wt(e,7);if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let d=r.dims[0],p=r.dims[1],h=r.dims.length===3?r.dims[2]:t.numHeads*r.dims[4],f=p,g=0,y=0,$=Math.floor(h/t.numHeads);if(u&&l&&M.size(u.dims)&&M.size(l.dims)){if(u.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(u.dims[0]!==d||u.dims[1]!==t.numHeads||u.dims[3]!==$)throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');if(l.dims[0]!==d||l.dims[1]!==t.numHeads||l.dims[3]!==$)throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');if(u.dims[2]!==l.dims[2])throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');if(l.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');g=u.dims[2],y=u.dims[2]}else if(u&&M.size(u.dims)||l&&M.size(l.dims))throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let _;if(i&&M.size(i.dims)>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(i.dims[2]!==r.dims[2])throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');_=2,f=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==$)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');_=5,f=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==$)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');_=0,f=i.dims[2]}}else{if(r.dims.length!==5)throw new Error('Input "query" is expected to have 5 dimensions when key is empty');if(r.dims[2]!==t.numHeads||r.dims[3]!==3)throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');_=3}if(n&&M.size(n.dims)>0){if(n.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimension');if(i&&i.dims.length===5&&i.dims[3]===2)throw new Error("bias is not allowed for packed kv.")}let w=g+f,S=0;if(s&&M.size(s.dims)>0){S=8;let D=s.dims;throw D.length===1?D[0]===d?S=1:D[0]===3*d+2&&(S=3):D.length===2&&D[0]===d&&D[1]===w&&(S=5),S===8?new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)'):new Error("Mask not supported")}let x=!1,k=h;if(a&&M.size(a.dims)>0){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(f!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');k=a.dims[2]}else{if(f!==a.dims[2])throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');k=a.dims[1]*a.dims[3],x=!0}}let B=!1;if(s&&M.size(s.dims)>0)throw new Error("Key padding mask is not supported");if(o&&M.size(o.dims)>0){if(o.dims.length!==4)throw new Error('Input "attention_bias" is expected to have 4 dimensions');if(o.dims[0]!==d||o.dims[1]!==t.numHeads||o.dims[2]!==p||o.dims[3]!==w)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:d,sequenceLength:p,pastSequenceLength:g,kvSequenceLength:f,totalSequenceLength:w,maxSequenceLength:y,inputHiddenSize:0,hiddenSize:h,vHiddenSize:k,headSize:$,vHeadSize:Math.floor(k/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:S,scale:t.scale,broadcastResPosBias:B,passPastInKv:x,qkvFormat:_}},Sl=e=>m({...e}),zn=m({perm:[0,2,1,3]}),Tl=(e,t,r,i,a,n,s)=>{let o=[i,a,n],u=M.size(o),l=[{type:12,data:u},{type:12,data:s},{type:12,data:n}],d=p=>{let h=F("qkv_with_bias",t.dataType,o),f=z("qkv",t.dataType,o),g=z("bias",r.dataType,o),y=[{name:"output_size",type:"u32"},{name:"bias_offset",type:"u32"},{name:"hidden_size",type:"u32"}];return`
  ${p.registerUniforms(y).declareVariables(f,g,h)}
  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`};return e.compute({name:"MultiHeadAttentionAddBias",shaderCache:{inputDependencies:["type","type"]},getRunData:()=>({outputs:[{dims:o,dataType:t.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l}),getShaderSource:d},{inputs:[t,r],outputs:[-1]})[0]},oa=(e,t,r,i,a,n,s,o)=>{let u=n;if(s&&M.size(s.dims)>0){if(i===1)throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");return u=Tl(e,n,s,t,i,r*a,o),u=u.reshape([t,i,r,a]),r===1||i===1?u:e.compute(ft(u,zn.perm),{inputs:[u],outputs:[-1]})[0]}else return n.dims.length===3&&(u=n.reshape([t,i,r,a])),r===1||i===1?u:e.compute(ft(u,zn.perm),{inputs:[u],outputs:[-1]})[0]},El=(e,t)=>{let r=xl(e.inputs,t),i=e.inputs[0],a=wt(e.inputs,1),n=wt(e.inputs,2),s=wt(e.inputs,3),o=wt(e.inputs,4),u=wt(e.inputs,5),l=wt(e.inputs,6),d=wt(e.inputs,7);if(i.dims.length===5)throw new Error("Packed QKV is not implemented");if((a==null?void 0:a.dims.length)===5)throw new Error("Packed KV is not implemented");let p=a&&n&&a.dims.length===4&&n.dims.length===4,h=oa(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,i,s,0);if(p)return ra(e,h,a,n,o,void 0,l,d,u,r);if(!a||!n)throw new Error("key and value must be provided");let f=oa(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.headSize,a,s,r.hiddenSize),g=oa(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.vHeadSize,n,s,2*r.hiddenSize);ra(e,h,f,g,o,void 0,l,d,u,r)}}),kl,Cl,zl,Al,An,Ol,Rl,Bl=C(()=>{ue(),ie(),b(),te(),kl=e=>{if(!e||e.length<1)throw new Error("too few inputs")},Cl=(e,t)=>{let r=[],i=t.numOutputs;return e[1].dims[0]>0&&(e[1].getBigInt64Array().forEach(a=>r.push(Number(a))),i=r.length),m({numOutputs:i,axis:t.axis,splitSizes:r})},zl=e=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${R("uniforms.size_in_split_axis","i",e)}) {
        return i;
    }
    }
    return ${e}u;
}`,Al=e=>{let t=e.length,r=[];for(let i=0;i<t;++i){let a=e[i].setByIndices("indices","input[global_idx]");t===1?r.push(a):i===0?r.push(`if (output_number == ${i}u) { ${a} }`):i===t-1?r.push(`else { ${a} }`):r.push(`else if (output_number == ${i}) { ${a} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${r.join(`
`)}
      }`},An=(e,t)=>{let r=e[0].dims,i=M.size(r),a=e[0].dataType,n=M.normalizeAxis(t.axis,r.length),s=new Array(t.numOutputs),o=z("input",a,r.length),u=new Array(t.numOutputs),l=[],d=[],p=0,h=[{type:12,data:i}];for(let g=0;g<t.numOutputs;g++){p+=t.splitSizes[g],u[g]=p;let y=r.slice();y[n]=t.splitSizes[g],d.push(y),s[g]=F(`output${g}`,a,y.length),l.push({dims:d[g],dataType:e[0].dataType})}h.push({type:12,data:u},...I(r,...d));let f=g=>`
  ${g.registerUniform("input_size","u32").registerUniform("size_in_split_axis","u32",u.length).declareVariables(o,...s)}
  ${zl(u.length)}
  ${Al(s)}

  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${o.offsetToIndices("global_idx")};
    var index = ${o.indicesGet("indices",n)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${R("uniforms.size_in_split_axis","output_number - 1u",u.length)};
      ${o.indicesSet("indices",n,"index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;return{name:"Split",shaderCache:{hint:t.cacheKey,inputDependencies:["rank"]},getShaderSource:f,getRunData:()=>({outputs:l,dispatchGroup:{x:Math.ceil(i/64)},programUniforms:h})}},Ol=(e,t)=>{kl(e.inputs);let r=e.inputs.length===1?t:Cl(e.inputs,t);e.compute(An(e.inputs,r),{inputs:[0]})},Rl=e=>{let t=e.axis,r=e.splitSizes,i=e.numOutputs<0?r.length:e.numOutputs;if(i!==r.length)throw new Error("numOutputs and splitSizes length must be equal");return m({axis:t,numOutputs:i,splitSizes:r})}}),Ml,Da,Dl,Pl=C(()=>{ue(),ie(),b(),te(),Ml=(e,t)=>{let[r,i,a,n]=e,{numHeads:s,rotaryEmbeddingDim:o}=t;if(r.dims.length!==3&&r.dims.length!==4)throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${r.dims.length}`);if(!M.areEqual(i.dims,[])&&!M.areEqual(i.dims,[1])&&i.dims.length!==2)throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${i.dims.length}`);if(a.dims.length!==2)throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${a.dims.length}`);if(n.dims.length!==2)throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${n.dims.length}`);if(!M.areEqual(a.dims,n.dims))throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");if(o>0&&s===0)throw new Error("num_heads must be provided if rotary_embedding_dim is specified");let u=r.dims[0],l=r.dims[r.dims.length-2],d=a.dims[0],p=M.sizeFromDimension(r.dims,1)/l,h=o===0?a.dims[1]*2:p/s;if(o>h)throw new Error("rotary_embedding_dim must be less than or equal to head_size");if(i.dims.length===2){if(u!==i.dims[0])throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${i.dims[0]}`);if(l!==i.dims[1])throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${i.dims[1]}`)}if(h/2!==a.dims[1]&&o/2!==a.dims[1])throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${a.dims[1]}`);if(l>d)throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported")},Da=(e,t)=>{let{interleaved:r,numHeads:i,rotaryEmbeddingDim:a,scale:n}=t,s=e[0].dims[0],o=M.sizeFromDimension(e[0].dims,1),u=e[0].dims[e[0].dims.length-2],l=o/u,d=e[2].dims[1],p=a===0?d*2:l/i,h=new Array(s,u,l/p,p-d),f=M.computeStrides(h),g=[{type:1,data:n},{type:12,data:h},{type:12,data:f},...e[0].dims.length===3?new Array({type:12,data:[o,l,p,1]}):[],...e[0].dims.length===4?new Array({type:12,data:[o,p,u*p,1]}):[],...I(e[0].dims,e[1].dims,e[2].dims,e[3].dims,e[0].dims)],y=$=>{let _=z("input",e[0].dataType,e[0].dims.length),w=z("position_ids",e[1].dataType,e[1].dims.length),S=z("cos_cache",e[2].dataType,e[2].dims.length),x=z("sin_cache",e[3].dataType,e[3].dims.length),k=F("output",e[0].dataType,e[0].dims.length);return $.registerUniforms([{name:"scale",type:"f32"},{name:"global_shape",type:"u32",length:h.length},{name:"global_strides",type:"u32",length:f.length},{name:"input_output_strides",type:"u32",length:f.length}]),`
        ${$.declareVariables(_,w,S,x,k)}

        ${$.mainStart(T)}
          let half_rotary_emb_dim = uniforms.${S.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${$.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${w.broadcastedIndicesToOffset("bsnh.xy",F("",w.type.tensor,2))};
            let position_id =
                u32(${w.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${r});
            let j = i + select(half_rotary_emb_dim, 1, ${r});
            let re = ${_.getByOffset("i")} * ${S.get("position_id","bsnh[3]")} -
                ${_.getByOffset("j")} * ${x.get("position_id","bsnh[3]")};
            ${k.setByOffset("i","re")}
            let im = ${_.getByOffset("i")} * ${x.get("position_id","bsnh[3]")} +
                ${_.getByOffset("j")} * ${S.get("position_id","bsnh[3]")};
            ${k.setByOffset("j","im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${k.setByOffset("k",_.getByOffset("k"))}
          }
        }`};return{name:"RotaryEmbedding",shaderCache:{hint:m({interleaved:r}).cacheKey,inputDependencies:["rank","rank","rank","rank"]},getShaderSource:y,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(M.size(h)/T)},programUniforms:g})}},Dl=(e,t)=>{Ml(e.inputs,t),e.compute(Da(e.inputs,t))}}),Ul,Nl,On,Ll,Vl,Pc=C(()=>{b(),ue(),on(),Il(),Bl(),at(),Pl(),te(),Ul=(e,t)=>{if(t.doRotary&&e.length<=7)throw new Error("cos_cache and sin_cache inputs are required if do_rotary is specified");let r=e[0],i=e[1],a=e[2],n=e[3],s=e[4];if(t.doRotary!==0&&e.length<=7)throw new Error("cos_cast and sin_cache are expected if do_rotary attribute is non-zero");if(t.localWindowSize!==-1)throw new Error("Local attention is not supported");if(t.softcap!==0)throw new Error("Softcap is not supported");if(t.rotaryInterleaved!==0)throw new Error("Rotary interleaved is not supported");if(t.smoothSoftmax)throw new Error("Smooth softmax is not supported");if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let o=r.dims[0],u=r.dims[1],l=r.dims.length===3?r.dims[2]:t.numHeads*r.dims[4],d=u,p=0,h=!i||i.dims.length===0,f=Math.floor(h?l/(t.numHeads+2*t.kvNumHeads):l/t.numHeads);h&&(l=f*t.numHeads);let g=n&&n.dims.length!==0,y=s&&s.dims.length!==0;if(g&&n.dims.length===4&&n.dims[0]===o&&n.dims[1]!==t.kvNumHeads&&n.dims[2]===t.kvNumHeads&&n.dims[3]===f)throw new Error("BSNH pastKey/pastValue is not supported");if(g&&y){if(n.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(s.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');p=n.dims[2]}else if(g||y)throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let $=1;if(i&&i.dims.length>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(r.dims[2]%i.dims[2]!==0)throw new Error('Dimension 2 of "query" should be a multiple of "key"');d=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==f)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');d=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==f)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');d=i.dims[2]}}else{if(r.dims.length!==3&&r.dims.length!==5)throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');if(r.dims.length===5&&(r.dims[2]!==t.numHeads||r.dims[3]!==3))throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');$=3}let _=0,w=!1,S=t.kvNumHeads?f*t.kvNumHeads:l;if(a&&a.dims.length>0){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(d!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');S=a.dims[2]}else{if(d!==a.dims[2])throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');S=a.dims[1]*a.dims[3],w=!0}}let x=e.length>4?e[5]:void 0;if(x&&x.dims.length!==1&&x.dims[0]!==o)throw new Error('Input "seqlens" is expected to have 1 dimension and the same dim 0 as batch_size');return{batchSize:o,sequenceLength:u,pastSequenceLength:p,kvSequenceLength:d,totalSequenceLength:-1,maxSequenceLength:-1,inputHiddenSize:0,hiddenSize:l,vHiddenSize:S,headSize:f,vHeadSize:Math.floor(S/t.kvNumHeads),numHeads:t.numHeads,kvNumHeads:t.kvNumHeads,nReps:t.numHeads/t.kvNumHeads,pastPresentShareBuffer:!1,maskType:_,scale:t.scale,broadcastResPosBias:!1,passPastInKv:w,qkvFormat:$}},Nl=m({perm:[0,2,1,3]}),On=(e,t,r)=>{let i=t,a=r.kvNumHeads;return t.dims.length===3&&r.kvSequenceLength!==0&&(i=t.reshape([r.batchSize,r.kvSequenceLength,a,r.headSize]),i=e.compute(ft(i,Nl.perm),{inputs:[i],outputs:[-1]})[0]),i},Ll=(e,t,r,i)=>{let a=7,n=["type","type"],s=[e*t],o=e*t,u=[{type:12,data:o},{type:12,data:t},{type:12,data:e}],l=d=>{let p=z("seq_lens",r.dataType,r.dims),h=z("total_seq_lens",i.dataType,i.dims),f=F("pos_ids",a,s),g=[{name:"output_size",type:"u32"},{name:"sequence_length",type:"u32"},{name:"batch_size",type:"u32"}];return`
  ${d.registerUniforms(g).declareVariables(p,h,f)}
  ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let total_sequence_length = u32(${h.getByOffset("0")});
    let is_subsequent_prompt = uniforms.sequence_length > 1 && uniforms.sequence_length != total_sequence_length;
    let is_first_prompt = !is_subsequent_prompt && uniforms.sequence_length == total_sequence_length;
    let batch_idx = global_idx / uniforms.sequence_length;
    let sequence_idx = i32(global_idx % uniforms.sequence_length);
    var pos_id: i32 = 0;
    let seqlen = ${p.getByOffset("batch_idx")};
    let total_seqlen = seqlen + 1;
    if (is_first_prompt) {
      if (sequence_idx < total_seqlen) {
        pos_id = sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx","pos_id")}
    } else if (is_subsequent_prompt) {
      let past_seqlen = total_seqlen - i32(uniforms.sequence_length);
      if (past_seqlen + sequence_idx < total_seqlen) {
        pos_id = past_seqlen + sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx","pos_id")}
    } else if (global_idx < uniforms.batch_size) {
      ${f.setByOffset("global_idx","seqlen")}
    };
  }
  `};return{name:"GeneratePositionIds",shaderCache:{hint:`${e};${t}`,inputDependencies:n},getRunData:()=>({outputs:[{dims:s,dataType:a}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:u}),getShaderSource:l}},Vl=(e,t)=>{var x;let r=Ul(e.inputs,t);if(e.inputs[0].dims.length===5)throw new Error("Packed QKV is not implemented");if(((x=e.inputs[1])==null?void 0:x.dims.length)===5)throw new Error("Packed KV is not implemented");let i=e.inputs[0],a=e.inputs[1]&&e.inputs[1].dims.length>0?e.inputs[1]:void 0,n=e.inputs[2]&&e.inputs[2].dims.length>0?e.inputs[2]:void 0,s=e.inputs[3]&&e.inputs[3].dims.length!==0?e.inputs[3]:void 0,o=e.inputs[4]&&e.inputs[4].dims.length!==0?e.inputs[4]:void 0,u=e.inputs.length>4?e.inputs[5]:void 0,l=e.inputs.length>5?e.inputs[6]:void 0,d=r.kvNumHeads?r.kvNumHeads:r.numHeads,p=m({axis:2,numOutputs:3,splitSizes:[r.numHeads*r.headSize,d*r.headSize,d*r.headSize]}),[h,f,g]=!a&&!n?e.compute(An([i],p),{inputs:[i],outputs:[-1,-1,-1]}):[i,a,n],y,$;if(t.doRotary){let k=e.compute(Ll(r.batchSize,r.sequenceLength,u,l),{inputs:[u,l],outputs:[-1]})[0],B=e.inputs[7],D=e.inputs[8],P=m({interleaved:t.rotaryInterleaved!==0,numHeads:r.numHeads,rotaryEmbeddingDim:0,scale:t.scale}),L=[h,k,B,D],j=[-1];y=e.compute(Da(L,P),{inputs:L,outputs:j})[0],L.splice(0,1,f);let oe=m({interleaved:t.rotaryInterleaved!==0,numHeads:r.kvNumHeads,rotaryEmbeddingDim:0,scale:t.scale});$=e.compute(Da(L,oe),{inputs:L,outputs:j})[0]}let _=oa(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,t.doRotary?y:h,void 0,0),w=On(e,t.doRotary?$:f,r),S=On(e,g,r);ra(e,_,w,S,void 0,void 0,s,o,void 0,r,u,l)}}),Rn,ql,Fl,Wl,Uc=C(()=>{ue(),ie(),at(),te(),Rn=(e,t,r,i,a,n,s,o)=>{let u=O(n),l=u===1?"f32":`vec${u}f`,d=u===1?"vec2f":`mat2x${u}f`,p=a*s,h=64;p===1&&(h=256);let f=[a,s,n/u],g=[a,s,2],y=["rank","type","type"],$=[];$.push(...I(f,g));let _=w=>{let S=z("x",t.dataType,3,u),x=z("scale",r.dataType,r.dims),k=z("bias",i.dataType,i.dims),B=F("output",1,3,2),D=[S,x,k,B];return`
  var<workgroup> workgroup_shared : array<${d}, ${h}>;
  const workgroup_size = ${h}u;
  ${w.declareVariables(...D)}
  ${w.mainStart(h)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${l}(0);
    var squared_sum = ${l}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${l}(${S.get("batch","channel","h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${d}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${U("workgroup_shared[0][0]",u)} / f32(hight * ${u});
      let squared_sum_final = ${U("workgroup_shared[0][1]",u)} / f32(hight * ${u});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${o}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`};return e.compute({name:"InstanceNormComputeChannelScaleShift",shaderCache:{hint:`${u};${o};${h}`,inputDependencies:y},getRunData:()=>({outputs:[{dims:g,dataType:1}],dispatchGroup:{x:p},programUniforms:$}),getShaderSource:_},{inputs:[t,r,i],outputs:[-1]})[0]},ql=(e,t,r)=>{let i=t[0].dims,a=i,n=2,s=i[0],o=i[1],u=M.sizeFromDimension(i,n),l=O(u),d=M.size(a)/l,p=Rn(e,t[0],t[1],t[2],s,u,o,r.epsilon),h=[s,o,u/l],f=[s,o],g=["type","none"],y=$=>{let _=z("x",t[0].dataType,h.length,l),w=z("scale_shift",1,f.length,2),S=F("output",t[0].dataType,h.length,l),x=[_,w,S];return`
  ${$.registerUniform("output_size","u32").declareVariables(...x)}
  ${$.mainStart()}
  ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${S.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${w.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${_.getByOffset("global_idx")} * ${S.type.value}(scale_shift.x) + ${S.type.value}(scale_shift.y);
      ${S.setByOffset("global_idx","value")};
  }`};e.compute({name:"InstanceNormalization",shaderCache:{hint:`${l}`,inputDependencies:g},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:[{type:12,data:d},...I(h,f,h)]}),getShaderSource:y},{inputs:[t[0],p]})},Fl=(e,t,r)=>{let i=t[0].dims,a=i,n=i[0],s=i[i.length-1],o=M.sizeFromDimension(i,1)/s,u=O(s),l=M.size(a)/u,d=[{type:12,data:o},{type:12,data:Math.floor(s/u)}],p=["type","type"],h=!1,f=[0,i.length-1];for(let _=0;_<i.length-2;_++)h=h||i[_+1]!==1,f.push(_+1);h=h&&i[i.length-1]!==1;let g=h?e.compute(ft(e.inputs[0],f),{inputs:[e.inputs[0]],outputs:[-1]})[0]:e.inputs[0].reshape(Array.from({length:i.length},(_,w)=>i[f[w]])),y=Rn(e,g,t[1],t[2],n,o,s,r.epsilon),$=_=>{let w=A(t[0].dataType),S=u===1?"vec2f":`mat${u}x2f`,x=D=>{let P=D===0?"x":"y",L=u===1?"f32":`vec${u}f`;switch(u){case 1:return`${w}(${L}(scale.${P}))`;case 2:return`vec2<${w}>(${L}(scale[0].${P}, scale[1].${P}))`;case 4:return`vec4<${w}>(${L}(scale[0].${P}, scale[1].${P}, scale[2].${P}, scale[3].${P}))`;default:throw new Error(`Not supported compoents ${u}`)}},k=z("input",t[0].dataType,t[0].dims,u),B=F("output",t[0].dataType,a,u);return`
  @group(0) @binding(0) var<storage, read> input : array<${k.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${S}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${B.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${_.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${x(0)}, ${x(1)});
  }`};e.compute({name:"InstanceNormalizationNHWC",shaderCache:{hint:`${u}`,inputDependencies:p},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d}),getShaderSource:$},{inputs:[t[0],y]})},Wl=(e,t)=>{t.format==="NHWC"?Fl(e,e.inputs,t):ql(e,e.inputs,t)}}),Gl,jl,Hl,Nc=C(()=>{ue(),ie(),te(),Gl=e=>{if(!e||e.length<2)throw new Error("layerNorm requires at least 2 inputs.")},jl=(e,t,r)=>{let i=t.simplified,a=e[0].dims,n=e[1],s=!i&&e[2],o=a,u=M.normalizeAxis(t.axis,a.length),l=M.sizeToDimension(a,u),d=M.sizeFromDimension(a,u),p=M.size(n.dims),h=s?M.size(s.dims):0;if(p!==d||s&&h!==d)throw new Error(`Size of X.shape()[axis:] == ${d}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${p} and bias size of ${h}`);let f=[];for(let k=0;k<a.length;++k)k<u?f.push(a[k]):f.push(1);let g=O(d),y=["type","type"],$=[{type:12,data:l},{type:1,data:d},{type:12,data:Math.floor(d/g)},{type:1,data:t.epsilon}];s&&y.push("type");let _=r>1,w=r>2,S=k=>{let B=A(e[0].dataType),D=[z("x",e[0].dataType,e[0].dims,g),z("scale",n.dataType,n.dims,g)];s&&D.push(z("bias",s.dataType,s.dims,g)),D.push(F("output",e[0].dataType,o,g)),_&&D.push(F("mean_data_output",1,f)),w&&D.push(F("inv_std_output",1,f));let P=[{name:"norm_count",type:"u32"},{name:"norm_size",type:"f32"},{name:"norm_size_vectorized",type:"u32"},{name:"epsilon",type:"f32"}];return`
  ${k.registerUniforms(P).declareVariables(...D)}
  ${k.mainStart()}
    ${k.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${N("f32",g)};
    var mean_square_vector = ${N("f32",g)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${V(B,g,"x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${U("mean_vector",g)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${U("mean_square_vector",g)} / uniforms.norm_size ${i?"":"- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${V(B,g,"x[j + offset]")};
      let f32scale = ${V(B,g,"scale[j]")};
      output[j + offset] = ${D[0].type.value}((f32input ${i?"":"- mean"}) * inv_std_dev * f32scale
        ${s?`+ ${V(B,g,"bias[j]")}`:""}
      );
    }

    ${_?"mean_data_output[global_idx] = mean":""};
    ${w?"inv_std_output[global_idx] = inv_std_dev":""};
  }`},x=[{dims:o,dataType:e[0].dataType}];return _&&x.push({dims:f,dataType:1}),w&&x.push({dims:f,dataType:1}),{name:"LayerNormalization",shaderCache:{hint:`${g};${r};${i}`,inputDependencies:y},getRunData:()=>({outputs:x,dispatchGroup:{x:Math.ceil(l/64)},programUniforms:$}),getShaderSource:S}},Hl=(e,t)=>{Gl(e.inputs),e.compute(jl(e.inputs,t,e.outputCount))}}),Kl,Zl,Lc=C(()=>{ie(),mn(),_n(),Kl=e=>{if(!e||e.length!==2)throw new Error("MatMul requires 2 inputs.");if(e[0].dims[e[0].dims.length-1]!==e[1].dims[e[1].dims.length-2])throw new Error("shared dimension does not match.")},Zl=e=>{Kl(e.inputs);let t=jt.calcShape(e.inputs[0].dims,e.inputs[1].dims,!0);if(!t)throw new Error("Can't use matmul on the given tensors");let r=t[t.length-1],i=e.inputs[0].dims[e.inputs[0].dims.length-1];if(r<8&&i<8)e.compute(fn(e.inputs,{activation:""},t));else{let a=t[t.length-2],n=M.size(e.inputs[0].dims.slice(0,-2)),s=M.size(e.inputs[1].dims.slice(0,-2));if(n!==1&&a===1&&s===1){let o=e.inputs[0].reshape([1,n,i]),u=e.inputs[1].reshape([1,i,r]),l=[1,n,r],d=[o,u];e.compute(Oa(d,{activation:""},t,l),{inputs:d})}else e.compute(Oa(e.inputs,{activation:""},t))}}}),Ql,Xl,Yl,Jl,ed,Vc=C(()=>{ue(),ie(),b(),te(),Ql=(e,t)=>{if(e.length<3||e.length>4)throw new Error("MatMulNBits requires 3 or 4 inputs");let r=e[0],i=r.dims.length;if(r.dims[i-1]!==t.k)throw new Error("The last dim of input shape does not match the k value");let a=Math.floor((t.k+t.blockSize-1)/t.blockSize),n=t.blockSize/8*t.bits,s=e[1];if(!M.areEqual(s.dims,[t.n,a,n]))throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");let o=e[2].dims;if(M.size(o)!==t.n*a)throw new Error("scales input size error.");if(e.length===4){let u=e[3].dims,l=t.n*(t.bits===8?a:Math.floor((a*t.bits+7)/8));if(M.size(u)!==l)throw new Error("zeroPoints input size error.")}},Xl=(e,t)=>{let r=e[0].dims,i=r.length,a=r[i-2],n=t.k,s=t.n,o=r.slice(0,i-2),u=M.size(o),l=e[1].dims[2]/4,d=e[0].dataType,p=O(t.k),h=O(l),f=O(s),g=o.concat([a,s]),y=a>1&&s/f%2===0?2:1,$=M.size(g)/f/y,_=64,w=[],S=[u,a,n/p],x=M.convertShape(e[1].dims).slice();x.splice(-1,1,l/h),w.push(...I(S)),w.push(...I(x)),w.push(...I(e[2].dims)),e.length===4&&w.push(...I(M.convertShape(e[3].dims)));let k=[u,a,s/f];w.push(...I(k));let B=D=>{let P=S.length,L=z("a",e[0].dataType,P,p),j=z("b",12,x.length,h),oe=z("scales",e[2].dataType,e[2].dims.length),X=[L,j,oe],ne=e.length===4?z("zero_points",12,e[3].dims.length):void 0;ne&&X.push(ne);let Ce=k.length,Ae=F("output",e[0].dataType,Ce,f),J=A(e[0].dataType),ge=(()=>{switch(p){case 1:return`array<${J}, 8>`;case 2:return`mat4x2<${J}>`;case 4:return`mat2x4<${J}>`;default:throw new Error(`${p}-component is not supported.`)}})(),Ve=()=>{let q=`
          // reuse a data
            var input_offset = ${L.indicesToOffset(`${L.type.indices}(batch, row, word_offset)`)};
            var a_data: ${ge};
            for (var j: u32 = 0; j < ${8/p}; j++) {
              a_data[j] = ${L.getByOffset("input_offset")};
              input_offset++;
            }
          `;for(let W=0;W<f*y;W++)q+=`
            b_value = ${h===1?`b${W}_data`:`b${W}_data[i]`};
            b_value_lower = unpack4xU8(b_value & b_mask);
            b_value_upper = unpack4xU8((b_value >> 4) & b_mask);
            b_quantized_values = ${ge}(${Array.from({length:4},(fe,we)=>`${J}(b_value_lower[${we}]), ${J}(b_value_upper[${we}])`).join(", ")});
            b_dequantized_values = ${p===1?`${ge}(${Array.from({length:8},(fe,we)=>`(b_quantized_values[${we}] - ${ne?`zero_point${W}`:"zero_point"}) * scale${W}`).join(", ")});`:`(b_quantized_values - ${ge}(${Array(8).fill(`${ne?`zero_point${W}`:"zero_point"}`).join(",")})) * scale${W};`};
            workgroup_shared[local_id.x * ${y} + ${Math.floor(W/f)}]${f>1?`[${W%f}]`:""} += ${Array.from({length:8/p},(fe,we)=>`${p===1?`a_data[${we}] * b_dequantized_values[${we}]`:`dot(a_data[${we}], b_dequantized_values[${we}])`}`).join(" + ")};
          `;return q},H=()=>{let q=`
            var col_index = col * ${f};
            ${ne?`
            let zero_point_bytes_per_col = (nBlocksPerCol + 1) / 2;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${J}(8);`}
            `;for(let W=0;W<f*y;W++)q+=`
            let scale${W} = ${oe.getByOffset("col_index * nBlocksPerCol + block")};
            ${ne?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block >> 0x1u);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            zero_point_word = ${ne.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${W} = ${J}((zero_point_word) & 0xFu);`:""}
            col_index += 1;`;return q},qe=()=>{let q=`col_index = col * ${f};`;for(let W=0;W<f*y;W++)q+=`
            let b${W}_data = ${j.getByIndices(`${j.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return q+=`
            var b_value: u32;
            let b_mask: u32 = 0x0F0F0F0Fu;
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${ge};
            var b_dequantized_values: ${ge};`,q};return`
        var<workgroup> workgroup_shared: array<${Ae.type.value}, ${y*_}>;
        ${D.declareVariables(...X,Ae)}
        ${D.mainStart([_,1,1])}
          let output_indices = ${Ae.offsetToIndices(`(global_idx / ${_}) * ${y}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${_}) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize/p};
            ${H()}
            for (var word: u32 = 0; word < ${l}; word += ${h}) {
              ${qe()}
              for (var i: u32 = 0; i < ${h}; i++) {
                ${Ve()}
                word_offset += ${8/p};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${y}) {
            var output_value: ${Ae.type.value} = ${Ae.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${_}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${y};
            }
            ${Ae.setByIndices(`${Ae.type.indices}(batch, row, col + local_id.x)`,"output_value")};
          }
        }`};return{name:"MatMulNBits",shaderCache:{hint:`${t.blockSize};${t.bits};${p};${h};${f};${y};${_}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:g,dataType:d}],dispatchGroup:{x:$},programUniforms:w}),getShaderSource:B}},Yl=(e,t)=>{let r=e[0].dims,i=r.length,a=r[i-2],n=t.k,s=t.n,o=r.slice(0,i-2),u=M.size(o),l=e[1].dims[2]/4,d=e[0].dataType,p=O(t.k),h=O(l),f=o.concat([a,s]),g=128,y=s%8===0?8:s%4===0?4:1,$=g/y,_=$*h*8,w=_/p,S=_/t.blockSize,x=M.size(f)/y,k=[],B=[u,a,n/p],D=M.convertShape(e[1].dims).slice();D.splice(-1,1,l/h),k.push(...I(B)),k.push(...I(D)),k.push(...I(e[2].dims)),e.length===4&&k.push(...I(M.convertShape(e[3].dims)));let P=[u,a,s];k.push(...I(P));let L=j=>{let oe=B.length,X=z("a",e[0].dataType,oe,p),ne=z("b",12,D.length,h),Ce=z("scales",e[2].dataType,e[2].dims.length),Ae=[X,ne,Ce],J=e.length===4?z("zero_points",12,e[3].dims.length):void 0;J&&Ae.push(J);let ge=P.length,Ve=F("output",e[0].dataType,ge),H=A(e[0].dataType),qe=()=>{switch(p){case 1:return`
          let a_data0 = vec4<${H}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${H}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${H}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${H}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw new Error(`${p}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${X.type.value}, ${w}>;
        var<workgroup> inter_results: array<array<${Ve.type.value}, ${$}>, ${y}>;
        ${j.declareVariables(...Ae,Ve)}
        ${j.mainStart([$,y,1])}
          let output_indices = ${Ve.offsetToIndices(`workgroup_index * ${y}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${S} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${w};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${w}; a_offset += ${g})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${X.getByIndices(`${X.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${X.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${S} + local_id.x;
            ${J?`
            let zero_point_bytes_per_col = (n_blocks_per_col + 1) / 2;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block >> 0x1u);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            let zero_point_word = ${J.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${H}((zero_point_word) & 0xFu);`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${H}(8);`}
            let scale = ${Ce.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${ne.getByIndices(`${ne.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize/p};
            for (var i: u32 = 0; i < ${h}; i++) {
              ${qe()}
              let b_value = ${h===1?"b_data":"b_data[i]"};
              let b_value_lower = unpack4xU8(b_value & 0x0F0F0F0Fu);
              let b_value_upper = unpack4xU8((b_value >> 4) & 0x0F0F0F0Fu);
              let b_quantized_values = mat2x4<${H}>(${Array.from({length:4},(q,W)=>`${H}(b_value_lower[${W}]), ${H}(b_value_upper[${W}])`).join(", ")});
              let b_dequantized_values = (b_quantized_values - mat2x4<${H}>(${Array(8).fill("zero_point").join(",")})) * scale;
              inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(q,W)=>`${`dot(a_data${W}, b_dequantized_values[${W}])`}`).join(" + ")};
              word_offset += ${8/p};
            }
            workgroupBarrier();
          }

          if (local_idx < ${y}) {
            var output_value: ${Ve.type.value} = ${Ve.type.value}(0);
            for (var b = 0u; b < ${$}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${Ve.setByIndices(`${Ve.type.indices}(batch, row, col + local_idx)`,"output_value")}
            }
          }
        }`};return{name:"BlockwiseMatMulNBits32",shaderCache:{hint:`${t.blockSize};${p};${h};${$};${y}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:f,dataType:d}],dispatchGroup:{x},programUniforms:k}),getShaderSource:L}},Jl=(e,t)=>{Ql(e.inputs,t),t.blockSize===32&&e.adapterInfo.isVendor("intel")&&e.adapterInfo.isArchitecture("gen-12lp")?e.compute(Yl(e.inputs,t)):e.compute(Xl(e.inputs,t))},ed=e=>m(e)}),td,rd,id,ad,nd,sd,od,ud,ld,qc=C(()=>{ue(),ie(),te(),td=e=>{if(!e||e.length<1)throw new Error("Too few inputs");if(e[0].dataType!==1&&e[0].dataType!==10)throw new Error("Input type must be float or float16.");if(e.length>=2){let t=e[0].dims.length*2===e[1].dims[0];if(e.length===4&&(t=e[3].dims[0]*2===e[1].dims[0]),!t)throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].")}},rd=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
            k = i32(${e.indicesGet("indices",a)}) - ${R("uniforms.pads",a,r)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${R("uniforms.x_shape",a,t)})) {
              break;
            }
            offset += k * i32(${R("uniforms.x_strides",a,t)});
        `;return`
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${i}
            value = x[offset];
          }
      `},id=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${R("uniforms.pads",a,r)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${R("uniforms.x_shape",a,t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${R("uniforms.x_shape",a,t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${R("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},ad=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${R("uniforms.pads",a,r)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${R("uniforms.x_shape",a,t)})) {
                  k = i32(${R("uniforms.x_shape",a,t)}) - 1;
                }
                offset += k * i32(${R("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},nd=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${R("uniforms.pads",a,r)};
                if (k < 0)  {
                  k += i32(${R("uniforms.x_shape",a,t)}]);
                }
                if (k >= i32(${R("uniforms.x_shape",a,t)})) {
                  k -= i32(${R("uniforms.x_shape",a,t)});
                }
                offset += k * i32(${R("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},sd=(e,t,r)=>{switch(r.mode){case 0:return rd(e,t,r.pads.length);case 1:return id(e,t,r.pads.length);case 2:return ad(e,t,r.pads.length);case 3:return nd(e,t,r.pads.length);default:throw new Error("Invalid mode")}},od=(e,t)=>{let r=M.padShape(e[0].dims.slice(),t.pads),i=e[0].dims,a=M.size(r),n=[{type:12,data:a},{type:6,data:t.pads}],s=e.length>=3&&e[2].data;t.mode===0&&n.push({type:s?e[2].dataType:1,data:t.value}),n.push(...I(e[0].dims,r));let o=["rank"],u=l=>{let d=F("output",e[0].dataType,r.length),p=z("x",e[0].dataType,i.length),h=p.type.value,f=sd(d,i.length,t),g=[{name:"output_size",type:"u32"},{name:"pads",type:"i32",length:t.pads.length}];return t.mode===0&&g.push({name:"constant_value",type:s?h:"f32"}),`
            ${l.registerUniforms(g).declareVariables(p,d)}
            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${d.offsetToIndices("global_idx")};

            var value = ${h}(0);
            ${f}
            output[global_idx] = value;
        }`};return{name:"Pad",shaderCache:{hint:`${t.mode}${s}`,inputDependencies:o},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(M.size(r)/64)},programUniforms:n}),getShaderSource:u}},ud=(e,t)=>{if(e.length>1){let r=e[1].getBigInt64Array(),i=e.length>=3&&e[2].data?e[2].dataType===10?e[2].getUint16Array()[0]:e[2].getFloat32Array()[0]:0,a=e[0].dims.length,n=new Int32Array(2*a).fill(0);if(e.length>=4){let o=e[3].getBigInt64Array();for(let u=0;u<o.length;u++)n[Number(o[u])]=Number(r[u]),n[Number(o[u])+a]=Number(r[u+o.length])}else r.forEach((o,u)=>n[Number(u)]=Number(o));let s=[];return n.forEach(o=>s.push(o)),{mode:t.mode,value:i,pads:s}}else return t},ld=(e,t)=>{td(e.inputs);let r=ud(e.inputs,t);e.compute(od(e.inputs,r),{inputs:[0]})}}),ua,Bn,Mn,Dn,Pn,dd,pd,Un,Nn,cd,hd,Ln,fd,md,Vn,gd,yd,wd,_d,Fc=C(()=>{et(),ue(),ie(),te(),ua=e=>{if(ee.webgpu.validateInputContent&&(!e||e.length!==1))throw new Error("Pool ops requires 1 input.")},Bn=(e,t,r)=>{let i=t.format==="NHWC",a=e.dims.slice();i&&a.splice(1,0,a.pop());let n=Object.hasOwnProperty.call(t,"dilations"),s=t.kernelShape.slice(),o=t.strides.slice(),u=n?t.dilations.slice():[],l=t.pads.slice();sr.adjustPoolAttributes(r,a,s,o,u,l);let d=sr.computePoolOutputShape(r,a,o,u,s,l,t.autoPad),p=Object.assign({},t);n?Object.assign(p,{kernelShape:s,strides:o,pads:l,dilations:u,cacheKey:t.cacheKey}):Object.assign(p,{kernelShape:s,strides:o,pads:l,cacheKey:t.cacheKey});let h=d.slice();return h.push(h.splice(1,1)[0]),[p,i?h:d]},Mn=(e,t)=>{let r=t.format==="NHWC",i=M.size(e),a=M.size(t.kernelShape),n=[{type:12,data:i},{type:12,data:a}],s=[{name:"outputSize",type:"u32"},{name:"kernelSize",type:"u32"}];if(t.kernelShape.length<=2){let o=t.kernelShape[t.kernelShape.length-1],u=t.strides[t.strides.length-1],l=t.pads[t.pads.length/2-1],d=t.pads[t.pads.length-1],p=!!(l+d);n.push({type:12,data:o},{type:12,data:u},{type:12,data:l},{type:12,data:d}),s.push({name:"kw",type:"u32"},{name:"sw",type:"u32"},{name:"pwStart",type:"u32"},{name:"pwEnd",type:"u32"});let h=!1;if(t.kernelShape.length===2){let f=t.kernelShape[t.kernelShape.length-2],g=t.strides[t.strides.length-2],y=t.pads[t.pads.length/2-2],$=t.pads[t.pads.length-2];h=!!(y+$),n.push({type:12,data:f},{type:12,data:g},{type:12,data:y},{type:12,data:$}),s.push({name:"kh",type:"u32"},{name:"sh",type:"u32"},{name:"phStart",type:"u32"},{name:"phEnd",type:"u32"})}return[n,s,!0,p,h]}else{if(r)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let o=M.computeStrides(t.kernelShape);n.push({type:12,data:o},{type:12,data:t.pads},{type:12,data:t.strides}),s.push({name:"kernelStrides",type:"u32",length:o.length},{name:"pads",type:"u32",length:t.pads.length},{name:"strides",type:"u32",length:t.strides.length});let u=t.pads.reduce((l,d)=>l+d);return[n,s,!!u,!1,!1]}},Dn=(e,t,r,i,a,n,s,o,u,l,d,p)=>{let h=a.format==="NHWC",f=t.type.value,g=F("output",t.type.tensor,i);if(a.kernelShape.length<=2){let y="",$="",_="",w=r-(h?2:1);if(d?y=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${w}] < 0 || xIndices[${w}]
                      >= uniforms.x_shape[${w}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${n}
                }`:y=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${n}
                }`,a.kernelShape.length===2){let S=r-(h?3:2);p?$=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${S}] = indices[${S}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${S}] < 0 || xIndices[${S}] >= uniforms.x_shape[${S}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:$=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${S}] = indices[${S}] * uniforms.sh - uniforms.phStart + j;
                `,_=`
              }
            `}return`
            ${e.registerUniforms(u).declareVariables(t,g)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${g.offsetToIndices("global_idx")};
              var xIndices = ${g.offsetToIndices("global_idx")};

              var value = ${f}(${o});
              var pad = 0;
              ${$}
              ${y}
              ${_}
              ${s}

              output[global_idx] = value;
            }`}else{if(h)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let y=a.kernelShape.length,$=a.pads.length,_="";return l?_=`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset("xIndices")}];
                ${n}
              }`:_=`
              }
              let x_val = x[${t.indicesToOffset("xIndices")}];
              ${n}
            `,`
            ${e.registerUniforms(u).declareVariables(t,g)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${g.offsetToIndices("global_idx")};
              var xIndices = ${g.offsetToIndices("global_idx")};

              var offsets: array<u32, ${y}>;

              var value = ${f}(${o});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${y-1}u; j++) {
                  offsets[j] = offset / ${R("uniforms.kernelStrides","j",y)};
                  offset -= offsets[j] * ${R("uniforms.kernelStrides","j",y)};
                }
                offsets[${y-1}] = offset;

                isPad = false;
                for (var j = ${r-y}u; j < ${r}u; j++) {
                  xIndices[j] = indices[j] * ${R("uniforms.strides",`j - ${r-y}u`,y)}
                    + offsets[j - ${r-y}u] - ${R("uniforms.pads","j - 2u",$)};
                  ${_}
              }
              ${s}

              output[global_idx] = value;
            }`}},Pn=e=>`${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`,dd=e=>`${Pn(e)};${e.countIncludePad}`,pd=e=>`${Pn(e)};${e.storageOrder};${e.dilations}`,Un=e=>({format:e.format,autoPad:["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],ceilMode:e.ceil_mode,kernelShape:e.kernel_shape,strides:e.strides,pads:e.pads}),Nn=(e,t,r,i)=>{let[a,n]=Bn(t,i,r),s=z("x",t.dataType,t.dims.length),o=s.type.value,u="value += x_val;",l="";a.countIncludePad?l+=`value /= ${o}(uniforms.kernelSize);`:l+=`value /= ${o}(i32(uniforms.kernelSize) - pad);`;let[d,p,h,f,g]=Mn(n,a);d.push(...I(t.dims,n));let y=["rank"];return{name:e,shaderCache:{hint:`${i.cacheKey};${h};${f};${g}`,inputDependencies:y},getRunData:()=>({outputs:[{dims:n,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(M.size(n)/64)},programUniforms:d}),getShaderSource:$=>Dn($,s,t.dims.length,n.length,a,u,l,0,p,h,f,g)}},cd=e=>{let t=e.count_include_pad!==0,r=Un(e);if(r.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for AveragePool");let i={countIncludePad:t,...r,cacheKey:""};return{...i,cacheKey:dd(i)}},hd=(e,t)=>{ua(e.inputs),e.compute(Nn("AveragePool",e.inputs[0],!1,t))},Ln={autoPad:"",ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},fd=e=>{let t=e.format;return{format:t,...Ln,cacheKey:t}},md=(e,t)=>{ua(e.inputs),e.compute(Nn("GlobalAveragePool",e.inputs[0],!0,t))},Vn=(e,t,r,i)=>{let[a,n]=Bn(t,i,r),s=`
      value = max(x_val, value);
    `,o="",u=z("x",t.dataType,t.dims.length),l=["rank"],[d,p,h,f,g]=Mn(n,a);return d.push(...I(t.dims,n)),{name:e,shaderCache:{hint:`${i.cacheKey};${h};${f};${g}`,inputDependencies:l},getRunData:()=>({outputs:[{dims:n,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(M.size(n)/64)},programUniforms:d}),getShaderSource:y=>Dn(y,u,t.dims.length,n.length,a,s,o,t.dataType===10?-65504:-1e5,p,h,f,g)}},gd=(e,t)=>{ua(e.inputs),e.compute(Vn("MaxPool",e.inputs[0],!1,t))},yd=e=>{let t=e.storage_order,r=e.dilations,i=Un(e);if(t!==0)throw new Error("column major storage order is not yet supported for MaxPool");if(i.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for MaxPool");let a={storageOrder:t,dilations:r,...i,cacheKey:""};return{...a,cacheKey:pd(a)}},wd=e=>{let t=e.format;return{format:t,...Ln,cacheKey:t}},_d=(e,t)=>{ua(e.inputs),e.compute(Vn("GlobalMaxPool",e.inputs[0],!0,t))}}),bd,$d,vd,xd,Wc=C(()=>{ue(),ie(),b(),te(),bd=(e,t)=>{if(e.length<2||e.length>3)throw new Error("DequantizeLinear requires 2 or 3 inputs.");if(e.length===3&&e[1].dims===e[2].dims)throw new Error("x-scale and x-zero-point must have the same shape.");if(e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[0].dataType===6&&e.length>2)throw new Error("In the case of dequantizing int32 there is no zero point.");if(e[1].dims.length!==0&&e[1].dims.length!==1&&e[1].dims.length!==e[0].dims.length)throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");if(e.length>2){if(e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==e[2].dims.length)throw new Error("scale and zero-point inputs must have the same rank.");if(!e[1].dims.map((r,i)=>r===e[2].dims[i]).reduce((r,i)=>r&&i,!0))throw new Error("scale and zero-point inputs must have the same shape.")}if(t.blockSize>0){if(e[1].dims.length===0||e[1].dims.length===1&&e[1].dims[0]===1)throw new Error("blockSize must be set only for block quantization.");if(!e[1].dims.map((a,n)=>n===t.axis||a===e[0].dims[n]).reduce((a,n)=>a&&n,!0))throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");if(e[1].dims.length!==e[0].dims.length)throw new Error("For block qunatization the scale input rank must be the same as the x rank.");let r=e[0].dims[t.axis],i=e[1].dims[t.axis];if(t.blockSize<Math.ceil(r/i)||t.blockSize>Math.ceil(r/(i-1)-1))throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].")}},$d=(e,t)=>{let r=M.normalizeAxis(t.axis,e[0].dims.length),i=e[0].dataType,a=i===3,n=e[0].dims,s=e[1].dataType,o=M.size(n),u=i===3||i===2,l=u?[Math.ceil(M.size(e[0].dims)/4)]:e[0].dims,d=e[1].dims,p=e.length>2?e[2]:void 0,h=p?u?[Math.ceil(M.size(p.dims)/4)]:p.dims:void 0,f=d.length===0||d.length===1&&d[0]===1,g=f===!1&&d.length===1,y=O(o),$=f&&(!u||y===4),_=$?y:1,w=$&&!u?y:1,S=z("input",u?12:i,l.length,w),x=z("scale",s,d.length),k=p?z("zero_point",u?12:i,h.length):void 0,B=F("output",s,n.length,_),D=[S,x];k&&D.push(k);let P=[l,d];p&&P.push(h);let L=[{type:12,data:o/_},{type:12,data:r},{type:12,data:t.blockSize},...I(...P,n)],j=oe=>{let X=[{name:"output_size",type:"u32"},{name:"axis",type:"u32"},{name:"block_size",type:"u32"}];return`
      ${oe.registerUniforms(X).declareVariables(...D,B)}
      ${oe.mainStart()}
          ${oe.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${B.offsetToIndices("global_idx")};

          // Set input x
          ${u?`
            let input = ${S.getByOffset("global_idx / 4")};
            let x_vec = ${a?"unpack4xI8(input)":"unpack4xU8(input)"};
            let x_value = ${_===1?"x_vec[global_idx % 4]":"x_vec"};`:`let x_value = ${S.getByOffset("global_idx")};`};

          // Set scale input
          ${f?`let scale_value= ${x.getByOffset("0")}`:g?`
            let scale_index = ${B.indicesGet("output_indices","uniforms.axis")};
            let scale_value= ${x.getByOffset("scale_index")};`:`
            var scale_indices: ${x.type.indices} = output_indices;
            let index = ${x.indicesGet("scale_indices","uniforms.axis")} / uniforms.block_size;
            ${x.indicesSet("scale_indices","uniforms.axis","index")};
            let scale_value= ${x.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${k?f?u?`
                let zero_point_input = ${k.getByOffset("0")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${k.getByOffset("0")}`:g?u?`
                let zero_point_index = ${B.indicesGet("output_indices","uniforms.axis")};
                let zero_point_input = ${k.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${B.indicesGet("output_indices","uniforms.axis")};
                let zero_point_value = ${k.getByOffset("zero_point_index")};`:u?`
                let zero_point_offset = ${x.indicesToOffset("scale_indices")};
                let zero_point_input = ${k.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${k.getByIndices("scale_indices")};`:`let zero_point_value = ${u?a?"i32":"u32":S.type.value}(0);`};
      // Compute and write output
      ${B.setByOffset("global_idx",`${B.type.value}(x_value - zero_point_value) * scale_value`)};
      }`};return{name:"DequantizeLinear",shaderCache:{hint:t.cacheKey,inputDependencies:k?["rank","rank","rank"]:["rank","rank"]},getShaderSource:j,getRunData:()=>({outputs:[{dims:n,dataType:s}],dispatchGroup:{x:Math.ceil(o/_/64),y:1,z:1},programUniforms:L})}},vd=(e,t)=>{bd(e.inputs,t),e.compute($d(e.inputs,t))},xd=e=>m({axis:e.axis,blockSize:e.blockSize})}),Sd,Td,Ed,Gc=C(()=>{et(),ue(),te(),Sd=(e,t,r)=>{let i=e===t,a=e<t&&r<0,n=e>t&&r>0;if(i||a||n)throw new Error("Range these inputs' contents are invalid.")},Td=(e,t,r,i)=>{let a=Math.abs(Math.ceil((t-e)/r)),n=[a],s=a,o=[{type:12,data:s},{type:i,data:e},{type:i,data:r},...I(n)],u=l=>{let d=F("output",i,n.length),p=d.type.value,h=[{name:"outputSize",type:"u32"},{name:"start",type:p},{name:"delta",type:p}];return`
        ${l.registerUniforms(h).declareVariables(d)}
        ${l.mainStart()}
        ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${p}(global_idx) * uniforms.delta;
      }`};return{name:"Range",shaderCache:{hint:`${i}`},getShaderSource:u,getRunData:()=>({outputs:[{dims:n,dataType:i}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:o})}},Ed=e=>{let t=0,r=0,i=0;e.inputs[0].dataType===6?(t=e.inputs[0].getInt32Array()[0],r=e.inputs[1].getInt32Array()[0],i=e.inputs[2].getInt32Array()[0]):e.inputs[0].dataType===1&&(t=e.inputs[0].getFloat32Array()[0],r=e.inputs[1].getFloat32Array()[0],i=e.inputs[2].getFloat32Array()[0]),ee.webgpu.validateInputContent&&Sd(t,r,i),e.compute(Td(t,r,i,e.inputs[0].dataType),{inputs:[]})}}),Id,kd,Cd,zd,jc=C(()=>{ue(),ie(),b(),te(),Id=(e,t,r,i)=>{if(e!=="none"&&i!=="i32"&&i!=="u32"&&i!=="f32")throw new Error(`Input ${i} is not supported with reduction ${e}.`);let a=`{
                var oldValue = 0;
                loop {
                  let newValueF32 =`,n=`;
                  let newValue = bitcast<i32>(newValueF32);
                  let res = atomicCompareExchangeWeak(&${t}, oldValue, newValue);
                  if res.exchanged {
                    break;
                  }
                  oldValue = res.old_value;
                }
              }`;switch(e){case"none":return`${t}=${r};`;case"add":return i==="i32"||i==="u32"?`atomicAdd(&${t}, bitcast<${i}>(${r}));`:`
              ${a}bitcast<${i}>(oldValue) + (${r})${n}`;case"max":return i==="i32"||i==="u32"?`atomicMax(&${t}, bitcast<${i}>(${r}));`:`
                ${a}max(bitcast<f32>(oldValue), (${r}))${n}`;case"min":return i==="i32"||i==="u32"?`atomicMin(&${t}, bitcast<${i}>(${r}));`:`${a}min(bitcast<${i}>(oldValue), (${r}))${n}`;case"mul":return`${a}(bitcast<${i}>(oldValue) * (${r}))${n}`;default:throw new Error(`Reduction ${e} is not supported.`)}},kd=(e,t)=>{let r=e[0].dims,i=e[1].dims,a=r,n=1,s=Math.ceil(M.sizeToDimension(i,i.length-1)/n),o=i[i.length-1],u=M.sizeFromDimension(r,o),l=[{type:12,data:s},{type:12,data:o},{type:12,data:u},...I(e[1].dims,e[2].dims,a)],d=p=>{let h=z("indices",e[1].dataType,e[1].dims.length),f=z("updates",e[2].dataType,e[2].dims.length,n),g=t.reduction!=="none"&&t.reduction!==""?Le("output",e[0].dataType,a.length):F("output",e[0].dataType,a.length,n);return`
      ${p.registerUniform("output_size","u32").registerUniform("last_index_dimension","u32").registerUniform("num_updates_elements","u32").declareVariables(h,f,g)}
      ${p.mainStart()}
        ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
  var data_offset = 0u;
  let indices_start = uniforms.last_index_dimension * global_idx;
  let indices_end = indices_start + uniforms.last_index_dimension;
  for (var i = indices_start; i < indices_end; i++) {
    var index = i32(indices[i].x);
    ${e[0].dims.length===1?`
    let element_count_dim = uniforms.output_strides;
    let dim_value = uniforms.output_shape;`:`
    let element_count_dim = uniforms.output_strides[i - indices_start];
    let dim_value = uniforms.output_shape[i - indices_start];`}
    if (index >= 0) {
      if (index >= i32(dim_value)) {
        index = i32(dim_value - 1);
      }
    } else {
      if (index < -i32(dim_value)) {
        index = 0;
      } else {
        index += i32(dim_value);
      }
    }
    data_offset += u32((u32(index) * element_count_dim));
  }

  for (var i = 0u; i < uniforms.num_updates_elements; i++) {
    let value = updates[uniforms.num_updates_elements * global_idx + i];
    ${Id(t.reduction,"output[data_offset + i]","value",g.type.value)}
  }

      }`};return{name:"ScatterND",shaderCache:{hint:`${t.cacheKey}_${t.reduction}`,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:a,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:l}),getShaderSource:d}},Cd=e=>m({reduction:e.reduction}),zd=(e,t)=>{e.compute(kd(e.inputs,t),{inputs:[e.inputs[1],e.inputs[2]],outputs:[]})}}),Ad,Od,Rd,qn,Bd,Md,Dd,Pd,Ud,Nd,Ld,Vd,Fn,qd,Fd,Wd,Gd,jd,Hd,Kd,Hc=C(()=>{ue(),ie(),b(),te(),Ad=(e,t)=>{if(e.every(r=>r>0||(()=>{throw new Error("Resize requires scales input values to be positive")})),e.length>0){if(t.mode==="linear"){if(!(e.length===2||e.length===3||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1||e.length===5&&e[0]===1&&e[1]===1))throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(t.mode==="cubic"&&!(e.length===2||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1))throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode")}},Od=(e,t,r)=>{t.every(a=>a>=0&&a<r||(()=>{throw new Error("Resize requires axes input values to be positive and less than rank")}));let i=new Array(r).fill(1);return t.forEach((a,n)=>i[a]=e[n]),i},Rd=(e,t,r,i,a,n)=>{let[s,o,u]=r>10?[1,2,3]:[-1,e.length>1?1:-1,-1],l=e[0].dims.length;if(s>0&&e.length>s&&e[s].dims.length>0)e[s].getFloat32Array().forEach(d=>n.push(d));else if(t.coordinateTransformMode==="tf_crop_and_resize")throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");if(o>0&&e.length>o&&e[o].dims.length===1&&e[o].dims[0]>0){if(e[o].getFloat32Array().forEach(d=>i.push(d)),i.length!==0&&i.length!==l&&r>=18&&i.length!==t.axes.length)throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");Ad(i,t),t.axes.length>0&&Od(i,t.axes,l).forEach((d,p)=>i[p]=d)}if(u>0&&e.length>u&&e[u].dims.length===1&&e[u].dims[0]>0&&(e[u].getBigInt64Array().forEach(d=>a.push(Number(d))),a.length!==0&&a.length!==l&&r>=18&&a.length!==t.axes.length))throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");if(t.axes.length>0){if(i.length!==0&&i.length!==t.axes.length)throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');if(a.length!==0&&a.length!==t.axes.length)throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified')}if(typeof i<"u"&&typeof a<"u"&&i.length>0&&a.length>l)throw new Error("Resize requires only of scales or sizes to be specified")},qn=(e,t,r,i)=>`
  // The whole part and the fractional part are calculated separately due to inaccuracy of floating
  // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
  // offset-by-one error later in floor().
  let big = (${e}) * (${t});
  let whole = ${i}(big / (${r}));
  let fract = ${i}(big % (${r})) / ${i}(${r});
  return whole + fract;
`,Bd=(e,t)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { `+(()=>{switch(e){case"asymmetric":return`
          if (xScale < 1.0 || floor(xScale) != xScale) {
            return ${t}(xResized) / ${t}(xScale);
          } else {
            ${qn("xResized","lengthOriginal","lengthResized",t)}
          }
        `;case"pytorch_half_pixel":return`if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case"tf_half_pixel_for_nn":return`return (${t}(xResized) + 0.5) / ${t}(xScale);`;case"align_corners":return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    ${qn("xResized","lengthOriginal - 1","lengthResized - 1",t)}
                  }`;case"tf_crop_and_resize":return`if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;case"half_pixel_symmetric":return`const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;case"half_pixel":return`return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;default:throw new Error(`Coordinate transform mode ${e} is not supported`)}})()+"}",Md=(e,t,r)=>`fn getNearestPixelFromOriginal(xOriginal: ${r}, isDownSample: bool) -> ${r} {`+(()=>{switch(e){case"round_prefer_ceil":return"if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";case"floor":return"return floor(xOriginal);";case"ceil":return"return ceil(xOriginal);";case"round_prefer_floor":return"if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";case"simple":default:if(t<11)return"if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";throw new Error(`Nearest mode ${e} is not supported`)}})()+"}",Dd=(e,t,r)=>{let i=new Array(r).fill(0).concat(new Array(r).fill(1)),a=e.length===0?i:e.slice();return t.length>0?(t.forEach((n,s)=>{i[n]=a[s],i[s+r]=a[t.length+s]}),i):a},Pd=(e,t,r,i)=>{let a=[];if(r.length>0)if(i.length>0){if(e.forEach(n=>a.push(n)),Math.max(...i)>e.length)throw new Error("axes is out of bound");i.forEach((n,s)=>a[n]=r[s])}else r.forEach(n=>a.push(n));else{if(t.length===0)throw new Error("Resize requires either scales or sizes.");a=e.map((n,s)=>Math.round(n*t[s]))}return a},Ud=(e,t,r)=>{let i=(()=>{switch(r.keepAspectRatioPolicy){case"not_larger":return r.axes.length>0?Math.min(...r.axes.map(n=>t[n]),Number.MAX_VALUE):Math.min(...t,Number.MAX_VALUE);case"not_smaller":return r.axes.length>0?Math.max(...r.axes.map(n=>t[n]),Number.MIN_VALUE):Math.max(...t,Number.MIN_VALUE);default:throw new Error(`Keep aspect ratio policy ${r.keepAspectRatioPolicy} is not supported`)}})();t.fill(1,0,t.length);let a=e.slice();return r.axes.length>0?(r.axes.forEach(n=>t[n]=i),r.axes.forEach(n=>a[n]=Math.round(e[n]*t[n]))):(t.fill(i,0,t.length),a.forEach((n,s)=>a[s]=Math.round(n*t[s]))),a},Nd=(e,t,r,i,a)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${r.length}> {
      var original_indices: array<${e.type.value}, ${r.length}>;
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${e.indicesGet("output_indices","i")};
        var scale = ${R("uniforms.scales","i",i)};
        var roi_low = ${R("uniforms.roi","i",a)};
        var roi_hi = ${R("uniforms.roi",`i + ${t.length}`,a)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${R("uniforms.input_shape","i",t.length)};
          var output_shape_i = ${R("uniforms.output_shape","i",r.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,Ld=(e,t,r,i,a,n,s)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${i.length}; i++) {
        var output_index = ${t.indicesGet("output_indices","i")};
        var input_index: u32;
        var scale = ${R("uniforms.scales","i",a)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${R("uniforms.roi","i",n)};
          var roi_hi = ${R("uniforms.roi",`i + ${r.length}`,n)};
          var input_shape_i = ${R("uniforms.input_shape","i",r.length)};
          var output_shape_i = ${R("uniforms.output_shape","i",i.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${s} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet("input_indices","i","input_index")}
      }
      return input_indices;
    }`,Vd=(e,t)=>`
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet("input_indices","i")};
        if (input_index < 0 || input_index >= ${R("uniforms.input_shape","i",t.length)}) {
          return false;
        }
      }
      return true;
    }`,Fn=(e,t,r,i)=>e.rank>i?`
    ${e.indicesSet("input_indices",t,"channel")};
    ${e.indicesSet("input_indices",r,"batch")};
`:"",qd=(e,t,r,i,a)=>{let[n,s,o,u]=r.length===2?[-1,0,1,-1]:[0,2,3,1],l=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${l} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",s,`max(0, min(row, ${r[s]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(col, ${r[o]} - 1))`)};
      ${Fn(e,u,n,2)}
      return ${e.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${l} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${l} = originalIndices[${s}];
      var col:${l} = originalIndices[${o}];
      ${i?`if (row < 0 || row > (${r[s]} - 1) || col < 0 || col > (${r[o]} - 1)) {
        return ${a};
      }`:""};
      row = max(0, min(row, ${r[s]} - 1));
      col = max(0, min(col, ${r[o]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${r.length>2?`u32(originalIndices[${u}])`:"0"};
      var batch: u32 =  ${r.length>2?`u32(originalIndices[${n}])`:"0"};
      var x11: ${l} = getInputValue(batch, channel, row1, col1);
      var x12: ${l} = getInputValue(batch, channel, row1, col2);
      var x21: ${l} = getInputValue(batch, channel, row2, col1);
      var x22: ${l} = getInputValue(batch, channel, row2, col2);
      var dx1: ${l} = abs(row - ${l}(row1));
      var dx2: ${l} = abs(${l}(row2) - row);
      var dy1: ${l} = abs(col - ${l}(col1));
      var dy2: ${l} = abs(${l}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},Fd=(e,t,r,i,a,n,s,o,u,l)=>{let d=r.length===2,[p,h]=d?[0,1]:[2,3],f=e.type.value,g=y=>{let $=y===p?"row":"col";return`
      fn ${$}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${f} {
        var output_index = ${t.indicesGet("output_indices",y)};
        var originalIdx: ${f} = getOriginalCoordinateFromResizedCoordinate(output_index, ${a[y]},
        ${i[y]}, ${r[y]}, ${n[y]}, ${n[y]} + ${r.length});
        var fractOriginalIdx: ${f} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${o} && (originalIdx < 0 || originalIdx > (${r[y]} - 1))) {
          return ${u};
        }
        var data: array<${f}, 4> = array<${f}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${$}: ${f} = originalIdx + ${f}(i);
          if (${$} < 0 || ${$} >= ${r[y]}) {
            ${l?`coefs[i + 1] = 0.0;
                        continue;`:o?`return ${u};`:`${$} = max(0, min(${$}, ${r[y]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet("input_indices_copy",y,`u32(${$})`)};
          data[i + 1] = ${y===p?e.getByIndices("input_indices_copy"):"rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${g(p)};
    ${g(h)};
  fn getCubicInterpolationCoefs(s: ${f}) -> array<${f}, 4> {
    var absS = abs(s);
    var coeffs: array<${f}, 4> = array<${f}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${f} = 1.0 - absS;
    var twoMinusAbsS: ${f} = 2.0 - absS;
    var onePlusAbsS: ${f} = 1.0 + absS;
    coeffs[0] = ((${s} * onePlusAbsS - 5 * ${s}) * onePlusAbsS + 8 * ${s}) * onePlusAbsS - 4 * ${s};
    coeffs[1] = ((${s} + 2) * absS - (${s} + 3)) * absS * absS + 1;
    coeffs[2] = ((${s} + 2) * oneMinusAbsS - (${s} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${s} * twoMinusAbsS - 5 * ${s}) * twoMinusAbsS + 8 * ${s}) * twoMinusAbsS - 4 * ${s};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${f}, 4>, coefs: array<${f}, 4>) -> ${f} {
    var coefsSum: ${f} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${f} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},Wd=(e,t,r,i,a)=>{let[n,s,o,u,l]=r.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],d=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${d} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",s,`max(0, min(depth, ${r[s]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(height, ${r[o]} - 1))`)};
      ${e.indicesSet("input_indices",u,`max(0, min(width, ${r[u]} - 1))`)};
      ${Fn(e,l,n,3)}
      return ${e.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${d} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${d} = originalIndices[${s}];
      var height:${d} = originalIndices[${o}];
      var width:${d} = originalIndices[${u}];
      ${i?`if (depth < 0 || depth > (${r[s]} - 1) || height < 0 || height > (${r[o]} - 1) || width < 0 || (width > ${r[u]} - 1)) {
      return ${a};
        }`:""};

    depth = max(0, min(depth, ${r[s]} - 1));
      height = max(0, min(height, ${r[o]} - 1));
      width = max(0, min(width, ${r[u]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${r.length>3?`u32(originalIndices[${l}])`:"0"};
      var batch: u32 =  ${r.length>3?`u32(originalIndices[${n}])`:"0"};

      var x111: ${d} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${d} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${d} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${d} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${d} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${d} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${d} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${d} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${d} = abs(depth - ${d}(depth1));
      var dx2: ${d} = abs(${d}(depth2) - depth);
      var dy1: ${d} = abs(height - ${d}(height1));
      var dy2: ${d} = abs(${d}(height2) - height);
      var dz1: ${d} = abs(width - ${d}(width1));
      var dz2: ${d} = abs(${d}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},Gd=(e,t,r,i,a,n)=>{let s=e.dims,o=Dd(n,t.axes,s.length),u=Pd(s,i,a,t.axes),l=i.slice();i.length===0&&(l=s.map((w,S)=>w===0?1:u[S]/w),t.keepAspectRatioPolicy!=="stretch"&&(u=Ud(s,l,t)));let d=F("output",e.dataType,u.length),p=z("input",e.dataType,s.length),h=M.size(u),f=s.length===u.length&&s.every((w,S)=>w===u[S]),g=t.coordinateTransformMode==="tf_crop_and_resize",y=t.extrapolationValue,$=p.type.value,_=w=>`
      ${f?"":`
      ${Bd(t.coordinateTransformMode,$)};
      ${(()=>{switch(t.mode){case"nearest":return`
              ${Vd(p,s)};
              ${Md(t.nearestMode,r,$)};
              ${Ld(p,d,s,u,l.length,o.length,g)};
              `;case"linear":return`
              ${Nd(d,s,u,l.length,o.length)};
              ${(()=>{if(s.length===2||s.length===4)return`${qd(p,d,s,g,y)}`;if(s.length===3||s.length===5)return`${Wd(p,d,s,g,y)}`;throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.")})()};
            `;case"cubic":return`
            ${(()=>{if(s.length===2||s.length===4)return`${Fd(p,d,s,u,l,o,t.cubicCoeffA,g,t.extrapolationValue,t.excludeOutside)}`;throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.")})()};
            `;default:throw Error("Invalid resize mode")}})()};
      `}
      ${w.registerUniform("output_size","u32").registerUniform("scales","f32",l.length).registerUniform("roi","f32",o.length).declareVariables(p,d)}
      ${w.mainStart()}
        ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${f?"output[global_idx] = input[global_idx];":`
        let output_indices = ${d.offsetToIndices("global_idx")};
        var input_indices: ${p.type.indices};
        ${(()=>{switch(t.mode){case"nearest":return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${p.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;case"linear":return`output[global_idx] = ${s.length===2||s.length===4?"bilinearInterpolation":"trilinearInterpolation"}(output_indices);`;case"cubic":return"output[global_idx] = bicubicInterpolation(output_indices);";default:throw Error(`Unsupported resize mode: ${t.mode}`)}})()};
`}
      }`;return{name:"Resize",shaderCache:{hint:`${t.cacheKey}|${r}|${l.length>0?t.mode==="cubic"?l:l.length:""}|${a.length>0?a:""}|${o.length>0?o:""}|${f}|${t.mode==="nearest"?s.length:s}`,inputDependencies:["rank"]},getShaderSource:_,getRunData:()=>({outputs:[{dims:u,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:[{type:12,data:h},{type:1,data:l},{type:1,data:o},...I(s,u)]})}},jd=e=>{let t=e.customDataBuffer;return new Uint32Array(t,t.byteOffset,1)[0]},Hd=(e,t)=>{let r=[],i=[],a=[],n=jd(e);if(t.antialias!==0)throw Error("Only default value (0) for Antialias attribute is supported");Rd(e.inputs,t,n,r,i,a),e.compute(Gd(e.inputs[0],t,n,r,i,a),{inputs:[0]})},Kd=e=>{let t=e.antialias,r=e.axes,i=e.coordinateTransformMode,a=e.cubicCoeffA,n=e.excludeOutside!==0,s=e.extrapolationValue,o=e.keepAspectRatioPolicy,u=e.mode,l=e.nearestMode===""?"simple":e.nearestMode;return m({antialias:t,axes:r,coordinateTransformMode:i,cubicCoeffA:a,excludeOutside:n,extrapolationValue:s,keepAspectRatioPolicy:o,mode:u,nearestMode:l})}}),Zd,Qd,Xd,Kc=C(()=>{ue(),ie(),te(),Zd=e=>{if(!e||e.length<3)throw new Error("layerNorm requires at least 3 inputs.");let t=e[0],r=e[1],i=e[2];if(t.dataType!==r.dataType||t.dataType!==i.dataType)throw new Error("All inputs must have the same data type");if(t.dims.length!==3&&t.dims.length!==2)throw new Error("Input must be 2D or 3D");if(r.dims.length!==3&&r.dims.length!==2)throw new Error("Skip must be 2D or 3D");let a=t.dims[t.dims.length-1],n=t.dims[t.dims.length-2];if(r.dims[r.dims.length-1]!==a)throw new Error("Skip must have the same hidden size as input");if(r.dims[r.dims.length-2]!==n)throw new Error("Skip must have the same sequence length as input");if(i.dims.length!==1)throw new Error("Gamma must be 1D");if(i.dims[i.dims.length-1]!==a)throw new Error("Gamma must have the same hidden size as input");if(e.length>3){let s=e[3];if(s.dims.length!==1)throw new Error("Beta must be 1D");if(s.dims[s.dims.length-1]!==a)throw new Error("Beta must have the same hidden size as input")}if(e.length>4){let s=e[4];if(s.dims.length!==1)throw new Error("Bias must be 1D");if(s.dims[s.dims.length-1]!==a)throw new Error("Bias must have the same hidden size as input")}},Qd=(e,t,r,i)=>{let a=t.simplified,n=e[0].dims,s=M.size(n),o=n,u=s,l=n.slice(-1)[0],d=i?n.slice(0,-1).concat(1):[],p=!a&&e.length>3,h=e.length>4,f=i&&r>1,g=i&&r>2,y=r>3,$=64,_=O(l),w=[{type:12,data:u},{type:12,data:_},{type:12,data:l},{type:1,data:t.epsilon}],S=k=>{let B=[{name:"output_size",type:"u32"},{name:"components",type:"u32"},{name:"hidden_size",type:"u32"},{name:"epsilon",type:"f32"}],D=[z("x",e[0].dataType,e[0].dims,_),z("skip",e[1].dataType,e[1].dims,_),z("gamma",e[2].dataType,e[2].dims,_)];p&&D.push(z("beta",e[3].dataType,e[3].dims,_)),h&&D.push(z("bias",e[4].dataType,e[4].dims,_)),D.push(F("output",e[0].dataType,o,_)),f&&D.push(F("mean_output",1,d)),g&&D.push(F("inv_std_output",1,d)),y&&D.push(F("input_skip_bias_sum",e[0].dataType,o,_));let P=A(e[0].dataType),L=A(1,_);return`

      ${k.registerUniforms(B).declareVariables(...D)}
      var<workgroup> sum_shared : array<${L}, ${$}>;
      var<workgroup> sum_squared_shared : array<${L}, ${$}>;

      ${k.mainStart([$,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / ${$};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${$};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${$-1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${h?"bias[offset1d + i]":P+"(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${y?"input_skip_bias_sum[offset + i] = value;":""}
          output[offset + i] = value;
          let f32_value = ${V(P,_,"value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${$};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${U("sum",_)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${U("square_sum",_)} / f32(uniforms.hidden_size) ${a?"":"- mean * mean"} + uniforms.epsilon);
        ${f?"mean_output[global_idx] = mean;":""}
        ${g?"inv_std_output[global_idx] = inv_std_dev;":""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${a?"":`- ${P}(mean)`}) *
            ${P}(inv_std_dev) * gamma[offset1d + i]
            ${p?"+ beta[offset1d + i]":""};
        }
      }`},x=[{dims:o,dataType:e[0].dataType}];return r>1&&x.push({dims:d,dataType:1}),r>2&&x.push({dims:d,dataType:1}),r>3&&x.push({dims:n,dataType:e[0].dataType}),{name:"SkipLayerNormalization",shaderCache:{hint:`${_};${f};${g};${y}`,inputDependencies:e.map((k,B)=>"type")},getShaderSource:S,getRunData:()=>({outputs:x,dispatchGroup:{x:Math.ceil(u/l)},programUniforms:w})}},Xd=(e,t)=>{Zd(e.inputs);let r=[0];e.outputCount>1&&r.push(-3),e.outputCount>2&&r.push(-3),e.outputCount>3&&r.push(3),e.compute(Qd(e.inputs,t,e.outputCount,!1),{outputs:r})}}),Yd,la,Jd,Wn,ep,tp,rp,ip,Zc=C(()=>{ue(),ie(),b(),te(),Yd=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");if(t.axes.length!==0){if(t.axes.length!==t.starts.length||t.axes.length!==t.ends.length)throw new Error("axes, starts and ends must have the same length")}else if(t.starts.length!==t.ends.length)throw new Error("starts and ends must have the same length");e.slice(1).forEach((r,i)=>{if(e[i+1].dataType!==6&&e[i+1].dataType!==7)throw new Error(`Input ${i} must be an array of int32 or int64`)})},la=(e,t)=>{let r=[];if(e.length>t)if(e[t].dataType===7)e[t].getBigInt64Array().forEach(i=>r.push(Number(i)));else if(e[t].dataType===6)e[t].getInt32Array().forEach(i=>r.push(Number(i)));else throw new Error(`Input ${t} must be an array of int32 or int64`);return r},Jd=(e,t)=>{if(e.length>1){let r=la(e,1),i=la(e,2),a=la(e,3);return a.length===0&&(a=[...Array(e[0].dims.length).keys()]),m({starts:r,ends:i,axes:a})}else return t},Wn=(e,t,r,i,a)=>{let n=e;return e<0&&(n+=r[i[t]]),a[t]<0?Math.max(0,Math.min(n,r[i[t]]-1)):Math.max(0,Math.min(n,r[i[t]]))},ep=(e,t,r)=>`fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${r.length-1}; i >= 0; i--) {
            let input_shape_i = ${R("uniforms.input_shape","i",r.length)};
            let steps_i = ${R("uniforms.steps","i",r.length)};
            let signs_i = ${R("uniforms.signs","i",r.length)};
            let starts_i = ${R("uniforms.starts","i",r.length)};
            var output_index = ${t.indicesGet("output_indices","i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet("input_indices","i","input_index")};
          }
          return input_indices;
      }`,tp=(e,t)=>{let r=e[0].dims,i=M.size(r),a=t.axes.length>0?M.normalizeAxes(t.axes,r.length):[...Array(r.length).keys()],n=la(e,4);n.forEach(_=>_!==0||(()=>{throw new Error("step cannot be 0")})),n.length===0&&(n=Array(a.length).fill(1));let s=t.starts.map((_,w)=>Wn(_,w,r,a,n)),o=t.ends.map((_,w)=>Wn(_,w,r,a,n));if(a.length!==s.length||a.length!==o.length)throw new Error("start, ends and axes should have the same number of elements");if(a.length!==r.length)for(let _=0;_<r.length;++_)a.includes(_)||(s.splice(_,0,0),o.splice(_,0,r[_]),n.splice(_,0,1));let u=n.map(_=>Math.sign(_));n.forEach((_,w,S)=>{if(_<0){let x=(o[w]-s[w])/_,k=s[w],B=k+x*n[w];s[w]=B,o[w]=k,S[w]=-_}});let l=r.slice(0);a.forEach((_,w)=>{l[_]=Math.ceil((o[_]-s[_])/n[_])});let d={dims:l,dataType:e[0].dataType},p=F("output",e[0].dataType,l.length),h=z("input",e[0].dataType,e[0].dims.length),f=M.size(l),g=[{name:"outputSize",type:"u32"},{name:"starts",type:"u32",length:s.length},{name:"signs",type:"i32",length:u.length},{name:"steps",type:"u32",length:n.length}],y=[{type:12,data:f},{type:12,data:s},{type:6,data:u},{type:12,data:n},...I(e[0].dims,l)],$=_=>`
      ${_.registerUniforms(g).declareVariables(h,p)}
        ${ep(h,p,r)}
        ${_.mainStart()}
          ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${p.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${p.setByOffset("global_idx",h.getByIndices("input_indices"))}
      }`;return{name:"Slice",shaderCache:{hint:`${u.length}_${s.length}_${n.length}`,inputDependencies:["rank"]},getShaderSource:$,getRunData:()=>({outputs:[d],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:y})}},rp=(e,t)=>{Yd(e.inputs,t);let r=Jd(e.inputs,t);e.compute(tp(e.inputs,r),{inputs:[0]})},ip=e=>{let t=e.starts,r=e.ends,i=e.axes;return m({starts:t,ends:r,axes:i})}}),ap,np,sp,op,Qc=C(()=>{ue(),ie(),b(),at(),te(),ap=e=>{if(!e||e.length!==1)throw new Error("Softmax op requires 1 input.")},np=(e,t)=>{let r=e.inputs[0],i=r.dims,a=M.size(i),n=i.length,s=M.normalizeAxis(t.axis,n),o=s<i.length-1,u,l=[];o?(l=Array.from({length:n},(D,P)=>P),l[s]=n-1,l[n-1]=s,u=e.compute(ft(r,l),{inputs:[r],outputs:[-1]})[0]):u=r;let d=u.dims,p=d[n-1],h=a/p,f=O(p),g=p/f,y=64;h===1&&(y=256);let $=(D,P)=>P===4?`max(max(${D}.x, ${D}.y), max(${D}.z, ${D}.w))`:P===2?`max(${D}.x, ${D}.y)`:P===3?`max(max(${D}.x, ${D}.y), ${D}.z)`:D,_=z("x",u.dataType,u.dims,f),w=F("result",u.dataType,u.dims,f),S=_.type.value,x=A(u.dataType)==="f32"?`var threadMax = ${S}(-3.4028234663852886e+38f);`:`var threadMax = ${S}(-65504.0h);`,k=D=>`
      var<workgroup> rowMaxShared : ${S};
      var<workgroup> rowSumShared : ${S};
      var<workgroup> threadShared : array<${S}, ${y}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${S} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${S}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${D.registerUniform("packedCols","i32").declareVariables(_,w)}
      ${D.mainStart(y)}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${y};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${x}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${S}(${$("threadShared[0]",f)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${S}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${S}(${U("threadShared[0]",f)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          var value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          // max operation protects against NaN since all values should be >=0
          value = max(value, ${S}(0.0));
          setValue(row, col, row_stride, value);
        }
      }`,B=e.compute({name:"Softmax",shaderCache:{hint:`${f};${y}`,inputDependencies:["type"]},getRunData:()=>({outputs:[{dims:d,dataType:u.dataType}],dispatchGroup:{x:h},programUniforms:[{type:6,data:g}]}),getShaderSource:k},{inputs:[u],outputs:[o?-1:0]})[0];o&&e.compute(ft(B,l),{inputs:[B]})},sp=(e,t)=>{ap(e.inputs),np(e,t)},op=e=>m({axis:e.axis})}),Gn,up,lp,dp,pp,Xc=C(()=>{ue(),ie(),te(),Gn=e=>Array.from(e.getBigInt64Array(),Number),up=e=>{if(!e||e.length!==2)throw new Error("Tile requires 2 inputs.");if(e[0].dataType!==1&&e[0].dataType!==10&&e[0].dataType!==6&&e[0].dataType!==12)throw new Error("Tile only support float, float16, int32, and uint32 data types");if(e[1].dataType!==7)throw new Error("Tile `repeats` input should be of int64 data type");if(e[1].dims.length!==1)throw new Error("Tile `repeats` input should be 1-D");if(Gn(e[1]).length!==e[0].dims.length)throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},lp=(e,t)=>{let r=[];for(let i=0;i<e.length;++i)r.push(e[i]*t[i]);return r},dp=(e,t)=>{let r=e[0].dims,i=t??Gn(e[1]),a=lp(r,i),n=M.size(a),s=e[0].dataType,o=z("input",s,r.length),u=F("output",s,a.length),l=d=>`
      const inputShape = ${o.indices(...r)};
      ${d.registerUniform("output_size","u32").declareVariables(o,u)}
      ${d.mainStart()}
      ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${u.offsetToIndices("global_idx")};
      var input_indices: ${o.type.indices};
      for (var i = 0; i < ${r.length}; i++) {
        let input_dim_i = ${o.indicesGet("uniforms.input_shape","i")};
        let input_dim_value = ${u.indicesGet("output_indices","i")}  % input_dim_i;

        ${o.indicesSet("input_indices","i","input_dim_value")}
      }
      ${u.setByOffset("global_idx",o.getByIndices("input_indices"))}
    }`;return{name:"Tile",shaderCache:{hint:`${i}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:a,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:[{type:12,data:n},...I(e[0].dims,a)]}),getShaderSource:l}},pp=e=>{up(e.inputs),e.compute(dp(e.inputs),{inputs:[0]})}}),cp,hp,fp,Yc=C(()=>{ue(),ie(),te(),cp=(e,t,r,i,a)=>{let n=F("output_data",a,r.length,4),s=z("a_data",t[1].dataType,t[1].dims.length,4),o=z("b_data",t[2].dataType,t[2].dims.length,4),u=z("c_data",t[0].dataType,t[0].dims.length,4),l,d=(p,h,f)=>`select(${h}, ${p}, ${f})`;if(!i)l=n.setByOffset("global_idx",d(s.getByOffset("global_idx"),o.getByOffset("global_idx"),u.getByOffset("global_idx")));else{let p=(h,f,g="")=>{let y=`a_data[index_a${f}][component_a${f}]`,$=`b_data[index_b${f}][component_b${f}]`,_=`bool(c_data[index_c${f}] & (0xffu << (component_c${f} * 8)))`;return`
            let output_indices${f} = ${n.offsetToIndices(`global_idx * 4u + ${f}u`)};
            let offset_a${f} = ${s.broadcastedIndicesToOffset(`output_indices${f}`,n)};
            let offset_b${f} = ${o.broadcastedIndicesToOffset(`output_indices${f}`,n)};
            let offset_c${f} = ${u.broadcastedIndicesToOffset(`output_indices${f}`,n)};
            let index_a${f} = offset_a${f} / 4u;
            let index_b${f} = offset_b${f} / 4u;
            let index_c${f} = offset_c${f} / 4u;
            let component_a${f} = offset_a${f} % 4u;
            let component_b${f} = offset_b${f} % 4u;
            let component_c${f} = offset_c${f} % 4u;
            ${h}[${f}] = ${g}(${d(y,$,_)});
          `};a===9?l=`
            var data = vec4<u32>(0);
            ${p("data",0,"u32")}
            ${p("data",1,"u32")}
            ${p("data",2,"u32")}
            ${p("data",3,"u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:l=`
            ${p("output_data[global_idx]",0)}
            ${p("output_data[global_idx]",1)}
            ${p("output_data[global_idx]",2)}
            ${p("output_data[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(u,s,o,n)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${l}
      }`},hp=e=>{let t=e[1].dims,r=e[2].dims,i=e[0].dims,a=e[1].dataType,n=!(M.areEqual(t,r)&&M.areEqual(r,i)),s=t,o=M.size(t);if(n){let l=jt.calcShape(jt.calcShape(t,r,!1),i,!1);if(!l)throw new Error("Can't perform where op on the given tensors");s=l,o=M.size(s)}let u=Math.ceil(o/4);return{name:"Where",shaderCache:{inputDependencies:["rank","rank","rank"]},getShaderSource:l=>cp(l,e,s,n,a),getRunData:()=>({outputs:[{dims:s,dataType:a}],dispatchGroup:{x:Math.ceil(o/64/4)},programUniforms:[{type:12,data:u},...I(i,t,r,s)]})}},fp=e=>{e.compute(hp(e.inputs))}}),mp,Jc=C(()=>{hc(),on(),fc(),mc(),gc(),yc(),wc(),xc(),Tc(),Ec(),Ic(),kc(),Cc(),zc(),Ac(),Oc(),Rc(),Bc(),Mc(),Dc(),Pc(),Uc(),Nc(),Lc(),Vc(),Il(),qc(),Fc(),Wc(),Gc(),jc(),an(),Hc(),Pl(),Kc(),Zc(),Qc(),Bl(),Xc(),at(),pn(),Yc(),mp=new Map([["Abs",[Ks]],["Acos",[Zs]],["Acosh",[Qs]],["Add",[Uo]],["ArgMax",[Rs,sn]],["ArgMin",[Os,sn]],["Asin",[Xs]],["Asinh",[Ys]],["Atan",[Js]],["Atanh",[eo]],["Attention",[Ns]],["AveragePool",[hd,cd]],["BatchNormalization",[Fs]],["BiasAdd",[js]],["BiasSplitGelu",[Mo]],["Cast",[ro,to]],["Ceil",[no]],["Clip",[ao]],["Concat",[Yo,Jo]],["Conv",[Sn,vn]],["ConvTranspose",[Eu,xu]],["Cos",[so]],["Cosh",[oo]],["CumSum",[ku,Cu]],["DepthToSpace",[Ru,Bu]],["DequantizeLinear",[vd,xd]],["Div",[No]],["Einsum",[Lu,Vu]],["Elu",[uo,ia]],["Equal",[Lo]],["Erf",[lo]],["Exp",[po]],["Expand",[Gu]],["FastGelu",[Hu]],["Floor",[co]],["FusedConv",[Sn,vn]],["Gather",[Xu,Qu]],["GatherElements",[ul,ol]],["GatherBlockQuantized",[il,al]],["GatherND",[Ju,el]],["Gelu",[ho]],["Gemm",[cl,pl]],["GlobalAveragePool",[md,fd]],["GlobalMaxPool",[_d,wd]],["Greater",[Wo]],["GreaterOrEqual",[jo]],["GridSample",[$l,vl]],["GroupQueryAttention",[Vl]],["HardSigmoid",[$o,bo]],["InstanceNormalization",[Wl]],["LayerNormalization",[Hl]],["LeakyRelu",[fo,ia]],["Less",[Go]],["LessOrEqual",[Ho]],["Log",[Co]],["MatMul",[Zl]],["MatMulNBits",[Jl,ed]],["MaxPool",[gd,yd]],["Mul",[Vo]],["MultiHeadAttention",[El,Sl]],["Neg",[go]],["Not",[mo]],["Pad",[ld]],["Pow",[qo]],["QuickGelu",[Oo,ia]],["Range",[Ed]],["Reciprocal",[yo]],["ReduceMin",[Is]],["ReduceMean",[vs]],["ReduceMax",[Es]],["ReduceSum",[Cs]],["ReduceProd",[ks]],["ReduceL1",[xs]],["ReduceL2",[Ss]],["ReduceLogSum",[As]],["ReduceLogSumExp",[Ts]],["ReduceSumSquare",[zs]],["Relu",[wo]],["Resize",[Hd,Kd]],["RotaryEmbedding",[Dl]],["ScatterND",[zd,Cd]],["Sigmoid",[_o]],["Sin",[vo]],["Sinh",[xo]],["Slice",[rp,ip]],["SkipLayerNormalization",[Xd]],["Split",[Ol,Rl]],["Sqrt",[So]],["Softmax",[sp,op]],["Sub",[Fo]],["Tan",[To]],["Tanh",[Eo]],["ThresholdedRelu",[ko,ia]],["Tile",[pp]],["Transpose",[Yi,Ji]],["Where",[fp]]])}),gp,eh=C(()=>{et(),Tt(),te(),gp=class{constructor(e){this.backend=e,this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,t){this.repo.set(e,t)}run(e,t,r,i,a){rt(e.programInfo.name);let n=this.backend.device,s=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let o=[];for(let l of t)o.push({binding:o.length,resource:{buffer:l.buffer}});for(let l of r)o.push({binding:o.length,resource:{buffer:l.buffer}});a&&o.push({binding:o.length,resource:a});let u=n.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:o,label:e.programInfo.name});if(this.backend.sessionStatus==="capturing"){let l={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:u,dispatchGroup:i};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(l)}s.setPipeline(e.computePipeline),s.setBindGroup(0,u),s.dispatchWorkgroups(...i),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType==="at-passes")&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),Je(e.programInfo.name)}dispose(){}build(e,t){rt(e.name);let r=this.backend.device,i=[];[{feature:"shader-f16",extension:"f16"},{feature:"subgroups",extension:"subgroups"}].forEach(l=>{r.features.has(l.feature)&&i.push(`enable ${l.extension};`)});let a=Me(t,this.backend.device.limits),n=e.getShaderSource(a),s=`${i.join(`
`)}
${a.additionalImplementations}
${n}`,o=r.createShaderModule({code:s,label:e.name});Ee("verbose",()=>`[WebGPU] ${e.name} shader code: ${s}`);let u=r.createComputePipeline({compute:{module:o,entryPoint:"main"},layout:"auto",label:e.name});return Je(e.name),{programInfo:e,computePipeline:u,uniformVariablesInfo:a.variablesInfo}}normalizeDispatchGroupSize(e){let t=typeof e=="number"?e:e.x,r=typeof e=="number"?1:e.y||1,i=typeof e=="number"?1:e.z||1,a=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(t<=a&&r<=a&&i<=a)return[t,r,i];let n=t*r*i,s=Math.ceil(Math.sqrt(n));if(s>a){if(s=Math.ceil(Math.cbrt(n)),s>a)throw new Error("Total dispatch size exceeds WebGPU maximum.");return[s,s,s]}else return[s,s,1]}}}),yp={};Q(yp,{WebGpuBackend:()=>$p});var wp,_p,bp,$p,th=C(()=>{et(),ue(),Tt(),or(),tn(),Jc(),eh(),wp=(e,t)=>{if(t.length!==e.length)throw new Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);let r=[];for(let i=0;i<e.length;++i){let a=e[i].dataType;switch(t[i]){case"none":{r.push("");break}case"type":{r.push(`${a}`);break}case"rank":{let n=e[i].dims.length;r.push(`${a};${n}`);break}case"dims":{let n=e[i].dims.join(",");r.push(`${a};${n}`);break}default:throw new Error(`unsupported input dependency: ${t[i]}`)}}return r.join("|")},_p=(e,t,r)=>{var a,n;let i=e.name;return(a=e.shaderCache)!=null&&a.hint&&(i+="["+e.shaderCache.hint+"]"),i+=":"+r+`:${wp(t,((n=e.shaderCache)==null?void 0:n.inputDependencies)??new Array(t.length).fill("dims"))}`,i},bp=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},$p=class{constructor(){this.currentSessionId=null,this.currentKernelId=null,this.commandEncoder=null,this.computePassEncoder=null,this.maxDispatchNumber=16,this.pendingDispatchNumber=0,this.pendingKernels=[],this.pendingQueries=new Map,this.sessionStatus="default",this.capturedCommandList=new Map,this.capturedPendingKernels=new Map,this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,t){this.env=e;let r=[],i={requiredLimits:{maxComputeWorkgroupStorageSize:t.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:t.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:t.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:t.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:t.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:t.limits.maxComputeWorkgroupSizeZ},requiredFeatures:r},a=n=>t.features.has(n)&&r.push(n)&&!0;a("chromium-experimental-timestamp-query-inside-passes")||a("timestamp-query"),a("shader-f16"),a("subgroups"),this.device=await t.requestDevice(i),this.adapterInfo=new bp(t.info||await t.requestAdapterInfo()),this.gpuDataManager=Sa(this),this.programManager=new gp(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,ti(e.logLevel,!!e.debug),this.device.onuncapturederror=n=>{n.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${n.error.message}`)},Object.defineProperty(this.env.webgpu,"device",{value:this.device,writable:!1,enumerable:!0,configurable:!1}),Object.defineProperty(this.env.webgpu,"adapter",{value:t,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<"u"&&this.querySet.destroy(),this.gpuDataManager.dispose()}getCommandEncoder(){return this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder()),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),t={};this.queryType==="at-passes"&&(t.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(t)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}flush(){if(!this.commandEncoder)return;rt(),this.endComputePass();let e;this.queryType!=="none"&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!=="none"&&e.mapAsync(GPUMapMode.READ).then(()=>{var i;let t=new BigUint64Array(e.getMappedRange()),r=this.pendingQueries.get(e);for(let a=0;a<t.length/2;a++){let n=r[a],s=n.kernelId,o=this.kernels.get(s),u=o.kernelType,l=o.kernelName,d=n.programName,p=n.inputTensorViews,h=n.outputTensorViews,f=t[a*2],g=t[a*2+1];typeof this.queryTimeBase>"u"&&(this.queryTimeBase=f);let y=Number(f-this.queryTimeBase),$=Number(g-this.queryTimeBase);if(!Number.isSafeInteger(y)||!Number.isSafeInteger($))throw new RangeError("incorrect timestamp range");if((i=this.env.webgpu.profiling)!=null&&i.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:p.map(_=>({dims:_.dims,dataType:vt(_.dataType)})),outputsMetadata:h.map(_=>({dims:_.dims,dataType:vt(_.dataType)})),kernelId:s,kernelType:u,kernelName:l,programName:d,startTime:y,endTime:$});else{let _="";p.forEach((S,x)=>{_+=`input[${x}]: [${S.dims}] | ${vt(S.dataType)}, `});let w="";h.forEach((S,x)=>{w+=`output[${x}]: [${S.dims}] | ${vt(S.dataType)}, `}),console.log(`[profiling] kernel "${s}|${u}|${l}|${d}" ${_}${w}start time: ${y} ns, execution time: ${$-y} ns`)}Wt("GPU",`${d}::${f}::${g}`)}e.unmap(),this.pendingQueries.delete(e)}),Je()}run(e,t,r,i,a,n){rt(e.name);let s=[];for(let w=0;w<t.length;++w){let S=t[w].data;if(S===0)continue;let x=this.gpuDataManager.get(S);if(!x)throw new Error(`no GPU data for input: ${S}`);s.push(x)}let{outputs:o,dispatchGroup:u,programUniforms:l}=e.getRunData(t),d=r.length===0?o.map((w,S)=>S):r;if(d.length!==o.length)throw new Error(`Output size ${d.length} must be equal to ${o.length}.`);let p=[],h=[];for(let w=0;w<o.length;++w){if(!Number.isInteger(d[w])||d[w]<-3||d[w]>=n)throw new Error(`Invalid output index: ${d[w]}`);if(d[w]===-3)continue;let S=d[w]===-1,x=d[w]===-2,k=S||x?a(o[w].dataType,o[w].dims):i(d[w],o[w].dataType,o[w].dims);if(p.push(k),k.data===0)continue;let B=this.gpuDataManager.get(k.data);if(!B)throw new Error(`no GPU data for output: ${k.data}`);if(S&&this.temporaryData.push(B),x){let D=this.kernelPersistentData.get(this.currentKernelId);D||(D=[],this.kernelPersistentData.set(this.currentKernelId,D)),D.push(B)}h.push(B)}if(s.length!==t.length||h.length!==p.length){if(h.length===0)return Je(e.name),p;throw new Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let f;if(l){let w=0,S=[];l.forEach(D=>{let P=typeof D.data=="number"?[D.data]:D.data;if(P.length===0)return;let L=D.type===10?2:4,j,oe;D.type===10?(oe=P.length>4?16:P.length>2?8:P.length*L,j=P.length>4?16:L*P.length):(oe=P.length<=2?P.length*L:16,j=16),w=Math.ceil(w/oe)*oe,S.push(w);let X=D.type===10?8:4;w+=P.length>4?Math.ceil(P.length/X)*j:P.length*L});let x=16;w=Math.ceil(w/x)*x;let k=new ArrayBuffer(w);l.forEach((D,P)=>{let L=S[P],j=typeof D.data=="number"?[D.data]:D.data;if(D.type===6)new Int32Array(k,L,j.length).set(j);else if(D.type===12)new Uint32Array(k,L,j.length).set(j);else if(D.type===10)new Uint16Array(k,L,j.length).set(j);else if(D.type===1)new Float32Array(k,L,j.length).set(j);else throw new Error(`Unsupported uniform type: ${vt(D.type)}`)});let B=this.gpuDataManager.create(w,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(B.buffer,0,k,0,w),this.gpuDataManager.release(B.id),f={offset:0,size:w,buffer:B.buffer}}let g=this.programManager.normalizeDispatchGroupSize(u),y=g[1]===1&&g[2]===1,$=_p(e,t,y),_=this.programManager.getArtifact($);if(_||(_=this.programManager.build(e,g),this.programManager.setArtifact($,_),Ee("info",()=>`[artifact] key: ${$}, programName: ${e.name}`)),l&&_.uniformVariablesInfo){if(l.length!==_.uniformVariablesInfo.length)throw new Error(`Uniform variables count mismatch: expect ${_.uniformVariablesInfo.length}, got ${l.length} in program "${_.programInfo.name}".`);for(let w=0;w<l.length;w++){let S=l[w],x=S.type,k=typeof S.data=="number"?1:S.data.length,[B,D]=_.uniformVariablesInfo[w];if(x!==B||k!==D)throw new Error(`Uniform variable ${w} mismatch: expect type ${B} with size ${D}, got type ${x} with size ${k} in program "${_.programInfo.name}".`)}}if(Ee("info",()=>`[ProgramManager] run "${e.name}" (key=${$}) with ${g[0]}x${g[1]}x${g[2]}`),this.queryType!=="none"||this.sessionStatus==="capturing"){let w={kernelId:this.currentKernelId,programName:_.programInfo.name,inputTensorViews:t,outputTensorViews:p};this.pendingKernels.push(w),this.sessionStatus==="capturing"&&this.capturedPendingKernels.get(this.currentSessionId).push(w)}return this.programManager.run(_,s,h,g,f),Je(e.name),p}upload(e,t){this.gpuDataManager.upload(e,t)}memcpy(e,t){this.gpuDataManager.memcpy(e,t)}async download(e,t){await this.gpuDataManager.download(e,t)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,t,r,i){let a=mp.get(e);if(!a)throw new Error(`kernel not implemented: ${e}`);let n={kernelType:e,kernelName:i,kernelEntry:a[0],attributes:[a[1],r]};this.kernels.set(t,n)}releaseKernel(e){let t=this.kernelPersistentData.get(e);if(t){for(let r of t)this.gpuDataManager.release(r.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,t,r){let i=this.kernels.get(e);if(!i)throw new Error(`kernel not created: ${e}`);let a=i.kernelType,n=i.kernelName,s=i.kernelEntry,o=i.attributes;if(this.currentKernelId!==null)throw new Error(`kernel "[${a}] ${n}" is not allowed to be called recursively`);this.currentKernelId=e,o[0]&&(o[1]=o[0](o[1]),o[0]=void 0),Ee("info",()=>`[WebGPU] Start to run kernel "[${a}] ${n}"...`);let u=this.env.debug;this.temporaryData=[];try{return u&&this.device.pushErrorScope("validation"),s(t,o[1]),0}catch(l){return r.push(Promise.resolve(`[WebGPU] Kernel "[${a}] ${n}" failed. ${l}`)),1}finally{u&&r.push(this.device.popErrorScope().then(l=>l?`GPU validation error for kernel "[${a}] ${n}": ${l.message}`:null));for(let l of this.temporaryData)this.gpuDataManager.release(l.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,t,r,i){let a=this.sessionExternalDataMapping.get(e);a||(a=new Map,this.sessionExternalDataMapping.set(e,a));let n=a.get(t),s=this.gpuDataManager.registerExternalBuffer(r,i,n);return a.set(t,[s,r]),s}unregisterBuffers(e){let t=this.sessionExternalDataMapping.get(e);t&&(t.forEach(r=>this.gpuDataManager.unregisterExternalBuffer(r[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let t=this.gpuDataManager.get(e);if(!t)throw new Error(`no GPU data for buffer: ${e}`);return t.buffer}createDownloader(e,t,r){return async()=>{let i=await Qi(this,e,t);return Ht(i.buffer,r)}}writeTimestamp(e){this.queryType==="inside-passes"&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){var e;this.queryType="none",(((e=this.env.webgpu.profiling)==null?void 0:e.mode)==="default"||(typeof this.env.trace>"u"?this.env.wasm.trace:this.env.trace))&&(this.device.features.has("chromium-experimental-timestamp-query-inside-passes")?this.queryType="inside-passes":this.device.features.has("timestamp-query")&&(this.queryType="at-passes"),this.queryType!=="none"&&typeof this.querySet>"u"&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){Ee("info","captureBegin"),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus="capturing"}captureEnd(){Ee("info","captureEnd"),this.flush(),this.sessionStatus="default"}replay(){Ee("info","replay"),this.sessionStatus="replaying";let e=this.capturedCommandList.get(this.currentSessionId),t=this.capturedPendingKernels.get(this.currentSessionId),r=e.length;this.pendingKernels=[];for(let i=0;i<r;i++){let a=this.getComputePassEncoder(),n=e[i];this.writeTimestamp(this.pendingDispatchNumber*2),a.setPipeline(n.computePipeline),a.setBindGroup(0,n.bindGroup),a.dispatchWorkgroups(...n.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!=="none"&&this.pendingKernels.push(t[i]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType==="at-passes")&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus="default"}onCreateSession(){this.gpuDataManager.onCreateSession()}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}}),vp={};Q(vp,{init:()=>Sp});var Pa,xp,Sp,rh=C(()=>{ue(),Tt(),ie(),Zi(),Pa=class oc{constructor(t,r,i,a){this.module=t,this.dataType=r,this.data=i,this.dims=a}getFloat32Array(){if(this.dataType!==1)throw new Error("Invalid data type");let t=M.size(this.dims);return t===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,t)}getBigInt64Array(){if(this.dataType!==7)throw new Error("Invalid data type");let t=M.size(this.dims);return t===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,t)}getInt32Array(){if(this.dataType!==6)throw new Error("Invalid data type");let t=M.size(this.dims);return t===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,t)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw new Error("Invalid data type");let t=M.size(this.dims);return t===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,t)}reshape(t){if(M.size(t)!==M.size(this.dims))throw new Error("Invalid new shape");return new oc(this.module,this.dataType,this.data,t)}},xp=class{constructor(e,t,r){this.module=e,this.backend=t,this.customDataOffset=0,this.customDataSize=0,this.adapterInfo=t.adapterInfo;let i=e.PTR_SIZE,a=r/e.PTR_SIZE,n=i===4?"i32":"i64";this.opKernelContext=Number(e.getValue(i*a++,n));let s=Number(e.getValue(i*a++,n));this.outputCount=Number(e.getValue(i*a++,n)),this.customDataOffset=Number(e.getValue(i*a++,"*")),this.customDataSize=Number(e.getValue(i*a++,n));let o=[];for(let u=0;u<s;u++){let l=Number(e.getValue(i*a++,n)),d=Number(e.getValue(i*a++,"*")),p=Number(e.getValue(i*a++,n)),h=[];for(let f=0;f<p;f++)h.push(Number(e.getValue(i*a++,n)));o.push(new Pa(e,l,d,h))}this.inputs=o}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}compute(e,t){var s;let r=((s=t==null?void 0:t.inputs)==null?void 0:s.map(o=>typeof o=="number"?this.inputs[o]:o))??this.inputs,i=(t==null?void 0:t.outputs)??[],a=(o,u,l)=>new Pa(this.module,u,this.output(o,l),l),n=(o,u)=>{let l=xt(o,u);if(!l)throw new Error(`Unsupported data type: ${o}`);let d=l>0?this.backend.gpuDataManager.create(l).id:0;return new Pa(this.module,o,d,u)};return this.backend.run(e,r,i,a,n,this.outputCount)}output(e,t){let r=this.module.stackSave();try{let i=this.module.PTR_SIZE,a=i===4?"i32":"i64",n=this.module.stackAlloc((1+t.length)*i);this.module.setValue(n,t.length,a);for(let s=0;s<t.length;s++)this.module.setValue(n+i*(s+1),t[s],a);return this.module._JsepOutput(this.opKernelContext,e,n)}catch(i){throw new Error(`Failed to generate kernel's output[${e}] with dims [${t}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${i}`)}finally{this.module.stackRestore(r)}}},Sp=async(e,t,r,i)=>{let a=t.jsepInit;if(!a)throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");if(e==="webgpu"){let n=(th(),Ie(yp)).WebGpuBackend,s=new n;await s.initialize(r,i),a("webgpu",[s,o=>s.alloc(Number(o)),o=>s.free(o),(o,u,l,d=!1)=>{if(d)Ee("verbose",()=>`[WebGPU] jsepCopyGpuToGpu: src=${Number(o)}, dst=${Number(u)}, size=${Number(l)}`),s.memcpy(Number(o),Number(u));else{Ee("verbose",()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${Number(o)}, gpuDataId=${Number(u)}, size=${Number(l)}`);let p=t.HEAPU8.subarray(Number(o>>>0),Number(o>>>0)+Number(l));s.upload(Number(u),p)}},async(o,u,l)=>{Ee("verbose",()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${o}, dataOffset=${u}, size=${l}`),await s.download(Number(o),()=>t.HEAPU8.subarray(Number(u)>>>0,Number(u+l)>>>0))},(o,u,l)=>s.createKernel(o,Number(u),l,t.UTF8ToString(t._JsepGetNodeName(Number(u)))),o=>s.releaseKernel(o),(o,u,l,d)=>{Ee("verbose",()=>`[WebGPU] jsepRun: sessionHandle=${l}, kernel=${o}, contextDataOffset=${u}`);let p=new xp(t,s,Number(u));return s.computeKernel(Number(o),p,d)},()=>s.captureBegin(),()=>s.captureEnd(),()=>s.replay()])}else{let n=new Ki(r);a("webnn",[n,()=>n.reserveTensorId(),s=>n.releaseTensorId(s),async(s,o,u,l,d)=>n.ensureTensor(s,o,u,l,d),(s,o)=>{n.uploadTensor(s,o)},async(s,o)=>n.downloadTensor(s,o),(s,o)=>n.registerMLContext(s,o),!!r.trace])}}}),Tp,jn,Hn,pr,Ep,Kn,Ua,Zn,Qn,Xn,Yn,Jn,es,Ip=C(()=>{et(),Ja(),en(),ue(),bt(),Or(),qi(),Tp=(e,t)=>{he()._OrtInit(e,t)!==0&&ae("Can't initialize onnxruntime.")},jn=async e=>{Tp(e.wasm.numThreads,Br(e.logLevel))},Hn=async(e,t)=>{var i,a;(a=(i=he()).asyncInit)==null||a.call(i);let r=e.webgpu.adapter;if(t==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");if(r){if(typeof r.limits!="object"||typeof r.features!="object"||typeof r.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let n=e.webgpu.powerPreference;if(n!==void 0&&n!=="low-power"&&n!=="high-performance")throw new Error(`Invalid powerPreference setting: "${n}"`);let s=e.webgpu.forceFallbackAdapter;if(s!==void 0&&typeof s!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${s}"`);if(r=await navigator.gpu.requestAdapter({powerPreference:n,forceFallbackAdapter:s}),!r)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}}if(t==="webnn"&&(typeof navigator>"u"||!navigator.ml))throw new Error("WebNN is not supported in current environment");{let n=(rh(),Ie(vp)).init;t==="webgpu"&&await n("webgpu",he(),e,r),t==="webnn"&&await n("webnn",he(),e)}},pr=new Map,Ep=e=>{let t=he(),r=t.stackSave();try{let i=t.PTR_SIZE,a=t.stackAlloc(2*i);t._OrtGetInputOutputCount(e,a,a+i)!==0&&ae("Can't get session input/output count.");let n=i===4?"i32":"i64";return[Number(t.getValue(a,n)),Number(t.getValue(a+i,n))]}finally{t.stackRestore(r)}},Kn=(e,t)=>{let r=he(),i=r.stackSave(),a=0;try{let n=r.PTR_SIZE,s=r.stackAlloc(2*n);r._OrtGetInputOutputMetadata(e,t,s,s+n)!==0&&ae("Can't get session input/output metadata.");let o=Number(r.getValue(s,"*"));a=Number(r.getValue(s+n,"*"));let u=r.HEAP32[a/4];if(u===0)return[o,0];let l=r.HEAPU32[a/4+1],d=[];for(let p=0;p<l;p++){let h=Number(r.getValue(a+8+p*n,"*"));d.push(h!==0?r.UTF8ToString(h):Number(r.getValue(a+8+(p+l)*n,"*")))}return[o,u,d]}finally{r.stackRestore(i),a!==0&&r._OrtFree(a)}},Ua=e=>{let t=he(),r=t._malloc(e.byteLength);if(r===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);return t.HEAPU8.set(e,r),[r,e.byteLength]},Zn=async(e,t)=>{var p,h,f,g;let r,i,a=he();Array.isArray(e)?[r,i]=e:e.buffer===a.HEAPU8.buffer?[r,i]=[e.byteOffset,e.byteLength]:[r,i]=Ua(e);let n=0,s=0,o=0,u=[],l=[],d=[];try{if([s,u]=await Vi(t),(t==null?void 0:t.externalData)&&a.mountExternalData){let P=[];for(let L of t.externalData){let j=typeof L=="string"?L:L.path;P.push(Pr(typeof L=="string"?L:L.data).then(oe=>{a.mountExternalData(j,oe)}))}await Promise.all(P)}for(let P of(t==null?void 0:t.executionProviders)??[])if((typeof P=="string"?P:P.name)==="webnn"){if(a.shouldTransferToMLTensor=!1,typeof P!="string"){let L=P,j=L==null?void 0:L.context,oe=L==null?void 0:L.gpuDevice,X=L==null?void 0:L.deviceType,ne=L==null?void 0:L.powerPreference;j?a.currentContext=j:oe?a.currentContext=await a.webnnCreateMLContext(oe):a.currentContext=await a.webnnCreateMLContext({deviceType:X,powerPreference:ne})}else a.currentContext=await a.webnnCreateMLContext();break}n=await a._OrtCreateSession(r,i,s),(p=a.webgpuOnCreateSession)==null||p.call(a,n),n===0&&ae("Can't create a session."),(h=a.jsepOnCreateSession)==null||h.call(a),a.currentContext&&(a.webnnRegisterMLContext(n,a.currentContext),a.currentContext=void 0,a.shouldTransferToMLTensor=!0);let[y,$]=Ep(n),_=!!(t!=null&&t.enableGraphCapture),w=[],S=[],x=[],k=[],B=[];for(let P=0;P<y;P++){let[L,j,oe]=Kn(n,P);L===0&&ae("Can't get an input name."),l.push(L);let X=a.UTF8ToString(L);w.push(X),x.push(j===0?{name:X,isTensor:!1}:{name:X,isTensor:!0,type:vt(j),shape:oe})}for(let P=0;P<$;P++){let[L,j,oe]=Kn(n,P+y);L===0&&ae("Can't get an output name."),d.push(L);let X=a.UTF8ToString(L);S.push(X),k.push(j===0?{name:X,isTensor:!1}:{name:X,isTensor:!0,type:vt(j),shape:oe});{if(_&&(t==null?void 0:t.preferredOutputLocation)===void 0){B.push("gpu-buffer");continue}let ne=typeof(t==null?void 0:t.preferredOutputLocation)=="string"?t.preferredOutputLocation:((f=t==null?void 0:t.preferredOutputLocation)==null?void 0:f[X])??"cpu",Ce=a.webnnIsGraphOutput;if(ne==="cpu"&&Ce&&Ce(n,X)){B.push("ml-tensor-cpu-output");continue}if(ne!=="cpu"&&ne!=="cpu-pinned"&&ne!=="gpu-buffer"&&ne!=="ml-tensor")throw new Error(`Not supported preferred output location: ${ne}.`);if(_&&ne!=="gpu-buffer")throw new Error(`Not supported preferred output location: ${ne}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);B.push(ne)}}let D=null;return B.some(P=>P==="gpu-buffer"||P==="ml-tensor"||P==="ml-tensor-cpu-output")&&(o=a._OrtCreateBinding(n),o===0&&ae("Can't create IO binding."),D={handle:o,outputPreferredLocations:B,outputPreferredLocationsEncoded:B.map(P=>P==="ml-tensor-cpu-output"?"ml-tensor":P).map(P=>Yr(P))}),pr.set(n,[n,l,d,D,_,!1]),[n,w,S,x,k]}catch(y){throw l.forEach($=>a._OrtFree($)),d.forEach($=>a._OrtFree($)),o!==0&&a._OrtReleaseBinding(o)!==0&&ae("Can't release IO binding."),n!==0&&a._OrtReleaseSession(n)!==0&&ae("Can't release session."),y}finally{a._free(r),s!==0&&a._OrtReleaseSessionOptions(s)!==0&&ae("Can't release session options."),u.forEach(y=>a._free(y)),(g=a.unmountExternalData)==null||g.call(a)}},Qn=e=>{var u,l,d;let t=he(),r=pr.get(e);if(!r)throw new Error(`cannot release session. invalid session id: ${e}`);let[i,a,n,s,o]=r;s&&(o&&t._OrtClearBoundOutputs(s.handle)!==0&&ae("Can't clear bound outputs."),t._OrtReleaseBinding(s.handle)!==0&&ae("Can't release IO binding.")),(u=t.jsepOnReleaseSession)==null||u.call(t,e),(l=t.webnnOnReleaseSession)==null||l.call(t,e),(d=t.webgpuOnReleaseSession)==null||d.call(t,e),a.forEach(p=>t._OrtFree(p)),n.forEach(p=>t._OrtFree(p)),t._OrtReleaseSession(i)!==0&&ae("Can't release session."),pr.delete(e)},Xn=async(e,t,r,i,a,n,s=!1)=>{if(!e){t.push(0);return}let o=he(),u=o.PTR_SIZE,l=e[0],d=e[1],p=e[3],h=p,f,g;if(l==="string"&&(p==="gpu-buffer"||p==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(s&&p!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${n} when enableGraphCapture is true.`);if(p==="gpu-buffer"){let _=e[2].gpuBuffer;g=xt($t(l),d);{let w=o.jsepRegisterBuffer;if(!w)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');f=w(i,n,_,g)}}else if(p==="ml-tensor"){let _=e[2].mlTensor;g=xt($t(l),d);let w=o.webnnRegisterMLTensor;if(!w)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');f=w(i,_,$t(l),d)}else{let _=e[2];if(Array.isArray(_)){g=u*_.length,f=o._malloc(g),r.push(f);for(let w=0;w<_.length;w++){if(typeof _[w]!="string")throw new TypeError(`tensor data at index ${w} is not a string`);o.setValue(f+w*u,je(_[w],r),"*")}}else{let w=o.webnnIsGraphInput,S=o.webnnIsGraphOutput;if(l!=="string"&&w&&S){let x=o.UTF8ToString(a);if(w(i,x)||S(i,x)){let k=$t(l);g=xt(k,d),h="ml-tensor";let B=o.webnnCreateTemporaryTensor,D=o.webnnUploadTensor;if(!B||!D)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');let P=await B(i,k,d);D(P,new Uint8Array(_.buffer,_.byteOffset,_.byteLength)),f=P}else g=_.byteLength,f=o._malloc(g),r.push(f),o.HEAPU8.set(new Uint8Array(_.buffer,_.byteOffset,g),f)}else g=_.byteLength,f=o._malloc(g),r.push(f),o.HEAPU8.set(new Uint8Array(_.buffer,_.byteOffset,g),f)}}let y=o.stackSave(),$=o.stackAlloc(4*d.length);try{d.forEach((w,S)=>o.setValue($+S*u,w,u===4?"i32":"i64"));let _=o._OrtCreateTensor($t(l),f,g,$,d.length,Yr(h));_===0&&ae(`Can't create tensor for input/output. session=${i}, index=${n}.`),t.push(_)}finally{o.stackRestore(y)}},Yn=async(e,t,r,i,a,n)=>{var X,ne,Ce,Ae;let s=he(),o=s.PTR_SIZE,u=pr.get(e);if(!u)throw new Error(`cannot run inference. invalid session id: ${e}`);let l=u[0],d=u[1],p=u[2],h=u[3],f=u[4],g=u[5],y=t.length,$=i.length,_=0,w=[],S=[],x=[],k=[],B=[],D=s.stackSave(),P=s.stackAlloc(y*o),L=s.stackAlloc(y*o),j=s.stackAlloc($*o),oe=s.stackAlloc($*o);try{[_,w]=Di(n),pt("wasm prepareInputOutputTensor");for(let H=0;H<y;H++)await Xn(r[H],S,k,e,d[t[H]],t[H],f);for(let H=0;H<$;H++)await Xn(a[H],x,k,e,p[i[H]],y+i[H],f);ct("wasm prepareInputOutputTensor");for(let H=0;H<y;H++)s.setValue(P+H*o,S[H],"*"),s.setValue(L+H*o,d[t[H]],"*");for(let H=0;H<$;H++)s.setValue(j+H*o,x[H],"*"),s.setValue(oe+H*o,p[i[H]],"*");if(h&&!g){let{handle:H,outputPreferredLocations:qe,outputPreferredLocationsEncoded:q}=h;if(d.length!==y)throw new Error(`input count from feeds (${y}) is expected to be always equal to model's input count (${d.length}).`);pt("wasm bindInputsOutputs");for(let W=0;W<y;W++){let fe=t[W];await s._OrtBindInput(H,d[fe],S[W])!==0&&ae(`Can't bind input[${W}] for session=${e}.`)}for(let W=0;W<$;W++){let fe=i[W];(X=a[W])!=null&&X[3]?(B.push(x[W]),s._OrtBindOutput(H,p[fe],x[W],0)!==0&&ae(`Can't bind pre-allocated output[${W}] for session=${e}.`)):s._OrtBindOutput(H,p[fe],0,q[fe])!==0&&ae(`Can't bind output[${W}] to ${qe[W]} for session=${e}.`)}ct("wasm bindInputsOutputs"),pr.set(e,[l,d,p,h,f,!0])}(ne=s.jsepOnRunStart)==null||ne.call(s,l),(Ce=s.webnnOnRunStart)==null||Ce.call(s,l);let J;h?J=await s._OrtRunWithBinding(l,h.handle,$,j,_):J=await s._OrtRun(l,L,P,y,oe,$,j,_),J!==0&&ae("failed to call OrtRun().");let ge=[],Ve=[];pt("wasm ProcessOutputTensor");for(let H=0;H<$;H++){let qe=Number(s.getValue(j+H*o,"*"));if(qe===x[H]||B.includes(x[H])){ge.push(a[H]),qe!==x[H]&&s._OrtReleaseTensor(qe)!==0&&ae("Can't release tensor.");continue}let q=s.stackSave(),W=s.stackAlloc(4*o),fe=!1,we,He=0;try{s._OrtGetTensorData(qe,W,W+o,W+2*o,W+3*o)!==0&&ae(`Can't access output tensor data on index ${H}.`);let ca=o===4?"i32":"i64",Va=Number(s.getValue(W,ca));He=s.getValue(W+o,"*");let qp=s.getValue(W+o*2,"*"),oh=Number(s.getValue(W+o*3,ca)),hr=[];for(let ot=0;ot<oh;ot++)hr.push(Number(s.getValue(qp+ot*o,ca)));s._OrtFree(qp)!==0&&ae("Can't free memory for tensor dims.");let fr=hr.reduce((ot,Ye)=>ot*Ye,1);we=vt(Va);let ha=h==null?void 0:h.outputPreferredLocations[i[H]];if(we==="string"){if(ha==="gpu-buffer"||ha==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let ot=[];for(let Ye=0;Ye<fr;Ye++){let tr=s.getValue(He+Ye*o,"*"),uh=s.getValue(He+(Ye+1)*o,"*"),lh=Ye===fr-1?void 0:uh-tr;ot.push(s.UTF8ToString(tr,lh))}ge.push([we,hr,ot,"cpu"])}else if(ha==="gpu-buffer"&&fr>0){let ot=s.jsepGetBuffer;if(!ot)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let Ye=ot(He),tr=xt(Va,fr);if(tr===void 0||!Mr(we))throw new Error(`Unsupported data type: ${we}`);fe=!0,ge.push([we,hr,{gpuBuffer:Ye,download:s.jsepCreateDownloader(Ye,tr,we),dispose:()=>{s._OrtReleaseTensor(qe)!==0&&ae("Can't release tensor.")}},"gpu-buffer"])}else if(ha==="ml-tensor"&&fr>0){let ot=s.webnnEnsureTensor,Ye=s.webnnIsGraphInputOutputTypeSupported;if(!ot||!Ye)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(xt(Va,fr)===void 0||!Dr(we))throw new Error(`Unsupported data type: ${we}`);if(!Ye(e,we,!1))throw new Error(`preferredLocation "ml-tensor" for ${we} output is not supported by current WebNN Context.`);let tr=await ot(e,He,Va,hr,!1);fe=!0,ge.push([we,hr,{mlTensor:tr,download:s.webnnCreateMLTensorDownloader(He,we),dispose:()=>{s.webnnReleaseTensorId(He),s._OrtReleaseTensor(qe)}},"ml-tensor"])}else if(ha==="ml-tensor-cpu-output"&&fr>0){let ot=s.webnnCreateMLTensorDownloader(He,we)(),Ye=ge.length;fe=!0,Ve.push((async()=>{let tr=[Ye,await ot];return s.webnnReleaseTensorId(He),s._OrtReleaseTensor(qe),tr})()),ge.push([we,hr,[],"cpu"])}else{let ot=Rr(we),Ye=new ot(fr);new Uint8Array(Ye.buffer,Ye.byteOffset,Ye.byteLength).set(s.HEAPU8.subarray(He,He+Ye.byteLength)),ge.push([we,hr,Ye,"cpu"])}}finally{s.stackRestore(q),we==="string"&&He&&s._free(He),fe||s._OrtReleaseTensor(qe)}}h&&!f&&(s._OrtClearBoundOutputs(h.handle)!==0&&ae("Can't clear bound outputs."),pr.set(e,[l,d,p,h,f,!1]));for(let[H,qe]of await Promise.all(Ve))ge[H][2]=qe;return ct("wasm ProcessOutputTensor"),ge}finally{(Ae=s.webnnOnRunEnd)==null||Ae.call(s,l),s.stackRestore(D),S.forEach(J=>s._OrtReleaseTensor(J)),x.forEach(J=>s._OrtReleaseTensor(J)),k.forEach(J=>s._free(J)),_!==0&&s._OrtReleaseRunOptions(_),w.forEach(J=>s._free(J))}},Jn=e=>{let t=he(),r=pr.get(e);if(!r)throw new Error("invalid session id");let i=r[0],a=t._OrtEndProfiling(i);a===0&&ae("Can't get an profile file name."),t._OrtFree(a)},es=e=>{let t=[];for(let r of e){let i=r[2];!Array.isArray(i)&&"buffer"in i&&t.push(i.buffer)}return t}}),cr,St,mi,da,pa,Na,ts,La,Zr,Qr,kp,Cp,zp,Ap,Op,Rp,Bp,Mp,Dp=C(()=>{et(),Ip(),bt(),kr(),cr=()=>!!ee.wasm.proxy&&typeof document<"u",mi=!1,da=!1,pa=!1,La=new Map,Zr=(e,t)=>{let r=La.get(e);r?r.push(t):La.set(e,[t])},Qr=()=>{if(mi||!da||pa||!St)throw new Error("worker not ready")},kp=e=>{switch(e.data.type){case"init-wasm":mi=!1,e.data.err?(pa=!0,ts[1](e.data.err)):(da=!0,ts[0]()),Na&&(URL.revokeObjectURL(Na),Na=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let t=La.get(e.data.type);e.data.err?t.shift()[1](e.data.err):t.shift()[0](e.data.out);break}}},Cp=async()=>{if(!da){if(mi)throw new Error("multiple calls to 'initWasm()' detected.");if(pa)throw new Error("previous call to 'initWasm()' failed.");if(mi=!0,cr())return new Promise((e,t)=>{St==null||St.terminate(),Ai().then(([r,i])=>{try{St=i,St.onerror=n=>t(n),St.onmessage=kp,ts=[e,t];let a={type:"init-wasm",in:ee};if(!a.in.wasm.wasmPaths&&r){let n=Sr();n&&(a.in.wasm.wasmPaths=n)}St.postMessage(a),Na=r}catch(a){t(a)}},t)});try{await Ar(ee.wasm),await jn(ee),da=!0}catch(e){throw pa=!0,e}finally{mi=!1}}},zp=async e=>{if(cr())return Qr(),new Promise((t,r)=>{Zr("init-ep",[t,r]);let i={type:"init-ep",in:{epName:e,env:ee}};St.postMessage(i)});await Hn(ee,e)},Ap=async e=>cr()?(Qr(),new Promise((t,r)=>{Zr("copy-from",[t,r]);let i={type:"copy-from",in:{buffer:e}};St.postMessage(i,[e.buffer])})):Ua(e),Op=async(e,t)=>{if(cr()){if(t!=null&&t.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return Qr(),new Promise((r,i)=>{Zr("create",[r,i]);let a={type:"create",in:{model:e,options:{...t}}},n=[];e instanceof Uint8Array&&n.push(e.buffer),St.postMessage(a,n)})}else return Zn(e,t)},Rp=async e=>{if(cr())return Qr(),new Promise((t,r)=>{Zr("release",[t,r]);let i={type:"release",in:e};St.postMessage(i)});Qn(e)},Bp=async(e,t,r,i,a,n)=>{if(cr()){if(r.some(s=>s[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(a.some(s=>s))throw new Error("pre-allocated output tensor is not supported for proxy.");return Qr(),new Promise((s,o)=>{Zr("run",[s,o]);let u=r,l={type:"run",in:{sessionId:e,inputIndices:t,inputs:u,outputIndices:i,options:n}};St.postMessage(l,es(u))})}else return Yn(e,t,r,i,a,n)},Mp=async e=>{if(cr())return Qr(),new Promise((t,r)=>{Zr("end-profiling",[t,r]);let i={type:"end-profiling",in:e};St.postMessage(i)});Jn(e)}}),rs,Pp,Up,ih=C(()=>{et(),Dp(),ue(),$r(),qi(),rs=(e,t)=>{switch(e.location){case"cpu":return[e.type,e.dims,e.data,"cpu"];case"gpu-buffer":return[e.type,e.dims,{gpuBuffer:e.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[e.type,e.dims,{mlTensor:e.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${e.location} for ${t()}`)}},Pp=e=>{switch(e[3]){case"cpu":return new Ge(e[0],e[2],e[1]);case"gpu-buffer":{let t=e[0];if(!Mr(t))throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);let{gpuBuffer:r,download:i,dispose:a}=e[2];return Ge.fromGpuBuffer(r,{dataType:t,dims:e[1],download:i,dispose:a})}case"ml-tensor":{let t=e[0];if(!Dr(t))throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);let{mlTensor:r,download:i,dispose:a}=e[2];return Ge.fromMLTensor(r,{dataType:t,dims:e[1],download:i,dispose:a})}default:throw new Error(`invalid data location: ${e[3]}`)}},Up=class{async fetchModelAndCopyToWasmMemory(e){return Ap(await Pr(e))}async loadModel(e,t){rt();let r;typeof e=="string"?r=await this.fetchModelAndCopyToWasmMemory(e):r=e,[this.sessionId,this.inputNames,this.outputNames,this.inputMetadata,this.outputMetadata]=await Op(r,t),Je()}async dispose(){return Rp(this.sessionId)}async run(e,t,r){rt();let i=[],a=[];Object.entries(e).forEach(p=>{let h=p[0],f=p[1],g=this.inputNames.indexOf(h);if(g===-1)throw new Error(`invalid input '${h}'`);i.push(f),a.push(g)});let n=[],s=[];Object.entries(t).forEach(p=>{let h=p[0],f=p[1],g=this.outputNames.indexOf(h);if(g===-1)throw new Error(`invalid output '${h}'`);n.push(f),s.push(g)});let o=i.map((p,h)=>rs(p,()=>`input "${this.inputNames[a[h]]}"`)),u=n.map((p,h)=>p?rs(p,()=>`output "${this.outputNames[s[h]]}"`):null),l=await Bp(this.sessionId,a,o,s,u,r),d={};for(let p=0;p<l.length;p++)d[this.outputNames[s[p]]]=n[p]??Pp(l[p]);return Je(),d}startProfiling(){}endProfiling(){Mp(this.sessionId)}}}),Np={};Q(Np,{OnnxruntimeWebAssemblyBackend:()=>as,initializeFlags:()=>is,wasmBackend:()=>Lp});var is,as,Lp,ah=C(()=>{et(),Dp(),ih(),is=()=>{(typeof ee.wasm.initTimeout!="number"||ee.wasm.initTimeout<0)&&(ee.wasm.initTimeout=0);let e=ee.wasm.simd;if(typeof e!="boolean"&&e!==void 0&&e!=="fixed"&&e!=="relaxed"&&(console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`),ee.wasm.simd=!1),typeof ee.wasm.proxy!="boolean"&&(ee.wasm.proxy=!1),typeof ee.wasm.trace!="boolean"&&(ee.wasm.trace=!1),typeof ee.wasm.numThreads!="number"||!Number.isInteger(ee.wasm.numThreads)||ee.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)ee.wasm.numThreads=1;else{let t=typeof navigator>"u"?K("node:os").cpus().length:navigator.hardwareConcurrency;ee.wasm.numThreads=Math.min(4,Math.ceil((t||1)/2))}},as=class{async init(e){is(),await Cp(),await zp(e)}async createInferenceSessionHandler(e,t){let r=new Up;return await r.loadModel(e,t),r}},Lp=new as}),Vp={};Q(Vp,{InferenceSession:()=>br,TRACE:()=>Wt,TRACE_EVENT_BEGIN:()=>pt,TRACE_EVENT_END:()=>ct,TRACE_FUNC_BEGIN:()=>rt,TRACE_FUNC_END:()=>Je,Tensor:()=>Ge,default:()=>sh,env:()=>ee,registerBackend:()=>Y}),et(),et(),et();var nh="1.24.3",sh=xi;{let e=(ah(),Ie(Np)).wasmBackend;Y("webgpu",e,5),Y("webnn",e,5),Y("cpu",e,10),Y("wasm",e,10)}return Object.defineProperty(ee.versions,"web",{value:nh,enumerable:!0}),Ie(Vp)})();/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *//**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *//**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */G.exports=Oe})(ss)),ss.exports}var Xr={},os={},Zp;function hh(){return Zp||(Zp=1,Object.defineProperty(os,"__esModule",{value:!0})),os}var wa={},Qp;function fh(){if(Qp)return wa;Qp=1;var G;Object.defineProperty(wa,"__esModule",{value:!0}),wa.SileroLegacy=void 0;const be=va();class Oe{constructor(ve,_e,de,K,C){this.ortInstance=ve,this._session=_e,this._h=de,this._c=K,this._sr=C,this.reset_state=()=>{const Q=Array(128).fill(0);this._h=new this.ortInstance.Tensor("float32",Q,[2,1,64]),this._c=new this.ortInstance.Tensor("float32",Q,[2,1,64])},this.process=async Q=>{var re;const Ie={input:new this.ortInstance.Tensor("float32",Q,[1,Q.length]),h:this._h,c:this._c,sr:this._sr},ce=await this._session.run(Ie);this._h=ce.hn,this._c=ce.cn;const[se]=(re=ce.output)==null?void 0:re.data;return{notSpeech:1-se,isSpeech:se}},this.release=async()=>{await this._session.release(),this._h.dispose(),this._c.dispose(),this._sr.dispose()}}}return wa.SileroLegacy=Oe,G=Oe,Oe.new=async($e,ve)=>{be.log.debug("initializing vad");const _e=await ve(),de=await $e.InferenceSession.create(_e),K=new $e.Tensor("int64",[16000n]),C=Array(128).fill(0),Q=new $e.Tensor("float32",C,[2,1,64]),xe=new $e.Tensor("float32",C,[2,1,64]);return be.log.debug("vad is initialized"),new G($e,de,Q,xe,K)},wa}var _a={},Xp;function mh(){if(Xp)return _a;Xp=1;var G;Object.defineProperty(_a,"__esModule",{value:!0}),_a.SileroV5=void 0;const be=va();function Oe(ve){const _e=Array(256).fill(0);return new ve.Tensor("float32",_e,[2,1,128])}class $e{constructor(_e,de,K,C){this._session=_e,this._state=de,this._sr=K,this.ortInstance=C,this.reset_state=()=>{this._state=Oe(this.ortInstance)},this.process=async Q=>{var re;const Ie={input:new this.ortInstance.Tensor("float32",Q,[1,Q.length]),state:this._state,sr:this._sr},ce=await this._session.run(Ie);if(!ce.stateN)throw new Error("No state from model");if(this._state=ce.stateN,!((re=ce.output)!=null&&re.data))throw new Error("No output from model");const se=ce.output.data[0];if(typeof se!="number")throw new Error("Weird output data");return{notSpeech:1-se,isSpeech:se}},this.release=async()=>{await this._session.release(),this._state.dispose(),this._sr.dispose()}}}return _a.SileroV5=$e,G=$e,$e.new=async(ve,_e)=>{be.log.debug("Loading VAD...");const de=await _e(),K=await ve.InferenceSession.create(de),C=new ve.Tensor("int64",[16000n]),Q=Oe(ve);return be.log.debug("...finished loading VAD"),new G(K,Q,C,ve)},_a}var Yp;function uc(){return Yp||(Yp=1,(function(G){var be=Xr&&Xr.__createBinding||(Object.create?(function(_e,de,K,C){C===void 0&&(C=K);var Q=Object.getOwnPropertyDescriptor(de,K);(!Q||("get"in Q?!de.__esModule:Q.writable||Q.configurable))&&(Q={enumerable:!0,get:function(){return de[K]}}),Object.defineProperty(_e,C,Q)}):(function(_e,de,K,C){C===void 0&&(C=K),_e[C]=de[K]})),Oe=Xr&&Xr.__exportStar||function(_e,de){for(var K in _e)K!=="default"&&!Object.prototype.hasOwnProperty.call(de,K)&&be(de,_e,K)};Object.defineProperty(G,"__esModule",{value:!0}),G.SileroV5=G.SileroLegacy=void 0,Oe(hh(),G);var $e=fh();Object.defineProperty(G,"SileroLegacy",{enumerable:!0,get:function(){return $e.SileroLegacy}});var ve=mh();Object.defineProperty(G,"SileroV5",{enumerable:!0,get:function(){return ve.SileroV5}})})(Xr)),Xr}var ba={},Jp;function lc(){if(Jp)return ba;Jp=1,Object.defineProperty(ba,"__esModule",{value:!0}),ba.Resampler=void 0;const G=va();class be{constructor($e){this.options=$e,this.process=ve=>{const _e=[];for(const de of ve)for(this.inputBuffer.push(de);this.hasEnoughDataForFrame();){const K=this.generateOutputFrame();_e.push(K)}return _e},$e.nativeSampleRate<16e3&&G.log.error("nativeSampleRate is too low. Should have 16000 = targetSampleRate <= nativeSampleRate"),this.inputBuffer=[]}async*stream($e){for(const ve of $e)for(this.inputBuffer.push(ve);this.hasEnoughDataForFrame();)yield this.generateOutputFrame()}hasEnoughDataForFrame(){return this.inputBuffer.length*this.options.targetSampleRate/this.options.nativeSampleRate>=this.options.targetFrameSize}generateOutputFrame(){const $e=new Float32Array(this.options.targetFrameSize);let ve=0,_e=0;for(;ve<this.options.targetFrameSize;){let de=0,K=0;for(;_e<Math.min(this.inputBuffer.length,(ve+1)*this.options.nativeSampleRate/this.options.targetSampleRate);){const C=this.inputBuffer[_e];C!==void 0&&(de+=C,K++),_e++}$e[ve]=de/K,ve++}return this.inputBuffer=this.inputBuffer.slice(_e),$e}}return ba.Resampler=be,ba}var ec;function gh(){return ec||(ec=1,(function(G){var be=ir&&ir.__createBinding||(Object.create?(function(ce,se,Y,re){re===void 0&&(re=Y);var Re=Object.getOwnPropertyDescriptor(se,Y);(!Re||("get"in Re?!se.__esModule:Re.writable||Re.configurable))&&(Re={enumerable:!0,get:function(){return se[Y]}}),Object.defineProperty(ce,re,Re)}):(function(ce,se,Y,re){re===void 0&&(re=Y),ce[re]=se[Y]})),Oe=ir&&ir.__setModuleDefault||(Object.create?(function(ce,se){Object.defineProperty(ce,"default",{enumerable:!0,value:se})}):function(ce,se){ce.default=se}),$e=ir&&ir.__importStar||function(ce){if(ce&&ce.__esModule)return ce;var se={};if(ce!=null)for(var Y in ce)Y!=="default"&&Object.prototype.hasOwnProperty.call(ce,Y)&&be(se,ce,Y);return Oe(se,ce),se};Object.defineProperty(G,"__esModule",{value:!0}),G.NonRealTimeVAD=G.defaultNonRealTimeVADOptions=void 0;const ve=$e(ch()),_e=nc(),de=ls(),K=ds(),C=Fa(),Q=uc(),xe=lc();G.defaultNonRealTimeVADOptions={...K.defaultFrameProcessorOptions,modelURL:_e.baseAssetPath+"silero_vad_legacy.onnx",modelFetcher:de.defaultModelFetcher};class Ie{static async new(se={}){const Y={...G.defaultNonRealTimeVADOptions,...se};(0,K.validateOptions)(Y),Y.ortConfig!==void 0&&Y.ortConfig(ve);const re=()=>Y.modelFetcher(Y.modelURL),Re=await Q.SileroLegacy.new(ve,re),Ze=new K.FrameProcessor(Re.process,Re.reset_state,{positiveSpeechThreshold:Y.positiveSpeechThreshold,negativeSpeechThreshold:Y.negativeSpeechThreshold,redemptionMs:Y.redemptionMs,preSpeechPadMs:Y.preSpeechPadMs,minSpeechMs:Y.minSpeechMs,submitUserSpeechOnPause:Y.submitUserSpeechOnPause},1536/16);return Ze.resume(),new this(re,ve,Y,Ze)}constructor(se,Y,re,Re){this.modelFetcher=se,this.ort=Y,this.options=re,this.frameProcessor=Re,this.frameSamples=1536}async*run(se,Y){const re={nativeSampleRate:Y,targetSampleRate:16e3,targetFrameSize:this.frameSamples},Re=new xe.Resampler(re);let Ze=0,tt=0,Se=0;for await(const pe of Re.stream(se)){const le=[];await this.frameProcessor.process(pe,Fe=>{le.push(Fe)});for(const Fe of le)switch(Fe.msg){case C.Message.SpeechStart:Ze=Se*this.frameSamples/16;break;case C.Message.SpeechEnd:tt=(Se+1)*this.frameSamples/16,yield{audio:Fe.audio,start:Ze,end:tt};break}Se++}const Te=[];this.frameProcessor.endSegment(pe=>{Te.push(pe)});for(const pe of Te)switch(pe.msg){case C.Message.SpeechEnd:yield{audio:pe.audio,start:Ze,end:Se*this.frameSamples/16}}}}G.NonRealTimeVAD=Ie})(ir)),ir}var Ft={},tc;function yh(){if(tc)return Ft;tc=1,Object.defineProperty(Ft,"__esModule",{value:!0}),Ft.audioFileToArray=Ft.encodeWAV=Ft.arrayBufferToBase64=Ft.minFramesForTargetMS=void 0;function G(K,C,Q=16e3){return Math.ceil(K*Q/1e3/C)}Ft.minFramesForTargetMS=G;function be(K){const C=new Uint8Array(K),Q=C.byteLength,xe=new Array(Q);for(let Ie=0;Ie<Q;Ie++){const ce=C[Ie];if(ce===void 0)break;xe[Ie]=String.fromCharCode(ce)}return btoa(xe.join(""))}Ft.arrayBufferToBase64=be;function Oe(K,C=3,Q=16e3,xe=1,Ie=32){const ce=Ie/8,se=xe*ce,Y=new ArrayBuffer(44+K.length*ce),re=new DataView(Y);return _e(re,0,"RIFF"),re.setUint32(4,36+K.length*ce,!0),_e(re,8,"WAVE"),_e(re,12,"fmt "),re.setUint32(16,16,!0),re.setUint16(20,C,!0),re.setUint16(22,xe,!0),re.setUint32(24,Q,!0),re.setUint32(28,Q*se,!0),re.setUint16(32,se,!0),re.setUint16(34,Ie,!0),_e(re,36,"data"),re.setUint32(40,K.length*ce,!0),C===1?ve(re,44,K):$e(re,44,K),Y}Ft.encodeWAV=Oe;function $e(K,C,Q){for(let xe=0;xe<Q.length;xe++,C+=4)K.setFloat32(C,Q[xe],!0)}function ve(K,C,Q){for(let xe=0;xe<Q.length;xe++,C+=2){const Ie=Math.max(-1,Math.min(1,Q[xe]));K.setInt16(C,Ie<0?Ie*32768:Ie*32767,!0)}}function _e(K,C,Q){for(let xe=0;xe<Q.length;xe++)K.setUint8(C+xe,Q.charCodeAt(xe))}async function de(K){const C=new OfflineAudioContext(1,1,44100),Q=new FileReader;let xe=null;if(await new Promise(se=>{Q.addEventListener("loadend",()=>{const Y=Q.result;C.decodeAudioData(Y,re=>{xe=re,C.startRendering().then(()=>{console.log("Rendering completed successfully"),se()}).catch(Re=>{console.error("Rendering failed: ",Re)})},re=>{console.log("Error with decoding audio data: ",re)})}),Q.readAsArrayBuffer(K)}),xe===null)throw Error("some shit");const Ie=xe,ce=new Float32Array(Ie.length);for(let se=0;se<Ie.length;se++)for(let Y=0;Y<Ie.numberOfChannels;Y++){const re=Ie.getChannelData(Y)[se],Re=ce[se];if(re===void 0||Re===void 0)throw new Error("sample or out[i] is undefined");ce[se]=Re+re}return{audio:ce,sampleRate:Ie.sampleRate}}return Ft.audioFileToArray=de,Ft}var ar={},us={exports:{}};/*!
 * ONNX Runtime Web v1.24.3
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */var rc;function wh(){return rc||(rc=1,(function(G,be){var Oe=(()=>{var $e=Object.defineProperty,ve=Object.getOwnPropertyDescriptor,_e=Object.getOwnPropertyNames,de=Object.prototype.hasOwnProperty,K=(c=>typeof zt<"u"?zt:typeof Proxy<"u"?new Proxy(c,{get:(m,b)=>(typeof zt<"u"?zt:m)[b]}):c)(function(c){if(typeof zt<"u")return zt.apply(this,arguments);throw Error('Dynamic require of "'+c+'" is not supported')}),C=(c,m)=>()=>(c&&(m=c(c=0)),m),Q=(c,m)=>{for(var b in m)$e(c,b,{get:m[b],enumerable:!0})},xe=(c,m,b,T)=>{if(m&&typeof m=="object"||typeof m=="function")for(let v of _e(m))!de.call(c,v)&&v!==b&&$e(c,v,{get:()=>m[v],enumerable:!(T=ve(m,v))||T.enumerable});return c},Ie=c=>xe($e({},"__esModule",{value:!0}),c),ce,se,Y,re,Re,Ze=C(()=>{ce=new Map,se=[],Y=(c,m,b)=>{if(m&&typeof m.init=="function"&&typeof m.createInferenceSessionHandler=="function"){let T=ce.get(c);if(T===void 0)ce.set(c,{backend:m,priority:b});else{if(T.priority>b)return;if(T.priority===b&&T.backend!==m)throw new Error(`cannot register backend "${c}" using priority ${b}`)}if(b>=0){let v=se.indexOf(c);v!==-1&&se.splice(v,1);for(let A=0;A<se.length;A++)if(ce.get(se[A]).priority<=b){se.splice(A,0,c);return}se.push(c)}return}throw new TypeError("not a valid backend")},re=async c=>{let m=ce.get(c);if(!m)return"backend not found.";if(m.initialized)return m.backend;if(m.aborted)return m.error;{let b=!!m.initPromise;try{return b||(m.initPromise=m.backend.init(c)),await m.initPromise,m.initialized=!0,m.backend}catch(T){return b||(m.error=`${T}`,m.aborted=!0),m.error}finally{delete m.initPromise}}},Re=async c=>{let m=c.executionProviders||[],b=m.map(O=>typeof O=="string"?O:O.name),T=b.length===0?se:b,v,A=[],E=new Set;for(let O of T){let N=await re(O);typeof N=="string"?A.push({name:O,err:N}):(v||(v=N),v===N&&E.add(O))}if(!v)throw new Error(`no available backend found. ERR: ${A.map(O=>`[${O.name}] ${O.err}`).join(", ")}`);for(let{name:O,err:N}of A)b.includes(O)&&console.warn(`removing requested execution provider "${O}" from session options because it is not available: ${N}`);let I=m.filter(O=>E.has(typeof O=="string"?O:O.name));return[v,new Proxy(c,{get:(O,N)=>N==="executionProviders"?I:Reflect.get(O,N)})]}}),tt=C(()=>{Ze()}),Se,Te=C(()=>{Se="1.24.3"}),pe,le,Fe=C(()=>{Te(),pe="warning",le={wasm:{},webgl:{},webgpu:{},versions:{common:Se},set logLevel(c){if(c!==void 0){if(typeof c!="string"||["verbose","info","warning","error","fatal"].indexOf(c)===-1)throw new Error(`Unsupported logging level: ${c}`);pe=c}},get logLevel(){return pe}},Object.defineProperty(le,"logLevel",{enumerable:!0})}),ee,lt=C(()=>{Fe(),ee=le}),Ke,yt,nr=C(()=>{Ke=(c,m)=>{let b=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);b.width=c.dims[3],b.height=c.dims[2];let T=b.getContext("2d");if(T!=null){let v,A;(m==null?void 0:m.tensorLayout)!==void 0&&m.tensorLayout==="NHWC"?(v=c.dims[2],A=c.dims[3]):(v=c.dims[3],A=c.dims[2]);let E=(m==null?void 0:m.format)!==void 0?m.format:"RGB",I=m==null?void 0:m.norm,O,N;I===void 0||I.mean===void 0?O=[255,255,255,255]:typeof I.mean=="number"?O=[I.mean,I.mean,I.mean,I.mean]:(O=[I.mean[0],I.mean[1],I.mean[2],0],I.mean[3]!==void 0&&(O[3]=I.mean[3])),I===void 0||I.bias===void 0?N=[0,0,0,0]:typeof I.bias=="number"?N=[I.bias,I.bias,I.bias,I.bias]:(N=[I.bias[0],I.bias[1],I.bias[2],0],I.bias[3]!==void 0&&(N[3]=I.bias[3]));let V=A*v,U=0,R=V,Z=V*2,z=-1;E==="RGBA"?(U=0,R=V,Z=V*2,z=V*3):E==="RGB"?(U=0,R=V,Z=V*2):E==="RBG"&&(U=0,Z=V,R=V*2);for(let F=0;F<A;F++)for(let Le=0;Le<v;Le++){let ye=(c.data[U++]-N[0])*O[0],me=(c.data[R++]-N[1])*O[1],Me=(c.data[Z++]-N[2])*O[2],te=z===-1?255:(c.data[z++]-N[3])*O[3];T.fillStyle="rgba("+ye+","+me+","+Me+","+te+")",T.fillRect(Le,F,1,1)}if("toDataURL"in b)return b.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},yt=(c,m)=>{let b=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),T;if(b!=null){let v,A,E;(m==null?void 0:m.tensorLayout)!==void 0&&m.tensorLayout==="NHWC"?(v=c.dims[2],A=c.dims[1],E=c.dims[3]):(v=c.dims[3],A=c.dims[2],E=c.dims[1]);let I=m!==void 0&&m.format!==void 0?m.format:"RGB",O=m==null?void 0:m.norm,N,V;O===void 0||O.mean===void 0?N=[255,255,255,255]:typeof O.mean=="number"?N=[O.mean,O.mean,O.mean,O.mean]:(N=[O.mean[0],O.mean[1],O.mean[2],255],O.mean[3]!==void 0&&(N[3]=O.mean[3])),O===void 0||O.bias===void 0?V=[0,0,0,0]:typeof O.bias=="number"?V=[O.bias,O.bias,O.bias,O.bias]:(V=[O.bias[0],O.bias[1],O.bias[2],0],O.bias[3]!==void 0&&(V[3]=O.bias[3]));let U=A*v;if(m!==void 0&&(m.format!==void 0&&E===4&&m.format!=="RGBA"||E===3&&m.format!=="RGB"&&m.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let R=4,Z=0,z=1,F=2,Le=3,ye=0,me=U,Me=U*2,te=-1;I==="RGBA"?(ye=0,me=U,Me=U*2,te=U*3):I==="RGB"?(ye=0,me=U,Me=U*2):I==="RBG"&&(ye=0,Me=U,me=U*2),T=b.createImageData(v,A);for(let Ne=0;Ne<A*v;Z+=R,z+=R,F+=R,Le+=R,Ne++)T.data[Z]=(c.data[ye++]-V[0])*N[0],T.data[z]=(c.data[me++]-V[1])*N[1],T.data[F]=(c.data[Me++]-V[2])*N[2],T.data[Le]=te===-1?255:(c.data[te++]-V[3])*N[3]}else throw new Error("Can not access image data");return T}}),dt,_t,mr,gr,De,It,gi=C(()=>{wr(),dt=(c,m)=>{if(c===void 0)throw new Error("Image buffer must be defined");if(m.height===void 0||m.width===void 0)throw new Error("Image height and width must be defined");if(m.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:b,width:T}=m,v=m.norm??{mean:255,bias:0},A,E;typeof v.mean=="number"?A=[v.mean,v.mean,v.mean,v.mean]:A=[v.mean[0],v.mean[1],v.mean[2],v.mean[3]??255],typeof v.bias=="number"?E=[v.bias,v.bias,v.bias,v.bias]:E=[v.bias[0],v.bias[1],v.bias[2],v.bias[3]??0];let I=m.format!==void 0?m.format:"RGBA",O=m.tensorFormat!==void 0&&m.tensorFormat!==void 0?m.tensorFormat:"RGB",N=b*T,V=O==="RGBA"?new Float32Array(N*4):new Float32Array(N*3),U=4,R=0,Z=1,z=2,F=3,Le=0,ye=N,me=N*2,Me=-1;I==="RGB"&&(U=3,R=0,Z=1,z=2,F=-1),O==="RGBA"?Me=N*3:O==="RBG"?(Le=0,me=N,ye=N*2):O==="BGR"&&(me=0,ye=N,Le=N*2);for(let te=0;te<N;te++,R+=U,z+=U,Z+=U,F+=U)V[Le++]=(c[R]+E[0])/A[0],V[ye++]=(c[Z]+E[1])/A[1],V[me++]=(c[z]+E[2])/A[2],Me!==-1&&F!==-1&&(V[Me++]=(c[F]+E[3])/A[3]);return O==="RGBA"?new Pe("float32",V,[1,4,b,T]):new Pe("float32",V,[1,3,b,T])},_t=async(c,m)=>{let b=typeof HTMLImageElement<"u"&&c instanceof HTMLImageElement,T=typeof ImageData<"u"&&c instanceof ImageData,v=typeof ImageBitmap<"u"&&c instanceof ImageBitmap,A=typeof c=="string",E,I=m??{},O=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},N=V=>typeof HTMLCanvasElement<"u"&&V instanceof HTMLCanvasElement||V instanceof OffscreenCanvas?V.getContext("2d"):null;if(b){let V=O();V.width=c.width,V.height=c.height;let U=N(V);if(U!=null){let R=c.height,Z=c.width;if(m!==void 0&&m.resizedHeight!==void 0&&m.resizedWidth!==void 0&&(R=m.resizedHeight,Z=m.resizedWidth),m!==void 0){if(I=m,m.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");I.tensorFormat="RGBA",I.height=R,I.width=Z}else I.tensorFormat="RGBA",I.height=R,I.width=Z;U.drawImage(c,0,0),E=U.getImageData(0,0,Z,R).data}else throw new Error("Can not access image data")}else if(T){let V,U;if(m!==void 0&&m.resizedWidth!==void 0&&m.resizedHeight!==void 0?(V=m.resizedHeight,U=m.resizedWidth):(V=c.height,U=c.width),m!==void 0&&(I=m),I.format="RGBA",I.height=V,I.width=U,m!==void 0){let R=O();R.width=U,R.height=V;let Z=N(R);if(Z!=null)Z.putImageData(c,0,0),E=Z.getImageData(0,0,U,V).data;else throw new Error("Can not access image data")}else E=c.data}else if(v){if(m===void 0)throw new Error("Please provide image config with format for Imagebitmap");let V=O();V.width=c.width,V.height=c.height;let U=N(V);if(U!=null){let R=c.height,Z=c.width;return U.drawImage(c,0,0,Z,R),E=U.getImageData(0,0,Z,R).data,I.height=R,I.width=Z,dt(E,I)}else throw new Error("Can not access image data")}else{if(A)return new Promise((V,U)=>{let R=O(),Z=N(R);if(!c||!Z)return U();let z=new Image;z.crossOrigin="Anonymous",z.src=c,z.onload=()=>{R.width=z.width,R.height=z.height,Z.drawImage(z,0,0,R.width,R.height);let F=Z.getImageData(0,0,R.width,R.height);I.height=R.height,I.width=R.width,V(dt(F.data,I))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(E!==void 0)return dt(E,I);throw new Error("Input data provided is not supported - aborted tensor creation")},mr=(c,m)=>{let{width:b,height:T,download:v,dispose:A}=m,E=[1,T,b,4];return new Pe({location:"texture",type:"float32",texture:c,dims:E,download:v,dispose:A})},gr=(c,m)=>{let{dataType:b,dims:T,download:v,dispose:A}=m;return new Pe({location:"gpu-buffer",type:b??"float32",gpuBuffer:c,dims:T,download:v,dispose:A})},De=(c,m)=>{let{dataType:b,dims:T,download:v,dispose:A}=m;return new Pe({location:"ml-tensor",type:b??"float32",mlTensor:c,dims:T,download:v,dispose:A})},It=(c,m,b)=>new Pe({location:"cpu-pinned",type:c,data:m,dims:b??[m.length]})}),nt,At,yr,yi,Wa=C(()=>{nt=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),At=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),yr=!1,yi=()=>{if(!yr){yr=!0;let c=typeof BigInt64Array<"u"&&BigInt64Array.from,m=typeof BigUint64Array<"u"&&BigUint64Array.from,b=globalThis.Float16Array,T=typeof b<"u"&&b.from;c&&(nt.set("int64",BigInt64Array),At.set(BigInt64Array,"int64")),m&&(nt.set("uint64",BigUint64Array),At.set(BigUint64Array,"uint64")),T?(nt.set("float16",b),At.set(b,"float16")):nt.set("float16",Uint16Array)}}}),wi,_i,Ga=C(()=>{wr(),wi=c=>{let m=1;for(let b=0;b<c.length;b++){let T=c[b];if(typeof T!="number"||!Number.isSafeInteger(T))throw new TypeError(`dims[${b}] must be an integer, got: ${T}`);if(T<0)throw new RangeError(`dims[${b}] must be a non-negative integer, got: ${T}`);m*=T}return m},_i=(c,m)=>{switch(c.location){case"cpu":return new Pe(c.type,c.data,m);case"cpu-pinned":return new Pe({location:"cpu-pinned",data:c.data,type:c.type,dims:m});case"texture":return new Pe({location:"texture",texture:c.texture,type:c.type,dims:m});case"gpu-buffer":return new Pe({location:"gpu-buffer",gpuBuffer:c.gpuBuffer,type:c.type,dims:m});case"ml-tensor":return new Pe({location:"ml-tensor",mlTensor:c.mlTensor,type:c.type,dims:m});default:throw new Error(`tensorReshape: tensor location ${c.location} is not supported`)}}}),Pe,wr=C(()=>{nr(),gi(),Wa(),Ga(),Pe=class{constructor(c,m,b){yi();let T,v;if(typeof c=="object"&&"location"in c)switch(this.dataLocation=c.location,T=c.type,v=c.dims,c.location){case"cpu-pinned":{let E=nt.get(T);if(!E)throw new TypeError(`unsupported type "${T}" to create tensor from pinned buffer`);if(!(c.data instanceof E))throw new TypeError(`buffer should be of type ${E.name}`);this.cpuData=c.data;break}case"texture":{if(T!=="float32")throw new TypeError(`unsupported type "${T}" to create tensor from texture`);this.gpuTextureData=c.texture,this.downloader=c.download,this.disposer=c.dispose;break}case"gpu-buffer":{if(T!=="float32"&&T!=="float16"&&T!=="int32"&&T!=="int64"&&T!=="uint32"&&T!=="uint8"&&T!=="bool"&&T!=="uint4"&&T!=="int4")throw new TypeError(`unsupported type "${T}" to create tensor from gpu buffer`);this.gpuBufferData=c.gpuBuffer,this.downloader=c.download,this.disposer=c.dispose;break}case"ml-tensor":{if(T!=="float32"&&T!=="float16"&&T!=="int32"&&T!=="int64"&&T!=="uint32"&&T!=="uint64"&&T!=="int8"&&T!=="uint8"&&T!=="bool"&&T!=="uint4"&&T!=="int4")throw new TypeError(`unsupported type "${T}" to create tensor from MLTensor`);this.mlTensorData=c.mlTensor,this.downloader=c.download,this.disposer=c.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let E,I;if(typeof c=="string")if(T=c,I=b,c==="string"){if(!Array.isArray(m))throw new TypeError("A string tensor's data must be a string array.");E=m}else{let O=nt.get(c);if(O===void 0)throw new TypeError(`Unsupported tensor type: ${c}.`);if(Array.isArray(m)){if(c==="float16"&&O===Uint16Array||c==="uint4"||c==="int4")throw new TypeError(`Creating a ${c} tensor from number array is not supported. Please use ${O.name} as data.`);c==="uint64"||c==="int64"?E=O.from(m,BigInt):E=O.from(m)}else if(m instanceof O)E=m;else if(m instanceof Uint8ClampedArray)if(c==="uint8")E=Uint8Array.from(m);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else if(c==="float16"&&m instanceof Uint16Array&&O!==Uint16Array)E=new globalThis.Float16Array(m.buffer,m.byteOffset,m.length);else throw new TypeError(`A ${T} tensor's data must be type of ${O}`)}else if(I=m,Array.isArray(c)){if(c.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let O=typeof c[0];if(O==="string")T="string",E=c;else if(O==="boolean")T="bool",E=Uint8Array.from(c);else throw new TypeError(`Invalid element type of data array: ${O}.`)}else if(c instanceof Uint8ClampedArray)T="uint8",E=Uint8Array.from(c);else{let O=At.get(c.constructor);if(O===void 0)throw new TypeError(`Unsupported type for tensor data: ${c.constructor}.`);T=O,E=c}if(I===void 0)I=[E.length];else if(!Array.isArray(I))throw new TypeError("A tensor's dims must be a number array");v=I,this.cpuData=E,this.dataLocation="cpu"}let A=wi(v);if(this.cpuData&&A!==this.cpuData.length&&!((T==="uint4"||T==="int4")&&Math.ceil(A/2)===this.cpuData.length))throw new Error(`Tensor's size(${A}) does not match data length(${this.cpuData.length}).`);this.type=T,this.dims=v,this.size=A}static async fromImage(c,m){return _t(c,m)}static fromTexture(c,m){return mr(c,m)}static fromGpuBuffer(c,m){return gr(c,m)}static fromMLTensor(c,m){return De(c,m)}static fromPinnedBuffer(c,m,b){return It(c,m,b)}toDataURL(c){return Ke(this,c)}toImageData(c){return yt(this,c)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(c){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let m=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=m,c&&this.disposer&&(this.disposer(),this.disposer=void 0),m}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(c){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return _i(this,c)}}}),Ge,bi=C(()=>{wr(),Ge=Pe}),Wt,_r,rt,Je,pt,ct,$i=C(()=>{Fe(),Wt=(c,m)=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeStamp(`${c}::ORT::${m}`)},_r=(c,m)=>{var v;let b=((v=new Error().stack)==null?void 0:v.split(/\r\n|\r|\n/g))||[],T=!1;for(let A=0;A<b.length;A++){if(T&&!b[A].includes("TRACE_FUNC")){let E=`FUNC_${c}::${b[A].trim().split(" ")[1]}`;m&&(E+=`::${m}`),Wt("CPU",E);return}b[A].includes("TRACE_FUNC")&&(T=!0)}},rt=c=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||_r("BEGIN",c)},Je=c=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||_r("END",c)},pt=c=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.time(`ORT::${c}`)},ct=c=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeEnd(`ORT::${c}`)}}),vi,ja=C(()=>{Ze(),bi(),$i(),vi=class dc{constructor(m){this.handler=m}async run(m,b,T){rt(),pt("InferenceSession.run");let v={},A={};if(typeof m!="object"||m===null||m instanceof Ge||Array.isArray(m))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let E=!0;if(typeof b=="object"){if(b===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(b instanceof Ge)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(b)){if(b.length===0)throw new TypeError("'fetches' cannot be an empty array.");E=!1;for(let N of b){if(typeof N!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(N)===-1)throw new RangeError(`'fetches' contains invalid output name: ${N}.`);v[N]=null}if(typeof T=="object"&&T!==null)A=T;else if(typeof T<"u")throw new TypeError("'options' must be an object.")}else{let N=!1,V=Object.getOwnPropertyNames(b);for(let U of this.outputNames)if(V.indexOf(U)!==-1){let R=b[U];(R===null||R instanceof Ge)&&(N=!0,E=!1,v[U]=R)}if(N){if(typeof T=="object"&&T!==null)A=T;else if(typeof T<"u")throw new TypeError("'options' must be an object.")}else A=b}}else if(typeof b<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let N of this.inputNames)if(typeof m[N]>"u")throw new Error(`input '${N}' is missing in 'feeds'.`);if(E)for(let N of this.outputNames)v[N]=null;let I=await this.handler.run(m,v,A),O={};for(let N in I)if(Object.hasOwnProperty.call(I,N)){let V=I[N];V instanceof Ge?O[N]=V:O[N]=new Ge(V.type,V.data,V.dims)}return ct("InferenceSession.run"),Je(),O}async release(){return this.handler.dispose()}static async create(m,b,T,v){rt(),pt("InferenceSession.create");let A,E={};if(typeof m=="string"){if(A=m,typeof b=="object"&&b!==null)E=b;else if(typeof b<"u")throw new TypeError("'options' must be an object.")}else if(m instanceof Uint8Array){if(A=m,typeof b=="object"&&b!==null)E=b;else if(typeof b<"u")throw new TypeError("'options' must be an object.")}else if(m instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&m instanceof SharedArrayBuffer){let V=m,U=0,R=m.byteLength;if(typeof b=="object"&&b!==null)E=b;else if(typeof b=="number"){if(U=b,!Number.isSafeInteger(U))throw new RangeError("'byteOffset' must be an integer.");if(U<0||U>=V.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${V.byteLength}).`);if(R=m.byteLength-U,typeof T=="number"){if(R=T,!Number.isSafeInteger(R))throw new RangeError("'byteLength' must be an integer.");if(R<=0||U+R>V.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${V.byteLength-U}].`);if(typeof v=="object"&&v!==null)E=v;else if(typeof v<"u")throw new TypeError("'options' must be an object.")}else if(typeof T<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof b<"u")throw new TypeError("'options' must be an object.");A=new Uint8Array(V,U,R)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[I,O]=await Re(E),N=await I.createInferenceSessionHandler(A,O);return ct("InferenceSession.create"),Je(),new dc(N)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}get inputMetadata(){return this.handler.inputMetadata}get outputMetadata(){return this.handler.outputMetadata}}}),br,Ha=C(()=>{ja(),br=vi}),Ka=C(()=>{}),Za=C(()=>{}),Qa=C(()=>{}),Xa=C(()=>{}),xi={};Q(xi,{InferenceSession:()=>br,TRACE:()=>Wt,TRACE_EVENT_BEGIN:()=>pt,TRACE_EVENT_END:()=>ct,TRACE_FUNC_BEGIN:()=>rt,TRACE_FUNC_END:()=>Je,Tensor:()=>Ge,env:()=>ee,registerBackend:()=>Y});var et=C(()=>{tt(),lt(),Ha(),bi(),Ka(),Za(),$i(),Qa(),Xa()}),$r=C(()=>{}),Si={};Q(Si,{default:()=>Ti});var vr,xr,Ti,Ya=C(()=>{var c;Wi(),bt(),kr(),vr="ort-wasm-proxy-worker",xr=((c=globalThis.self)==null?void 0:c.name)===vr,xr&&(self.onmessage=m=>{let{type:b,in:T}=m.data;try{switch(b){case"init-wasm":Ar(T.wasm).then(()=>{Jr(T).then(()=>{postMessage({type:b})},v=>{postMessage({type:b,err:v})})},v=>{postMessage({type:b,err:v})});break;case"init-ep":{let{epName:v,env:A}=T;ei(A,v).then(()=>{postMessage({type:b})},E=>{postMessage({type:b,err:E})});break}case"copy-from":{let{buffer:v}=T,A=Ee(v);postMessage({type:b,out:A});break}case"create":{let{model:v,options:A}=T;Tt(v,A).then(E=>{postMessage({type:b,out:E})},E=>{postMessage({type:b,err:E})});break}case"release":ii(T),postMessage({type:b});break;case"run":{let{sessionId:v,inputIndices:A,inputs:E,outputIndices:I,options:O}=T;M(v,A,E,I,new Array(I.length).fill(null),O).then(N=>{N.some(V=>V[3]!=="cpu")?postMessage({type:b,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:b,out:N},ai([...E,...N]))},N=>{postMessage({type:b,err:N})});break}case"end-profiling":sr(T),postMessage({type:b});break;default:}}catch(v){postMessage({type:b,err:v})}}),Ti=xr?null:m=>new Worker(m??Ue,{type:"classic",name:vr})}),Ei,Ii,Ue,Sr,Qt,ki,Ci,Tr,zi,Er,Ai,Ir,Oi,kr=C(()=>{$r(),Ei=typeof location>"u"?void 0:location.origin,Ii=()=>{var c,m;return typeof document<"u"?(c=document.currentScript)==null?void 0:c.src:typeof self<"u"?(m=self.location)==null?void 0:m.href:void 0},Ue=Ii(),Sr=()=>{if(Ue&&!Ue.startsWith("blob:"))return Ue.substring(0,Ue.lastIndexOf("/")+1)},Qt=(c,m)=>{try{let b=m??Ue;return(b?new URL(c,b):new URL(c)).origin===Ei}catch{return!1}},ki=(c,m)=>{let b=m??Ue;try{return(b?new URL(c,b):new URL(c)).href}catch{return}},Ci=(c,m)=>`${m??"./"}${c}`,Tr=async c=>{let m=await(await fetch(c,{credentials:"same-origin"})).blob();return URL.createObjectURL(m)},zi=async c=>(await import(c)).default,Er=(Ya(),Ie(Si)).default,Ai=async()=>{if(!Ue)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(Qt(Ue))return[void 0,Er()];let c=await Tr(Ue);return[c,Er(c)]},Ir=void 0,Oi=async(c,m,b,T)=>{let v=Ir&&!(c||m);if(v)if(Ue)v=Qt(Ue)||T&&!b;else if(T&&!b)v=!0;else throw new Error("cannot determine the script source URL.");if(v)return[void 0,Ir];{let A="ort-wasm-simd-threaded.mjs",E=c??ki(A,m),I=b&&E&&!Qt(E,m),O=I?await Tr(E):E??Ci(A,m);return[I?O:void 0,await zi(O)]}}}),Cr,Xt,Ot,zr,Ri,Bi,Mi,Ar,he,bt=C(()=>{kr(),Xt=!1,Ot=!1,zr=!1,Ri=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},Bi=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},Mi=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,19,1,17,0,65,1,253,15,65,2,253,15,65,3,253,15,253,147,2,11]))}catch{return!1}},Ar=async c=>{if(Xt)return Promise.resolve();if(Ot)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(zr)throw new Error("previous call to 'initializeWebAssembly()' failed.");Ot=!0;let m=c.initTimeout,b=c.numThreads;if(c.simd!==!1){if(c.simd==="relaxed"){if(!Mi())throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.")}else if(!Bi())throw new Error("WebAssembly SIMD is not supported in the current environment.")}let T=Ri();b>1&&!T&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+b+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),c.numThreads=b=1);let v=c.wasmPaths,A=typeof v=="string"?v:void 0,E=v==null?void 0:v.mjs,I=(E==null?void 0:E.href)??E,O=v==null?void 0:v.wasm,N=(O==null?void 0:O.href)??O,V=c.wasmBinary,[U,R]=await Oi(I,A,b>1,!!V||!!N),Z=!1,z=[];if(m>0&&z.push(new Promise(F=>{setTimeout(()=>{Z=!0,F()},m)})),z.push(new Promise((F,Le)=>{let ye={numThreads:b};if(V)ye.wasmBinary=V,ye.locateFile=me=>me;else if(N||A)ye.locateFile=me=>N??A+me;else if(I&&I.indexOf("blob:")!==0)ye.locateFile=me=>new URL(me,I).href;else if(U){let me=Sr();me&&(ye.locateFile=Me=>me+Me)}R(ye).then(me=>{Ot=!1,Xt=!0,Cr=me,F(),U&&URL.revokeObjectURL(U)},me=>{Ot=!1,zr=!0,Le(me)})})),await Promise.race(z),Z)throw new Error(`WebAssembly backend initializing failed due to timeout: ${m}ms`)},he=()=>{if(Xt&&Cr)return Cr;throw new Error("WebAssembly is not initialized yet.")}}),je,Yt,ae,Or=C(()=>{bt(),je=(c,m)=>{let b=he(),T=b.lengthBytesUTF8(c)+1,v=b._malloc(T);return b.stringToUTF8(c,v,T),m.push(v),v},Yt=(c,m,b,T)=>{if(typeof c=="object"&&c!==null){if(b.has(c))throw new Error("Circular reference in options");b.add(c)}Object.entries(c).forEach(([v,A])=>{let E=m?m+v:v;if(typeof A=="object")Yt(A,E+".",b,T);else if(typeof A=="string"||typeof A=="number")T(E,A.toString());else if(typeof A=="boolean")T(E,A?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof A}`)})},ae=c=>{let m=he(),b=m.stackSave();try{let T=m.PTR_SIZE,v=m.stackAlloc(2*T);m._OrtGetLastError(v,v+T);let A=Number(m.getValue(v,T===4?"i32":"i64")),E=m.getValue(v+T,"*"),I=E?m.UTF8ToString(E):"";throw new Error(`${c} ERROR_CODE: ${A}, ERROR_MESSAGE: ${I}`)}finally{m.stackRestore(b)}}}),Di,Ja=C(()=>{bt(),Or(),Di=c=>{let m=he(),b=0,T=[],v=c||{};try{if((c==null?void 0:c.logSeverityLevel)===void 0)v.logSeverityLevel=2;else if(typeof c.logSeverityLevel!="number"||!Number.isInteger(c.logSeverityLevel)||c.logSeverityLevel<0||c.logSeverityLevel>4)throw new Error(`log severity level is not valid: ${c.logSeverityLevel}`);if((c==null?void 0:c.logVerbosityLevel)===void 0)v.logVerbosityLevel=0;else if(typeof c.logVerbosityLevel!="number"||!Number.isInteger(c.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${c.logVerbosityLevel}`);(c==null?void 0:c.terminate)===void 0&&(v.terminate=!1);let A=0;return(c==null?void 0:c.tag)!==void 0&&(A=je(c.tag,T)),b=m._OrtCreateRunOptions(v.logSeverityLevel,v.logVerbosityLevel,!!v.terminate,A),b===0&&ae("Can't create run options."),(c==null?void 0:c.extra)!==void 0&&Yt(c.extra,"",new WeakSet,(E,I)=>{let O=je(E,T),N=je(I,T);m._OrtAddRunConfigEntry(b,O,N)!==0&&ae(`Can't set a run config entry: ${E} - ${I}.`)}),[b,T]}catch(A){throw b!==0&&m._OrtReleaseRunOptions(b),T.forEach(E=>m._free(E)),A}}}),Pi,Ui,Ni,Rt,Li,Vi,en=C(()=>{bt(),Or(),Pi=c=>{switch(c){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"layout":return 3;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${c}`)}},Ui=c=>{switch(c){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${c}`)}},Ni=c=>{c.extra||(c.extra={}),c.extra.session||(c.extra.session={});let m=c.extra.session;m.use_ort_model_bytes_directly||(m.use_ort_model_bytes_directly="1"),c.executionProviders&&c.executionProviders.some(b=>(typeof b=="string"?b:b.name)==="webgpu")&&(c.enableMemPattern=!1)},Rt=(c,m,b,T)=>{let v=je(m,T),A=je(b,T);he()._OrtAddSessionConfigEntry(c,v,A)!==0&&ae(`Can't set a session config entry: ${m} - ${b}.`)},Li=async(c,m,b)=>{let T=m.executionProviders;for(let v of T){let A=typeof v=="string"?v:v.name,E=[];switch(A){case"webnn":if(A="WEBNN",typeof v!="string"){let U=v==null?void 0:v.deviceType;U&&Rt(c,"deviceType",U,b)}break;case"webgpu":if(A="JS",typeof v!="string"){let U=v;if(U!=null&&U.preferredLayout){if(U.preferredLayout!=="NCHW"&&U.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${U.preferredLayout}`);Rt(c,"preferredLayout",U.preferredLayout,b)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${A}`)}let I=je(A,b),O=E.length,N=0,V=0;if(O>0){N=he()._malloc(O*he().PTR_SIZE),b.push(N),V=he()._malloc(O*he().PTR_SIZE),b.push(V);for(let U=0;U<O;U++)he().setValue(N+U*he().PTR_SIZE,E[U][0],"*"),he().setValue(V+U*he().PTR_SIZE,E[U][1],"*")}await he()._OrtAppendExecutionProvider(c,I,N,V,O)!==0&&ae(`Can't append execution provider: ${A}.`)}},Vi=async c=>{let m=he(),b=0,T=[],v=c||{};Ni(v);try{let A=Pi(v.graphOptimizationLevel??"all"),E=Ui(v.executionMode??"sequential"),I=typeof v.logId=="string"?je(v.logId,T):0,O=v.logSeverityLevel??2;if(!Number.isInteger(O)||O<0||O>4)throw new Error(`log severity level is not valid: ${O}`);let N=v.logVerbosityLevel??0;if(!Number.isInteger(N)||N<0||N>4)throw new Error(`log verbosity level is not valid: ${N}`);let V=typeof v.optimizedModelFilePath=="string"?je(v.optimizedModelFilePath,T):0;if(b=m._OrtCreateSessionOptions(A,!!v.enableCpuMemArena,!!v.enableMemPattern,E,!!v.enableProfiling,0,I,O,N,V),b===0&&ae("Can't create session options."),v.executionProviders&&await Li(b,v,T),v.enableGraphCapture!==void 0){if(typeof v.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${v.enableGraphCapture}`);Rt(b,"enableGraphCapture",v.enableGraphCapture.toString(),T)}if(v.freeDimensionOverrides)for(let[U,R]of Object.entries(v.freeDimensionOverrides)){if(typeof U!="string")throw new Error(`free dimension override name must be a string: ${U}`);if(typeof R!="number"||!Number.isInteger(R)||R<0)throw new Error(`free dimension override value must be a non-negative integer: ${R}`);let Z=je(U,T);m._OrtAddFreeDimensionOverride(b,Z,R)!==0&&ae(`Can't set a free dimension override: ${U} - ${R}.`)}return v.extra!==void 0&&Yt(v.extra,"",new WeakSet,(U,R)=>{Rt(b,U,R,T)}),[b,T]}catch(A){throw b!==0&&m._OrtReleaseSessionOptions(b)!==0&&ae("Can't release session options."),T.forEach(E=>m._free(E)),A}}}),$t,vt,xt,Rr,Br,Mr,Dr,Yr,ue=C(()=>{$t=c=>{switch(c){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${c}`)}},vt=c=>{switch(c){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${c}`)}},xt=(c,m)=>{let b=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][c],T=typeof m=="number"?m:m.reduce((v,A)=>v*A,1);return b>0?Math.ceil(T*b):void 0},Rr=c=>{switch(c){case"float16":return typeof Float16Array<"u"&&Float16Array.from?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${c}`)}},Br=c=>{switch(c){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${c}`)}},Mr=c=>c==="float32"||c==="float16"||c==="int32"||c==="int64"||c==="uint32"||c==="uint8"||c==="bool"||c==="uint4"||c==="int4",Dr=c=>c==="float32"||c==="float16"||c==="int32"||c==="int64"||c==="uint32"||c==="uint64"||c==="int8"||c==="uint8"||c==="bool"||c==="uint4"||c==="int4",Yr=c=>{switch(c){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${c}`)}}}),Pr,qi=C(()=>{$r(),Pr=async c=>{if(typeof c=="string"){let m=await fetch(c);if(!m.ok)throw new Error(`failed to load external data file: ${c}`);let b=m.headers.get("Content-Length"),T=b?parseInt(b,10):0;if(T<1073741824)return new Uint8Array(await m.arrayBuffer());{if(!m.body)throw new Error(`failed to load external data file: ${c}, no response body.`);let v=m.body.getReader(),A;try{A=new ArrayBuffer(T)}catch(I){if(I instanceof RangeError){let O=Math.ceil(T/65536);A=new WebAssembly.Memory({initial:O,maximum:O}).buffer}else throw I}let E=0;for(;;){let{done:I,value:O}=await v.read();if(I)break;let N=O.byteLength;new Uint8Array(A,E,N).set(O),E+=N}return new Uint8Array(A,0,T)}}else return c instanceof Blob?new Uint8Array(await c.arrayBuffer()):c instanceof Uint8Array?c:new Uint8Array(c)}}),Fi,Jr,ei,Gt,ti,ri,Ee,Tt,ii,jt,M,sr,ai,Wi=C(()=>{et(),Ja(),en(),ue(),bt(),Or(),qi(),Fi=(c,m)=>{he()._OrtInit(c,m)!==0&&ae("Can't initialize onnxruntime.")},Jr=async c=>{Fi(c.wasm.numThreads,Br(c.logLevel))},ei=async(c,m)=>{var T,v;(v=(T=he()).asyncInit)==null||v.call(T);let b=c.webgpu.adapter;if(m==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");if(b){if(typeof b.limits!="object"||typeof b.features!="object"||typeof b.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let A=c.webgpu.powerPreference;if(A!==void 0&&A!=="low-power"&&A!=="high-performance")throw new Error(`Invalid powerPreference setting: "${A}"`);let E=c.webgpu.forceFallbackAdapter;if(E!==void 0&&typeof E!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${E}"`);if(b=await navigator.gpu.requestAdapter({powerPreference:A,forceFallbackAdapter:E}),!b)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}}if(m==="webnn"&&(typeof navigator>"u"||!navigator.ml))throw new Error("WebNN is not supported in current environment")},Gt=new Map,ti=c=>{let m=he(),b=m.stackSave();try{let T=m.PTR_SIZE,v=m.stackAlloc(2*T);m._OrtGetInputOutputCount(c,v,v+T)!==0&&ae("Can't get session input/output count.");let A=T===4?"i32":"i64";return[Number(m.getValue(v,A)),Number(m.getValue(v+T,A))]}finally{m.stackRestore(b)}},ri=(c,m)=>{let b=he(),T=b.stackSave(),v=0;try{let A=b.PTR_SIZE,E=b.stackAlloc(2*A);b._OrtGetInputOutputMetadata(c,m,E,E+A)!==0&&ae("Can't get session input/output metadata.");let I=Number(b.getValue(E,"*"));v=Number(b.getValue(E+A,"*"));let O=b.HEAP32[v/4];if(O===0)return[I,0];let N=b.HEAPU32[v/4+1],V=[];for(let U=0;U<N;U++){let R=Number(b.getValue(v+8+U*A,"*"));V.push(R!==0?b.UTF8ToString(R):Number(b.getValue(v+8+(U+N)*A,"*")))}return[I,O,V]}finally{b.stackRestore(T),v!==0&&b._OrtFree(v)}},Ee=c=>{let m=he(),b=m._malloc(c.byteLength);if(b===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${c.byteLength}.`);return m.HEAPU8.set(c,b),[b,c.byteLength]},Tt=async(c,m)=>{var V,U,R;let b,T,v=he();Array.isArray(c)?[b,T]=c:c.buffer===v.HEAPU8.buffer?[b,T]=[c.byteOffset,c.byteLength]:[b,T]=Ee(c);let A=0,E=0,I=[],O=[],N=[];try{if([E,I]=await Vi(m),(m==null?void 0:m.externalData)&&v.mountExternalData){let Ne=[];for(let ze of m.externalData){let it=typeof ze=="string"?ze:ze.path;Ne.push(Pr(typeof ze=="string"?ze:ze.data).then(ut=>{v.mountExternalData(it,ut)}))}await Promise.all(Ne)}for(let Ne of(m==null?void 0:m.executionProviders)??[])if((typeof Ne=="string"?Ne:Ne.name)==="webnn"){if(v.shouldTransferToMLTensor=!1,typeof Ne!="string"){let ze=Ne,it=ze==null?void 0:ze.context,ut=ze==null?void 0:ze.gpuDevice,ht=ze==null?void 0:ze.deviceType,Vr=ze==null?void 0:ze.powerPreference;it?v.currentContext=it:ut?v.currentContext=await v.webnnCreateMLContext(ut):v.currentContext=await v.webnnCreateMLContext({deviceType:ht,powerPreference:Vr})}else v.currentContext=await v.webnnCreateMLContext();break}A=await v._OrtCreateSession(b,T,E),(V=v.webgpuOnCreateSession)==null||V.call(v,A),A===0&&ae("Can't create a session."),(U=v.jsepOnCreateSession)==null||U.call(v),v.currentContext&&(v.webnnRegisterMLContext(A,v.currentContext),v.currentContext=void 0,v.shouldTransferToMLTensor=!0);let[Z,z]=ti(A),F=!!(m!=null&&m.enableGraphCapture),Le=[],ye=[],me=[],Me=[],te=[];for(let Ne=0;Ne<Z;Ne++){let[ze,it,ut]=ri(A,Ne);ze===0&&ae("Can't get an input name."),O.push(ze);let ht=v.UTF8ToString(ze);Le.push(ht),me.push(it===0?{name:ht,isTensor:!1}:{name:ht,isTensor:!0,type:vt(it),shape:ut})}for(let Ne=0;Ne<z;Ne++){let[ze,it,ut]=ri(A,Ne+Z);ze===0&&ae("Can't get an output name."),N.push(ze);let ht=v.UTF8ToString(ze);ye.push(ht),Me.push(it===0?{name:ht,isTensor:!1}:{name:ht,isTensor:!0,type:vt(it),shape:ut})}return Gt.set(A,[A,O,N,null,F,!1]),[A,Le,ye,me,Me]}catch(Z){throw O.forEach(z=>v._OrtFree(z)),N.forEach(z=>v._OrtFree(z)),A!==0&&v._OrtReleaseSession(A)!==0&&ae("Can't release session."),Z}finally{v._free(b),E!==0&&v._OrtReleaseSessionOptions(E)!==0&&ae("Can't release session options."),I.forEach(Z=>v._free(Z)),(R=v.unmountExternalData)==null||R.call(v)}},ii=c=>{var O,N,V;let m=he(),b=Gt.get(c);if(!b)throw new Error(`cannot release session. invalid session id: ${c}`);let[T,v,A,E,I]=b;E&&(I&&m._OrtClearBoundOutputs(E.handle)!==0&&ae("Can't clear bound outputs."),m._OrtReleaseBinding(E.handle)!==0&&ae("Can't release IO binding.")),(O=m.jsepOnReleaseSession)==null||O.call(m,c),(N=m.webnnOnReleaseSession)==null||N.call(m,c),(V=m.webgpuOnReleaseSession)==null||V.call(m,c),v.forEach(U=>m._OrtFree(U)),A.forEach(U=>m._OrtFree(U)),m._OrtReleaseSession(T)!==0&&ae("Can't release session."),Gt.delete(c)},jt=async(c,m,b,T,v,A,E=!1)=>{if(!c){m.push(0);return}let I=he(),O=I.PTR_SIZE,N=c[0],V=c[1],U=c[3],R=U,Z,z;if(N==="string"&&(U==="gpu-buffer"||U==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(E&&U!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${A} when enableGraphCapture is true.`);if(U==="gpu-buffer"){let ye=c[2].gpuBuffer;z=xt($t(N),V);{let me=I.jsepRegisterBuffer;if(!me)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');Z=me(T,A,ye,z)}}else if(U==="ml-tensor"){let ye=c[2].mlTensor;z=xt($t(N),V);let me=I.webnnRegisterMLTensor;if(!me)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');Z=me(T,ye,$t(N),V)}else{let ye=c[2];if(Array.isArray(ye)){z=O*ye.length,Z=I._malloc(z),b.push(Z);for(let me=0;me<ye.length;me++){if(typeof ye[me]!="string")throw new TypeError(`tensor data at index ${me} is not a string`);I.setValue(Z+me*O,je(ye[me],b),"*")}}else{let me=I.webnnIsGraphInput,Me=I.webnnIsGraphOutput;if(N!=="string"&&me&&Me){let te=I.UTF8ToString(v);if(me(T,te)||Me(T,te)){let Ne=$t(N);z=xt(Ne,V),R="ml-tensor";let ze=I.webnnCreateTemporaryTensor,it=I.webnnUploadTensor;if(!ze||!it)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');let ut=await ze(T,Ne,V);it(ut,new Uint8Array(ye.buffer,ye.byteOffset,ye.byteLength)),Z=ut}else z=ye.byteLength,Z=I._malloc(z),b.push(Z),I.HEAPU8.set(new Uint8Array(ye.buffer,ye.byteOffset,z),Z)}else z=ye.byteLength,Z=I._malloc(z),b.push(Z),I.HEAPU8.set(new Uint8Array(ye.buffer,ye.byteOffset,z),Z)}}let F=I.stackSave(),Le=I.stackAlloc(4*V.length);try{V.forEach((me,Me)=>I.setValue(Le+Me*O,me,O===4?"i32":"i64"));let ye=I._OrtCreateTensor($t(N),Z,z,Le,V.length,Yr(R));ye===0&&ae(`Can't create tensor for input/output. session=${T}, index=${A}.`),m.push(ye)}finally{I.stackRestore(F)}},M=async(c,m,b,T,v,A)=>{var ft,Yi,Ji;let E=he(),I=E.PTR_SIZE,O=Gt.get(c);if(!O)throw new Error(`cannot run inference. invalid session id: ${c}`);let N=O[0],V=O[1],U=O[2],R=O[3],Z=O[4];O[5];let z=m.length,F=T.length,Le=0,ye=[],me=[],Me=[],te=[],Ne=[],ze=E.stackSave(),it=E.stackAlloc(z*I),ut=E.stackAlloc(z*I),ht=E.stackAlloc(F*I),Vr=E.stackAlloc(F*I);try{[Le,ye]=Di(A),pt("wasm prepareInputOutputTensor");for(let ke=0;ke<z;ke++)await jt(b[ke],me,te,c,V[m[ke]],m[ke],Z);for(let ke=0;ke<F;ke++)await jt(v[ke],Me,te,c,U[T[ke]],z+T[ke],Z);ct("wasm prepareInputOutputTensor");for(let ke=0;ke<z;ke++)E.setValue(it+ke*I,me[ke],"*"),E.setValue(ut+ke*I,V[m[ke]],"*");for(let ke=0;ke<F;ke++)E.setValue(ht+ke*I,Me[ke],"*"),E.setValue(Vr+ke*I,U[T[ke]],"*");(ft=E.jsepOnRunStart)==null||ft.call(E,N),(Yi=E.webnnOnRunStart)==null||Yi.call(E,N);let at;at=await E._OrtRun(N,ut,it,z,Vr,F,ht,Le),at!==0&&ae("failed to call OrtRun().");let kt=[],ea=[];pt("wasm ProcessOutputTensor");for(let ke=0;ke<F;ke++){let Et=Number(E.getValue(ht+ke*I,"*"));if(Et===Me[ke]||Ne.includes(Me[ke])){kt.push(v[ke]),Et!==Me[ke]&&E._OrtReleaseTensor(Et)!==0&&ae("Can't release tensor.");continue}let Ta=E.stackSave(),Dt=E.stackAlloc(4*I),qr=!1,Qe,mt=0;try{E._OrtGetTensorData(Et,Dt,Dt+I,Dt+2*I,Dt+3*I)!==0&&ae(`Can't access output tensor data on index ${ke}.`);let fi=I===4?"i32":"i64",gt=Number(E.getValue(Dt,fi));mt=E.getValue(Dt+I,"*");let ta=E.getValue(Dt+I*2,"*"),Ea=Number(E.getValue(Dt+I*3,fi)),Pt=[];for(let Xe=0;Xe<Ea;Xe++)Pt.push(Number(E.getValue(ta+Xe*I,fi)));E._OrtFree(ta)!==0&&ae("Can't free memory for tensor dims.");let Ut=Pt.reduce((Xe,We)=>Xe*We,1);Qe=vt(gt);let dr=R==null?void 0:R.outputPreferredLocations[T[ke]];if(Qe==="string"){if(dr==="gpu-buffer"||dr==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let Xe=[];for(let We=0;We<Ut;We++){let Ct=E.getValue(mt+We*I,"*"),Ia=E.getValue(mt+(We+1)*I,"*"),ka=We===Ut-1?void 0:Ia-Ct;Xe.push(E.UTF8ToString(Ct,ka))}kt.push([Qe,Pt,Xe,"cpu"])}else if(dr==="gpu-buffer"&&Ut>0){let Xe=E.jsepGetBuffer;if(!Xe)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let We=Xe(mt),Ct=xt(gt,Ut);if(Ct===void 0||!Mr(Qe))throw new Error(`Unsupported data type: ${Qe}`);qr=!0,kt.push([Qe,Pt,{gpuBuffer:We,download:E.jsepCreateDownloader(We,Ct,Qe),dispose:()=>{E._OrtReleaseTensor(Et)!==0&&ae("Can't release tensor.")}},"gpu-buffer"])}else if(dr==="ml-tensor"&&Ut>0){let Xe=E.webnnEnsureTensor,We=E.webnnIsGraphInputOutputTypeSupported;if(!Xe||!We)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(xt(gt,Ut)===void 0||!Dr(Qe))throw new Error(`Unsupported data type: ${Qe}`);if(!We(c,Qe,!1))throw new Error(`preferredLocation "ml-tensor" for ${Qe} output is not supported by current WebNN Context.`);let Ct=await Xe(c,mt,gt,Pt,!1);qr=!0,kt.push([Qe,Pt,{mlTensor:Ct,download:E.webnnCreateMLTensorDownloader(mt,Qe),dispose:()=>{E.webnnReleaseTensorId(mt),E._OrtReleaseTensor(Et)}},"ml-tensor"])}else if(dr==="ml-tensor-cpu-output"&&Ut>0){let Xe=E.webnnCreateMLTensorDownloader(mt,Qe)(),We=kt.length;qr=!0,ea.push((async()=>{let Ct=[We,await Xe];return E.webnnReleaseTensorId(mt),E._OrtReleaseTensor(Et),Ct})()),kt.push([Qe,Pt,[],"cpu"])}else{let Xe=Rr(Qe),We=new Xe(Ut);new Uint8Array(We.buffer,We.byteOffset,We.byteLength).set(E.HEAPU8.subarray(mt,mt+We.byteLength)),kt.push([Qe,Pt,We,"cpu"])}}finally{E.stackRestore(Ta),Qe==="string"&&mt&&E._free(mt),qr||E._OrtReleaseTensor(Et)}}R&&!Z&&(E._OrtClearBoundOutputs(R.handle)!==0&&ae("Can't clear bound outputs."),Gt.set(c,[N,V,U,R,Z,!1]));for(let[ke,Et]of await Promise.all(ea))kt[ke][2]=Et;return ct("wasm ProcessOutputTensor"),kt}finally{(Ji=E.webnnOnRunEnd)==null||Ji.call(E,N),E.stackRestore(ze),me.forEach(at=>E._OrtReleaseTensor(at)),Me.forEach(at=>E._OrtReleaseTensor(at)),te.forEach(at=>E._free(at)),Le!==0&&E._OrtReleaseRunOptions(Le),ye.forEach(at=>E._free(at))}},sr=c=>{let m=he(),b=Gt.get(c);if(!b)throw new Error("invalid session id");let T=b[0],v=m._OrtEndProfiling(T);v===0&&ae("Can't get an profile file name."),m._OrtFree(v)},ai=c=>{let m=[];for(let b of c){let T=b[2];!Array.isArray(T)&&"buffer"in T&&m.push(T.buffer)}return m}}),Bt,ie,Ht,or,Jt,ur,Ur,Nr,Mt,Kt,ni,si,oi,Gi,ji,xa,lr,Hi,Ki=C(()=>{et(),Wi(),bt(),kr(),Bt=()=>!!ee.wasm.proxy&&typeof document<"u",Ht=!1,or=!1,Jt=!1,Nr=new Map,Mt=(c,m)=>{let b=Nr.get(c);b?b.push(m):Nr.set(c,[m])},Kt=()=>{if(Ht||!or||Jt||!ie)throw new Error("worker not ready")},ni=c=>{switch(c.data.type){case"init-wasm":Ht=!1,c.data.err?(Jt=!0,Ur[1](c.data.err)):(or=!0,Ur[0]()),ur&&(URL.revokeObjectURL(ur),ur=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let m=Nr.get(c.data.type);c.data.err?m.shift()[1](c.data.err):m.shift()[0](c.data.out);break}}},si=async()=>{if(!or){if(Ht)throw new Error("multiple calls to 'initWasm()' detected.");if(Jt)throw new Error("previous call to 'initWasm()' failed.");if(Ht=!0,Bt())return new Promise((c,m)=>{ie==null||ie.terminate(),Ai().then(([b,T])=>{try{ie=T,ie.onerror=A=>m(A),ie.onmessage=ni,Ur=[c,m];let v={type:"init-wasm",in:ee};if(!v.in.wasm.wasmPaths&&b){let A=Sr();A&&(v.in.wasm.wasmPaths=A)}ie.postMessage(v),ur=b}catch(v){m(v)}},m)});try{await Ar(ee.wasm),await Jr(ee),or=!0}catch(c){throw Jt=!0,c}finally{Ht=!1}}},oi=async c=>{if(Bt())return Kt(),new Promise((m,b)=>{Mt("init-ep",[m,b]);let T={type:"init-ep",in:{epName:c,env:ee}};ie.postMessage(T)});await ei(ee,c)},Gi=async c=>Bt()?(Kt(),new Promise((m,b)=>{Mt("copy-from",[m,b]);let T={type:"copy-from",in:{buffer:c}};ie.postMessage(T,[c.buffer])})):Ee(c),ji=async(c,m)=>{if(Bt()){if(m!=null&&m.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return Kt(),new Promise((b,T)=>{Mt("create",[b,T]);let v={type:"create",in:{model:c,options:{...m}}},A=[];c instanceof Uint8Array&&A.push(c.buffer),ie.postMessage(v,A)})}else return Tt(c,m)},xa=async c=>{if(Bt())return Kt(),new Promise((m,b)=>{Mt("release",[m,b]);let T={type:"release",in:c};ie.postMessage(T)});ii(c)},lr=async(c,m,b,T,v,A)=>{if(Bt()){if(b.some(E=>E[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(v.some(E=>E))throw new Error("pre-allocated output tensor is not supported for proxy.");return Kt(),new Promise((E,I)=>{Mt("run",[E,I]);let O=b,N={type:"run",in:{sessionId:c,inputIndices:m,inputs:O,outputIndices:T,options:A}};ie.postMessage(N,ai(O))})}else return M(c,m,b,T,v,A)},Hi=async c=>{if(Bt())return Kt(),new Promise((m,b)=>{Mt("end-profiling",[m,b]);let T={type:"end-profiling",in:c};ie.postMessage(T)});sr(c)}}),Zi,ui,li,di=C(()=>{et(),Ki(),ue(),$r(),qi(),Zi=(c,m)=>{switch(c.location){case"cpu":return[c.type,c.dims,c.data,"cpu"];case"gpu-buffer":return[c.type,c.dims,{gpuBuffer:c.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[c.type,c.dims,{mlTensor:c.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${c.location} for ${m()}`)}},ui=c=>{switch(c[3]){case"cpu":return new Ge(c[0],c[2],c[1]);case"gpu-buffer":{let m=c[0];if(!Mr(m))throw new Error(`not supported data type: ${m} for deserializing GPU tensor`);let{gpuBuffer:b,download:T,dispose:v}=c[2];return Ge.fromGpuBuffer(b,{dataType:m,dims:c[1],download:T,dispose:v})}case"ml-tensor":{let m=c[0];if(!Dr(m))throw new Error(`not supported data type: ${m} for deserializing MLTensor tensor`);let{mlTensor:b,download:T,dispose:v}=c[2];return Ge.fromMLTensor(b,{dataType:m,dims:c[1],download:T,dispose:v})}default:throw new Error(`invalid data location: ${c[3]}`)}},li=class{async fetchModelAndCopyToWasmMemory(c){return Gi(await Pr(c))}async loadModel(c,m){rt();let b;typeof c=="string"?b=await this.fetchModelAndCopyToWasmMemory(c):b=c,[this.sessionId,this.inputNames,this.outputNames,this.inputMetadata,this.outputMetadata]=await ji(b,m),Je()}async dispose(){return xa(this.sessionId)}async run(c,m,b){rt();let T=[],v=[];Object.entries(c).forEach(U=>{let R=U[0],Z=U[1],z=this.inputNames.indexOf(R);if(z===-1)throw new Error(`invalid input '${R}'`);T.push(Z),v.push(z)});let A=[],E=[];Object.entries(m).forEach(U=>{let R=U[0],Z=U[1],z=this.outputNames.indexOf(R);if(z===-1)throw new Error(`invalid output '${R}'`);A.push(Z),E.push(z)});let I=T.map((U,R)=>Zi(U,()=>`input "${this.inputNames[v[R]]}"`)),O=A.map((U,R)=>U?Zi(U,()=>`output "${this.outputNames[E[R]]}"`):null),N=await lr(this.sessionId,v,I,E,O,b),V={};for(let U=0;U<N.length;U++)V[this.outputNames[E[U]]]=A[U]??ui(N[U]);return Je(),V}startProfiling(){}endProfiling(){Hi(this.sessionId)}}}),Lr={};Q(Lr,{OnnxruntimeWebAssemblyBackend:()=>ci,initializeFlags:()=>pi,wasmBackend:()=>hi});var pi,ci,hi,Qi=C(()=>{et(),Ki(),di(),pi=()=>{(typeof ee.wasm.initTimeout!="number"||ee.wasm.initTimeout<0)&&(ee.wasm.initTimeout=0);let c=ee.wasm.simd;if(typeof c!="boolean"&&c!==void 0&&c!=="fixed"&&c!=="relaxed"&&(console.warn(`Property "env.wasm.simd" is set to unknown value "${c}". Reset it to \`false\` and ignore SIMD feature checking.`),ee.wasm.simd=!1),typeof ee.wasm.proxy!="boolean"&&(ee.wasm.proxy=!1),typeof ee.wasm.trace!="boolean"&&(ee.wasm.trace=!1),typeof ee.wasm.numThreads!="number"||!Number.isInteger(ee.wasm.numThreads)||ee.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)ee.wasm.numThreads=1;else{let m=typeof navigator>"u"?K("node:os").cpus().length:navigator.hardwareConcurrency;ee.wasm.numThreads=Math.min(4,Math.ceil((m||1)/2))}},ci=class{async init(c){pi(),await si(),await oi(c)}async createInferenceSessionHandler(c,m){let b=new li;return await b.loadModel(c,m),b}},hi=new ci}),Xi={};Q(Xi,{InferenceSession:()=>br,TRACE:()=>Wt,TRACE_EVENT_BEGIN:()=>pt,TRACE_EVENT_END:()=>ct,TRACE_FUNC_BEGIN:()=>rt,TRACE_FUNC_END:()=>Je,Tensor:()=>Ge,default:()=>tn,env:()=>ee,registerBackend:()=>Y}),et(),et(),et();var Sa="1.24.3",tn=xi;{let c=(Qi(),Ie(Lr)).wasmBackend;Y("cpu",c,10),Y("wasm",c,10)}return Object.defineProperty(ee.versions,"web",{value:Sa,enumerable:!0}),Ie(Xi)})();G.exports=Oe})(us)),us.exports}var ic;function _h(){return ic||(ic=1,(function(G){var be=ar&&ar.__createBinding||(Object.create?(function(Se,Te,pe,le){le===void 0&&(le=pe);var Fe=Object.getOwnPropertyDescriptor(Te,pe);(!Fe||("get"in Fe?!Te.__esModule:Fe.writable||Fe.configurable))&&(Fe={enumerable:!0,get:function(){return Te[pe]}}),Object.defineProperty(Se,le,Fe)}):(function(Se,Te,pe,le){le===void 0&&(le=pe),Se[le]=Te[pe]})),Oe=ar&&ar.__setModuleDefault||(Object.create?(function(Se,Te){Object.defineProperty(Se,"default",{enumerable:!0,value:Te})}):function(Se,Te){Se.default=Te}),$e=ar&&ar.__importStar||function(Se){if(Se&&Se.__esModule)return Se;var Te={};if(Se!=null)for(var pe in Se)pe!=="default"&&Object.prototype.hasOwnProperty.call(Se,pe)&&be(Te,Se,pe);return Oe(Te,Se),Te};Object.defineProperty(G,"__esModule",{value:!0}),G.MicVAD=G.getDefaultRealTimeVADOptions=G.ort=G.DEFAULT_MODEL=void 0;const ve=$e(wh()),_e=ls(),de=ds(),K=va(),C=Fa(),Q=uc(),xe=lc();G.DEFAULT_MODEL="legacy",G.ort=ve;const Ie="vad.worklet.bundle.min.js",ce="silero_vad_v5.onnx",se="silero_vad_legacy.onnx",Y=Se=>({...de.defaultFrameProcessorOptions,onFrameProcessed:()=>{},onVADMisfire:()=>{K.log.debug("VAD misfire")},onSpeechStart:()=>{K.log.debug("Detected speech start")},onSpeechEnd:()=>{K.log.debug("Detected speech end")},onSpeechRealStart:()=>{K.log.debug("Detected real speech start")},baseAssetPath:"./",onnxWASMBasePath:"./",model:Se,workletOptions:{},getStream:async()=>await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:!0,autoGainControl:!0,noiseSuppression:!0}}),pauseStream:async Te=>{Te.getTracks().forEach(pe=>{pe.stop()})},resumeStream:async()=>await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:!0,autoGainControl:!0,noiseSuppression:!0}}),ortConfig:Te=>{Te.env.logLevel="error"},startOnLoad:!0,processorType:"auto"});G.getDefaultRealTimeVADOptions=Y;const re=Se=>"audioWorklet"in Se&&typeof AudioWorkletNode=="function"?"AudioWorklet":"ScriptProcessor";async function Re(Se,Te,pe,le,Fe){await pe.audioWorklet.addModule(Se),Te.processorOptions={...Te.processorOptions??{},frameSamples:le};const ee=new AudioWorkletNode(pe,"vad-helper-worklet",Te);return ee.port.onmessage=async lt=>{const Ke=lt.data;if(!(typeof Ke=="object"&&Ke&&"message"in Ke)){console.error("Invalid message event",Ke);return}switch(Ke.message){case C.Message.AudioFrame:{if(!("data"in Ke&&Ke.data instanceof ArrayBuffer)){console.log("Audio frame message has no data");return}const yt=new Float32Array(Ke.data);await Fe(yt);break}}},ee}async function Ze(Se,Te,pe){const le=new xe.Resampler({nativeSampleRate:Se.sampleRate,targetSampleRate:16e3,targetFrameSize:Te});K.log.debug("using script processor");const ee=Se.createScriptProcessor(4096,1,1);let lt=!1;return ee.onaudioprocess=async Ke=>{if(!lt){lt=!0;try{const yt=Ke.inputBuffer.getChannelData(0);Ke.outputBuffer.getChannelData(0).fill(0);const dt=le.process(yt);for(const _t of dt)await pe(_t)}catch(yt){console.error("Error processing audio:",yt)}finally{lt=!1}}},ee.connect(Se.destination),ee}class tt{constructor(Te,pe,le,Fe,ee=!1,lt=null,Ke=null,yt=null,nr=null,dt=null,_t=null,mr="uninitialized",gr=!1){this.options=Te,this.frameProcessor=pe,this.model=le,this.frameSamples=Fe,this.listening=ee,this.errored=lt,this._stream=Ke,this._audioContext=yt,this._vadNode=nr,this._mediaStreamAudioSourceNode=dt,this._audioProcessorAdapterType=_t,this.initializationState=mr,this.ownsAudioContext=gr,this.getAudioInstances=()=>{if(this._stream===null||this._audioContext===null||this._vadNode==null||this._mediaStreamAudioSourceNode==null)throw new Error("MicVAD has null stream, audio context, or processor adapter");return{stream:this._stream,audioContext:this._audioContext,vadNode:this._vadNode,mediaStreamAudioSourceNode:this._mediaStreamAudioSourceNode}},this.setErrored=De=>{this.initializationState="errored",this.errored=De},this.start=async()=>{switch(this.initializationState){case"uninitialized":{K.log.debug("initializing micVAD"),this.initializationState="initializing",this.frameProcessor.resume();try{this._stream=await this.options.getStream()}catch(De){throw De instanceof Error?this.setErrored(De.message):this.setErrored(String(De)),De}if(this.options.audioContext?(console.log("using custom audio context"),this._audioContext=this.options.audioContext):(console.log("using default audio context"),this._audioContext=new AudioContext,this.ownsAudioContext=!0),!this._audioContext)throw this.setErrored("Audio context is null"),Error("Audio context is null");switch(this._audioProcessorAdapterType=this.options.processorType=="auto"?re(this._audioContext):this.options.processorType,this._audioProcessorAdapterType){case"AudioWorklet":this._vadNode=await Re(this.options.baseAssetPath+Ie,this.options.workletOptions,this._audioContext,this.frameSamples,this.processFrame);break;case"ScriptProcessor":this._vadNode=await Ze(this._audioContext,this.frameSamples,this.processFrame);break;default:throw new Error(`Unsupported audio processor adapter type: ${this._audioProcessorAdapterType}`)}this._mediaStreamAudioSourceNode=new MediaStreamAudioSourceNode(this._audioContext,{mediaStream:this._stream}),this._mediaStreamAudioSourceNode.connect(this._vadNode),K.log.debug("started micVAD"),this.listening=!0,this.initializationState="initialized";break}case"initializing":{K.log.warn("start called while initializing");break}case"initialized":{if(this.listening)return;this.listening=!0,this.frameProcessor.resume();const{stream:De,audioContext:It,vadNode:gi}=this.getAudioInstances();this._stream=await this.options.resumeStream(De);const nt=new MediaStreamAudioSourceNode(It,{mediaStream:this._stream});this._mediaStreamAudioSourceNode=nt,nt.connect(gi);break}case"destroyed":{K.log.warn("start called after destroyed");break}case"errored":{K.log.error("start called after errored");break}default:{K.log.warn("weird initialization state");break}}},this.pause=async()=>{if(!this.listening)return;this.listening=!1;const{stream:De,mediaStreamAudioSourceNode:It}=this.getAudioInstances();await this.options.pauseStream(De),It.disconnect(),this.frameProcessor.pause(this.handleFrameProcessorEvent)},this.destroy=async()=>{var It;K.log.debug("destroy called"),this.initializationState="destroyed";const{vadNode:De}=this.getAudioInstances();De instanceof AudioWorkletNode&&De.port.postMessage(C.Message.SpeechStop),this.listening&&await this.pause(),await this.model.release(),this.ownsAudioContext&&await((It=this._audioContext)==null?void 0:It.close())},this.setOptions=De=>{this.frameProcessor.setOptions(De)},this.processFrame=async De=>{await this.frameProcessor.process(De,this.handleFrameProcessorEvent)},this.handleFrameProcessorEvent=De=>{switch(De.msg){case C.Message.FrameProcessed:this.options.onFrameProcessed(De.probs,De.frame);break;case C.Message.SpeechStart:this.options.onSpeechStart();break;case C.Message.SpeechRealStart:this.options.onSpeechRealStart();break;case C.Message.VADMisfire:this.options.onVADMisfire();break;case C.Message.SpeechEnd:this.options.onSpeechEnd(De.audio);break}}}static async new(Te={}){const pe={...(0,G.getDefaultRealTimeVADOptions)(Te.model??G.DEFAULT_MODEL),...Te};(0,de.validateOptions)(pe),G.ort.env.wasm.wasmPaths=pe.onnxWASMBasePath,pe.ortConfig!==void 0&&pe.ortConfig(G.ort);const le=pe.model==="v5"?ce:se,Fe=pe.baseAssetPath+le,ee=pe.model==="v5"?Q.SileroV5.new:Q.SileroLegacy.new;let lt;try{lt=await ee(G.ort,()=>(0,_e.defaultModelFetcher)(Fe))}catch(_t){throw console.error(`Encountered an error while loading model file ${Fe}`),_t}const Ke=pe.model==="v5"?512:1536,yt=Ke/16,nr=new de.FrameProcessor(lt.process,lt.reset_state,{positiveSpeechThreshold:pe.positiveSpeechThreshold,negativeSpeechThreshold:pe.negativeSpeechThreshold,redemptionMs:pe.redemptionMs,preSpeechPadMs:pe.preSpeechPadMs,minSpeechMs:pe.minSpeechMs,submitUserSpeechOnPause:pe.submitUserSpeechOnPause},yt),dt=new tt(pe,nr,lt,Ke);if(pe.startOnLoad)try{await dt.start()}catch(_t){throw console.error("Error starting micVad",_t),_t}return dt}}G.MicVAD=tt})(ar)),ar}var ac;function bh(){return ac||(ac=1,(function(G){Object.defineProperty(G,"__esModule",{value:!0}),G.getDefaultRealTimeVADOptions=G.MicVAD=G.DEFAULT_MODEL=G.utils=G.NonRealTimeVAD=G.Message=G.FrameProcessor=G.defaultModelFetcher=G.baseAssetPath=void 0;var be=nc();Object.defineProperty(G,"baseAssetPath",{enumerable:!0,get:function(){return be.baseAssetPath}});var Oe=ls();Object.defineProperty(G,"defaultModelFetcher",{enumerable:!0,get:function(){return Oe.defaultModelFetcher}});var $e=ds();Object.defineProperty(G,"FrameProcessor",{enumerable:!0,get:function(){return $e.FrameProcessor}});var ve=Fa();Object.defineProperty(G,"Message",{enumerable:!0,get:function(){return ve.Message}});var _e=gh();Object.defineProperty(G,"NonRealTimeVAD",{enumerable:!0,get:function(){return _e.NonRealTimeVAD}});const de=yh();G.utils={audioFileToArray:de.audioFileToArray,minFramesForTargetMS:de.minFramesForTargetMS,arrayBufferToBase64:de.arrayBufferToBase64,encodeWAV:de.encodeWAV};var K=_h();Object.defineProperty(G,"DEFAULT_MODEL",{enumerable:!0,get:function(){return K.DEFAULT_MODEL}}),Object.defineProperty(G,"MicVAD",{enumerable:!0,get:function(){return K.MicVAD}}),Object.defineProperty(G,"getDefaultRealTimeVADOptions",{enumerable:!0,get:function(){return K.getDefaultRealTimeVADOptions}})})(ns)),ns}var pc=bh();const $h=dh(pc),xh=ph({__proto__:null,default:$h},[pc]);export{xh as i};
