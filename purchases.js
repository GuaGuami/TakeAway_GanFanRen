// ------------------------------
// 1️⃣ 初始化 Supabase
// ------------------------------
const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ------------------------------
// 2️⃣ 通用工具函数
// ------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function generateId(prefix='id') {
  return prefix + '_' + Math.random().toString(36).substring(2, 9);
}

// ------------------------------
// 3️⃣ 页面初始化
// ------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('purchaseForm')) {
    initPurchasesPage();
  }
  if (document.getElementById('dishForm')) {
    initDishesPage();
  }
});

// ------------------------------
// 4️⃣ 采购页面逻辑
// ------------------------------
let allPurchases = [];

function initPurchasesPage() {
  loadAllPurchases();

  document.getElementById('filterBtn').addEventListener('click', filterAndRender);
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    document.getElementById('filterIngredient').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterSupermarket').value = '';
    renderPurchasesTable(allPurchases);
  });

  const form = document.getElementById('purchaseForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ingredient = document.getElementById('p_ingredient').value.trim();
    const category = document.getElementById('p_category').value;
    const quantityKg = parseFloat(document.getElementById('p_quantity').value);
    const pricePerKg = parseFloat(document.getElementById('p_price').value);
    const supermarket = document.getElementById('p_supermarket').value.trim();

    if (!ingredient || quantityKg <= 0 || pricePerKg <= 0) return alert('请填写有效数据');

    const purchase = { ingredient, category, quantityKg, pricePerKg, supermarket, date: new Date().toISOString().split('T')[0] };

    try {
      await savePurchase(purchase);
      alert('保存成功！');
      form.reset();
      await loadAllPurchases();
    } catch(err) {
      console.error(err);
      alert('保存失败，请查看控制台');
    }
  });
}

async function loadAllPurchases() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from('purchase_records')
    .select(`id, date, quantity_kg, price_per_kg, total_price, supermarket, ingredients(name, category)`)
    .order('date', { ascending: false })
    .limit(100);

  if (error) return console.error('读取采购记录失败', error);

  allPurchases = data.map(p => ({
    id: p.id,
    date: p.date,
    ingredient: p.ingredients?.name || '',
    category: p.ingredients?.category || '',
    quantityKg: Number(p.quantity_kg),
    pricePerKg: Number(p.price_per_kg),
    totalCost: Number(p.total_price) || Number(p.quantity_kg) * Number(p.price_per_kg),
    supermarket: p.supermarket || ''
  }));

  populateFilterOptions();
  renderPurchasesTable(allPurchases);
}

function populateFilterOptions() {
  const ingredientSet = new Set();
  const supermarketSet = new Set();
  allPurchases.forEach(p => {
    if(p.ingredient) ingredientSet.add(p.ingredient);
    if(p.supermarket) supermarketSet.add(p.supermarket);
  });

  document.getElementById('filterIngredient').innerHTML = 
    `<option value="">全部食材</option>` +
    Array.from(ingredientSet).map(i => `<option value="${i}">${i}</option>`).join('');

  document.getElementById('filterSupermarket').innerHTML = 
    `<option value="">全部超市</option>` +
    Array.from(supermarketSet).map(s => `<option value="${s}">${s}</option>`).join('');
}

function renderPurchasesTable(purchases) {
  const wrapper = document.getElementById('purchasesTableWrapper');
  if (!purchases || !purchases.length) {
    wrapper.innerHTML = '<div class="alert alert-info">暂无采购记录</div>';
    return;
  }

  let html = `<table class="table table-sm table-hover">
    <thead><tr>
      <th>日期</th><th>食材</th><th>类别</th><th>kg</th><th>€/kg</th><th>总成本</th><th>超市</th>
    </tr></thead><tbody>`;

  purchases.forEach(p => {
    html += `<tr>
      <td>${p.date}</td>
      <td>${escapeHtml(p.ingredient)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.quantityKg}</td>
      <td>${p.pricePerKg}</td>
      <td>${p.totalCost.toFixed(2)}</td>
      <td>${escapeHtml(p.supermarket)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

async function savePurchase(purchase) {
  if (!supabaseClient) return;
  try {
    let { data: ingData, error: ingErr } = await supabaseClient
      .from('ingredients')
      .select('id')
      .eq('name', purchase.ingredient)
      .limit(1);
    if (ingErr) throw ingErr;

    let ingredient_id;
    if (ingData.length > 0) ingredient_id = ingData[0].id;
    else {
      const { data: newIng, error: newIngErr } = await supabaseClient
        .from('ingredients')
        .insert({ name: purchase.ingredient, category: purchase.category })
        .select();
      if (newIngErr) throw newIngErr;
      ingredient_id = newIng[0].id;
    }

    const { error: purErr } = await supabaseClient
      .from('purchase_records')
      .insert([{
        ingredient_id,
        supermarket: purchase.supermarket || '',
        quantity_kg: purchase.quantityKg,
        price_per_kg: purchase.pricePerKg,
        date: purchase.date || new Date().toISOString().split('T')[0]
      }]);
    if (purErr) throw purErr;

  } catch(e) {
    console.error('保存采购失败', e);
    throw e;
  }
}

function filterAndRender() {
  const ingredient = document.getElementById('filterIngredient').value.trim().toLowerCase();
  const category = document.getElementById('filterCategory').value.trim().toLowerCase();
  const supermarket = document.getElementById('filterSupermarket').value.trim().toLowerCase();

  let filtered = allPurchases.filter(p => {
    const pIngredient = p.ingredient.trim().toLowerCase();
    const pCategory = p.category.trim().toLowerCase();
    const pSupermarket = p.supermarket.trim().toLowerCase();
    return (!ingredient || pIngredient === ingredient) &&
           (!category || pCategory === category) &&
           (!supermarket || pSupermarket === supermarket);
  });

  filtered.sort((a, b) => a.pricePerKg - b.pricePerKg);
  renderPurchasesTable(filtered);
}

