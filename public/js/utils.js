// public/js/utils.js

// 定义 Leaflet 图标
// 注意：这里假设 L (Leaflet) 已经在全局加载了 (因为我们在 HTML head 里引入了 CDN)
export const Icons = {
    default: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    }),
    red: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    })
};

// 简单的防抖函数 (可选，用于优化搜索)
export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 在输入框光标处插入文本
export function insertAtCursor(myField, myValue) {
    if (!myField) return;

    // 现代浏览器 (Chrome, Firefox, Edge) 支持 selectionStart
    if (myField.selectionStart || myField.selectionStart === 0) {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        
        // 插入文本
        myField.value = myField.value.substring(0, startPos)
            + myValue
            + myField.value.substring(endPos, myField.value.length);
        
        // 恢复光标位置到插入文本之后
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
    } else {
        // 降级处理 (虽然现在几乎没用了)
        myField.value += myValue;
    }
    
    // 触发 input 事件 (让 Vue/React 等框架知道变了，虽然这里是原生 JS)
    myField.dispatchEvent(new Event('input'));
}