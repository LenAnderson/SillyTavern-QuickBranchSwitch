import { characters, chat, getRequestHeaders, openCharacterChat } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { openGroupChat } from '../../../group-chats.js';
import { registerSlashCommand } from '../../../slash-commands.js';
import { delay } from '../../../utils.js';
import { fetchData, prepareData } from '../SillyTavern-Timelines/tl_node_data.js';

const debounce = (func, delay = 100)=>{
    let to;
    return (...args) => {
        if (to) clearTimeout(to);
        to = setTimeout(()=>func.apply(this, args), delay);
    };
};


let jumpMessage;
let cache;
let bpList;



getContext().eventSource.on(getContext().event_types.CHAT_CHANGED, async(chatFile)=>{
    //TODO deal with new chat_changed events before this one is done processing
    console.log('[QBS]', 'CHAT_CHANGED', chatFile);
    const context = getContext();
    let data = {};
    let tree = cache ?? null;
    let isGroup = !context.characterId;
    if (!tree) {
        if (context.characterId) {
            data = await fetchData(context.characters[context.characterId].avatar);
            console.log('[QBS]', { data });
            tree = await prepareData(data, false);
        } else {
            const group = context.groups.find(it=>it.id == context.groupId);
            for(let i = 0; i < group.chats.length; i++){
                console.log(group.chats[i]);
                data[i] = { 'file_name': group.chats[i] };
            }
            isGroup = true;
            tree = await prepareData(data, true);
        }
    } else {
        cache = null;
    }
    if (tree) {
        console.log('[QBS]', { tree });
        const branchPoints = tree
            .filter(it=>it.group == 'nodes' && it.data?.chat_sessions?.map(cs=>cs.replace('.jsonl',''))?.includes(`${chatFile.replace('.jsonl','')}`))
            .map(it=>it.data)
            .map(node=>{
                node.edges = tree.filter(it=>it.group == 'edges' && it.data.source == node.id).map(it=>it.data);
                return node;
            })
            .filter(node=>node.edges.length > 1)
            .map(node=>{
                node.children = node.edges.
                    map(edge=>tree.find(it=>it.group == 'nodes' && it.data.id == edge.target).data)
                    .toSorted((a,b)=>b.messageIndex - a.messageIndex)
                ;
                return node;
            })
			;
        console.log('[QBS]', { branchPoints });
        bpList = [];
        let jumpEl;
        branchPoints.forEach(bp=>{
            bp.childElement = [];
            const mes = chat.findIndex(it=>it.mes.replace(/\r\n/g, '\n') == bp.msg);
            const next = chat[mes + 1];
            const currentIndex = bp.children.findIndex(c=>c.msg == next?.mes?.replace(/\r\n/g, '\n'));
            const el = document.querySelector(`#chat .mes[mesid="${mes}"]`);
            bpList.push(el);
            let carousel;
            if (el) {
                const container = document.createElement('div'); {
                    container.classList.add('qbs--branchPoint');
                    carousel = document.createElement('div'); {
                        carousel.classList.add('qbs--carousel');
                        if (jumpMessage && jumpMessage == bp.msg) {
                            carousel.classList.add('qbs--active');
                            jumpMessage = null;
                            jumpEl = el;
                        }

                        bp.children.forEach((c,idx)=>{
                            const child = document.createElement('div'); {
                                bp.childElement[idx] = child;
                                child.classList.add('qbs--child');
                                if (c.msg == next?.mes?.replace(/\r\n/g, '\n')) {
                                    child.classList.add('qbs--current');
                                }
                                child.addEventListener('click', ()=>{
                                    console.log('[QBS]', c);
                                    jumpMessage = bp.msg;
                                    cache = tree;
                                    if (isGroup) {
                                        openGroupChat(context.groupId, c.file_name.replace('.jsonl',''));
                                    } else {
                                        openCharacterChat(c.file_name.replace('.jsonl',''));
                                    }
                                });
                                const header = document.createElement('div'); {
                                    header.classList.add('qbs--header');
                                    header.textContent = c.send_date;
                                    child.append(header);
                                }
                                const body = document.createElement('div'); {
                                    body.classList.add('qbs--body');
                                    body.textContent = c.msg;
                                    child.append(body);
                                }
                                carousel.append(child);
                            }
                        });
                        container.append(carousel);
                    }
                    el.insertAdjacentElement('afterend', container);
                }
                const prevTrigger = document.createElement('span'); {
                    prevTrigger.classList.add('qbs--prev');
                    prevTrigger.textContent = '⟨';
                    if (currentIndex > 0) {
                        prevTrigger.title = `Switch to previous branch\n\n${bp.children[currentIndex - 1]?.msg ?? ''}`;
                        prevTrigger.addEventListener('click', ()=>{
                            bp.childElement[currentIndex - 1].click();
                        });
                    } else {
                        prevTrigger.title = 'Already on first branch';
                    }
                    el.querySelector('.name_text').insertAdjacentElement('afterend', prevTrigger);
                }
                const trigger = document.createElement('span'); {
                    trigger.classList.add('qbs--trigger');
                    trigger.classList.add('fa-regular');
                    trigger.classList.add('fa-code-branch');
                    trigger.title = 'Show / hide branches';
                    trigger.addEventListener('click', ()=>{
                        carousel.classList.toggle('qbs--active');
                    });
                    prevTrigger.insertAdjacentElement('afterend', trigger);
                }
                const nextTrigger = document.createElement('span'); {
                    nextTrigger.classList.add('qbs--next');
                    nextTrigger.textContent = '⟩';
                    if (currentIndex < bp.children.length - 1) {
                        nextTrigger.title = `Switch to next branch\n\n${bp.children[currentIndex + 1]?.msg ?? ''}`;
                        nextTrigger.addEventListener('click', ()=>{
                            if (currentIndex < bp.children.length - 1) {
                                bp.childElement[currentIndex + 1].click();
                            }
                        });
                    } else {
                        nextTrigger.title = 'Already on last branch';
                    }
                    trigger.insertAdjacentElement('afterend', nextTrigger);
                }
            }
        });
        if (jumpEl) {
            jumpEl.scrollIntoView();
        }
    } else {
        console.warn('[QBS]', 'group chats not implemented!');
    }

});


const jumpUp = async()=>{
    const chatRect = document.querySelector('#chat').getBoundingClientRect();
    const bpRects = bpList.map(it=>Object.assign(it.getBoundingClientRect(), { mes:it }));
    console.log('[QBS]', { chatRect }, bpRects);
    const mes = bpRects.filter(it=>it.top + 10 < chatRect.top).slice(-1)[0]?.mes;
    if (mes) {
        mes.scrollIntoView();
        mes.classList.add('qbs--flash');
        delay(1050).then(()=>{
            mes.classList.remove('qbs--flash');
        });
    } else {
        toastr.info('No more branches');
    }
};
const jumpDown = async()=>{
    const chatRect = document.querySelector('#chat').getBoundingClientRect();
    const bpRects = bpList.map(it=>Object.assign(it.getBoundingClientRect(), { mes:it }));
    console.log('[QBS]', { chatRect }, bpRects);
    const mes = bpRects.find(it=>it.top - 10 > chatRect.top)?.mes;
    if (mes) {
        mes.scrollIntoView();
        mes.classList.add('qbs--flash');
        delay(1050).then(()=>{
            mes.classList.remove('qbs--flash');
        });
    } else {
        toastr.info('No more branches');
    }
};




registerSlashCommand('qbs-up', ()=>jumpUp(), [], 'jump to nearest branch point upwards', true, true);
registerSlashCommand('qbs-down', ()=>jumpDown(), [], 'jump to nearest branch point downwards', true, true);




$(document).ready(function () {
    const addSettings = () => {
        const html = `
		<div class="qbs--settings">
			<div class="inline-drawer">
				<div class="inline-drawer-toggle inline-drawer-header">
					<b>Quick Branch Switch</b>
					<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
				</div>
				<div class="inline-drawer-content" style="font-size:small;">
					Stuff...
				</div>
			</div>
		</div>
		`;
        $('#extensions_settings').append(html);
    };
    addSettings();
});
