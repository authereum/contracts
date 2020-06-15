const { balance, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactReturnTransaction = artifacts.require('ReturnTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const ArtifactTestERC20 = artifacts.require('TestERC20')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactAuthereumLoginKeyValidator = artifacts.require('AuthereumLoginKeyValidator')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

contract('LoginKeyMetaTxAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3]]
  const LOGIN_KEYS = [accounts[10], accounts[5]]
  const RECEIVERS = [accounts[6], accounts[7]]

  // Token Params
  const DEFAULT_TOKEN_SUPPLY = constants.DEFAULT_TOKEN_SUPPLY
  const DEFAULT_TOKEN_SYMBOL = constants.DEFAULT_TOKEN_SYMBOL
  const DEFAULT_TOKEN_NAME = constants.DEFAULT_TOKEN_NAME
  const DEFAULT_TOKEN_DECIMALS = constants.DEFAULT_TOKEN_DECIMALS

  // Testing params
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
  let loginKeyValidator
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
    MSG_SIG = await utils.getexecuteMultipleLoginKeyMetaTransactionsSig('2020010900')

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

    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Wrap in truffle-contract
    badContract = await ArtifactBadTransaction.new()
    returnTransaction = await ArtifactReturnTransaction.new()
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Handle post-proxy deployment
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])
    await utils.setAccountIn1820Registry(authereumProxyAccount, erc1820Registry.address, AUTH_KEYS[0])

    // Default transaction data
    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()
    to = RECEIVERS[0]
    value = constants.ONE_ETHER
    gasLimit = constants.GAS_LIMIT
    data = '0x00'
    gasPrice = constants.GAS_PRICE
    gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    loginKeyValidator = await ArtifactAuthereumLoginKeyValidator.new()
    await loginKeyValidator.addRelayers([RELAYER, accounts[0]])
    loginKeyRestrictionsData = web3.eth.abi.encodeParameters(
      ['address', 'bytes'],
      [loginKeyValidator.address, constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA]
    )
    feeTokenAddress = constants.ZERO_ADDRESS
    feeTokenRate = constants.DEFAULT_TOKEN_RATE

    // Convert to transactions array
    encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
    transactions = [encodedParameters]

    // Get default signedMessageHash and signedLoginKey
    transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

  describe('executeMultipleLoginKeyMetaTransactions', () => {
    context('Happy Path', async () => {
      it('Should successfully execute a login key meta transaction', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully verify and sign two transactions', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 1
        let beforeRelayerBal = await balance.current(RELAYER)
        let beforeToBal = await balance.current(to)
        let beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        let afterRelayerBal = await balance.current(RELAYER)
        let afterToBal = await balance.current(to)
        let afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)

        // Transaction 2
        const _data = '0x01'
        const _nonce = nonce + 1

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          _nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        beforeRelayerBal = await balance.current(RELAYER)
        beforeToBal = await balance.current(to)
        beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterRelayerBal = await balance.current(RELAYER)
        afterToBal = await balance.current(to)
        afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully verify and sign two transactions (batched)', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 2
        // Create new arrays and add ot them
        let _to = to
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
        let _transactions = transactions.slice(0)
        _transactions.push(_encodedParameters)

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

        beforeRelayerBal = await balance.current(RELAYER)
        beforeToBal = await balance.current(to)
        beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterRelayerBal = await balance.current(RELAYER)
        afterToBal = await balance.current(to)
        afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 2 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.TWO_ETHER)
        // CBA loses 2 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully verify and sign two transactions (batched) and increment the contract nonce by 2', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        // Get original nonce
        const originalNonce = nonce;

        // Transaction 2
        // Create new arrays and add ot them
        let _to = to
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
        let _transactions = transactions.slice(0)
        _transactions.push(_encodedParameters)

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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Get the new nonce
        const newNonce = await authereumProxyAccount.nonce()

        // Nonce should increment by 2 in a batched transaction
        assert.equal(originalNonce + 2, newNonce)
      })
      it('Should successfully execute a login key meta transaction and pay fees in tokens', async () => {
        // Create a token for use in fee payments
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)
        const beforeAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Convert to transactions array
        const _feeTokenAddress = authereumERC20.address

        const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
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
          _feeTokenAddress,
          feeTokenRate
        )

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH (and doesn't lose a fee cost)
        assert.equal(Number(beforeAccountBal) - Number(afterAccountBal), constants.ONE_ETHER)
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal) - Number(beforeRelayerBal), 0, constants.FEE_VARIANCE)
        // Relayer and account token balances
        assert.isBelow(Number(afterAccountTokenBal), Number(beforeAccountTokenBal))
        assert.isAbove(Number(afterRelayTokenBal), Number(beforeRelayTokenBal))
      })
      it('Should successfully verify and sign two transactions (batched) and pay fees in tokens', async () => {
        // Create a token for use in fee payments
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)

        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 2
        // Create new arrays and add ot them
        let _to = to
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _feeTokenAddress = authereumERC20.address

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, _value, _gasLimit, _data)
        let _transactions = transactions.slice(0)
        _transactions.push(_encodedParameters)

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          _transactions,
          gasPrice,
          gasOverhead,
          _feeTokenAddress,
          feeTokenRate
        )

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)
        const beforeAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // to address gains 2 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.TWO_ETHER)
        // CBA loses 2 ETH + refund cost
        assert.equal(Number(beforeAccountBal) - Number(afterAccountBal), constants.TWO_ETHER)
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal) - Number(beforeRelayerBal), 0, constants.FEE_VARIANCE)
        // Relayer and account token balances
        assert.isBelow(Number(afterAccountTokenBal), Number(beforeAccountTokenBal))
        assert.isAbove(Number(afterRelayTokenBal), Number(beforeRelayTokenBal))
      })
      it('Should successfully execute a login key meta transaction and pay fees in tokens that have a non-standard decimals (decimals should affect the rate and nothing else)', async () => {
        // Create a token for use in fee payments
        const nonStandardDecimals = 9
        const _tokenSupply = 10000000000
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], _tokenSupply, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, nonStandardDecimals)
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)
        const beforeAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Convert to transactions array
        const _feeTokenAddress = authereumERC20.address
        const _feeTokenRate = 10

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          transactions,
          gasPrice,
          gasOverhead,
          _feeTokenAddress,
          _feeTokenRate
        )

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, _feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH (and doesn't lose a fee cost)
        assert.equal(Number(beforeAccountBal) - Number(afterAccountBal), constants.ONE_ETHER)
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal) - Number(beforeRelayerBal), 0, constants.FEE_VARIANCE)
        // Relayer and account token balances
        assert.isBelow(Number(afterAccountTokenBal), Number(beforeAccountTokenBal))
        assert.isAbove(Number(afterRelayTokenBal), Number(beforeRelayTokenBal))
      })
      it('Should successfully execute a login key meta transaction when the relayer sends a higher gasPrice than expected', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice + 1 }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it.skip('Should successfully execute a login key meta whose value is equivalent to the daily limit', async () => {
        // NOTE: This module was removed for now
        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        const beforeToBal = await balance.current(to)

        const _value = constants.TEN_ETHER

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterToBal = await balance.current(to)

        // to address gains daily limit amount of ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.TEN_ETHER)
      })
      it.skip('Should successfully execute a login key meta whose value is equivalent to the daily limit, add to the limit, and do the same thing', async () => {
        // NOTE: This has been removed from the module for now
        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        let beforeToBal = await balance.current(to)

        let _value = constants.TEN_ETHER

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        let afterToBal = await balance.current(to)
        assert.equal(afterToBal - beforeToBal, constants.TEN_ETHER)

        await authereumProxyAccount.changeDailyLimit(constants.TWENTY_ETHER, { from: AUTH_KEYS[0] })

        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        beforeToBal = await balance.current(to)

        // Get default signedMessageHash and signedLoginKey
        _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterToBal = await balance.current(to)
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.TEN_ETHER)
      })
      it('Should successfully execute a login key meta transaction and return the appropriate data', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        // Convert to transactions array
        const _to = returnTransaction.address
        // This is the calldata for returnTest()
        const _data = '0x57ecc147'
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

        // NOTE: This is simply calling the function in order to get the return data
        const returnData = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions.call(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Returns the bytes[] hex version of 123
        const _expectedReturnData = ['0x000000000000000000000000000000000000000000000000000000000000007b']
        expect(returnData).to.eql(_expectedReturnData)
      })
      it('Should successfully execute a login key meta transaction with 2 transactions and return the appropriate data', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        // Convert to transactions array
        const _to = returnTransaction.address
        // This is the calldata for returnTest()
        const _data = '0x57ecc147'
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Transaction 2 Setup
        // Convert to transactions array
        const __encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
        let __transactions = _transactions.slice(0)
        __transactions.push(__encodedParameters)

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          __transactions,
          gasPrice,
          gasOverhead,
          feeTokenAddress,
          feeTokenRate
        )

        // NOTE: This is simply calling the function in order to get the return data
        const returnData = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions.call(
          __transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Returns the bytes[] hex version of 123
        const _expectedReturnData = ['0x000000000000000000000000000000000000000000000000000000000000007b', '0x000000000000000000000000000000000000000000000000000000000000007b']
        expect(returnData).to.eql(_expectedReturnData)
      })
      it('Should allow the user to not pay a refund by setting the gasPrice to 0 (ETH)', async () => {
        const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
        const beforeRelayerBalance = await balance.current(RELAYER)

        const _gasPrice = 0

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, _gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterProxyBalance = await balance.current(authereumProxyAccount.address)
        const afterRelayerBalance = await balance.current(RELAYER)

        // The acccount should only lose the value they sent. The relayer should lose the fee amount.
        assert.equal(Number(beforeProxyBalance) - value, Number(afterProxyBalance))
        assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 2091860000112640, 100000000000000)
      })
      it('Should allow the user to not pay a refund by setting the gasPrice to 0 (tokens)', async () => {
        // Create a token for use in fee payments. Don't mint any because the user should not need any.
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], 0, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)

        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
        const beforeRelayerBalance = await balance.current(RELAYER)
        const beforeProxyBalanceToken = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayerBalanceToken = await authereumERC20.balanceOf(RELAYER)

        // Convert to transactions array
        let _feeTokenAddress = authereumERC20.address
        let _feeTokenRate = 0

        // Get default signedMessageHash and signedLoginKey
        const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
          authereumProxyAccount.address,
          MSG_SIG,
          constants.CHAIN_ID,
          nonce,
          transactions,
          gasPrice,
          gasOverhead,
          _feeTokenAddress,
          _feeTokenRate
        )

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, _feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER }
        )

        const afterProxyBalance = await balance.current(authereumProxyAccount.address)
        const afterRelayerBalance = await balance.current(RELAYER)
        const afterProxyBalanceToken = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayerBalanceToken = await authereumERC20.balanceOf(RELAYER)

        // The acccount should only lose the value they sent. The relayer should lose the fee amount.
        // The account should not lose any balance. The relayer shouldn't get any token balance
        assert.equal(Number(beforeProxyBalance) - value, Number(afterProxyBalance))
        assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 2098060000100352, 100000000000000)
        assert.equal(Number(beforeProxyBalanceToken), Number(afterProxyBalanceToken))
        assert.equal(Number(beforeRelayerBalanceToken), Number(afterRelayerBalanceToken))
      })
      it('Should allow the relayer to send a lower gasLimit than the user sets if the user does not use all of their allotted gas', async () => {
        const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
        const beforeRelayerBalance = await balance.current(RELAYER)

        const _gasLimit = 2000000

        // Confirm that the relayer gasLimit is higher than the user's _gasLimit
        assert.isAbove(_gasLimit, gasLimit)
        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(to, value, _gasLimit, data)
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gas: gasLimit}
        )

        const afterProxyBalance = await balance.current(authereumProxyAccount.address)
        const afterRelayerBalance = await balance.current(RELAYER)

        // The acccount should only lose the value they sent and a fee. The relayer should lose the fee amount.
        assert.closeTo(Number(beforeProxyBalance) - value, Number(afterProxyBalance), 100000000000000000)
        assert.closeTo(Number(afterRelayerBalance) - Number(beforeRelayerBalance), 171659999969280, 100000000000000)
      })
      it('Should successfully execute a login key meta transaction sent to an auth key with no data and low gasLimit', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const _to = AUTH_KEYS[0]
        const _gasLimit = 2300
        const _data = '0x'

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(_to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(_to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully execute a login key meta transaction sent to self with no data and low gasLimit', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const _to = authereumProxyAccount.address
        const _gasLimit = 2300
        const _data = '0x'

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(_to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
        const _transactions = [_encodedParameters]

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(_to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address stays the same - fee
        assert.closeTo(Number(afterToBal), Number(beforeToBal), constants.FEE_VARIANCE)
        // CBA loses stays the same - fee
        assert.closeTo(Number(afterAccountBal), Number(beforeAccountBal), constants.FEE_VARIANCE)
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully execute a batched login key meta transaction sent to an auth key and to self with no data and low gasLimit', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const _to = AUTH_KEYS[0]
        const _gasLimit = 2300
        const _data = '0x'

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(_to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        // Convert to transactions array
        let _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
        let _transactions = [_encodedParameters]

        // Second transaction
        _encodedParameters = await utils.encodeTransactionParams(authereumProxyAccount.address, value, _gasLimit, _data)
        _transactions.push(_encodedParameters)

        // Get default signedMessageHash and signedLoginKey
        let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(_to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address ends with one more eth
        assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        // CBA loses one eth - fee
        assert.closeTo(Number(beforeAccountBal) - Number(afterAccountBal), Number(constants.ONE_ETHER), constants.FEE_VARIANCE)
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
    })
    context('Non-Happy Path', async () => {
      context('Bad Parameters', async () => {
        it('Should revert due to the relayer sending too small of a gasPrice with the transaction', async () => {
          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice - 1 }
          ), constants.REVERT_MSG.BMTA_NOT_LARGE_ENOUGH_TX_GASPRICE)
        })
        it.skip('Should throw due to surpassing the daily limit', async () => {
        // NOTE: This has been removed from the module for now
        await authereumProxyAccount.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })
          const _value = web3.utils.toWei('11', 'ether')

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
          ), constants.REVERT_MSG.BA_BLOCKED_BY_FIREWALL)
        })
        it.skip('Should emit OverDailyLimit due to surpassing the daily limit after 2 transactions', async () => {
          // NOTE: This has been removed from the module for now
          await authereumProxyAccount.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })

          await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          // Advance time to mimimc real life
          await timeUtils.increaseTime(15)
          const _value =  constants.TEN_ETHER

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
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
          ), constants.REVERT_MSG.BA_BLOCKED_BY_FIREWALL)
        })
        it('Should fail to send a transaction due to a failed transaction because of bad data', async () => {
          const _to = badContract.address
          const _data = constants.BAD_DATA

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

          var { logs } = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.BT_WILL_FAIL })
        })
        it('Should increment the contract nonce by 2 even though the second of 2 atomic transactions failed (and should rewind the first)', async () => {
          await authereumProxyAccount.send(constants.THREE_ETHER, {from: AUTH_KEYS[0]})

          // Get original state
          const originalNonce = nonce;
          const beforeToBal = await balance.current(to)

          // Transaction 2 Setup
          const _to = badContract.address
          const _data = constants.BAD_DATA

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
          let _transactions = transactions.slice(0)
          _transactions.push(_encodedParameters)

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

          var { logs }  = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.BT_WILL_FAIL })

          // Get the new state
          const newNonce = await authereumProxyAccount.nonce()
          const afterToBal = await balance.current(to)

          // Nonce should increment by 2 in a batched transaction
          assert.equal(originalNonce + 2, newNonce)
          // First transaction of the batched transactions should revert if the second one fails
          assert.equal(Number(beforeToBal), Number(afterToBal))
        })
        it('Should revert due to not enough funds being in the contract to send the transaction', async () => {
          await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          // Convert to transactions array
          const _nonce = nonce + 1
          const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
            authereumProxyAccount.address,
            MSG_SIG,
            constants.CHAIN_ID,
            _nonce,
            _transactions,
            gasPrice,
            gasOverhead,
            feeTokenAddress,
            feeTokenRate
          )

          var { logs } = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.BA_SILENT_REVERT })
        })
        it('Should revert due to not enough funds being in the contract to send the refund', async () => {
          const _value = constants.TWO_ETHER

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
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

          // This fails implicitly on the `msg.sender.transfer(_gasUsed.mul(_gasPrice));`
          await expectRevert(
            authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
              _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
            ), constants.REVERT_MSG.GENERAL_REVERT)
        })
        // TODO: Currently failing due to inconsistent gasLimit values in the internal call
        it.skip('Should revert due to too low of a gasLimit sent with the transaction', async () => {
          const _gasLimit = 1

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, value, _gasLimit, data)
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

          var { logs } = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          expectEvent.inLogs(logs, 'CallFailed', { to: to, value: value, nonce: nonce.toString(), gasLimit: (_gasLimit+ constants.GAS_LIMIT_GANACHE_BUG).toString(), data: data})
        })
        it('Should fail to fail to send a transaction due to a bad signed message', async () => {
          const _transactionMessageHashSignature = [transactionMessageHashSignature[0] + 100]
          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKMTA_AUTH_KEY_INVALID)
        })
        it('Should not refund the relayer for InvalidTransactionDataSigner', async () => {
          const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
          const beforeRelayerBal = await balance.current(RELAYER)

          const _gasOverhead = gasOverhead + 1

          // Get default signedMessageHash and signedLoginKey
          const _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
            authereumProxyAccount.address,
            MSG_SIG,
            constants.CHAIN_ID,
            nonce,
            transactions,
            gasPrice,
            _gasOverhead,
            feeTokenAddress,
            feeTokenRate
          )

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKMTA_AUTH_KEY_INVALID)

          const afterProxyBalance = await balance.current(authereumProxyAccount.address)
          const afterRelayerBal = await balance.current(RELAYER)

          // Account should have the same value before and after
          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          // Relayer should lose some value
          assert.isBelow(Number(afterRelayerBal), Number(beforeRelayerBal))
        })
        it.skip('Should not refund the relayer for OverDailyLimit', async () => {
          // NOTE: This has been removed from the module for now
          const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
          const beforeRelayerBal = await balance.current(RELAYER)

          const _value = constants.TEN_ETHER + 1

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
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
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER }
          ), constants.REVERT_MSG.BA_BLOCKED_BY_FIREWALL)

          const afterProxyBalance = await balance.current(authereumProxyAccount.address)
          const afterRelayerBal = await balance.current(RELAYER)

          // Account should have the same value before and after
          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          // Relayer should lose some value
          assert.isBelow(Number(afterRelayerBal), Number(beforeRelayerBal))
        })
        it('Should throw and cost the relayer if the account does not send a large enough gasLimit', async () => {
          const _relayerGasLimit = 5000
          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gas: _relayerGasLimit, gasPrice: gasPrice }
          ), constants.REVERT_MSG.EXCEEDS_GAS_LIMIT)
        })
        it('Should throw and cost the relayer if the account does not have enough for the refund (ETH)', async () => {
          const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
          const beforeRelayerBalance = await balance.current(RELAYER)

          const _value = Number(beforeProxyBalance).toString()

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(to, _value, gasLimit, data)
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
          ), constants.REVERT_MSG.BA_INSUFFICIENT_GAS_ETH)

          const afterProxyBalance = await balance.current(authereumProxyAccount.address)
          const afterRelayerBalance = await balance.current(RELAYER)

          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 2078640000073728, 100000000000000)
        })
        it('Should throw and cost the relayer if the account does not have enough tokens for the refund (tokens)', async () => {
          // Create a token for use in fee payments. Mint only 1 (wei) token.
          // NOTE: This requires a "supply" of ` and a "decimals" of 1
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], 1, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, 1)

          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address

          const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
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
            _feeTokenAddress,
            feeTokenRate
          )

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.BA_INSUFFICIENT_GAS_TOKEN)
        })
        it('Should throw because the login key is trying to upgrade the proxy', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })
          const _to = authereumProxyAccount.address

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, data)
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
        it('Should throw because the login key is trying to call an auth key', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })
          const _to = AUTH_KEYS[0]

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, data)
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
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_AUTH_KEY)
        })
        it('Should emit a CallFailed event due to incorrect transaction params (address in uint256)', async () => {
          // Convert to transactions array
          const _encodedParameters = await web3.eth.abi.encodeParameters(
            ['uint256', 'address', 'uint256', 'bytes'],
            [value, to, gasLimit, data]
          )
          const _transactions = [_encodedParameters]

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

          var { logs } = await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          expectEvent.inLogs(logs, 'CallFailed', { reason: constants.REVERT_MSG.BA_SILENT_REVERT })
        })
        it('Should revert due to incorrect transaction params (bytes in the addr param)', async () => {
          // Convert to transactions array
          const _encodedParameters = await web3.eth.abi.encodeParameters(
            ['bytes', 'uint256', 'uint256', 'address'],
            [data, value, gasLimit, to]
          )
          const _transactions = [_encodedParameters]

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

          await expectRevert(
            authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
              _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.GENERAL_REVERT)
        })
        it('Should revert due to the fact that the relayer used a different token address than expected', async () => {
          // Create a token for use in fee payments
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)
          const fakeERC20 = await ArtifactTestERC20.new([RELAYER], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address

          const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
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
            _feeTokenAddress,
            feeTokenRate
          )

          // This is the fake relayer token
          _feeTokenAddress = fakeERC20.address
          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKMTA_AUTH_KEY_INVALID)
        })
        it('Should revert due to the fact that the relayer used a different token rate than expected', async () => {
          // Create a token for use in fee payments
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address

          const _encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
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
            _feeTokenAddress,
            feeTokenRate
          )

          // This is the fake relayer token rate
          const _feeTokenRate = 99999999999
          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, _feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKMTA_AUTH_KEY_INVALID)
        })
        it('Should revert due to the fact that a transaction is being sent to an auth key with data and low gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = AUTH_KEYS[0]
          const _gasLimit = 2300
          const _data = '0x01'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_AUTH_KEY)
        })
        it('Should revert due to the fact that a transaction is being sent to self with data and low gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = authereumProxyAccount.address
          const _gasLimit = 2300
          const _data = '0x01'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
        it('Should revert due to the fact that a transaction is being sent to an auth key with no data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = AUTH_KEYS[0]
          const _gasLimit = 2301
          const _data = '0x'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_AUTH_KEY)
        })
        it('Should revert due to the fact that a transaction is being sent to self with no data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = authereumProxyAccount.address
          const _gasLimit = 2301
          const _data = '0x'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
        it('Should revert due to the fact that a transaction is being sent to an auth key with data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = AUTH_KEYS[0]
          const _gasLimit = 2301
          const _data = '0x00'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_AUTH_KEY)
        })
        it('Should revert due to the fact that a transaction is being sent to self with data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = authereumProxyAccount.address
          const _gasLimit = 2301
          const _data = '0x00'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          const _transactions = [_encodedParameters]

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
        it('Should revert due to the fact that a batched transaction\'s second transaction is being sent to an auth key with data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = AUTH_KEYS[0]
          const _gasLimit = 2301
          const _data = '0x'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          let _transactions = transactions.slice(0)
          _transactions.push(_encodedParameters)

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_NOT_ABLE_TO_CALL_AUTH_KEY)
        })
        it('Should revert due to the fact that a batched transaction\'s second transaction is being sent to self with data and high gasLimit', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _to = authereumProxyAccount.address
          const _gasLimit = 2301
          const _data = '0x'

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, _gasLimit, _data)
          let _transactions = transactions.slice(0)
          _transactions.push(_encodedParameters)

          // Get default signedMessageHash and signedLoginKey
          let _transactionMessageHashSignature = await utils.getLoginKeySignedMessageHash(
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
      context('Invalid Permissions', async () => {
        it('Should revert if login key is expired', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _loginKeyExpirationData = web3.eth.abi.encodeParameter('uint256', 1573256750) // Timestamp is in the past
          const _loginKeyRestrictionsData = web3.eth.abi.encodeParameters(['address', 'bytes'], [loginKeyValidator.address, _loginKeyExpirationData]) // Timestamp is in the past

          const _loginKeyAttestationSignature = utils.getSignedLoginKey(LOGIN_KEYS[0], _loginKeyRestrictionsData)

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, _loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, _loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKV_LOGIN_KEY_EXPIRED)
        })
        it('Should revert if the transaction is not from an official Authereum relayer', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: ENS_OWNER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKV_INVALID_RELAYER)
        })
        it('Should not revert if the zero address is used as the validator contract', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const beforeToBal = await balance.current(to)

          const _loginKeyExpirationData = web3.eth.abi.encodeParameter('uint256', 1573256750) // Timestamp is in the past
          const _loginKeyRestrictionsData = web3.eth.abi.encodeParameters(['address', 'bytes'], [constants.ZERO_ADDRESS, _loginKeyExpirationData]) // Timestamp is in the past

          const _loginKeyAttestationSignature = utils.getSignedLoginKey(LOGIN_KEYS[0], _loginKeyRestrictionsData)

          await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, _loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, _loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          const afterToBal = await balance.current(to)

          // to address gains 1 ETH
          assert.equal(Number(afterToBal) - Number(beforeToBal), constants.ONE_ETHER)
        })
        it('Should revert if the a non-contract address is used as the validator contract', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _loginKeyExpirationData = web3.eth.abi.encodeParameter('uint256', 1573256750) // Timestamp is in the past
          const _loginKeyRestrictionsData = web3.eth.abi.encodeParameters(['address', 'bytes'], [constants.ONE_ADDRESS, _loginKeyExpirationData]) // Timestamp is in the past

          const _loginKeyAttestationSignature = utils.getSignedLoginKey(LOGIN_KEYS[0], _loginKeyRestrictionsData)

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, _loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, _loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.GENERAL_REVERT)
        })
      })
    })
  })
})
