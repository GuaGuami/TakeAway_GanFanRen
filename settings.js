const SUPABASE_URL = "https://cmfcqwviaiyrrfxdmpvq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmNxd3ZpYWl5cnJmeGRtcHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNTU2NTAsImV4cCI6MjA4MDgzMTY1MH0.gBs7ZGpEPNOrbxrMbs52CWkXZuNvVWWlEfF1tqlxSTs"; // 替换成你自己的
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);



// ------------------------------
// 加载某个情景，如果不存在默认空表单
// ------------------------------
async function loadSettings(scenario) {
  const { data, error } = await supabaseClient
    .from("settings")
    .select("*")
    .eq("scenario", scenario)
    .single();

  if (error) {
    return { standard_price: 10, plus_price: 13, scenario: "" };
  }

  return data;
}

// ------------------------------
// 保存/更新设置
// ------------------------------
async function saveSettings(s, p, scenario) {
  return supabaseClient
    .from("settings")
    .upsert({ standard_price: s, plus_price: p, scenario: scenario }, { onConflict: ["scenario"] });
}

// ------------------------------
// 渲染 settings 列表
// ------------------------------
async function renderSettingsList() {
  const tbody = document.getElementById("settingsList");

  const { data, error } = await supabaseClient
    .from("settings")
    .select("*")
    .order("id");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-danger">${error.message}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="3">暂无设置</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(s => `
      <tr>
        <td>${s.scenario}</td>
        <td>${s.standard_price} €</td>
        <td>${s.plus_price} €</td>
      </tr>
    `)
    .join('');
}

// ------------------------------
// 页面初始化
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  renderSettingsList();

  const form = document.getElementById("settingsForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const scenario = document.getElementById("scenario").value.trim();
    const s = parseFloat(document.getElementById("standardPrice").value);
    const p = parseFloat(document.getElementById("plusPrice").value);

    if (!scenario) return alert("请填写情景名称");

    const { error } = await saveSettings(s, p, scenario);
    if (error) return alert("保存失败：" + error.message);

    alert("保存成功！");
    renderSettingsList();
  });

  document.getElementById("resetSettings").addEventListener("click", async () => {
    if (!confirm("确定恢复默认？")) return;

    const scenario = document.getElementById("scenario").value.trim();
    if (!scenario) return alert("请先填写情景名称");

    await saveSettings(10, 13, scenario);

    document.getElementById("standardPrice").value = 10;
    document.getElementById("plusPrice").value = 13;

    renderSettingsList();
  });
});