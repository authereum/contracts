const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

var namehash = require('eth-ens-namehash')

contract('AuthereumEnsManager', function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const AUTH_KEYS = [accounts[2], accounts[3], accounts[4], accounts[5]]
  const NEW_PROXY_FACTORY = accounts[6]
  const PROXY_FACTORY = accounts[0]

  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Default Params
  const defaultTextKey = 'test'
  const defaultTextKeyIndexed = web3.utils.soliditySha3(defaultTextKey)
  const defaultTextValue = 'pass'
  const defaultContenthashString = '/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
  const defaultContenthashHex = web3.utils.toHex(defaultContenthashString)
  const defaultContenthashBytes = web3.utils.hexToBytes(defaultContenthashHex)

  // Labels
  const ethLabel = 'eth'
  const authLabel = 'auth'
  const reverseLabel = 'reverse'
  const addrLabel = 'addr'
  const testLabel = 'test'
  const testtwoLabel = 'testtwo'
  const unclaimedLabel = 'unclaimed'

  // Domains
  const authDotEthDomain = authLabel + '.' + ethLabel
  const testDotauthDotEthDomain = testLabel + '.' + authLabel + '.' + ethLabel
  const testtwoDotauthDotEthDomain = testtwoLabel + '.' + authLabel + '.' + ethLabel
  const unclaimedDotauthDotEthDomain = unclaimedLabel + '.' + authLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authHash = web3.utils.soliditySha3(authLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)
  const testHash = web3.utils.soliditySha3(testLabel)
  const testtwoHash = web3.utils.soliditySha3(testtwoLabel)
  const unclaimedLabelHash = web3.utils.soliditySha3(unclaimedLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authDotEthNode = namehash.hash(authDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)
  const testDotauthDotEthNode = namehash.hash(testDotauthDotEthDomain)
  const testtwoDotauthDotEthNode = namehash.hash(testtwoDotauthDotEthDomain)
  const unclaimedLabelDotauthDotEthNode = namehash.hash(unclaimedDotauthDotEthDomain)

  let ensRegistry,
    ensReverseRegistrar,
    authereumEnsResolver,
    authereumEnsManager,
    project,
    proxyFactory,
    accountProxy,
    proxyFactoryAddress,
    saltHash

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
    const ensContracts = await utils.setENSDefaults(AUTHEREUM_OWNER)
    ensRegistry = ensContracts.ensRegistry
    ensReverseRegistrar = ensContracts.ensReverseRegistrar
    authereumEnsResolver = ensContracts.authereumEnsResolver
    authereumEnsManager = ensContracts.authereumEnsManager

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
    authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
    authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    label = testLabel
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

    // Declare variables
    proxyFactoryAddress = authereumProxyFactoryLogicContract.address
    saltHash = utils.getSaltHash(constants.SALT, accounts[0])

    // Handle post-proxy deployment
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])
    await utils.setAccountIn1820Registry(authereumProxyAccount, erc1820Registry.address, AUTH_KEYS[0])

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
        const _name = await authereumEnsManager.name.call()
        assert.equal(_name, constants.CONTRACT_NAMES.AUTHEREUM_ENS_MANAGER)
      })
    })
  })
  describe('Sanity Checks', () => {
    context('Happy Path', async () => {
      it('Should set the Authereum ENS Manager as the owner of auth.eth', async () => {
        const owner = await ensRegistry.owner(authDotEthNode);
        assert.equal(owner, authereumEnsManager.address, 'Authereum ENS manager should be the owner of auth.eth');
      })
      it('Should return the Authereum resolver address for a subdomain', async () => {
        const resolver = await ensRegistry.resolver(testDotauthDotEthNode);
        assert.equal(resolver, authereumEnsResolver.address);
      })
      it('Should return address(0) for the authDotEthNode resolver', async () => {
        const resolver = await authereumEnsResolver.addr(authDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      })
      it('Should return address(0) for an unclaimed subdomain resolver', async () => {
        const resolver = await authereumEnsResolver.addr(unclaimedLabelDotauthDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      })
    })
  })
  describe("getEnsRegistry", () => {
    context('Happy Path', async () => {
      it('Should return the current registry', async () => {
        const resolver = await authereumEnsManager.getEnsRegistry();
        assert.equal(resolver, ensRegistry.address);
      })
    })
  })
  describe('getEnsReverseRegistrar', () => {
    context('Happy Path', async () => {
      it('Should return the ENS Reverse Registrar', async () => {
        const resolver = await authereumEnsManager.getEnsReverseRegistrar();
        assert.equal(resolver, ensReverseRegistrar.address);
      })
    })
  })
  describe('changeRootnodeOwner', () => {
    context('Happy Path', async () => {
      it('Should update the owner of the rootNode from the manager address to a new manager address', async () => {
        const newAuthereumEnsManager = await AuthereumEnsManager.new(authDotEthDomain, authDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        let rootnodeOwner = await ensRegistry.owner(authDotEthNode)
        assert.equal(rootnodeOwner, authereumEnsManager.address)

        // Change the rootnode owner
        var { logs } = await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authDotEthNode)
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        expectEvent.inLogs(logs, 'RootnodeOwnerChanged', { rootnode: authDotEthNode, newOwner: newAuthereumEnsManager.address })
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode owner', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeOwner(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow the rootnode owner to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeOwner(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), constants.REVERT_MSG.AEM_ADDRESS_MUST_NOT_BE_NULL)
      })
    })
  })
  describe('changeRootnodeResolver', () => {
    context('Happy Path', async () => {
      it('Should update the resolver of the rootNode from the manager address to a new resolver', async () => {
        let newAuthereumEnsResolver = await AuthereumEnsResolver.new( ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        let rootnodeResolver = await ensRegistry.resolver(authDotEthNode)
        assert.equal(rootnodeResolver, constants.ZERO_ADDRESS)

        // Change the rootnode resolver
        var { logs } = await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })

        rootnodeResolver = await ensRegistry.resolver(authDotEthNode)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        expectEvent.inLogs(logs, 'RootnodeResolverChanged', { rootnode: authDotEthNode, newResolver: newAuthereumEnsResolver.address })
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode resolver', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeResolver(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow the rootnode resolver to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), constants.REVERT_MSG.AEM_ADDRESS_MUST_NOT_BE_NULL)
      })
    })
  })
  describe('changeRootnodeTTL', () => {
    context('Happy Path', async () => {
      it('Should update the TTL of the rootNode from the 0 to 1', async () => {
        let rootnodeTtl = await ensRegistry.ttl(authDotEthNode)
        assert.equal(rootnodeTtl, 0)

        // Change the rootnode ttl
        var { logs } = await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        rootnodeTtl = await ensRegistry.ttl(authDotEthNode)
        assert.equal(rootnodeTtl, '1')
        expectEvent.inLogs(logs, 'RootnodeTTLChanged', { rootnode: authDotEthNode, newTtl: '1'})
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode ttl', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeTTL(1, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
  describe("changeRootnodeText", () => {
    context('Happy Path', async () => {
      it("Should update the text record of the rootNode from the 0 to the default key and value", async () => {
        let rootnodeText = await authereumEnsResolver.text(authDotEthNode, defaultTextKey)
        assert.equal(rootnodeText, 0)

        // Change the rootnode text
        var { logs } = await authereumEnsManager.changeRootnodeText(defaultTextKey, defaultTextValue, { from: AUTHEREUM_OWNER })

        rootnodeText = await authereumEnsResolver.text(authDotEthNode, defaultTextKey)
        assert.equal(rootnodeText, defaultTextValue)
        expectEvent.inLogs(logs, 'RootnodeTextChanged', { node: authDotEthNode, indexedKey: defaultTextKeyIndexed, key: defaultTextKey, value: defaultTextValue })
      })
    })
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the rootnode text", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeText(defaultTextKey, defaultTextValue, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
  describe("changeRootnodeContenthash", () => {
    context('Happy Path', async () => {
      it("Should update the contenthash of the rootNode from the null to the default contenthash", async () => {
        let letRootnodeContenthash = await authereumEnsResolver.contenthash(authDotEthNode)
        assert.equal(letRootnodeContenthash, null)

        // Change the rootnode contenthash
        var { logs } = await authereumEnsManager.changeRootnodeContenthash(defaultContenthashBytes, { from: AUTHEREUM_OWNER })

        letRootnodeContenthash = await authereumEnsResolver.contenthash(authDotEthNode)
        assert.equal(letRootnodeContenthash, defaultContenthashHex)
        expectEvent.inLogs(logs, 'RootnodeContenthashChanged', { node: authDotEthNode, hash: defaultContenthashHex })
      })
    })
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the rootnode contenthash", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeContenthash(defaultContenthashBytes, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
  describe("changeAuthereumFactoryAddress", () => {
    context('Happy Path', async () => {
      it('Should update the owner of the Autherereum Factory address to a new Authereum Factory address', async () => {
        var { logs } = await authereumEnsManager.changeAuthereumFactoryAddress(NEW_PROXY_FACTORY, { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AuthereumFactoryAddressChanged', { authereumFactoryAddress: NEW_PROXY_FACTORY })
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the Authereum Factory address', async () => {
        await expectRevert(authereumEnsManager.changeAuthereumFactoryAddress(NEW_PROXY_FACTORY, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow the Authereum Factory address to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeAuthereumFactoryAddress(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
  describe("changeAuthereumEnsResolver", () => {
    context('Happy Path', async () => {
      it('Should update the owner of the ENS Resolver address to a new ENS Resolver address', async () => {
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        let resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, authereumEnsResolver.address)

        // Change the ens resolver
        var { logs } = await authereumEnsManager.changeAuthereumEnsResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, newAuthereumEnsResolver.address)
        expectEvent.inLogs(logs, 'AuthereumEnsResolverChanged', { authereumEnsResolver: newAuthereumEnsResolver.address })
      })
    })
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the ENS Resolver address", async () => {
        await expectRevert(authereumEnsManager.changeAuthereumEnsResolver(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow the new ENS resolver address to be set to 0', async () => {
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        await expectRevert(authereumEnsManager.changeAuthereumEnsResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.GENERAL_REVERT)
      })
    })
  })
  describe('Register', () => {
    context('Happy Path', async () => {
      it('Should let a user register test.auth.eth', async () => {
        // Check subdomain owner
        const owner = await ensRegistry.owner(testDotauthDotEthNode);
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.auth.eth');

        // Check Resolver
        const resolver = await ensRegistry.resolver(testDotauthDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        const addr = await authereumEnsResolver.addr(testDotauthDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        const reverseTestDotauthDotEthNode = await utils.getReverseNode(create2Address)
        const name = await authereumEnsResolver.name(reverseTestDotauthDotEthNode)
        assert.equal(name, testDotauthDotEthDomain, 'The test.auth.eth name was not set correcly')
      })
      it('Should let a user register test.auth.eth and another user to register testtwo.auth.eth', async () => {
        // First user
        let proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        let create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        let owner = await ensRegistry.owner(testDotauthDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.auth.eth');

        // Second user
        const _expectedSalt = constants.SALT + 10
        const _saltHash = utils.getSaltHash(_expectedSalt, accounts[0])
        const _label = testtwoLabel
        create2Address = utils.buildCreate2Address(proxyFactoryAddress, _saltHash, proxyCodeAndConstructorHash)
        await utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        owner = await ensRegistry.owner(testtwoDotauthDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of testtwo.auth.eth');
      })
      // NOTE: This identical name will be normalized and blocked on the frontend
      it('Should let a user register test.auth.eth and another user register Test.auth.eth, but ownership will not change because namehash normalizes the names to be the same case', async () => {
        // First user
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        let owner = await ensRegistry.owner(testDotauthDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.auth.eth');

        // Second user
        const _expectedSalt = constants.SALT + 10
        const _label = testtwoLabel
        await utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        owner = await ensRegistry.owner(namehash.hash('Test.auth.eth'));
        assert.equal(owner, create2Address, 'create2Address should be the owner of Test.auth.eth');
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow a domain name to be registered more than once', async () => {
        await expectRevert(utils.createProxy(
          expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], label, authereumAccountLogicContract.address
        ), constants.REVERT_MSG.GENERAL_REVERT)
      })
      it('Should not allow an non-authereumProxyFactory address to register an account', async () => {
        // Fail from an arbitrary address call
        await expectRevert(authereumEnsManager.register(testLabel, AUTH_KEYS[0], { from: accounts[0] }), constants.REVERT_MSG.AEM_MUST_SEND_FROM_FACTORY)

        // Fail from an Authereum owner call
        await expectRevert(authereumEnsManager.register(testLabel, AUTH_KEYS[0], { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.AEM_MUST_SEND_FROM_FACTORY)
      })
    })
  })
  describe('isAvailable', () => {
    context('Happy Path', async () => {
      it('Should return true if a subnode is available', async () => {
        let isTrue = await authereumEnsManager.isAvailable(unclaimedLabelHash, { from: AUTH_KEYS[0] })
        assert.equal(isTrue, true)
      })
      it('Should return false if a subnode is not available', async () => {
        let isTrue = await authereumEnsManager.isAvailable(testHash, { from: AUTH_KEYS[0] })
        assert.equal(isTrue, false)
      })
    })
  })
  describe('End to End', () => {
    context('Happy Path', async () => {
      it('Should update to a new manager and retain all qualities as before the upgrade', async () => {
        let newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })

        // Set values for original manager
        await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        // Get values for original manager
        let rootnodeOwner = await ensRegistry.owner(authDotEthNode)
        let rootnodeResolver = await ensRegistry.resolver(authDotEthNode)
        let rootnodeTtl = await ensRegistry.ttl(authDotEthNode)

        // Confirm original state
        assert.equal(rootnodeOwner, authereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Update manager
        let newAuthereumEnsManager = await AuthereumEnsManager.new(authDotEthDomain, authDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authDotEthNode)

        // Confirm state after owner switch
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')
      })
      it('Should update to a new manager and retain all qualities as before the upgrade, including users', async () => {
        // Get expected user address
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)

        // Check subdomain owner
        let owner = await ensRegistry.owner(testDotauthDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.auth.eth');

        // Check Resolver
        let resolver = await ensRegistry.resolver(testDotauthDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        let addr = await authereumEnsResolver.addr(testDotauthDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        let reverseTestDotauthDotEthNode = await utils.getReverseNode(create2Address)
        let name = await authereumEnsResolver.name(reverseTestDotauthDotEthNode)
        assert.equal(name, testDotauthDotEthDomain, 'The test.auth.eth name was not set correcly')

        // Create new resolver
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })

        // Set values for original manager
        await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        // Get values for original manager
        let rootnodeOwner = await ensRegistry.owner(authDotEthNode)
        let rootnodeResolver = await ensRegistry.resolver(authDotEthNode)
        let rootnodeTtl = await ensRegistry.ttl(authDotEthNode)

        // Confirm original state
        assert.equal(rootnodeOwner, authereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Update manager
        const newAuthereumEnsManager = await AuthereumEnsManager.new(authDotEthDomain, authDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authDotEthNode)

        // Confirm state after owner switch
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Check user attributes
        // Check subdomain owner
        owner = await ensRegistry.owner(testDotauthDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.auth.eth');

        // Check Resolver
        resolver = await ensRegistry.resolver(testDotauthDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        addr = await authereumEnsResolver.addr(testDotauthDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        reverseTestDotauthDotEthNode = await utils.getReverseNode(create2Address)
        name = await authereumEnsResolver.name(reverseTestDotauthDotEthNode)
        assert.equal(name, testDotauthDotEthDomain, 'The test.auth.eth name was not set correcly')
      })
    })
  })
})
