const webAppUrl = "https://script.google.com/macros/s/AKfycbzqecPFhg7bUTzO5CNFaKTEB160VqbY30M5w37YQt_53kQhtp3SW9kRyZAOzpFY_CT5cw/exec";

// GET 数据
async function gsGet(sheetName) {
  const url = `${webAppUrl}?sheet=${sheetName}`;
  const res = await fetch(url);
  return await res.json();
}

// POST 数据
async function gsPost(sheetName, payload) {
  const res = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet: sheetName, data: payload })
  });
  return await res.json();
}

