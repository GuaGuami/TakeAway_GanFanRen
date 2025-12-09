const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dailyChart, dishChart, dishRateChart;

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", async () => {
  await populateScenarioSelect();
  await populateDishesSelect();
  await refreshSalesAndCharts();

  document.getElementById("addSaleBtn").addEventListener("click", async () => {
    await addSaleRecord();
    await refreshSalesAndCharts(); // 添加后刷新列表和图表
  });
});

// 加载场景
async function populateScenarioSelect() {
  const sel = document.getElementById("selectScenario");
  const { data, error } = await supabaseClient
    .from("settings")
    .select("id, scenario")
    .order("id");
  if (error) return alert("获取场景失败：" + error.message);

  sel.innerHTML = '<option value="">--请选择情景--</option>' + data.map(s => `<option value="${s.id}">${s.scenario}</option>`).join('');
}

// 加载菜品
async function populateDishesSelect() {
  const sel = document.getElementById("selectDish");
  const { data, error } = await supabaseClient
    .from("dishes")
    .select("id, name")
    .order("name");
  if (error) return alert("获取菜品失败：" + error.message);

  sel.innerHTML = '<option value="">--请选择菜品--</option>' + data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

// 添加销售记录
async function addSaleRecord() {
  const scenarioId = document.getElementById("selectScenario").value;
  const dishId = document.getElementById("selectDish").value;
  const qty = parseFloat(document.getElementById("quantity").value);
  const menuType = document.getElementById("selectMenuType").value;

  if (!scenarioId || !dishId || !qty || qty <= 0) return alert("请填写完整信息");

  const { data: scenarioData } = await supabaseClient
    .from("settings")
    .select("*")
    .eq("id", scenarioId)
    .single();

  const dishCost = await loadDishCost(dishId);
  const unitPrice = menuType === "standard" ? scenarioData.standard_price : scenarioData.plus_price;
  const totalCost = dishCost * qty;
  const totalProfit = unitPrice * qty - totalCost;

  const { error } = await supabaseClient
    .from("sales")
    .insert({
      scenario_id: scenarioId,
      dish_id: dishId,
      quantity: qty,
      unit_price: unitPrice,
      total_cost: totalCost,
      total_profit: totalProfit
    });

  if (error) return alert("添加失败：" + error.message);

  document.getElementById("quantity").value = "";
  await renderSalesList();
}

// 获取菜品成本
async function loadDishCost(dishId) {
  const { data } = await supabaseClient
    .from("dishes")
    .select(`dish_ingredients(weight_kg, ingredient_id, ingredients(name))`)
    .eq("id", dishId)
    .single();

  const latestPurchases = await getLatestPurchaseMap();
  let totalCost = 0;

  data.dish_ingredients.forEach(i => {
    const purchase = latestPurchases[i.ingredient_id];
    const unitPrice = purchase ? Number(purchase.price_per_kg) : 0;
    totalCost += unitPrice * i.weight_kg;
  });

  return totalCost;
}

// 获取最新采购记录映射
async function getLatestPurchaseMap() {
  const { data } = await supabaseClient
    .from("purchase_records")
    .select('ingredient_id, price_per_kg, date')
    .order('date', { ascending: false });

  const map = {};
  data.forEach(p => { if (!map[p.ingredient_id]) map[p.ingredient_id] = p; });
  return map;
}

// 渲染销售列表
async function renderSalesList() {
  const tbody = document.getElementById("salesList");

  const { data: salesData } = await supabaseClient
    .from("sales")
    .select("id,date,scenario_id,dish_id,quantity,unit_price,total_cost,total_profit")
    .order("date", { ascending: false });

  if (!salesData || salesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">暂无销售记录</td></tr>';
    return;
  }

  const { data: dishesData } = await supabaseClient.from("dishes").select("id,name");
  const { data: settingsData } = await supabaseClient.from("settings").select("id,scenario");

  const dishesMap = Object.fromEntries(dishesData.map(d => [d.id, d.name]));
  const settingsMap = Object.fromEntries(settingsData.map(s => [s.id, s.scenario]));

  tbody.innerHTML = salesData.map(r => `
    <tr>
      <td>${new Date(r.date).toLocaleString()}</td>
      <td>${settingsMap[r.scenario_id] || '未知'}</td>
      <td>${dishesMap[r.dish_id] || '未知'}</td>
      <td>${r.menu_type === 'standard' ? '标准' : 'PLUS'}</td>
      <td>${r.quantity}</td>
      <td>€${r.unit_price.toFixed(2)}</td>
      <td>€${r.total_cost.toFixed(2)}</td>
      <td>€${r.total_profit.toFixed(2)}</td>
    </tr>
  `).join('');
}

// 渲染图表
async function renderCharts() {
  const { data: salesData } = await supabaseClient
    .from("sales")
    .select("date,dish_id,quantity,total_profit,total_cost")
    .order("date", { ascending: true });

  if (!salesData || salesData.length === 0) return;

  const { data: dishesData } = await supabaseClient.from("dishes").select("id,name");
  const dishesMap = Object.fromEntries(dishesData.map(d => [d.id, d.name]));

  // 每日利润趋势
  const dailyMap = {};
  salesData.forEach(s => {
    const day = new Date(s.date).toLocaleDateString();
    dailyMap[day] = (dailyMap[day] || 0) + s.total_profit;
  });

  const dailyLabels = Object.keys(dailyMap);
  const dailyProfits = Object.values(dailyMap);

  const dailyCtx = document.getElementById("dailyProfitChart").getContext("2d");
  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(dailyCtx, {
    type: 'line',
    data: {
      labels: dailyLabels,
      datasets: [{
        label: '每日利润 (€)',
        data: dailyProfits,
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });

  // 菜品利润分布
  const dishProfitMap = {};
  salesData.forEach(s => {
    const name = dishesMap[s.dish_id] || '未知';
    dishProfitMap[name] = (dishProfitMap[name] || 0) + s.total_profit;
  });

  const dishLabels = Object.keys(dishProfitMap);
  const dishProfits = Object.values(dishProfitMap);

  const dishCtx = document.getElementById("dishProfitChart").getContext("2d");
  if (dishChart) dishChart.destroy();
  dishChart = new Chart(dishCtx, {
    type: 'bar',
    data: { labels: dishLabels, datasets: [{ label: '菜品总利润 (€)', data: dishProfits, backgroundColor: 'rgba(153, 102, 255, 0.7)', borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  // 菜品利润率分布
  const dishProfitRateMap = {};
  salesData.forEach(s => {
    const name = dishesMap[s.dish_id] || '未知';
    dishProfitRateMap[name] = dishProfitRateMap[name] || { profit: 0, cost: 0 };
    dishProfitRateMap[name].profit += s.total_profit;
    dishProfitRateMap[name].cost += s.total_cost;
  });

  const profitRateLabels = Object.keys(dishProfitRateMap);
  const profitRateData = profitRateLabels.map(name => {
    const { profit, cost } = dishProfitRateMap[name];
    return cost > 0 ? (profit / cost * 100).toFixed(2) : 0;
  });

  const profitRateCtx = document.getElementById("dishProfitRateChart").getContext("2d");
  if (dishRateChart) dishRateChart.destroy();
  dishRateChart = new Chart(profitRateCtx, {
    type: 'bar',
    data: { labels: profitRateLabels, datasets: [{ label: '菜品利润率 (%)', data: profitRateData, backgroundColor: 'rgba(255, 159, 64, 0.7)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

// 刷新列表和图表
async function refreshSalesAndCharts() {
  await renderSalesList();
  await renderCharts();
}
