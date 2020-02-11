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

contract('AuthereumEnsResolverProxy', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Test Params
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

  before(async () => {
    // Set up ENS defaults
    const { ensRegistry, authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Create Logic Contracts
    authereumEnsResolverLogicContract = await ArtifactAuthereumEnsResolver.new(ensRegistry.address, accounts[0])
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

    // Create Authereum ENS Resolver Proxy
    authereumEnsResolverProxy = await ArtifactAuthereumEnsResolverProxy.new(authereumEnsResolverLogicContract.address)
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