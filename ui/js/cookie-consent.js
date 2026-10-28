'use strict';
(() => {
  const key = 'hanzet-scraper-cookie-consent-v1';
  const categories = [
    {id:'essential',title:'Essential / security',description:'Basic functions and security checks. If disabled, features that require a security cookie may not work.'},
    {id:'functional',title:'Functional',description:'Optional preferences that could remember interface choices beyond this consent panel.'},
    {id:'analytics',title:'Analytics',description:'Optional usage measurement. No analytics provider is currently enabled by this interface.'},
    {id:'marketing',title:'Marketing',description:'Optional advertising or cross-site marketing cookies. No advertising tracker is currently enabled by this interface.'}
  ];
  let preferences = null, banner = null, shade = null;
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && value.version === 1 ? value : null; } catch (_) { return null; } };
  const write = value => {
    preferences = {version:1,updatedAt:new Date().toISOString(),categories:value};
    try { localStorage.setItem(key,JSON.stringify(preferences)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('hanzet:cookie-consent-changed',{detail:preferences}));
    hideBanner(); closeSettings();
  };
  function hideBanner(){if(banner){banner.remove();banner=null;}}
  function closeSettings(){if(shade){shade.remove();shade=null;}}
  function openSettings(){
    closeSettings(); shade=document.createElement('div'); shade.className='cookie-shade';
    const dialog=document.createElement('section'); dialog.className='cookie-dialog'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','cookieDialogTitle');
    const values=preferences?.categories || Object.fromEntries(categories.map(c=>[c.id,false]));
    const heading=document.createElement('h2'); heading.id='cookieDialogTitle'; heading.textContent='Cookie preferences'; dialog.append(heading);
    const intro=document.createElement('p'); intro.textContent='Choose each category independently. Optional categories start disabled, and you can change your choice later.'; dialog.append(intro);
    for(const c of categories){
      const label=document.createElement('label'); label.className='cookie-category';
      const input=document.createElement('input'); input.type='checkbox'; input.name=c.id; input.checked=values[c.id]===true;
      const copy=document.createElement('span'), title=document.createElement('strong'), desc=document.createElement('small');
      title.textContent=c.title; desc.textContent=c.description; copy.append(title,desc); label.append(input,copy); dialog.append(label);
    }
    const actions=document.createElement('div'); actions.className='cookie-actions';
    const save=document.createElement('button'); save.className='primary'; save.textContent='Save my choices';
    const reject=document.createElement('button'); reject.textContent='Reject all';
    const accept=document.createElement('button'); accept.textContent='Accept all';
    const close=document.createElement('button'); close.textContent='Cancel';
    save.addEventListener('click',()=>{const result={}; for(const c of categories) result[c.id]=dialog.querySelector('[name="'+c.id+'"]').checked; write(result);});
    reject.addEventListener('click',()=>write(Object.fromEntries(categories.map(c=>[c.id,false]))));
    accept.addEventListener('click',()=>write(Object.fromEntries(categories.map(c=>[c.id,true]))));
    close.addEventListener('click',closeSettings);
    actions.append(save,reject,accept,close); dialog.append(actions);
    const note=document.createElement('p'); note.className='cookie-note'; note.textContent='Your choice is stored in this browser using local storage. This preference panel does not itself add a cookie.'; dialog.append(note);
    shade.append(dialog); shade.addEventListener('click',e=>{if(e.target===shade)closeSettings();});
    document.body.append(shade); dialog.querySelector('input')?.focus();
  }
  function showBanner(){
    if(banner||preferences)return;
    banner=document.createElement('aside'); banner.className='cookie-banner'; banner.setAttribute('role','region'); banner.setAttribute('aria-label','Cookie consent');
    const title=document.createElement('h2'); title.textContent='Your cookie choices';
    const body=document.createElement('p'); body.textContent='Choose what you allow. All categories start off until you choose. Reject all is just as easy as accepting all.';
    const link=document.createElement('a'); link.href='ui/legal/cookie-policy.html'; link.textContent='Cookie Policy'; link.target='_blank'; link.rel='noopener noreferrer';
    const actions=document.createElement('div'); actions.className='cookie-actions';
    const accept=document.createElement('button'); accept.className='primary'; accept.textContent='Accept all';
    const reject=document.createElement('button'); reject.textContent='Reject all';
    const customize=document.createElement('button'); customize.textContent='Customize';
    accept.addEventListener('click',()=>write(Object.fromEntries(categories.map(c=>[c.id,true]))));
    reject.addEventListener('click',()=>write(Object.fromEntries(categories.map(c=>[c.id,false]))));
    customize.addEventListener('click',openSettings);
    actions.append(accept,reject,customize); banner.append(title,body,link,actions); document.body.append(banner);
  }
  function init(){preferences=read();if(!preferences)showBanner();}
  window.addEventListener('hanzet:legal-acknowledged',init);
  try{if(localStorage.getItem('hanzet-scraper-legal-ack-v1')==='accepted')init();}catch(_){}
  document.addEventListener('click',event=>{if(event.target?.id==='openCookieSettings'){event.preventDefault();openSettings();}});
  window.HanzetCookieConsent={getPreferences:()=>preferences,openSettings};
})();