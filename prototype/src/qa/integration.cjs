/* Run reproducible offline tests in isolated Node contexts. Browser QA is separate. */
'use strict';
const path=require('path');
const {spawnSync}=require('child_process');
for(const file of ['appearance-contract.cjs','auth-contract.cjs','navigation-contract.cjs','runtime-contract.cjs','workflow-contract.cjs','capability-contract.cjs','expanded-contract.cjs','knowledge-contract.cjs','publishing-contract.cjs','quality-contract.cjs','product-integration.cjs','models-contract.cjs','planning-contract.cjs','model-integration.cjs']){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS: all 14 offline auth, navigation, runtime, workflow, capability, content, publishing, quality, model, planning and cross-module suites.');
