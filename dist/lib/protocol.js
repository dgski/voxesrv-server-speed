"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client = __importStar(require("voxelsrv-protocol/js/client"));
const server = __importStar(require("voxelsrv-protocol/js/server"));
const client_json_1 = __importDefault(require("voxelsrv-protocol/idmap/client.json"));
const server_json_1 = __importDefault(require("voxelsrv-protocol/idmap/server.json"));
let revMapServer = {};
let revMapClient = {};
client_json_1.default.forEach((x, i) => (revMapClient[x] = i));
server_json_1.default.forEach((x, i) => (revMapServer[x] = i));
function parseToObject(pType, data) {
    let type = '';
    let packet;
    if (pType == 'server') {
        type = server_json_1.default[data[0]];
        if (type == undefined)
            return null;
        packet = server[type];
    }
    else {
        type = client_json_1.default[data[0]];
        if (type == undefined)
            return null;
        packet = client[type];
        pType = 'client';
    }
    const rawData = data.slice(1);
    const message = packet.decode(rawData);
    let error = null;
    if (packet != undefined)
        error = packet.verify(message);
    else
        error = 'Invalid packet';
    if (error) {
        console.error('Invalid ' + pType + ' packet! Type: ' + type, error);
        return null;
    }
    return { data: packet.toObject(message), type: type };
}
exports.parseToObject = parseToObject;
function parseToMessage(pType, type, data) {
    let packet;
    let typeRaw = 0;
    if (pType == 'server') {
        typeRaw = revMapServer[type];
        if (typeRaw == undefined)
            return null;
        packet = server[type];
    }
    else {
        typeRaw = revMapClient[type];
        if (typeRaw == undefined)
            return null;
        packet = client[type];
        pType = 'client';
    }
    let error = null;
    if (packet != undefined)
        error = packet.verify(data);
    else
        error = 'Invalid packet';
    if (error) {
        console.error('Invalid ' + pType + ' packet! Type: ' + type, data, error);
        return null;
    }
    const message = packet.create(data);
    const encoded = packet.encode(message).finish();
    const out = new Uint8Array(1 + encoded.length);
    out.set([typeRaw]);
    out.set(encoded, 1);
    return out.buffer;
}
exports.parseToMessage = parseToMessage;
//# sourceMappingURL=protocol.js.map