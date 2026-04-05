/**
 * BaboonTalkies Dashboard - 公共 JavaScript 函数
 */

const LEGACY_MANAGER_HOSTS = new Set(['fc.pandada.world']);
const LEGACY_MANAGER_BASE_PATH = '/baboontalkies_manager';
const CANONICAL_MANAGER_ORIGIN = 'https://baboontalkies.pandada.world';

// 避免页面继续留在旧阿里云入口，优先跳转到正式入口。
(() => {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname;
    const isLegacyHost = LEGACY_MANAGER_HOSTS.has(hostname);
    const hasLegacyBasePath = pathname === LEGACY_MANAGER_BASE_PATH
        || pathname.startsWith(`${LEGACY_MANAGER_BASE_PATH}/`);

    if (!isLegacyHost && !hasLegacyBasePath) {
        return;
    }

    const targetOrigin = isLegacyHost ? CANONICAL_MANAGER_ORIGIN : window.location.origin;
    let targetPath = pathname;
    if (targetPath === LEGACY_MANAGER_BASE_PATH) {
        targetPath = '/';
    } else if (targetPath.startsWith(`${LEGACY_MANAGER_BASE_PATH}/`)) {
        targetPath = targetPath.substring(LEGACY_MANAGER_BASE_PATH.length);
    }

    const targetUrl = `${targetOrigin}${targetPath}${window.location.search}${window.location.hash}`;
    if (targetUrl !== window.location.href) {
        console.warn('检测到旧 manager 入口，正在跳转到正式地址:', targetUrl);
        window.location.replace(targetUrl);
    }
})();

// 自动检测 BASE_PATH
const BASE_PATH = (() => {
const path = window.location.pathname;
// 如果路径包含 /baboontalkies_manager，则使用它作为 BASE_PATH
if (path.includes(LEGACY_MANAGER_BASE_PATH)) {
return LEGACY_MANAGER_BASE_PATH;
}
// 否则使用空字符串（本地开发环境）
return '';
})();

const MANAGER_LOGO_PATH = `${BASE_PATH || ''}/src/Baboon_Talkies.png`;

console.log('🔧 检测到 BASE_PATH:', BASE_PATH || '(空 - 本地开发)');

function ensureManagerFavicon() {
    const faviconHref = MANAGER_LOGO_PATH;
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    favicon.href = faviconHref;
}

function initManagerBranding() {
    ensureManagerFavicon();

    const sidebarHeader = document.querySelector('.sidebar-header');
    if (!sidebarHeader || sidebarHeader.querySelector('.sidebar-brand')) {
        return;
    }

    const title = sidebarHeader.querySelector('h1');
    if (!title) {
        return;
    }

    const refreshInfo = sidebarHeader.querySelector('.refresh-info');
    const brand = document.createElement('div');
    brand.className = 'sidebar-brand';

    const logo = document.createElement('img');
    logo.className = 'sidebar-brand-logo';
    logo.src = MANAGER_LOGO_PATH;
    logo.alt = 'BaboonTalkies Logo';
    logo.decoding = 'async';

    const copy = document.createElement('div');
    copy.className = 'sidebar-brand-copy';
    copy.appendChild(title);

    if (refreshInfo) {
        copy.appendChild(refreshInfo);
    }

    brand.appendChild(logo);
    brand.appendChild(copy);
    sidebarHeader.prepend(brand);
}

// 全局汇率配置变量
let exchangeRates = {
    cny_to_pesos: null,
    pesos_exchange: null,
    dollars_exchange: 7.12
};

function resolveCnyToPesosRate(rates = exchangeRates) {
    const directRate = Number(rates?.cny_to_pesos);
    if (Number.isFinite(directRate) && directRate > 0) {
        return directRate;
    }

    const legacyRate = Number(rates?.pesos_exchange);
    if (Number.isFinite(legacyRate) && legacyRate > 0) {
        return legacyRate < 1 ? (1 / legacyRate) : legacyRate;
    }

    return null;
}

// ClassIn 配置 API 地址
const CLASSIN_API_BASE = 'https://baboontalkies-backend-627990150052.asia-southeast1.run.app';

/**
 * Tab 加载动画函数
 */
function showTabLoading(tabId, message = '加载中...') {
    const tabContent = document.getElementById(tabId);
    if (!tabContent) return;

    // 移除已存在的加载动画
    hideTabLoading(tabId);

    const overlay = document.createElement('div');
    overlay.className = 'tab-loading-overlay';
    overlay.innerHTML = `
        <div class="tab-loading-spinner"></div>
        <div class="tab-loading-text">${message}</div>
    `;
    tabContent.appendChild(overlay);
}

function hideTabLoading(tabId) {
    const tabContent = document.getElementById(tabId);
    if (!tabContent) return;
    const overlay = tabContent.querySelector('.tab-loading-overlay');
    if (overlay) overlay.remove();
}

/**
 * Toast 提示函数
 */
function showToast(message, type = 'info') {
    // 移除现有的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // 添加CSS样式（如果尚未添加）
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 8px;
                color: white;
                font-size: 14px;
                z-index: 10000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease;
            }
            .toast-success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            }
            .toast-error {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            }
            .toast-info {
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            }
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 添加到页面
    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 自动隐藏
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

/**
 * 显示Loading遮罩层
 */
function showLoadingOverlay(message = '正在抓取最新的约课宝数据，请稍候...') {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <h2>数据刷新中</h2>
            <p id="loadingMessage">${message}</p>
        </div>
    `;

    document.body.appendChild(loadingOverlay);
}

/**
 * 隐藏Loading遮罩层
 */
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
}

/**
 * 格式化刷新时间
 */
function formatRefreshTime(timeString) {
    if (!timeString) return '未知';

    try {
        const date = new Date(timeString);
        const now = new Date();
        const timeDiff = now - date;

        // 计算时间差
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days}天前`;
        } else if (hours > 0) {
            return `${hours}小时前`;
        } else if (minutes > 0) {
            return `${minutes}分钟前`;
        } else {
            return '刚刚';
        }
    } catch (error) {
        console.error('时间格式化失败:', error);
        return '格式错误';
    }
}

/**
 * 根据货币单位格式化金额
 */
function formatCurrency(amount, currency) {
    if (!currency) currency = 'rmb';

    if (currency === 'pesos') {
        return Math.round(amount).toString();
    } else if (currency === 'dollars') {
        return amount.toFixed(1);
    } else {
        // rmb 或其他货币保持2位小数
        return amount.toFixed(2);
    }
}

/**
 * 获取最后刷新时间
 */
async function loadLastRefreshTime() {
    const lastRefreshElement = document.getElementById('lastRefreshTime');
    const dateRangeElement = document.getElementById('dataDateRange');

    if (!lastRefreshElement) return;

    try {
        const response = await fetch(BASE_PATH + '/api/last-refresh-time');
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '获取刷新时间失败');
        }

        if (result.lastRefreshTime) {
            const formattedTime = formatRefreshTime(result.lastRefreshTime);
            lastRefreshElement.textContent = formattedTime;
        } else {
            lastRefreshElement.textContent = '暂无数据';
        }

        // 显示数据日期范围
        if (result.dateRange && dateRangeElement) {
            dateRangeElement.textContent = `数据范围: ${result.dateRange}`;
        }

    } catch (error) {
        console.error('获取最后刷新时间失败:', error);
        if (lastRefreshElement) {
            lastRefreshElement.textContent = '获取失败';
        }
    }
}

/**
 * 加载汇率配置
 */
async function loadExchangeRates() {
    const dollarsExchangeInput = document.getElementById('dollarsExchange');
    const pesosExchangeInput = document.getElementById('pesosExchange');
    const autoFeedbackPromptInput = document.getElementById('autoFeedbackPrompt');

    try {
        const response = await fetch(BASE_PATH + '/api/config');
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '获取汇率配置失败');
        }

        if (result.config) {
            exchangeRates = result.config;

            // 更新界面显示
            if (dollarsExchangeInput) {
                dollarsExchangeInput.value = exchangeRates.dollars_exchange || 7.12;
            }
            if (pesosExchangeInput) {
                const cnyToPesos = resolveCnyToPesosRate(exchangeRates);
                pesosExchangeInput.value = Number.isFinite(cnyToPesos) ? cnyToPesos.toFixed(4) : '';
            }

            if (autoFeedbackPromptInput) {
                autoFeedbackPromptInput.value = result.config.auto_feedback_prompt || '';
            }
        }

    } catch (error) {
        console.error('加载汇率配置失败:', error);
        // 不再静默回退历史汇率，避免工资页误算
        exchangeRates = {
            cny_to_pesos: null,
            pesos_exchange: null,
            dollars_exchange: 7.12
        };

        // 更新界面显示默认值
        if (dollarsExchangeInput) {
            dollarsExchangeInput.value = 7.12;
        }
        if (pesosExchangeInput) {
            pesosExchangeInput.value = '';
        }
        if (autoFeedbackPromptInput) {
            autoFeedbackPromptInput.value = '';
        }
    }
}

/**
 * 刷新数据功能
 */
async function refreshData() {
    const refreshButton = document.getElementById('refreshButton');
    if (!refreshButton) return;

    const originalText = refreshButton.textContent;

    try {
        // 禁用按钮并显示加载状态
        refreshButton.disabled = true;
        refreshButton.classList.add('loading');
        refreshButton.textContent = '刷新中...';

        // 显示Loading遮罩层
        showLoadingOverlay();

        // 调用刷新API
        const response = await fetch(BASE_PATH + '/api/refresh-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '刷新失败');
        }

        // 数据抓取成功，重新加载页面数据
        if (typeof loadData === 'function') {
            await loadData();
        }
        await loadLastRefreshTime();

        // 隐藏遮罩层并显示成功提示
        hideLoadingOverlay();
        showToast('数据刷新成功！', 'success');

    } catch (error) {
        console.error('刷新数据失败:', error);
        hideLoadingOverlay();
        showToast(`刷新失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        refreshButton.disabled = false;
        refreshButton.classList.remove('loading');
        refreshButton.textContent = originalText;
    }
}

/**
 * 设置刷新按钮功能
 */
function setupRefreshButton() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshData);
    }
}

/**
 * 侧边栏导航高亮
 */
function initSidebarNav() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.sidebar-nav a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        // 精确匹配，或匹配带/不带尾部斜杠
        if (currentPath === href || currentPath === href + '/' || currentPath + '/' === href) {
            link.classList.add('active');
        }
    });
}

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 初始化品牌 Logo
    initManagerBranding();

    // 初始化侧边栏导航
    initSidebarNav();

    // 加载刷新时间
    loadLastRefreshTime();

    // 加载汇率配置
    loadExchangeRates();

    // 设置刷新按钮
    setupRefreshButton();
});
