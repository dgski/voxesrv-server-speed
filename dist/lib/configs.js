"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const console_1 = require("./console");
function load(namespace, config) {
    if (fs.existsSync(`./config/${namespace}/${config}.json`)) {
        try {
            const data = fs.readFileSync(`./config/${namespace}/${config}.json`);
            return JSON.parse(data.toString());
        }
        catch (e) {
            console_1.error(`Invalid config file (./config/${namespace}/${config}.json)!\n${e}`);
            return {};
        }
    }
    else
        return {};
}
exports.load = load;
function save(namespace, config, data) {
    if (!fs.existsSync(`./config/${namespace}`))
        fs.mkdirSync(`./config/${namespace}`, { recursive: true });
    fs.writeFile(`./config/${namespace}/${config}.json`, JSON.stringify(data, null, 2), function (err) {
        if (err)
            console_1.error(`Cant save config ${namespace}/${config}! Reason: ${err}`);
    });
}
exports.save = save;
//# sourceMappingURL=configs.js.map