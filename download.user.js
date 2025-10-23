// ==UserScript==
// @name         kekenet course downloader
// @namespace    https://www.kekenet.com
// @version      1.0.0
// @description  download all files in kekenet course
// @author       yaosunwen
// @match        https://www.kekenet.com/course/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js
// @grant        GM_log
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @run-at       document-idle
// @connect      *
// ==/UserScript==


/**
 * ----------------------------------------------------------------------------
 * 基础函数
 * ----------------------------------------------------------------------------
 */

const debug = msg => GM_log(msg);
//const debug = msg => {};
const info = msg => GM_log(msg);


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


/**
 * 循环执行doFunction，直到checkFunction满足为止，或者超时。
 * timeout为-1，代表无超时限制。
 */
async function doUntil(doFunction, checkFunction, timeout, interval) {
    timeout = timeout || 5000;
    interval = interval || 100;

    let end = Date.now() + timeout;

    while (true) {
        let result = await doFunction();
        if (await checkFunction(result)) {
            return result;
        } else if (timeout === -1) {
            await sleep(interval);
        } else {
            let now = Date.now();
            if (now > end) {
                return result;
            } else {
                await sleep(Math.min(interval, end - now));
            }
        }
    }
}


function findElementsByText(selector, text) {
    return [...document.querySelectorAll(selector)].filter(el => el.textContent.includes(text));
}

function findElementByText(selector, text) {
    return findElementsByText(selector, text).shift();
}

async function waitFor(selector, timeout) {
    return await doUntil(
        async () => document.querySelector(selector),
        async (o) => o !== null,
        timeout || -1,
        500);
}


/**
 * 监听url改变事件，触发handler执行
 * handler: function()
 */
function triggerWhenUrlChanged(handler) {
    let last = location.pathname + location.search + location.hash;

    setInterval(async function() {
        let current = location.pathname + location.search + location.hash;
        if (last !== current) {
            last = current;
            await handler();
        }
    }, 500);
}


/**
 * 监听dom结构变更事件，触发handler执行
 * handler: function()
 */
function triggerWhenDomChanged(element, handler, delay) {
    if (element.dataset.domChangeListenerInstalled) {
        debug(`dom change listener is installed, ignored`);
        return;
    }

    debug(`install dom change listener`);
    element.dataset.domChangeListenerInstalled = true;

    if (delay === undefined || delay === null) {
        delay = 1000;
    }

    let timerId = null;
    const observer = new MutationObserver(async function(mutations, observer) {
        observer.takeRecords(); // 丢弃剩余的变更记录
        if (timerId !== null) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(handler, delay);
    });

    observer.observe(element, {attributes: true, childList: true, subtree: true});
}


function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstChild;
}


/**
 * ----------------------------------------------------------------------------
 * 应用函数
 * ----------------------------------------------------------------------------
 */

function decodeData(data, key = "51E881E6F2A6Y9K8", iv = "9F0885C2D686C418") {
    iv = CryptoJS.enc.Utf8.parse(iv),
        data = CryptoJS.enc.Hex.parse(data),
        data = CryptoJS.enc.Base64.stringify(data);
    return CryptoJS.AES.decrypt(
        data,
        CryptoJS.enc.Utf8.parse(key),
        {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8).toString();
}

function getNewsPage(catId, pageNumber, pageSize=10) {
    return new Promise((resolve, reject) => {
        let now = Date.now();
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://mob2015.kekenet.com/keke/mobile/index.php",
            data: `{
                "Version": "4.0",
                "Terminal": 13,
                "ApTime": ${now},
                "ApVersionCode": 100,
                "AppFlag": 18,
                "Method": "web_waikan_wknewslist",
                "Params": {
                    "catid": "${catId}",
                    "PageSize": ${pageSize},
                    "PageIndex": ${pageNumber},
                    "Sort": "inputtime asc"
                },
                "Sign": "",
                "Token": "",
                "UID": ""
            }`,
            headers: {
                "Content-Type": "application/json;charset=utf-8"
            },
            onload: function(response) {
                let obj = JSON.parse(response.responseText);
                if (obj.Code !== 200) {
                    reject(obj.Error);
                    return;
                }
                if (obj.IsDecode === 1) {
                    obj.Data = decodeData(obj.Data);
                }
                resolve(JSON.parse(obj.Data));
            },
            onerror: function(error) {
                reject(error);
            }
        });
    });
}

async function download() {
    debug(`download()`);

    debug(`location.pathname = ${location.pathname}`);
    let match = /\/course\/(.*)/.exec(location.pathname);
    let courseId = match ? match[1] : null;
    debug(`courseId = ${courseId}`);
    if (courseId === null) {
        info(`courseId was not found.`);
        return;
    }

    // Generator函数：串行生成页面数据
    async function* generatePages(courseId) {
        // 获取第一页
        const firstPage = await getNewsPage(courseId, 1);
        yield firstPage;

        // 计算总页数
        const totalCount = Number(firstPage.rowcount);
        const totalPage = Math.ceil(totalCount / 10);

        // 获取剩余页面
        for (let pageIndex = 2; pageIndex <= totalPage; pageIndex++) {
            const page = await getNewsPage(courseId, pageIndex);
            yield page;
        }
    }

    const pageGenerator = generatePages(courseId);
    for await (const page of pageGenerator) {
        debug(page);
        page.list
            ?.filter(item => item.title && item.download)
            ?.forEach(({ title, download }) => {
                debug(`download ${title} from https://k6.kekenet.com/${download}`);
                GM_download({
                    url: 'https://k6.kekenet.com/' + download,
                    name: title,
                    saveAs: true,
                    conflictAction: 'overwrite',
                });
            });
    }
}

async function initialize() {
    debug(`initialize()`);
    const newsCardBox = await waitFor('#app div.card-box.news-list', 3000);
    if (newsCardBox == null) {
        info(`newsCardBox was not found.`);
        return;
    }
    if (newsCardBox.dataset.isInitialized !== undefined) {
        return;
    }
    newsCardBox.dataset.isInitialized = true;

    const downloadButton = htmlToElement('<div data-v-b8c896e0 class="card-top-bar"><button>下载</button></div>');
    downloadButton.addEventListener('click', download);
    newsCardBox.querySelector('div.card-top > div.card-top-right').appendChild(downloadButton);
}


(async function() {
    'use strict';
    debug('kekenet course downloader loaded');
    triggerWhenUrlChanged(initialize);
    await initialize();
})();