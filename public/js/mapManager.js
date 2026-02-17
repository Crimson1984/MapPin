// public/js/mapManager.js
import { Icons } from './utils.js';

let map = null; // 模块内部私有变量
let markersLayer = null; // ⚡️ 新增：用于存放所有标记的容器

export function initMap() {
    // 1. 初始化地图
    const map = L.map('map',{ doubleClickZoom: false }).setView([31.8889, 118.8142], 10);

    // 2. 加载图层
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
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

    // 根据可见性决定样式类名
    let customClassName = '';
    if (note.visibility === 'private') customClassName = 'private-marker';
    else if (note.visibility === 'friends') customClassName = 'friend-marker';

    // 创建自定义 Icon (整合了你原来的逻辑)
    const myIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        tooltipAnchor: [16, -28],
        className: customClassName // 注入 CSS 类 (红/绿)
    });


    // 创建标记
    const marker = L.marker([note.lat, note.lng], { icon: myIcon }).addTo(markersLayer);
    
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