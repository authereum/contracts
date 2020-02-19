const { expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')

contract('AuthereumAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Parameters
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
  let feeTokenAddress
  let feeTokenRate
  let transactionMessageHashSignature
  let encodedParameters
  let transactions

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

    // Message Signature
    MSG_SIG = await utils.getexecuteMultipleAuthKeyMetaTransactionsSig('2020021700')

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
    destination = authereumProxyAccount.address
    value = 0
    gasLimit = constants.GAS_LIMIT
    data = utils.encodeUpgradeToAndCall(authereumProxyAccountUpgradeLogicContract.address, constants.HASH_ZERO)
    gasPrice = constants.GAS_PRICE
    gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    feeTokenAddress = constants.ZERO_ADDRESS
    feeTokenRate = 0

    // Convert to transactions array
    encodedParameters = await utils.encodeTransactionParams(destination, value, gasLimit, data)
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

  describe('authereumVersion', () => {
    context('Happy path', () => {
      it('Should return the Authereum contract version', async () => {
        // Test that the Authereum version is set and that the proxy has been deployed
        const authereumVersion = await authereumProxyAccount.authereumVersion.call()
        const latestVersionIndex = constants.AUTHEREUM_CONTRACT_VERSIONS.length - 1
        assert.equal(authereumVersion, constants.AUTHEREUM_CONTRACT_VERSIONS[latestVersionIndex])
      })
    })
  })
  describe('initialize', () => {
    context('Happy path', () => {
      it('Should initialize an upgradable contract', async () => {
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        const _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        // Test that the Chain ID is set and that the proxy has been deployed
        const chainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(constants.CHAIN_ID, chainId)

        // Test that the authKeys mapping has been updated with the expected authKey
        const isAuthKey = await _authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)
      })
      it('Should initialize an upgradable contract and upgrade the contract', async () => {
        // Test that the Chain ID is set and that the proxy has been deployed
        const chainId = await authereumProxyAccount.getChainId.call()
        assert.equal(constants.CHAIN_ID, chainId)

        // Test that the authKeys mapping has been updated with the expected authKey
        let isAuthKey = await authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)

        // Test that the upgraded contact function, upgradeTest(), does not yet exist
        try {
          await authereumProxyAccount.upgradeTest.call()
          assert.fail('upgradeTest should be undefined')
        } catch (e) {
          // This is expected. Continue with test if execution gets here.
        }

        await authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
          transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        // Wrap the proxy with the new ABI
        const _authereumProxyAccount = await ArtifactAuthereumProxyAccountUpgrade.at(authereumProxyAccount.address)

        // Confirm that the proxy still has access to the old state
        const expectedChainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(expectedChainId, constants.CHAIN_ID)

        // Check that new functions work as expected
        const expectedUpgradeTestValue = await _authereumProxyAccount.upgradeTest.call()
        assert.equal(expectedUpgradeTestValue, 42)

        // Test that the authKeys mapping is still updated with the expected authKey
        isAuthKey = await _authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)
      })
    })
    context('Non-Happy path', () => {
      it('Should not initialize an upgradable contract because a _label has already been used', async () => {
        const _label = constants.DEFAULT_LABEL
        const _expectedSalt = constants.SALT + 21
        await expectRevert(utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        ), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow Authereum to upgrade a proxy for a user', async () => {
        await expectRevert(authereumAccountLogicContract.upgradeToAndCall(
          authereumProxyAccountUpgradeLogicContract.address, constants.HASH_ZERO
        ), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
})
