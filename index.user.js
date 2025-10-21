// ==UserScript==
// @name         kekenet course player
// @namespace    https://www.kekenet.com
// @version      1.0.0
// @description  play course sequentially
// @author       yaosunwen
// @match        https://www.kekenet.com/lesson/*
// @match        https://www.kekenet.com/course/*
// @updateURL    https://raw.githubusercontent.com/yaosunwen/kekenet-course-player/main/index.user.js
// @downloadURL  https://raw.githubusercontent.com/yaosunwen/kekenet-course-player/main/index.user.js
// @grant        GM_log
// @grant        unsafeWindow
// @run-at       document-idle
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
        async () => $(selector),
        async (o) => o.length > 0,
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


const originOpen = unsafeWindow.open;
const hookedOpen = function() {
    debug(`hooked open: ${arguments[0]}, ${arguments[1]}`);
    const courseToPlayerChannel = new BroadcastChannel('course-to-player');
    courseToPlayerChannel.postMessage({code:'open', url:arguments[0]});
    courseToPlayerChannel.close();
}

async function findNextLessonItem(lastTitle) {
    debug(`findNextLessonItem(${lastTitle})`);
  
    const list = document.querySelectorAll('div.card-box > div.card-con > div.news-list-item');

    if (lastTitle == null && list.length > 0) {
        return list[0];
    }
  
    let foundIndex = -1;
    for (let index = 0; index < list.length; index++) {
        const title = list[index].querySelector('div.news-item-title').textContent;
        if (title === lastTitle) {
            foundIndex = index;
            break;
        }
    }
    debug(`foundIndex: ${foundIndex}, list.length: ${list.length}`);

    if (foundIndex === -1) {
        return null;
    } else if (foundIndex+1 < list.length) {
        return list[foundIndex+1]
    } else {
        const nextPageButton = document.querySelector('#app div.page-bar > div.el-pagination > button.btn-next.is-last');
        if (nextPageButton.disabled) {
            return null;
        }
      
        const firstItemTitle = document.querySelector('div.card-box > div.card-con > div.news-list-item:first-child div.news-item-title').textContent;
        nextPageButton.click();
        await doUntil(
            async () => document.querySelector('div.card-box > div.card-con > div.news-list-item:first-child div.news-item-title').textContent,
            async (e) => e == null || firstItemTitle !== e,
            5000,
            500);
        
        return await findNextLessonItem();
    }
}

async function findAndOpenNextLesson(lastTitle) {
    debug(`findAndOpenNextLesson(${lastTitle})`);
    let nextLessonItem = await findNextLessonItem(lastTitle);

    if (nextLessonItem == null) {
      info(`Unable to find next lesson of ${lastTitle}`);
      return;
    }
  
    unsafeWindow.open = hookedOpen;

    nextLessonItem.click();
    /*
    const rect = nextLessonItem.getBoundingClientRect();
    nextLessonItem.dispatchEvent(new MouseEvent('click', {
        view: unsafeWindow,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + (rect.width / 2),
        clientY: rect.top + (rect.height / 2),
        metaKey: true
    }));
     */

    unsafeWindow.open = originOpen;
}

async function setupPlayer() {
    debug(`setupPlayer()`);
    const playerbar = await doUntil(
        async () => document.querySelector('#app div.player-box div.player-bar'),
        async (e) => e != null,
        3000,
        500);
    if (playerbar == null) {
        debug(`playerbar was not found.`);
        return;
    }

    if (playerbar.dataset.isSetup === undefined) {
        playerbar.dataset.isSetup = 'yes';

        debug(`setup course-to-player channel`);
        const courseToPlayerChannel = new BroadcastChannel('course-to-player');
        courseToPlayerChannel.addEventListener("message", async (evt) => {
            let message = evt.data;
            debug('course-to-player:', message);
            if (message.code === 'open') {
                window.location.href = message.url;
            }
        });

        triggerWhenDomChanged(document.querySelector('#player-start'), function() {
            let current = document.querySelector('#player-start').textContent;
            if (current === '00:00') {
                const title = document.querySelector('div.player-box > div.player-top > div.player-title').textContent;
                const playerToCourseChannel = new BroadcastChannel("player-to-course");
                playerToCourseChannel.postMessage({code:'next', title: title});
                playerToCourseChannel.close();
            }
        }, 0);

        // press f8 to start player
        const f8Event = new KeyboardEvent('keydown', {
            key: 'F8',
            keyCode: 119, // Key code for F8
            which: 119,   // Deprecated, but good for broader compatibility
            bubbles: true, // Event bubbles up the DOM tree
            cancelable: true // Event can be canceled
        });
        playerbar.dispatchEvent(f8Event);
    }
}

async function setupCourse() {
    debug(`setupCourse()`);
    const pagebar = await doUntil(
        async () => document.querySelector('#app div.page-bar > div.el-pagination'),
        async (e) => e != null,
        3000,
        500);
    if (pagebar == null) {
        debug(`pagebar was not found.`);
        return;
    }

    if (pagebar.dataset.isSetup === undefined) {
        pagebar.dataset.isSetup = 'yes';

        debug(`setup player-to-course channel`);
        const playerToCourseChannel = new BroadcastChannel("player-to-course");
        playerToCourseChannel.addEventListener("message", async (evt) => {
            let message = evt.data;
            debug('player-to-course:', message);
            if (message.code === 'next') {
                await findAndOpenNextLesson(message.title);
            }
        });
    }
}

(async function() {
    'use strict';
    debug('kekenet course player loaded');
    const onChanged = async function() {
        debug(`url changed, location: ${location.pathname}, search: ${location.search}, hash: ${location.hash}`);

        if (/\/lesson\//.test(location.pathname)) {
            await setupPlayer();
        }
        if (/\/course\//.test(location.pathname)) {
            await setupCourse();
        }
    };

    triggerWhenUrlChanged(onChanged);
    await onChanged();
})();
