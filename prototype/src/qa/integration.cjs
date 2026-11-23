/* Run reproducible offline tests in isolated Node contexts. Browser QA is separate. */
'use strict';
const path=require('path');
const {spawnSync}=require('child_process');
for(const file of ['runtime-contract.cjs','workflow-contract.cjs','capability-contract.cjs','expanded-contract.cjs','knowledge-contract.cjs','publishing-contract.cjs','quality-contract.cjs','product-integration.cjs']){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS: all offline runtime, workflow, capability, content, publishing, quality and cross-module contracts.');
