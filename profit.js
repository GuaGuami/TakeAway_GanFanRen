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

    const latestPurchases = await getLatestPurchaseMap();
    let totalCost = 0;

    // 构建配料明细表格
    let ingredientRows = '';
    dish.dish_ingredients.forEach(i => {
      const purchase = latestPurchases[i.ingredient_id];
      const unitPrice = purchase ? Number(purchase.price_per_kg) : 0;
      const cost = unitPrice * i.weight_kg;
      totalCost += cost;

      // 最新采购时间和超市
      const dateStr = purchase?.date ? new Date(purchase.date).toLocaleDateString() : '-';
      const supermarket = purchase?.supermarket || '-';

      ingredientRows += `
        <tr style="border:none;">
          <td style="border:none;">${escapeHtml(i.ingredients.name)}</td>
          <td style="border:none;">${i.weight_kg} kg</td>
          <td style="border:none;">€${unitPrice.toFixed(4)}</td>
          <td style="border:none;">€${cost.toFixed(4)}</td>
          <td style="border:none;">${dateStr}</td>
          <td style="border:none;">${escapeHtml(supermarket)}</td>
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
      <table style="border:none; width:100%;">
        <thead>
          <tr style="border:none;">
            <th style="border:none;">食材</th>
            <th style="border:none;">用量</th>
            <th style="border:none;">单价</th>
            <th style="border:none;">成本</th>
            <th style="border:none;">采购时间</th>
            <th style="border:none;">超市</th>
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
// 加载菜品下拉
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

// ------------------------------
// 加载情景下拉
// ------------------------------
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

// ------------------------------
// 加载单个菜品
// ------------------------------
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

// ------------------------------
// 加载单个情景
// ------------------------------
async function loadScenario(id) {
  const { data } = await supabaseClient
    .from("settings")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

// ------------------------------
// 获取最新采购记录
// ------------------------------
async function getLatestPurchaseMap() {
  const { data } = await supabaseClient
    .from('purchase_records')
    .select('ingredient_id, price_per_kg, date, supermarket')
    .order('date', { ascending: false });

  const map = {};
  data.forEach(p => {
    // 如果当前 ingredient_id 还没记录，或者已有记录的 supermarket 为空且当前有值
    if (!map[p.ingredient_id] || (!map[p.ingredient_id].supermarket && p.supermarket)) {
      map[p.ingredient_id] = p;
    }
  });
  return map;
}

// ------------------------------
// HTML 转义
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