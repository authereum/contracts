const { balance, expectRevert } = require('@openzeppelin/test-helpers')

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
const ArtifactERC777Token = artifacts.require('ERC777Token')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')

contract('AuthereumAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6]]
  const MALICIOUS_USER = accounts[7]

  // Token Params
  const DEFAULT_TOKEN_SUPPLY = constants.DEFAULT_TOKEN_SUPPLY
  const DEFAULT_TOKEN_SYMBOL = constants.DEFAULT_TOKEN_SYMBOL
  const DEFAULT_TOKEN_NAME = constants.DEFAULT_TOKEN_NAME
  const DEFAULT_TOKEN_DECIMALS = constants.DEFAULT_TOKEN_DECIMALS

  // Test Parameters
  let beforeAllSnapshotId
  let snapshotId

  // Parameters
  let MSG_SIG
  let label
  let expectedSalt

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
    // Take snapshot to reset to a known state
    // This is required due to the deployment of the 1820 contract
    beforeAllSnapshotId = await timeUtils.takeSnapshot()
    
    // Deploy the recovery module
    authereumRecoveryModule = await ArtifactAuthereumRecoveryModule.new()

    // Deploy the 1820 contract
    await utils.deploy1820Contract(AUTHEREUM_OWNER)

    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Message Signature
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

    // Wrap in truffle-contract
    badContract = await ArtifactBadTransaction.new()
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)


    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Handle post-proxy deployment
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])
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

  describe('name', () => {
    context('Happy path', () => {
      it('Should return the name of the contract', async () => {
        const _name = await authereumProxyAccount.name.call()
        assert.equal(_name, constants.CONTRACTS.AUTHEREUM_ACCOUNT.NAME)
      })
    })
  })
  describe('version', () => {
    context('Happy path', () => {
      it('Should return the version of the contract', async () => {
        const _version = await authereumProxyAccount.version.call()
        const _contractVersions = constants.CONTRACTS.AUTHEREUM_ACCOUNT.VERSIONS
        const _latestVersionIndex = _contractVersions.length - 1
        assert.equal(_version, _contractVersions[_latestVersionIndex])
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

        // Call the first initializerV1 through `upgradeToAndCall`
        const _data = utils.encodeUpgradeToAndCall(authereumProxyAccountUpgradeLogicContract.address, constants.HASH_ZERO)
        await executeMultipleAuthKeyMetaTransactions(_data)

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
      it('It should be able to receive an ERC777 transfer', async () => {
        // Deploy ERC777Token
        const erc777Token = await ArtifactERC777Token.new()

        // Mint for authereum account
        await erc777Token.mint(authereumProxyAccount.address, 1)
      })
      it('Should register the user in the 1820 registry contract', async () => {
        const interfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.notEqual(interfaceImplementer, constants.ZERO_ADDRESS)
      })
      it('Should register the user in the 1820 registry contract even if that user is already registered in the 1820 registry contract', async () => {
        // Create an InitializerV1 contract that is not yet registered with 1820
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createDefaultProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        let _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        // Send funds to the account for the refund of the future upgrade
        await _authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })

        // Test that 1820 is not yet implemented
        let oldInterfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.notEqual(oldInterfaceImplementer, constants.ZERO_ADDRESS)

        // Implement 1820
        const setInterfaceData = await web3.eth.abi.encodeFunctionCall({
          name: 'setInterfaceImplementer',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addr'
          },{
              type: 'bytes32',
              name: '_interfaceHash'
          },{
              type: 'address',
              name: '_implementer'
          }]
        }, [_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH, _authereumProxyAccount.address])
        await executeMultipleAuthKeyMetaTransactions(setInterfaceData, _authereumProxyAccount, erc1820Registry.address)

        // Verify that it is implemented
        oldInterfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.notEqual(oldInterfaceImplementer, constants.ZERO_ADDRESS)
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
      it('Should deploy a new logic contract and not allow anyone to call initialize with an arbitrary auth key', async () => {
        const _authKey = MALICIOUS_USER
        let _authereumAccountLogicContract = await ArtifactAuthereumAccount.new()

        // There should be no auth keys now
        let _numAuthKeys = await _authereumAccountLogicContract.numAuthKeys()
        assert.equal(_numAuthKeys, 0)

        // Attempt too initialize a V1 contract
        await expectRevert(
          _authereumAccountLogicContract.initializeV1(_authKey),
          constants.REVERT_MSG.AI_IMPROPER_INIT_ORDER
        )
      })
      it('It should call the second and third initializer and then be able to receive an ERC777 transfer', async () => {
        // Deploy V1 contract
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createProxyInitializeV1(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        let _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        // Deploy ERC777Token
        const erc777Token = await ArtifactERC777Token.new()

        await expectRevert(erc777Token.mint(_authereumProxyAccount.address, 1), constants.REVERT_MSG.ERC777_NO_IMPLEMENTER)

        // Call the second initializer
        // NOTE: This initialization works as expected.
        // However, the ideal solution would be to use `upgradeToAndCall()`
        // With that said, we will leave this here to add robustness to our tests
        await _authereumProxyAccount.initializeV2(constants.DEFAULT_DEPLOYMENT_COST, constants.ZERO_ADDRESS)
        await _authereumProxyAccount.initializeV3()

        // Mint for authereum account
        await erc777Token.mint(_authereumProxyAccount.address, 1)
      })
      it('Should initialize an upgradable contract to AuthereumInitializeV1 then upgrade to AuthereumInitializeV2 then v3', async () => {
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createProxyInitializeV1(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        let _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        // Send funds to the account for the refund of the future upgrade
        await _authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })

        // Test that the Chain ID is set and that the proxy has been deployed
        const chainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(constants.CHAIN_ID, chainId)

        let lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 1)

        // Test that the authKeys mapping has been updated with the expected authKey
        let isAuthKey = await _authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)

        // Test that the numAuthKeys iss accurate
        let numAuthKeys = await _authereumProxyAccount.numAuthKeys.call()
        assert.equal(numAuthKeys, 1)

        // Test that 1820 is not yet implemented
        let interfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.equal(interfaceImplementer, constants.ZERO_ADDRESS)

        // Call the first initializerV2 through `upgradeToAndCall`
        const initializeV2Data = await utils.getAuthereumAccountCreationDataV2(constants.DEFAULT_DEPLOYMENT_COST, constants.ZERO_ADDRESS)
        let _data = utils.encodeUpgradeToAndCall(authereumAccountLogicContract.address, initializeV2Data)
        await executeMultipleAuthKeyMetaTransactions(_data, _authereumProxyAccount)

        // Confirm that the proxy still has access to the old state
        let expectedChainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(expectedChainId, constants.CHAIN_ID)

        // Check that lastInitializedVersion was updated
        lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 2)

        // Call the first initializerV3 through `upgradeToAndCall`
        const initializeV3Data = await utils.getAuthereumAccountCreationDataV3()
        _data = utils.encodeUpgradeToAndCall(authereumAccountLogicContract.address, initializeV3Data)
        await executeMultipleAuthKeyMetaTransactions(_data, _authereumProxyAccount)
        await utils.setAuthereumRecoveryModule(_authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])

        // Confirm that the proxy still has access to the old state
        expectedChainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(expectedChainId, constants.CHAIN_ID)

        // Check that lastInitializedVersion was updated
        lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 3)

        // Check that new auth key was added as expected
        isAuthKey = await _authereumProxyAccount.authKeys.call(authereumRecoveryModule.address)
        assert.equal(isAuthKey, true)

        // Test that 1820 is now implemented
        interfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.notEqual(interfaceImplementer, constants.ZERO_ADDRESS)
      })
      it('Should initialize an upgradable contract to AuthereumInitializeV1 then AuthereumInitializeV2 with an ETH deployment cost of 10', async () => {
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createProxyInitializeV1(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        let _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        // Send funds to the account for the refund of the future upgrade
        await _authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })

        // Test that the Chain ID is set and that the proxy has been deployed
        const chainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(constants.CHAIN_ID, chainId)

        let lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 1)

        // Test that the authKeys mapping has been updated with the expected authKey
        let isAuthKey = await _authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)

        // Test that the numAuthKeys iss accurate
        let numAuthKeys = await _authereumProxyAccount.numAuthKeys.call()
        assert.equal(numAuthKeys, 1)

        // Test that 1820 is not yet implemented
        let interfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.equal(interfaceImplementer, constants.ZERO_ADDRESS)

        const beforeAccountBal = await balance.current(_authereumProxyAccount.address)

        // Call the first initializerV2 through `upgradeToAndCall`
        const initializeV2Data = await utils.getAuthereumAccountCreationDataV2(constants.ONE_ETHER, constants.ZERO_ADDRESS)
        let _data = utils.encodeUpgradeToAndCall(authereumAccountLogicContract.address, initializeV2Data)
        const _customToAddress = undefined
        const _customGasPrice = 0
        await executeMultipleAuthKeyMetaTransactions(_data, _authereumProxyAccount, _customToAddress, _customGasPrice)

        const afterAccountBal = await balance.current(_authereumProxyAccount.address)

        // Check balance
        assert.equal(Number(beforeAccountBal) - constants.ONE_ETHER, Number(afterAccountBal))

        // Confirm that the proxy still has access to the old state
        let expectedChainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(expectedChainId, constants.CHAIN_ID)

        // Check that lastInitializedVersion was updated
        lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 2)
      })
      it('Should initialize an upgradable contract to AuthereumInitializeV1 then AuthereumInitializeV2 with a token deployment cost of 10', async () => {
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        expectedAddress = await utils.createProxyInitializeV1(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        let _authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

        const authereumERC20 = await ArtifactTestERC20.new([_authereumProxyAccount.address], DEFAULT_TOKEN_SUPPLY, DEFAULT_TOKEN_SYMBOL, DEFAULT_TOKEN_NAME, DEFAULT_TOKEN_DECIMALS)

        // Send funds to the account for the refund of the future upgrade
        await _authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })

        // Test that the Chain ID is set and that the proxy has been deployed
        const chainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(constants.CHAIN_ID, chainId)

        let lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 1)

        // Test that the authKeys mapping has been updated with the expected authKey
        let isAuthKey = await _authereumProxyAccount.authKeys.call(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)

        // Test that the numAuthKeys iss accurate
        let numAuthKeys = await _authereumProxyAccount.numAuthKeys.call()
        assert.equal(numAuthKeys, 1)

        // Test that 1820 is not yet implemented
        let interfaceImplementer = await erc1820Registry.getInterfaceImplementer.call(_authereumProxyAccount.address, constants.TOKENS_RECIPIENT_INTERFACE_HASH)
        assert.equal(interfaceImplementer, constants.ZERO_ADDRESS)

        const beforeAccountTokenBal = await authereumERC20.balanceOf(_authereumProxyAccount.address)

        // Call the first initializerV2 through `upgradeToAndCall`
        const initializeV2Data = await utils.getAuthereumAccountCreationDataV2(constants.ONE_ETHER, authereumERC20.address)
        let _data = utils.encodeUpgradeToAndCall(authereumAccountLogicContract.address, initializeV2Data)
        const _customToAddress = undefined
        const _customGasPrice = 0
        await executeMultipleAuthKeyMetaTransactions(_data, _authereumProxyAccount, _customToAddress, _customGasPrice)

        const afterAccountTokenBal = await authereumERC20.balanceOf(_authereumProxyAccount.address)

        // Check balance
        assert.equal(Number(beforeAccountTokenBal) - constants.ONE_ETHER, Number(afterAccountTokenBal))

        // Confirm that the proxy still has access to the old state
        let expectedChainId = await _authereumProxyAccount.getChainId.call()
        assert.equal(expectedChainId, constants.CHAIN_ID)

        // Check that lastInitializedVersion was updated
        lastInitializedVersion = await _authereumProxyAccount.lastInitializedVersion.call()
        assert.equal(lastInitializedVersion, 2)
      })
      it('Should not allow a user to deploy directly to InitializerV2', async () => {
        // NOTE: This should fail with AI_IMPROPER_INIT_ORDER_TWO, however that
        // error gets bubbled up to APF_UNSUCCESSFUL_INIT in the createProxy()
        // function
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        await expectRevert(utils.createProxyInitializeV2(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          _label, authereumAccountLogicContract.address
        ), constants.REVERT_MSG.APF_UNSUCCESSFUL_INIT)
      })
      it('Should not allow a user to deploy directly to InitializerV3', async () => {
        // NOTE: This should fail with AI_IMPROPER_INIT_ORDER_THREE, however that
        // error gets bubbled up to APF_UNSUCCESSFUL_INIT in the createProxy()
        // function
        const _label = 'myNamess'
        const _expectedSalt = constants.SALT + 20
        await expectRevert(utils.createProxyInitializeV3(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          _label, authereumAccountLogicContract.address
        ), constants.REVERT_MSG.APF_UNSUCCESSFUL_INIT)
      })
    })
  })

  async function executeMultipleAuthKeyMetaTransactions (data, customAccount, toAddress, customGasPrice) {
    const _authereumProxyAccount = customAccount || authereumProxyAccount
    const _to = toAddress === undefined ? _authereumProxyAccount.address : toAddress
    const _gasPrice = customGasPrice === undefined ? constants.GAS_PRICE : customGasPrice

    const nonce = await _authereumProxyAccount.nonce()
    const to = _to
    const value = 0
    const gasLimit = constants.GAS_LIMIT
    const gasPrice = _gasPrice
    const gasOverhead = constants.DEFAULT_GAS_OVERHEAD
    const feeTokenAddress = constants.ZERO_ADDRESS
    const feeTokenRate = 0

    // Convert to transactions array
    console.log(
      to,
      value,
      gasLimit,
      data
    )
    const encodedParameters = await utils.encodeTransactionParams(to, value, gasLimit, data)
    const transactions = [encodedParameters]

    // Get default signedMessageHash and signedLoginKey
    const transactionMessageHashSignature = await utils.getAuthKeySignedMessageHash(
      _authereumProxyAccount.address,
      MSG_SIG,
      constants.CHAIN_ID,
      nonce,
      transactions,
      gasPrice,
      gasOverhead,
      feeTokenAddress,
      feeTokenRate
    )
    console.log(
      _authereumProxyAccount.address,
      MSG_SIG,
      constants.CHAIN_ID,
      nonce,
      transactions,
      gasPrice,
      gasOverhead,
      feeTokenAddress,
      feeTokenRate

    )
    await _authereumProxyAccount.executeMultipleAuthKeyMetaTransactions(
      transactions, gasPrice, gasOverhead, feeTokenAddress, feeTokenRate, transactionMessageHashSignature, { from: RELAYER, gasPrice: gasPrice }
    )
  }
})
