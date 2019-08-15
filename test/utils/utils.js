const { HASH_ZERO } = require('./constants.js')

const EnsRegistry = artifacts.require('EnsRegistry')
const EnsReverseRegistrar = artifacts.require('EnsReverseRegistrar')
const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')

const namehash = require('eth-ens-namehash')

/*
 * Signatures
 */
const { AUTH_KEY_0_PRIV_KEY, LOGIN_KEY_0_PRIV_KEY } = require('../utils/constants.js')
// Signing
const getMethodSign = (name, ...params) => {
  return web3.utils.sha3(`${name}(${params.join(',')})`).substr(0, 10)
}

const getArbitrarySignedMessage = (msg) => {
  // Get the unsigned message keccack256(abi.encodePacked())
  let unsignedMessageHash = web3.utils.soliditySha3(msg)
  let sigedMsg = web3.eth.accounts.sign(unsignedMessageHash, LOGIN_KEY_0_PRIV_KEY)
  return {
    messageHash: sigedMsg.messageHash,
    msgHashSignature: sigedMsg.signature
  }
}

const getArbitraryBytesSignedMessage = (msg) => {
  let sigedMsg = web3.eth.accounts.sign(msg, LOGIN_KEY_0_PRIV_KEY)
  return {
    messageHash: sigedMsg.messageHash,
    msgHashSignature: sigedMsg.signature
  }
}

const getAuthSignedMessage = (msg) => {
  let sigedMsg = web3.eth.accounts.sign(msg, AUTH_KEY_0_PRIV_KEY)
  return {
    messageHash: sigedMsg.messageHash,
    msgHashSignature: sigedMsg.signature
  }
}

// This function gets the signed message hash that is used to verify the _loginKeyAddress
// in the contract. It is signed by the login key. This function returns the signed
const getAuthKeySignedMessageHash = (address, msgSig, chainId, destination, data, value, nonce, gasPrice, gasLimit) => {
  // Get the unsigned message keccack256(abi.encodePacked())
  let unsignedMessageHash = web3.utils.soliditySha3(
    address, msgSig, chainId, destination, data, value, nonce, gasPrice, gasLimit
  )
  let sigedMsg = web3.eth.accounts.sign(unsignedMessageHash, AUTH_KEY_0_PRIV_KEY)
  return sigedMsg.signature
}

const getLoginKeySignedMessageHash = (address, msgSig, chainId, destination, data, value, nonce, gasPrice, gasLimit) => {
  // Get the unsigned message keccack256(abi.encodePacked())
  let unsignedMessageHash = web3.utils.soliditySha3(
    address, msgSig, chainId, destination, data, value, nonce, gasPrice, gasLimit
  )
  let sigedMsg = web3.eth.accounts.sign(unsignedMessageHash, LOGIN_KEY_0_PRIV_KEY)
  return sigedMsg.signature
}

// This function gets the signed login key (signed by the auth key). It returns the
// signed login key.
const getSignedLoginKey = (loginKey) => {
  let unsignedLoginKeyHash = web3.utils.soliditySha3(loginKey)
  let sigedMsg = web3.eth.accounts.sign(unsignedLoginKeyHash, AUTH_KEY_0_PRIV_KEY)
  return sigedMsg.signature
}

const getFailedTxHash = (nonce, destination, value, data) => {
  return web3.utils.soliditySha3(
    nonce, destination, value, data
  )
}

// Combines two hex strings into one hex string
const concatHex = (hex1, hex2) => {
  hex2 = hex2.slice(2)
  return hex1.concat(hex2)
}

/*
 * ENS
 */
const setENSDefaults = async (authereumOwner, ensOwner) => {

  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now
  const ethLabel = 'eth'
  const authereumLabel = 'authereum'
  const reverseLabel = 'reverse'
  const addrLabel = 'addr'
  const authereumDotEthDomain = authereumLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authereumHash = web3.utils.soliditySha3(authereumLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authereumDotEthNode = namehash.hash(authereumDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)

  // Deploy contracts
  ensRegistry = await EnsRegistry.new({ from: authereumOwner })
  authereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: authereumOwner })
  ensReverseRegistrar = await EnsReverseRegistrar.new(ensRegistry.address, authereumEnsResolver.address, { from: authereumOwner })
  authereumEnsManager = await AuthereumEnsManager.new(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: authereumOwner })

  // Setup up contracts to mimic mainnet
  await ensRegistry.setSubnodeOwner(HASH_ZERO, reverseHash, authereumOwner, { from: authereumOwner })
  await ensRegistry.setSubnodeOwner(reverseTldNode, addrHash, ensReverseRegistrar.address, { from: authereumOwner })

  // Claim authereum.eth. Give it to the Authereum ENS Manager.
  await ensRegistry.setSubnodeOwner(HASH_ZERO, ethHash, authereumOwner, { from: authereumOwner })
  await ensRegistry.setSubnodeOwner(ethTldNode, authereumHash, authereumEnsManager.address, { from: authereumOwner })

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

module.exports = {
  getMethodSign,
  getArbitrarySignedMessage,
  getArbitraryBytesSignedMessage,
  getAuthSignedMessage,
  getAuthKeySignedMessageHash,
  getLoginKeySignedMessageHash,
  getSignedLoginKey,
  getFailedTxHash,
  concatHex,
  setENSDefaults,
}