(function(){
  const SUPABASE_URL='https://opsactnkcyskznktfdbi.supabase.co';
  const SUPABASE_KEY='sb_publishable_VFeoxXQW18SpPdH2MBP3dw_tbUhj0Vm';
  const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const LEGACY_TO_CURRENT={
    'relationships_q0':'mc-6::0',
    'consumption_q15':'mc-83::0',
    'consumption_q17':'mc-87::0'
  };
  let client=null,user=null,timer=null;
  const norm=s=>(s||'').toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9]+/g,' ').trim();
  const canonical=q=>'q::'+norm(q);
  function currentIndex(){
    const byNorm=new Map(),byKey=new Map();
    (window.IELTS_DATA||[]).forEach(r=>r.questions.forEach((q,i)=>{byNorm.set(norm(q),{r,i,key:r.id+'::'+i,q});byKey.set(r.id+'::'+i,{r,i,q})}));
    return {byNorm,byKey};
  }
  function loadSDK(){return new Promise((resolve,reject)=>{if(window.supabase)return resolve();const s=document.createElement('script');s.src=SDK;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
  function customRegistry(cloud){
    const out=new Map();const add=cloud?.__custom__?.addTo||{};
    Object.values(add).flat().forEach(x=>{if(x?.id&&x?.question)out.set(norm(x.question),x.id)});
    return out;
  }
  function newest(a,b){const ta=Date.parse(a?.updatedAt||0)||0,tb=Date.parse(b?.updatedAt||0)||0;return tb>ta?b:a}
  function answerObj(v){if(!v)return null;if(typeof v==='string')return {answer:v,updatedAt:new Date(0).toISOString()};if(typeof v==='object'&&typeof v.answer==='string')return v;return null}
  async function getCloud(){if(!user)return {};const {data}=await client.from('user_answers').select('answers').eq('user_id',user.id).maybeSingle();return data?.answers&&typeof data.answers==='object'?data.answers:{}}
  async function putCloud(obj){if(!user)return;await client.from('user_answers').upsert({user_id:user.id,answers:obj,updated_at:new Date().toISOString()},{onConflict:'user_id'})}
  async function migrate(){
    if(!user||typeof saved==='undefined'||typeof DATA==='undefined')return;
    const cloud=await getCloud(),idx=currentIndex(),custom=customRegistry(cloud);let changed=false;
    // 1. Exact question-text matching through canonical entries and old custom-question registry.
    idx.byNorm.forEach((cur,nq)=>{
      const ck=canonical(cur.q),legacyCustom=custom.get(nq);
      let best=answerObj(cloud[ck]);
      if(legacyCustom)best=newest(best,answerObj(cloud[legacyCustom]));
      best=newest(best,answerObj(cloud[cur.key]));
      if(best?.answer!=null&&saved[cur.key]!==best.answer){saved[cur.key]=best.answer;changed=true}
      if(best){cloud[ck]=best;cloud[cur.key]=best;if(legacyCustom)cloud[legacyCustom]=best}
    });
    // 2. Compatibility with old fixed category keys already used by the original workbench.
    Object.entries(LEGACY_TO_CURRENT).forEach(([oldKey,newKey])=>{
      const old=answerObj(cloud[oldKey]),cur=idx.byKey.get(newKey);if(!old||!cur)return;
      const currentObj=answerObj(cloud[newKey]),best=newest(currentObj,old);
      if(best?.answer!=null&&saved[newKey]!==best.answer){saved[newKey]=best.answer;changed=true}
      cloud[oldKey]=best;cloud[newKey]=best;cloud[canonical(cur.q)]=best;
    });
    localStorage.setItem(KEY,JSON.stringify(saved));
    await putCloud(cloud);
    if(changed){if(typeof renderHome==='function')renderHome();if(typeof updateStats==='function')updateStats();if(typeof practice!=='undefined'&&practice.style.display!=='none'&&typeof renderPractice==='function')renderPractice();}
  }
  async function syncCurrent(){
    if(!user||typeof DATA==='undefined'||typeof saved==='undefined'||activeTopic==null)return;
    const r=DATA[activeTopic],q=r?.questions?.[qIndex];if(!q)return;
    const key=r.id+'::'+qIndex,val=saved[key];if(val===undefined)return;
    const cloud=await getCloud(),obj={...(answerObj(cloud[key])||{}),answer:val,updatedAt:new Date().toISOString()};
    cloud[key]=obj;cloud[canonical(q)]=obj;
    const custom=customRegistry(cloud),legacyCustom=custom.get(norm(q));if(legacyCustom)cloud[legacyCustom]=obj;
    Object.entries(LEGACY_TO_CURRENT).forEach(([oldKey,newKey])=>{if(newKey===key)cloud[oldKey]=obj});
    await putCloud(cloud);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(syncCurrent,650)}
  window.addEventListener('load',async()=>{
    try{
      await loadSDK();client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      const {data}=await client.auth.getSession();user=data.session?.user||null;
      if(user)await migrate();
      client.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;if(user)setTimeout(migrate,150)});
      const oldAI=window.answerInput;if(typeof oldAI==='function')window.answerInput=function(){oldAI();schedule()};
      const oldPersist=window.persist;if(typeof oldPersist==='function')window.persist=function(){oldPersist();schedule()};
    }catch(e){console.warn('Cross-workbench sync unavailable',e)}
  });
})();