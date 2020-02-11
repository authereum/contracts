const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const { setENSDefaults, setAuthereumENSManagerDefaults, buildCreate2Address, getSaltHash } = require('../utils/utils')
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')

contract('AccountUpgradeability', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Params
  let snapshotId

  // Parameters
  let MSG_SIG
  let label
  let expectedSalt
  let expectedCreationCodeHash
  let nonce
  let destination
  let value
  let gasLimit
  let implementationData
  let data
  let gasPrice
  let gasOverhead
  let feeTokenAddress
  let feeTokenRate
  let transactionMessageHashSignature
  let encodedParameters
  let transactions

  // Addresses
  let expectedAddresses
  let expectedAddress
  let expectedAddressWithUpgrade
  let expectedAddressWithUpgradeWithInit

  // Logic Addresses
  let authereumProxyFactoryLogicContract
  let authereumAccountLogicContract
  let authereumProxyAccountUpgradeLogicContract
  let authereumProxyAccountUpgradeWithInitLogicContract

  // Contract Instances
  let authereumProxy
  let authereumProxyAccount
  let authereumProxyAccountUpgrade
  let authereumProxyAccountUpgradeWithInit

  before(async () => {
    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Message signature
    MSG_SIG = await utils.getexecuteMultipleAuthKeyMetaTransactionsSig('2019111500')

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
    authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
    authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)
    
    // Create default proxies
    label = constants.DEFAULT_LABEL
    expectedSalt = constants.SALT
    expectedCreationCodeHash = constants.AUTHEREUM_PROXY_CREATION_CODE_HASH

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEYS[0], label, authereumAccountLogicContract.address
    )

    // Wrap in truffle-contract
    badContract = await ArtifactBadTransaction.new()
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Send relayer ETH to use as a transaction fee
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
  
    // Generate params
    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()

    // Default transaction data
    destination = authereumProxyAccount.address
    value = 0
    gasPrice = constants.GAS_PRICE
    gasLimit = constants.GAS_LIMIT
    gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    feeTokenAddress = constants.ZERO_ADDRESS
    feeTokenRate = 0

    // Get upgrade data
    implementationData = await web3.eth.abi.encodeFunctionCall({
      name: 'upgradeTestInit',
      type: 'function',
      inputs: []
    }, [])
  
    data = utils.encodeUpgradeToAndCall(
      authereumProxyAccountUpgradeWithInitLogicContract.address, implementationData
    )

    // Convert to transactions array
    encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
    transactions = [encodedParameters]

    // Get default signedMessageHash and signedLoginKey
    transactionMessageHashSignature = utils.getAuthKeySignedMessageHash(
      authereumProxyAccount.address,
      MSG_SIG,
      constants.CHAIN_ID,
      nonce,
      transactions,
      gasPrice,
      gasOverhead,
      feeTokenAddress,
      feeTokenRate
    )
  })

  // Take snapshot before each test and revert after each test
  // Also reset core params
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot();
  });
 
  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result);
  });

  //**********//
  //  Tests  //
  //********//

  describe('upgradeToAndCall', () => {
    context('Happy Path', async () => {
      it('Should upgrade a proxy\'s logic address (w/o init)', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _destination = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        const _data = utils.encodeUpgradeToAndCall(
            authereumProxyAccountUpgradeLogicContract.address, '0x'
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        // Upgrade account
        var { logs } = await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Check that the event got emitted
        expectEvent.inLogs(logs, 'Upgraded', { implementation: authereumProxyAccountUpgradeLogicContract.address })

        // Check that this does not affect the proxy's ability to interact with the logic addr it set
        // Check the proxy's logic address
        const proxyImplementationAddress = await authereumProxy.implementation()
        assert.equal(authereumProxyAccountUpgradeLogicContract.address, proxyImplementationAddress)

        // Check that the proxy can call a function on the expected logic address
        const chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)

        // Check that the upgrade worked
        const upgradedAuthereumProxyAccount = await ArtifactAuthereumProxyAccountUpgrade.at(expectedAddress)
        const upgradeTestVal = await upgradedAuthereumProxyAccount.upgradeTest()
        assert.equal(upgradeTestVal, 42)
      })
      it('Should upgrade a proxy\'s logic address (w/ init)', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _destination = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        // Get upgrade data
        implementationData = await web3.eth.abi.encodeFunctionCall({
          name: 'upgradeTestInit',
          type: 'function',
          inputs: []
        }, [])
      
        const _data = utils.encodeUpgradeToAndCall(
            authereumProxyAccountUpgradeWithInitLogicContract.address, implementationData
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        // Upgrade account
        var { logs } = await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Check that the event got emitted
        expectEvent.inLogs(logs, 'Upgraded', { implementation: authereumProxyAccountUpgradeWithInitLogicContract.address })

        // Check that this does not affect the proxy's ability to interact with the logic addr it set
        // Check the proxy's logic address
        const proxyImplementationAddress = await authereumProxy.implementation()
        assert.equal(authereumProxyAccountUpgradeWithInitLogicContract.address, proxyImplementationAddress)

        // Check that the proxy can call a function on the expected logic address
        const chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)

        // Check that the upgrade worked
        const upgradedAuthereumProxyAccount = await ArtifactAuthereumProxyAccountUpgradeWithInit.at(expectedAddress)
        const upgradeTestVal = await upgradedAuthereumProxyAccount.upgradeTest()
        assert.equal(upgradeTestVal, 42)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary account to call this function', async () => {
        // Get upgrade data
        implementationData = await web3.eth.abi.encodeFunctionCall({
          name: 'upgradeTestInit',
          type: 'function',
          inputs: []
        }, [])
        
        await expectRevert(
          authereumAccountLogicContract.upgradeToAndCall(accounts[8], implementationData, { from: accounts[0] }
        ), constants.REVERT_MSG.BA_REQUIRE_SELF)
      })
      it('Should not allow a proxy\'s to upgrade w/ init in an incorrect order', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _destination = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        // Get upgrade data
        implementationData = await web3.eth.abi.encodeFunctionCall({
          name: 'initializeV1',
          type: 'function',
          inputs: [{
            type: 'address',
            name: '_authKey'
          }]
        }, [AUTH_KEYS[0]])
      
        const _data = utils.encodeUpgradeToAndCall(
            authereumProxyAccountUpgradeWithInitLogicContract.address, implementationData
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        var { logs } = await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.AI_IMPROPER_INIT_ORDER })
      })
      it('Should not allow a proxy\'s to upgrade w/ init in a non-contract address as the implementation address', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _destination = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        const _data = utils.encodeUpgradeToAndCall(
            constants.ZERO_ADDRESS, "0x"
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        var { logs } = await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.AU_NON_CONTRACT_ADDRESS })
      })
    })
  })
})