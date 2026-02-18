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

    carto_light: {
        name: "🏳️ 灰色 (CartoDB)",
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: { attribution: '&copy; OpenStreetMap &copy; CartoDB', subdomains: 'abcd' }
    },

    dark: {
        name: "🌑 深色模式 (CartoDB)",
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: { attribution: '&copy; CartoDB' }
    },
    gaode: {
        name: "🚗 高德地图 (有偏移)",
        url: 'http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: { subdomains: "1234" }
    },

    // 2. [高对比] OSM 人道主义 (推荐！颜色好看)
    osm_hot: {
        name: "🔥 人道主义(OSM)",
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        options: { attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OSM France' }
    },

    // 3. [功能] 骑行地图 (带等高线)
    osm_cycle: {
        name: "🚲 骑行与地形(OSM)",
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        options: { attribution: '&copy; CyclOSM' }
    },

    // 4. [功能] 公共交通
    osm_transport: {
        name: "🚇 公共交通(OSM)",
        url: 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
        options: { attribution: '&copy; ÖPNVkarte' }
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

export function initMap() {
    //动态生成图层对象
    const layers = {};
    let defaultLayer = null;

    // 遍历配置生成 Layer 实例
    for (const [key, config] of Object.entries(TILE_LAYERS_CONFIG)) {
        const layer = L.tileLayer(config.url, config.options);
        layers[config.name] = layer;
        
        // 默认使用 OSM
        if (key === 'osm') defaultLayer = layer;
    }

    // 1. 初始化地图
    map = L.map('map', {
        doubleClickZoom: false,
        center: [31.88, 118.82], 
        zoom: 13,
        zoomControl: false, // 我们先把默认的缩放控件关了，后面可以换位置
        layers: [defaultLayer]  // 默认显示的图层
    });

    // 添加图层控制器 
    // position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
    L.control.layers(layers, null, { 
        position: 'bottomleft', // 👈 移到左下角，避开头像
        collapsed: true         // 设为 false 可以让它永远展开(如果你喜欢)
    }).addTo(map);

    // ⚡️ 初始化标记图层组，并添加到地图上
    markersLayer = L.layerGroup().addTo(map);

    return map; // 返回实例供其他模块使用
}

export function getMap() {
    return map;
}

// ⚡️ 新增：一键清空所有标记
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


    // 创建标记
    const marker = L.marker([note.lat, note.lng], { icon: icon }).addTo(markersLayer);
    
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

    const marker = L.marker([draft.lat, draft.lng], {
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