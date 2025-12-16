const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);



/* ================= 工具函数 ================= */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function getRecommendMultiplier() {
  const val = parseFloat(document.getElementById('recommendMultiplier')?.value);
  return val && val > 0 ? val : 2;
}

/* ================= 页面初始化 ================= */
document.addEventListener('DOMContentLoaded', () => {
  setupIngredientRow();
  renderDishesList();
  renderIngredientReference();

  document.getElementById('addIngredientRow')
    .addEventListener('click', () => setupIngredientRow());

  document.getElementById('dishForm')
    .addEventListener('submit', submitDish);

  document.getElementById('recommendMultiplier')
    .addEventListener('input', renderDishesList);
});

/* ================= 配料行 ================= */
function setupIngredientRow(ingName = '', weight = 0) {
  const wrapper = document.getElementById('ingredientsBlock');
  const row = document.createElement('div');
  row.className = 'ingredient-row mb-2 d-flex gap-2';
  row.innerHTML = `
    <input class="form-control ing-name" placeholder="食材名称" value="${escapeHtml(ingName)}">
    <input type="number" step="0.001" min="0" class="form-control ing-weight" style="width:120px" value="${weight}">
    <button type="button" class="btn btn-outline-danger btn-sm">删除</button>
  `;
  row.querySelector('button').onclick = () => row.remove();
  wrapper.appendChild(row);
}

/* ================= 保存菜品 ================= */
async function submitDish(e) {
  e.preventDefault();

  const id = document.getElementById('currentDishId').value;
  const name = document.getElementById('d_name').value.trim();
  if (!name) return alert('请填写菜品名称');

  const ingredients = [...document.querySelectorAll('.ingredient-row')]
    .map(r => {
      const ing = r.querySelector('.ing-name').value.trim();
      const wt = parseFloat(r.querySelector('.ing-weight').value);
      return ing && wt > 0 ? { ing, wt } : null;
    })
    .filter(Boolean);

  if (!ingredients.length) return alert('请至少添加一个配料');

  let dishId = id;

  if (id) {
    await supabaseClient.from('dishes').update({ name }).eq('id', id);
    await supabaseClient.from('dish_ingredients').delete().eq('dish_id', id);
  } else {
    const { data } = await supabaseClient
      .from('dishes')
      .insert({ name })
      .select('id')
      .single();
    dishId = data.id;
  }

  for (const i of ingredients) {
    let { data: ingData } = await supabaseClient
      .from('ingredients')
      .select('id')
      .eq('name', i.ing)
      .maybeSingle();

    if (!ingData) {
      const { data } = await supabaseClient
        .from('ingredients')
        .insert({ name: i.ing, category: '未知' })
        .select('id')
        .single();
      ingData = data;
    }

    await supabaseClient.from('dish_ingredients').insert({
      dish_id: dishId,
      ingredient_id: ingData.id,
      weight_kg: i.wt
    });
  }

  alert('菜品已保存');
  document.getElementById('dishForm').reset();
  document.getElementById('ingredientsBlock').innerHTML = '';
  setupIngredientRow();
  renderDishesList();
}

/* ================= 加权单价 ================= */
async function getWeightedPriceMap() {
  const { data } = await supabaseClient
    .from('purchase_records')
    .select('ingredient_id, quantity_kg, price_per_kg');

  const map = {};
  data.forEach(p => {
    if (!map[p.ingredient_id]) map[p.ingredient_id] = { q: 0, c: 0 };
    map[p.ingredient_id].q += p.quantity_kg;
    map[p.ingredient_id].c += p.quantity_kg * p.price_per_kg;
  });

  Object.values(map).forEach(v => v.avg = v.c / v.q);
  return map;
}

/* ================= 渲染菜品列表 ================= */
async function renderDishesList() {
  const multiplier = getRecommendMultiplier();

  const { data: dishes } = await supabaseClient
    .from('dishes')
    .select(`
      id,
      name,
      dish_ingredients (
        weight_kg,
        ingredient_id,
        ingredients (name)
      )
    `);

  const priceMap = await getWeightedPriceMap();
  const wrapper = document.getElementById('dishesList');

  if (!dishes.length) {
    wrapper.innerHTML = '<div class="alert alert-info">暂无菜品</div>';
    return;
  }

  let html = '<div class="list-group">';

  dishes.forEach(d => {
    let totalCost = 0;

    let rows = d.dish_ingredients.map(i => {
      const unit = priceMap[i.ingredient_id]?.avg || 0;
      const cost = unit * i.weight_kg;
      totalCost += cost;
      return `
        <tr>
          <td>${escapeHtml(i.ingredients.name)}</td>
          <td>${i.weight_kg}</td>
          <td>${unit.toFixed(2)}</td>
          <td>${cost.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const recommendPrice = totalCost * multiplier;

    html += `
      <div class="list-group-item mb-3">
        <h5>${escapeHtml(d.name)}</h5>
        <table class="table table-sm table-bordered">
          <thead class="table-light">
            <tr><th>食材</th><th>kg</th><th>€/kg</th><th>成本</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div><strong>成本：€${totalCost.toFixed(2)}</strong></div>
        <div class="text-success">
          <strong>推荐售价：€${recommendPrice.toFixed(2)}</strong>
        </div>
      </div>`;
  });

  html += '</div>';
  wrapper.innerHTML = html;
}

/* ================= 配料参考 ================= */
async function renderIngredientReference() {
  const { data } = await supabaseClient.from('ingredients').select('*').order('name');
  const ul = document.getElementById('ingredientList');

  ul.innerHTML = data.map(i =>
    `<li class="list-group-item">${escapeHtml(i.name)}</li>`
  ).join('');
}



