'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.resolve(__dirname,'..');
function setup(saved){
 const nodes=new Map(),storage=new Map(),rendered=[];
 if(saved)storage.set('otryx-studio-demo',JSON.stringify(saved));
 const node=()=>({innerHTML:'',textContent:'',children:[],style:{},dataset:{},open:false,value:'',checked:false,hidden:false,isConnected:true,classList:{add(){},remove(){},toggle(){}},addEventListener(){},removeEventListener(){},focus(){},querySelector(){return null;},querySelectorAll(){return [];},setAttribute(){},removeAttribute(){},closest(){return null;},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){},append(){},appendChild(){},remove(){}});
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll(){return [];},addEventListener(){},createElement:node,body:node(),activeElement:null};
 const loc={hash:'#home',reload(){}};
 const context={window:{crypto:require('crypto').webcrypto,addEventListener(){},removeEventListener(){},scrollTo(){}},document:doc,location:loc,history:{replaceState(a,b,url){loc.hash=url.startsWith('#')?url:'#'+url.split('#')[1];}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console,URL,URLSearchParams,Blob,TextEncoder,TextDecoder,Date,Set,Map,Math,Object,JSON,Array,Number,String,Boolean,Error,Promise,Intl,CSS:{escape:x=>x},queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,FormData};
 vm.createContext(context);
 for(const file of ['core.js','runtime.js','workspace.js','builder.js','ecosystem.js','governance.js','capability-ui.js','knowledge.js','trace.js','agent-studio.js','publishing.js','quality.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file});
 const S=context.window.Studio;
 S.toast=()=>{};S.render=()=>{};S.renderChrome=()=>{};S.go=(route,params={})=>{S.route=route;S.params=params;loc.hash='#'+route+(Object.keys(params).length?'?'+new URLSearchParams(params):'');};
 return{S,R:S.Runtime,context,nodes,storage,rendered};
}
module.exports={setup};
