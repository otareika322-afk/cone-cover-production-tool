// GAS API 共通ヘルパー（App.js / TabletView.js 共有）
export const GAS_URL = "https://script.google.com/macros/s/AKfycbzpCyqWlsaU_2LaO6DckKYoLq4WolHUHvxsCmzW3uHvyzpU2wF6pRae65WihjNEuOcI/exec";

export async function gasGet(type) {
  const res = await fetch(`${GAS_URL}?type=${type}`);
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json.data;
}

export async function gasPost(action, payload) {
  const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action, payload }) });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json;
}
