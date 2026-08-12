const synonymGroups=[
  ["ai","umela inteligence","chatgpt","copilot","prompt","promptovani","vibecoding","automatizace"],
  ["leadership","vedeni","lider","manazer","management","tym","lidri"],
  ["anglictina","anglicky","english","jazyk","jazyky"],
  ["excel","tabulky","spreadsheet","microsoft excel"],
  ["komunikace","asertivita","zpetna vazba","feedback","vyjednavani","prezentace"],
  ["produktivita","time management","soustredeni","fokus","efektivita","cas"],
  ["stres","psychika","wellbeing","emoce","rovnovaha","klid","vyhoreni"],
  ["obchod","prodej","sales","zakaznik","zakaznicky"],
  ["hr","nabor","personalistika","lidske zdroje","recruitment"],
  ["marketing","reklama","socialni site","seo","znacka","brand"],
  ["pravo","zakon","legislativa","smlouva","gdpr"],
  ["finance","ucetnictvi","rozpocet","investice","penize"],
  ["prezentace","mluveny projev","storytelling","recnik","public speaking"],
  ["podcast","rozhovor","audio"],
  ["nazivo","live","webinar"]
];

const normalize=value=>(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("cs").replace(/[^a-z0-9]+/g," ").trim();
const tokenize=value=>normalize(value).split(" ").filter(token=>token.length>1);
const stem=word=>word.length<5?word:word.replace(/(ovani|oveho|ovymi|ickych|ickou|eni|ami|emi|ovi|ove|ich|eho|ymi|ach|ech|ich|um|ou|y|i|a|e|u)$/u,"");

function distance(a,b){
  if(Math.abs(a.length-b.length)>2)return 3;
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;
    }
  }
  return row[b.length];
}

function courseType(course){
  const title=normalize(course.name);
  if(title.includes("podcast")||normalize(course.flag)==="podcast")return "Podcast";
  if(title.includes("seduo nazivo")||title.includes("nazivo"))return "Seduo naživo";
  return "Videokurz";
}

const state={catalog:null,query:"",filter:"Vše",sort:"relevance",limit:18,df:new Map()};
const $=selector=>document.querySelector(selector),grid=$("#courseGrid"),input=$("#search");

function buildIndex(courses){
  const df=new Map();
  courses.forEach((course,index)=>{
    course._index=index;course._type=courseType(course);course._title=normalize(course.name);course._words=tokenize(course.name);course._stems=course._words.map(stem);
    new Set(course._words).forEach(word=>df.set(word,(df.get(word)||0)+1));
  });
  state.df=df;
}

function relatedTerms(query){
  const normalized=normalize(query),terms=new Set();
  synonymGroups.forEach(group=>{
    if(group.some(term=>normalized.includes(term)))group.forEach(term=>tokenize(term).forEach(token=>terms.add(token)));
  });
  tokenize(query).forEach(token=>terms.delete(token));
  return [...terms];
}

function evaluate(course,rawQuery){
  const query=normalize(rawQuery);
  if(!query)return {score:1,reason:"",matched:[]};
  const tokens=tokenize(query),related=relatedTerms(query),matched=[],fuzzy=[];
  let score=0;
  if(course._title===query){score+=1400;matched.push("přesný název");}
  else if(course._title.startsWith(query)){score+=900;matched.push("začátek názvu");}
  else if(course._title.includes(query)){score+=650;matched.push("celá fráze v názvu");}

  let covered=0;
  tokens.forEach(token=>{
    const idf=Math.log((state.catalog.courses.length+1)/((state.df.get(token)||0)+1))+1;
    const tokenStem=stem(token);
    if(course._words.includes(token)){score+=150*idf;covered++;matched.push(token);return;}
    if(course._stems.includes(tokenStem)){score+=115*idf;covered++;matched.push(token);return;}
    if(course._words.some(word=>word.startsWith(token)||token.startsWith(word))){score+=85*idf;covered++;matched.push(token);return;}
    const similar=course._words.find(word=>token.length>=4&&distance(word,token)<=1);
    if(similar){score+=48*idf;covered++;fuzzy.push(similar);}
  });

  let synonymHit="",synonymHits=0;
  related.forEach(term=>{if(course._title.includes(term)){score+=75;synonymHits++;synonymHit=synonymHit||term;}});
  if(tokens.length&&covered===tokens.length)score+=360;
  else if(!synonymHits)score-=120*(tokens.length-covered);

  const asksPodcast=tokens.includes("podcast")||tokens.includes("rozhovor");
  const asksLive=tokens.includes("nazivo")||tokens.includes("webinar")||tokens.includes("live");
  const asksCourse=tokens.includes("kurz")||tokens.includes("videokurz");
  if(asksPodcast&&course._type==="Podcast")score+=420;
  if(asksLive&&course._type==="Seduo naživo")score+=420;
  if(asksCourse&&course._type==="Videokurz")score+=180;

  let reason="Příbuzné téma";
  if(matched.includes("přesný název"))reason="Přesná shoda názvu";
  else if(matched.includes("celá fráze v názvu")||matched.includes("začátek názvu"))reason="Silná shoda v názvu";
  else if(covered===tokens.length&&tokens.length)reason=`Odpovídá ${tokens.length===1?"hledanému výrazu":"všem slovům dotazu"}`;
  else if(fuzzy.length)reason=`Podobný výraz: ${fuzzy[0]}`;
  else if(synonymHit)reason=`Příbuzné téma: ${synonymHit}`;
  return {score,reason,matched:[...new Set(matched.filter(item=>!item.includes("název")))]};
}

function baseResults(){
  if(!state.catalog)return [];
  return state.catalog.courses.map(course=>({course,...evaluate(course,state.query)})).filter(item=>!state.query||item.score>0);
}

function filterCounts(items){
  return {
    "Vše":items.length,
    "Videokurzy":items.filter(item=>item.course._type==="Videokurz").length,
    "Podcasty":items.filter(item=>item.course._type==="Podcast").length,
    "Naživo":items.filter(item=>item.course._type==="Seduo naživo").length,
    "Novinky":items.filter(item=>item.course.flag==="Novinka").length
  };
}

function results(){
  let items=baseResults();
  if(state.filter==="Videokurzy")items=items.filter(item=>item.course._type==="Videokurz");
  if(state.filter==="Podcasty")items=items.filter(item=>item.course._type==="Podcast");
  if(state.filter==="Naživo")items=items.filter(item=>item.course._type==="Seduo naživo");
  if(state.filter==="Novinky")items=items.filter(item=>item.course.flag==="Novinka");
  if(state.sort==="az")items.sort((a,b)=>a.course.name.localeCompare(b.course.name,"cs"));
  else if(state.sort==="newest"||!state.query)items.sort((a,b)=>a.course._index-b.course._index);
  else items.sort((a,b)=>b.score-a.score||a.course._index-b.course._index);
  return items;
}

function resultLabel(index,item){
  if(!state.query)return "";
  if(index===0&&item.score>=500)return "Nejlepší shoda";
  if(item.score>=500)return "Velmi relevantní";
  if(item.score>=220)return "Relevantní";
  return "Související";
}

function card(item,index){
  const {course,reason,matched}=item;
  const a=document.createElement("a");a.className="courseCard resultCard";a.href=course.url;a.target="_blank";a.rel="noreferrer";
  const visual=document.createElement("div");visual.className=`courseVisual visual${course._type==="Podcast"?2:course._type==="Seduo naživo"?3:(course._index%6)+1}`;
  const type=document.createElement("span");type.className="typePill";type.textContent=course._type;
  const number=document.createElement("b");number.textContent=String(index+1).padStart(2,"0");
  const arrow=document.createElement("i");arrow.textContent="↗";arrow.setAttribute("aria-hidden","true");visual.append(type,number,arrow);
  const body=document.createElement("div");body.className="courseBody";
  const meta=document.createElement("div");meta.className="cardMeta";
  if(state.query){const relevance=document.createElement("span");relevance.className="relevancePill";relevance.textContent=resultLabel(index,item);meta.append(relevance);}
  if(course.flag&&course.flag!==course._type){const flag=document.createElement("span");flag.className="flagPill";flag.textContent=course.flag;meta.append(flag);}
  const name=document.createElement("p");name.className="courseName";name.textContent=course.name;
  const why=document.createElement("p");why.className="matchReason";why.textContent=state.query?`${reason}${matched.length?` · ${matched.slice(0,3).join(", ")}`:""}`:`Typ obsahu: ${course._type}`;
  const link=document.createElement("span");link.className="courseLink";link.textContent="Otevřít na Seduo.cz ↗";
  body.append(meta,name,why,link);a.append(visual,body);return a;
}

function syncUrl(){
  const url=new URL(location.href);state.query?url.searchParams.set("q",state.query):url.searchParams.delete("q");state.filter!=="Vše"?url.searchParams.set("typ",state.filter):url.searchParams.delete("typ");history.replaceState({},"",url);
}
function countLabel(n){return n===1?"výsledek":n>=2&&n<=4?"výsledky":"výsledků"}
function render({sync=true}={}){
  const base=baseResults(),counts=filterCounts(base),items=results();
  $("#mode").textContent=state.query?"Výsledky hledání":"Procházet katalog";
  $("#heading").textContent=state.query?`Nejlepší shody pro „${state.query}“`:"Aktuální kurzy na Seduo";
  $("#count").textContent=items.length;$("#countLabel").textContent=countLabel(items.length);
  document.querySelectorAll(".filters button").forEach(button=>{button.classList.toggle("active",button.dataset.filter===state.filter);button.querySelector("span").textContent=counts[button.dataset.filter]||0;});
  grid.classList.toggle("isSearch",!!state.query);grid.replaceChildren(...items.slice(0,state.limit).map(card));
  $("#empty").hidden=items.length!==0;grid.hidden=items.length===0;$("#loadMore").hidden=items.length<=state.limit;$("#clear").hidden=!state.query;$("#shortcut").hidden=!!state.query;
  if(sync)syncUrl();
}

document.querySelectorAll(".filters button").forEach(button=>button.addEventListener("click",()=>{state.filter=button.dataset.filter;state.limit=18;render()}));
document.querySelectorAll(".quickRow button").forEach(button=>button.addEventListener("click",()=>{state.query=button.textContent;state.filter="Vše";state.sort="relevance";state.limit=18;input.value=state.query;$("#sort").value="relevance";render();input.focus()}));
input.addEventListener("input",()=>{state.query=input.value;state.sort="relevance";state.limit=18;$("#sort").value="relevance";render()});
$("#sort").addEventListener("change",event=>{state.sort=event.target.value;render()});
$("#clear").addEventListener("click",()=>{state.query="";input.value="";render();input.focus()});
$("#reset").addEventListener("click",()=>{state.query="";state.filter="Vše";input.value="";render()});
$("#loadMore").addEventListener("click",()=>{state.limit+=18;render()});
window.addEventListener("keydown",event=>{if(event.key==="/"&&document.activeElement!==input){event.preventDefault();input.focus()}if(event.key==="Escape"){state.query="";input.value="";render();input.blur()}});
window.addEventListener("popstate",()=>{const params=new URLSearchParams(location.search);state.query=params.get("q")||"";state.filter=params.get("typ")||"Vše";input.value=state.query;render({sync:false})});

fetch("courses.json").then(response=>response.json()).then(data=>{
  state.catalog=data;buildIndex(data.courses);
  const params=new URLSearchParams(location.search);state.query=params.get("q")||"";state.filter=params.get("typ")||"Vše";input.value=state.query;
  $("#total").textContent=data.total_count;$("#updated").textContent=`Index aktualizován ${new Intl.DateTimeFormat("cs-CZ",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Prague"}).format(new Date(data.observed_at))}`;render({sync:false});
}).catch(()=>{$("#updated").textContent="Index se nepodařilo načíst";render({sync:false})});
