let yilanData = [];
let isLoading = true;
let isUpdating = false; // 用來標記是否正在背景更新
let errorMsg = "";
let myMap;
let canvas;
const mappa = new Mappa('Leaflet');

function setup() {
  // 建立全螢幕畫布
  canvas = createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  
  // 設定 mappa-mundi 地圖選項 (初始定位在宜蘭)
  const options = {
    lat: 24.68, // 調整緯度，更靠近宜蘭縣中心
    lng: 121.76, // 調整經度
    zoom: 11,   // 放大縮放級別 (數字越大越放大，11 通常適合剛好涵蓋一個縣市)
    style: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  };
  myMap = mappa.tileMap(options);
  myMap.overlay(canvas);

  // 初始呼叫 API 取得資料
  fetchRainfallData();
  
  // 設定定時器，每 5 分鐘 (5 * 60 * 1000 = 300000 毫秒) 在背景自動更新一次
  setInterval(fetchRainfallData, 5 * 60 * 1000);
}

// 將取得資料的邏輯獨立成一個函式，以便重複呼叫
function fetchRainfallData() {
  errorMsg = ""; // 每次呼叫前先重置錯誤訊息
  if (!isLoading) isUpdating = true; // 如果不是第一次載入，則開啟背景更新標記

  // 目標 API 網址
  const apiUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=rdec-key-123-45678-011121314';
  
  // 中央氣象署 (CWA) 的開放資料 API 已經原生支援 CORS (帶有 Access-Control-Allow-Origin: * 標頭)。
  // 透過公共代理伺服器反而會因為檔案過大 (~3MB) 導致超時或 500 錯誤，進而引發 CORS 阻擋。
  // 這裡我們直接向目標 API 發送請求即可。

  // 採用 GET 方法直接取得資料
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error('網路回應異常: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.records && data.records.Station) {
        // 只保留宜蘭縣的測站資料
        yilanData = data.records.Station.filter(station => {
          return station.GeoInfo && station.GeoInfo.CountyName === '宜蘭縣';
        }).map(station => {
          
          // 取得雨量，依氣象署最新 API 格式防呆
          let rain = 0;
          if (station.RainfallElement && station.RainfallElement.Now) {
            rain = station.RainfallElement.Now.Precipitation;
          } else if (station.WeatherElement && station.WeatherElement.Now) {
            rain = station.WeatherElement.Now.Precipitation;
          }
          
          // 氣象署常使用負數 (如 -99, -999) 代表儀器異常或無降雨，這裡將其視為 0
          if (rain < 0) {
            rain = 0;
          }
          
          // 取得該測站的座標 (WGS84 經緯度)
          let lat = 0, lng = 0;
          if (station.GeoInfo && station.GeoInfo.Coordinates) {
            let wgs84 = station.GeoInfo.Coordinates.find(c => c.CoordinateName === 'WGS84');
            if (wgs84) {
              lat = parseFloat(wgs84.StationLatitude);
              lng = parseFloat(wgs84.StationLongitude);
            }
          }

          return {
            town: station.GeoInfo.TownName,
            name: station.StationName,
            rain: rain,
            lat: lat,
            lng: lng
          };
        });
        
        // 依照鄉鎮名稱進行排序，方便閱讀
        yilanData.sort((a, b) => a.town.localeCompare(b.town));
      } else {
        throw new Error('API 回傳的資料格式不符');
      }
      isLoading = false;
      isUpdating = false; // 資料更新完成
    })
    .catch(error => {
      console.error('取得資料時發生錯誤:', error);
      errorMsg = '無法取得資料，請檢查網路連線或 API 狀態。';
      isLoading = false;
      isUpdating = false; // 發生錯誤也結束更新狀態
    });
}

function draw() {
  clear(); // 清除 p5 畫布的背景色，以顯示底層的 mappa-mundi 地圖
  
  if (isLoading) {
    fill(50, 55, 65, 200);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, height / 2, 400, 80, 10);
    fill(255);
    textSize(24);
    text("📡 宜蘭縣即時雨量載入中，請稍候...", width / 2, height / 2);
    return;
  }
  
  if (errorMsg !== "") {
    fill(50, 55, 65, 200);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, height / 2, 500, 80, 10);
    fill(255, 100, 100);
    textSize(24);
    text("❌ " + errorMsg, width / 2, height / 2);
    return;
  }
  
  let hoveredStation = null;

  // 將每個測站繪製到地圖上對應的經緯度位置
  for (let i = 0; i < yilanData.length; i++) {
    let d = yilanData[i];
    
    if (d.lat && d.lng) {
      // 使用 myMap 將測站的經緯度轉換為畫布上的 X, Y 螢幕座標
      let pos = myMap.latLngToPixel(d.lat, d.lng);
      
      // 根據雨量決定圓點的顏色 (參考氣象署雨量分級)
      let markerColor;
      if (d.rain === 0) {
        markerColor = color(245, 245, 240); // 0mm：米白色
      } else if (d.rain < 1) {
        markerColor = color(150, 255, 255); // <1mm：淺青色
      } else if (d.rain < 10) {
        markerColor = color(0, 255, 255);   // 1~10mm：青色
      } else if (d.rain < 50) {
        markerColor = color(0, 150, 255);   // 10~50mm：淺藍色
      } else if (d.rain < 100) {
        markerColor = color(0, 0, 255);     // 50~100mm：藍色
      } else if (d.rain < 200) {
        markerColor = color(255, 255, 0);   // 100~200mm：黃色
      } else if (d.rain < 300) {
        markerColor = color(255, 150, 0);   // 200~300mm：橘色
      } else {
        markerColor = color(255, 0, 0);     // >=300mm：紅色
      }
      
      let markerSize = 16;

      // 如果正在背景更新，產生雷達閃爍動畫效果
      if (isUpdating) {
        let pulseRadius = markerSize + (frameCount % 60); // 每 60 個 frame (約1秒) 擴散一次
        let pulseAlpha = map(pulseRadius, markerSize, markerSize + 60, 150, 0); // 隨半徑變大，透明度遞減
        noStroke();
        fill(red(markerColor), green(markerColor), blue(markerColor), pulseAlpha);
        ellipse(pos.x, pos.y, pulseRadius, pulseRadius);
      }
      
      // 在地圖上繪製測站定位點
      stroke(100); // 因為 0mm 是米白色，將邊框改為深灰色使其在地圖上更清楚
      strokeWeight(1.5);
      fill(markerColor);
      ellipse(pos.x, pos.y, markerSize, markerSize);
      strokeWeight(1); // 恢復預設
      
      // 偵測滑鼠是否懸停於圓點上。
      // 將感應半徑從 markerSize / 2 擴大為 markerSize，讓滑鼠不需要精準對齊也能瞬間觸發，大幅提升靈敏度！
      if (dist(mouseX, mouseY, pos.x, pos.y) < markerSize) {
        hoveredStation = { data: d, pos: pos };
      }
    }
  }
  
  // 繪製左下角圖例
  drawLegend();

  // 顯示標題 (移至點位繪製之後，確保位於上方圖層)
  fill(50, 55, 65, 200);
  noStroke();
  rectMode(CENTER);
  let boxHeight = isUpdating ? 100 : 80;
  let boxY = isUpdating ? 70 : 60;
  rect(260, boxY, 400, boxHeight, 10); // 根據是否更新中動態調整高度與中心Y座標，讓框框向下延伸
  
  // 設定陰影效果
  drawingContext.shadowOffsetX = 2;
  drawingContext.shadowOffsetY = 2;
  drawingContext.shadowBlur = 4;
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.8)';

  // 設定文字：白字與黑框
  fill(255);
  stroke(0);
  strokeWeight(4); // 黑框厚度
  
  // 顯示縮小後的標題
  textSize(28);
  text("宜蘭縣即時雨量資訊", 260, 45);
  
  // 取得並顯示目前時間
  let timeString = new Date().toLocaleString('zh-TW', { hour12: false });
  strokeWeight(3);
  textSize(16);
  text(timeString, 260, 75);
  
  // 如果正在背景更新，顯示提示文字
  if (isUpdating) {
    fill(255, 210, 80); // 黃橘色
    strokeWeight(2);
    textSize(14);
    text("⏳ 正在更新資料...", 260, 95);
  }
  
  // 重置陰影與框線設定，避免影響到後續的測站圓點與資訊框
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  drawingContext.shadowBlur = 0;
  noStroke();

  // 如果有測站被滑鼠懸停，在最上層繪製提示資訊框
  if (hoveredStation) {
    cursor(HAND); // 將游標切換為「手指」形狀

    let d = hoveredStation.data;
    let pos = hoveredStation.pos;
    
    rectMode(CENTER);
    fill(40, 45, 55, 240); // 資訊框背景
    stroke(100);
    rect(pos.x, pos.y - 45, 160, 60, 8); // 圓角矩形
    
    noStroke();
    fill(255);
    textSize(14);
    text(`${d.town} - ${d.name}`, pos.x, pos.y - 55);
    
    if (d.rain > 0) {
      fill(100, 220, 255);
      textSize(16);
      text(`☔ 雨量: ${d.rain} mm`, pos.x, pos.y - 33);
    } else {
      fill(180);
      textSize(14);
      text(`無降雨 (0 mm)`, pos.x, pos.y - 33);
    }
  } else {
    cursor(ARROW); // 恢復預設的「箭頭」游標形狀
  }
}

// 當視窗調整大小時，同步更新畫布大小
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// 繪製左下角的雨量圖例
function drawLegend() {
  // 對應剛剛在 draw() 中設定的顏色分級
  const legendItems = [
    { label: '>= 300 mm', color: color(255, 0, 0) },
    { label: '200 ~ 300 mm', color: color(255, 150, 0) },
    { label: '100 ~ 200 mm', color: color(255, 255, 0) },
    { label: '50 ~ 100 mm', color: color(0, 0, 255) },
    { label: '10 ~ 50 mm', color: color(0, 150, 255) },
    { label: '1 ~ 10 mm', color: color(0, 255, 255) },
    { label: '< 1 mm', color: color(150, 255, 255) },
    { label: '0 mm', color: color(245, 245, 240) }
  ];

  let boxWidth = 140;
  let boxHeight = 220;
  let startX = 20 + boxWidth / 2;           // 左側邊距 20px
  let startY = height - 20 - boxHeight / 2; // 底部邊距 20px

  // 畫背景框
  rectMode(CENTER);
  fill(50, 55, 65, 200); // 半透明深色背景
  noStroke();
  rect(startX, startY, boxWidth, boxHeight, 8); // 圓角 8

  // 畫圖例標題
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(15);
  text("雨量圖例", startX, startY - boxHeight / 2 + 20);

  // 逐一畫出圖例項目
  textAlign(LEFT, CENTER);
  let itemY = startY - boxHeight / 2 + 45; // 第一個項目的 Y 座標
  for (let i = 0; i < legendItems.length; i++) {
    let item = legendItems[i];
    
    // 畫對應顏色的圓點
    fill(item.color);
    stroke(100);
    strokeWeight(1.5);
    ellipse(startX - 45, itemY, 14, 14);
    
    // 畫說明文字
    noStroke();
    fill(255);
    textSize(13);
    text(item.label, startX - 25, itemY);
    
    itemY += 23; // 每個項目往下移動 23px
  }
  
  // 恢復預設對齊，以免影響後續其他的文字繪製
  textAlign(CENTER, CENTER);
}