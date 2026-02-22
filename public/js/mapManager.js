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

    // carto_light: {
    //     name: "🏳️ 灰色 (CartoDB)",
    //     url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    //     options: { attribution: '&copy; OpenStreetMap &copy; CartoDB', subdomains: 'abcd' }
    // },

    // dark: {
    //     name: "🌑 深色模式 (CartoDB)",
    //     url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    //     options: { attribution: '&copy; CartoDB' }
    // },
    gaode: {
        name: "🚗 高德地图 (有偏移)",
        url: 'http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: { subdomains: "1234" }
    },

    // // 2. [高对比] OSM 人道主义 (推荐！颜色好看)
    // osm_hot: {
    //     name: "🔥 人道主义(OSM)",
    //     url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    //     options: { attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OSM France' }
    // },

    // // 3. [功能] 骑行地图 (带等高线)
    // osm_cycle: {
    //     name: "🚲 骑行与地形(OSM)",
    //     url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    //     options: { attribution: '&copy; CyclOSM' }
    // },

    // // 4. [功能] 公共交通
    // osm_transport: {
    //     name: "🚇 公共交通(OSM)",
    //     url: 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
    //     options: { attribution: '&copy; ÖPNVkarte' }
    // }

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

export function initMap() {

    // [读档]: 从浏览器记事本 (localStorage) 里读取用户上次的习惯
    // 如果是第一次来没数据，就使用 || 后面的默认值
    const savedCenter = JSON.parse(localStorage.getItem('MAPPIN_CENTER')) || [31.88, 118.82];
    const savedZoom = parseInt(localStorage.getItem('MAPPIN_ZOOM'), 10) || 13;
    const savedLayerKey = localStorage.getItem('MAPPIN_LAYER') || 'osm';


    //动态生成图层对象
    const layers = {};
    let defaultLayer = null;
    
    // 用来记录图层名字(name)和键值(key)的对应关系，方便存档
    const layerNameToKey = {};

    // 遍历配置生成 Layer 实例
    for (const [key, config] of Object.entries(TILE_LAYERS_CONFIG)) {
        const layer = L.tileLayer(config.url, config.options);
        layers[config.name] = layer;
        layerNameToKey[config.name] = key; // 建立反向映射字典
        
        // [应用图层习惯]: 如果当前遍历的 key 等于用户上次保存的图层，就把它设为默认
        if (key === savedLayerKey) {
            defaultLayer = layer;
        }
    }

    // 防御性兜底：万一存的图层失效了，强行切回 osm
    if (!defaultLayer && layers['osm']) {
        defaultLayer = layers['osm'];
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
    markersLayer = L.layerGroup().addTo(map);

    // 自定义定位控件
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

    // 把我们自定义的控件加到地图上
    map.addControl(new LocateControl());

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

// // --- 持久化状态保存函数 ---
// export function saveUserViewState(lat, lng) {
//     if (!lat || !lng) return;

//     // 1. 保存最后编辑/发布的坐标
//     localStorage.setItem('MAPPIN_CENTER', JSON.stringify([lat, lng]));

//     // 2. 获取当前地图真实的放大倍数并保存
//     const mapInstance = getMap();
//     if (mapInstance) {
//         localStorage.setItem('MAPPIN_ZOOM', mapInstance.getZoom());
//     }

//     console.log(`[状态持久化] 已记录最后活动坐标: ${lat}, ${lng}`);
// }


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

// ⚡️ 新增：暴露关闭弹窗的方法
export function closeMapPopup() {
    if (map) {
        map.closePopup();
    }
}