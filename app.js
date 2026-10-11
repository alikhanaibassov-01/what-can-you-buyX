import { items, categories } from './catalog.js';

const STORAGE_KEY = 'what-can-you-buy:v1';
const budgets = [1000000, 1000000000, 100000000000, 1000000000000];
const byId = new Map(items.map(item => [item.id, item]));
const $ = selector => document.querySelector(selector);
const format = value => '$' + new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(value).replaceAll('\u00a0',' ');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value).toLocaleLowerCase('ru').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const icons = {
  minus:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"/></svg>',
  plus:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M10 5v10"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  bag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7-1 14h16L19 7H5Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>'
};
let state = load();
let category = 'all';
let query = '';
let sort = 'original';
let proposedBudget = state.initial;
let toastTimer;
let storageWarningShown = false;
const quantities = new Map();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !budgets.includes(saved.initial) || typeof saved.inventory !== 'object' || !saved.inventory) throw Error();
    const inventory = {};
    let spent = 0;
    for (const [key, amount] of Object.entries(saved.inventory)) {
      const item = byId.get(Number(key));
      if (!item || !Number.isSafeInteger(amount) || amount <= 0) throw Error();
      inventory[item.id] = amount;
      spent += item.price * amount;
    }
    if (!Number.isSafeInteger(spent) || spent > saved.initial) throw Error();
    return {initial:saved.initial, inventory};
  } catch { return {initial:100000000000, inventory:{}}; }
}
function totals() {
  let spent = 0, count = 0;
  for (const [key, amount] of Object.entries(state.inventory)) { spent += byId.get(Number(key)).price * amount; count += amount; }
  return {spent,count,balance:state.initial-spent};
}
function save() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  catch {
    if (!storageWarningShown) { storageWarningShown = true; setTimeout(() => toast('Браузер не разрешил сохранение. Игра работает до закрытия страницы.'),1600); }
  }
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'),3000);
}
function noun(count, forms) { const n = count % 100; return forms[n>10 && n<20 ? 2 : count%10 === 1 ? 0 : count%10>=2 && count%10<=4 ? 1 : 2]; }
function quantity(id) { return quantities.get(id) || 1; }
function visibleItems() {
  const words = query.split(/\s+/).filter(Boolean);
  let result = items.filter(item => (category==='all' || category===item.category) && words.every(word=>normalize(`${item.name} ${item.description} ${item.keywords}`).includes(word)));
  if(sort==='asc') result.sort((a,b)=>a.price-b.price || a.id-b.id);
  if(sort==='desc') result.sort((a,b)=>b.price-a.price || a.id-b.id);
  if(sort==='owned') result.sort((a,b)=>(state.inventory[b.id]||0)-(state.inventory[a.id]||0) || a.id-b.id);
  return result;
}
function renderCategories() {
  $('#categories').innerHTML = categories.map(([id,name])=>`<button class="category" data-category="${id}" aria-pressed="${id===category}">${name}</button>`).join('');
}
function renderProducts() {
  const results = visibleItems();
  const {balance} = totals();
  $('#result-count').textContent = category === 'all' && !query ? '56 вещей. Без ограничений.' : `${results.length} ${noun(results.length,['вещь','вещи','вещей'])} в твоём списке.`;
  $('#empty-results').hidden = results.length > 0;
  $('#products').innerHTML = results.map((item,index) => {
    const amount = quantity(item.id), owned = state.inventory[item.id] || 0;
    const affordable = item.price * amount <= balance;
    return `<article class="product" data-id="${item.id}">
      <div class="product-media ${item.contain?'contain':''}"><img src="${escape(item.image)}" alt="${escape(item.photoAlt || item.name)}" width="640" height="480" loading="${index<4?'eager':'lazy'}" decoding="async">
      <button class="info-button" data-action="info" aria-label="Информация: ${escape(item.name)}">i</button>
      ${owned?`<span class="owned-badge">В коллекции: ${owned}</span>`:''}
      ${item.imageCaption?`<span class="image-caption">${escape(item.imageCaption)}</span>`:''}</div>
      <h3>${escape(item.name)}</h3><p class="description">${escape(item.description)}</p><strong class="price">${format(item.price)}</strong>
      <div class="product-actions"><div class="quantity"><button data-action="minus" aria-label="Уменьшить количество: ${escape(item.name)}" ${amount<=1?'disabled':''}>${icons.minus}</button><input type="number" inputmode="numeric" min="1" max="9999" value="${amount}" aria-label="Количество: ${escape(item.name)}"><button data-action="plus" aria-label="Увеличить количество: ${escape(item.name)}" ${amount>=9999?'disabled':''}>${icons.plus}</button></div><button class="buy-button" data-action="buy" ${affordable?'':'disabled'} aria-label="Купить ${escape(item.name)}: ${amount} шт. за ${format(item.price*amount)}">${affordable?'Купить':'Не хватает'}${affordable?icons.arrow:''}</button></div>
    </article>`;
  }).join('');
}
function renderWallet() {
  const {spent,count,balance} = totals();
  $('#balance').textContent = format(balance);
  $('#spent').textContent = format(spent);
  $('#collection-count').textContent = count;
  $('#purchase-count').textContent = `${count} ${noun(count,['покупка','покупки','покупок'])}`;
  $('#header-balance').textContent = format(balance);
  $('#budget').value = state.initial;
  $('#progress').style.width = `${balance/state.initial*100}%`;
  $('.progress-track').setAttribute('aria-valuenow',String(Math.round(balance/state.initial*100)));
  $('.progress-track').setAttribute('aria-valuetext',`${format(balance)} из ${format(state.initial)}`);
}
function renderCollection() {
  const owned = items.filter(item => state.inventory[item.id]);
  const {spent,count} = totals();
  $('#collection-value').textContent = format(spent);
  $('#collection-summary').textContent = count ? `${owned.length} ${noun(owned.length,['мечта','мечты','мечт'])} · ${count} ${noun(count,['покупка','покупки','покупок'])}` : 'Твои большие и маленькие мечты';
  $('#collection-list').innerHTML = owned.length ? owned.map(item => {
    const amount = state.inventory[item.id];
    return `<article class="collection-item" data-id="${item.id}"><img src="${escape(item.image)}" alt="${escape(item.photoAlt || item.name)}" width="82" height="82"><div><h3>${escape(item.name)}</h3><p>${amount} шт. × ${format(item.price)}</p><div class="sell-actions"><strong>${format(item.price*amount)}</strong><div class="sell-buttons"><button class="sell-button" data-sell="one" aria-label="Продать 1: ${escape(item.name)}">Продать 1</button>${amount>1?`<button class="sell-button" data-sell="all" aria-label="Продать все: ${escape(item.name)}">Все</button>`:''}</div></div></div></article>`;
  }).join('') : `<div class="collection-empty">${icons.bag}<h3>Всё ещё впереди</h3><p>Выбери первую вещь из каталога.<br>Большие мечты начинаются с одного клика.</p><button class="primary-button" data-close="collection-dialog">К каталогу ${icons.arrow}</button></div>`;
}
function updateProductControls(card,id) {
  const amount = quantity(id), item = byId.get(id), affordable = item.price * amount <= totals().balance;
  card.querySelector('input').value = amount;
  card.querySelector('[data-action="minus"]').disabled = amount<=1;
  card.querySelector('[data-action="plus"]').disabled = amount>=9999;
  const button = card.querySelector('[data-action="buy"]');
  button.disabled = !affordable;
  const label = affordable ? 'Купить' : 'Не хватает';
  if(button.textContent.trim()!==label) button.innerHTML = affordable ? `Купить ${icons.arrow}` : 'Не хватает';
  button.setAttribute('aria-label',`Купить ${item.name}: ${amount} шт. за ${format(item.price*amount)}`);
}
function buy(id) {
  const item = byId.get(id), amount = quantity(id);
  if(item.price*amount>totals().balance) { toast('На эту покупку пока не хватает денег.'); return; }
  state.inventory[id] = (state.inventory[id] || 0) + amount;
  save(); renderWallet(); renderProducts();
  if($('#collection-dialog').open) renderCollection();
  toast(`${item.name}${amount>1?` × ${amount}`:''} — в твоей коллекции`);
  const newButton = $(`[data-id="${id}"] [data-action="buy"]`);
  if(newButton) { newButton.classList.add('is-bought'); newButton.innerHTML='Куплено ✓'; setTimeout(()=> { if(newButton.isConnected) updateProductControls(newButton.closest('.product'),id); newButton.classList.remove('is-bought'); },900); newButton.focus({preventScroll:true}); }
}
function sell(id,all) {
  const amount = all ? state.inventory[id] : 1;
  if(!amount || !state.inventory[id]) return;
  const previous = items.filter(item=>state.inventory[item.id]);
  const previousIndex = previous.findIndex(item=>item.id===id);
  state.inventory[id]-=amount;
  if(state.inventory[id]===0) delete state.inventory[id];
  save(); renderWallet(); renderProducts(); renderCollection();
  toast(`Возвращено ${format(byId.get(id).price*amount)}`);
  const next = $(`#collection-list [data-id="${id}"] [data-sell="one"]`) || document.querySelectorAll('#collection-list [data-sell="one"]')[Math.min(previousIndex,items.filter(item=>state.inventory[item.id]).length-1)] || $('#collection-list [data-close]');
  next?.focus({preventScroll:true});
}
function info(id) {
  const item = byId.get(id);
  const source = item.sourcePageUrl && /^https:\/\//.test(item.sourcePageUrl) ? item.sourcePageUrl : '';
  $('#info-content').innerHTML = `<img class="info-photo" src="${escape(item.image)}" alt="${escape(item.photoAlt || item.name)}"><div class="info-text"><h2 id="info-title">${escape(item.name)}</h2><p>${escape(item.description)}</p><strong class="info-price">${format(item.price)}</strong>${item.imageNote?`<p class="info-note">${escape(item.imageNote)}</p>`:''}<p>Условная игровая цена. Покупка добавит эту позицию в твою коллекцию.</p>${source?`<a class="text-link" href="${escape(source)}" target="_blank" rel="noopener noreferrer">Источник изображения <span aria-hidden="true">↗</span></a>`:''}</div>`;
  $('#info-dialog').showModal();
}
function requestReset(initial) {
  proposedBudget = initial;
  if(totals().count===0) { reset(); return; }
  $('#confirm-message').textContent = initial===state.initial ? 'Коллекция очистится, а стартовый капитал восстановится.' : `Начать игру с ${format(initial)}? Текущая коллекция очистится.`;
  $('#budget').value = state.initial;
  $('#confirm-dialog').showModal();
}
function reset() {
  state = {initial:proposedBudget,inventory:{}};
  quantities.clear(); save(); renderWallet(); renderProducts(); renderCollection();
  if($('#confirm-dialog').open) $('#confirm-dialog').close();
  toast(`Новая игра. В твоём распоряжении ${format(state.initial)}`);
}

$('#categories').addEventListener('click',event => { const button = event.target.closest('[data-category]'); if(!button) return; category=button.dataset.category; renderCategories(); renderProducts(); $(`[data-category="${category}"]`)?.focus({preventScroll:true}); });
$('#search').addEventListener('input',event => { query=normalize(event.target.value.trim()); renderProducts(); });
$('#sort').addEventListener('change',event => { sort=event.target.value; renderProducts(); });
$('#clear-filters').addEventListener('click',()=> { query='';category='all';$('#search').value=''; renderCategories();renderProducts(); });
$('#products').addEventListener('click',event => {
  const button = event.target.closest('[data-action]'); if(!button || button.disabled) return;
  const card = button.closest('.product'), id=Number(card.dataset.id), action=button.dataset.action;
  if(action==='info') info(id);
  if(action==='buy') buy(id);
  if(action==='plus'||action==='minus') {quantities.set(id,Math.min(9999,Math.max(1,quantity(id)+(action==='plus'?1:-1))));updateProductControls(card,id);}
});
$('#products').addEventListener('change',event => {if(!event.target.matches('input'))return;const card=event.target.closest('.product'),id=Number(card.dataset.id);quantities.set(id,Math.min(9999,Math.max(1,Math.floor(Number(event.target.value))||1)));updateProductControls(card,id);});
$('#products').addEventListener('input',event => {
  if(!event.target.matches('input'))return;
  const card=event.target.closest('.product'),id=Number(card.dataset.id);
  if(event.target.value==='') {card.querySelector('[data-action="buy"]').disabled=true;return;}
  quantities.set(id,Math.min(9999,Math.max(1,Math.floor(Number(event.target.value))||1)));
  updateProductControls(card,id);
});
$('#products').addEventListener('focusout',event=> {if(!event.target.matches('input'))return;const card=event.target.closest('.product'),id=Number(card.dataset.id);quantities.set(id,Math.min(9999,Math.max(1,Math.floor(Number(event.target.value))||1)));updateProductControls(card,id);});
$('#collection-list').addEventListener('click',event => {const button=event.target.closest('[data-sell]');if(button)sell(Number(button.closest('[data-id]').dataset.id),button.dataset.sell==='all');});
$('#open-collection').addEventListener('click',()=> {renderCollection();$('#collection-dialog').showModal();});
$('#open-about').addEventListener('click',()=> $('#about-dialog').showModal());
$('#open-privacy').addEventListener('click',()=> $('#privacy-dialog').showModal());
$('#reset').addEventListener('click',()=>requestReset(state.initial));
$('#budget').addEventListener('change',event=>requestReset(Number(event.target.value)));
$('#confirm-reset').addEventListener('click',reset);
document.addEventListener('click',event => {const button=event.target.closest('[data-close]');if(button)document.getElementById(button.dataset.close).close();});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click',event => {const r=dialog.getBoundingClientRect();if(event.target===dialog && (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom))dialog.close();});
  dialog.addEventListener('close',()=> {if(!document.querySelector('dialog[open]'))document.body.style.overflow='';});
  new MutationObserver(()=> {if(dialog.open)document.body.style.overflow='hidden';}).observe(dialog,{attributes:true,attributeFilter:['open']});
});
window.addEventListener('storage',event=> {if(event.key===STORAGE_KEY){state=load();renderWallet();renderProducts();if($('#collection-dialog').open)renderCollection();}});
new IntersectionObserver(([entry]) => {$('#header-tagline').hidden=!entry.isIntersecting;$('#header-balance').hidden=entry.isIntersecting;$('.header').classList.toggle('wallet-out',!entry.isIntersecting);},{rootMargin:'-80px 0px 0px 0px'}).observe($('#wallet'));

renderCategories();renderWallet();renderProducts();
