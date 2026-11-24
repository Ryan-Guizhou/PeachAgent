import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'

// Run after iam-smoke.py and runtime-smoke.py against the real API and fixture data.
const base = 'http://localhost:8080'
const pages = ['home','projects','models','credentials','prompts','chat','runs','usage','plugins','settings']
const evidence = fileURLToPath(new URL('./evidence/', import.meta.url))
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({headless:true})
const page = await browser.newPage({viewport:{width:1440,height:900}})
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(base+'/#/home')
  await page.locator('input[type=email]').fill('p1-b@example.invalid')
  await page.locator('input[type=password]').fill('CI-only-test-passphrase-123')
  await page.locator('form.auth-card button[type=submit], form.auth-card button.primary').first().click()
  await page.locator('main h1').waitFor({timeout:20000})
  await page.locator('.scope select').first().locator('option').first().waitFor({state:'attached'})
  await page.goto(base+'/#/runs')
  await page.locator('main [data-state="SUCCEEDED"]').first().waitFor()
  await page.screenshot({path:join(evidence,'real-runs.png')})
  // Delay the first real detail response; a later selection must retain ownership of the panel.
  const workspaceId=await page.locator('.scope select').first().inputValue()
  const projectId=await page.locator('.scope select').nth(1).inputValue()
  const runPath='/api/v1/workspaces/'+encodeURIComponent(workspaceId)+'/projects/'+encodeURIComponent(projectId)+'/runs'
  const runResponse=await page.request.get(base+runPath)
  assert.ok(runResponse.ok())
  const runRows=await runResponse.json()
  assert.ok(runRows.length>=2)
  const first=runRows[0],second=runRows[1]
  assert.notEqual(first.traceId,second.traceId)
  const firstDetail=base+runPath+'/'+first.id
  let releaseFirst
  const gate=new Promise(resolve=>{releaseFirst=resolve})
  const handler=async route=>{
    const response=await route.fetch()
    await gate
    await route.fulfill({response})
  }
  await page.route(firstDetail,handler)
  try{
    const firstRequest=page.waitForRequest(request=>request.url()===firstDetail)
    await page.locator('main .list-row').nth(0).getByRole('button',{name:/详情|Details/}).click()
    await firstRequest
    await page.locator('main .list-row').nth(1).getByRole('button',{name:/详情|Details/}).click()
    await page.getByText(second.traceId,{exact:true}).waitFor()
    const delivered=page.waitForResponse(response=>response.url()===firstDetail)
    releaseFirst()
    await delivered
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    assert.ok(await page.getByText(second.traceId,{exact:true}).isVisible())
    assert.equal(await page.getByText(first.traceId,{exact:true}).count(),0)
    console.log('PASS: out-of-order real run detail responses cannot replace the latest selection')
  }finally{
    releaseFirst()
    await page.unroute(firstDetail,handler)
  }
  // Verify that persisted prompt and actual model registration are visible.
  await page.goto(base+'/#/prompts')
  const promptRow=page.locator('main .list-row').filter({hasText:'Fixture prompt'}).first()
  await promptRow.waitFor()
  await promptRow.getByRole('button',{name:/预览草稿|Preview draft/}).click()
  const dialog=page.getByRole('dialog')
  await dialog.getByRole('textbox',{name:/变量值 JSON|Variable values JSON/}).fill('{"name":"Browser QA"}')
  await dialog.getByRole('button',{name:/渲染预览|Render preview/}).click()
  await dialog.getByText('Say hello to Browser QA',{exact:true}).waitFor()
  // A disabled submit control may move focus outside the modal during an asynchronous request.
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur()})
  await page.keyboard.press('Tab')
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)))
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur()})
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  assert.ok(await promptRow.getByRole('button',{name:/预览草稿|Preview draft/}).evaluate(el=>document.activeElement===el))
  await promptRow.getByRole('button',{name:/历史版本|Versions/}).click()
  await page.getByRole('button',{name:/预览版本|Preview version/}).first().click()
  await dialog.getByRole('textbox',{name:/变量值 JSON|Variable values JSON/}).fill('{"name":"Pinned QA"}')
  await dialog.getByRole('button',{name:/渲染预览|Render preview/}).click()
  await dialog.getByText('Say hello to Pinned QA',{exact:true}).waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  await page.goto(base+'/#/chat')
  await page.getByRole('button',{name:/Fixture conversation/}).click()
  await page.getByText('Fixture answer',{exact:true}).first().waitFor()
  await page.getByRole('button',{name:/^复用$|^Reuse$/}).last().click()
  assert.equal(await page.getByRole('textbox',{name:/输入消息|Enter message/}).inputValue(),'Fixture answer')
  // The partial failure is a real persisted response, not a fabricated UI sample.
  const chatScope='/api/v1/workspaces/'+workspaceId+'/projects/'+projectId
  const chatRows=await (await page.request.get(base+chatScope+'/conversations')).json()
  const partial=chatRows.find(row=>row.title==='Partial response QA')
  const original=chatRows.find(row=>row.title==='Fixture conversation')
  assert.ok(partial&&original)
  const partialPath=base+chatScope+'/conversations/'+partial.id+'/messages?latest=true&limit=20'
  let releaseChat
  const chatGate=new Promise(resolve=>{releaseChat=resolve})
  const delayChat=async route=>{const response=await route.fetch();await chatGate;await route.fulfill({response})}
  await page.route(partialPath,delayChat)
  try{
    const requested=page.waitForRequest(request=>request.url()===partialPath)
    await page.getByRole('button',{name:/Partial response QA/}).click()
    await requested
    await page.getByRole('button',{name:/Fixture conversation/}).click()
    await page.getByText('Fixture answer',{exact:true}).first().waitFor()
    const delivered=page.waitForResponse(response=>response.url()===partialPath)
    releaseChat();await delivered
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    assert.equal(await page.getByText('Retained partial response',{exact:true}).count(),0)
  }finally{releaseChat();await page.unroute(partialPath,delayChat)}
  await page.getByRole('button',{name:/Partial response QA/}).click()
  await page.getByText('Retained partial response',{exact:true}).waitFor()
  assert.equal(await page.getByText('Retained partial response',{exact:true}).count(),1)
  assert.ok(await page.locator('.message').filter({hasText:'Retained partial response'}).locator('[data-state="ERROR"]').isVisible())
  await page.reload()
  await page.getByRole('button',{name:/Partial response QA/}).click()
  await page.getByText('Retained partial response',{exact:true}).waitFor()
  console.log('PASS: retained partial response, refresh and stale conversation response isolation')
  await page.getByRole('button',{name:/Long history QA/}).click()
  await page.getByText('History message 11',{exact:true}).waitFor()
  assert.equal(await page.getByText('History message 00',{exact:true}).count(),0)
  await page.getByRole('button',{name:/加载更早消息|Load earlier messages/}).click()
  await page.getByText('History message 00',{exact:true}).waitFor()
  assert.equal(await page.locator('.chat-body .message').count(),24)
  const firstAnswer=page.locator('.chat-body .message.assistant').first()
  assert.equal(await firstAnswer.getByRole('button',{name:/无帮助|Not helpful/}).getAttribute('aria-pressed'),'true')
  await firstAnswer.getByRole('button',{name:/^有帮助$|^Helpful$/}).click()
  await page.waitForFunction(()=>document.querySelector('.chat-body .message.assistant button[aria-pressed="true"]')?.textContent==='↑')
  await page.reload()
  await page.getByRole('button',{name:/Long history QA/}).click()
  await page.getByText('History message 11',{exact:true}).waitFor()
  await page.getByRole('button',{name:/加载更早消息|Load earlier messages/}).click()
  await page.getByText('History message 00',{exact:true}).waitFor()
  assert.equal(await page.locator('.chat-body .message.assistant').first().getByRole('button',{name:/^有帮助$|^Helpful$/}).getAttribute('aria-pressed'),'true')
  console.log('PASS: newest long conversation page, earlier message paging and persistent accessible feedback')
  await page.getByRole('button',{name:/新对话|New chat/}).click()
  await page.getByRole('button',{name:/归档会话|Archive chat/}).click()
  await page.getByText(/此会话为只读|This conversation is read-only/).waitFor()
  assert.ok(await page.getByRole('textbox',{name:/输入消息|Enter message/}).isDisabled())
  await page.getByRole('button',{name:/恢复会话|Restore chat/}).click()
  await page.getByRole('button',{name:/清除会话|Clear chat/}).waitFor()
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:/清除会话|Clear chat/}).click()
  await page.getByText(/此会话为只读|This conversation is read-only/).waitFor()
  assert.ok(await page.getByRole('textbox',{name:/输入消息|Enter message/}).isDisabled())
  console.log('PASS: draft and pinned Prompt preview, focus restoration, message reuse, archive/restore/redact chat')
  await page.goto(base+'/#/projects')
  await page.locator('main .panel-head button.primary').first().click()
  await page.locator('.dialog input').first().fill('Browser QA workspace')
  await page.locator('.dialog button[type=submit], .dialog button.primary').first().click()
  await page.locator('.scope select').first().locator('option').filter({hasText:'Browser QA workspace'}).waitFor({state:'attached',timeout:15000})
  // The option appears before async project reload and dirty-dialog cleanup complete.
  await page.locator('.overlay').waitFor({state:'hidden',timeout:20000})
  await page.waitForFunction(({workspaceId,projectId})=>{
    const selectors=document.querySelectorAll('.scope select')
    return selectors[0]?.value===workspaceId&&selectors[1]?.value===projectId
  },{workspaceId,projectId},{timeout:20000})
  await page.goto(base+'/#/usage')
  await page.locator('#budget-overview-title').waitFor()
  await page.locator('.budget-block').last().waitFor()
  assert.equal(await page.locator('.budget-block').count(),3)
  const usageScope='/api/v1/workspaces/'+await page.locator('.scope select').first().inputValue()+'/projects/'+await page.locator('.scope select').nth(1).inputValue()
  const budgetResponse=await page.request.get(base+usageScope+'/budgets/overview')
  assert.ok(budgetResponse.ok())
  const budgetRows=await budgetResponse.json()
  assert.equal(budgetRows.length,3)
  assert.ok(budgetRows.every(b=>/^\d{14}$/.test(b.periodStart)&&/^\d{14}$/.test(b.periodEnd)&&Number(b.inflightCount)===0))
  const summaryResponse=await page.request.get(base+usageScope+'/usage/summary?from=20000101000000&to=20990101000000')
  assert.ok(summaryResponse.ok())
  const summaryRows=await summaryResponse.json()
  assert.ok(summaryRows.some(row=>row.usageSource==='REPORTED'&&Number(row.totalTokens)>=15))
  assert.ok(summaryRows.every(row=>Number(row.knownTokenCalls)+Number(row.unknownTokenCalls)===Number(row.callCount)))
  await page.locator('#usage-summary-title').waitFor()
  console.log('PASS: three current-period budget buckets and uncapped usage-source summary')
  // Verify dirty edit protection with real navigation and keyboard focus.
  await page.goto(base+'/#/projects')
  await page.locator('main[aria-busy="false"] .panel-head button.primary').first().click()
  await page.locator('.dialog input').first().fill('Unsaved matrix fixture')
  page.once('dialog',dialog=>dialog.dismiss())
  await page.keyboard.press('Escape')
  assert.ok(await page.getByRole('dialog').isVisible())
  page.once('dialog',dialog=>dialog.accept())
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({state:'hidden'})
  assert.equal(await page.getByText('Unsaved matrix fixture',{exact:true}).count(),0)
  // Navigate using the application router; duplicate navigation must not clear the active page.
  async function navigate(route){
    if(new URL(page.url()).hash!=='#/'+route){
      if(await page.locator('.mobile-menu').isVisible())await page.locator('.mobile-menu').click()
      await page.locator('#studio-navigation nav a[href="#/'+route+'"]').click()
    }
    await page.waitForFunction(route=>location.hash==='#/'+route&&
      document.querySelector('.heading .eyebrow')?.textContent?.includes(route.toUpperCase())&&
      document.querySelector('main')?.getAttribute('aria-busy')==='false',route)
  }
  await page.locator('main .panel-head button.primary').first().click()
  await page.locator('.dialog input').first().fill('Unsaved navigation fixture')
  page.once('dialog',dialog=>dialog.dismiss())
  await page.locator('#studio-navigation nav a[href="#/settings"]').evaluate(el=>el.click())
  assert.equal(new URL(page.url()).hash,'#/projects')
  assert.ok(await page.getByRole('dialog').isVisible())
  page.once('dialog',dialog=>dialog.accept())
  await page.locator('#studio-navigation nav a[href="#/settings"]').evaluate(el=>el.click())
  await page.getByRole('dialog').waitFor({state:'hidden'})
  await navigate('settings')
  await page.locator('#studio-navigation nav a[href="#/settings"]').click()
  await navigate('settings')
  const headings={
    'zh-CN':['工作台','空间与项目','模型中心','凭证中心','提示词','模型对话','运行记录','用量与预算','插件声明','设置'],
    'en-US':['Overview','Projects','Models','Credentials','Prompts','Chat','Runs','Usage & budgets','Plugin manifests','Settings']
  }
  let verified=0
  for (const theme of ['editorial-light','obsidian-dark','nordic-slate']) {
    for (const locale of ['zh-CN','en-US']) {
      await page.setViewportSize({width:1440,height:900})
      await navigate('settings')
      await page.locator('main').getByRole('combobox',{name:/主题|Theme/}).selectOption(theme)
      await page.waitForFunction(v=>document.documentElement.dataset.theme===v,theme)
      await page.locator('main').getByRole('combobox',{name:/语言|Language/}).selectOption(locale)
      await page.waitForFunction(v=>document.documentElement.lang===v,locale)
      for(const width of [1440,1024,768,390]){
        await page.setViewportSize({width,height:900})
        console.log('CHECK matrix '+theme+'/'+locale+'/'+width)
        for (const [index,route] of pages.entries()){
          await navigate(route)
          await page.waitForFunction(({route,heading})=>
            document.querySelector('.heading .eyebrow')?.textContent?.includes(route.toUpperCase())&&
            document.querySelector('main h1')?.textContent?.trim()===heading&&
            document.querySelector('main')?.getAttribute('aria-busy')==='false',
            {route,heading:headings[locale][index]})
          assert.equal(new URL(page.url()).hash,'#/'+route)
          assert.ok(await page.locator('main h1').isVisible())
          assert.equal(await page.locator('main > [role="alert"]').count(),0,theme+'/'+locale+'/'+route)
          const sizes=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,viewport:window.innerWidth}))
          assert.ok(sizes.actual<=sizes.viewport+2,'Page overflow '+JSON.stringify({theme,locale,width,route,...sizes}))
          assert.equal(await page.locator('.scope select').count(),2)
          if((width===1440||width===390)&&['home','models','chat','usage','settings'].includes(route))await page.screenshot({path:join(evidence,route+'-'+theme+'-'+locale+'-'+width+'.png')})
          verified++
        }
      }
      // Mobile navigation is keyboard operable and Escape returns focus.
      await page.locator('.mobile-menu').click()
      assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'true')
      const firstLink=page.locator('#studio-navigation nav a').first()
      await firstLink.focus()
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'false')
      assert.ok(await page.locator('.mobile-menu').evaluate(el=>el===document.activeElement))
    }
  }
  assert.equal(verified,240)
  console.log('PASS: 240 real route/theme/locale/viewport combinations, localized headings, no page overflow, dirty edit and mobile keyboard navigation')
  assert.deepEqual(errors,[])
  console.log('PASS: real browser login, persisted runs/prompts, workspace creation, all 10 routes at four viewport widths, three themes and two locales')
} catch (error) {
  await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{})
  throw error
} finally {
  await browser.close()
}
