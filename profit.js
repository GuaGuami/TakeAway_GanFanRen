const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// ------------------------------
// 页面初始化
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await populateDishesSelect();
  await populateScenarioSelect();

  document.getElementById("calcBtn").addEventListener("click", async () => {
    const dishId = document.getElementById("selectDish").value;
    const menuType = document.getElementById("selectMenuType").value;
    const scenarioId = document.getElementById("selectScenario").value;

    if (!dishId) return alert("请选择菜品");
    if (!scenarioId) return alert("请选择售价情景");

    const dish = await loadDish(dishId);
    if (!dish) return alert("菜品未找到");

    const scenario = await loadScenario(scenarioId);
    if (!scenario) return alert("情景未找到");

    const price = menuType === "standard" ? scenario.standard_price : scenario.plus_price;

    // 获取加权平均价格
    const weightedPrices = await getWeightedPriceMap();
    let totalCost = 0;

    // 构建配料明细表格
    let ingredientRows = '';
    dish.dish_ingredients.forEach(i => {
      const wp = weightedPrices[i.ingredient_id];
      const unitPrice = wp ? wp.avgPrice : 0;
      const cost = unitPrice * i.weight_kg;
      totalCost += cost;

      ingredientRows += `
        <tr>
          <td>${escapeHtml(i.ingredients.name)}</td>
          <td>${i.weight_kg} kg</td>
          <td>€${unitPrice.toFixed(4)}</td>
          <td>€${cost.toFixed(4)}</td>
        </tr>
      `;
    });

    const profit = price - totalCost;
    const profitPct = totalCost > 0 ? (profit / totalCost * 100) : 0;

    document.getElementById("resultContent").innerHTML = `
      <p><strong>菜品：</strong>${escapeHtml(dish.name)}</p>
      <p><strong>每份成本：</strong>€${totalCost.toFixed(2)}</p>
      <p><strong>售价（${menuType==='standard'?'标准':'Plus'}）：</strong>€${price.toFixed(2)}</p>
      <p><strong>利润：</strong>€${profit.toFixed(2)} （${profitPct.toFixed(1)}%）</p>
      <hr>
      <h6>明细</h6>
      <table style="width:100%;">
        <thead>
          <tr>
            <th>食材</th>
            <th>用量</th>
            <th>加权单价</th>
            <th>成本</th>
          </tr>
        </thead>
        <tbody>
          ${ingredientRows}
        </tbody>
      </table>
    `;
  });
});

// ------------------------------
// 获取加权平均价格
// ------------------------------
async function getWeightedPriceMap() {
  const { data, error } = await supabaseClient
    .from('purchase_records')
    .select('ingredient_id, quantity_kg, price_per_kg')
    .order('date', { ascending: true });

  if (error) return {};

  const map = {};
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
// 其他函数保持不变
// ------------------------------
async function populateDishesSelect() {
  const sel = document.getElementById("selectDish");
  const { data, error } = await supabaseClient
    .from("dishes")
    .select("id, name")
    .order("name", { ascending: true });

  if (error || !data.length) {
    sel.innerHTML = '<option value="">暂无菜品</option>';
    return;
  }
  sel.innerHTML = '<option value="">-- 选择菜品 --</option>' +
    data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}

async function populateScenarioSelect() {
  const sel = document.getElementById("selectScenario");
  const { data, error } = await supabaseClient
    .from("settings")
    .select("id, scenario")
    .order("id", { ascending: true });

  if (error || !data.length) {
    sel.innerHTML = '<option value="">暂无情景</option>';
    return;
  }
  sel.innerHTML = '<option value="">-- 选择情景 --</option>' +
    data.map(s => `<option value="${s.id}">${escapeHtml(s.scenario)}</option>`).join('');
}

async function loadDish(id) {
  const { data } = await supabaseClient
    .from("dishes")
    .select(`
      id,
      name,
      dish_ingredients (
        weight_kg,
        ingredient_id,
        ingredients (name)
      )
    `)
    .eq("id", id)
    .single();
  return data;
}

async function loadScenario(id) {
  const { data } = await supabaseClient
    .from("settings")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
