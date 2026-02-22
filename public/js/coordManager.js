// 处理WGS84 (国际标准) 与 GCJ02 (火星坐标) 的转换

// --- 常量定义 ---
const PI = Math.PI;
const a = 6378245.0; // 卫星椭球体长半轴
const ee = 0.00669342162296594323; // 偏心率

// 维护一个火星坐标系图层的名单
const GCJ02_LAYERS = ['gaode'];

// --- 核心方法 1：输出到屏幕 (WGS84 -> GCJ02) ---
export function toView(lat, lng) {
    const currentLayer = localStorage.getItem('MAPPIN_LAYER') || 'osm';
    // 只有在浏览高德地图时才进行偏移
    if (currentLayer === 'gaode') {
        return wgs84ToGcj02(lat, lng);
    }
    return [lat, lng];
}

// --- 核心方法 2：保存入库 (GCJ02 -> WGS84) ---
export function toDB(lat, lng) {
    const currentLayer = localStorage.getItem('MAPPIN_LAYER') || 'osm';
    // 只有在用户点击高德地图时才进行洗白
    if (currentLayer === 'gaode') {
        return gcj02ToWgs84(lat, lng);
    }
    return [lat, lng];
}

// --- 检测坐标系是否发生跨越 ---
export function isCoordinateSystemChanged(oldLayerKey, newLayerKey) {
    const oldIsGcj02 = GCJ02_LAYERS.includes(oldLayerKey);
    const newIsGcj02 = GCJ02_LAYERS.includes(newLayerKey);
    
    // 如果一个是 true 一个是 false，说明跨越了坐标系；如果都是 true 或都是 false，说明没跨越
    return oldIsGcj02 !== newIsGcj02; 
}


// ==========================================
// 底层算法：WGS84 (国际标准) <-> GCJ02 (火星坐标)
// ==========================================

function outOfChina(lat, lng) {
    // 粗略判断是否在中国境外，境外不需要偏移
    if (lng < 72.004 || lng > 137.8347) return true;
    if (lat < 0.8293 || lat > 55.8271) return true;
    return false;
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
}

// 国际转火星 (加密)
function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    let radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    let sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
    let mgLat = lat + dLat;
    let mgLng = lng + dLng;
    return [mgLat, mgLng];
}

// 火星转国际 (解密)
function gcj02ToWgs84(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    let radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    let sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
    let mgLat = lat + dLat;
    let mgLng = lng + dLng;
    // 近似算法解密
    return [lat * 2 - mgLat, lng * 2 - mgLng];
}