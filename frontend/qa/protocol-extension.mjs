import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {chromium} from 'playwright'

const base='http://localhost:8080'
const provider='http://127.0.0.1:18081'
const evidence=fileURLToPath(new URL('./evidence/',import.meta.url))
await mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
try{
  await page.goto(base+'/#/home')
  await page.locator('input[type=email]').fill('p1-b@example.invalid')
  await page.locator('input[type=password]').fill('CI-only-test-passphrase-123')
  await page.locator('form.auth-card button.primary').first().click()
  await page.locator('main h1').waitFor({timeout:20000})
  await page.locator('.scope select').nth(1).locator('option').first().waitFor({state:'attached'})
  const me=await (await page.request.get(base+'/api/v1/auth/me')).json()
  const w='/workspaces/'+await page.locator('.scope select').first().inputValue()
  const p=w+'/projects/'+await page.locator('.scope select').nth(1).inputValue()
  const headers={'Origin':base,'X-CSRF-Token':me.csrfToken}
  async function get(path){
    const res=await page.request.get(base+'/api/v1'+path)
    assert.equal(res.status(),200)
    return res.json()
  }
  async function post(path,data,expected=200,key){
    const res=await page.request.post(base+'/api/v1'+path,{headers:{...headers,...(key?{'Idempotency-Key':key}:{})},data})
    assert.equal(res.status(),expected,await res.text())
    const text=await res.text()
    return text?JSON.parse(text):null
  }
  const protocols=await get('/model-protocols')
  const descriptor=protocols.find(d=>d.protocol.key==='qa.native')
  assert.equal(descriptor.adapterKey,'qa.adapter')
  assert.equal(descriptor.adapterVersion,'1.0.0')
  assert.equal(descriptor.modelSchema.properties.qaRepeat.maximum,3)
  const connection=await post(w+'/providers',{name:'QA native fixture',vendorKey:'fixture',baseUrl:provider,
    authMethod:'NONE',credentialId:null,protocolConfig:{},timeoutMs:10000,enabled:true,rowVersion:null})
  const invalidBase={providerId:connection.id,name:'Invalid QA model',externalModelId:'invalid',modelType:'LLM',
    protocolKey:'qa.native',protocolVersion:'v1',protocolOptions:{},capabilities:{},modelOptions:{qaPrefix:'QA:',qaRepeat:2},
    pricing:{currency:'USD',perRequest:.01},enabled:true,rowVersion:null}
  await post(w+'/models',{...invalidBase,protocolKey:'qa.missing'},422)
  await post(w+'/models',{...invalidBase,modelType:'IMAGE'},422)
  await post(w+'/models',{...invalidBase,modelOptions:{qaPrefix:'QA:',qaRepeat:4}},422)
  await page.goto(base+'/#/models')
  await page.getByText('QA native fixture',{exact:true}).waitFor()
  await page.getByRole('button',{name:/^新增模型$|^New model$/}).click()
  const dialog=page.getByRole('dialog')
  await dialog.locator('input').first().fill('Native protocol QA')
  await dialog.getByLabel(/^(供应商|Provider)$/).selectOption(connection.id)
  await dialog.getByLabel(/^(外部模型名称|External model ID)$/).fill('fixture-native')
  await dialog.getByLabel(/^(协议|Protocol)$/).selectOption({label:'qa.native / v1'})
  await dialog.getByLabel('qaPrefix',{exact:true}).fill('QA:')
  await dialog.getByLabel('qaRepeat',{exact:true}).fill('2')
  await dialog.getByLabel(/^(价格 JSON|Pricing JSON)$/).fill('{"currency":"USD","perRequest":0.01}')
  await page.screenshot({path:join(evidence,'extension-dynamic-form.png')})
  await dialog.getByRole('button',{name:/^(保存|Save)$/}).click()
  await dialog.waitFor({state:'hidden'})
  const model=(await get(w+'/models')).find(m=>m.name==='Native protocol QA')
  assert.ok(model)
  assert.deepEqual(model.modelOptions,{qaPrefix:'QA:',qaRepeat:2})
  const row=page.locator('main tbody tr').filter({hasText:'Native protocol QA'})
  await row.getByRole('button',{name:/^(绑定项目|Bind)$/}).click()
  await row.getByRole('button',{name:/^(解除绑定|Unbind)$/}).waitFor()
  const run=await post(p+'/models/'+model.id+'/debug',{input:{text:'extension test'},audioBase64:null,maxOutputTokens:32},200,randomUUID())
  let detail
  for(let i=0;i<120;i++){
    detail=await get(p+'/runs/'+run.id)
    if(['SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'].includes(detail.status))break
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  assert.equal(detail.status,'SUCCEEDED',JSON.stringify(detail))
  const response=await page.request.get(base+'/api/v1'+p+'/runs/'+run.id+'/events')
  assert.equal(response.status(),200)
  const events=(await response.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)))
  assert.equal(events.find(e=>e.eventType==='delta').payload.text,'QA:extension testQA:extension test')
  assert.equal(events.at(-1).eventType,'terminal')
  const calls=await get(p+'/usage?from=20000101000000&to=20990101000000')
  const ledger=calls.filter(c=>c.runId===run.id)
  assert.equal(ledger.length,1)
  assert.equal(ledger[0].protocolKey,'qa.native')
  assert.equal(ledger[0].usageSource,'REPORTED')
  assert.equal(Number(ledger[0].totalTokens),6)
  assert.equal(Number(ledger[0].costAmount),.01)
  assert.equal((await (await fetch(provider+'/count')).json()).count,1)
  console.log('PASS: test-only adapter discovery, real dynamic form, unknown/incompatible/invalid rejection, bound runtime dispatch and usage')
}catch(error){
  await page.screenshot({path:join(evidence,'extension-failure.png'),fullPage:true}).catch(()=>{})
  throw error
}finally{
  await browser.close()
}
