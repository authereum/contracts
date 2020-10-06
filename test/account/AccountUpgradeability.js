const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

contract('AccountUpgradeability', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Parameters
  let MSG_SIG
  let label
  let expectedSalt
  let expectedCreationCodeHash
  let nonce
  let to
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
  let authereumRecoveryModule
  let authereumProxy
  let authereumProxyAccount
  let authereumProxyAccountUpgrade
  let authereumProxyAccountUpgradeWithInit
  let erc1820Registry

  before(async () => {
    // Take snapshot to reset to a known state
    // This is required due to the deployment of the 1820 contract
    beforeAllSnapshotId = await timeUtils.takeSnapshot()
    
    // Deploy the recovery module
    authereumRecoveryModule = await ArtifactAuthereumRecoveryModule.new()

    // Deploy the 1820 contract
    await utils.deploy1820Contract(AUTHEREUM_OWNER)

    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Message signature
    MSG_SIG = await utils.getexecuteMultipleAuthKeyMetaTransactionsSig('2020070100')

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    const _proxyInitCode = await utils.getProxyBytecode()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(_proxyInitCode, authereumEnsManager.address)
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

    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Wrap in truffle-contract
    badContract = await ArtifactBadTransaction.new()
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Handle post-proxy deployment
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])

    // Generate params
    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()

    // Default transaction data
    to = authereumProxyAccount.address
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
    encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
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

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
  })

  // Take snapshot before each test and revert after each test
  // Also reset core params
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('implementation', () => {
    context('Happy Path', async () => {
      it('Should confirm the implementation address after the creation of a proxy', async () => {
        const implementationAddress = await authereumProxyAccount.implementation()
        assert.equal(authereumAccountLogicContract.address, implementationAddress)
      })
    })
  })
  describe('upgradeToAndCall', () => {
    context('Happy Path', async () => {
      it('Should upgrade a proxy\'s logic address (w/o init)', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _to = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        const _data = utils.encodeUpgradeToAndCall(
            authereumProxyAccountUpgradeLogicContract.address, '0x'
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
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
        const _proxyImplementationAddress = await utils.getImplementationAddressFromStorageSlot(authereumProxy.address)
        assert.equal(authereumProxyAccountUpgradeLogicContract.address, _proxyImplementationAddress)

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
        const _to = authereumProxyAccount.address
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
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
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
        const _proxyImplementationAddress = await utils.getImplementationAddressFromStorageSlot(authereumProxy.address)
        assert.equal(authereumProxyAccountUpgradeWithInitLogicContract.address, _proxyImplementationAddress)

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
      it('Should not allow an arbitrary account to upgrade through executeMultipleAuthKeyMetaTransactions()', async () => {
        // Confirm that auth key is not yet added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, false)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        // Get upgrade data
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'upgradeTestInit',
          type: 'function',
          inputs: []
        }, [])

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        // NOTE: The signing is done here manually (as opposed to calling utils.getAuthKeySignedMessageHash()) in
        // order to sign with the malicious signer
        let encodedParams = await web3.eth.abi.encodeParameters(
          ['address', 'bytes4', 'uint256', 'uint256', 'bytes[]', 'uint256', 'uint256', 'address', 'uint256'],
          [
            authereumProxyAccount.address,
            MSG_SIG,
            constants.CHAIN_ID,
            nonce,
            _transactions,
            gasPrice,
            gasOverhead,
            feeTokenAddress,
            feeTokenRate
          ]
        )
        let unsignedMessageHash = await web3.utils.soliditySha3(encodedParams)
        const MALICIOUS_PRIV_KEY = '0xb0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773'
        let signedMsg = web3.eth.accounts.sign(unsignedMessageHash, MALICIOUS_PRIV_KEY)
        const _transactionMessageHashSignature = signedMsg.signature

        await expectRevert(authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        ), constants.REVERT_MSG.AKMTA_AUTH_KEY_INVALID)
      })
      it('Should not allow a proxy\'s to upgrade w/ init in an incorrect order', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _to = authereumProxyAccount.address
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
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
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

        const _expectedReason = constants.REVERT_MSG.AUTHEREUM_CALL_REVERT + constants.REVERT_MSG.AI_IMPROPER_INIT_ORDER
        expectEvent.inLogs(logs, 'CallFailed', { reason: _expectedReason })
      })
      it('Should not allow a proxy\'s to upgrade w/ init in a non-contract address as the implementation address', async () => {
        // Set up params
        nonce = await authereumProxyAccount.nonce()
        nonce = nonce.toNumber()

        // Default transaction data
        const _to = authereumProxyAccount.address
        const _value = 0
        const _gasLimit = 1000000

        const _data = utils.encodeUpgradeToAndCall(
            constants.ZERO_ADDRESS, "0x"
          )

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
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

        const _expectedReason = constants.REVERT_MSG.AUTHEREUM_CALL_REVERT + constants.REVERT_MSG.AU_NON_CONTRACT_ADDRESS
        expectEvent.inLogs(logs, 'CallFailed', { reason: _expectedReason })
      })
    })
  })
})
