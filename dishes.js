// 替换为你的 Supabase 地址和 Key（示例中已提供）
const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 请换成你自己的密钥
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
    // 更新菜名
    const { error: updErr } = await supabaseClient.from('dishes').update({ name }).eq('id', id);
    if (updErr) {
      console.error(updErr);
      return alert('更新菜品失败');
    }
    // 删除旧配料绑定
    await supabaseClient.from('dish_ingredients').delete().eq('dish_id', id);
  } else {
    const { data, error } = await supabaseClient
      .from('dishes')
      .insert({ name })
      .select('id')
      .single();
    if (error) {
      console.error(error);
      return alert('创建菜品失败');
    }
    dishId = data.id;
  }

  for (const i of ingredients) {
    let { data: ingData } = await supabaseClient
      .from('ingredients')
      .select('id')
      .eq('name', i.ing)
      .maybeSingle();

    if (!ingData) {
      const { data, error } = await supabaseClient
        .from('ingredients')
        .insert({ name: i.ing, category: '未知' })
        .select('id')
        .single();
      if (error) {
        console.error(error);
        continue;
      }
      ingData = data;
    }

    await supabaseClient.from('dish_ingredients').insert({
      dish_id: dishId,
      ingredient_id: ingData.id,
      weight_kg: i.wt
    });
  }

  alert('菜品已保存');
  cancelEdit(); // 清理表单并退出编辑态
  renderDishesList();
  renderIngredientReference();
}

/* ================= 进入/取消 编辑 ================= */
function enterEditMode() {
  // 在保存按钮旁添加一个“取消”按钮（如果不存在）
  const form = document.getElementById('dishForm');
  if (!document.getElementById('cancelEditBtn')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancelEditBtn';
    cancelBtn.className = 'btn btn-outline-secondary ms-2';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = cancelEdit;
    // 将按钮放到保存按钮后面
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.insertAdjacentElement('afterend', cancelBtn);
  }
}

function cancelEdit() {
  document.getElementById('currentDishId').value = '';
  document.getElementById('dishForm').reset();
  document.getElementById('ingredientsBlock').innerHTML = '';
  setupIngredientRow();
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.remove();
}

/* ================= 加权单价 ================= */
async function getWeightedPriceMap() {
  const { data } = await supabaseClient
    .from('purchase_records')
    .select('ingredient_id, quantity_kg, price_per_kg');

  const map = {};
  (data || []).forEach(p => {
    if (!map[p.ingredient_id]) map[p.ingredient_id] = { q: 0, c: 0 };
    map[p.ingredient_id].q += p.quantity_kg;
    map[p.ingredient_id].c += p.quantity_kg * p.price_per_kg;
  });

  Object.values(map).forEach(v => v.avg = v.c / v.q);
  return map;
}

/* ================= 渲染菜品列表（含编辑/删除） ================= */
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

  if (!dishes || !dishes.length) {
    wrapper.innerHTML = '<div class="alert alert-info">暂无菜品</div>';
    return;
  }

  let html = '<div class="list-group">';

  dishes.forEach(d => {
    let totalCost = 0;

    let rows = (d.dish_ingredients || []).map(i => {
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
        <div class="d-flex justify-content-between align-items-start">
          <h5 class="mb-1">${escapeHtml(d.name)}</h5>
          <div>
            <button class="btn btn-sm btn-outline-primary me-2 edit-dish" data-id="${d.id}">编辑</button>
            <button class="btn btn-sm btn-outline-danger delete-dish" data-id="${d.id}">删除</button>
          </div>
        </div>
        <table class="table table-sm table-bordered mt-2 mb-2">
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

  // 绑定 编辑/删除 按钮事件
  wrapper.querySelectorAll('.edit-dish').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await loadDishIntoForm(id);
    });
  });

  wrapper.querySelectorAll('.delete-dish').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('确定要删除该菜品？此操作不可恢复。')) return;
      await deleteDish(id);
      renderDishesList();
      renderIngredientReference();
    });
  });
}

/* ================= 加载菜品到表单（编辑） ================= */
async function loadDishIntoForm(dishId) {
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
    `)
    .eq('id', dishId)
    .single();

  if (error || !data) {
    console.error(error);
    return alert('加载菜品失败');
  }

  // 填充表单
  document.getElementById('currentDishId').value = data.id;
  document.getElementById('d_name').value = data.name;
  document.getElementById('ingredientsBlock').innerHTML = '';

  (data.dish_ingredients || []).forEach(i => {
    const ingName = i.ingredients?.name || '';
    const wt = i.weight_kg || 0;
    setupIngredientRow(ingName, wt);
  });

  enterEditMode();
  // 将页面滚动到表单位置，方便编辑
  document.querySelector('#d_name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ================= 删除菜品 ================= */
async function deleteDish(dishId) {
  try {
    // 先删除 dish_ingredients（如果外键没有 cascade）
    await supabaseClient.from('dish_ingredients').delete().eq('dish_id', dishId);
    // 再删除 dish 本身
    const { error } = await supabaseClient.from('dishes').delete().eq('id', dishId);
    if (error) {
      console.error(error);
      alert('删除菜品失败');
    } else {
      alert('菜品已删除');
    }
  } catch (err) {
    console.error(err);
    alert('删除时发生错误');
  }
}

/* ================= 配料参考 ================= */
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

  if (!data || !data.length) {
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

  data.forEach((ing) => {
    html += `
      <tr>
        <td>${escapeHtml(ing.name)}</td>
        <td>${escapeHtml(ing.category)}</td>
        <td>
          <button
            class="btn btn-sm btn-outline-secondary add-ingredient-from-ref"
            data-name="${escapeHtml(ing.name)}"
          >添加</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  listContainer.innerHTML = html;

  // 绑定按钮事件
  listContainer.querySelectorAll('.add-ingredient-from-ref').forEach(btn => {
    btn.addEventListener('click', () => {
      setupIngredientRow(btn.dataset.name);
    });
  });
}
