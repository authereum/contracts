const constants = require('./constants')

const ArtifactEnsRegistry = artifacts.require('EnsRegistry')
const ArtifactEnsReverseRegistrar = artifacts.require('EnsReverseRegistrar')
const ArtifactAuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const ArtifactAuthereumEnsResolverProxy = artifacts.require('AuthereumEnsResolverProxy')
const ArtifactAuthereumEnsManager = artifacts.require('AuthereumEnsManager')

const namehash = require('eth-ens-namehash')

/*
 * Signatures
 */
const { AUTH_KEY_0_PRIV_KEY, LOGIN_KEY_0_PRIV_KEY } = require('../utils/constants.js')

const getMethodSign = (name, ...params) => {
  return web3.utils.sha3(`${name}(${params.join(',')})`).substr(0, 10)
}

const getArbitrarySignedMessage = (msg) => {
  // Get the unsigned message keccak256(abi.encodePacked())
  let unsignedMessageHash = web3.utils.soliditySha3(msg)
  let signedMsg = web3.eth.accounts.sign(unsignedMessageHash, LOGIN_KEY_0_PRIV_KEY)
  return {
    messageHash: signedMsg.messageHash,
    msgHashSignature: signedMsg.signature
  }
}

const getSignedMessageData = (msg, privateKey) => {
  let signedMsg = web3.eth.accounts.sign(msg, privateKey)
  return {
    msgHash: signedMsg.messageHash,
    msgHashSignature: signedMsg.signature
  }

}

// Encode tx data params
const encodeTransactionParams = async (to, value, gasLimit, data) => {
  return web3.eth.abi.encodeParameters(
    ['address', 'uint256', 'uint256', 'bytes'],
    [to, value, gasLimit, data]
  )
}

const signBytesData = async (bytesData, customPrivateKey = '') => {
  // This signs bytes data
  // The value passed as the data parameter will be UTF-8 HEX decoded and
  // wrapped as follows: "\x19Ethereum Signed Message:\n" + message.length + message.
  const privateKey = customPrivateKey === '' ? AUTH_KEY_0_PRIV_KEY : customPrivateKey
  // const encodedParam = await web3.eth.abi.encodeParameter('bytes', bytesData)
  // const hashedMsg = await web3.utils.soliditySha3(bytesData)
  const signedMsgData = await web3.eth.accounts.sign(bytesData, privateKey)
  return signedMsgData.signature
}
// This function gets the signed message hash that is used to verify the _loginKeyAddress
// in the contract. It is signed by the login key. This function returns the signed
const getAuthKeySignedMessageHash = async (address, msgSig, chainId, nonce, transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate) => {
  // Get the unsigned message
  // NOTE: For AuthereumAccount.sol versions >= 2019111500
  // NOTE: let encodedParams = web3.eth.abi.encodeParameters()
  // NOTE: web3.utils.soliditySha3(encodedParams) = keccak256(abi.encode())
  // NOTE: For AuthereumAccount.sol versions < 2019111500
  // NOTE: web3.utils.soliditySha3() = keccak256(abi.encodePacked())
  let encodedParams = await web3.eth.abi.encodeParameters(
    ['address', 'bytes4', 'uint256', 'uint256', 'bytes[]', 'uint256', 'uint256', 'address', 'uint256'],
    [address, msgSig, chainId, Number(nonce), transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate]
  )
  let unsignedMessageHash = await web3.utils.soliditySha3(encodedParams)
  let signedMsg = web3.eth.accounts.sign(unsignedMessageHash, AUTH_KEY_0_PRIV_KEY)
  return signedMsg.signature
}

const getLoginKeySignedMessageHash = async (address, msgSig, chainId, nonce, transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate) => {
  // Get the unsigned message
  // NOTE: For AuthereumAccount.sol versions >= 2019111500
  // NOTE: let encodedParams = web3.eth.abi.encodeParameters()
  // NOTE: web3.utils.soliditySha3(encodedParams) = keccak256(abi.encode())
  // NOTE: For AuthereumAccount.sol versions < 2019111500
  // NOTE: web3.utils.soliditySha3() = keccak256(abi.encodePacked())
  let encodedParams = await web3.eth.abi.encodeParameters(
    ['address', 'bytes4', 'uint256', 'uint256', 'bytes[]', 'uint256', 'uint256', 'address', 'uint256'],
    [address, msgSig, chainId, Number(nonce), transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate]
  )
  let unsignedMessageHash = await web3.utils.soliditySha3(encodedParams)
  let signedMsg = web3.eth.accounts.sign(unsignedMessageHash, LOGIN_KEY_0_PRIV_KEY)
  return signedMsg.signature
}

// This function gets the signed login key (signed by the auth key). It returns the
// signed login key.
const getSignedLoginKey = (loginKey, loginKeyRestrictionsData) => {
  let loginKeyMessageData = web3.eth.abi.encodeParameters(
    ['address', 'bytes'],
    [loginKey, loginKeyRestrictionsData]
  )

  let unsignedLoginKeyHash = web3.utils.soliditySha3(loginKeyMessageData)
  let signedMsg = web3.eth.accounts.sign(unsignedLoginKeyHash, AUTH_KEY_0_PRIV_KEY)
  return signedMsg.signature
}

// Combines two hex strings into one hex string
const concatHex = (hex1, hex2) => {
  hex2 = hex2.slice(2)
  return hex1.concat(hex2)
}

// Convert string to bytes
const stringToBytes = (str) => {
  const hex = web3.utils.asciiToHex(str)
  return web3.utils.hexToBytes(hex)
}

/*
 * ENS
 */

const setENSDefaults = async (authereumOwner) => {

  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now
  const ethLabel = 'eth'
  const authLabel = 'auth'
  const reverseLabel = 'reverse'
  const addrLabel = 'addr'
  const authDotEthDomain = authLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authHash = web3.utils.soliditySha3(authLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authereumDotEthNode = namehash.hash(authDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)

  // Deploy contracts
  ensRegistry = await ArtifactEnsRegistry.new({ from: authereumOwner })
  // NOTE: The Authereum ENS Resolver is deployed via a proxy.
  // NOTE: The logic contract must be deployed first, followed by the proxy, then one must wrap the proxy in the logic artifact
  authereumEnsResolverLogicContract = await ArtifactAuthereumEnsResolver.new(ensRegistry.address, { from: authereumOwner })
  authereumEnsResolverProxy = await ArtifactAuthereumEnsResolverProxy.new(authereumEnsResolverLogicContract.address, { from: authereumOwner })
  authereumEnsResolver = await ArtifactAuthereumEnsResolver.at(authereumEnsResolverProxy.address)
  ensReverseRegistrar = await ArtifactEnsReverseRegistrar.new(ensRegistry.address, authereumEnsResolver.address, { from: authereumOwner })
  authereumEnsManager = await ArtifactAuthereumEnsManager.new(authDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: authereumOwner })

  // Setup up contracts to mimic mainnet
  await ensRegistry.setSubnodeOwner(constants.HASH_ZERO, reverseHash, authereumOwner, { from: authereumOwner })
  await ensRegistry.setSubnodeOwner(reverseTldNode, addrHash, ensReverseRegistrar.address, { from: authereumOwner })

  // Claim auth.eth. Give it to the Authereum ENS Manager.
  await ensRegistry.setSubnodeOwner(constants.HASH_ZERO, ethHash, authereumOwner, { from: authereumOwner })
  await ensRegistry.setSubnodeOwner(ethTldNode, authHash, authereumEnsManager.address, { from: authereumOwner })

  // Set up Authereum managers
  await authereumEnsResolver.addManager(authereumOwner, { from: authereumOwner })
  await authereumEnsResolver.addManager(authereumEnsManager.address, { from: authereumOwner })

  return {
    ensRegistry: ensRegistry,
    ensReverseRegistrar: ensReverseRegistrar,
    authereumEnsResolver: authereumEnsResolver,
    authereumEnsManager: authereumEnsManager,
  }
}
const setAuthereumENSManagerDefaults = async (authereumEnsManager, authereumOwner, proxyFactory, authereumProxyRuntimeCodeHash) => {
  await authereumEnsManager.changeAuthereumFactoryAddress(proxyFactory, { from: authereumOwner })
}

const getReverseNode = async (nodeOwner) => {
  const ADDR_REVERSE_NODE = '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2'
  let sha3HexAddressUserZero = web3.utils.soliditySha3(
    { t: 'string', v: nodeOwner.slice(2).toLowerCase() }
  )

  return web3.utils.soliditySha3(
    { t: 'bytes32', v: ADDR_REVERSE_NODE },
    { t: 'bytes32', v: sha3HexAddressUserZero}
  )
}


/*
 * Proxy functions
 */

const setAuthereumProxyFactory = async (project) => {
  return await project.ensureProxyFactory()
}

/*
 * create2 Functions
 */

// Inspiration from miguelmota's solidity-create-2-example repo
// https://github.com/miguelmota/solidity-create2-example/blob/master/test/utils/index.js#L56
function buildCreate2Address(proxyFactory, saltHash, proxyBytecodeWithConstructorHash) {
  const nonChecksumAddress = `0x${web3.utils.sha3(`0x${[
    'ff',
    proxyFactory,
    saltHash,
    proxyBytecodeWithConstructorHash
  ].map(x => x.replace(/0x/, ''))
  .join('')}`).slice(-40)}`.toLowerCase()

  return web3.utils.toChecksumAddress(nonChecksumAddress)
}

function getSaltHash(_salt, _initCode, _logicContractAddress) {
  const _encodedParams = web3.eth.abi.encodeParameter('bytes[]', _initCode)
  const _hashedInitCode = web3.utils.soliditySha3(_encodedParams)
  return web3.utils.soliditySha3(_salt, _hashedInitCode, _logicContractAddress)
}

/*
 * Encoding
 */

function encodeUpgrade(implementationAddress) {
  return web3.eth.abi.encodeFunctionCall({
    name: 'upgrade',
    type: 'function',
    inputs: [{
        type: 'address',
        name: 'implementation'
    }]
  }, [implementationAddress]);
}

function encodeUpgradeToAndCall(implementationAddress, data) {
  return web3.eth.abi.encodeFunctionCall({
    name: 'upgradeToAndCall',
    type: 'function',
    inputs: [{
        type: 'address',
        name: '_newImplementation'
    },{
        type: 'bytes',
        name: '_data'
    }]
  }, [implementationAddress, data]);
}

const getAuthereumAccountCreationData = async (authKey) => {
  const creationDataV1 = await getAuthereumAccountCreationDataV1(authKey)
  const creationDataV2 = await getAuthereumAccountCreationDataV2(constants.DEFAULT_DEPLOYMENT_COST, constants.ZERO_ADDRESS)
  const creationDataV3 = await getAuthereumAccountCreationDataV3()
  return [creationDataV1, creationDataV2, creationDataV3]
}

const getAuthereumAccountCreationDataV1 = async (authKey) => {
  authKey = web3.utils.toChecksumAddress(authKey)
  return web3.eth.abi.encodeFunctionCall({
      name: 'initializeV1',
      type: 'function',
      inputs: [{
        type: 'address',
        name: '_authKey'
      }]
  }, [authKey])
}

const getAuthereumAccountCreationDataV2 = async (deploymentCost, deploymentFeeTokenAddress) => {
  return web3.eth.abi.encodeFunctionCall({
      name: 'initializeV2',
      type: 'function',
      inputs: [{
        type: 'uint256',
        name: '_deploymentCost'
      }, {
        type: 'address',
        name: '_deploymentFeeTokenAddress'
      }]
  }, [deploymentCost, deploymentFeeTokenAddress])
}

const getAuthereumAccountCreationDataV3 = async () => {
  return web3.eth.abi.encodeFunctionCall({
      name: 'initializeV3',
      type: 'function',
      inputs: []
  }, [])
}

const createProxyInitializeV1 = async (
  salt,
  txOrigin,
  authereumProxyFactory,
  authKey,
  label,
  logicContractAddress,
) => {
  const accountCreationData = await getAuthereumAccountCreationDataV1(authKey)

  await authereumProxyFactory.createProxy(salt, label, [accountCreationData], logicContractAddress)

  // Deploy the proxy
  const saltHash = getSaltHash(salt, [accountCreationData], logicContractAddress)
  const proxyBytecodeWithConstructorHash = await getProxyBytecodeWithConstructorHash(logicContractAddress)
  return buildCreate2Address(authereumProxyFactory.address, saltHash, proxyBytecodeWithConstructorHash)
}

const createProxyInitializeV2 = async (
  salt,
  txOrigin,
  authereumProxyFactory,
  label,
  logicContractAddress,
) => {
  const accountCreationData = await getAuthereumAccountCreationDataV2(constants.DEFAULT_DEPLOYMENT_COST, constants.ZERO_ADDRESS)

  await authereumProxyFactory.createProxy(salt, label, [accountCreationData], logicContractAddress)

  // Deploy the proxy
  const saltHash = getSaltHash(salt, [accountCreationData], logicContractAddress)
  const proxyBytecodeWithConstructorHash = await getProxyBytecodeWithConstructorHash(logicContractAddress)
  return buildCreate2Address(authereumProxyFactory.address, saltHash, proxyBytecodeWithConstructorHash)
}

const createProxyInitializeV3 = async (
  salt,
  txOrigin,
  authereumProxyFactory,
  label,
  logicContractAddress,
) => {
  const accountCreationData = await getAuthereumAccountCreationDataV3()

  await authereumProxyFactory.createProxy(salt, label, [accountCreationData], logicContractAddress)

  // Deploy the proxy
  const saltHash = getSaltHash(salt, [accountCreationData], logicContractAddress)
  const proxyBytecodeWithConstructorHash = await getProxyBytecodeWithConstructorHash(logicContractAddress)
  return buildCreate2Address(authereumProxyFactory.address, saltHash, proxyBytecodeWithConstructorHash)
}

// NOTE: There is no init function to call when being updated, so the data is
// NOTE: the same as if the original creation data was being used
const getAuthereumAccountCreationDataWithUpgrade = async (authKey) => {
  return getAuthereumAccountCreationData(authKey)
}

const getAuthereumAccountCreationDataWithUpgradeWithInit = async (authKey) => {
  return [
    await web3.eth.abi.encodeFunctionCall({
      name: 'initializeV1',
      type: 'function',
      inputs: [{
          type: 'address',
          name: '_authKey'
      }]
  }, [authKey]),
    await web3.eth.abi.encodeFunctionCall({
      name: 'upgradeTestInit',
      type: 'function',
      inputs: []
    }, [])
  ]
}


const createDefaultProxy = async (
  salt,
  txOrigin,
  authereumProxyFactory,
  authKey,
  authereumRecoveryModule,
  label,
  authereumAccountLogicContractAddress
) => {
  return await createProxy(
    salt, txOrigin, authereumProxyFactory, authKey, authereumRecoveryModule,
    label, authereumAccountLogicContractAddress
  )
}

const createProxy = async (
  salt,
  txOrigin,
  authereumProxyFactory,
  authKey,
  label,
  logicContractAddress,
) => {
  const accountCreationData = await getAuthereumAccountCreationData(authKey)

  await authereumProxyFactory.createProxy(salt, label, accountCreationData, logicContractAddress)

  const saltHash = getSaltHash(salt, accountCreationData, logicContractAddress)
  const proxyBytecodeWithConstructorHash = await getProxyBytecodeWithConstructorHash(logicContractAddress)
  return buildCreate2Address(authereumProxyFactory.address, saltHash, proxyBytecodeWithConstructorHash)
}

const getProxyBytecode = () => {
  return constants.AUTHEREUM_PROXY_CREATION_CODE
}

const getProxyBytecodeWithConstructor = async (logicContract) => {
  const bytecode = getProxyBytecode()
  const encodedLogicAddress = await web3.eth.abi.encodeParameter('address', logicContract)
  return bytecode + encodedLogicAddress.slice(2)
}

const getProxyBytecodeWithConstructorHash = async (logicContract) => {
  const proxyBytecodeWithConstructor = await getProxyBytecodeWithConstructor(logicContract)
  return web3.utils.sha3(proxyBytecodeWithConstructor)
}

const getexecuteMultipleAuthKeyMetaTransactionsSig = async (versionNumber) => {
  if (versionNumber === '2019102500') {
    return await web3.eth.abi.encodeFunctionSignature({
        name: 'executeMultipleAuthKeyMetaTransactions',
        type: 'function',
        inputs: [{
            type: 'address[]',
            name: '_tos'
        },{
            type: 'bytes[]',
            name: '_datas'
        },{
            type: 'uint256[]',
            name: '_values'
        },{
            type: 'uint256[]',
            name: '_gasLimits'
        },{
            type: 'bytes[]',
            name: '_transactionMessageHashSignatures'
        }
      ]
    })
  } else if (versionNumber === '2019111500' ||
             versionNumber === '2019122000' ||
             versionNumber === '2019122100' ||
             versionNumber === '2020010900' ||
             versionNumber === '2020020200' ||
             versionNumber === '2020021700' ||
             versionNumber === '2020070100'
  ) {
    return await web3.eth.abi.encodeFunctionSignature({
        name: 'executeMultipleAuthKeyMetaTransactions',
        type: 'function',
        inputs: [{
            type: 'bytes[]',
            name: '_transactions'
        },{
            type: 'uint256',
            name: '_gasPrice'
        },{
            type: 'uint256',
            name: '_gasOverhead'
        },{
            type: 'address',
            name: '_feeTokenAddress'
        },{
            type: 'uint256',
            name: '_feeTokenRate'
        },{
            type: 'bytes',
            name: '_transactionMessageHashSignature'
        }
      ]
    })
  }
}

const getexecuteMultipleLoginKeyMetaTransactionsSig = async (versionNumber) => {
  if (versionNumber === '2019102500') {
    return await web3.eth.abi.encodeFunctionSignature({
        name: 'executeMultipleLoginKeyMetaTransactions',
        type: 'function',
        inputs: [{
            type: 'address[]',
            name: '_tos'
        },{
            type: 'bytes[]',
            name: '_datas'
        },{
            type: 'uint256[]',
            name: '_values'
        },{
            type: 'uint256[]',
            name: '_gasLimits'
        },{
            type: 'bytes[]',
            name: '_transactionMessageHashSignatures'
        },{
            type: 'bytes',
            name: '_loginKeyAttestationSignature'
        }
      ]
    })
  } else if (versionNumber === '2019111500' ||
             versionNumber === '2019122000' ||
             versionNumber === '2019122100' ||
             versionNumber === '2020010900' ||
             versionNumber === '2020020200' ||
             versionNumber === '2020021700' ||
             versionNumber === '2020070100'
    ) {
    return await web3.eth.abi.encodeFunctionSignature({
        name: 'executeMultipleLoginKeyMetaTransactions',
        type: 'function',
        inputs: [{
            type: 'bytes[]',
            name: '_transactions'
        },{
            type: 'uint256',
            name: '_gasPrice'
        },{
            type: 'uint256',
            name: '_gasOverhead'
        },{
            type: 'bytes',
            name: '_loginKeyRestrictionsData'
        },{
            type: 'address',
            name: '_feeTokenAddress'
        },{
            type: 'uint256',
            name: '_feeTokenRate'
        },{
            type: 'bytes',
            name: '_transactionMessageHashSignature'
        },{
            type: 'bytes',
            name: '_loginKeyAttestationSignature'
        }
      ]
    })
  }
}

function expectRawEvent(txReceipt, eventSignature) {
  const eventTopic = web3.utils.sha3(eventSignature)
  const events = txReceipt.receipt.rawLogs.filter( log => {
    return log.topics[0] === eventTopic
  })
  expect(events.length).to.be.gt(0)
}

const deploy1820Contract = async (deployer) => {
  // Fund the ERC1820_DEPLOYER_ADDRESS
  await web3.eth.sendTransaction({
    from: deployer,
    to: constants.ERC1820_DEPLOYER_ADDRESS,
    value: web3.utils.toWei('0.08')
  })

  await web3.eth.sendSignedTransaction(constants.ERC1820_SIGNED_DEPLOY_TRANSACTION)
}

const setAuthereumRecoveryModule = async (authereumAccount, authereumRecoveryModuleAddress, authKeyAddress) => {
  return authereumAccount.addAuthKey(
    authereumRecoveryModuleAddress, { from: authKeyAddress }
  )
}

const getErc1820RegistrySetData = async (authereumAccountAddress, erc1820RegistryAddress) => {
  authereumAccountAddress = web3.utils.toChecksumAddress(authereumAccountAddress)
  erc1820RegistryAddress = web3.utils.toChecksumAddress(erc1820RegistryAddress)
  return  web3.eth.abi.encodeFunctionCall({
      name: 'setInterfaceImplementer',
      type: 'function',
      inputs: [{
          type: 'address',
          name: 'account'
      }, {
          type: 'bytes32',
          name: 'interfaceHash'
      }, {
          type: 'address',
          name: 'implementer'
      }]
  }, [authereumAccountAddress,
      constants.TOKENS_RECIPIENT_INTERFACE_HASH,
      authereumAccountAddress
    ])
}

const getImplementationAddressFromStorageSlot = async (_proxyAddress) => {
  const _implementationAddress = await web3.eth.getStorageAt(_proxyAddress, constants.IMPLEMENTATION_SLOT)
  return web3.utils.toChecksumAddress(_implementationAddress)
}

module.exports = {
  getMethodSign,
  getArbitrarySignedMessage,
  getSignedMessageData,
  encodeTransactionParams,
  signBytesData,
  getAuthKeySignedMessageHash,
  getLoginKeySignedMessageHash,
  getSignedLoginKey,
  concatHex,
  stringToBytes,
  setENSDefaults,
  setAuthereumENSManagerDefaults,
  getReverseNode,
  setAuthereumProxyFactory,
  buildCreate2Address,
  getSaltHash,
  encodeUpgrade,
  encodeUpgradeToAndCall,
  getAuthereumAccountCreationData,
  getAuthereumAccountCreationDataV1,
  getAuthereumAccountCreationDataV2,
  getAuthereumAccountCreationDataV3,
  createProxyInitializeV1,
  createProxyInitializeV2,
  createProxyInitializeV3,
  getAuthereumAccountCreationDataWithUpgrade,
  getAuthereumAccountCreationDataWithUpgradeWithInit,
  createDefaultProxy,
  createProxy,
  getProxyBytecode,
  getProxyBytecodeWithConstructor,
  getProxyBytecodeWithConstructorHash,
  getexecuteMultipleAuthKeyMetaTransactionsSig,
  getexecuteMultipleLoginKeyMetaTransactionsSig,
  expectRawEvent,
  deploy1820Contract,
  setAuthereumRecoveryModule,
  getErc1820RegistrySetData,
  getImplementationAddressFromStorageSlot
}
