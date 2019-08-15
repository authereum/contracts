import dotenv from 'dotenv'
import path from 'path'
import Web3 from 'web3'
import fs from 'fs'
import * as zos from '@authereum/zos'
import * as utils from '@authereum/utils'
import { Contracts } from 'zos-lib'

dotenv.config()

const currentDir = path.resolve(__dirname, '..')

// Export AuthereumAccount truffle artifact
const AuthereumAccount = JSON.parse(fs.readFileSync(`${currentDir}/dist/contracts/AuthereumAccount.json`).toString('utf8'))
export { AuthereumAccount }

// Export contract configs
const mainnetConfig = require('../config/contracts.mainnet.json')
const ropstenConfig = require('../config/contracts.ropsten.json')
const rinkebyConfig = require('../config/contracts.rinkeby.json')
const kovanConfig = require('../config/contracts.kovan.json')
const goerliConfig = require('../config/contracts.goerli.json')
export { mainnetConfig, kovanConfig, rinkebyConfig, ropstenConfig, goerliConfig }

///////// CONFIG /////////

let networkName: any = process.env.NETWORK_NAME
let providerUri = process.env.ETH_HTTP_PROVIDER_URI
let logicAddress = process.env.LOGIC_ADDRESS
let senderAddress = process.env.SENDER_ADDRESS
let senderPrivateKey = process.env.SENDER_PRIVATE_KEY
let zosSessionPath = process.env.ZOS_SESSION_PATH

if (!logicAddress) {
  if (networkName === 'mainnet') {
    logicAddress = mainnetConfig.logicAddress
  } else if (networkName === 'ropsten') {
    logicAddress = ropstenConfig.logicAddress
  } else if (networkName === 'rinkeby') {
    logicAddress = rinkebyConfig.logicAddress
  } else if (networkName === 'kovan') {
    logicAddress = kovanConfig.logicAddress
  } else if (networkName === 'goerli') {
    logicAddress = goerliConfig.logicAddress
  }
}

//////////////////////////

function printConfig () {
  console.log('@authereum/contracts: networkName', networkName)
  console.log('@authereum/contracts: providerUri', providerUri)
  console.log('@authereum/contracts: logicAddress', logicAddress)
  console.log('@authereum/contracts: senderAddress', senderAddress)
  console.log('@authereum/contracts: currentDir', currentDir)
  console.log('@authereum/contracts: zosSessionPath', zosSessionPath)
}

printConfig()

let provider = new Web3.providers.HttpProvider(providerUri)
let web3 = new Web3(provider)

interface Config {
  networkName?: any
  providerUri?: string
  logicAddress?: string
  senderAddress?: string
  senderPrivateKey?: string
}

export default class AuthereumContracts {
  static setConfig (config: Config) {
    if (config.networkName) {
      networkName = config.networkName
    }

    if (config.providerUri) {
      providerUri = config.providerUri
      provider = new Web3.providers.HttpProvider(providerUri)
      web3 = new Web3(provider)
    }

    if (config.logicAddress) {
      logicAddress = config.logicAddress
    }

    if (config.senderAddress) {
      senderAddress = config.senderAddress
    }

    if (config.senderPrivateKey) {
      senderPrivateKey = config.senderPrivateKey
    }

    printConfig()
  }

  static async createAuthereumAccount (
    authKeyAddress: string,
    publicEnsRegistryAddress: string,
    label: string,
    salt: number,
    network: string,
    from: string,
    query: boolean
  ) {
    const adminAddress = '0x0000000000000000000000000000000000000000'
    const initData = await web3.eth.abi.encodeFunctionCall({
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
      }] }, [authKeyAddress, publicEnsRegistryAddress, label])

    const normalizedSalt = utils.normalizeHex(salt)
    const signature = await this.getZOSSignature(normalizedSalt, logicAddress, adminAddress, initData, senderAddress)
    const contractAlias = 'AuthereumAccount'
    const methodName = 'initialize'
    const methodArgs = [authKeyAddress, publicEnsRegistryAddress, label]
    const force = false

    ///// zos config /////
    zos.ConfigManager.setBaseConfig(currentDir)
    ;(zos.ConfigManager as any).config.cwd = currentDir
    const networkConfig = await zos.ConfigManager.initNetworkConfiguration({ network: networkName }, false, currentDir)
    zos.ConfigManager.initStaticConfiguration(currentDir)
    zos.ConfigManager.getBuildDir(`${currentDir}/dist/contracts`)
    Contracts.setLocalBuildDir(`${currentDir}/dist/contracts`)
    zos.ConfigManager.setBaseConfig(currentDir)

    const projectFile = new zos.files.ProjectFile(`${currentDir}/zos.json`)
    const networkFile = new zos.files.NetworkFile(projectFile, networkName,
      `${currentDir}/zos.${networkName}.json`)
    //////////////////////

    const res = await zos.scripts[query ? 'querySignedDeployment' : 'create']({
      contractAlias,
      methodName,
      methodArgs,
      force,
      salt: normalizedSalt,
      signature,
      network,
      networkFile,
      ...networkConfig
    })

    return res
  }

  static async getCreate2Address (
    authKeyAddress: string,
    publicEnsRegistryAddress: string,
    label: string,
    salt: number,
    network: string,
    from: string
  ) {
    const address = await this.createAuthereumAccount(
      authKeyAddress,
      publicEnsRegistryAddress,
      label,
      salt,
      network,
      from,
      true
    )

    return utils.toChecksumAddress(address)
  }

  static async deployAccount (
    authKeyAddress: string,
    publicEnsRegistryAddress: string,
    label: string,
    salt: number,
    network: string,
    from: string
  ) {
    const res = await this.createAuthereumAccount(
      authKeyAddress,
      publicEnsRegistryAddress,
      label,
      salt,
      network,
      from,
      false
    )

    return utils.toChecksumAddress((res as any).address)
  }

  static async getZOSSignature (
    salt: string,
    logicAddress: string,
    adminAddress: string,
    initData: string,
    senderAddress: string
  ) {
    const msgHash = web3.utils.soliditySha3(salt, logicAddress, adminAddress, initData, senderAddress)
    const signedMsg = web3.eth.accounts.sign(msgHash, senderPrivateKey)
    return signedMsg.signature
  }
}
