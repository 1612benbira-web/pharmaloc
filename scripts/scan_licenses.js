const fs=require('fs'),path=require('path');
function scan(dir){
  const nm=path.join(dir,'node_modules'),out={};
  const walk=(base)=>{ for(const n of fs.readdirSync(base)){
    if(n.startsWith('.'))continue; const p=path.join(base,n);
    if(n.startsWith('@')){walk(p);continue;}
    const pj=path.join(p,'package.json'); if(!fs.existsSync(pj))continue;
    const j=JSON.parse(fs.readFileSync(pj,'utf8'));
    let l=j.license||(j.licenses&&j.licenses.map(x=>x.type).join(' OR '))||'UNKNOWN'; if(typeof l==='object')l=l.type;
    out[j.name+'@'+j.version]=String(l);
  }};
  walk(nm); return out;
}
const res={};for(const d of ['backend','frontend']) res[d]=scan(d);
const agg={};
for(const d in res)for(const k in res[d]){agg[res[d][k]]=(agg[res[d][k]]||0)+1;}
console.log(JSON.stringify(agg,null,1));
const bad=[];for(const d in res)for(const k in res[d])if(/GPL|AGPL|LGPL|SSPL|UNKNOWN|UNLICENSED/i.test(res[d][k]))bad.push(d+': '+k+' => '+res[d][k]);
console.log('A VERIFIER:',bad);
fs.writeFileSync(require('os').tmpdir()+'/licenses.json',JSON.stringify(res));
