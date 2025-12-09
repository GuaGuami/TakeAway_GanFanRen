const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------------------
// 工具函数
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
// 页面初始化
// ------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupIngredientRow();
  renderDishesList();
  renderIngredientReference();
  document.getElementById('addIngredientRow').addEventListener('click', setupIngredientRow);
  document.getElementById('dishForm').addEventListener('submit', submitDish);
});

// ------------------------------
// 配料行
// ------------------------------
function setupIngredientRow(ingName='', weight=0) {
  const wrapper = document.getElementById('ingredientsBlock');
  const row = document.createElement('div');
  row.className = 'ingredient-row mb-2 d-flex gap-2';
  row.innerHTML = `
    <input class="form-control ing-name" placeholder="食材名称" value="${escapeHtml(ingName)}"/>
    <input type="number" step="0.001" min="0" class="form-control ing-weight" placeholder="kg/份" style="width:120px" value="${weight}"/>
    <button type="button" class="btn btn-outline-danger btn-sm remove-ingredient">删除</button>
  `;
  wrapper.appendChild(row);
  row.querySelector('.remove-ingredient').addEventListener('click', () => row.remove());
}

// ------------------------------
// 保存菜品
// ------------------------------
async function submitDish(e) {
  e.preventDefault();

  const id = document.getElementById('currentDishId').value;
  const name = document.getElementById('d_name').value.trim();
  if (!name) return alert('请填写菜品名称');

  const rows = Array.from(document.querySelectorAll('.ingredient-row'));
  const ingredients = rows
    .map(r => {
      const ing = r.querySelector('.ing-name').value.trim();
      const wt = parseFloat(r.querySelector('.ing-weight').value);
      return ing && wt > 0 ? { ingredient: ing, weightKg: wt } : null;
    })
    .filter(Boolean);
  if (!ingredients.length) return alert('请至少添加一个配料');

  let dish_id = id;

  if (id) {
    await supabaseClient.from("dishes").update({ name }).eq("id", id);
    await supabaseClient.from("dish_ingredients").delete().eq("dish_id", id);
  } else {
    const { data: dishData, error } = await supabaseClient
      .from('dishes')
      .insert({ name })
      .select('id')
      .single();
    if (error) return console.error(error);
    dish_id = dishData.id;
  }

  for (let ing of ingredients) {
    let ingredient_id;
    const { data: exist } = await supabaseClient
      .from('ingredients')
      .select('id')
      .eq('name', ing.ingredient)
      .limit(1);
    if (exist.length) {
      ingredient_id = exist[0].id;
    } else {
      const { data: newIng } = await supabaseClient
        .from('ingredients')
        .insert({ name: ing.ingredient, category: '未知' })
        .select('id')
        .single();
      ingredient_id = newIng.id;
    }

    await supabaseClient.from("dish_ingredients").insert({
      dish_id,
      ingredient_id,
      weight_kg: ing.weightKg,
    });
  }

  alert(id ? "菜品已更新" : "菜品已保存");

  document.getElementById('dishForm').reset();
  document.getElementById('currentDishId').value = "";
  document.getElementById('ingredientsBlock').innerHTML = '';
  setupIngredientRow();
  renderDishesList();
}

// ------------------------------
// 获取按 ingredient_id 的加权平均价格
// ------------------------------
async function getWeightedPriceMap() {
  const { data, error } = await supabaseClient
    .from('purchase_records')
    .select('ingredient_id, quantity_kg, price_per_kg')
    .order('date', { ascending: true }); // 可以按日期升序，但不影响计算

  if (error) return {};

  const map = {}; // ingredient_id -> avgPrice

  data.forEach(p => {
    const ingId = p.ingredient_id;
    const qty = Number(p.quantity_kg);
    const price = Number(p.price_per_kg);
    if (!map[ingId]) {
      map[ingId] = { totalQty: 0, totalCost: 0, avgPrice: 0 };
    }
    map[ingId].totalQty += qty;
    map[ingId].totalCost += qty * price;
    map[ingId].avgPrice = map[ingId].totalCost / map[ingId].totalQty;
  });

  return map; // ingredient_id -> { totalQty, totalCost, avgPrice }
}

// ------------------------------
// 渲染菜品列表（成本按加权平均）
// ------------------------------
async function renderDishesList() {
  const { data, error } = await supabaseClient
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

  if (error) return console.error(error);

  const weightedPrices = await getWeightedPriceMap();

  const wrapper = document.getElementById('dishesList');
  if (!data.length) {
    wrapper.innerHTML = '<div class="alert alert-info">暂无菜品</div>';
    return;
  }

  let html = '<div class="list-group">';
  data.forEach(d => {
    let totalCost = 0;
    html += `<div class="list-group-item mb-3">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <h5 class="mb-1">${escapeHtml(d.name)}</h5>
        <div>
          <button class="btn btn-outline-secondary btn-sm me-2" onclick="editDish(${d.id})">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDish(${d.id})">删除</button>
        </div>
      </div>
      <table class="table table-sm table-bordered mb-1">
        <thead class="table-light">
          <tr>
            <th>食材</th>
            <th>用量 (kg/份)</th>
            <th>加权单价 (€ / kg)</th>
            <th>成本 (€)</th>
          </tr>
        </thead>
        <tbody>`;

    d.dish_ingredients.forEach(i => {
      const wp = weightedPrices[i.ingredient_id];
      const unitPrice = wp ? wp.avgPrice : 0;
      const cost = unitPrice * i.weight_kg;
      totalCost += cost;

      html += `<tr>
        <td>${escapeHtml(i.ingredients.name)}</td>
        <td>${i.weight_kg}</td>
        <td>${unitPrice.toFixed(2)}</td>
        <td>${cost.toFixed(2)}</td>
      </tr>`;
    });

    html += `</tbody></table>
      <div><strong>总成本：€${totalCost.toFixed(2)} / 份</strong></div>
    </div>`;
  });
  html += '</div>';
  wrapper.innerHTML = html;
}


// ------------------------------
// 删除菜品
// ------------------------------
async function deleteDish(id) {
  if (!confirm('确认删除该菜品？')) return;
  const { error } = await supabaseClient.from('dishes').delete().eq('id', id);
  if (error) return console.error(error);
  renderDishesList();
}

// ------------------------------
// 编辑菜品
// ------------------------------
async function editDish(id) {
  const { data, error } = await supabaseClient
    .from('dishes')
    .select(`
      id,
      name,
      dish_ingredients (
        weight_kg,
        ingredients (name)
      )
    `)
    .eq('id', id)
    .single();
  if (error) return console.error(error);

  document.getElementById('d_name').value = data.name;
  document.getElementById('currentDishId').value = id;

  document.getElementById('ingredientsBlock').innerHTML = '';
  data.dish_ingredients.forEach(i => {
    setupIngredientRow(i.ingredients.name, i.weight_kg);
  });
}

// ------------------------------
// 渲染配料参考列表
// ------------------------------
async function renderIngredientReference() {
  const { data, error } = await supabaseClient
    .from('ingredients')
    .select('*')
    .order('name', { ascending: true });

  const listContainer = document.getElementById('ingredientList');
  if (error) {
    listContainer.innerHTML = '<div class="text-danger">加载配料失败</div>';
    return;
  }

  if (!data.length) {
    listContainer.innerHTML = '<div>暂无配料</div>';
    return;
  }

  let html = `
    <table class="table table-sm table-bordered mb-0">
      <thead class="table-light">
        <tr>
          <th>名称</th>
          <th>分类</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(ing => {
    html += `
      <tr>
        <td>${escapeHtml(ing.name)}</td>
        <td>${escapeHtml(ing.category)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary">添加</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  listContainer.innerHTML = html;

  const buttons = listContainer.querySelectorAll('button');
  buttons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      setupIngredientRow(data[index].name);
    });
  });
}
