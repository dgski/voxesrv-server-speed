import * as vec from 'gl-vec3';
import * as pako from 'pako';

import type { EntityManager, Entity } from './entity';
import { WorldManager, World,  globalToChunk } from './worlds';
import type { ItemStack, Registry } from './registry';
import type { Server } from '../server';
import * as fs from 'fs';
import * as console from './console';
import * as types from '../types';
import * as chat from './chat';

import { PlayerInventory, ArmorInventory } from './inventory';
import { PlayerPermissionHolder } from './permissions';

import * as pClient from 'voxelsrv-protocol/js/client';
import { BaseSocket } from '../socket';

export class PlayerManager {
	players: { [index: string]: Player } = {};
	chunksToSend = [];
	_server: Server;
	_entities: EntityManager;
	_worlds: WorldManager;
	_lastChunkUpdate: number = 0;

	constructor(server: Server) {
		this._server = server;
		this._entities = server.entities;
		this._worlds = server.worlds;

		server.on('entity-create', (data) => {
			this.sendPacketAll('EntityCreate', {
				uuid: data.uuid,
				data: JSON.stringify(data.entity.getObject().data),
			});
		});
		server.on('entity-move', (data) => {
			this.sendPacketAllExcept('EntityMove', data, data.uuid);
		});
		server.on('entity-remove', (data) => {
			this.sendPacketAll('EntityRemove', data);
		});
	}

	create(id: string, data: any, socket: BaseSocket): Player {
		this.players[id] = new Player(id, data.username, socket, this);

		this._server.emit('player-create', this.players[id]);

		return this.players[id];
	}

	read(id: string): object | null {
		try {
			let r = null;
			const name = id + '.json';
			const data = fs.readFileSync('./players/' + name);
			r = JSON.parse(data.toString());

			return r;
		} catch (e) {
			console.error('Tried to load data of player ' + id + ', but it failed! Error: ', e);
		}
	}

	exist(id: string): boolean {
		const name = id + '.json';
		const r = fs.existsSync('./players/' + name);
		return r;
	}

	save(id: string, data: Object) {
		fs.writeFile('./players/' + id + '.json', JSON.stringify(data), function (err) {
			if (err) console.error('Cant save player ' + id + '! Reason: ' + err);
		});
	}

	get(id: string): Player | null {
		if (this.players[id] != undefined) return this.players[id];
		else return null;
	}

	getAll(): { [index: string]: Player } {
		return this.players;
	}

	sendPacketAll(type: string, data: any) {
		Object.values(this.players).forEach((p: Player) => {
			p.sendPacket(type, data);
		});
	}

	sendPacketAllExcept(type: string, data: any, exceptId : string) {
		Object.values(this.players).forEach((p: Player) => {
			if(p.id != exceptId) {
				return
			}
			p.sendPacket(type, data);
		});
	}
}

export class Player {
	readonly id: string;
	readonly nickname: string;
	displayName: string;
	entity: Entity;
	world: World;
	inventory: PlayerInventory;
	hookInventory: any;
	readonly socket: BaseSocket;
	permissions: PlayerPermissionHolder;
	chunks: types.anyobject;
	movement: PlayerMovement;
	crafting = {
		items: { 0: null, 1: null, 2: null, 3: null },
		result: null,
	};
	_chunksToSend = [];
	_chunksInterval: any;

	_players: PlayerManager;
	_server: Server;

	constructor(id: string, name: string, socket: BaseSocket, players: PlayerManager) {
		this.id = id;
		this.nickname = name;
		this.displayName = name;
		this._players = players;
		this._server = players._server;
		let data: types.anyobject | null;
		if (this._players.exist(this.id)) data = this._players.read(this.id);

		if (data == null) {
			this.entity = this._players._entities.create(
				'player',
				{
					name: name,
					nametag: true,
					health: 20,
					maxHealth: 20,
					model: 'player',
					texture: 'entity/steve',
					position: this._server.config.world.spawn,
					rotation: 0,
					pitch: 0,
					hitbox: [0.55, 1.9, 0.55],
					armor: new ArmorInventory(null, this._server),
				},
				'default',
				null
			);

			this.world = this._players._worlds.get('default');

			this.inventory = new PlayerInventory(10, null, this._server);
			this.hookInventory = null;
			this.permissions = new PlayerPermissionHolder(this._server.permissions, {}, ['default']);
			this.movement = { ...defaultPlayerMovement };
			this._server.emit('player-firstjoin', this);
			this._server.emit('player-join', this);
		} else {
			this.entity = this._players._entities.recreate(
				data.entity.id,
				'player',
				{
					name: data.entity.data.name,
					nametag: data.entity.data.nametag,
					health: data.entity.data.health,
					maxHealth: data.entity.data.maxhealth,
					model: 'player',
					texture: 'entity/steve',
					position: data.entity.data.position,
					rotation: data.entity.data.rotation,
					pitch: data.entity.data.pitch,
					hitbox: [0.55, 1.9, 0.55],
					armor: new ArmorInventory(data.entity.data.armor, this._server),
				},
				data.world,
				null
			);

			this.world = this._players._worlds.get(data.world);

			this.inventory = new PlayerInventory(10, data.inventory, this._server);
			if (!!data.permissions)
				this.permissions = new PlayerPermissionHolder(this._server.permissions, data.permissions, [...data.permissionparents, 'default']);
			else this.permissions = new PlayerPermissionHolder(this._server.permissions, {}, ['default']);
			this.movement = { ...defaultPlayerMovement, ...data.movement };
			this._server.emit('player-join', this);
		}

		this.socket = socket;
		this.chunks = {};
		this._players.save(this.id, this.getObject());

		this.inventory.event.on('slot-update', (data) => {
			this.sendPacket('PlayerSlotUpdate', {
				slot: parseInt(data.slot),
				data: JSON.stringify(data.data),
				type: data.type,
			});
		});

		this._server.emit('player-created', this);
	}

	getObject() {
		return {
			id: this.id,
			nickname: this.nickname,
			entity: this.entity.getObject(),
			inventory: this.inventory.getObject(),
			world: this.world.name,
			permissions: this.permissions.permissions,
			permissionparents: Object.keys(this.permissions.parents),
			movement: this.movement,
		};
	}

	sendPacket(type: string, data: Object) {
		this.socket.send(type, data);
	}

	remove() {
		this._server.emit('player-remove', this);
		this._server.emit('player-quit', this);
		this._players.save(this.id, this.getObject());
		this.entity.remove();
		clearInterval(this._chunksInterval);

		setTimeout(() => {
			delete this._players.players[this.id];
		}, 10);
	}

	teleport(pos: types.XYZ, eworld: string | World) {
		this.entity.teleport(pos, eworld);
		this.world = typeof eworld == 'string' ? this._players._worlds.get(eworld) : eworld;
		this.sendPacket('PlayerTeleport', { x: pos[0], y: pos[1], z: pos[2] });
	}

	move(pos: types.XYZ) {
		this.entity.move(pos);
	}

	send(msg: string | chat.ChatMessage) {
		if (typeof msg == 'string') msg = chat.convertFromPlain(msg);
		this.sendPacket('ChatMessage', { message: msg, time: Date.now() });
	}

	rotate(rot: number | null, pitch: number | null) {
		this._server.emit('player-rotate', { id: this.id, rot, pitch });
		this.entity.rotate(rot, pitch);
	}

	kick(reason: string) {
		this.sendPacket('PlayerKick', { reason: reason, date: Date.now() });
		setTimeout(() => {
			this.socket.close();
		}, 50);
	}

	updateMovement(key: string, value: number) {
		this.sendPacket('PlayerUpdateMovement', { key: key, value: value });
		this.movement[key] = value;
	}

	updatePhysics(key: string, value: number) {
		this.sendPacket('PlayerUpdatePhysics', { key: key, value: value });
	}

	applyForce(x: number, y: number, z: number) {
		this.sendPacket('PlayerApplyImpulse', { x, y, z });
	}

	setTab(msg: chat.ChatMessage) {
		this.sendPacket('TabUpdate', { message: msg, time: Date.now() });
	}

	async updateChunks() {
	}

	get getID() {
		return this.id;
	}

	action_blockbreak(data: pClient.IActionBlockBreak & { cancel: boolean }) {
		const blockpos: types.XYZ = [data.x, data.y, data.z];
		const block = this.world.getBlock(blockpos, false);
		if (block != undefined && block.unbreakable != true) {
			this.world.setBlock(blockpos, 0, false);
			this._players.sendPacketAll('WorldBlockUpdate', {
				id: 0,
				x: data.x,
				y: data.y,
				z: data.z,
			});
		}
	}

	action_blockplace(data: pClient.IActionBlockPlace & { cancel: boolean }) {	
		this.world.setBlock([data.x, data.y, data.z], data.id, false);
		this._players.sendPacketAll('WorldBlockUpdate', {
			id: data.id,
			x: data.x,
			y: data.y,
			z: data.z,
		});
	}

	action_invclick(data: pClient.IActionInventoryClick & { cancel: boolean }) {
		if (data.inventory == undefined) data.inventory = 'main';

		data.cancel = false;
		for (let x = 0; x <= 5; x++) {
			this._server.emit(`player-invclick-${x}`, this, data);
			if (data.cancel) return;
		}

		let inventory;
		let type = 'main';
		switch (data.inventory) {
			case 'main':
				inventory = this.inventory;
				type = 'main';
				break;
			case 'hook':
				inventory = this.hookInventory != null ? this.hookInventory : this.inventory;
				type = 'hook';
				break;
			case 'armor':
				inventory = this.entity.data.armor;
				type = 'armor';
				break;
			case 'crafting':
				inventory = this.crafting;
				type = 'crafting';
				break;
			default:
				this.kick('Invalid inventory');
				return;
		}

		if (-2 < data.slot && data.slot <= this.inventory.size && (type != 'crafting' || data.slot < 4)) {
			if (data.type == 'left') this.inventory.action_left(inventory, data.slot, type);
			else if (data.type == 'right') this.inventory.action_right(inventory, data.slot, type);
			else if (data.type == 'switch') this.inventory.action_switch(data.slot, data.slot2);
			else if (-1 < data.slot && data.slot < 9 && data.type == 'select') this.inventory.select(data.slot);
		} else if (type == 'crafting' && data.slot < 4) {
		}
	}

	action_chatsend(data: pClient.IActionMessage & { cancel: boolean }) {
		data.cancel = false;
		for (let x = 0; x <= 5; x++) {
			this._server.emit(`player-message-${x}`, this, data);
			if (data.cancel) return;
		}

		if (data.message.charAt(0) == '/') {
			const arg = data.message.split(' ');
			const command = arg[0];
			arg.shift();
			this._server.emit('player-executecommand', this, command, arg);

			if (this._players._server.registry.commands[command]) {
				try {
					this._players._server.registry.commands[command].trigger(this, arg);
				} catch (e) {
					console.error(`User ^R${this.nickname}^r tried to execute command ^R${command}^r and it failed! \n ^R`, e);
					this.send([new chat.ChatComponent('An error occurred during the execution of this command!', 'red')]);
				}
			} else this.send([new chat.ChatComponent("This command doesn't exist! Check /help for list of available commands.", 'red')]);
		} else if (data.message != '') {
			const msg = [
				new chat.ChatComponent(this.displayName, 'white'),
				new chat.ChatComponent(' » ', '#eeeeee'),
				new chat.ChatComponent(data.message, 'white'),
			];

			this._server.emit('chat-message', msg);

			chat.sendMlt([console.executorchat, ...Object.values(this._players.getAll())], msg);
		}
	}

	action_move(data: pClient.IActionMove & { cancel: boolean }) {
		const move: types.XYZ = [data.x, data.y, data.z];
		this.move(move);
		this.rotate(data.rotation, data.pitch);
	}

	action_click(data: pClient.IActionClick & { cancel: boolean }) {
		data.cancel = false;
		for (let x = 0; x <= 5; x++) {
			this._server.emit(`player-click-${x}`, this, data);
			if (data.cancel) return;
		}
	}

	action_entityclick(data: pClient.IActionClickEntity & { cancel: boolean }) {
		data.cancel = false;
		for (let x = 0; x <= 5; x++) {
			this._server.emit(`player-entityclick-${x}`, this, data);
			if (data.cancel) return;
		}
	}
}

export interface PlayerMovement {
	airJumps: number;
	airMoveMult: number;
	crouch: boolean;
	crouchMoveMult: number;
	jumpForce: number;
	jumpImpulse: number;
	jumpTime: number;
	jumping: boolean;
	maxSpeed: number;
	moveForce: number;
	responsiveness: number;
	running: boolean;
	runningFriction: number;
	sprint: boolean;
	sprintMoveMult: number;
	standingFriction: number;
}

export const defaultPlayerMovement = {
	airJumps: 0,
	airMoveMult: 0.5,
	crouch: false,
	crouchMoveMult: 0.8,
	jumpForce: 6,
	jumpImpulse: 8.5,
	jumpTime: 500,
	jumping: false,
	maxSpeed: 7.5,
	moveForce: 30,
	responsiveness: 15,
	running: false,
	runningFriction: 0,
	sprint: false,
	sprintMoveMult: 1.2,
	standingFriction: 2,
};
