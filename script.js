
// --- Referensi Warna (hasil pengamatan) ---
const references = [
  { name: "Sangat Layak", rgb: { r: 46, g: 11, b: 18 }, price: 20000 },
  { name: "Masih Layak", rgb: { r: 63, g: 17, b: 20 }, price: 15000 },
  { name: "Kurang Layak", rgb: { r: 119, g: 53, b: 32 }, price: 10000 },
];

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const resultDiv = document.getElementById("result");
const historyTable = document.getElementById("historyTable").querySelector("tbody");
const cameraSelect = document.getElementById("cameraSelect");

let historyData = JSON.parse(localStorage.getItem("scanHistory")) || [];

// --- Fungsi Kamera ---
async function startCamera(facingMode = "environment") {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
  video.srcObject = stream;
}
startCamera();

cameraSelect.addEventListener("change", (e) => {
  startCamera(e.target.value);
});

// --- Fungsi RGB ke Lab ---
function rgbToXyz({ r, g, b }) {
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  r *= 100; g *= 100; b *= 100;
  return {
    x: r * 0.4124 + g * 0.3576 + b * 0.1805,
    y: r * 0.2126 + g * 0.7152 + b * 0.0722,
    z: r * 0.0193 + g * 0.1192 + b * 0.9505,
  };
}

function xyzToLab({ x, y, z }) {
  x /= 95.047; y /= 100.0; z /= 108.883;
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);
  return {
    L: (116 * y) - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

// --- ΔE2000 ---
function deltaE2000(lab1, lab2) {
  const avgLp = (lab1.L + lab2.L) / 2.0;
  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const avgC = (C1 + C2) / 2.0;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25.0, 7))));
  const a1p = lab1.a * (1 + G);
  const a2p = lab2.a * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + lab1.b * lab1.b);
  const C2p = Math.sqrt(a2p * a2p + lab2.b * lab2.b);
  const avgCp = (C1p + C2p) / 2.0;
  const h1p = Math.atan2(lab1.b, a1p) * 180 / Math.PI + (Math.atan2(lab1.b, a1p) < 0 ? 360 : 0);
  const h2p = Math.atan2(lab2.b, a2p) * 180 / Math.PI + (Math.atan2(lab2.b, a2p) < 0 ? 360 : 0);
  let deltahp = 0;
  if (Math.abs(h1p - h2p) <= 180) deltahp = h2p - h1p;
  else deltahp = h2p <= h1p ? h2p - h1p + 360 : h2p - h1p - 360;
  const deltaLp = lab2.L - lab1.L;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((deltahp / 2) * (Math.PI / 180));
  const avgHp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2.0 : (h1p + h2p) / 2.0;
  const T = 1 - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180) + 0.24 * Math.cos((2 * avgHp) * Math.PI / 180) + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  const deltaRo = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25.0, 7)));
  const Sl = 1 + ((0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2)));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(2 * (deltaRo * Math.PI / 180)) * Rc;
  return Math.sqrt(Math.pow(deltaLp / Sl, 2) + Math.pow(deltaCp / Sc, 2) + Math.pow(deltaHp / Sh, 2) + Rt * (deltaCp / Sc) * (deltaHp / Sh));
}

// --- Fungsi Scan ---
function scanColor() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, g = 0, b = 0, count = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    r += imageData[i];
    g += imageData[i + 1];
    b += imageData[i + 2];
    count++;
  }
  return { r: r / count, g: g / count, b: b / count };
}

// --- Evaluasi Warna ---
function evaluateQuality(rgb) {
  const lab = rgbToLab(rgb);
  let bestMatch = null;
  let minDeltaE = Infinity;

  references.forEach(ref => {
    const refLab = rgbToLab(ref.rgb);
    const deltaE = deltaE2000(lab, refLab);
    if (deltaE < minDeltaE) {
      minDeltaE = deltaE;
      bestMatch = ref;
    }
  });
  return bestMatch;
}

// --- Tampilkan Hasil ---
document.getElementById("scanBtn").addEventListener("click", () => {
  const avgRgb = scanColor();
  const result = evaluateQuality(avgRgb);
  const now = new Date().toLocaleString();
  resultDiv.innerHTML = `<h3>Hasil Scan</h3>
    <p>Kategori: <strong>${result.name}</strong></p>
    <p>Harga: <strong>Rp ${result.price.toLocaleString()}</strong></p>`;

  const record = {
    time: now,
    rgb: `(${Math.round(avgRgb.r)}, ${Math.round(avgRgb.g)}, ${Math.round(avgRgb.b)})`,
    quality: result.name,
    price: result.price,
  };
  historyData.push(record);
  localStorage.setItem("scanHistory", JSON.stringify(historyData));
  renderHistory();
});

function renderHistory() {
  historyTable.innerHTML = "";
  historyData.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.time}</td><td>${item.rgb}</td><td>${item.quality}</td><td>Rp ${item.price.toLocaleString()}</td>`;
    historyTable.appendChild(tr);
  });
}
renderHistory();

document.getElementById("exportBtn").addEventListener("click", () => {
  let csvContent = "data:text/csv;charset=utf-8,Time,RGB,Quality,Price\n";
  historyData.forEach(item => {
    csvContent += `${item.time},${item.rgb},${item.quality},${item.price}\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "scan_history.csv");
  document.body.appendChild(link);
  link.click();
});
