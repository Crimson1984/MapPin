import { toView, isCoordinateSystemChanged } from './coordManager.js';

const TILE_LAYERS_CONFIG = {
    osm: {
        name: "🗺️ 标准地图 (OSM)",
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { attribution: '&copy; OpenStreetMap contributors' }
    },

    satellite: {
        name: "🛰️ 卫星影像 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri' }
    },

    gaode: {
        name: "🚗 高德地图 ",
        url: 'http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: { subdomains: "1234" }
    },

    // 2. 国家地理风格 (极其美观，复古探险风，非常适合做足迹地图底图！)
    natgeo: {
        name: "🧭 国家地理 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri & National Geographic' }
    },

    // 3. 深灰底图 (数据可视化的绝佳选择，配合你的热力图效果炸裂！)
    dark_gray: {
        name: "🌑 极暗深灰 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri' }
    },

    // ⚡️ 5. 组合图层：带地名和路网的卫星图 
    satellite_labeled: {
        name: "🌍 混合卫星图 (带标注)",
        isGroup: true, // 告诉解析器，这是一个组合图层！
        urls: [
            // 底层：卫星影像
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            // 顶层：透明的标注、国界、路网层 (World_Boundaries_and_Places)
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        options: { attribution: 'Tiles &copy; Esri' }
    }

};


// --- 🎨 图标资源配置 ---
const IconConfig = {
    shadowUrl: '/lib/leaflet/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
};

// 辅助函数：快速生成不同颜色的图标
function createColorIcon(color) {
    return new L.Icon({
        ...IconConfig,
        iconUrl: `/lib/leaflet/images/marker-icon-${color}.png`
    });
}

// 预定义图标实例 (单例模式，避免重复 new)
const ICONS = {
    public:  createColorIcon('blue'),   // 🔵 公开笔记
    friends: createColorIcon('green'),  // 🟢 好友可见
    private: createColorIcon('red'),    // 🔴 仅自己可见
    draft:   createColorIcon('grey'),   // ⚪️ 草稿 (新增)
    default: createColorIcon('blue')
};

// 辅助函数：根据笔记对象获取对应图标
function getIconForNote(note, isDraft = false) {
    if (isDraft) return ICONS.draft;
    
    // 根据可见性返回图标，如果没有匹配则返回默认
    return ICONS[note.visibility] || ICONS.default;
}


let map = null; // 模块内部私有变量
let markersLayer = null; // ⚡️ 新增：用于存放所有标记的容器
let userLocationMarker = null; //定位红点

// 热力图状态与图层
let heatLayer = null; 
let isHeatmapMode = false; // 当前是否处于热力图模式

//  自定义控件模块:添加定位按钮与逻辑

function addLocateControl(map){
    const LocateControl = L.Control.extend({
        options: {
            position: 'bottomleft' // 同样放在左下角，Leaflet 会自动把它和上面两个排成一列
        },
        onAdd: function(map) {
            // 创建一个 div 容器，赋予 Leaflet 原生的控制条 CSS 类名（这样它就自带白底和阴影了）
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

            const button = L.DomUtil.create('a', '', container);
            button.href = '#'; // 伪链接
            button.title = '定位'; // 鼠标悬停时的提示文字
            button.style.display = 'flex';
            button.style.justifyContent = 'center';
            button.style.alignItems = 'center';
            button.style.paddingLeft = '4px';

            // 放入图标，稍微缩小一点字号配合 Leaflet 的小巧风格
            button.innerHTML = '<span class="material-icons" style="font-size: 18px; color: #444;">my_location</span>';
            // 🛡️ 核心细节：阻止点击事件穿透到底层的地图上
            L.DomEvent.disableClickPropagation(button);
            L.DomEvent.disableScrollPropagation(button); // 防止在按钮上滚动鼠标滚轮使地图缩放

           // 监听点击事件
            button.onclick = function(e) {
                e.preventDefault(); 

                // 1. 检查浏览器是否支持定位
                if (!navigator.geolocation) {
                    alert('您的浏览器不支持地理定位功能');
                    return;
                }

                const iconSpan = button.querySelector('.material-icons');
                
                // 视觉反馈：将图标变成蓝色，让用户知道“正在拼命获取位置”
                iconSpan.style.color = '#007bff'; 

                // 2. 调用浏览器原生 API
                navigator.geolocation.getCurrentPosition(
                    // --- 🟢 成功回调 ---
                    (position) => {
                        iconSpan.style.color = '#444'; // 恢复图标原本颜色

                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;

                        console.log(`[定位成功] 坐标: ${lat}, ${lng}`);

                        // 坐标转换
                        const [viewLat, viewLng] = toView(lat, lng);

                        // 3. 视角飞跃 (flyTo)
                        // 参数: [纬度, 经度], 缩放级别(16能看清街道), 动画配置
                        map.flyTo([viewLat, viewLng], 16, {
                            animate: true,
                            duration: 1.5 // 飞行时间 1.5 秒
                        });

                        // 4. 红点标记 (单例模式)
                        if (userLocationMarker) {
                            // 💡 情况 A: 已经点过一次了，直接“瞬移”现有的红点，不创造新点
                            userLocationMarker.setLatLng([viewLat, viewLng]);
                        } else {
                            // 💡 情况 B: 第一次点击，创建一个高级的 CSS 纯代码红点
                            const redDotIcon = L.divIcon({
                                className: 'my-location-icon',
                                // 纯手写一个带白边、带阴影的红圆点
                                html: '<div style="background-color: #e74c3c; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
                                iconSize: [22, 22],
                                iconAnchor: [11, 11] // 锚点在正中心
                            });

                            // 把红点加到地图上，并赋值给全局变量
                            userLocationMarker = L.marker([viewLat, viewLng], { 
                                icon: redDotIcon,
                                zIndexOffset: 1002 // 保证我的位置永远在最顶层，不被别的笔记遮住
                            }).addTo(map)
                              .bindPopup('<b>📍 您当前的位置</b>'); // 附带一个小气泡
                        }
                    },
                    // --- 🔴 失败回调 (异常兜底) ---
                    (error) => {
                        iconSpan.style.color = '#444'; // 恢复图标颜色
                        
                        let errorMsg = '定位失败';
                        switch(error.code) {
                            case error.PERMISSION_DENIED: errorMsg = '您拒绝了定位权限请求，请在浏览器地址栏左侧修改权限。'; break;
                            case error.POSITION_UNAVAILABLE: errorMsg = '当前位置信息不可用，可能没有 GPS 信号。'; break;
                            case error.TIMEOUT: errorMsg = '获取位置超时。'; break;
                        }
                        alert(errorMsg);
                        console.error('[定位失败]', error);
                    },
                    // --- ⚙️ 定位配置参数 ---
                    {
                        enableHighAccuracy: true, // 强制要求高精度 (使用设备硬件 GPS)
                        timeout: 10000,           // 最多等 10 秒
                        maximumAge: 0             // 拒绝使用浏览器缓存的旧位置
                    }
                );
            };

            return container;
        }
    });

    map.addControl(new LocateControl());
}

//   自定义控件模块：热力图切换按钮

function addHeatmapControl(map) {
    const HeatmapControl = L.Control.extend({
        options: { position: 'bottomleft' }, // 同样放在左下角，Leaflet会自动把它们叠在一起
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = '切换热力图视图';
            button.style.display = 'flex';
            button.style.justifyContent = 'center';
            button.style.alignItems = 'center';
            button.style.paddingLeft = '4px';

            // ⚡️ 赋给它一个独特的 ID：leaflet-heat-icon，方便后续用 JS 修改它的颜色和图标
            button.innerHTML = '<span class="material-icons" id="leaflet-heat-icon" style="font-size: 18px; color: #1a73e8;">layers</span>';
            
            L.DomEvent.disableClickPropagation(button);
            L.DomEvent.disableScrollPropagation(button);

            button.onclick = function(e) {
                e.preventDefault();
                toggleHeatmapMode(); // 调用底部的切换函数
            };
            return container;
        }
    });

    map.addControl(new HeatmapControl());
}


export function initMap() {

    // [读档]: 从浏览器记事本 (localStorage) 里读取用户上次的习惯
    // 如果是第一次来没数据，就使用 || 后面的默认值
    const savedCenter = JSON.parse(localStorage.getItem('MAPPIN_CENTER')) || [31.88, 118.82];
    const savedZoom = parseInt(localStorage.getItem('MAPPIN_ZOOM'), 10) || 13;
    const savedLayerKey = localStorage.getItem('MAPPIN_LAYER') || 'gaode';
    // if(!savedLayerKey) savedLayerKey = 'gaode';


    //动态生成图层对象
    const layers = {};
    let defaultLayer = null;
    
    // 用来记录图层名字(name)和键值(key)的对应关系，方便存档
    const layerNameToKey = {};

    // 遍历配置生成 Layer 实例
    for (const [key, config] of Object.entries(TILE_LAYERS_CONFIG)) {
        let layer;
        
        // 检查是否为“组合图层 (isGroup)”
        if (config.isGroup && Array.isArray(config.urls)) {
            // 用 L.layerGroup 把多个瓦片层打包成一个单一可切换的底图
            const tileLayers = config.urls.map(url => L.tileLayer(url, config.options));
            layer = L.layerGroup(tileLayers);
        } else {
            // 普通单层瓦片图
            layer = L.tileLayer(config.url, config.options);
        }
        
        layers[config.name] = layer;
        layerNameToKey[config.name] = key; // 建立反向映射字典
        
        // [应用图层习惯]: 如果当前遍历的 key 等于用户上次保存的图层，就把它设为默认
        if (key === savedLayerKey) {
            defaultLayer = layer;
        }
    }

    //防御性兜底
    if (!defaultLayer) {
        const availableLayers = Object.values(layers);
        if (availableLayers.length > 0) {
            defaultLayer = availableLayers[0]; // 强行拿第一张地图来救场
            // 顺便把 localStorage 里的脏数据覆盖掉，防止下次接着报错
            const firstKey = Object.keys(TILE_LAYERS_CONFIG)[0];
            localStorage.setItem('MAPPIN_LAYER', firstKey);
            console.warn(`[恢复默认图层] 之前保存的地图源已失效，已自动重置为: ${firstKey}`);
        } else {
            // 如果连 TILE_LAYERS_CONFIG 都被你清空了，那就只能抛出明确错误了
            console.error("致命错误：TILE_LAYERS_CONFIG 中没有任何可用的地图图层！");
        }
    }

    // 1. 初始化地图
    map = L.map('map', {
        doubleClickZoom: false,
        center: savedCenter, 
        zoom: savedZoom,
        zoomControl: false, // 我们先把默认的缩放控件关了，后面可以换位置
        layers: [defaultLayer]  // 默认显示的图层
    });

    // 添加图层控制器 
    // position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
    L.control.layers(layers, null, { 
        position: 'bottomleft', // 👈 移到左下角，避开头像
        collapsed: true         // 设为 false 可以让它永远展开(如果你喜欢)
    }).addTo(map);

    // 初始化标记图层组，并添加到地图上
    initMarkerCluster(map);

    // 自定义定位控件
    addLocateControl(map);
    addHeatmapControl(map);

    // ==========================================
    // 💾 状态持久化：自动存档监听器
    // ==========================================

    // 1. 监听【图层切换】事件
    map.on('baselayerchange', (e) => {
        // e.name 是你在 TILE_LAYERS_CONFIG 里配置的中文/展示名称 (比如 "卫星图")
        // 我们通过之前建好的 layerNameToKey 字典，把它翻译回内部的 key (比如 'satellite')
        const newLayerKey = layerNameToKey[e.name];
        
        if (newLayerKey) {
            // 1. 拿出旧记录
            const oldLayerKey = localStorage.getItem('MAPPIN_LAYER') || 'osm';
            // 2. 存入新记录
            localStorage.setItem('MAPPIN_LAYER', newLayerKey);
            // 3. 检测
            if (isCoordinateSystemChanged(oldLayerKey, newLayerKey)) {
                if (window.loadNotes) window.loadNotes(); 
            } 
        }
    });

    // 2. 监听【地图移动或缩放结束】事件
    // moveend 包含了拖拽结束和缩放(zoom)结束，是记录视野的最佳时机
    map.on('moveend', () => {
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        
        // 坐标需要转成字符串数组存入，缩放倍数直接存数字
        localStorage.setItem('MAPPIN_CENTER', JSON.stringify([currentCenter.lat, currentCenter.lng]));
        localStorage.setItem('MAPPIN_ZOOM', currentZoom);
    });

    return map; // 返回实例供其他模块使用
}

export function getMap() {
    return map;
}


// 清空所有标记
export function clearMarkers() {
    if (markersLayer) {
        markersLayer.clearLayers(); // Leaflet 原生方法，瞬间清空
    }
}

// 修改：添加标记到图层组，而不是直接添加到 map
export function addMarker(note, onClickCallback) {
    if (!markersLayer) return; //以此确保容器存在

    // 获取统一图标
    const icon = getIconForNote(note, false);

    // 如果为火星坐标系,进行坐标转换
    const [viewLat, viewLng] = toView(note.lat, note.lng);

    // 创建标记
    const marker = L.marker([viewLat, viewLng], { icon: icon }).addTo(markersLayer);
    
    // 绑定点击事件
    if (onClickCallback) {
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e); // 阻止冒泡
            onClickCallback(note); // 回传 note 数据
        });
    }

    // 绑定 Tooltip (鼠标悬停显示信息)
    const dateStr = new Date(note.created_at).toLocaleDateString();
    const tooltipContent = `
        <div style="text-align:center;line-height: 1.4;">
            <b style="font-size: 14px;">${note.title}</b><br>
            <span style="color: #666; font-size: 12px;">${note.username} · ${dateStr}</span>
        </div>
    `;

    marker.bindTooltip(tooltipContent, {
        direction: 'top', 
        offset: [0, -30],
        className: 'custom-tooltip'
    });

    return marker;
}

// 专属于聚合图层的初始化函数
// 请确保在 app.js 初始化地图(L.map)后，立刻调用这个函数
export function initMarkerCluster(map) {
    // 如果已经有了，先从地图上移除
    if (markersLayer) {
        map.removeLayer(markersLayer);
    }
    
    // 魔法变身：使用 L.markerClusterGroup 替代普通的 L.layerGroup
    markersLayer = L.markerClusterGroup({
        showCoverageOnHover: false, // 隐藏鼠标悬浮时出现的丑陋多边形边界
        maxClusterRadius: 40,       // 聚合半径（像素），越小气泡越多，越大越容易聚成一个大球
        spiderfyOnMaxZoom: true,    // 开启震撼的“蜘蛛网”裂变特效（重叠点放大到极限后炸开）
        zoomToBoundsOnClick: true,   // 点击气泡时，自动平滑缩放飞跃过去

        // 接管聚合图标的生成
        iconCreateFunction: function(cluster) {
            // 1. 获取这个气泡里到底“吃掉”了多少个红点
            const count = cluster.getChildCount(); 
            
            // 2. 根据数量，给气泡分配不同的大小/颜色类别
            let sizeClass = 'cluster-small';
            if (count >= 10) sizeClass = 'cluster-medium';
            if (count >= 50) sizeClass = 'cluster-large';

            // 3. 返回一个纯粹由 HTML 和 CSS 构成的 DivIcon
            return L.divIcon({
                // 生成内部的 HTML 结构，填入数字
                html: `<div><span>${count}</span></div>`,
                // 绑定自定义的基类和体积类
                className: `custom-marker-cluster ${sizeClass}`,
                // 声明图标的外壳尺寸（保证点击热区准确）
                iconSize: L.point(40, 40) 
            });
        }
    });
    
    // 把带有超能力的容器挂载到地图上
    map.addLayer(markersLayer);
}


/**
 * ⚡️ 添加草稿标记
 * @param {Object} draft - 草稿对象
 * @param {Function} onClick - 点击时的回调 (打开编辑器)
 */
export function addDraftMarker(draft, onClick) {
    if (!markersLayer) return; //以此确保容器存在

    const icon = getIconForNote(draft, true);

    // 如果为火星坐标系,进行坐标转换
    const [viewLat, viewLng] = toView(draft.lat, draft.lng);

    const marker = L.marker([viewLat, viewLng], {
        icon: icon,
        opacity: 0.7, // ⚡️ 草稿稍微透明一点，以示区别
        zIndexOffset: 500 // ⚡️ 让草稿浮在普通标记上面 (可选)
    });

    // 绑定点击事件
    marker.on('click', () => {
        if (typeof onClick === 'function') {
            onClick(draft);
        }
    });

    marker.addTo(markersLayer)
    
    // 可选：给草稿加个 Tooltip
    marker.bindTooltip("📝 草稿: " + (draft.title || "点击继续编辑"), {
        direction: 'top',
        offset: [0, -35]
    });

    

    return marker;
}

// 移动地图视角
export function fitToMarkers() {
    // markersLayer.getLayers() 返回所有标记数组
    const markers = markersLayer.getLayers();
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

// --- 飞跃到指定位置 ---
export function flyToNote(lat, lng) {
    if (!map) return;

    // 1. 拦截并转换坐标 (WGS84 -> 屏幕视图坐标)
    const [viewLat, viewLng] = toView(lat, lng);

    // 2. 调用 Leaflet 原生飞跃方法
    map.flyTo([viewLat, viewLng], 10, {
        animate: true,
        duration: 1.5 // 飞行时间 1.5 秒，纵享丝滑
    });

    // 3. 自动关闭侧边栏，把视野还给地图
    // 因为 closeProfileDrawer 写在 uiManager.js 里，我们可以直接操作 DOM 类名，或者调用暴露的全局方法
    const drawer = document.getElementById('profile-drawer');
    const backdrop = document.getElementById('profile-backdrop');
    if (drawer && backdrop) {
        drawer.classList.remove('open');
        backdrop.classList.remove('active');
    }
}

// ⚡️ 新增：暴露关闭弹窗的方法
export function closeMapPopup() {
    if (map) {
        map.closePopup();
    }
}

// ==========================================
// 🔥 热力图引擎 (Heatmap Engine)
// ==========================================

// 渲染热力图数据
export function renderHeatmap(notes) {
    if (!map) return;

    // A. 每次渲染前，先清除旧的热力图层
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    // B. 从 notes 中提取坐标，并进行火星坐标转换
    // 热力图格式要求: [[lat, lng, intensity], ...] 
    const heatData = notes.map(note => {
        const [viewLat, viewLng] = toView(note.lat, note.lng);
        return [viewLat, viewLng, 1]; // 1 代表权重强度
    });

    // C. 生成全新的热力图层 (配置颜色渐变和扩散半径)
    heatLayer = L.heatLayer(heatData, {
        radius: 25,    // 每个点的发散半径
        blur: 15,      // 模糊度，越大颜色交织越柔和
        maxZoom: 15,   // 超过这个缩放级别，点就不再扩散了
        // 经典的红蓝渐变色卡
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
    });

    // D. 如果当前刚好是热力图模式，就立刻把它贴到地图上
    if (isHeatmapMode) {
        heatLayer.addTo(map);
    }
}

// 切换视图模式 (供悬浮按钮点击调用)
export function toggleHeatmapMode() {
    isHeatmapMode = !isHeatmapMode;
    // ⚡️ 注意：这里的 ID 换成了刚才在控件里定义的 ID
    const btnIcon = document.getElementById('leaflet-heat-icon');

    if (isHeatmapMode) {
        if (markersLayer) map.removeLayer(markersLayer);
        if (heatLayer) heatLayer.addTo(map);
        
        if (btnIcon) {
            btnIcon.innerText = 'whatshot';
            btnIcon.style.color = '#d93025'; // 危险红 (var(--danger-color))
        }
    } else {
        if (heatLayer) map.removeLayer(heatLayer);
        if (markersLayer) markersLayer.addTo(map);
        
        if (btnIcon) {
            btnIcon.innerText = 'layers';
            btnIcon.style.color = '#1a73e8'; // 主题蓝
        }
    }
}