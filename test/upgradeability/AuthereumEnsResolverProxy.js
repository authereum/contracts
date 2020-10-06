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
const ArtifactAuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const ArtifactAuthereumEnsResolverProxy = artifacts.require('AuthereumEnsResolverProxy')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

contract('AuthereumEnsResolverProxy', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Parameters
  let authereumProxyFactory
  let authereumAccount
  let authereumProxy

  // Proxy Creation Params
  let expectedSalt
  let logicAddress
  let expectedAuthKey
  let expectedAuthereumEnsManager
  let expectedLabel
  let data
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
    const { ensRegistry, authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Create Logic Contracts
    authereumEnsResolverLogicContract = await ArtifactAuthereumEnsResolver.new(ensRegistry.address)
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

    // Create Authereum ENS Resolver Proxy
    authereumEnsResolverProxy = await ArtifactAuthereumEnsResolverProxy.new(authereumEnsResolverLogicContract.address)

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

  describe('fallback', () => {
    context('Non-Happy Path', async () => {
      it.skip('Should allow an arbitrary person to call the fallback but not change any state on behalf of the proxy owner', async () => {
      })
    })
  })
  describe('implementation', () => {
    context('Happy Path', async () => {
      it('Should confirm the implementation address after the creation of a proxy', async () => {
        const implementationAddress = await authereumEnsResolverProxy.implementation()
        assert.equal(authereumEnsResolverLogicContract.address, implementationAddress)
      })
    })
  })
})
