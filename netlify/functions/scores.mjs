// Smash the Tables high scores: GET returns the top 20, POST {n:"Chloe T", s:540} adds one.
// (Older copies of the game may still send 3 initials as {i:"ABC"}; those are still accepted.)
// Stored as one small JSON list in Netlify Blobs (store "scores", key "top").
import { getStore } from "@netlify/blobs";

const MAX_SCORE = 2000;  // room for up to 20 levels x 100 (the game has 9 now and more are coming)
const KEEP = 50;         // keep a few extra so the top 20 stays full if entries are removed
const BAD = new Set(["ASS","FUK","FUC","FUQ","FCK","FKU","SHT","CUM","KKK","NIG","NGR","NGA","DIK","DIC","COK","FAG","TIT","VAG","SEX","JIZ","CNT","KYS","NAZ","HOE","WTF","PUS","POO","PEE","GAY","SUK","SUX","XXX","DAM","GOD","JEW","RAP","PIS","POS","STD","ANL","ANS","BCH","BJS","SOB","BUM","HIV","LSD","THC"]);
/* ---- high-score name check: first name + last initial, e.g. "Chloe T." ----
   Same code runs in the game (instant feedback) and on the score server (the final word).
   1) format: first name 2-12 letters (a hyphen or apostrophe inside is fine), last initial 1 letter
   2) the name is flattened before checking: lowercase, number/symbol swaps undone (sh1t, $hit, @ss),
      everything but letters dropped (f.u.c.k), and repeated letters squeezed (fuuuck)
   3) ROOTS are blocked anywhere in the name, and also across first name + initial joined (Fuc + K).
      They are chosen so they do not hide inside real names.
   4) WHOLE words are blocked only when they are the entire first name, because they do sit inside
      real names (ass in Cassandra, hoe in Phoebe, nazi in Nazir, anal in Analise, tit in Titus). */
var NAME_ROOTS=['fuck','fck','fvck','fvk','phuk','phuck','bullshit','shithead','shitface','shitty','cunt','nigg','fagg','bitch','biatch','whore','slut','penis','vagina','dildo','jizz','wank','twat','hitler','retard','molest','pedo','pussy','asshole','asshl','ashole','azzhole','arsehole','btch','bastard','douche','skank','rapist','orgasm','blowjob','handjob','cumshot','tittie','titty','motherf','milf','dickhead','cocksuck','jackoff','jerkoff','buttplug','nutsack','scrotum','testicle','clitor','fellat','horny','sexy','porno','hentai','incest','bestial','beaner','wetback','chink','gook','raghead','towelhead','kkk'];
var NAME_WHOLE=['ass','arse','anus','anal','butt','butts','poop','poo','pee','fart','turd','crap','damn','hell','piss','puke','shit','sht','shyt','fuk','fuq','fuc','dick','cock','cum','sex','tit','tits','boob','boobs','hoe','fag','nig','niga','nigr','nazi','spic','kike','coon','dyke','tranny','porn','semen','nude','naked','balls','nuts','wtf','stfu','kys','pp','weiner','wiener','schlong','knob','prick','thot','simp','idiot','stupid','dumb','loser','ugly','fatso','moron','rape','rapist','pedo','kunt','kkk'];
function nameFlat(s){
 var map={'0':'o','1':'i','!':'i','|':'l','3':'e','4':'a','@':'a','5':'s','$':'s','7':'t','+':'t','8':'b','9':'g','6':'g','2':'z'};
 s=String(s||'').toLowerCase().replace(/[01!|34@5$7+8962]/g,function(c){return map[c];});
 return s.replace(/[^a-z]/g,'');
}
function nameSqueeze(s){return s.replace(/(.)\1+/g,'$1');}
function nameProblem(first,last){   /* returns '' when OK, or a short reason */
 first=String(first||'').trim();last=String(last||'').trim();
 if(!/^[A-Za-z][A-Za-z'-]{0,10}[A-Za-z]$/.test(first))return 'format';
 if(!/^[A-Za-z]$/.test(last))return 'format';
 var f=nameFlat(first),fs=nameSqueeze(f),both=f+nameFlat(last),bs=nameSqueeze(both);
 if(NAME_WHOLE.indexOf(f)>=0||NAME_WHOLE.indexOf(fs)>=0)return 'word';
 for(var i=0;i<NAME_ROOTS.length;i++){var r=NAME_ROOTS[i];if(f.indexOf(r)>=0||fs.indexOf(r)>=0||both.indexOf(r)>=0||bs.indexOf(r)>=0)return 'word';}
 return '';
}
function nameTidy(first,last){   /* "chLOE","t" -> "Chloe T" (hyphen/apostrophe parts each capitalized) */
 first=String(first).trim().toLowerCase().replace(/(^|[-'])([a-z])/g,function(m,a,b){return a+b.toUpperCase();});
 return first+' '+String(last).trim().toUpperCase();
}

const headers = { "content-type": "application/json", "cache-control": "no-store" };
const sortTop = (l) => l.sort((a, b) => b.s - a.s || a.t - b.t);

export default async (req) => {
  const store = getStore({ name: "scores", consistency: "strong" });
  let list = (await store.get("top", { type: "json" })) || [];

  if (req.method === "GET") return new Response(JSON.stringify(sortTop(list).slice(0, 20)), { headers });

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response('{"error":"bad json"}', { status: 400, headers }); }
    const s = Number(body?.s);
    if (!Number.isInteger(s) || s < 0 || s > MAX_SCORE) return new Response('{"error":"score"}', { status: 400, headers });
    let row;
    if (body?.n !== undefined) {                       // first name + last initial
      const m = /^(\S+) (\S)$/.exec(String(body.n).trim());
      if (!m || nameProblem(m[1], m[2])) return new Response('{"error":"name"}', { status: 400, headers });
      row = { n: nameTidy(m[1], m[2]), s, t: Date.now() };
    } else {                                           // older game copies: 3 initials
      const i = String(body?.i ?? "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(i) || BAD.has(i)) return new Response('{"error":"initials"}', { status: 400, headers });
      row = { i, s, t: Date.now() };
    }
    list.push(row);
    list = sortTop(list).slice(0, KEEP);
    await store.setJSON("top", list);
    return new Response(JSON.stringify(list.slice(0, 20)), { headers });
  }

  return new Response('{"error":"method"}', { status: 405, headers });
};

export const config = { path: "/api/scores" };
