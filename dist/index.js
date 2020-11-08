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
const fs = __importStar(require("fs"));
const ws_1 = __importDefault(require("ws"));
const socket_1 = require("./socket");
const server_1 = require("./server");
function startServer() {
    let json = '{"port": 3000}';
    if (fs.existsSync('./config/') && fs.existsSync('./config/config.json'))
        json = fs.readFileSync('./config/config.json').toString();
    const cfg = JSON.parse(json.toString());
    const wss = new ws_1.default.Server({ port: cfg.port });
    const server = new server_1.Server();
    wss.on('connection', (s) => {
        server.connectPlayer(new socket_1.WSSocket(s));
    });
    server.on('server-stopped', () => {
        process.exit();
    });
    return server;
}
exports.startServer = startServer;
//# sourceMappingURL=index.js.map