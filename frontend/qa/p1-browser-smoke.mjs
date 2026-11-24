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
  await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('SUCCEEDED'))
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
  await page.goto(base+'/#/settings')
  for (const theme of ['editorial-light','obsidian-dark','nordic-slate']) {
    const select=page.locator('main select').first()
    await select.selectOption(theme)
    await page.waitForFunction(v => document.documentElement.dataset.theme===v || document.querySelector('[data-theme="'+v+'"]')!==null,theme)
    for (const locale of ['zh-CN','en-US']) {
      await page.locator('main select').nth(1).selectOption(locale)
      await page.waitForFunction(v=>document.documentElement.lang===v || document.querySelector('main h2')?.textContent===(v==='en-US'?'Preferences':'个人偏好'),locale)
      await page.screenshot({path:join(evidence,'settings-'+theme+'-'+locale+'.png')})
    }
  }
  for (const width of [1440,1024,768,390]) {
    await page.setViewportSize({width,height:900})
    for (const route of pages) {
      await page.goto(base+'/#/'+route)
      await page.locator('main h1').waitFor()
      assert.equal(new URL(page.url()).hash,'#/'+route)
      await page.waitForFunction(r => document.querySelector('.heading .eyebrow')?.textContent?.includes(r.toUpperCase()),route)
      assert.ok(await page.locator('main h1').isVisible())
      if (route==='home'||route==='chat'||route==='models') await page.screenshot({path:join(evidence,route+'-'+width+'.png')})
    }
  }
  assert.deepEqual(errors,[])
  console.log('PASS: real browser login, persisted runs/prompts, workspace creation, all 10 routes at four viewport widths, three themes and two locales')
} catch (error) {
  await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{})
  throw error
} finally {
  await browser.close()
}
