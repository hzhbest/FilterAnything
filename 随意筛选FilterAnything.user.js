// ==UserScript==
// @name        随意筛选
// @name:cn     随意筛选
// @name:en     FilterAnything
// @namespace   hzhbest
// @include     *://*/*
// @description    自由选定页面元素进行筛选
// @description:cn 自由选定页面元素进行筛选
// @description:en Filter any page elements with your free choice
// @version     1.3
// @require     https://cdnjs.cloudflare.com/ajax/libs/mark.js/8.11.1/mark.min.js
// @run-at      document-end
// @license     GNU GPLv3
// ==/UserScript==

// 操作方式：鼠标指针指向筛选目标【个体】，按下激活组合键，再指向另一个筛选目标【个体】，程序自动识别这两【个体】的共同【父级】并显示半透明框标示，再次按下激活组合键或点击鼠标左键，将弹出过滤框，在其中输入则按其中文本筛选【个体】
// 高阶操作方式：按下激活组合键、移动鼠标至确定【个体】后，按住Ctrl键，【个体】层级将在按住Ctrl键时保持固定，而【父级】范围则可随着鼠标移动扩大；【父级】范围合适的话，再点击鼠标左键，将以该范围【父级】筛选之前确定的【个体】；
// 术语：【目标】——待筛选的【个体】元素，数个个体位于同一【父级】的下一层（高阶方式下可为多层），筛选时以【目标】为单位
// 　　　【父级】——包含数个【目标】的元素，筛选时【父级】显示外框表明待筛选的范围
// 　　　【标记】——鼠标指针指向某个区域并按下激活快捷键以记录【目标】包含的某元素，供识别同一【父级】

// 若高亮筛选关键词的功能无效，请检查是否能访问上方 @require 的链接
//   若无法访问，请尝试将链接替换为 https://cdn.jsdelivr.net/npm/mark.js@8.11.1/dist/mark.min.js

// TODO 

(function () {

    'use strict';

    // SECTION - 自定义设置项
    const activateKey = "C-M-a";    // 激活组合键（修饰键包括 C-：Ctrl； M-：Alt；最后一个字符为实键，大写则含Shift键）
    const drawmask = true;          // 是否绘制遮罩（建议开启）
    const usectrl = true;           // 使用Ctrl 扩展筛选范围（高阶操作）
    // !SECTION


    //SECTION - 预设常量
    const _id = '___FilterAnything';       // 脚本ID
    const css = `
        /* --遮罩样式-- */
        #${_id}_maskt, #${_id}_maskp {pointer-events: none; position: fixed;
            display: none; z-index: 1000000; transition: top 0.5s, left 0.5s, width 0.5s, height 0.5s, outline 3s;}
        #${_id}_maskp {background: #6aa5e94a; border: 3px solid #3708584a;}
        #${_id}_maskt {background: #25d46b4a; border: 2px solid #0f94444a;}
        #${_id}_maskt.show,#${_id}_maskp.show {display: block;}
        #${_id}_maskt.clickable {pointer-events: auto !important;}
        /* --信息框样式-- */
        #${_id}_infobox {position: fixed; padding: 4px; display: none; border: 1px solid #000;
            background: #ffffff9b; color: #000; z-index: 1000001; font-size: 12pt;}
        #${_id}_infobox.show {display: block;}
        #${_id}_infobox>span.___pinfo, #${_id}_infobox>span.___cinfo {color: #0f9444;}
        #${_id}_infobox>span.___tinfo {color: #370858; font-weight: 800; text-decoration: underline;}
        /* --提示框样式-- */
        #${_id}_toptipbox {position: fixed; top: 3px; right: 3px; padding: 4px; display: none; border: 1px solid #000;
            background: #ffffffdf; color: #000; z-index: 1000002; font-size: 10pt;}
        #${_id}_toptipbox.show {display: block;}
        /* --目标元素样式-- */
        .${_id} {outline: 3px solid #8b62e3 !important; outline-offset: -4px;}
        /* --筛选文本框样式-- */
        #${_id}_filterbox {position: fixed; padding: 4px; display: none; border: 1px solid #2a0f63; background: white;
            z-index: 1000003; height:36px; min-width: 200px;}
        #${_id}_filterbox.show {display: block;}
        #${_id}_filterinput {max-width: 100%; height: 100%; border: none; outline: none; color: #000;
            font-size: 12pt; display: inline;}
        #${_id}_btnCloseFilter {display: inline; margin: 0 5px; height: 22px; width: 22px; 
            border: 1px solid #555; color: #555;}
        #${_id}_filtercountbox {display: inline; position: absolute; right: 40px; top: 13px;
            pointer-events: none; }
        /* --被筛选元素样式-- */
        .${_id} *.___filtered {display: none !important;}
        .${_id} .marked {background-color: #f3d6ac !important; color: #5f2f05 !important;}
    `;                        // 预设CSS
    const _txt = {
        menutxt: ['开始筛选', 'Start Filtering'],
        toptip: ['已标记首个元素，请--ifdraw--以标记第二个元素',
            'First element recorded, --ifdraw-- to mark the second element'],
        toptipifdraw: [['继续按激活组合键', 'press the activation key again'], ['点击', 'click']],
        errtip: ['未找到共同父元素或父元素为最顶层元素，程序终止',
            'No mutual parent element found or the parent element is the topmost element, program terminated'],
        exitip: ['已退出元素标记', 'Exit element recording'],
        filtip: ['输入即筛选，支持正则，Esc清空', 'Input to filter, support regex, Esc to clear']
    };
    const markingoptions = {
        element: "span",
        className: "marked",
        acrossElements: true
    };

    //!SECTION


    // SECTION - 全局变量
    var filterTO, mouseMoveTO;
    var fisstMask, secondMask, parentMask, filterbox, filterinputbox, filtercountbox, toptipbox, btnCloseFilter;
    var mousePos = { x: 0, y: 0 }, isCtrlPressed = false;
    var detectStatus = 0;   // 0:未激活 1:已标记首个元素 2:已标记第二个元素
    var firstElem, secondElem, parentElem, parentRect, filterLv = 0;
    var preFelem, preSelem, prePelem, filteredElems, fecnt;
    var markercore;
    //!SECTION


    //SECTION - 主程序
    // ~ 初始化
    addCSS(css, _id + '_css');  // 添加CSS
    //language detection
    const _L = (navigator.language.indexOf('zh-') == -1) ? 1 : 0;

    // ~ 动作监听：鼠标位置追踪
    document.addEventListener('mousemove', mouseMoveEvent);

    // ~ 动作监听：键盘按键
    document.addEventListener('keydown', keyhandler);
    document.addEventListener('keyup', (e) => {     // 监测Ctrl 松开，不然快捷键含Ctrl 的话会干扰
        if (e.key == "Control") {
            isCtrlPressed = false;
        }
    });

    // ~ 动作监听：鼠标点击
    if (drawmask) document.addEventListener('click', clickWithMask);


    //!SECTION


    // SECTION - 元素查找

    // ~ 快捷键激活，按顺序标记两个目标元素
    function getFilterTargetElems() {
        if (!toptipbox) toptipbox = creaElemIn('div', document.body);
        toptipbox.id = _id + '_toptipbox';

        switch (detectStatus) {
            case 0:                                     // 未激活状态→进入标记第一个元素阶段
                toptipbox.classList.add('show');
                toptipbox.innerHTML = _txt.toptip[_L].replace("--ifdraw--", _txt.toptipifdraw[_L][drawmask ? 0 : 1]);
                firstElem = findElemAt(mousePos);
                detectStatus = 1;
                filterLv = 1;
                break;
            case 1:                                     // 标记第一个元素状态→进入标记第二个元素阶段并筛选阶段
                secondElem = findElemAt(mousePos);
                parentElem = getMutualParent(firstElem, secondElem);
                if (parentElem.tagName == "BODY") {     // 若共同父元素为body则退出
                    exitFinding('errtip');
                } else {
                    startFiltering();
                }
                break;
        }
    }

    // ~ 点击标记第二个目标元素并筛选
    function clickWithMask(e) {
        if (drawmask && detectStatus == 1 && !!parentMask) {
            e.preventDefault();
            e.stopPropagation();
            startFiltering();
        }
    }

    // ~ 开始筛选
    function startFiltering() {
        detectStatus = 2;
        toptipbox.classList.remove('show');
        if (drawmask) {
            fisstMask.classList.toggle('show', false);
            secondMask.classList.toggle('show', false);
            parentMask.classList.toggle('show', false);
        }
        showFilterInputBox();
        window.addEventListener('scroll', updateFilterInputBox);
    }

    // ~ 跟进鼠标移动事件
    function mouseMoveEvent(e) {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
        // 若绘制遮罩模式，则在标记第二个元素阶段绘制遮罩
        if (drawmask && detectStatus == 1) {
            if (!isCtrlPressed) preFelem = firstElem;               // 按下Ctrl 键时第一个元素保持之前扩展后的元素
            preSelem = findElemAt(mousePos);
            prePelem = getMutualParent(preFelem, preSelem);
            clearTimeout(mouseMoveTO);
            if (!!secondMask) makeMaskClickable(secondMask, false);
            if (prePelem.tagName !== "BODY") {
                if (!fisstMask) {
                    fisstMask = creaElemIn('div', document.body);
                    fisstMask.id = _id + '_maskt';
                }
                if (!secondMask) {
                    secondMask = creaElemIn('div', document.body);
                    secondMask.id = _id + '_maskt';
                }
                if (!parentMask) {
                    parentMask = creaElemIn('div', document.body);
                    parentMask.id = _id + '_maskp';
                }
                console.log('isCtrlPressed: ', isCtrlPressed);
                if (!isCtrlPressed) {
                    preFelem = getElemUntil(preFelem, prePelem);
                    preSelem = getElemUntil(preSelem, prePelem);
                } else {
                    console.log('preFelem: ', preFelem);
                    console.log('prePelem: ', prePelem);
                    filterLv = getLvCnt(preFelem, prePelem);        // 在按Ctrl 时第一个元素扩展后的元素为基础算层数
                    console.log('filterLv: ', filterLv);
                    preSelem = getElemUntil(preSelem, prePelem, filterLv);
                    console.log('preSelem: ', preSelem);
                }
                drawMask(getElemRect(preFelem), fisstMask);
                drawMask(getElemRect(preSelem), secondMask);
                drawMask(getElemRect(prePelem), parentMask);
                parentElem = prePelem;
                mouseMoveTO = setTimeout(makeMaskClickable,200,secondMask,true);
            }
        }
    }

    // ~ 查找坐标下的候选元素
    function findElemAt(pos) {
        var elem = document.elementFromPoint(pos.x, pos.y);
        if (elem.id.indexOf(_id + '_mask') == 0) {            // 若鼠标下的元素是遮罩的话，返回body，让getMutualParent也返回body
            return document.body;
        }
        return elem;
    }

    // ~ 查找两元素的最小共同父元素
    function getMutualParent(felem, selem) {
        if (selem.tagName == "BODY") {
            return document.body;
        }
        var pelem = felem.parentNode;
        while (!pelem.contains(selem)) {
            if (pelem.tagName == "BODY") {
                break;
            }
            pelem = pelem.parentNode;
        }
        return pelem;
    }

    // ~ 查找两元素的层数差，找不到则返回-1
    function getLvCnt(lowerElem, upperElem) {
        if (!upperElem.contains(lowerElem)) {
            return -1;
        }
        var lvcnt = 0
        while (lowerElem !== upperElem) {
            lvcnt += 1;
            lowerElem = lowerElem.parentNode;
        }
        return lvcnt;
    }

    // ~ 查找到距顶元素n层为止的父元素
    function getElemUntil(elem, topelem, lvcnt) {
        lvcnt = lvcnt || 1;
        var cnt = getLvCnt(elem, topelem) - lvcnt;
        while (cnt > 0) {
            cnt -= 1;
            elem = elem.parentNode;
        }
        return elem;
    }

    // ~ 查找顶元素下第n层的子元素
    function getElemsAtLv(topelem, lvcnt, elems) {
        elems = elems || [];
        if (lvcnt == 0) {
            elems.push(topelem);
        } else {
            [...topelem.childNodes].forEach((elem) => {
                if (elem.nodeType === 1) {
                    getElemsAtLv(elem, lvcnt - 1, elems);
                }
            });
        }
        return elems;
    }

    // ~ 退出查找元素
    function exitFinding(exittype) {
        toptipbox.innerHTML = _txt[exittype][_L];
        detectStatus = 0;
        if (drawmask) {
            fisstMask.classList.toggle('show', false);
            secondMask.classList.toggle('show', false);
            parentMask.classList.toggle('show', false);
        }
        setTimeout(() => {
            toptipbox.classList.remove('show');
        }, 3000);
    }

    // ~ 获取元素rect
    function getElemRect(elem) {
        var trect = getTrueSize(elem);               // 获取容器元素的trect
        if (!!trect) {                               // trect非false的话
            trect.visible = true;                    // 填入可见属性
            return trect;
        } else {
            var rect = {};
            rect.visible = false;                    // 否则不可见
            return rect;
        }
    }

    // ~ 绘制半透明遮罩
    function drawMask(rect, mask) {
        if (!rect.visible || !mask) {
            return;
        }
        mask.classList.toggle('show', true);
        mask.style = `
            top: ${rect.top}px; left: ${rect.left}px; 
            width: ${rect.right - rect.left}px; height: ${rect.bottom - rect.top}px;
        `;
    }

    // ~ 短暂使遮罩可点击
    function makeMaskClickable(mask, ison) {
        mask.classList.toggle("clickable", ison);
    }

    //!SECTION


    // SECTION - 元素过滤

    // ~ 显示筛选文本框
    function showFilterInputBox() {
        if (detectStatus !== 2) {
            return;
        }
        if (!filterinputbox) {
            filterbox = creaElemIn('div', document.body);
            filterbox.id = _id + '_filterbox';
            filterinputbox = creaElemIn('input', filterbox);
            filterinputbox.type = 'text';
            filterinputbox.id = _id + '_filterinput';
            filterinputbox.placeholder = _txt.filtip[_L];
            btnCloseFilter = creaElemIn('input', filterbox);
            btnCloseFilter.type = 'button';
            btnCloseFilter.value = 'X';
            btnCloseFilter.id = _id + '_btnCloseFilter';
            filtercountbox = creaElemIn('div', filterbox);
            filtercountbox.id = _id + '_filtercountbox';
            filterinputbox.addEventListener('input', filterEvent);
            filterinputbox.addEventListener('keydown', keyhandler);
            filterinputbox.addEventListener('focus', function () {
                filterinputbox.select();
            });
            btnCloseFilter.addEventListener('click', exitFilter);
        }
        filterbox.classList.add('show');
        filterinputbox.focus();
        markercore = new Mark(parentElem);
        parentElem.classList.add('___FilterAnything');
        filteredElems = getElemsAtLv(parentElem, filterLv);
        fecnt = filteredElems.length;
        updateFilterInputBox();
    }

    // ~ 更新筛选框位置
    function updateFilterInputBox() {
        parentRect = getElemRect(parentElem);
        var iright = Math.max(10, window.innerWidth - parentRect.right);
        var itop = Math.max(10, parentRect.top - 36);
        filterbox.style = `right: ${iright}px; top: ${itop}px;`;

        var chkFelems = getElemsAtLv(parentElem, filterLv);
        if (chkFelems.length !== fecnt) {
            filteredElems = chkFelems;
            fecnt = filteredElems.length;
            filterEvent();
        }
    }

    // ~ 随输入筛选
    function filterEvent() {
        clearTimeout(filterTO);
        markercore.unmark();
        filterTO = setTimeout(filterElem, 500, filterinputbox.value);
    }

    // ~ 筛选元素
    function filterElem(strf) {
        var words = [], wordstmp = [];     // 关键词数组
        strf = strf.trim(); // 去除首尾空格
        var filteredcnt = 0;
        var wordsformark;
        if (strf.length > 0) {
            var erg = strf.match(new RegExp("^ ?/(.+)/([gim]+)?$"));	// 判别是否正则表达式
            if (erg) {
                var ew = erg[1], flag = erg[2] || '';	// 提取出正则表达式的表达式部分和标记部分
                words = [{
                    text: ew,
                    exp: new RegExp(ew, flag)
                }];	//输出单元素数组，含正则对象
            } else {
                wordstmp = strf.split(' ');	// 按空格分割关键词
                wordstmp.forEach((word) => {
                    if (word) {
                        var t = word, ex = false;
                        var oh = false;
                        if (t.indexOf("<") == 0 && t.indexOf(">") == t.length - 1) {    // HTML匹配
                            oh = true;
                            t = t.slice(1, t.length - 2);
                        }
                        if (t.indexOf("-") == 0) { // 拒绝符【-】；连字符【--】=“-”
                            if (t.indexOf("--") !== 0) {
                                ex = true;
                            }
                            t = t.slice(1);
                        }
                        words.push({
                            text: t,
                            exclude: ex,
                            outerhtml: oh
                        });	//输出多元素数组，无正则对象
                    }
                });
                wordsformark = words.reduce((acc, cur) => {
                    if (!(cur.exclude || cur.outerhtml)) {
                        return acc + " " + cur.text;
                    }
                }, ''); // 保留普通文本关键词用于高亮
            }
            if (words.length > 0) {
                filteredElems.forEach((elem) => {
                    const tc = elem.textContent;                    // 兼顾大写（word有大写则只匹配大写）
                    const tcl = elem.textContent.toLowerCase();     // 同时匹配大小写（word仅小写则大小写都匹配）
                    const toh = elem.outerHTML;                     // HTML源代码
                    const tohl = elem.outerHTML.toLowerCase();      // HTML源代码小写
                    const ismatched = words.every((word) => {
                        if (word.exp) {
                            return word.exp.test(tc) || word.exp.test(tcl);
                        } else {
                            // console.log('tc.includes(word.text): ', tc.includes(word.text));
                            var ism, isml;
                            if (!word.outerhtml) {
                                ism = tc.includes(word.text);
                                isml = tcl.includes(word.text);
                            } else {
                                ism = toh.includes(word.text);
                                isml = tohl.includes(word.text);
                            }
                            if (word.exclude) {
                                return !(ism || isml);
                            } else {
                                return ism || isml;
                            }
                        }
                    });
                    elem.classList.toggle('___filtered', !ismatched);
                    if (ismatched) filteredcnt++;
                    // console.log('elem: ', elem);
                });
                if (words[0].exp) {
                    markercore.markRegExp(words[0].exp, markingoptions);
                } else {
                    markercore.mark(wordsformark, markingoptions);
                }
                filtercountbox.innerHTML = `${filteredcnt}/${fecnt}`;
            }
        } else {
            filteredElems.forEach((elem) => {
                elem.classList.remove('___filtered');
                filtercountbox.innerHTML = "";
            });
        }
    }

    // ~ 退出筛选状态
    function exitFilter() {
        parentElem.classList.remove('___FilterAnything');
        filterbox.classList.remove('show');
        filterinputbox.value = "";
        filteredElems.forEach((elem) => {
            elem.classList.remove('___filtered');
        });
        markercore.unmark();
        parentElem = null;
        firstElem = null;
        secondElem = null;
        filteredElems = null;
        fecnt = 0;
        filterLv = 0;
        detectStatus = 0;
        window.removeEventListener('scroll', showFilterInputBox);
    }

    //!SECTION






    //SECTION - 通用功能

    /** ~ keyhandler(evt)
     * 接收击键事件，调用相应程序
     * @param {event} evt 键盘按键事件
     */
    function keyhandler(evt) {
        var fullkey = get_key(evt);
        // console.log('fullkey: ', fullkey);
        isCtrlPressed = false; // 重置Ctrl键状态，仅当标记第二个元素时可切换
        switch (fullkey) {
            case "Escape":
                evt.preventDefault();
                evt.stopPropagation();
                if (detectStatus == 1) {
                    exitFinding('exitip');
                } else if (detectStatus == 2) {
                    if (evt.target.id == _id + '_filterinput') {
                        evt.target.value = '';
                        filterEvent();
                    } else {
                        exitFilter();
                    }
                }
                break;
            case activateKey:
                getFilterTargetElems();
            case "C-Control":
                if (usectrl && detectStatus == 1) {
                    isCtrlPressed = true;
                }
        }
    }

    /** ~ get_key(evt)
     * 按键evt.which转换为键名
     * @param {event} evt 键盘按键事件
     * @returns {string} 按键键名
     */
    function get_key(evt) {
        const keyCodeStr = {			//key press 事件返回的which代码对应按键键名对应表对象
            8: 'BAC',
            9: 'TAB',
            10: 'RET',
            13: 'RET',
            27: 'ESC',
            33: 'PageUp',
            34: 'PageDown',
            35: 'End',
            36: 'Home',
            37: 'Left',
            38: 'Up',
            39: 'Right',
            40: 'Down',
            45: 'Insert',
            46: 'Delete',
            112: 'F1',
            113: 'F2',
            114: 'F3',
            115: 'F4',
            116: 'F5',
            117: 'F6',
            118: 'F7',
            119: 'F8',
            120: 'F9',
            121: 'F10',
            122: 'F11',
            123: 'F12'
        };
        const whichStr = {
            32: 'SPC'
        };
        var key = String.fromCharCode(evt.which),
            ctrl = evt.ctrlKey ? 'C-' : '',
            meta = (evt.metaKey || evt.altKey) ? 'M-' : '';
        if (!evt.shiftKey) {
            key = key.toLowerCase();
        }
        if (evt.ctrlKey && evt.which >= 186 && evt.which < 192) {
            key = String.fromCharCode(evt.which - 144);
        }
        if (evt.key && evt.key !== 'Enter' && !/^U\+/.test(evt.key)) {
            key = evt.key;
        } else if (evt.which !== evt.keyCode) {
            key = keyCodeStr[evt.keyCode] || whichStr[evt.which] || key;
        } else if (evt.which <= 32) {
            key = keyCodeStr[evt.keyCode] || whichStr[evt.which];
        }
        return ctrl + meta + key;
    }

    /** ~ creaElemIn(tagname, destin, spos, pos)
     * 在 destin 内创建元素 tagname，通过 spos{ "after", "before" } 和 pos 指定位置
     * @param {string} tagname 创建的元素的元素名
     * @param {node} destin 创建元素插入的父元素
     * @param {string} spos “after”或“before”指定插入方向
     * @param {integer} pos 插入位置所在子元素序号
     * @returns 
     */
    function creaElemIn(tagname, destin, spos, pos) {
        var elem;
        elem = document.createElement(tagname);
        if (!spos) {
            destin.appendChild(elem);
        } else {
            if (spos == "after") {
                destin.insertBefore(elem, destin.childNodes[pos + 1]);
            } else if (spos == "before") {
                destin.insertBefore(elem, destin.childNodes[pos]);
            }
        }
        return elem;
    }

    /** ~ removeNode(node)
     * 移除目标节点
     * @param {node} node 目标节点
     */
    function removeNode(node) {
        if (!!node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    /** ~ addCSS(css, cssid)
     * 创建带ID的CSS节点并插入页面
     * @param {string} css CSS内容
     * @param {string} cssid CSS节点ID
     */
    function addCSS(css, cssid) {
        let stylenode = creaElemIn('style', document.getElementsByTagName('head')[0]);
        stylenode.textContent = css;
        stylenode.type = 'text/css';
        stylenode.id = cssid || '';
    }

    //~ - getTrueSize(node)
    //  输入元素，返回元素可见的四边屏幕坐标对象
    function getTrueSize(node) {
        if (node.tagName == "BODY" || node.tagName == "HTML") {
            return false;
        }
        var p = node.getBoundingClientRect();
        return getFourSide(node, p);
    }

    // ~ getFourSide(node, p)
    // 递归获取当前节点不被上层元素遮挡的四边位置
    function getFourSide(node, p) {
        var pn = node.parentNode;
        if (pn.tagName == "BODY") {     // 到顶了
            return p;
        }
        var pp = pn.getBoundingClientRect();
        var po = {
            left: p.left,
            right: p.right,
            top: p.top,
            bottom: p.bottom
        };
        if (pp.right < po.left || pp.left > po.right || pp.top > po.bottom || pp.bottom < po.top) {
            return false;                                   // 四边皆被父节点遮挡，目标节点不可见
        } else {
            var ok = true;
            if (po.left < pp.left) {
                po.left = pp.left;
                ok = false;
            }
            if (po.right > pp.right) {
                po.right = pp.right;
                ok = false;
            }
            if (po.top < pp.top) {
                po.top = pp.top;
                ok = false;
            }
            if (po.bottom > pp.bottom) {
                po.bottom = pp.bottom;
                ok = false;
            }
            if (!ok) {
                po = getFourSide(pn, po);
            }
            return po;
        }
    }



})();
