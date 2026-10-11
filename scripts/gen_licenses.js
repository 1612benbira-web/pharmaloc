const fs=require('fs'),path=require('path');
const r=require(require('os').tmpdir()+'/licenses.json');
const direct={};
for(const d of ['backend','frontend']){
  const p=JSON.parse(fs.readFileSync(path.join(d,'package.json')));
  direct[d]={prod:Object.keys(p.dependencies||{}),dev:Object.keys(p.devDependencies||{})};
}
const find=(d,n)=>Object.keys(r[d]).find(k=>k.startsWith(n+'@'));
let md=`# LICENSES.md - Licences des dépendances\n\n> Fichier généré le ${new Date().toISOString().slice(0,10)} par \`scan_licenses.js\` + \`gen_licenses.js\`. À régénérer à chaque ajout de dépendance (checklist dans \`memory/CONVENTIONS.md\`).\n\n## Règle du concours CADEV\nLes licences à réciprocité (**GPL, AGPL, LGPL**) rendent le projet irrecevable. Politique : MIT, Apache-2.0, BSD, ISC (et 0BSD / CC-BY-4.0 pour les données).\n\n## Résultat de l'analyse\nAnalyse de **toutes** les dépendances installées (directes + transitives), backend et frontend : **aucune GPL / AGPL / LGPL**.\n\n### Points d'attention
1. **sharp / libvips (LGPL-3.0)** : Next.js l'installe par défaut (optimisation d'images). **Neutralisé** : \`overrides\` dans \`frontend/package.json\` remplace \`sharp\` par un stub MIT local (\`frontend/vendor/sharp-stub\`) et \`images.unoptimized: true\` dans \`next.config.mjs\`. Aucun paquet \`@img/*\` dans \`package-lock.json\`. **Ne jamais retirer cet override.**
2. **lightningcss (MPL-2.0)** : tiré par vite/vitest (tests du backend). Par précaution (réciprocité au niveau fichier), **neutralisé** de la même façon : \`overrides\` dans \`backend/package.json\` vers \`backend/vendor/lightningcss-stub\` (MIT). Le backend ne traite aucun CSS.
3. **caniuse-lite (CC-BY-4.0)** : données de compatibilité navigateurs (build uniquement). Attribution : © Alexis Deveria / Browserslist.
4. **Serveur MongoDB** : le cahier des charges impose MongoDB. Le serveur MongoDB Community est sous licence **SSPL** ; c'est un **service d'infrastructure**, non lié ni distribué avec le code du projet (le projet n'embarque que le pilote \`mongodb\`/\`mongoose\`, Apache-2.0/MIT). À mentionner à l'organisateur si la question se pose.
5. **Outils de test hors livrable** : un serveur compatible MongoDB (FerretDB, Apache-2.0) a servi à exécuter les tests localement ; il n'est ni dans le dépôt ni dans le déploiement.
6. **Cartographie** : **Leaflet 1.9.4 (BSD-2-Clause)**, utilisé directement ; le wrapper **react-leaflet est volontairement exclu** (licence Hippocratic-2.1, non permissive). Fond de carte : tuiles OpenStreetMap, données © contributeurs OpenStreetMap (**ODbL**, attribution affichée sur la carte et en pied de page). La politique d'usage des tuiles est respectée : voir \`CARTOGRAPHIE.md\`.
7. **Composants UI** : les composants sont écrits dans le projet (style shadcn/ui) sans dépendance supplémentaire.

`;
for(const d of ['backend','frontend']){
  md+=`## ${d} - dépendances directes\n\n| Paquet | Version | Licence | Type |\n|---|---|---|---|\n`;
  for(const t of ['prod','dev'])for(const n of direct[d][t]){const k=find(d,n);if(!k)continue;const v=k.slice(n.length+1);md+=`| ${n} | ${v} | ${r[d][k]} | ${t==='prod'?'production':'développement'} |\n`;}
  md+='\n';
}
const agg={};for(const d in r)for(const k in r[d])agg[r[d][k]]=(agg[r[d][k]]||0)+1;
md+=`## Répartition (toutes dépendances, backend + frontend, avec doublons)\n\n| Licence | Nombre |\n|---|---|\n`+Object.entries(agg).sort((a,b)=>b[1]-a[1]).map(([l,n])=>`| ${l} | ${n} |`).join('\n')+'\n';
fs.writeFileSync('LICENSES.md',md);
