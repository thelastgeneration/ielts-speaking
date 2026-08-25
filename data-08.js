(function(){
  const SUPABASE_URL='https://opsactnkcyskznktfdbi.supabase.co';
  const SUPABASE_KEY='sb_publishable_VFeoxXQW18SpPdH2MBP3dw_tbUhj0Vm';
  const SESSION_KEY='ielts-supabase-session-v1';
  const listeners=[];
  let session=null;
  try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){}

  function saveSession(s){session=s||null;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);listeners.forEach(fn=>{try{fn(session?'SIGNED_IN':'SIGNED_OUT',session)}catch(e){}})}
  async function req(path,opts={}){
    const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(opts.headers||{})};
    if(opts.auth!==false&&session?.access_token)headers.Authorization='Bearer '+session.access_token;
    const r=await fetch(SUPABASE_URL+path,{...opts,headers});
    let data=null;try{data=await r.json()}catch(e){}
    if(!r.ok){const err=new Error(data?.msg||data?.message||data?.error_description||data?.error||('HTTP '+r.status));err.status=r.status;throw err}
    return data;
  }
  async function refreshIfNeeded(){
    if(!session)return null;
    const exp=session.expires_at||0;if(exp*1000>Date.now()+60000)return session;
    if(!session.refresh_token){saveSession(null);return null}
    try{const d=await req('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:JSON.stringify({refresh_token:session.refresh_token})});saveSession({...d,user:d.user,expires_at:Math.floor(Date.now()/1000)+(d.expires_in||3600)});return session}catch(e){saveSession(null);return null}
  }
  function makeQuery(table){
    let filters=[];
    const q={
      select(cols='*'){q._cols=cols;return q},
      eq(col,val){filters.push([col,val]);return q},
      async maybeSingle(){
        await refreshIfNeeded();let url='/rest/v1/'+encodeURIComponent(table)+'?select='+encodeURIComponent(q._cols||'*');filters.forEach(([c,v])=>url+='&'+encodeURIComponent(c)+'=eq.'+encodeURIComponent(v));
        try{const rows=await req(url,{method:'GET',headers:{Accept:'application/vnd.pgrst.object+json'}});return {data:rows,error:null}}catch(e){if(e.status===406)return {data:null,error:null};return {data:null,error:e}}
      },
      async upsert(obj,options={}){
        await refreshIfNeeded();const conflict=options.onConflict?('?on_conflict='+encodeURIComponent(options.onConflict)):'';
        try{const data=await req('/rest/v1/'+encodeURIComponent(table)+conflict,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(obj)});return {data,error:null}}catch(e){return {data:null,error:e}}
      }
    };return q;
  }
  const client={
    auth:{
      async signInWithPassword(creds){try{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify(creds)});const s={...d,user:d.user,expires_at:Math.floor(Date.now()/1000)+(d.expires_in||3600)};saveSession(s);return {data:{user:d.user,session:s},error:null}}catch(e){return {data:{user:null,session:null},error:e}}},
      async signUp(creds){try{const d=await req('/auth/v1/signup',{method:'POST',auth:false,body:JSON.stringify(creds)});const s=d.access_token?{...d,user:d.user,expires_at:Math.floor(Date.now()/1000)+(d.expires_in||3600)}:null;if(s)saveSession(s);return {data:{user:d.user,session:s},error:null}}catch(e){return {data:{user:null,session:null},error:e}}},
      async signOut(){try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch(e){}saveSession(null);return {error:null}},
      async getSession(){await refreshIfNeeded();return {data:{session},error:null}},
      onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}}}}}
    },
    from:makeQuery
  };
  // Provide a tiny supabase-js compatible facade before window.load, so data-07 does not need jsDelivr.
  window.supabase=window.supabase||{createClient(){return client}};

  const LEGACY_TO_CURRENT={'relationships_q0':'mc-6::0','consumption_q15':'mc-83::0','consumption_q17':'mc-87::0'};
  let user=null,timer=null;
  const norm=s=>(s||'').toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9]+/g,' ').trim();
  const canonical=q=>'q::'+norm(q);
  function currentIndex(){const byNorm=new Map(),byKey=new Map();(window.IELTS_DATA||[]).forEach(r=>r.questions.forEach((q,i)=>{byNorm.set(norm(q),{r,i,key:r.id+'::'+i,q});byKey.set(r.id+'::'+i,{r,i,q})}));return {byNorm,byKey}}
  function customRegistry(cloud){const out=new Map(),add=cloud?.__custom__?.addTo||{};Object.values(add).flat().forEach(x=>{if(x?.id&&x?.question)out.set(norm(x.question),x.id)});return out}
  function newest(a,b){const ta=Date.parse(a?.updatedAt||0)||0,tb=Date.parse(b?.updatedAt||0)||0;return tb>ta?b:a}
  function answerObj(v){if(!v)return null;if(typeof v==='string')return {answer:v,updatedAt:new Date(0).toISOString()};if(typeof v==='object'&&typeof v.answer==='string')return v;return null}
  async function getCloud(){if(!user)return {};const {data}=await client.from('user_answers').select('answers').eq('user_id',user.id).maybeSingle();return data?.answers&&typeof data.answers==='object'?data.answers:{}}
  async function putCloud(obj){if(!user)return;await client.from('user_answers').upsert({user_id:user.id,answers:obj,updated_at:new Date().toISOString()},{onConflict:'user_id'})}
  async function migrate(){
    if(!user||typeof saved==='undefined'||typeof DATA==='undefined')return;
    const cloud=await getCloud(),idx=currentIndex(),custom=customRegistry(cloud);let changed=false;
    idx.byNorm.forEach((cur,nq)=>{const ck=canonical(cur.q),legacyCustom=custom.get(nq);let best=answerObj(cloud[ck]);if(legacyCustom)best=newest(best,answerObj(cloud[legacyCustom]));best=newest(best,answerObj(cloud[cur.key]));if(best?.answer!=null&&saved[cur.key]!==best.answer){saved[cur.key]=best.answer;changed=true}if(best){cloud[ck]=best;cloud[cur.key]=best;if(legacyCustom)cloud[legacyCustom]=best}});
    Object.entries(LEGACY_TO_CURRENT).forEach(([oldKey,newKey])=>{const old=answerObj(cloud[oldKey]),cur=idx.byKey.get(newKey);if(!old||!cur)return;const best=newest(answerObj(cloud[newKey]),old);if(best?.answer!=null&&saved[newKey]!==best.answer){saved[newKey]=best.answer;changed=true}cloud[oldKey]=best;cloud[newKey]=best;cloud[canonical(cur.q)]=best});
    localStorage.setItem(KEY,JSON.stringify(saved));await putCloud(cloud);
    if(changed){if(typeof renderHome==='function')renderHome();if(typeof updateStats==='function')updateStats();if(typeof practice!=='undefined'&&practice.style.display!=='none'&&typeof renderPractice==='function')renderPractice()}
  }
  async function syncCurrent(){if(!user||typeof DATA==='undefined'||typeof saved==='undefined'||activeTopic==null)return;const r=DATA[activeTopic],q=r?.questions?.[qIndex];if(!q)return;const key=r.id+'::'+qIndex,val=saved[key];if(val===undefined)return;const cloud=await getCloud(),obj={...(answerObj(cloud[key])||{}),answer:val,updatedAt:new Date().toISOString()};cloud[key]=obj;cloud[canonical(q)]=obj;const custom=customRegistry(cloud),legacyCustom=custom.get(norm(q));if(legacyCustom)cloud[legacyCustom]=obj;Object.entries(LEGACY_TO_CURRENT).forEach(([oldKey,newKey])=>{if(newKey===key)cloud[oldKey]=obj});await putCloud(cloud)}
  function schedule(){clearTimeout(timer);timer=setTimeout(syncCurrent,650)}
  window.addEventListener('load',async()=>{try{const {data}=await client.auth.getSession();user=data.session?.user||null;if(user)await migrate();client.auth.onAuthStateChange(async(_event,s)=>{user=s?.user||null;if(user)setTimeout(migrate,200)});const oldAI=window.answerInput;if(typeof oldAI==='function')window.answerInput=function(){oldAI();schedule()};const oldPersist=window.persist;if(typeof oldPersist==='function')window.persist=function(){oldPersist();schedule()}}catch(e){console.warn('Direct Supabase sync unavailable',e)}});
})();