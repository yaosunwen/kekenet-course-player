// ==UserScript==
// @name         kekenet course player
// @namespace    https://www.kekenet.com
// @version      1.0.0
// @description  play course sequentially
// @author       yaosunwen
// @match        https://www.kekenet.com/lesson/*
// @match        https://www.kekenet.com/course/*
// @require      https://raw.githubusercontent.com/yaosunwen/kekenet-course-player/main/common.js
// @updateURL    https://raw.githubusercontent.com/yaosunwen/kekenet-course-player/main/index.user.js
// @downloadURL  https://raw.githubusercontent.com/yaosunwen/kekenet-course-player/main/index.user.js
// @grant        GM_log
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

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
        });

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
