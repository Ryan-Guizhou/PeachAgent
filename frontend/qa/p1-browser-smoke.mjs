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
  await page.getByText('Fixture prompt',{exact:true}).first().waitFor()
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
