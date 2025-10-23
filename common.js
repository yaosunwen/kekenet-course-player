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
