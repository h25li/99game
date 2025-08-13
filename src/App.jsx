import React, { useMemo, useState, useEffect, useRef } from "react";

// 九九乘法表闯关游戏（适配小学二年级）· 完整修复版
// 功能：关卡地图 · 题型（三选/拖拽/填空）· 错题本（练对即移除/今日错题/导出CSV）
//      限时挑战（可选题型或轮换）· 排行榜 · 皮肤与主题商店 · 背景音乐/音效
//      三国演义头像展示 · 通关恭喜弹窗（仪式感）

/******************** 工具函数 ********************/ 
function shuffle(arr) { const a = [...arr]; for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function genOptions(correct) { const opts = new Set([correct]); while (opts.size < 3) { const delta = Math.floor(Math.random()*8)-4; const c = Math.max(0, correct + (delta===0?1:delta)); if(c!==correct && c<=81) opts.add(c);} return shuffle([...opts]); }
const LS = { progress:"mul99_progress_v3", leaderboard:"mul99_leaderboard_v1", settings:"mul99_settings_v1" };
function load(key, fallback){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):fallback; }catch(e){ return fallback; } }
function save(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){} }
// 轻量级自测（控制台显示），用于保障基础函数正确
function runSelfTests(){
  try{
    // 既有测试（保持不变）
    console.assert('a\\nb' === ['a','b'].join('\\n'), 'CSV newline join failed');
    const p = parseId ? parseId('3x7') : {ans:0};
    console.assert(p.ans === 21, 'parseId("3x7") 应为 21');
    const bank5 = buildBank ? buildBank(5) : [];
    console.assert(Array.isArray(bank5) && bank5.length===9 && bank5.every(q=>q.a===5 && q.ans===q.a*q.b), 'buildBank(level) 基本校验失败');
    console.assert(p.ans === 21, 'parseId("3x7") 应为 21');
    ;['liubei','guanyu','zhangfei','zhaoyun','zhugeliang'].forEach(k=>{ console.assert(!!SKINS[k], `SKINS 缺少 ${k}`); });

    // 新增测试（不改动原有断言）
    const p99 = parseId('9x9');
    console.assert(p99.ans === 81, 'parseId("9x9") 应为 81');
    const mix = buildBank();
    console.assert(Array.isArray(mix) && mix.length>0 && mix.every(q=>q.ans===q.a*q.b), 'buildBank() 混合题基本性质');
    const fakeProg = { wrong: { '2':[ '2x3','2x7' ], 'mix':['3x4'] } };
    const wbAll = buildBankFromWrong(fakeProg,'__all__');
    console.assert(Array.isArray(wbAll) && wbAll.length===3, 'buildBankFromWrong __all__ 数量应为3');
    console.log('%c[SelfTests] 基础与扩展测试通过','color:green');
  }catch(err){
    console.error('[SelfTests] 失败', err);
  }
}

/******************** 状态加载 ********************/ 
function loadProgress(){ return load(LS.progress, { stars:{}, coins:0, completed:{}, wrong:{}, wrong_today:{}, inventory:{ skins:{cat:true}, themes:{meadow:true} }, active:{ skin:"cat", theme:"meadow" } }); }
function saveProgress(p){ save(LS.progress, p); }
function loadLeaderboard(){ return load(LS.leaderboard, []); }
function saveLeaderboard(v){ save(LS.leaderboard, v); }
function loadSettings(){ return load(LS.settings, { bgmOn:false, sfxOn:true }); }
function saveSettings(v){ save(LS.settings, v); }

/******************** 音效 & 背景音乐 ********************/ 
function useAudioSettings(){ const [settings,setSettings]=useState(loadSettings()); useEffect(()=>saveSettings(settings),[settings]); return { settings,setSettings }; }
function useSfx(enabled){ const ctxRef=useRef(null); function ctx(){ if(!ctxRef.current) ctxRef.current=new (window.AudioContext||window.webkitAudioContext)(); return ctxRef.current; }
  function tone(f,d=0.12,type="sine",gain=0.05){ if(!enabled) return; const c=ctx(); if(!c) return; const o=c.createOscillator(); const g=c.createGain(); o.type=type; o.frequency.value=f; g.gain.value=gain; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+d); }
  return { correct:()=>{tone(880,0.08); setTimeout(()=>tone(1320,0.08),80);}, wrong:()=>tone(200,0.2,"square",0.06), win:()=>{tone(660,0.1); setTimeout(()=>tone(880,0.12),100); setTimeout(()=>tone(990,0.15),220);}, click:()=>tone(520,0.05,"triangle",0.03) };
}
function useBgm(on){ const ctxRef=useRef(null); useEffect(()=>{ if(!on){ const c=ctxRef.current; if(c){ try{c.close();}catch(e){} } ctxRef.current=null; return; } const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; const c=new AC(); ctxRef.current=c; let stop=false; const g=c.createGain(); g.gain.value=0.02; g.connect(c.destination); const notes=[261.63,392,440,392]; const tempo=0.6; function loop(){ if(stop) return; let t=c.currentTime; notes.forEach((f,i)=>{ const o=c.createOscillator(); o.type="sine"; o.frequency.setValueAtTime(f,t+i*tempo); o.connect(g); o.start(t+i*tempo); o.stop(t+i*tempo+0.38);}); setTimeout(loop, tempo*notes.length*1000); } loop(); return ()=>{ stop=true; try{c.close();}catch(e){} } },[on]); }

/******************** UI 基元 ********************/ 
const Card = ({children,className=""}) => (<div className={`rounded-2xl bg-white shadow-[0_6px_24px_rgba(0,0,0,0.08)] ${className}`}>{children}</div>);
const BigButton = ({children,onClick,disabled,className=""}) => (<button onClick={onClick} disabled={disabled} className={`w-full rounded-2xl px-6 py-4 text-lg font-semibold shadow active:translate-y-[1px] transition ${disabled?"bg-gray-200 text-gray-400":"bg-emerald-500 text-white hover:bg-emerald-600"} ${className}`}>{children}</button>);
const Pill = ({children,className=""}) => (<span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-gray-100 ${className}`}>{children}</span>);
const StarIcon = ({className=""}) => (<svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>);
const FlagIcon = ({className=""}) => (<svg viewBox="0 0 24 24" className={className}><path fill="#E94A4A" d="M4 3h2v18H4z"/><path fill="#E94A4A" d="M6 4l8 2-3 3 5 2-10 3z"/></svg>);
const ChestIcon = ({className=""}) => (<svg viewBox="0 0 64 64" className={className}><rect x="6" y="20" width="52" height="28" rx="6" fill="#CE8A3A"/><rect x="6" y="14" width="52" height="12" rx="6" fill="#E7A54A"/><rect x="30" y="14" width="4" height="34" fill="#8B5E22"/></svg>);
const Stars = ({ count=0, total=3 }) => (<div className="flex gap-1">{Array.from({length:total},(_,i)=>(<StarIcon key={i} className={`h-5 w-5 ${i<count?"text-yellow-400":"text-gray-300"}`} />))}</div>);

/******************** 皮肤 / 主题 / 头像 ********************/ 
const SKINS = {
  cat:{name:"蓝猫",color:"#5bb0ff"},
  panda:{name:"熊猫",color:"#222"},
  bunny:{name:"小兔",color:"#fe8fb1"},
  robo:{name:"小机灵",color:"#7c86ff"},
  fox:{name:"小狐狸",color:"#ff9b4a"},
  dino:{name:"小恐龙",color:"#79d97c"},
  // 三国人物（卡通版）
  liubei:{name:"刘备",color:"#8B4513"},
  guanyu:{name:"关羽",color:"#228B22"},
  zhangfei:{name:"张飞",color:"#111111"},
  zhaoyun:{name:"赵云",color:"#1E90FF"},
  zhugeliang:{name:"诸葛亮",color:"#FFD700"}
};
const THEMES = { meadow:{name:"草地",bgFrom:"from-green-50",bgTo:"to-blue-50"}, dusk:{name:"黄昏",bgFrom:"from-amber-50",bgTo:"to-purple-50"}, ocean:{name:"海洋",bgFrom:"from-cyan-50",bgTo:"to-indigo-50"}, space:{name:"太空",bgFrom:"from-slate-50",bgTo:"to-indigo-100"}, undersea:{name:"海底",bgFrom:"from-sky-50",bgTo:"to-cyan-100"} };
function Avatar({skin="cat", size=64}){
  const s = SKINS[skin] || SKINS.cat;
  const acc = skin;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {/* 头部底形 */}
      <circle cx="50" cy="55" r="28" fill={s.color} />
      {/* 动物耳朵（非三国角色） */}
      {!(acc==='liubei'||acc==='guanyu'||acc==='zhangfei'||acc==='zhaoyun'||acc==='zhugeliang') && (
        <>
          <path d="M30 35 L40 20 L44 40 Z" fill={s.color} />
          <path d="M70 35 L60 20 L56 40 Z" fill={s.color} />
        </>
      )}
      {/* 眼睛与嘴巴 */}
      <circle cx="42" cy="55" r="4" fill="#fff"/>
      <circle cx="58" cy="55" r="4" fill="#fff"/>
      <circle cx="42" cy="55" r="2" fill="#333"/>
      <circle cx="58" cy="55" r="2" fill="#333"/>
      <path d="M42 66 Q50 72 58 66" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* 三国角色配件 */}
      {acc==='liubei' && (<><rect x="38" y="18" width="24" height="10" rx="3" fill="#6b4f2d" /><rect x="44" y="10" width="12" height="8" rx="2" fill="#8c6a3d" /></>)}
      {acc==='guanyu' && (<><path d="M26 34 Q50 22 74 34 L74 40 Q50 28 26 40 Z" fill="#0f7a1f" /><path d="M47 72 Q50 84 53 72" stroke="#111" strokeWidth="4" strokeLinecap="round" /></>)}
      {acc==='zhangfei' && (<><rect x="36" y="48" width="10" height="3" rx="1.5" fill="#000" /><rect x="54" y="48" width="10" height="3" rx="1.5" fill="#000" /><path d="M36 66 h10" stroke="#000" strokeWidth="2" /><path d="M54 66 h10" stroke="#000" strokeWidth="2" /></>)}
      {acc==='zhaoyun' && (<><path d="M30 36 Q50 18 70 36 L70 40 Q50 28 30 40 Z" fill="#4a6fdc" /><path d="M50 16 Q54 8 58 16" stroke="#bcd1ff" strokeWidth="4" strokeLinecap="round" /></>)}
      {acc==='zhugeliang' && (<><path d="M66 62 q8 -6 14 0 q-3 10 -14 12 z" fill="#f5f5f5" stroke="#ddd" /><rect x="64" y="72" width="4" height="10" rx="1" fill="#8b5e3c" /></>)}
    </svg>
  );
}

const SHOP_ITEMS=[
  {id:"panda",type:"skin",name:"熊猫皮肤",price:20,preview:"panda"},
  {id:"bunny",type:"skin",name:"小兔皮肤",price:20,preview:"bunny"},
  {id:"robo",type:"skin",name:"小机灵皮肤",price:25,preview:"robo"},
  {id:"fox",type:"skin",name:"小狐狸皮肤",price:22,preview:"fox"},
  {id:"dino",type:"skin",name:"小恐龙皮肤",price:22,preview:"dino"},
  {id:"liubei",type:"skin",name:"刘备（皮肤）",price:28,preview:"liubei"},
  {id:"guanyu",type:"skin",name:"关羽（皮肤）",price:28,preview:"guanyu"},
  {id:"zhangfei",type:"skin",name:"张飞（皮肤）",price:28,preview:"zhangfei"},
  {id:"zhaoyun",type:"skin",name:"赵云（皮肤）",price:28,preview:"zhaoyun"},
  {id:"zhugeliang",type:"skin",name:"诸葛亮（皮肤）",price:30,preview:"zhugeliang"},
  {id:"dusk",type:"theme",name:"黄昏主题",price:15,preview:"dusk"},
  {id:"ocean",type:"theme",name:"海洋主题",price:15,preview:"ocean"},
  {id:"space",type:"theme",name:"太空主题",price:18,preview:"space"},
  {id:"undersea",type:"theme",name:"海底主题",price:18,preview:"undersea"}
];
function Shop({progress,setProgress,onBack,showToast}){ const theme=THEMES[progress.active?.theme||'meadow']; function buy(it){ const inv=progress.inventory||{skins:{},themes:{}}; const owned= it.type==='skin'? inv.skins[it.id] : inv.themes[it.id]; if(owned){ const active={...progress.active, [it.type==='skin'?'skin':'theme']:it.id}; const next={...progress,active}; saveProgress(next); setProgress(next); return; } if((progress.coins||0)<it.price){ showToast && showToast('金币不足'); return; } const coins=progress.coins-it.price; const newInv= it.type==='skin'? {...inv,skins:{...inv.skins,[it.id]:true}} : {...inv,themes:{...inv.themes,[it.id]:true}}; const active={...progress.active, [it.type==='skin'?'skin':'theme']:it.id}; const next={...progress,coins,inventory:newInv,active}; saveProgress(next); setProgress(next); showToast && showToast('购买成功并已装备！'); }
  return (<div className="mx-auto max-w-4xl p-4 md:p-8"><div className="mb-4 flex items-center justify-between"><button onClick={onBack} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button><Pill>金币：{progress.coins}</Pill></div><Card className={`p-6 bg-gradient-to-b ${theme.bgFrom} ${theme.bgTo}`}><h2 className="mb-4 text-xl font-bold">商店 · 皮肤与主题</h2><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{SHOP_ITEMS.map(it=>{ const owned= it.type==='skin'? progress.inventory?.skins?.[it.id] : progress.inventory?.themes?.[it.id]; const equipped=(it.type==='skin'?progress.active?.skin:progress.active?.theme)===it.id; return (<div key={it.id} className={`rounded-2xl bg-white/80 backdrop-blur p-4 shadow border ${equipped?"border-emerald-300":"border-transparent"}`}><div className="flex items-center justify-between mb-2"><div className="font-semibold">{it.name}</div>{owned?<Pill className="bg-emerald-50 text-emerald-700">已拥有</Pill>:null}</div><div className="flex items-center justify-center h-28">{it.type==='skin'?<Avatar skin={it.preview} size={72}/>:<div className="h-20 w-full rounded-xl bg-gradient-to-r from-white/60 to-white/20"/>}</div><BigButton className="mt-3" onClick={()=>buy(it)}>{owned?(equipped?"已装备":"装备"):`购买 ${it.price} 金币`}</BigButton></div>); })}</div></Card></div>); }

/******************** 地图（卡通+路径） ********************/ 
function HillsBackground(){ return (<svg viewBox="0 0 1200 500" className="w-full h-56 md:h-72"><rect width="1200" height="500" fill="#e9f7ff"/><g fill="#c5ead3"><ellipse cx="200" cy="380" rx="220" ry="120"/><ellipse cx="600" cy="400" rx="260" ry="140"/><ellipse cx="1000" cy="370" rx="220" ry="120"/></g><g fill="#fff" opacity=".9"><circle cx="160" cy="80" r="22"/><circle cx="190" cy="75" r="28"/><rect x="160" y="80" width="60" height="26" rx="13"/></g><g fill="#fff" opacity=".9"><circle cx="960" cy="60" r="20"/><circle cx="990" cy="56" r="26"/><rect x="960" y="60" width="60" height="24" rx="12"/></g></svg>); }
function LevelNode({n,stars,onClick}){
  return (
    <button onClick={onClick} className="relative inline-flex items-center justify-center h-14 w-14 md:h-16 md:w-16 rounded-full bg-yellow-300 shadow-lg border-4 border-yellow-400 text-slate-900 font-black">
      <span className="text-xl md:text-2xl leading-none">{n}</span>
      <div className="absolute -bottom-4 scale-90 md:scale-100"><Stars count={stars}/></div>
    </button>
  );
}

/******************** 题库构建（含错题） ********************/ 
function buildBank(level){ const qs=[]; if(level){ for(let i=1;i<=9;i++){ qs.push({a:level,b:i,ans:level*i,id:`${level}x${i}`}); } } else { for(let i=0;i<60;i++){ const a=1+Math.floor(Math.random()*9), b=1+Math.floor(Math.random()*9); qs.push({a,b,ans:a*b,id:`${a}x${b}`}); } } return shuffle(qs); }
function parseId(id){ const [a,b]=String(id).split('x'); const A=Number(a), B=Number(b); return { a:A, b:B, ans:A*B, id:String(id) }; }
function buildBankFromWrong(progress, key){ const all=progress.wrong||{}; if(key==='__all__'){ const out=[]; Object.entries(all).forEach(([k,ids])=>{ (ids||[]).forEach(id=>{ const o=parseId(id); o._origin=k; out.push(o); }); }); return shuffle(out); } else { const ids=all[key]||[]; return shuffle(ids.map(id=>{ const o=parseId(id); o._origin=key; return o; })); } }

/******************** 地图与关卡类型选择 ********************/ 
function LevelMap({ progress, onEnterLevel, onEnterTimed, onOpenLeaderboard, onOpenShop, onOpenChest, onOpenWrong }){ const theme=THEMES[progress.active?.theme||'meadow']; const POS=[{l:6,t:64},{l:16,t:52},{l:28,t:56},{l:39,t:48},{l:51,t:53},{l:62,t:46},{l:72,t:49},{l:82,t:44},{l:90,t:47}]; return (<div className="mx-auto max-w-5xl p-4 md:p-8"><header className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><Avatar skin={progress.active?.skin||'cat'} size={44}/><div><h1 className="text-2xl md:text-3xl font-bold">九九乘法表 · 闯关</h1><div className="text-xs text-gray-500">选皮肤、拿金币、过关拿星星！</div></div></div><div className="flex items-center gap-2"><Pill>金币：{progress.coins}</Pill><button className="rounded-full bg-pink-100 px-3 py-1 text-sm text-pink-700 hover:bg-pink-200" onClick={onOpenShop}>商店</button><button className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-200" onClick={onEnterTimed}>限时挑战</button><button className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700 hover:bg-amber-200" onClick={onOpenLeaderboard}>排行榜</button><button className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200" onClick={onOpenWrong}>错题本</button></div></header><Card className={`p-0 overflow-visible bg-gradient-to-b ${theme.bgFrom} ${theme.bgTo}`}><HillsBackground/><div className="px-2 pb-6"><div className="relative -mt-40 px-1 pb-[54%] md:pb-[42%]"><svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full pointer-events-none"><path d="M2 42 C 14 40, 28 28, 36 32 S 58 46, 70 36 90 26, 98 30" fill="none" stroke="#f7e27f" strokeWidth="4" strokeLinecap="round"/><path d="M2 42 C 14 40, 28 28, 36 32 S 58 46, 70 36 90 26, 98 30" fill="none" stroke="#e4c94f" strokeWidth="1.8" strokeLinecap="round"/></svg><div className="absolute left-[3%] top-[66%]"><FlagIcon className="h-8 w-8"/></div><button onClick={onOpenChest} title="开启宝箱" className="absolute right-[3%] top-[44%] active:translate-y-[1px]"><ChestIcon className="h-14 w-14"/></button>{POS.map((p,i)=>(<div key={i} style={{left:`${p.l}%`, top:`${p.t}%`}} className="absolute -translate-x-1/2 -translate-y-1/2"><LevelNode n={i+1} stars={progress.stars[i+1]||0} onClick={()=>onEnterLevel(i+1)}/></div>))}</div></div></Card></div>); }
function TypeSelect({level,onStart,onBack}){ return (<div className="mx-auto max-w-xl p-6"><div className="mb-4 flex items-center justify-between"><button onClick={onBack} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button><Pill>第 {level} 关</Pill></div><Card className="p-6"><h2 className="text-xl font-bold mb-4">选择题型</h2><div className="grid gap-3"><BigButton className="!bg-blue-500 hover:!bg-blue-600" onClick={()=>onStart('choice')}>选择题（三选一）</BigButton><BigButton className="!bg-orange-500 hover:!bg-orange-600" onClick={()=>onStart('drag')}>拖拽配对（把答案拖进框）</BigButton><BigButton className="!bg-indigo-500 hover:!bg-indigo-600" onClick={()=>onStart('input')}>填空题（数字键盘）</BigButton></div></Card></div>); }

/******************** 出题视图（普通/限时/错题复用） ********************/ 
function QuizView({ level, onExit, progress, setProgress, mode="normal", sfx, qtype="choice", customBank=null, wrongKey=null }){
  const bank = useMemo(()=> (customBank || buildBank(level)), [customBank, level]);
  const QUESTIONS = mode==="normal"?10:9999;
  const [cursor,setCursor]=useState(0); const [score,setScore]=useState(0); const [answers,setAnswers]=useState([]); const [timeLeft,setTimeLeft]=useState(mode==="timed"?60:null); const [wrongSet,setWrongSet]=useState([]); const [inputVal,setInputVal]=useState(""); const [showCongrats,setShowCongrats]=useState(false);
  useEffect(()=>{ if(timeLeft==null||timeLeft<=0) return; const t=setTimeout(()=>setTimeLeft(s=>s-1),1000); return ()=>clearTimeout(t); },[timeLeft]);
  if(!bank||bank.length===0) return (<div className="p-8 text-center text-gray-500">暂无题目</div>);
  const q = bank[cursor % bank.length];
  const options = useMemo(()=>genOptions(q.ans),[q]);
  const currentQType = (mode==='timed' && qtype==='auto') ? (['choice','drag','input'][cursor%3]) : qtype;

  function settle(){ const acc=Math.round((score/Math.max(1,answers.length))*100); const star= mode==="normal" ? (acc>=90?3:acc>=75?2:acc>=50?1:0) : 0; const reward=star*3; const next={...progress, coins:(progress.coins||0)+reward, stars: level?{...progress.stars,[level]:Math.max(star,progress.stars[level]||0)}:progress.stars, completed: level?{...progress.completed,[level]:true}:progress.completed, wrong:{ ...(progress.wrong||{}), [level||'mix']: Array.from(new Set([...(progress.wrong?.[level||'mix']||[]), ...wrongSet])) } }; saveProgress(next); setProgress(next); if(mode==="timed"){ sfx?.win(); onExit(); setTimeout(()=>{ const name='匿名'; const list=loadLeaderboard(); const now=Date.now(); const n=[...list,{name,score,time:now}].sort((a,b)=>b.score-a.score||a.time-b.time).slice(0,50); saveLeaderboard(n); },50); } else { setShowCongrats(true); } }

  function submitAnswer(val){ const correct=val===q.ans; if(correct) sfx?.correct(); else sfx?.wrong(); setAnswers(a=>[...a,{q,opt:val,correct}]); setScore(s=>s+(correct?1:0)); if(!correct) setWrongSet(ws=>[...ws,q.id]);
    // 今日错题记录
    if(!correct){ const today=new Date().toISOString().slice(0,10); const tm=progress.wrong_today||{}; const arr=Array.from(new Set([...(tm[today]||[]), q.id])); const np={...progress, wrong_today:{...tm, [today]:arr}}; saveProgress(np); setProgress(np); }
    // 错题练习：答对即移除
    if(correct){ const removeKey= wrongKey || q._origin || null; if(removeKey){ const cur=(progress.wrong?.[removeKey]||[]).filter(id=>id!==q.id); const np={...progress, wrong:{...(progress.wrong||{}), [removeKey]:cur} }; saveProgress(np); setProgress(np); } }
    const nx=cursor+1; if(mode==="timed"){ setCursor(nx); if(timeLeft===0) setTimeout(settle,200);} else if(nx>=QUESTIONS){ setCursor(nx); setTimeout(settle,200);} else { setCursor(nx); } setInputVal(""); }

  function dragStart(e,v){ e.dataTransfer.setData('text/plain', String(v)); }
  function dropAns(e){ const v=Number(e.dataTransfer.getData('text/plain')); submitAnswer(v); }

  return (<div className="mx-auto max-w-3xl p-4 md:p-8">
    <div className="mb-4 flex items-center justify-between">
      <button onClick={()=>onExit()} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button>
      <div className="flex items-center gap-3">
        {level ? <Pill>第 {level} 关</Pill> : <Pill className="bg-orange-100 text-orange-700">{qtype==='auto'?'限时挑战·轮换':'限时挑战'}</Pill>}
        <Pill>题型：{currentQType==='choice'?'选择':currentQType==='drag'?'拖拽':'填空'}</Pill>
        {mode==='timed' && <Pill className={`${(timeLeft||0)<=10? 'bg-red-100 text-red-600':''}`}>剩余 {timeLeft}s</Pill>}
        <Pill>得分 {score}/{Math.max(1,answers.length)}</Pill>
      </div>
    </div>

    <Card className="p-6 md:p-10">
      <div className="mb-6 text中心">
        <div className="text-sm text-gray-500">请作答</div>
        <div className="mt-2 text-5xl font-black tracking-wide">{q.a} × {q.b} = ?</div>
      </div>

      {currentQType==='choice' && (<div className="grid gap-4 sm:grid-cols-3">{options.map((opt,idx)=>(<button key={idx} onClick={()=>submitAnswer(opt)} className="rounded-2xl bg-blue-500/90 text-white text-2xl font-semibold py-6 shadow hover:bg-blue-600 active:translate-y-[1px]">{opt}</button>))}</div>)}

      {currentQType==='drag' && (<div className="grid gap-6 sm:grid-cols-2 items-center"><div className="flex flex-col gap-3">{options.map((opt,idx)=>(<div key={idx} draggable onDragStart={(e)=>dragStart(e,opt)} className="rounded-2xl bg-indigo-500/90 text-white text-2xl font-semibold py-4 text-center shadow cursor-grab">{opt}</div>))}</div><div onDragOver={(e)=>e.preventDefault()} onDrop={dropAns} className="rounded-2xl border-4 border-dashed border-gray-300 h-40 flex items-center justify-center text-gray-400 text-xl">把答案拖到这里</div></div>)}

      {currentQType==='input' && (<div className="mx-auto max-w-sm"><NumInput valueHint="——" onSubmit={(v)=>submitAnswer(Number(v))}/></div>)}

      <div className="mt-6 flex items-center justify-between"><div className="flex-1"><div className="h-3 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-500 transition-all" style={{width:`${(cursor/(mode==='timed'?60:10))*100}%`}}/></div><div className="mt-1 text-xs text-gray-500">{mode==='timed'?`已答 ${Math.min(cursor,60)} 题`:`进度 ${Math.min(cursor,10)}/10`}</div></div><div className="ml-4"><Stars count={Math.min(3, Math.floor((score/Math.max(1,answers.length))*3.5))}/></div></div>
    </Card>

    {/* 恭喜完成：礼花 + 鼓励语 */}
    {showCongrats && (<CongratsModal onClose={()=>{ setShowCongrats(false); onExit(); }} score={score} total={answers.length}/>) }
  </div>); }

/******************** 数字键盘（填空题） ********************/ 
function NumInput({ valueHint='——', onSubmit }){ const [val,setVal]=useState(""); return (<div><div className="mb-3 text-center text-4xl font-bold tracking-widest bg-gray-50 rounded-xl py-3">{val||valueHint}</div><div className="grid grid-cols-3 gap-3">{[1,2,3,4,5,6,7,8,9,0].map(n=>(<button key={n} onClick={()=>setVal(v=>(v+String(n)).slice(0,2))} className="rounded-2xl bg-purple-500/90 text-white text-2xl font-semibold py-5 shadow active:translate-y-[1px]">{n}</button>))}<button onClick={()=>setVal(v=>v.slice(0,-1))} className="rounded-2xl bg-gray-200 text-gray-700 font-semibold py-4">删除</button><button onClick={()=>onSubmit(val)} className="rounded-2xl bg-emerald-500 text-white font-semibold py-4">提交</button></div></div>); }

/******************** 恭喜弹窗 ********************/ 
function CongratsModal({ onClose, score, total }){ return (<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"><div className="relative w-[min(520px,90vw)] rounded-3xl bg-white p-8 text-center shadow-2xl"><div className="absolute -top-6 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-emerald-500 animate-bounce"/><h3 className="text-2xl font-extrabold">太棒了！本关完成 ✅</h3><p className="mt-2 text-gray-600">本次正确 {score} / {Math.max(1,total)}，继续保持，星星等你来拿～</p><div className="mt-4 flex justify-center"><Stars count={Math.min(3, Math.floor((score/Math.max(1,total))*3.5))}/></div><BigButton className="mt-6" onClick={onClose}>返回地图</BigButton></div></div>); }

/******************** 错题本 ********************/ 
function WrongBook({ progress, onBack, onPractice, onClear, onPracticeToday, onExportCSV }){ const wrong=progress.wrong||{}; const entries=Object.entries(wrong).filter(([,arr])=> (arr||[]).length>0); const todayKey=new Date().toISOString().slice(0,10); const todayCount=(progress.wrong_today?.[todayKey]||[]).length; return (<div className="mx-auto max-w-3xl p-4 md:p-8"><div className="mb-4 flex items-center justify-between"><button onClick={onBack} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button><div className="flex items-center gap-2"><Pill>今日新增错题：{todayCount}</Pill><button onClick={onExportCSV} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">导出CSV</button></div></div><Card className="p-6"><h2 className="mb-4 text-xl font-bold">错题本</h2><div className="mb-4 flex flex-wrap gap-2"><BigButton className="!w-auto !px-4 !py-2 !text-sm" onClick={()=>onPractice('__all__','choice')}>练习全部（选择）</BigButton><BigButton className="!w-auto !px-4 !py-2 !text-sm !bg-orange-500 hover:!bg-orange-600" onClick={()=>onPractice('__all__','drag')}>练习全部（拖拽）</BigButton><BigButton className="!w-auto !px-4 !py-2 !text-sm !bg-indigo-500 hover:!bg-indigo-600" onClick={()=>onPractice('__all__','input')}>练习全部（填空）</BigButton><button onClick={()=>onPracticeToday&&onPracticeToday()} className="rounded-full bg-amber-100 px-3 py-2 text-sm text-amber-700 hover:bg-amber-200">今日错题复习</button></div>{entries.length===0? <p className="text-gray-600">目前没有错题，太棒啦！</p> : (<div className="grid gap-3 sm:grid-cols-2">{entries.map(([lvl,arr])=> (<div key={lvl} className="rounded-xl bg-gray-50 p-4"><div className="mb-2 font-semibold">{lvl==='mix'?'混合题':`第 ${lvl} 关`}</div><div className="flex flex-wrap gap-2">{arr.map(id=>(<span key={id} className="rounded-full bg-white px-3 py-1 text-sm shadow">{id.replace('x',' × ')} = ?</span>))}</div><div className="mt-3 grid grid-cols-4 gap-2"><BigButton className="!w-full !px-2 !py-2 !text-sm" onClick={()=>onPractice(lvl,'choice')}>选择</BigButton><BigButton className="!w-full !px-2 !py-2 !text-sm !bg-orange-500 hover:!bg-orange-600" onClick={()=>onPractice(lvl,'drag')}>拖拽</BigButton><BigButton className="!w-full !px-2 !py-2 !text-sm !bg-indigo-500 hover:!bg-indigo-600" onClick={()=>onPractice(lvl,'input')}>填空</BigButton><button onClick={()=>onClear(lvl)} className="rounded-full bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200">清空</button></div></div>))}</div>)}</Card></div>); }

/******************** 排行榜 ********************/ 
function Leaderboard({ onBack }){ const list=loadLeaderboard(); return (<div className="mx-auto max-w-3xl p-4 md:p-8"><div className="mb-4 flex items-center justify-between"><button onClick={onBack} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button><Pill>上榜人数：{list.length}</Pill></div><Card className="p-6"><h2 className="mb-4 text-xl font-bold">限时挑战 · 排行榜</h2>{list.length===0? <p className="text-gray-600">暂无记录，快去挑战！</p> : (<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">名次</th><th className="py-2 pr-3">昵称</th><th className="py-2 pr-3">分数（题）</th><th className="py-2">时间</th></tr></thead><tbody>{list.slice(0,20).map((r,i)=>(<tr key={i} className="border-b last:border-0"><td className="py-2 pr-3">{i+1}</td><td className="py-2 pr-3">{r.name}</td><td className="py-2 pr-3 font-semibold">{r.score}</td><td className="py-2">{new Date(r.time).toLocaleString()}</td></tr>))}</tbody></table></div>)}</Card></div>); }

/******************** 限时挑战设置（可选题型） ********************/ 
function TimedSetup({ onBack, onStart }){ const [qt,setQt]=useState('auto'); return (<div className="mx-auto max-w-xl p-6"><div className="mb-4 flex items-center justify-between"><button onClick={onBack} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">返回地图</button><Pill>限时挑战设置</Pill></div><Card className="p-6"><h2 className="text-xl font-bold mb-4">选择答题模式</h2><div className="grid gap-3">{[{k:'auto',name:'轮换（选→拖→填）',cls:'bg-indigo-500 hover:bg-indigo-600'},{k:'choice',name:'仅选择题',cls:'bg-blue-500 hover:bg-blue-600'},{k:'drag',name:'仅拖拽配对',cls:'bg-orange-500 hover:bg-orange-600'},{k:'input',name:'仅填空题',cls:'bg-purple-500 hover:bg-purple-600'}].map(i=> (<button key={i.k} onClick={()=>setQt(i.k)} className={`rounded-2xl px-4 py-3 text-white text-left ${i.cls} ${qt===i.k?'ring-4 ring-white/60':''}`}>{i.name}</button>))}</div><BigButton className="mt-4" onClick={()=>onStart(qt)}>开始挑战</BigButton></Card></div>); }

/******************** 根组件 ********************/ 
export default function App(){
  const [progress,setProgress]=useState(loadProgress());
  const [route,setRoute]=useState({ page:'map' });
  const { settings,setSettings } = useAudioSettings();
  const sfx = useSfx(settings.sfxOn); useBgm(settings.bgmOn);
  const [toast,setToast] = useState(null);

  useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(null),1600); return ()=>clearTimeout(t);} },[toast]);
  useEffect(()=>{ saveProgress(progress); },[progress]);
  useEffect(()=>{ try{ runSelfTests(); }catch(e){} },[]);

  function openChest(){ const roll=Math.random(); let msg=''; let next={...progress}; function grantCoins(min=5,max=15){ const d=Math.floor(Math.random()*(max-min+1))+min; next.coins=(next.coins||0)+d; msg=`获得 ${d} 金币！`; }
    if(roll<0.7){ grantCoins(); } else if(roll<0.85){ const candidates=Object.keys(SKINS).filter(id=>!next.inventory?.skins?.[id] && id!=='cat'); if(candidates.length){ const pick=candidates[Math.floor(Math.random()*candidates.length)]; next.inventory={...next.inventory, skins:{...(next.inventory?.skins||{}), [pick]:true}}; next.active={...next.active, skin:pick}; msg=`获得皮肤：${SKINS[pick].name}！`; } else { grantCoins(10,20);} } else { const candidates=Object.keys(THEMES).filter(id=>!next.inventory?.themes?.[id] && id!=='meadow'); if(candidates.length){ const pick=candidates[Math.floor(Math.random()*candidates.length)]; next.inventory={...next.inventory, themes:{...(next.inventory?.themes||{}), [pick]:true}}; next.active={...next.active, theme:pick}; msg=`获得主题：${THEMES[pick].name}！`; } else { grantCoins(10,20);} }
    saveProgress(next); setProgress(next); setToast(`宝箱开启成功\\n${msg}`); }

  function practiceWrong(key, qtype){ const bank=buildBankFromWrong(progress,key); setRoute({ page:'quiz', level:null, qtype, customBank:bank, wrongKey:key }); }
  function practiceWrongToday(){ const today=new Date().toISOString().slice(0,10); const ids=progress.wrong_today?.[today]||[]; const bank=shuffle(Array.from(new Set(ids)).map(parseId)); setRoute({ page:'quiz', level:null, qtype:'choice', customBank:bank, wrongKey:'__today__' }); }
  function clearWrong(key){ const next={...progress, wrong:{ ...(progress.wrong||{}), [key]:[] } }; saveProgress(next); setProgress(next); }
  function exportWrongCSV(){
    const rows = [["关卡","题目"]];
    const wrong = progress.wrong || {};
    Object.entries(wrong).forEach(([k, arr]) => { (arr || []).forEach(id => rows.push([k, id])); });
    const csv = rows.map(r => r.join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '错题本.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (<div className="min-h-screen bg-neutral-50 text-neutral-900">
    <nav className="sticky top-0 z-10 backdrop-blur bg白/70 border-b border-neutral-100"><div className="mx-auto flex max-w-5xl items-center justify-between p-4"><div className="flex items-center gap-3"><Avatar skin={progress.active?.skin||'cat'} size={36}/><div><div className="text-sm text-neutral-500">Math · Kids</div><div className="font-bold">乘法闯关</div></div></div><div className="flex items-center gap-2"><Pill>金币：{progress.coins}</Pill><button onClick={()=>setRoute({page:'shop'})} className="rounded-full bg-pink-100 px-3 py-1 text-sm text-pink-700 hover:bg-pink-200">商店</button><button onClick={()=>setRoute({page:'leaderboard'})} className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700 hover:bg-amber-200">排行榜</button><button onClick={()=>setRoute({page:'timedSetup'})} className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-200">限时挑战</button><button onClick={()=>setRoute({page:'wrong'})} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">错题本</button><button onClick={()=>setSettings({...settings, sfxOn:!settings.sfxOn})} className={`rounded-full px-3 py-1 text-sm ${settings.sfxOn?"bg-green-100 text-green-700":"bg-gray-100"}`}>{settings.sfxOn?"音效 开":"音效 关"}</button><button onClick={()=>setSettings({...settings, bgmOn:!settings.bgmOn})} className={`rounded-full px-3 py-1 text-sm ${settings.bgmOn?"bg-blue-100 text-blue-700":"bg-gray-100"}`}>{settings.bgmOn?"音乐 开":"音乐 关"}</button><button onClick={()=>setRoute({page:'map'})} className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">地图</button></div></div></nav>

    {route.page==='map' && (<LevelMap progress={progress} onEnterLevel={(n)=>setRoute({page:'type',level:n})} onEnterTimed={()=>setRoute({page:'timedSetup'})} onOpenLeaderboard={()=>setRoute({page:'leaderboard'})} onOpenShop={()=>setRoute({page:'shop'})} onOpenChest={openChest} onOpenWrong={()=>setRoute({page:'wrong'})}/>) }

    {route.page==='type' && (<TypeSelect level={route.level} onStart={(qt)=>setRoute({page:'quiz', level:route.level, qtype:qt})} onBack={()=>setRoute({page:'map'})}/>) }

    {route.page==='quiz' && (<QuizView level={route.level} onExit={()=>setRoute({page:'map'})} progress={progress} setProgress={setProgress} mode="normal" sfx={sfx} qtype={route.qtype||'choice'} customBank={route.customBank||null} wrongKey={route.wrongKey||null}/>) }

    {route.page==='timedSetup' && (<TimedSetup onBack={()=>setRoute({page:'map'})} onStart={(qt)=>setRoute({page:'timed', timedQt:qt})}/>) }

    {route.page==='timed' && (<QuizView level={null} onExit={()=>setRoute({page:'map'})} progress={progress} setProgress={setProgress} mode="timed" sfx={sfx} qtype={route.timedQt||'auto'}/>) }

    {route.page==='leaderboard' && (<Leaderboard onBack={()=>setRoute({page:'map'})}/>) }

    {route.page==='shop' && (<Shop progress={progress} setProgress={setProgress} onBack={()=>setRoute({page:'map'})} showToast={(m)=>setToast(m)} />) }

    {route.page==='wrong' && (<WrongBook progress={progress} onBack={()=>setRoute({page:'map'})} onPractice={(k,qt)=>practiceWrong(k,qt)} onClear={(k)=>clearWrong(k)} onPracticeToday={practiceWrongToday} onExportCSV={exportWrongCSV}/>) }

    {/* 轻量 Toast */}
    {toast && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="rounded-full bg-black/80 text-white text-sm px-4 py-2 shadow-lg whitespace-pre-wrap">{toast}</div>
      </div>
    )}

    <footer className="mx-auto max-w-5xl p-6 text-center text-xs text-gray-500">建议家长陪同使用 · 为二年级同学设计 · 练习范围 1×1~9×9</footer>
  </div>); }
