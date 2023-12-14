import { characters, chat, getRequestHeaders, openCharacterChat } from "../../../../script.js";
import { getContext } from "../../../extensions.js";
import { openGroupChat } from "../../../group-chats.js";
import { fetchData, prepareData } from "../SillyTavern-Timelines/tl_node_data.js";

const debounce = (func, delay=100)=>{
	let to;
	return (...args) => {
		if (to) clearTimeout(to);
		to = setTimeout(()=>func.apply(this, args), delay);
	};
}


let jumpMessage;



getContext().eventSource.on(getContext().event_types.CHAT_CHANGED, async(chatFile)=>{
	//TODO deal with new chat_changed events before this one is done processing
	console.log('[QBS]', 'CHAT_CHANGED', chatFile);
	const context = getContext();
	let data = {};
	let tree;
	let isGroup = false;
	if (context.characterId) {
		data = await fetchData(context.characters[context.characterId].avatar);
		console.log('[QBS]', {data});
		tree = await prepareData(data, false);
	} else {
		const group = context.groups.find(it=>it.id==context.groupId);
		for(let i = 0; i < group.chats.length; i++){
			console.log(group.chats[i]);
			data[i] = { 'file_name': group.chats[i] };
		}
		isGroup = true;
		tree = await prepareData(data, true);
	}
	if (tree) {
		console.log('[QBS]', {tree});
		const branchPoints = tree
			.filter(it=>it.group=='nodes' && it.data?.chat_sessions?.map(cs=>cs.replace('.jsonl',''))?.includes(`${chatFile.replace('.jsonl','')}`))
			.map(it=>it.data)
			.map(node=>{
				node.edges = tree.filter(it=>it.group=='edges'&&it.data.source==node.id).map(it=>it.data);
				return node;
			})
			.filter(node=>node.edges.length > 1)
			.map(node=>{
				node.children = node.edges.
					map(edge=>tree.find(it=>it.group=='nodes'&&it.data.id==edge.target).data)
					.toSorted((a,b)=>b.messageIndex - a.messageIndex)
					;
				return node;
			})
			;
		console.log('[QBS]', {branchPoints});
		let jumpEl;
		branchPoints.forEach(bp=>{
			const mes = chat.findIndex(it=>it.mes.replace(/\r\n/g, '\n')==bp.msg);
			const next = chat[mes+1];
			const el = document.querySelector(`#chat .mes[mesid="${mes}"]`);
			if (el) {
				const container = document.createElement('div'); {
					container.classList.add('qbs--branchPoint');
					const header = document.createElement('div'); {
						header.classList.add('qbs--header');
						header.textContent = 'BRANCH';
						header.addEventListener('click', ()=>{
							carousel.classList.toggle('qbs--active');
						});
						container.append(header);
					}
					const carousel = document.createElement('div'); {
						carousel.classList.add('qbs--carousel');
						if (jumpMessage && jumpMessage == bp.msg) {
							carousel.classList.add('qbs--active');
							jumpMessage = null;
							jumpEl = el;
						}
						
						bp.children.forEach(c=>{
							const child = document.createElement('div'); {
								child.classList.add('qbs--child');
								if (c.msg == next?.mes?.replace(/\r\n/g, '\n')) {
									child.classList.add('qbs--current');
								}
								child.addEventListener('click', ()=>{
									console.log('[QBS]', c);
									jumpMessage = bp.msg;
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
			}
		});
		if (jumpEl) {
			jumpEl.scrollIntoView();
		}
	} else {
		console.warn('[QBS]', 'group chats not implemented!');
	}

});



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