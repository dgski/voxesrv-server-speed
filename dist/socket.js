"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const protocol = __importStar(require("./lib/protocol"));
class BaseSocket {
    constructor() {
        this.listeners = {};
    }
    send(type, data) {
        //console.log("send", JSON.stringify({type:type ,data: JSON.stringify(data).slice(0, 100)}))
        const packet = protocol.parseToMessage('server', type, data);
        if (packet != null) {
            this.socket.send(packet);
        }
    }
    close() {
        this.emit('close', true);
        this.listeners = {};
    }
    emit(type, data) {
        if (this.listeners[type] != undefined) {
            this.listeners[type].forEach((func) => {
                func(data);
            });
        }
    }
    on(type, func) {
        if (this.listeners[type] != undefined) {
            this.listeners[type].push(func);
        }
        else {
            this.listeners[type] = new Array();
            this.listeners[type].push(func);
        }
    }
}
exports.BaseSocket = BaseSocket;
class WSSocket extends BaseSocket {
    constructor(socket) {
        super();
        this.socket = socket;
        this.socket.binaryType = 'arraybuffer';
        this.socket.onopen = () => {
            this.emit('connection', {});
        };
        this.socket.on('error', () => {
            this.emit('error', { reason: `Connection error!` });
        });
        this.socket.on('close', () => {
            this.emit('close', { reason: `Connection closed!` });
        });
        this.socket.on('message', (m) => {
            const packet = protocol.parseToObject('client', new Uint8Array(m));
            if (packet != null)
                this.emit(packet.type, packet.data);
        });
    }
    close() {
        this.emit('close', true);
        this.listeners = {};
        this.socket.close();
    }
}
exports.WSSocket = WSSocket;
//# sourceMappingURL=socket.js.map