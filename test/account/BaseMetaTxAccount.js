const { balance, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const isValidSignature = require('is-valid-signature')

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

contract('BaseMetaTxAccount', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7], accounts[8]]
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

    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Wrap in truffle-contract
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

  describe('executeMultipleMetaTransactions', () => {
    context('Happy Path', async () => {
      it('Should execute a single transaction from an auth key (no refund)', async () => {
        await authereumProxyAccount.send(constants.ONE_ETHER, {from: AUTH_KEYS[0]})

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        await authereumProxyAccount.executeMultipleMetaTransactions(
          transactions, { from: AUTH_KEYS[0] }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to address gains 1 ETH
        assert.equal(afterToBal - beforeToBal, constants.ONE_ETHER)
        // CBA loses 1 ETH
        assert.equal(beforeAccountBal - afterAccountBal, constants.ONE_ETHER)
        // Transaction sent straight from AUTH_KEYS[0] so RELAYER loses nothing
        assert.equal(beforeRelayerBal - afterRelayerBal, 0)
      })
      it('Should execute a two transaction (batched) (no refund)', async () => {
        await authereumProxyAccount.send(constants.TWO_ETHER, {from: AUTH_KEYS[0]})

        // Default transaction data
        const _to = RECEIVERS[1]

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeToBal = await balance.current(to)
        const beforeTo2Bal = await balance.current(_to)
        const beforeAccountBal = await balance.current(authereumProxyAccount.address)

        const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, data)
        let _transactions = transactions.slice(0)
        _transactions.push(_encodedParameters)

        await authereumProxyAccount.executeMultipleMetaTransactions(
          _transactions, { from: AUTH_KEYS[0] }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterToBal = await balance.current(to)
        const afterTo2Bal = await balance.current(_to)
        const afterAccountBal = await balance.current(authereumProxyAccount.address)

        // to 1 address gains 1 ETH
        assert.equal(afterToBal - beforeToBal, constants.ONE_ETHER)
        // to 2 address gains 1 ETH
        assert.equal(afterTo2Bal - beforeTo2Bal, constants.ONE_ETHER)
        // CBA loses 2 ETH
        assert.equal(beforeAccountBal - afterAccountBal, constants.TWO_ETHER)
        // Transaction sent straight from AUTH_KEYS[0] so RELAYER loses nothing
        assert.equal(beforeRelayerBal - afterRelayerBal, 0)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should revert if the transaction fails', async () => {
          await authereumProxyAccount.send(constants.ONE_ETHER, {from: AUTH_KEYS[0]})

          // Generate bad tx data
          const _to = badContract.address
          const _data = constants.BAD_DATA

          // Convert to transactions array
          const _encodedParameters = await utils.encodeTransactionParams(_to, value, gasLimit, _data)
          const _transactions = [_encodedParameters]

          await expectRevert(authereumProxyAccount.executeMultipleMetaTransactions(
            _transactions, { from: AUTH_KEYS[0] }
          ), constants.REVERT_MSG.BT_WILL_FAIL)
      })
      it('Should revert if a random address tries to call it', async () => {
          await authereumProxyAccount.send(constants.ONE_ETHER, {from: AUTH_KEYS[0]})
          await expectRevert(authereumProxyAccount.executeMultipleMetaTransactions(
            transactions, { from: LOGIN_KEYS[0] }
          ), constants.REVERT_MSG.BA_REQUIRE_AUTH_KEY_OR_SELF)
      })
    })
  })
})
