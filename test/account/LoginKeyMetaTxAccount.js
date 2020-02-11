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
const ArtifactTestERC20 = artifacts.require('TestERC20')

contract('LoginKeyMetaTxAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3]]
  const LOGIN_KEYS = [accounts[10], accounts[5]]
  const RECEIVERS = [accounts[6], accounts[7]]

  // Token Params
  const DEFAULT_TOKEN_SUPPLY = constants.DEFAULT_TOKEN_SUPPLY
  const DEFAULT_TOKEN_DECIMALS = constants.DEFAULT_TOKEN_DECIMALS

  // Testing params
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
  let authereumProxy
  let authereumProxyAccount
  let authereumProxyAccountUpgrade
  let authereumProxyAccountUpgradeWithInit

  before(async () => {
    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Message signature
    MSG_SIG = await utils.getexecuteMultipleLoginKeyMetaTransactionsSig('2019111500')

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

    // Default transaction data
    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()
    destination = RECEIVERS[0]
    value = constants.ONE_ETHER
    gasLimit = constants.GAS_LIMIT
    data = '0x00'
    gasPrice = constants.GAS_PRICE
    gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    loginKeyRestrictionsData = constants.DEFAULT_LOGIN_KEY_RESTRICTIONS_DATA
    feeTokenAddress = constants.ZERO_ADDRESS
    feeTokenRate = constants.DEFAULT_TOKEN_RATE

    // Convert to transactions array
    encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot();
  });
 
  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result);
  });

  //**********//
  //  Tests  //
  //********//

  describe('executeMultipleLoginKeyMetaTransactions', () => {
    context('Happy Path', async () => {
      it('Should successfully execute a login key meta transaction', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully verify and sign two transactions', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 1
        let beforeRelayerBal = await balance.current(RELAYER)
        let beforeDestinationBal = await balance.current(destination)
        let beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )
        
        let afterRelayerBal = await balance.current(RELAYER)
        let afterDestinationBal = await balance.current(destination)
        let afterAccountBal = await balance.current(authereumProxyAccount.address)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)

        // Transaction 2
        const _data = '0x01'
        const _nonce = nonce + 1

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, _data)
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
        beforeDestinationBal = await balance.current(destination)
        beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterRelayerBal = await balance.current(RELAYER)
        afterDestinationBal = await balance.current(destination)
        afterAccountBal = await balance.current(authereumProxyAccount.address)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it('Should successfully verify and sign two transactions (batched)', async () => {
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 2
        // Create new arrays and add ot them
        let _destination = destination
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
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
        beforeDestinationBal = await balance.current(destination)
        beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterRelayerBal = await balance.current(RELAYER)
        afterDestinationBal = await balance.current(destination)
        afterAccountBal = await balance.current(authereumProxyAccount.address)

        // Destination address gains 2 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.TWO_ETHER)
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
        let _destination = destination
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
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
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_DECIMALS)
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)
        const beforeAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Convert to transactions array
        const _feeTokenAddress = authereumERC20.address

        const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
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
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_DECIMALS)

        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 2
        // Create new arrays and add ot them
        let _destination = destination
        let _data = '0x01'
        let _value = value
        let _gasLimit = gasLimit

        // Convert to transactions array
        const _feeTokenAddress = authereumERC20.address

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(_destination, _value, _gasLimit, _data)
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
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)
        const beforeAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const beforeRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, _feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Destination address gains 2 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.TWO_ETHER)
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
        const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], _tokenSupply, nonStandardDecimals)
        await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
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
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)
        const afterAccountTokenBal = await authereumERC20.balanceOf(authereumProxyAccount.address)
        const afterRelayTokenBal = await authereumERC20.balanceOf(RELAYER)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
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
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice + 1 }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // Destination address gains 1 ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.isBelow(Number(afterAccountBal), Number(beforeAccountBal))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(Number(afterRelayerBal), Number(beforeRelayerBal), constants.FEE_VARIANCE)
      })
      it.skip('Should successfully execute a login key meta whose value is equivalent to the daily limit', async () => {
        // NOTE: This module was removed for now
        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        const beforeDestinationBal = await balance.current(destination)

        const _value = constants.TEN_ETHER

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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

        const afterDestinationBal = await balance.current(destination)

        // Destination address gains daily limit amount of ETH
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.TEN_ETHER)
      })
      it.skip('Should successfully execute a login key meta whose value is equivalent to the daily limit, add to the limit, and do the same thing', async () => {
        // NOTE: This has been removed from the module for now
        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        let beforeDestinationBal = await balance.current(destination)

        let _value = constants.TEN_ETHER

        // Convert to transactions array
        const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
          
        let afterDestinationBal = await balance.current(destination)
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.TEN_ETHER)

        await authereumProxyAccount.changeDailyLimit(constants.TWENTY_ETHER, { from: AUTH_KEYS[0] })

        await authereumProxyAccount.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        beforeDestinationBal = await balance.current(destination)

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

        afterDestinationBal = await balance.current(destination)
        assert.equal(Number(afterDestinationBal) - Number(beforeDestinationBal), constants.TEN_ETHER)
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
          const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
          const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
          const _destination = badContract.address
          const _data = constants.BAD_DATA

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_destination, value, gasLimit, _data)
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
          const beforeDestinationBal = await balance.current(destination)

          // Transaction 2 Setup
          const _destination = badContract.address
          const _data = constants.BAD_DATA

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_destination, value, gasLimit, _data)
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
          const afterDestinationBal = await balance.current(destination)

          // Nonce should increment by 2 in a batched transaction
          assert.equal(originalNonce + 2, newNonce)
          // First transaction of the batched transactions should revert if the second one fails
          assert.equal(Number(beforeDestinationBal), Number(afterDestinationBal))
        })
        it('Should revert due to not enough funds being in the contract to send the transaction', async () => {
          await authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          // Convert to transactions array
          const _nonce = nonce + 1
          const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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
          const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
          const _encodedParameters = await utils.encodeTransactionParams(destination, value, _gasLimit, data)
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

          expectEvent.inLogs(logs, 'CallFailed', { destination: destination, value: value, nonce: nonce.toString(), gasLimit: (_gasLimit+ constants.GAS_LIMIT_GANACHE_BUG).toString(), data: data})
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
          const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
        it('Should throw and cost the relayer if the account does not send a large enough gasLimit (ETH)', async () => {
          const beforeProxyBalance = await balance.current(authereumProxyAccount.address)
          const beforeRelayerBal = await balance.current(RELAYER)

          const _value = Number(beforeProxyBalance).toString()

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(destination, _value, gasLimit, data)
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
            _transactions, gasPrice, gasOverhead, loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, _transactionMessageHashSignature, loginKeyAttestationSignature, { from: RELAYER, gas: gasLimit, gasPrice: gasPrice }
          ), constants.REVERT_MSG.BA_INSUFFICIENT_GAS_ETH)

          const afterProxyBalance = await balance.current(authereumProxyAccount.address)
          const afterRelayerBal = await balance.current(RELAYER)

          // Account should have the same value before and after
          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          // Relayer should lose some value
          assert.isBelow(Number(afterRelayerBal), Number(beforeRelayerBal))
        })
        it('Should throw and cost the relayer if the account does not send a large enough gasLimit (tokens)', async () => {
          // Create a token for use in fee payments. Don't mint any tokens.
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], 0, DEFAULT_TOKEN_DECIMALS)

          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address
  
          const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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
          const _destination = authereumProxyAccount.address

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_destination, value, gasLimit, data)
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
        it('Should emit a CallFailed event due to incorrect transaction params (address in uint256)', async () => {
          // Convert to transactions array
          const _encodedParameters = await web3.eth.abi.encodeParameters(
            ['uint256', 'address', 'uint256', 'bytes'],
            [value, destination, gasLimit, data]
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
            [data, value, gasLimit, destination]
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
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_DECIMALS)
          const fakeERC20 = await ArtifactTestERC20.new([RELAYER], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_DECIMALS)
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address
  
          const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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
          const authereumERC20 = await ArtifactTestERC20.new([authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_DECIMALS)
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          // Convert to transactions array
          let _feeTokenAddress = authereumERC20.address
  
          const _encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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
      })
      context('Invalid Permissions', async () => {
        it('Should revert if login key is expired', async () => {
          await authereumProxyAccount.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

          const _loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1573256750) // Timestamp is in the past

          const _loginKeyAttestationSignature = utils.getSignedLoginKey(LOGIN_KEYS[0], _loginKeyRestrictionsData)

          await expectRevert(authereumProxyAccount.executeMultipleLoginKeyMetaTransactions(
            transactions, gasPrice, gasOverhead, _loginKeyRestrictionsData, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, _loginKeyAttestationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), constants.REVERT_MSG.LKMTA_LOGIN_KEY_EXPIRED)
        })
      })
    })
  })
})
