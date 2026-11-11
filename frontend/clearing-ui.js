// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
const pieceNames = {
  sawmill: '锯木厂', workshop: '工坊', recruiter: '征兵所', roost: '鸟巢',
  keep: '城堡', wood: '木材', ruin: '废墟',
  'garden-fox':'狐狸花园','garden-rabbit':'兔子花园','garden-mouse':'老鼠花园',sympathy: '民意', 'base-fox': '狐狸基地', 'base-rabbit': '兔子基地', 'base-mouse': '老鼠基地',
};
const suitNames = { fox: '狐狸', rabbit: '兔子', mouse: '老鼠' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
));

function image(source, alt, className = '') {
  return `<img src="${escape(source)}" alt="${escape(alt)}" class="${className}" draggable="false">`;
}

export function clearingLabel(area) {
  const pieces = area.buildings.map(building => pieceNames[building.type]);
  if (area.keep) pieces.push('城堡');
  const free = area.slots - area.buildings.length - (area.ruins || 0);
  return `${area.name}，猫 ${area.warriors.cat}，鹰 ${area.warriors.bird}，${area.warriors.alliance!==undefined?'联盟 '+area.warriors.alliance+'，':''}${area.warriors.lizard!==undefined?'蜥蜴 '+area.warriors.lizard+'，':''}${area.vagabond?'游侠在此，':''}${area.sympathy?'民意，':''}${pieces.join('，')}，木材 ${area.wood}，${suitNames[area.suit]}，建筑格 ${area.slots}，空格 ${free}`;
}

export function clearingContents(area, art) {
  const units = ['cat', 'bird', 'alliance', 'lizard'].filter(faction => area.warriors[faction] > 0).map(faction => (
    `<span class="clearing-unit ${faction}" title="${{cat:'猫咪贵族',bird:'飞鹰王朝',alliance:'森林联盟',lizard:'蜥蜴神教'}[faction]} ${area.warriors[faction]} 名士兵">` +
    image(art.units[faction], {cat:'猫士兵',bird:'鹰士兵',alliance:'联盟士兵',lizard:'蜥蜴士兵'}[faction]) +
    `<span class="unit-number">${area.warriors[faction]}</span></span>`
  )).join('');
  const slots = Array.from({ length: area.slots }, (_, index) => {
    const type = index < area.buildings.length ? area.buildings[index].type
      : index < area.buildings.length + (area.ruins || 0) ? 'ruin' : null;
    const name = type ? pieceNames[type] : '空建筑格';
    return `<span class="building-slot ${type ? 'occupied' : 'vacant'}" data-piece="${type || 'empty'}" title="${name}" aria-label="${name}">` +
      (type ? image(art.symbols[type], name) : '') + '</span>';
  }).join('');
  const tokens = [area.keep ? 'keep' : null, area.wood ? 'wood' : null, area.sympathy ? 'sympathy' : null].filter(Boolean).map(type => (
    `<span class="clearing-token ${type}" title="${pieceNames[type]}${type === 'wood' ? ' '+area.wood : ''}">` +
    image(art.symbols[type], pieceNames[type]) +
    (type === 'wood' ? `<span class="unit-number">${area.wood}</span>` : '') + '</span>'
  )).join('');
  return `<span class="clearing-number">${area.id}</span>` +
    (area.ruler?`<span class="clearing-ruler ${escape(area.ruler)}" title="控制者 ${escape({cat:'猫咪贵族',bird:'飞鹰王朝',alliance:'森林联盟',lizard:'蜥蜴神教'}[area.ruler])}" aria-label="控制者 ${escape({cat:'猫咪贵族',bird:'飞鹰王朝',alliance:'森林联盟',lizard:'蜥蜴神教'}[area.ruler])}">${image(art.units[area.ruler], '控制者')}</span>`:'') +
    `<span class="clearing-suit" title="${suitNames[area.suit]}林地">${image(art.suits[area.suit], suitNames[area.suit]+'林地')}</span>` +
    `<span class="clearing-units">${units}${area.vagabond?`<span class="clearing-pawn" title="神秘游侠">${image(art.symbols.vagabond,'游侠棋子')}</span>`:''}</span><span class="clearing-slots">${slots}</span>` +
    `<span class="clearing-tokens">${tokens}</span>`;
}
