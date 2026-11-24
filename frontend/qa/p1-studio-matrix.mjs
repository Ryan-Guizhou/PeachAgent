import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {chromium} from 'playwright'

// Navigation preflight runs before Runtime setup; the full matrix runs with real populated resources.
const base='http://localhost:8080'
const routes=['home','projects','models','credentials','prompts','chat','runs','usage','plugins','settings']
const headings={
  'zh-CN':['工作台','空间与项目','模型中心','凭证中心','提示词','模型对话','运行记录','用量与预算','插件声明','设置'],
  'en-US':['Overview','Projects','Models','Credentials','Prompts','Chat','Runs','Usage & budgets','Plugin manifests','Settings']
}
const evidence=fileURLToPath(new URL('./evidence/',import.meta.url))
await mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const errors=[]
page.on('pageerror',error=>errors.push(error.message))
const navigationOnly=process.argv.includes('--navigation-only')

async function ready(route,locale){
  const title=locale?headings[locale][routes.indexOf(route)]:null
  await page.waitForFunction(({route,title})=>
    location.hash==='#/'+route&&
    document.querySelector('.heading .eyebrow')?.textContent?.includes(route.toUpperCase())&&
    document.querySelector('main')?.getAttribute('aria-busy')==='false'&&
    (!title||document.querySelector('main h1')?.textContent?.trim()===title),{route,title},{timeout:12000})
  await page.locator('.scope select').nth(1).locator('option').first().waitFor({state:'attached'})
}

async function documentVisit(route,tag,locale){
  // Unique query selects a new real document, avoiding previous canceled hash-history state.
  await page.goto(base+'/?qa-view='+encodeURIComponent(tag)+'#/'+route,{waitUntil:'domcontentloaded'})
  await ready(route,locale)
}

async function linkVisit(route){
  if(await page.locator('.mobile-menu').isVisible()&&await page.locator('.mobile-menu').getAttribute('aria-expanded')==='false'){
    await page.locator('.mobile-menu').click()
  }
  const link=page.locator('#studio-navigation nav a[href="#/'+route+'"]')
  await link.click()
  await ready(route)
}

async function confirmAction(action,accept){
  const handled=page.waitForEvent('dialog',{timeout:10000}).then(async dialog=>{
    assert.equal(dialog.type(),'confirm')
    if(accept)await dialog.accept()
    else await dialog.dismiss()
  })
  await Promise.all([handled,action()])
}

async function settle(){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
}

async function mobileNavigation(){
  await page.setViewportSize({width:390,height:900})
  const menu=page.locator('.mobile-menu')
  await menu.click()
  assert.equal(await menu.getAttribute('aria-expanded'),'true')
  const home=page.locator('#studio-navigation nav a[href="#/home"]')
  await home.focus()
  await page.keyboard.press('Escape')
  await page.waitForFunction(()=>document.querySelector('.mobile-menu')===document.activeElement&&
    document.querySelector('.mobile-menu')?.getAttribute('aria-expanded')==='false')
  await menu.click()
  await home.focus()
  await page.keyboard.press('Enter')
  await ready('home')
  assert.equal(await menu.getAttribute('aria-expanded'),'false')
}

async function navigationPreflight(){
  await linkVisit('settings')
  await linkVisit('projects')
  const create=page.locator('main .panel-head button.primary').first()
  await create.click()
  const modal=page.getByRole('dialog')
  await modal.locator('input').first().fill('Unsaved navigation fixture')
  await confirmAction(()=>page.keyboard.press('Escape'),false)
  assert.ok(await modal.isVisible())
  assert.equal(await modal.locator('input').first().inputValue(),'Unsaved navigation fixture')
  // Browser Back is a real history navigation, not a click through the modal backdrop.
  await confirmAction(()=>page.evaluate(()=>history.back()),false)
  await ready('projects')
  await settle()
  assert.ok(await modal.isVisible())
  assert.equal(await modal.locator('input').first().inputValue(),'Unsaved navigation fixture')
  await confirmAction(()=>page.evaluate(()=>history.back()),true)
  await ready('settings')
  await modal.waitFor({state:'hidden'})
  await linkVisit('home')
  // Duplicate navigation must not clear resources or leave a loading indicator.
  await linkVisit('home')
  await linkVisit('projects')
  await create.click()
  await modal.locator('input').first().fill('Unsaved close fixture')
  await confirmAction(()=>page.keyboard.press('Escape'),true)
  await modal.waitFor({state:'hidden'})
  await page.waitForFunction(()=>document.querySelector('main .panel-head button.primary')===document.activeElement)
  await linkVisit('settings')
  await mobileNavigation()
  console.log('PASS: real route navigation, canceled history restoration, accepted dirty navigation, duplicate navigation, modal and mobile focus')
}

async function preference(name,value,htmlReady){
  const select=page.locator('main').getByRole('combobox',{name})
  await select.waitFor()
  if(await select.inputValue()!==value){
    const saved=page.waitForResponse(response=>response.url()===base+'/api/v1/auth/preferences'&&
      response.request().method()==='PATCH')
    await select.selectOption(value)
    assert.ok((await saved).ok(),'Preference PATCH failed')
  }
  await page.waitForFunction(htmlReady,value)
  await page.waitForFunction(()=>document.querySelectorAll('main select').length===2&&
    document.querySelectorAll('main select:disabled').length===0)
}

async function matrix(){
  let verified=0
  for(const theme of ['editorial-light','obsidian-dark','nordic-slate']){
    for(const locale of ['zh-CN','en-US']){
      const tag=theme+'-'+locale
      await page.setViewportSize({width:1440,height:900})
      await documentVisit('settings','preferences-'+tag)
      await preference(/主题|Theme/,theme,value=>document.documentElement.dataset.theme===value)
      await preference(/语言|Language/,locale,value=>document.documentElement.lang===value)
      const me=await page.request.get(base+'/api/v1/auth/me')
      assert.ok(me.ok())
      const saved=await me.json()
      assert.equal(saved.theme,theme)
      assert.equal(saved.locale,locale)
      // One actual document load per route and combination, then all four viewport sizes.
      // 60 document loads, 240 independent layout assertions, real API data on every page.
      for(const route of routes){
        console.log('CHECK matrix '+tag+'/'+route)
        await page.setViewportSize({width:1440,height:900})
        await documentVisit(route,tag+'-'+route,locale)
        if(route==='usage'){
          await page.locator('.budget-block').last().waitFor()
          assert.equal(await page.locator('.budget-block').count(),3)
          await page.waitForFunction(()=>!document.querySelector('main [aria-busy="true"]'))
        }
        for(const width of [1440,1024,768,390]){
          await page.setViewportSize({width,height:900})
          await settle()
          assert.equal(new URL(page.url()).hash,'#/'+route)
          assert.ok(await page.locator('main h1').isVisible())
          assert.equal(await page.locator('main h1').textContent(),headings[locale][routes.indexOf(route)])
          assert.equal(await page.locator('main [role="alert"]').count(),0,tag+'/'+route)
          assert.equal(await page.locator('.scope select').count(),2)
          const state=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,viewport:window.innerWidth,
            theme:document.documentElement.dataset.theme,locale:document.documentElement.lang,
            offenders:Array.from(document.querySelectorAll('main,.topbar,.panel,.chat-layout')).filter(el=>
              el.getBoundingClientRect().right>window.innerWidth+2).map(el=>el.className).slice(0,10)}))
          assert.equal(state.theme,theme)
          assert.equal(state.locale,locale)
          assert.ok(state.actual<=state.viewport+2,'Page overflow '+JSON.stringify({tag,route,width,...state}))
          if((width===1440||width===390)&&['home','models','chat','usage','settings'].includes(route)){
            await page.screenshot({path:join(evidence,route+'-'+tag+'-'+width+'.png')})
          }
          verified++
        }
      }
      // Matrix ends on settings at mobile width; verify the normal keyboard route to home.
      await mobileNavigation()
    }
  }
  assert.equal(verified,240)
  console.log('PASS: 240 populated real route/theme/locale/viewport combinations with no page overflow, persisted preferences and keyboard navigation')
}

try{
  await page.goto(base+'/#/home')
  await page.locator('input[type=email]').fill('p1-b@example.invalid')
  await page.locator('input[type=password]').fill('CI-only-test-passphrase-123')
  await page.locator('form.auth-card button.primary').first().click()
  await ready('home')
  if(navigationOnly)await navigationPreflight()
  else await matrix()
  assert.deepEqual(errors,[])
}catch(error){
  console.error('Studio QA state',JSON.stringify(await page.evaluate(()=>({url:location.hash,
    heading:document.querySelector('main h1')?.textContent,loading:document.querySelector('main')?.getAttribute('aria-busy'),
    dialog:!!document.querySelector('[role="dialog"]'),theme:document.documentElement.dataset.theme,
    locale:document.documentElement.lang})).catch(()=>({}))))
  await page.screenshot({path:join(evidence,navigationOnly?'navigation-failure.png':'matrix-failure.png'),fullPage:true}).catch(()=>{})
  throw error
}finally{
  await browser.close()
}
