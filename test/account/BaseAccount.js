const { balance, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

contract('BaseAccount', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7]]
  const ENS_OWNER = accounts[8]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEYS = [accounts[10]]

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Params
  let badContract

  let MSG_SIG
  let label
  let expectedSalt
  let expectedCreationCodeHash
  let nonce
  let to
  let value
  let gasLimit
  let data
  let gasPrice
  let gasOverhead
  let loginKeyRestrictionsData
  let feeTokenAddress
  let feeTokenRate
  let transactionMessageHashSignature
  let encodedParameters
  let transactions
  let loginKeyAttestationSignature

  // Addresses
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
    // Deploy Bad Contract
    badContract = await ArtifactBadTransaction.new()

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
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Handle post-proxy deployment
    // await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])

    // Default transaction data
    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()
    to = RECEIVERS[0]
    value = 0
    gasLimit = constants.GAS_LIMIT
    data = '0x00'
    gasPrice = constants.GAS_PRICE
    gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    loginKeyRestrictionsData = constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA
    feeTokenAddress = constants.ZERO_ADDRESS
    feeTokenRate = constants.DEFAULT_TOKEN_RATE

    // Convert to transactions array
    encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
    transactions = [encodedParameters]

    // Get default signedMessageHash and signedLoginKey
    transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
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

    loginKeyAttestationSignature = utils.getSignedLoginKey(LOGIN_KEYS[0], loginKeyRestrictionsData)
  })

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('fallback', () => {
    it('Should allow anyone to send funds to the contract', async () => {
      await authereumProxyAccount.sendTransaction({ value: constants.ONE_ETHER, from: AUTH_KEYS[1] })
      let accountBalance = await balance.current(authereumProxyAccount.address)
      assert.equal(Number(accountBalance), constants.ONE_ETHER)
      await authereumProxyAccount.sendTransaction({ value: constants.TWO_ETHER, from: RELAYER })
      accountBalance = await balance.current(authereumProxyAccount.address)
      assert.equal(Number(accountBalance), constants.THREE_ETHER)
      await authereumProxyAccount.sendTransaction({ value: constants.ONE_ETHER, from: OWNER })
      accountBalance = await balance.current(authereumProxyAccount.address)
      assert.equal(Number(accountBalance), constants.FOUR_ETHER)
    })
    it('Should use exactly 21062 gas on a transaction with no data', async () => {
      // NOTE: The update from constantinople to istanbul forced a change in gas here.
      // This test was originally written to determine these changes. Since the
      // fork was successfully implemented, the constantinople checks have been
      // removed.
      const expectedGas = 21062

      // NOTE: There is a bug in Truffle that causes data to not be sent
      // NOTE: with the transaction when sending with truffle-contracts.
      // NOTE: This web3 call is a workaround to that bug
      // NOTE: https://github.com/trufflesuite/truffle/pull/2275
      const transaction = await web3.eth.sendTransaction({
         from: AUTH_KEYS[0], to: authereumProxyAccount.address, value: constants.ONE_ETHER
      })
      assert.equal(transaction.gasUsed, expectedGas)
    })
    it('Should use exactly 22906 gas on a transaction with data', async () => {
      // NOTE: The update from constantinople to istanbul forced a change in gas here.
      // This test was originally written to determine these changes. Since the
      // fork was successfully implemented, the constantinople checks have been
      // removed.
      const expectedGas = 22906

      // NOTE: There is a bug in Truffle that causes data to not be sent
      // NOTE: with the transaction when sending with truffle-contracts.
      // NOTE: This web3 call is a workaround to that bug
      // NOTE: https://github.com/trufflesuite/truffle/pull/2275
      const transaction = await web3.eth.sendTransaction({
         from: AUTH_KEYS[0], to: authereumProxyAccount.address, value: constants.ONE_ETHER, data: '0xd3e90b01'
      })
      assert.equal(transaction.gasUsed, expectedGas)
    })
  })
  describe('getChainId', () => {
    it('Should return a chain ID of 1', async () => {
      const _chainId = await authereumProxyAccount.getChainId()
      assert.equal(_chainId, constants.CHAIN_ID)
    })
  })
  describe('addAuthKey', () => {
    context('Happy Path', async () => {
      it('Should add an authKey', async () => {
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        const authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        const numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)
      })
      it('Should add two authKeys', async () => {
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        const authKey1 = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey1, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        let numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        const authKey2 = await authereumProxyAccount.authKeys(AUTH_KEYS[2])
        assert.equal(authKey2, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[2] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 4)
      })
      it('Should add an authKey through executeMultipleAuthKeyMetaTransactions', async () => {
        // Confirm that auth key is not yet added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, false)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'addAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [AUTH_KEYS[1]])

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // NOTE: As of AuthereumAccountv202003xx00, the contract no longer has a concept of if it should or should not refund.
        // This is now done by the relayer. This is mimicked here by setting the user's gasPrice to 0
        const _gasPrice = 0

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          _gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        var { logs } = await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, _gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Confirm that auth key has been added
        _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        const numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)
      })
    })
    context('Non-happy Path', async () => {
      it('Should not add the same authKey twice', async () => {
        await expectRevert(authereumProxyAccount.addAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.BA_AUTH_KEY_ALREADY_ADDED)
      })
      it('Should not add self as an auth key', async () => {
        await expectRevert(authereumProxyAccount.addAuthKey(authereumProxyAccount.address, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.BA_AUTH_KEY_CANNOT_BE_SELF)
      })
      it('Should not allow a random address to add an auth key', async () => {
        await expectRevert(authereumProxyAccount.addAuthKey(AUTH_KEYS[0], { from: accounts[8] }), constants.REVERT_MSG.BA_REQUIRE_AUTH_KEY_OR_SELF)
      })
      it('Should not allow an arbitrary address to add an authKey (directly)', async () => {
        await expectRevert(authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[1] }), constants.REVERT_MSG.BA_REQUIRE_AUTH_KEY_OR_SELF)
      })
      it('Should not allow an arbitrary address to add an authKey through executeMultipleAuthKeyMetaTransactions', async () => {
        // Confirm that auth key is not yet added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, false)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'addAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [accounts[9]])

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
      it('Should not allow a loginKey to add an authKey through executeMultipleLoginKeyMetaTransactions', async () => {
        // Confirm that auth key is not yet added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, false)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'addAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [AUTH_KEYS[1]])

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_SELF)
      })
    })
  })
  describe('removeAuthKey', () => {
    context('Happy Path', async () => {
      it('Should remove an authKey', async () => {
        // Add
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        let numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        // Remove
        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[1] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 2)
      })
      it('Should add two authKeys and then remove two authKeys', async () => {
        // Add
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        let numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[2] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 4)

        // Remove
        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[2] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[1] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 2)
      })
      it('Should add two authKeys and then remove two authKeys in reverse order', async () => {
        // Add
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        let numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[2] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 4)

        // Remove
        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[2] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[1] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 2)
      })
      it('Should add an authKey and then remove the original authKey', async () => {
        // Add
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        let numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 3)

        // Remove
        var { logs } = await authereumProxyAccount.removeAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[1] })
        authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[0])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyRemoved', { authKey: AUTH_KEYS[0] })

        numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 2)
      })
      it('Should remove an authKey through executeMultipleAuthKeyMetaTransactions', async () => {
        // Add auth key
        var { logs } = await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })

        // Confirm that auth key already added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, true)

        // Set up transaction to remove an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'removeAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [AUTH_KEYS[1]])

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // NOTE: As of AuthereumAccountv202003xx00, the contract no longer has a concept of if it should or should not refund.
        // This is now done by the relayer. This is mimicked here by setting the user's gasPrice to 0
        const _gasPrice = 0

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          _gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          _transactions, _gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Confirm that auth key has been removed
        _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, false)
        expectEvent.inLogs(logs, 'AuthKeyAdded', { authKey: AUTH_KEYS[1] })

        const numAuthKeys = await authereumProxyAccount.numAuthKeys()
        assert.equal(numAuthKeys, 2)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not remove an authKey that was never a added', async () => {
        await expectRevert(authereumProxyAccount.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.BA_AUTH_KEY_NOT_YET_ADDED)
      })
      it('Should not allow a user to remove all authKeys', async () => {
        await authereumProxyAccount.removeAuthKey(authereumRecoveryModule.address, { from: AUTH_KEYS[0] })
        await expectRevert(authereumProxyAccount.removeAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.BA_CANNOT_REMOVE_LAST_AUTH_KEY)
      })
      it('Should not allow a random address to remove an auth key', async () => {
        await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        await expectRevert(authereumProxyAccount.removeAuthKey(AUTH_KEYS[1], { from: accounts[8] }), constants.REVERT_MSG.BA_REQUIRE_AUTH_KEY_OR_SELF)
      })
      it('Should not allow an arbitrary address to remove an authKey through executeMultipleAuthKeyMetaTransactions', async () => {
        await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })

        // Confirm that auth key is already added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, true)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'removeAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [AUTH_KEYS[1]])

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

        await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_SELF)
      })
      it('Should not allow a loginKey to remove an authKey through executeMultipleLoginKeyMetaTransactions', async () => {
        await authereumProxyAccount.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })

        // Confirm that auth key is already added
        let _authKey = await authereumProxyAccount.authKeys(AUTH_KEYS[1])
        assert.equal(_authKey, true)

        // Set up transaction to add an auth key
        const _to = authereumProxyAccount.address
        const _data = await web3.eth.abi.encodeFunctionCall({
          name: 'removeAuthKey',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_authKey'
          }]
          }, [AUTH_KEYS[1]])

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_SELF)
      })
    })
  })
})
