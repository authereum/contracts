"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const web3_1 = __importDefault(require("web3"));
const fs_1 = __importDefault(require("fs"));
const zos = __importStar(require("@authereum/zos"));
const utils = __importStar(require("@authereum/utils"));
const zos_lib_1 = require("zos-lib");
dotenv_1.default.config();
const currentDir = path_1.default.resolve(__dirname, '..');
// Export AuthereumAccount truffle artifact
const AuthereumAccount = JSON.parse(fs_1.default.readFileSync(`${currentDir}/dist/contracts/AuthereumAccount.json`).toString('utf8'));
exports.AuthereumAccount = AuthereumAccount;
// Export contract configs
const mainnetConfig = require('../config/contracts.mainnet.json');
exports.mainnetConfig = mainnetConfig;
const ropstenConfig = require('../config/contracts.ropsten.json');
exports.ropstenConfig = ropstenConfig;
const rinkebyConfig = require('../config/contracts.rinkeby.json');
exports.rinkebyConfig = rinkebyConfig;
const kovanConfig = require('../config/contracts.kovan.json');
exports.kovanConfig = kovanConfig;
const goerliConfig = require('../config/contracts.goerli.json');
exports.goerliConfig = goerliConfig;
///////// CONFIG /////////
let networkName = process.env.NETWORK_NAME;
let providerUri = process.env.ETH_HTTP_PROVIDER_URI;
let logicAddress = process.env.LOGIC_ADDRESS;
let senderAddress = process.env.SENDER_ADDRESS;
let senderPrivateKey = process.env.SENDER_PRIVATE_KEY;
let zosSessionPath = process.env.ZOS_SESSION_PATH;
if (!logicAddress) {
    if (networkName === 'mainnet') {
        logicAddress = mainnetConfig.logicAddress;
    }
    else if (networkName === 'ropsten') {
        logicAddress = ropstenConfig.logicAddress;
    }
    else if (networkName === 'rinkeby') {
        logicAddress = rinkebyConfig.logicAddress;
    }
    else if (networkName === 'kovan') {
        logicAddress = kovanConfig.logicAddress;
    }
    else if (networkName === 'goerli') {
        logicAddress = goerliConfig.logicAddress;
    }
}
//////////////////////////
function printConfig() {
    console.log('@authereum/contracts: networkName', networkName);
    console.log('@authereum/contracts: providerUri', providerUri);
    console.log('@authereum/contracts: logicAddress', logicAddress);
    console.log('@authereum/contracts: senderAddress', senderAddress);
    console.log('@authereum/contracts: currentDir', currentDir);
    console.log('@authereum/contracts: zosSessionPath', zosSessionPath);
}
printConfig();
let provider = new web3_1.default.providers.HttpProvider(providerUri);
let web3 = new web3_1.default(provider);
class AuthereumContracts {
    static setConfig(config) {
        if (config.networkName) {
            networkName = config.networkName;
        }
        if (config.providerUri) {
            providerUri = config.providerUri;
            provider = new web3_1.default.providers.HttpProvider(providerUri);
            web3 = new web3_1.default(provider);
        }
        if (config.logicAddress) {
            logicAddress = config.logicAddress;
        }
        if (config.senderAddress) {
            senderAddress = config.senderAddress;
        }
        if (config.senderPrivateKey) {
            senderPrivateKey = config.senderPrivateKey;
        }
        printConfig();
    }
    static createAuthereumAccount(authKeyAddress, publicEnsRegistryAddress, label, salt, network, from, query) {
        return __awaiter(this, void 0, void 0, function* () {
            const adminAddress = '0x0000000000000000000000000000000000000000';
            const initData = yield web3.eth.abi.encodeFunctionCall({
                name: 'initialize',
                type: 'function',
                inputs: [{
                        type: 'address',
                        name: '_authKeyAddress'
                    }, {
                        type: 'address',
                        name: '_publicEnsRegistryAddress'
                    }, {
                        type: 'string',
                        name: '_label'
                    }]
            }, [authKeyAddress, publicEnsRegistryAddress, label]);
            const normalizedSalt = utils.normalizeHex(salt);
            const signature = yield this.getZOSSignature(normalizedSalt, logicAddress, adminAddress, initData, senderAddress);
            const contractAlias = 'AuthereumAccount';
            const methodName = 'initialize';
            const methodArgs = [authKeyAddress, publicEnsRegistryAddress, label];
            const force = false;
            ///// zos config /////
            zos.ConfigManager.setBaseConfig(currentDir);
            zos.ConfigManager.config.cwd = currentDir;
            const networkConfig = yield zos.ConfigManager.initNetworkConfiguration({ network: networkName }, false, currentDir);
            zos.ConfigManager.initStaticConfiguration(currentDir);
            zos.ConfigManager.getBuildDir(`${currentDir}/dist/contracts`);
            zos_lib_1.Contracts.setLocalBuildDir(`${currentDir}/dist/contracts`);
            zos.ConfigManager.setBaseConfig(currentDir);
            const projectFile = new zos.files.ProjectFile(`${currentDir}/zos.json`);
            const networkFile = new zos.files.NetworkFile(projectFile, networkName, `${currentDir}/zos.${networkName}.json`);
            //////////////////////
            const res = yield zos.scripts[query ? 'querySignedDeployment' : 'create'](Object.assign({ contractAlias,
                methodName,
                methodArgs,
                force, salt: normalizedSalt, signature,
                network,
                networkFile }, networkConfig));
            return res;
        });
    }
    static getCreate2Address(authKeyAddress, publicEnsRegistryAddress, label, salt, network, from) {
        return __awaiter(this, void 0, void 0, function* () {
            const address = yield this.createAuthereumAccount(authKeyAddress, publicEnsRegistryAddress, label, salt, network, from, true);
            return utils.toChecksumAddress(address);
        });
    }
    static deployAccount(authKeyAddress, publicEnsRegistryAddress, label, salt, network, from) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.createAuthereumAccount(authKeyAddress, publicEnsRegistryAddress, label, salt, network, from, false);
            return utils.toChecksumAddress(res.address);
        });
    }
    static getZOSSignature(salt, logicAddress, adminAddress, initData, senderAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const msgHash = web3.utils.soliditySha3(salt, logicAddress, adminAddress, initData, senderAddress);
            const signedMsg = web3.eth.accounts.sign(msgHash, senderPrivateKey);
            return signedMsg.signature;
        });
    }
}
exports.default = AuthereumContracts;
//# sourceMappingURL=index.js.map