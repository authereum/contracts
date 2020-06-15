const { expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactUpgradeAccountBadInit = artifacts.require('UpgradeAccountBadInit')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')

contract('AuthereumProxyFactory', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Default Params
  const defaultNewInitCode = '0x1234'
  const defaultNewEnsManagerAddress = accounts[7]  // Arbitrary

  // Parameters
  let authereumProxyFactory
  let authereumAccount
  let upgradeAccountBadInitContract

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
  })

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    // NOTE: Need to reset these for each run due to the fact that the factory is being
    // NOTE: tested and needs to be manipulated and redeployed
    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
    authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
    authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

    upgradeAccountBadInitContract = await ArtifactUpgradeAccountBadInit.new()

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

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
        const _name = await authereumProxyFactoryLogicContract.name.call()
        assert.equal(_name, constants.CONTRACT_NAMES.AUTHEREUM_PROXY_FACTORY)
      })
    })
  })
  describe('setInitCode', () => {
    context('Happy Path', async () => {
      it('Should correctly set the new initCode', async () => {
        await authereumProxyFactoryLogicContract.setInitCode(defaultNewInitCode, { from: AUTHEREUM_OWNER })
        const initCode = await authereumProxyFactoryLogicContract.getInitCode()
        assert.equal(initCode, defaultNewInitCode)
      })
    })
  })
  describe('setAuthereumEnsManager', () => {
    context('Happy Path', async () => {
      it('Should correctly set the authereumEnsManager', async () => {
        await authereumProxyFactoryLogicContract.setAuthereumEnsManager(defaultNewEnsManagerAddress)
        const _authereumEnsManagerAddress = await authereumProxyFactoryLogicContract.getAuthereumEnsManager()
        assert.equal(_authereumEnsManagerAddress, defaultNewEnsManagerAddress)
      })
    })
  })
  describe('getInitCode', () => {
    context('Happy Path', async () => {
      it('Should correctly get the initCode', async () => {
        const initCode = await authereumProxyFactoryLogicContract.getInitCode()
        const expectedInitcode = await utils.calculateProxyBytecodeAndConstructor(authereumAccountLogicContract.address)
        assert.equal(initCode, expectedInitcode)
      })
    })
  })
  describe('getAuthereumEnsManager', () => {
    context('Happy Path', async () => {
      it('Should correctly get the authereumEnsManager', async () => {
        const _authereumEnsManagerAddress = await authereumProxyFactoryLogicContract.getAuthereumEnsManager()
        const expectedAuthereumEnsManagerAddress = authereumEnsManager.address
        assert.equal(_authereumEnsManagerAddress, expectedAuthereumEnsManagerAddress)
      })
    })
  })
  describe('createProxy', () => {
    context('Happy Path', async () => {
      it('Should create a proxy based on the creationCode (no init data)', async () => {
        const expectedSalt = constants.SALT
        const data = []

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        await authereumProxyFactoryLogicContract.createProxy(expectedSalt, constants.DEFAULT_LABEL, data)

        // Check that the contract is deployed by verifying that there is now code at the address
        codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.notEqual(codeAtAddress, '0x')
      })
      it('Should create a proxy based on the creationCode (1 init data)', async () => {
        const expectedSalt = constants.SALT
        const logicAddress = authereumAccountLogicContract.address

        // Generate data
        const expectedAuthKey = AUTH_KEYS[0]
        const expectedAuthereumEnsManager = authereumEnsManager.address
        const expectedLabel = 'label1'
        const data = [
          await web3.eth.abi.encodeFunctionCall({
            name: 'initializeV1',
            type: 'function',
            inputs: [{
                type: 'address',
                name: '_authKey'
            }]
          }, [expectedAuthKey])
        ]

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        await authereumProxyFactoryLogicContract.createProxy(expectedSalt, expectedLabel, data)

        // Check that the contract is deployed by verifying that there is now code at the address
        codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.notEqual(codeAtAddress, '0x')

        // Wrap proxy in Truffle contract

        // Verify the implementation
        const authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
        const implementationAddress = await authereumProxy.implementation()
        assert.equal(logicAddress, implementationAddress)

        // Verify that defaults are set
        const authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)
        const chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)
      })
      it('Should create a proxy based on the creationCode (multiple init data)', async () => {
        // Redeploy facotry with new logic address
        // Create Logic Contracts
        authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
        authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
        authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()
        authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumProxyAccountUpgradeWithInitLogicContract.address, authereumEnsManager.address)

        // Set up Authereum ENS Manager defaults
        await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

        const expectedSalt = constants.SALT
        const logicAddress = authereumProxyAccountUpgradeWithInitLogicContract.address

        // Generate data
        const expectedAuthKey = AUTH_KEYS[0]
        const data = [
          await web3.eth.abi.encodeFunctionCall({
            name: 'initializeV1',
            type: 'function',
            inputs: [{
                type: 'address',
                name: '_authKey'
            }]
          }, [expectedAuthKey]),
          await web3.eth.abi.encodeFunctionCall({
            name: 'upgradeTestInit',
            type: 'function',
            inputs: []
          }, [])
        ]

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumProxyAccountUpgradeWithInitLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        const expectedLabel = 'label1'
        await authereumProxyFactoryLogicContract.createProxy(expectedSalt, expectedLabel, data)

        // Check that the contract is deployed by verifying that there is now code at the address
        codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.notEqual(codeAtAddress, '0x')

        // Wrap proxy in Truffle contract

        // Verify the implementation
        const authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
        const implementationAddress = await authereumProxy.implementation()
        assert.equal(logicAddress, implementationAddress)

        // Verify that defaults are set
        const authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)
        let chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)

        // Verify that the upgrade worked
        const upgradedAuthereumProxyAccount = await ArtifactAuthereumProxyAccountUpgradeWithInit.at(expectedAddress)
        const upgradeTestVal = await upgradedAuthereumProxyAccount.upgradeTest.call()
        assert.equal(upgradeTestVal, 42)

        // Confirm original defaults never changed
        chainId = await upgradedAuthereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)
      })
      it('Should create a proxy based on the creationCode (1 init data, 1 non-init data)', async () => {
        // Redeploy facotry with new logic address
        // Create Logic Contracts
        authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
        authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
        authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumProxyAccountUpgradeLogicContract.address, authereumEnsManager.address)
        authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

        // Set up Authereum ENS Manager defaults
        await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

        const expectedSalt = constants.SALT
        const logicAddress = authereumProxyAccountUpgradeLogicContract.address

        // Generate data
        const expectedAuthKey = AUTH_KEYS[0]
        const expectedLabel = 'label1'
        const data = [
          await web3.eth.abi.encodeFunctionCall({
            name: 'initializeV1',
            type: 'function',
            inputs: [{
                type: 'address',
                name: '_authKey'}]
          }, [expectedAuthKey]),
        ]

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumProxyAccountUpgradeLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        await authereumProxyFactoryLogicContract.createProxy(expectedSalt, expectedLabel, data)

        // Check that the contract is deployed by verifying that there is now code at the address
        codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.notEqual(codeAtAddress, '0x')

        // Wrap proxy in Truffle contract

        // Verify the implementation
        const authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
        const implementationAddress = await authereumProxy.implementation()
        assert.equal(logicAddress, implementationAddress)

        // Verify that defaults are set
        const authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)
        let chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)

        // Verify that the upgrade worked
        const upgradedAuthereumProxyAccount = await ArtifactAuthereumProxyAccountUpgradeWithInit.at(expectedAddress)
        const upgradeTestVal = await upgradedAuthereumProxyAccount.upgradeTest()
        assert.equal(upgradeTestVal, 42)

        // Confirm original defaults never changed
        chainId = await upgradedAuthereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should fail to create a proxy due to a reused label', async () => {
        let _expectedSalt = constants.SALT
        let _data = []

        // Generate the expected address based on an off-chain create2 calc
        let _expectedSaltHash = utils.getSaltHash(_expectedSalt, accounts[0])
        let _proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        let _expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, _expectedSaltHash, _proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let _codeAtAddress = await web3.eth.getCode(_expectedAddress)
        assert.equal(_codeAtAddress, '0x')

        await authereumProxyFactoryLogicContract.createProxy(_expectedSalt, constants.DEFAULT_LABEL, _data)

        // Check that the contract is deployed by verifying that there is now code at the address
        _codeAtAddress = await web3.eth.getCode(_expectedAddress)
        assert.notEqual(_codeAtAddress, '0x')

        // Attempt with a new salt
        _expectedSalt += 1
        await expectRevert(authereumProxyFactoryLogicContract.createProxy(_expectedSalt, constants.DEFAULT_LABEL, _data), constants.REVERT_MSG.AEM_LABEL_OWNED)
      })
      it('Should fail to create a proxy due to included data with a lenght of 0', async () => {
        // Redeploy facotry with new logic address
        // Create Logic Contracts
        authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
        authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
        authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()
        authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumProxyAccountUpgradeWithInitLogicContract.address, authereumEnsManager.address)

        // Set up Authereum ENS Manager defaults
        await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

        const expectedSalt = constants.SALT

        // Bad data with a length of 0
        const data = [[]]

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumProxyAccountUpgradeWithInitLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        const expectedLabel = 'label1'
        await expectRevert(authereumProxyFactoryLogicContract.createProxy(expectedSalt, expectedLabel, data), constants.REVERT_MSG.APF_EMPTY_INIT)

      })
      it('Should create a proxy based on the creationCode (1 init data, 1 non-init data)', async () => {
        // Redeploy facotry with new logic address
        // Create Logic Contracts
        authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
        authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
        authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumProxyAccountUpgradeLogicContract.address, authereumEnsManager.address)
        authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

        // Set up Authereum ENS Manager defaults
        await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

        const expectedSalt = constants.SALT
        const logicAddress = authereumProxyAccountUpgradeLogicContract.address

        // Generate data
        const expectedAuthKey = AUTH_KEYS[0]
        const expectedLabel = 'label1'
        const data = [
          await web3.eth.abi.encodeFunctionCall({
            name: 'initializeV1',
            type: 'function',
            inputs: [{
                type: 'address',
                name: '_authKey'}]
          }, [expectedAuthKey]),
        ]

        // Generate the expected address based on an off-chain create2 calc
        const expectedSaltHash = utils.getSaltHash(expectedSalt, accounts[0])
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumProxyAccountUpgradeLogicContract.address)
        const expectedAddress = utils.buildCreate2Address(authereumProxyFactoryLogicContract.address, expectedSaltHash, proxyCodeAndConstructorHash)

        // Check that the contract has not been dployed by verifying that there is no code at the address
        let codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.equal(codeAtAddress, '0x')

        await authereumProxyFactoryLogicContract.createProxy(expectedSalt, expectedLabel, data)

        // Check that the contract is deployed by verifying that there is now code at the address
        codeAtAddress = await web3.eth.getCode(expectedAddress)
        assert.notEqual(codeAtAddress, '0x')

        // Wrap proxy in Truffle contract

        // Verify the implementation
        const authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
        const implementationAddress = await authereumProxy.implementation()
        assert.equal(logicAddress, implementationAddress)

        // Verify that defaults are set
        const authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)
        let chainId = await authereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)

        // Verify that the upgrade worked
        const upgradedAuthereumProxyAccount = await ArtifactAuthereumProxyAccountUpgradeWithInit.at(expectedAddress)
        const upgradeTestVal = await upgradedAuthereumProxyAccount.upgradeTest()
        assert.equal(upgradeTestVal, 42)

        // Confirm original defaults never changed
        chainId = await upgradedAuthereumProxyAccount.getChainId()
        assert.equal(constants.CHAIN_ID, chainId)
      })
      it('Should fail to create a proxy based on bad init data', async () => {
        // NOTE: Should never get here because implementation address should not be changed
        // NOTE: This is a failure case and should never happen. This exists to be more
        // NOTE: explicit if setInitCode() is ever removed from the contract.
        const _originalInitCode = await authereumProxyFactoryLogicContract.getInitCode()
        const _newInitCodeStr = _originalInitCode.substring(0, _originalInitCode.length - 40) + upgradeAccountBadInitContract.address.slice(2);
        const _newInitCodeBytes = web3.utils.hexToBytes(web3.utils.toHex(_newInitCodeStr))

        await authereumProxyFactoryLogicContract.setInitCode(_newInitCodeBytes, { from: AUTHEREUM_OWNER })

        // Generate data
        let _expectedSalt = constants.SALT
        const _expectedLabel = 'label1'
        const _data = [
          await web3.eth.abi.encodeFunctionCall({
            name: 'upgradeTest',
            type: 'function',
            inputs: []
          }, []),
        ]

        await expectRevert(authereumProxyFactoryLogicContract.createProxy(_expectedSalt, _expectedLabel, _data), constants.REVERT_MSG.APF_UNSUCCESSFUL_INIT)
      })
    })
  })
})
