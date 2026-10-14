// Display only the accepted current source membership. No date filter or archive.
function filterCurrentBets(rows, lists) {
  const sourceRoots={'16':['188hot.net'],'98':['hyp98.com'],'喜':['kd998.net'],'喜代':['cj3688.com'],
    '28':['bnd139.com'],'海勝':['umh693.com'],'海勝2':['and539.com'],'風雲':['vs968.net'],'航海':['pee688.com','amc283.com']};
  const selected = new Map();
  const knownRoots=new Set(Object.values(sourceRoots).flat());
  for (const list of Array.isArray(lists) ? lists : []) {
    if (!list || list.complete !== true || list.scope !== 'all' || typeof list.clientSite !== 'string' ||
        typeof list.account !== 'string' || !Number.isFinite(Date.parse(list.capturedAt)) || !Number.isFinite(Date.parse(list.lastSeen)) ||
        !Array.isArray(list.ids) || !list.ids.every(id=>typeof id==='string' && id.startsWith(`${list.clientSite}|${list.account}|`)) ||
        new Set(list.ids).size !== list.ids.length) continue;
    const parts=list.clientSite.split('|');if(parts.length!==2)continue;
    const previous=selected.get(parts[1]);
    if(!previous || list.lastSeen>previous.lastSeen || (list.lastSeen===previous.lastSeen && list.capturedAt>previous.capturedAt))
      selected.set(parts[1],{...list,allowed:new Set(list.ids)});
  }
  return rows.filter(row=>{
    const ids=[row.id,...(Array.isArray(row.ids)?row.ids:[])].filter(id=>typeof id==='string');
    const key=String(row.id||'').split('|');
    const oldRoot=key[0].split('.').slice(-2).join('.');
    const root=knownRoots.has(key[1])?key[1]:knownRoots.has(oldRoot)?oldRoot:null;
    const matchingRoots=(sourceRoots[row.source]||[]).filter(value=>selected.has(value));
    const list=root?selected.get(root):(matchingRoots.length===1?selected.get(matchingRoots[0]):null);
    return !list || ids.some(id=>list.allowed.has(id));
  });
}
