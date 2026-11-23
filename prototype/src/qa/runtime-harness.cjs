'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');
function setup(saved){
 let seq=0;
 const S={state:saved||{runs:[],agents:[{id:'research',name:'研究助理',model:'Demo model',version:'1.0',status:'published',capabilityBindings:[{toolId:'web.search',enabled:true,approval:'write'}]}]},uid:prefix=>prefix+'-'+(++seq),save(){},agentRuntime:a=>JSON.parse(JSON.stringify(a.publishedConfig||a))};
 const context={window:{Studio:S},console,setTimeout,clearTimeout,TextEncoder,Date,Map,Set,Object,Array,JSON,Promise,Number,String,Boolean,Math,Error,encodeURIComponent};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../runtime.js'),'utf8'),context,{filename:'runtime.js'});
 return {S,R:S.Runtime,context};
}
module.exports={setup};
