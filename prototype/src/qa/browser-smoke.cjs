'use strict';
// Real Chrome smoke tests; Playwright is a test-only dependency, not bundled.
const assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path'), http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep))throw Error('invalid path');
    const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  }catch(_){res.writeHead(404);res.end();}
});
async function verify(browser,url,label,full){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const action=name=>page.locator('[data-action="'+name+'"]');
  const nav=name=>page.locator('[data-nav="'+name+'"]');
  async function route(name){await nav(name).click();await page.waitForFunction(n=>window.Studio.route===n,name);}
  async function openDemo(){
    await action('auth-demo').waitFor({state:'visible'});
    await action('auth-demo').click();
    await nav('projects').waitFor({state:'visible'});
    await page.waitForFunction(()=>window.Studio.route==='home');
  }
  try{
    await page.goto(url,{waitUntil:'load'});
    if(full){
      const field=page.locator('form[data-form="auth-login"] input[type="email"]');
      await field.fill('unsaved@example.invalid');await action('appearance-locale').click();
      assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');assert.equal(await field.inputValue(),'unsaved@example.invalid');
      await field.fill('');
      await action('appearance-locale').click();assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
      await action('appearance-locale').click();assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    }
    await openDemo();
    await route('projects');
    await action('project-create').click();await page.locator('#project-name-input').fill('Browser QA project');
    await action('project-name-save').click();
    const project=await page.evaluate(()=>StudioProjects.list().find(x=>x.name==='Browser QA project'));
    assert(project);
    await Promise.all([page.waitForEvent('load'),page.locator('[data-action="project-switch"][data-id="'+project.id+'"]').click()]);
    await nav('projects').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-chrome="project-name"]').textContent(),'Browser QA project');
    await route('credentials');await action('cred-create').click();
    await page.locator('#cred-name').fill('Browser QA credential');await page.locator('#cred-ref').fill('env:BROWSER_QA_KEY');
    await action('cred-create-confirm').click();
    await page.locator('[data-action="cred-verify"][data-ref="env:BROWSER_QA_KEY"]').click();
    assert(await page.evaluate(()=>Studio.Credentials.list().some(x=>x.ref==='env:BROWSER_QA_KEY'&&x.verifiedAt)));
    await page.locator('[data-action="cred-revoke"][data-ref="env:BROWSER_QA_KEY"]').click();
    await action('cred-revoke-confirm').click();
    assert.equal(await page.evaluate(()=>Studio.Credentials.isUsable('model','env:BROWSER_QA_KEY')),false);
    await route('inbox');
    await action('appearance-locale').click();assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
    assert.match(await nav('projects').innerText(),/Projects/);
    await route('projects');assert.match(await page.locator('#page-content h1').innerText(),/Projects/);
    assert.equal(await page.locator('[data-chrome="project-name"]').textContent(),'Browser QA project');
    await action('appearance-locale').click();assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    for(const theme of ['obsidian-dark','nordic-slate','editorial-light']){
      await action('appearance-theme').click();await page.locator('[data-theme-value="'+theme+'"]').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    }
    if(full){
      await page.setViewportSize({width:1024,height:768});
      await route('projects');
      const navScroll=page.locator('.nav-scroll');
      const scroll=await navScroll.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop;});
      if(scroll>0){
        await nav('quality').click();await page.waitForFunction(()=>Studio.route==='quality');
        assert(await navScroll.evaluate(el=>el.scrollTop)>0,'sidebar reset to top');
      }
      await page.setViewportSize({width:390,height:844});
      await action('toggle-sidebar').filter({visible:true}).first().click();
      await nav('inbox').click();await page.waitForFunction(()=>Studio.route==='inbox');
      assert(await page.locator('#page-content h1').isVisible());
    }
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>window.StudioProjects?.active()?.name==='Browser QA project');
    assert.equal(await page.evaluate(()=>Studio.Credentials.isUsable('model','env:BROWSER_QA_KEY')),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: real Chrome '+label+' login, project switch, credential revoke/persistence, inbox, locale, themes'+(full?', dirty form guard, sidebar and narrow layout':''));
  }finally{await context.close();}
}
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const origin='http://127.0.0.1:'+server.address().port;
    await verify(browser,origin+'/src/index.html','split source',true);
    await verify(browser,pathToFileURL(path.join(root,'OTRYX_Studio.html')).href,'offline HTML',false);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
