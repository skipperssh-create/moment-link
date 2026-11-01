"""Browser regression tests for the local-only preview.
Default: python tests/test_preview.py --url http://localhost:4173
Restricted environment: --isolated --chromium /usr/bin/chromium
Isolated mode renders the real CSS/JS inline and replaces only localStorage.
It does NOT test native storage, network, PWA installation or device integrations.
"""
import argparse, json, time
from pathlib import Path
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://localhost:4173')
parser.add_argument('--isolated',action='store_true')
parser.add_argument('--chromium',default=None)
parser.add_argument('--phase',default='all',choices=['all','flows','responsive'])
a=parser.parse_args()
results=[]
errors=[]
CSS=(ROOT/'styles.css').read_text()
JS=(ROOT/'app.js').read_text()
STORAGE="""(()=>{const d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>Object.hasOwn(d,k)?d[k]:null,setItem:(k,v)=>d[k]=String(v),removeItem:k=>delete d[k],clear:()=>Object.keys(d).forEach(k=>delete d[k]),get length(){return Object.keys(d).length},key:i=>Object.keys(d)[i]}});window.__storageForTest=d})()"""
def load(browser,w=390,h=844):
    pg=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
    pg.on('pageerror',lambda e: errors.append(str(e)))
    if a.isolated:
        pg.set_content('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+CSS+'</style></head><body><div id="app"></div></body></html>')
        pg.evaluate(STORAGE)
        pg.add_script_tag(content=JS)
    else:
        pg.goto(a.url,wait_until='networkidle')
        pg.evaluate('localStorage.clear()')
        pg.reload()
    pg.locator('[data-category="yacht"]').wait_for()
    return pg

def record(name,ok,detail=''):
    results.append({'test':name,'passed':bool(ok),'detail':detail})
    if not ok: print('FAIL',name,detail)

def snap(pg,name,full=False):
    pg.evaluate("window.scrollTo({top:0,behavior:'instant'})")
    pg.wait_for_timeout(120)
    pg.screenshot(path=str(ROOT/'previews'/name),full_page=full)

def select(pg,cat,pid,pack):
    pg.locator(f'[data-category="{cat}"]').click()
    if pid=='docked': pg.locator('[data-sub="dock"]').click()
    pg.locator(f'[data-select="{pid}:{pack}"]').click()

def back_categories(pg):
    if pg.locator('[data-back="category"]').count(): pg.locator('[data-back="category"]').click()

with sync_playwright() as p:
    kw={'headless':True,'args':['--no-sandbox']}
    if a.chromium: kw['executable_path']=a.chromium
    browser=p.chromium.launch(**kw)
    if a.phase in ['all','flows']:
        pg=load(browser)
        snap(pg,'01-customer-home.png')
        select(pg,'yacht','premium','all')
        record('PREMIUM all-in-one price', '590,000원' in pg.locator('[data-select="premium:all"]').inner_text())
        record('flower table removed', pg.locator('table').count()==0)
        record('bouquet benefit on premium all-in-one', '꽃다발 포함' in pg.locator('[data-select="premium:all"]').inner_text())
        record('classic all-in-one excludes bouquet', '꽃다발 미포함' in pg.locator('[data-select="classic:all"]').inner_text())
        # preserve expanded details through selection.
        details=pg.locator('[data-detail="premium"]')
        details.locator('summary').click()
        pg.locator('[data-select="premium:light"]').click()
        record('detail expansion preserved',pg.locator('[data-detail="premium"]').get_attribute('open') is not None)
        pg.locator('[data-select="premium:all"]').click()
        pg.locator('[data-select="premium:all"]').scroll_into_view_if_needed()
        snap(pg,'02-yacht-mobile.png')
        # proceed without second date; exact preferred time.
        pg.locator('[data-next="products"]').click()
        today=datetime.now()+timedelta(days=30)
        date=today.strftime('%Y-%m-%d')
        pg.locator('#firstDate').fill(date)
        pg.locator('[data-time="1:오후"]').click()
        pg.locator('.exact-time summary').first.click()
        pg.locator('#exactTime1').fill('16:30')
        pg.locator('#exactTime1').dispatch_event('change')
        record('exact time selection',pg.locator('#exactTime1').input_value()=='16:30')
        # Rotation without page reload must preserve values.
        pg.set_viewport_size({'width':844,'height':390})
        record('rotation preserves preferred date',pg.locator('#firstDate').input_value()==date)
        pg.set_viewport_size({'width':390,'height':844})
        pg.locator('[data-next="schedule"]').click()
        record('second date optional',pg.locator('#name').count()==1)
        pg.locator('#name').fill('테스트 고객')
        pg.locator('#phone').fill('010 1234 5678')
        pg.locator('#consent').check()
        pg.locator('[data-next="contact"]').click()
        record('contact completion reaches done',pg.locator('[data-next="done"]').count()==1)
        pg.locator('[data-next="done"]').click()
        text=pg.locator('.message').inner_text()
        record('customer SMS direction', '상담 부탁드립니다' in text and '연락드리겠습니다' not in text)
        record('optional date omitted from SMS', '2순위:' not in text)
        record('SMS includes exact time', '16:30' in text)
        record('correct SMS recipient', '010-8009-8047' in pg.locator('.info').inner_text())
        record('no invented holiday single quote', '주중 590,000원 / 주말 690,000원' in text)
        pg.locator('[data-view="admin"]').click()
        record('submitted request in admin', '테스트 고객' in pg.locator('.admin-section').inner_text())
        record('yacht request location snapshot', '한국해양대학교' in pg.locator('.admin-section').inner_text())
        storage=pg.evaluate('JSON.stringify(localStorage)')
        if a.isolated:
            storage=pg.evaluate('JSON.stringify(window.__storageForTest)')
        record('no customer PII persisted by preview', '테스트 고객' not in storage and '01012345678' not in storage)
        pg.locator('[data-admin-tab="settings"]').click()
        record('SOLAPI default off',pg.locator('[data-switch="solapi"]').get_attribute('aria-checked')=='false')
        record('child SMS switch disabled when master off',pg.locator('[data-switch="customerAuto"]').is_disabled())
        pg.locator('[data-switch="solapi"]').click()
        pg.locator('[data-switch="customerAuto"]').click()
        pg.locator('[data-switch="solapi"]').click()
        record('SOLAPI off also disables customer sends',pg.locator('[data-switch="customerAuto"]').get_attribute('aria-checked')=='false')
        pg.close()
        # CRUD in each category, no fixed 3-yacht cap.
        for cat in ['yacht','visit','trunk','heli']:
            pg=load(browser,1280,900)
            pg.locator('[data-view="admin"]').click()
            pg.locator('[data-admin-tab="products"]').click()
            pg.locator('#adminCategory').select_option(cat)
            before=pg.locator('[data-edit-id]').count()
            pg.locator('[data-action="addProduct"]').click()
            pg.locator('#editName').fill('추가 상품 '+cat)
            pg.locator('#packName_0').fill('확장 패키지')
            pg.locator('#packWeek_0').fill('123000')
            pg.locator('#packWeekend_0').fill('145000')
            pg.locator('[data-action="saveProduct"]').click()
            record(cat+' product added',pg.locator('[data-edit-id]').count()==before+1)
            pg.locator('[data-action="addPack"]').click()
            record(cat+' package added',pg.locator('#packName_1').count()==1)
            pg.locator('#packName_1').fill('두 번째 구성')
            pg.locator('#packWeek_1').fill('245000')
            pg.locator('[data-action="saveProduct"]').click()
            pg.locator('[data-view="customer"]').click()
            pg.locator(f'[data-category="{cat}"]').click()
            record(cat+' edited product visible to customer', '추가 상품 '+cat in pg.locator('.product-grid').inner_text())
            pg.locator('[data-view="admin"]').click()
            pg.locator('[data-action="toggleVisible"]').click()
            pg.locator('[data-view="customer"]').click()
            record(cat+' hidden product removed', '추가 상품 '+cat not in pg.locator('.product-grid').inner_text())
            pg.locator('[data-view="admin"]').click()
            pg.once('dialog',lambda d:d.accept())
            pg.locator('[data-action="deleteProduct"]').click()
            record(cat+' product deletion',pg.locator('[data-edit-id]').count()==before)
            pg.close()
        pg=load(browser)
        select(pg,'visit','visit','all')
        record('visit identical styling', '장식 세팅 동일' in pg.locator('.product').inner_text())
        record('visit all-in-one correct price','348,000원' in pg.locator('[data-select="visit:all"]').inner_text())
        pg.locator('[data-action="recommend"]').click()
        record('recommendation without invented price','상담 후 안내' in pg.locator('.action-bar').inner_text())
        pg.locator('[data-select="visit:all"]').click()
        snap(pg,'03-visit-mobile.png')
        pg.close()
        pg=load(browser)
        select(pg,'yacht','docked','all')
        record('dock all-in-one price','390,000원' in pg.locator('[data-select="docked:all"]').inner_text())
        pg.locator('.product details summary').click()
        record('dock includes video letter','영상편지 포함' in pg.locator('.product details').inner_text())
        record('dock no sailing time','실운항' not in pg.locator('.product').inner_text())
        pg.close()
        pg=load(browser)
        select(pg,'heli','heli','edited')
        text=pg.locator('.product').inner_text()
        record('heli exact three prices',all(s in text for s in ['690,000원','990,000원','1,090,000원']))
        record('99만원 explicitly excludes editing','편집본 제외' in pg.locator('[data-select="heli:original"]').inner_text())
        record('109만원 explicitly includes edited video','추억영상 편집본' in pg.locator('[data-select="heli:edited"]').inner_text())
        pg.locator('.product-photo').evaluate('(e)=>e.scrollIntoView({block:"start"})')
        snap(pg,'04-heli-mobile.png')
        # Verified product data export; customer data is not included.
        (ROOT/'catalog.confirmed.json').write_text(json.dumps(pg.evaluate('window.MomentLinkPreview.catalog()'),ensure_ascii=False,indent=2))
        pg.close()
        pg=load(browser,1440,1000)
        select(pg,'heli','heli','edited')
        snap(pg,'05-heli-desktop.png')
        pg.locator('[data-view="admin"]').click()
        pg.locator('[data-admin-tab="products"]').click()
        pg.locator('#adminCategory').select_option('heli')
        snap(pg,'06-admin-desktop.png')
        pg.close()
    if a.phase in ['all','responsive']:
        viewports=[(320,720),(360,780),(390,844),(412,915),(720,320),(780,360),(844,390),(915,412),(600,900),(900,600),(768,1024),(1024,768),(820,1180),(1180,820),(1024,1366),(1366,1024),(1280,800),(1440,900),(900,1440),(1920,1080)]
        for w,h in viewports:
            pg=load(browser,w,h)
            states=[]
            def check(label):
                issues=pg.evaluate('''()=>{const page=document.documentElement;const issues=[];if(page.scrollWidth>innerWidth+1)issues.push('page horizontal overflow');document.querySelectorAll('.price-line b,.package-single,.primary,.package-title').forEach(el=>{if(el.clientWidth&&el.scrollWidth>el.clientWidth+2)issues.push(el.className+': '+el.textContent)});return issues}''')
                states.append(label)
                record(f'{w}x{h} {label}',not issues,'; '.join(issues))
            check('category')
            pg.locator('[data-category="yacht"]').click();check('yacht sailing')
            pg.locator('[data-sub="dock"]').click();check('yacht docked')
            pg.locator('[data-back="category"]').click()
            pg.locator('[data-category="visit"]').click();check('visit')
            pg.locator('[data-back="category"]').click()
            pg.locator('[data-category="heli"]').click();check('heli')
            pg.locator('[data-select="heli:edited"]').click()
            pg.locator('[data-next="products"]').click();check('schedule')
            pg.locator('[data-view="admin"]').click()
            pg.locator('[data-admin-tab="products"]').click();check('admin products')
            pg.locator('[data-admin-tab="settings"]').click();check('admin settings')
            if (w,h)==(844,390):snap(pg,'07-admin-landscape.png')
            pg.close()
    browser.close()
record('uncaught JS errors',not errors,' | '.join(errors[:8]))
report={'mode':'inline real UI with in-memory localStorage adapter' if a.isolated else 'HTTP browser', 'engine':'Chromium', 'real_devices_tested':False,'network_integrations_tested':False,'total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'results':results}
(ROOT/'tests'/f'results-{a.phase}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
raise SystemExit(1 if report['failed'] else 0)
